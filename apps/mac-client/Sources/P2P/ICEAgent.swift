// ICEAgent.swift — ICE-lite candidate gathering and connectivity checks
// NVRemote macOS Client
//
// Mirrors the C++ IceAgent from nvremote-common. Gathers local host and
// server-reflexive (srflx) candidates, exchanges them with the peer via signaling,
// and performs simultaneous UDP hole-punching connectivity checks.

import Foundation
import Network

/// A single ICE candidate (local or remote).
struct ICECandidate: Codable, Sendable, Equatable {
    let type: String          // "host", "srflx", "relay"
    let ip: String
    let port: UInt16
    let priority: UInt32
    let foundation: String

    static func host(ip: String, port: UInt16) -> ICECandidate {
        ICECandidate(
            type: "host",
            ip: ip,
            port: port,
            priority: computePriority(type: "host", localPref: 65535),
            foundation: "host-\(ip)"
        )
    }

    static func srflx(ip: String, port: UInt16) -> ICECandidate {
        ICECandidate(
            type: "srflx",
            ip: ip,
            port: port,
            priority: computePriority(type: "srflx", localPref: 65534),
            foundation: "srflx-\(ip)"
        )
    }

    /// Compute ICE priority per RFC 5245 section 4.1.2.1.
    private static func computePriority(type: String, localPref: UInt16, component: UInt16 = 1) -> UInt32 {
        let typePreference: UInt32
        switch type {
        case "host":  typePreference = 126
        case "srflx": typePreference = 100
        case "relay": typePreference = 0
        default:      typePreference = 0
        }
        return (typePreference << 24) | (UInt32(localPref) << 8) | (256 - UInt32(component))
    }
}

/// Result of P2P connection attempt.
struct P2PConnectionResult: Sendable {
    let success: Bool
    let localCandidate: ICECandidate?
    let remoteCandidate: ICECandidate?
    let transport: UDPTransport?
    let error: String?
}

