// JitterBuffer.swift — Frame reassembly and jitter buffering
// GridStreamer macOS Client
//
// Mirrors the C++ JitterBuffer from gridstreamer-viewer. Reassembles fragmented
// video frames from individual UDP packets and buffers them to smooth out
// network jitter. Frames are released in frame_number order once all fragments
// are received. Incomplete frames older than max age are dropped.

import Foundation

/// A single reassembled video frame ready for decoding.
struct AssembledFrame: Sendable {
    /// The header from the first fragment (contains frame metadata).
    let header: VideoPacketHeader
    /// The concatenated payload data from all fragments, in order.
    let data: Data
    /// Local monotonic timestamp (in microseconds) when the first fragment arrived.
    let firstArrivalUs: UInt64
}

/// Thread-safe jitter buffer that reassembles fragmented video packets into
/// complete frames and releases them in order.
final class JitterBuffer: @unchecked Sendable {

    // MARK: - Frame Assembly State

    /// Tracks the assembly state of a single video frame.
    private struct FrameAssembly {
        var header: VideoPacketHeader
        var fragments: [Data?]         // Indexed by fragment_index
        var fragmentsReceived: Int = 0
        var fragmentTotal: Int
        var firstArrivalUs: UInt64
        var complete: Bool = false

        init(header: VideoPacketHeader, fragmentTotal: Int, firstArrivalUs: UInt64) {
            self.header = header
            self.fragmentTotal = fragmentTotal
            self.fragments = [Data?](repeating: nil, count: fragmentTotal)
            self.firstArrivalUs = firstArrivalUs
        }

        var isComplete: Bool {
            fragmentsReceived >= fragmentTotal && fragmentTotal > 0
        }

        /// Concatenate all fragments into a single contiguous Data buffer.
        func assemble() -> Data? {
            guard isComplete else { return nil }
            var result = Data()
            for frag in fragments {
                guard let frag else { return nil }
                result.append(frag)
            }
            return result
        }
    }

    // MARK: - Properties

    private var frames: [UInt16: FrameAssembly] = [:]  // frame_number -> assembly
    private var nextReleaseFrame: UInt16 = 0
    private var firstFrame = true
    private let lock = NSLock()

    /// Target jitter buffer depth in milliseconds. Default: 4ms for low-latency gaming.
    var targetDepthMs: UInt32 = 4

    /// Maximum age of an incomplete frame before it is dropped (ms).
    var maxFrameAgeMs: UInt32 = 150

    /// Statistics
    private(set) var framesDropped: UInt64 = 0
    private(set) var framesCompleted: UInt64 = 0
    private(set) var fragmentsReceived: UInt64 = 0

    // MARK: - Push

    /// Push a received video packet fragment into the buffer.
    /// - Parameters:
    ///   - header: The deserialized video packet header.
    ///   - payload: The raw payload data for this fragment.
    func pushPacket(header: VideoPacketHeader, payload: Data) {
        lock.lock()
        defer { lock.unlock() }

        let frameNum = header.frameNumber
        let fragIndex = Int(header.fragmentIndex)
        let fragTotal = Int(header.fragmentTotal)

        guard fragTotal > 0, fragIndex < fragTotal else { return }

        fragmentsReceived += 1

        let nowUs = currentTimeUs()

        if firstFrame {
            nextReleaseFrame = frameNum
            firstFrame = false
        }

        // Create or update the frame assembly
        if frames[frameNum] == nil {
            frames[frameNum] = FrameAssembly(
                header: header,
                fragmentTotal: fragTotal,
                firstArrivalUs: nowUs
            )
        }

        guard var assembly = frames[frameNum] else { return }

        // Store fragment if not already received
        if assembly.fragments[fragIndex] == nil {
            assembly.fragments[fragIndex] = payload
            assembly.fragmentsReceived += 1

            if assembly.isComplete {
                assembly.complete = true
                framesCompleted += 1
            }

            frames[frameNum] = assembly
        }

        // Expire old incomplete frames
        expireOldFrames(nowUs: nowUs)
    }

    // MARK: - Pop

    /// Pop the next complete frame in frame_number order.
    /// Returns `nil` if no complete frame is available at the next expected position.
    func popFrame() -> AssembledFrame? {
        lock.lock()
        defer { lock.unlock() }

        // Try to release frames in order starting from nextReleaseFrame
        // Skip over missing frames if they have been expired
        for _ in 0..<frames.count + 1 {
            guard let assembly = frames[nextReleaseFrame] else {
                // Frame not in buffer — if there are newer complete frames,
                // skip this gap (frame was likely dropped or never sent)
                if hasNewerCompleteFrame(than: nextReleaseFrame) {
                    nextReleaseFrame &+= 1
                    continue
                }
                return nil
            }

            if assembly.complete, let data = assembly.assemble() {
                let frame = AssembledFrame(
                    header: assembly.header,
                    data: data,
                    firstArrivalUs: assembly.firstArrivalUs
                )
                frames.removeValue(forKey: nextReleaseFrame)
                nextReleaseFrame &+= 1
                return frame
            } else {
                // Frame exists but is incomplete — wait for more fragments
                return nil
            }
        }

        return nil
    }

    // MARK: - Buffer Stats

    /// Returns the number of complete frames waiting in the buffer.
    var completeFrameCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return frames.values.filter(\.complete).count
    }

    /// Returns the total number of frames (complete + incomplete) in the buffer.
    var totalFrameCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return frames.count
    }

    /// Estimated buffer depth in milliseconds based on timestamp spread.
    var bufferDepthMs: UInt32 {
        lock.lock()
        defer { lock.unlock() }

        guard frames.count >= 2 else { return 0 }

        var minTs: UInt32 = .max
        var maxTs: UInt32 = 0
        for assembly in frames.values {
            let ts = assembly.header.timestampUs
            if ts < minTs { minTs = ts }
            if ts > maxTs { maxTs = ts }
        }

        // Timestamps are in microseconds; convert spread to milliseconds
        let spreadUs = maxTs >= minTs ? maxTs - minTs : 0
        return spreadUs / 1000
    }

    /// Reset the buffer, dropping all frames.
    func reset() {
        lock.lock()
        defer { lock.unlock() }
        frames.removeAll()
        firstFrame = true
        nextReleaseFrame = 0
    }

    // MARK: - Private Helpers

    /// Check if there is any complete frame with a number higher than `frameNum`.
    private func hasNewerCompleteFrame(than frameNum: UInt16) -> Bool {
        for (num, assembly) in frames {
            // Use wrapping comparison for sequence number wrap-around
            let diff = Int16(bitPattern: num &- frameNum)
            if diff > 0 && assembly.complete {
                return true
            }
        }
        return false
    }

    /// Expire frames that are older than maxFrameAgeMs.
    private func expireOldFrames(nowUs: UInt64) {
        let maxAgeUs = UInt64(maxFrameAgeMs) * 1000

        var toRemove: [UInt16] = []
        for (frameNum, assembly) in frames {
            if !assembly.complete && (nowUs - assembly.firstArrivalUs) > maxAgeUs {
                toRemove.append(frameNum)
            }
        }

        for frameNum in toRemove {
            frames.removeValue(forKey: frameNum)
            framesDropped += 1

            // If we dropped the frame we were waiting for, advance
            if frameNum == nextReleaseFrame {
                nextReleaseFrame &+= 1
            }
        }
    }

    /// Current monotonic time in microseconds.
    private func currentTimeUs() -> UInt64 {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        let nanos = mach_absolute_time() * UInt64(info.numer) / UInt64(info.denom)
        return nanos / 1000
    }
}
