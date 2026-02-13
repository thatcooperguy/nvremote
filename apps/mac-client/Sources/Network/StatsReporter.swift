// StatsReporter.swift — QoS statistics collector and feedback sender
// CrazyStream macOS Client
//
// Mirrors the C++ StatsReporter from crazystream-viewer. Collects real-time
// streaming statistics (packet loss, jitter, bandwidth, delay gradient) and
// periodically sends QoS feedback packets to the host every 200ms.

import Foundation

/// Snapshot of real-time streaming statistics for display in the overlay HUD.
struct StreamStats: Sendable {
    var bitrateKbps: Double = 0.0
    var fps: Double = 0.0
    var packetLoss: Double = 0.0        // 0.0 to 1.0
    var jitterMs: Double = 0.0
    var rttMs: Double = 0.0
    var codec: String = ""
    var resolutionWidth: UInt32 = 0
    var resolutionHeight: UInt32 = 0
    var connectionType: String = "p2p"
    var decodeTimeMs: Double = 0.0
    var renderTimeMs: Double = 0.0
    var framesDecoded: UInt64 = 0
    var framesDropped: UInt64 = 0
    var packetsReceived: UInt64 = 0
    var bytesReceived: UInt64 = 0

    var resolutionString: String {
        guard resolutionWidth > 0 && resolutionHeight > 0 else { return "N/A" }
        return "\(resolutionWidth)x\(resolutionHeight)"
    }
}

/// Collects streaming statistics and sends QoS feedback to the host at regular intervals.
final class StatsReporter: @unchecked Sendable {

    // MARK: - Properties

    private let transport: UDPTransport
    private weak var nackSender: NACKSender?
    private let lock = NSLock()

    /// Feedback send interval in milliseconds (200ms as specified).
    let feedbackIntervalMs: Int = 200

    // MARK: - Packet Arrival Records

    private struct PacketRecord {
        let seq: UInt16
        let senderTimestampUs: UInt32
        let recvTimeUs: UInt64
        let payloadSize: UInt32
    }

    private var recentPackets: [PacketRecord] = []
    private let maxRecentPackets = 1000

    // MARK: - Sequence Tracking (for loss calculation)

    private var expectedSeq: UInt16 = 0
    private var totalExpected: UInt64 = 0
    private var totalReceived: UInt64 = 0
    private var firstPacket = true

    // MARK: - Jitter (RFC 3550 style)

    private var jitter: Double = 0.0
    private var lastTransit: Int64 = 0
    private var jitterInitialized = false

    // MARK: - Bandwidth Estimation

    private var windowStartUs: UInt64 = 0
    private var windowBytes: UInt64 = 0

    // MARK: - Kalman Filter for Delay Gradient

    private var kalmanEstimate: Double = 0.0
    private var kalmanError: Double = 1.0
    private let kalmanQ: Double = 0.001  // Process noise
    private let kalmanR: Double = 0.1    // Measurement noise

    // MARK: - Stats (updated from external subsystems)

    private var _decodeTimeMs: Double = 0.0
    private var _renderTimeMs: Double = 0.0
    private var _codecName: String = ""
    private var _resolutionWidth: UInt32 = 0
    private var _resolutionHeight: UInt32 = 0
    private var _framesDecoded: UInt64 = 0
    private var _framesDropped: UInt64 = 0

    // MARK: - FPS Tracking

    private var fpsFrameCount: Int = 0
    private var fpsWindowStartUs: UInt64 = 0
    private var currentFps: Double = 0.0

    // MARK: - Background Timer

    private var timer: DispatchSourceTimer?
    private let timerQueue = DispatchQueue(label: "com.crazystream.stats-reporter", qos: .userInitiated)

    // MARK: - Callbacks

    /// Called each time stats are updated (on timerQueue).
    var onStatsUpdate: ((StreamStats) -> Void)?

    // MARK: - Initialization

    init(transport: UDPTransport) {
        self.transport = transport
    }

    deinit {
        stop()
    }

    /// Set the NACK sender to query for missing sequences.
    func setNackSender(_ sender: NACKSender) {
        nackSender = sender
    }

    // MARK: - Event Recording