/// ICE agent that gathers candidates and performs connectivity checks for P2P
/// NAT traversal via UDP hole-punching.
actor ICEAgent {

    // MARK: - Configuration

    /// STUN servers to query for server-reflexive candidates.
    let stunServers: [(host: String, port: UInt16)]

    /// Probe magic bytes matching C++ IceAgent: "CSIC" (0x43 0x53 0x49 0x43).
    private static let probeMagic = Data([0x43, 0x53, 0x49, 0x43])

    /// Timeout for connectivity checks in seconds.
    private let connectivityTimeout: TimeInterval = 10.0

    /// Interval between probe packets in milliseconds.
    private let probeIntervalMs: Int = 50

    // MARK: - State

    private var localCandidates: [ICECandidate] = []
    private var remoteCandidates: [ICECandidate] = []
    private var selectedLocal: ICECandidate?
    private var selectedRemote: ICECandidate?
    private var isRunning = false

    // MARK: - Initialization

    /// Create an ICE agent with the given STUN server list.
    /// - Parameter stunServers: List of STUN server hostnames. Port defaults to 3478.
    init(stunServers: [String]) {
        self.stunServers = stunServers.map { server in
            if server.contains(":") {
                let parts = server.split(separator: ":")
                return (String(parts[0]), UInt16(parts[1]) ?? STUNClient.defaultPort)
            }
            return (server, STUNClient.defaultPort)
        }
    }

    // MARK: - Phase 1: Candidate Gathering

    /// Gather local host and server-reflexive candidates.
    /// Returns the full list of gathered local candidates.
    func gatherCandidates() async -> [ICECandidate] {
        var candidates: [ICECandidate] = []

        // 1. Gather host candidates from all non-loopback IPv4 interfaces
        let hostCandidates = gatherHostCandidates()
        candidates.append(contentsOf: hostCandidates)

        // 2. Gather server-reflexive candidates from STUN servers
        let stunClient = STUNClient()
        for (server, port) in stunServers {
            let result = await stunClient.discoverPublicEndpoint(server: server, port: port)
            if result.success {
                let srflx = ICECandidate.srflx(ip: result.publicIP, port: result.publicPort)
                // Avoid duplicate srflx candidates
                if !candidates.contains(where: { $0.ip == srflx.ip && $0.port == srflx.port }) {
                    candidates.append(srflx)
                }
            }
        }

        localCandidates = candidates
        return candidates
    }

    /// Enumerate local non-loopback IPv4 network interface addresses.
    private func gatherHostCandidates() -> [ICECandidate] {
        var candidates: [ICECandidate] = []

        var ifaddrPtr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddrPtr) == 0, let firstAddr = ifaddrPtr else {
            return candidates
        }
        defer { freeifaddrs(firstAddr) }

        var current: UnsafeMutablePointer<ifaddrs>? = firstAddr
        while let addr = current {
            defer { current = addr.pointee.ifa_next }

            guard let sockaddr = addr.pointee.ifa_addr else { continue }
            guard sockaddr.pointee.sa_family == AF_INET else { continue }

            let ipv4 = sockaddr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
            var ipStr = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            var inAddr = ipv4.sin_addr
            inet_ntop(AF_INET, &inAddr, &ipStr, socklen_t(INET_ADDRSTRLEN))
            let ip = String(cString: ipStr)

            // Skip loopback
            guard !ip.hasPrefix("127.") else { continue }

            // Use an ephemeral port (0 means the OS will assign one)
            let candidate = ICECandidate.host(ip: ip, port: 0)
            candidates.append(candidate)
        }

        return candidates
    }

    // MARK: - Phase 2: Add Remote Candidates

    /// Add a remote candidate received from the peer via signaling.
    func addRemoteCandidate(_ candidate: ICECandidate) {
        remoteCandidates.append(candidate)
    }

    /// Set all remote candidates at once.
    func setRemoteCandidates(_ candidates: [ICECandidate]) {
        remoteCandidates = candidates
    }

    // MARK: - Phase 3: Connectivity Checks

    /// Start connectivity checks against all remote candidates.
    /// Returns the winning pair and a connected transport, or failure.
    func startConnectivityChecks() async -> P2PConnectionResult {
        guard !localCandidates.isEmpty, !remoteCandidates.isEmpty else {
            return P2PConnectionResult(
                success: false, localCandidate: nil, remoteCandidate: nil,
                transport: nil, error: "No candidates to check"
            )
        }

        isRunning = true

        // Build all candidate pairs sorted by combined priority
        var pairs: [(local: ICECandidate, remote: ICECandidate)] = []
        for local in localCandidates {
            for remote in remoteCandidates {
                pairs.append((local, remote))
            }
        }
        pairs.sort { ($0.local.priority + $0.remote.priority) > ($1.local.priority + $1.remote.priority) }

        // Try connectivity checks concurrently via task group
        let result = await withTaskGroup(of: P2PConnectionResult?.self, returning: P2PConnectionResult.self) { group in
            for pair in pairs {
                group.addTask {
                    await self.checkPair(local: pair.local, remote: pair.remote)
                }
            }

            // Also add a timeout task
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(self.connectivityTimeout * 1_000_000_000))
                return nil
            }

            // Return the first successful result
            for await result in group {
                if let result, result.success {
                    group.cancelAll()
                    return result
                }
            }

            return P2PConnectionResult(
                success: false, localCandidate: nil, remoteCandidate: nil,
                transport: nil, error: "All connectivity checks failed"
            )
        }

        isRunning = false

        if result.success {
            selectedLocal = result.localCandidate
            selectedRemote = result.remoteCandidate
        }

        return result
    }

    /// Perform a connectivity check for a single local-remote candidate pair.
    /// Sends probe packets ("CSIC" magic) and waits for the same magic back.
    private func checkPair(local: ICECandidate, remote: ICECandidate) async -> P2PConnectionResult? {
        guard !remote.ip.isEmpty, remote.port > 0 else { return nil }

        let transport = UDPTransport()

        // Set up a continuation to wait for a probe response
        return await withCheckedContinuation { continuation in
            var completed = false
            let completionLock = NSLock()

            func complete(result: P2PConnectionResult?) {
                completionLock.lock()
                guard !completed else {
                    completionLock.unlock()
                    return
                }
                completed = true
                completionLock.unlock()
                continuation.resume(returning: result)
            }

            transport.onReceive { data in
                // Check if we received the probe magic back
                if data.count >= 4 && data.prefix(4) == Self.probeMagic {
                    complete(result: P2PConnectionResult(
                        success: true,
                        localCandidate: local,
                        remoteCandidate: remote,
                        transport: transport,
                        error: nil
                    ))
                }
            }

            transport.onStateChange { state in
                switch state {
                case .connected:
                    // Start sending probes
                    Task {
                        for _ in 0..<Int(self.connectivityTimeout * 1000) / self.probeIntervalMs {
                            guard !completed else { break }
                            transport.send(Self.probeMagic)
                            try? await Task.sleep(nanoseconds: UInt64(self.probeIntervalMs) * 1_000_000)
                        }
                        complete(result: nil)
                    }

                case .disconnected:
                    complete(result: nil)

                default:
                    break
                }
            }

            // Connect to the remote candidate
            transport.connect(host: remote.ip, port: remote.port, useDTLS: false)
        }
    }

    /// Get the selected (winning) candidate pair.
    func getSelectedPair() -> (local: ICECandidate?, remote: ICECandidate?) {
        (selectedLocal, selectedRemote)
    }

    /// Stop the agent and cancel all in-progress checks.
    func stop() {
        isRunning = false
    }
}
