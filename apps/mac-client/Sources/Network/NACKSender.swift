// NACKSender.swift — Selective retransmission (NACK) requester
// GridStreamer macOS Client
//
// Mirrors the C++ NackSender from gridstreamer-viewer. Tracks incoming packet
// sequence numbers, detects gaps, and sends NACK packets (type=0xFD) requesting
// retransmission of missing packets.

import Foundation

/// Selective retransmission requester. Tracks received sequence numbers,
/// detects gaps, and periodically sends NACK requests to the host.
final class NACKSender: @unchecked Sendable {

    // MARK: - Configuration

    /// Maximum retransmission requests per missing sequence number.
    var maxRetries: Int = 3

    /// Maximum NACKs to send per check interval.
    var maxNacksPerCheck: Int = 10

    /// Check interval in milliseconds.
    var checkIntervalMs: Int = 5

    // MARK: - Properties

    private let transport: UDPTransport
    private let lock = NSLock()

    /// Set of received sequence numbers within the tracking window.
    private var receivedSeqs = Set<UInt16>()

    /// Highest sequence number seen so far.
    private var highestSeq: UInt16 = 0
    private var firstPacket = true

    /// NACK retry tracking: sequence number -> retry count.
    private var nackRetries: [UInt16: Int] = [:]

    /// Background timer for gap checking.
    private var timer: DispatchSourceTimer?
    private let timerQueue = DispatchQueue(label: "com.gridstreamer.nack-sender", qos: .userInteractive)

    /// Statistics.
    private(set) var nacksSent: UInt64 = 0
    private(set) var nackPacketsSent: UInt64 = 0

    // MARK: - Window Management

    /// We track a sliding window of the most recent N sequence numbers.
    /// Older entries are pruned to bound memory usage.
    private let windowSize: Int = 2000

    // MARK: - Initialization

    /// Create a NACKSender that sends NACK packets over the given transport.
    init(transport: UDPTransport) {
        self.transport = transport
    }

    deinit {
        stop()
    }

    // MARK: - Packet Tracking

    /// Notify that a packet with the given sequence number was received.
    func onPacketReceived(seq: UInt16) {
        lock.lock()
        defer { lock.unlock() }

        receivedSeqs.insert(seq)

        // Remove from NACK retry tracking if it was being NACKed
        nackRetries.removeValue(forKey: seq)

        if firstPacket {
            highestSeq = seq
            firstPacket = false
            return
        }

        // Update highest sequence number (handling wrap-around)
        let diff = Int16(bitPattern: seq &- highestSeq)
        if diff > 0 {
            highestSeq = seq
        }

        // Prune old entries from the tracking window
        pruneWindow()
    }

    /// Get the list of currently missing (NACKed) sequence numbers.
    /// Used by StatsReporter to include in QoS feedback.
    func getMissingSequences() -> [UInt16] {
        lock.lock()
        defer { lock.unlock() }
        return Array(nackRetries.keys.sorted())
    }

    // MARK: - Start / Stop

    /// Start the background gap-check timer.
    func start() {
        guard timer == nil else { return }

        let source = DispatchSource.makeTimerSource(flags: .strict, queue: timerQueue)
        source.schedule(
            deadline: .now() + .milliseconds(checkIntervalMs),
            repeating: .milliseconds(checkIntervalMs),
            leeway: .milliseconds(1)
        )
        source.setEventHandler { [weak self] in
            self?.checkForGaps()
        }
        source.resume()
        timer = source
    }

    /// Stop the background timer.
    func stop() {
        timer?.cancel()
        timer = nil
    }

    // MARK: - Gap Detection and NACK Sending

    /// Detect gaps in the received sequence numbers and send NACKs for missing ones.
    private func checkForGaps() {
        lock.lock()

        guard !firstPacket else {
            lock.unlock()
            return
        }

        var missing: [UInt16] = []

        // Scan backwards from highestSeq looking for gaps.
        // We only check a limited range to avoid scanning thousands of old sequences.
        let scanRange = min(500, windowSize)
        var seq = highestSeq
        for _ in 0..<scanRange {
            seq &-= 1  // wrapping decrement

            if !receivedSeqs.contains(seq) {
                let retries = nackRetries[seq] ?? 0
                if retries < maxRetries {
                    missing.append(seq)
                    nackRetries[seq] = retries + 1
                }
            }

            if missing.count >= maxNacksPerCheck {
                break
            }
        }

        lock.unlock()

        if !missing.isEmpty {
            sendNACKPacket(missingSeqs: missing)
        }
    }

    /// Build and send a NACK packet for the given missing sequences.
    ///
    /// NACK packet wire format:
    /// ```
    ///   [0]   type = 0xFD
    ///   [1]   reserved = 0
    ///   [2-3] count (big-endian, number of NACKed sequences)
    ///   [4..] sequence numbers (big-endian uint16 each)
    /// ```
    private func sendNACKPacket(missingSeqs: [UInt16]) {
        let count = UInt16(min(missingSeqs.count, 64))
        let packetSize = 4 + Int(count) * 2

        var data = Data(count: packetSize)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            base.storeBytes(of: PacketType.nack.rawValue, toByteOffset: 0, as: UInt8.self)
            base.storeBytes(of: UInt8(0),                 toByteOffset: 1, as: UInt8.self)
            base.storeBytes(of: count.bigEndian,          toByteOffset: 2, as: UInt16.self)

            for i in 0..<Int(count) {
                let offset = 4 + i * 2
                base.storeBytes(of: missingSeqs[i].bigEndian, toByteOffset: offset, as: UInt16.self)
            }
        }

        transport.send(data)

        lock.lock()
        nacksSent += UInt64(count)
        nackPacketsSent += 1
        lock.unlock()
    }

    /// Prune old sequence numbers from the tracking set.
    private func pruneWindow() {
        if receivedSeqs.count > windowSize {
            // Remove entries that are far behind highestSeq
            let threshold = highestSeq &- UInt16(windowSize)
            receivedSeqs = receivedSeqs.filter { seq in
                let diff = Int16(bitPattern: highestSeq &- seq)
                return diff >= 0 && diff < Int16(windowSize)
            }

            // Also prune old NACK retries
            nackRetries = nackRetries.filter { (seq, _) in
                let diff = Int16(bitPattern: highestSeq &- seq)
                return diff >= 0 && diff < Int16(windowSize)
            }
        }
    }
}