    /// Called for each received video packet to update statistics.
    func onPacketReceived(header: VideoPacketHeader, recvTimeUs: UInt64) {
        lock.lock()
        defer { lock.unlock() }

        let seq = header.sequenceNumber
        let senderTs = header.timestampUs
        let payloadSize = header.payloadLength

        // Track packet for bandwidth / loss / jitter calculations
        let record = PacketRecord(
            seq: seq,
            senderTimestampUs: senderTs,
            recvTimeUs: recvTimeUs,
            payloadSize: payloadSize
        )
        recentPackets.append(record)
        if recentPackets.count > maxRecentPackets {
            recentPackets.removeFirst(recentPackets.count - maxRecentPackets)
        }

        // Sequence tracking for loss
        totalReceived += 1
        if firstPacket {
            expectedSeq = seq &+ 1
            firstPacket = false
            windowStartUs = recvTimeUs
            fpsWindowStartUs = recvTimeUs
        } else {
            let diff = Int16(bitPattern: seq &- expectedSeq)
            if diff >= 0 {
                totalExpected += UInt64(diff) + 1
                expectedSeq = seq &+ 1
            }
        }

        // Jitter calculation (RFC 3550 interarrival jitter)
        let transit = Int64(recvTimeUs) - Int64(senderTs)
        if jitterInitialized {
            let d = Double(abs(transit - lastTransit))
            jitter += (d - jitter) / 16.0
        } else {
            jitterInitialized = true
        }
        lastTransit = transit

        // Bandwidth window
        windowBytes += UInt64(payloadSize)

        // FPS tracking
        fpsFrameCount += 1
        let fpsDeltaUs = recvTimeUs - fpsWindowStartUs
        if fpsDeltaUs >= 1_000_000 {  // Update FPS every second
            currentFps = Double(fpsFrameCount) / (Double(fpsDeltaUs) / 1_000_000.0)
            fpsFrameCount = 0
            fpsWindowStartUs = recvTimeUs
        }
    }

    /// Update decode time from the decoder subsystem.
    func setDecodeTimeMs(_ ms: Double) {
        lock.lock()
        _decodeTimeMs = ms
        lock.unlock()
    }

    /// Update render time from the renderer subsystem.
    func setRenderTimeMs(_ ms: Double) {
        lock.lock()
        _renderTimeMs = ms
        lock.unlock()
    }

    /// Update codec name.
    func setCodecName(_ name: String) {
        lock.lock()
        _codecName = name
        lock.unlock()
    }

    /// Update resolution.
    func setResolution(width: UInt32, height: UInt32) {
        lock.lock()
        _resolutionWidth = width
        _resolutionHeight = height
        lock.unlock()
    }

    /// Increment frames decoded counter.
    func onFrameDecoded() {
        lock.lock()
        _framesDecoded += 1
        lock.unlock()
    }

    /// Increment frames dropped counter.
    func onFrameDropped() {
        lock.lock()
        _framesDropped += 1
        lock.unlock()
    }

    // MARK: - Start / Stop

    /// Start sending QoS feedback every 200ms.
    func start() {
        guard timer == nil else { return }

        let source = DispatchSource.makeTimerSource(flags: .strict, queue: timerQueue)
        source.schedule(
            deadline: .now() + .milliseconds(feedbackIntervalMs),
            repeating: .milliseconds(feedbackIntervalMs),
            leeway: .milliseconds(5)
        )
        source.setEventHandler { [weak self] in
            self?.sendFeedback()
        }
        source.resume()
        timer = source
    }

    /// Stop the feedback loop.
    func stop() {
        timer?.cancel()
        timer = nil
    }

    // MARK: - Stats Snapshot

    /// Get a snapshot of current statistics.
    func getStats() -> StreamStats {
        lock.lock()
        defer { lock.unlock() }

        return StreamStats(
            bitrateKbps: calculateBandwidthKbps(),
            fps: currentFps,
            packetLoss: calculatePacketLoss(),
            jitterMs: jitter / 1000.0,  // convert us to ms
            rttMs: 0.0,  // RTT requires round-trip measurement, not available in one-way stream
            codec: _codecName,
            resolutionWidth: _resolutionWidth,
            resolutionHeight: _resolutionHeight,
            connectionType: "p2p",
            decodeTimeMs: _decodeTimeMs,
            renderTimeMs: _renderTimeMs,
            framesDecoded: _framesDecoded,
            framesDropped: _framesDropped,
            packetsReceived: totalReceived,
            bytesReceived: windowBytes
        )
    }

    // MARK: - Feedback Sending

    /// Calculate and send a QoS feedback packet to the host.
    private func sendFeedback() {
        lock.lock()

        let lossX100 = UInt16(calculatePacketLoss() * 10000)  // 0.0250 -> 250
        let jitterUs = UInt16(min(jitter, Double(UInt16.max)))
        let bwKbps = UInt32(calculateBandwidthKbps())
        let delayGrad = calculateDelayGradientUs()
        let lastSeq = firstPacket ? 0 : expectedSeq &- 1

        lock.unlock()

        // Get missing sequences from NACK sender
        let missingSeqs = nackSender?.getMissingSequences() ?? []
        let nackCount = UInt16(min(missingSeqs.count, 64))

        // Build the QoS feedback packet
        var packet = QosFeedbackPacket(
            type: PacketType.qosFeedback.rawValue,
            flags: 0,
            lastSeqReceived: lastSeq,
            estimatedBwKbps: bwKbps,
            packetLossX100: lossX100,
            avgJitterUs: jitterUs,
            delayGradientUs: delayGrad,
            nackCount: nackCount,
            nackSeq0: missingSeqs.count > 0 ? missingSeqs[0] : 0,
            nackSeq1: missingSeqs.count > 1 ? missingSeqs[1] : 0
        )

        // Extended NACKs (beyond the first 2)
        let extendedNacks: [UInt16]
        if missingSeqs.count > 2 {
            extendedNacks = Array(missingSeqs[2..<min(missingSeqs.count, 64)])
        } else {
            extendedNacks = []
        }

        let data = packet.serialize(extendedNacks: extendedNacks)
        transport.send(data)

        // Notify stats observers
        let stats = getStats()
        onStatsUpdate?(stats)
    }

    // MARK: - Calculation Helpers

    /// Calculate packet loss rate over the tracking window.
    private func calculatePacketLoss() -> Double {
        guard totalExpected > 0 else { return 0.0 }
        let lost = totalExpected > totalReceived ? totalExpected - totalReceived : 0
        return Double(lost) / Double(totalExpected)
    }

    /// Estimate bandwidth in kbps over the recent window.
    private func calculateBandwidthKbps() -> Double {
        guard recentPackets.count >= 2 else { return 0.0 }

        let oldest = recentPackets.first!
        let newest = recentPackets.last!
        let durationUs = newest.recvTimeUs - oldest.recvTimeUs
        guard durationUs > 0 else { return 0.0 }

        var totalBytes: UInt64 = 0
        for record in recentPackets {
            totalBytes += UInt64(record.payloadSize)
        }

        let durationSec = Double(durationUs) / 1_000_000.0
        let bitsPerSec = (Double(totalBytes) * 8.0) / durationSec
        return bitsPerSec / 1000.0
    }

    /// Calculate one-way delay gradient using a simple Kalman filter.
    private func calculateDelayGradientUs() -> Int32 {
        guard recentPackets.count >= 2 else { return 0 }

        let n = recentPackets.count
        let latest = recentPackets[n - 1]
        let previous = recentPackets[n - 2]

        let transitLatest = Int64(latest.recvTimeUs) - Int64(latest.senderTimestampUs)
        let transitPrevious = Int64(previous.recvTimeUs) - Int64(previous.senderTimestampUs)
        let measurement = Double(transitLatest - transitPrevious)

        // Kalman filter update
        let prediction = kalmanEstimate
        let predictionError = kalmanError + kalmanQ

        let gain = predictionError / (predictionError + kalmanR)
        kalmanEstimate = prediction + gain * (measurement - prediction)
        kalmanError = (1.0 - gain) * predictionError

        return Int32(clamping: Int64(kalmanEstimate))
    }

    /// Current monotonic time in microseconds.
    static func currentTimeUs() -> UInt64 {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        let nanos = mach_absolute_time() * UInt64(info.numer) / UInt64(info.denom)
        return nanos / 1000
    }
}
