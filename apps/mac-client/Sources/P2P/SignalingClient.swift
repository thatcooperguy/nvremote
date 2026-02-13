// SignalingClient.swift — WebSocket signaling via server-api
// CrazyStream macOS Client
//
// Handles the signaling channel between client and host via a WebSocket
// connection to the CrazyStream signaling server. Exchanges ICE candidates,
// DTLS fingerprints, and session control messages.

import Foundation

/// Messages received from the signaling server.
enum SignalingMessage: Sendable {
    case hostList([HostInfo])
    case offer(sessionId: String, sdp: String)
    case answer(sessionId: String, sdp: String)
    case iceCandidate(sessionId: String, candidate: ICECandidate)
    case dtlsFingerprint(sessionId: String, fingerprint: String)
    case sessionStarted(sessionId: String)
    case sessionEnded(sessionId: String, reason: String)
    case error(String)
    case hostStateChanged(hostId: String, online: Bool)
}

/// Information about an available streaming host.
struct HostInfo: Identifiable, Codable, Sendable {
    let id: String
    let name: String
    let ip: String
    let gpuName: String
    let os: String
    var isOnline: Bool
    var currentGame: String?
    var resolution: String?
    var fps: Int?
    var latencyMs: Int?
    var lastSeen: Date?
}

/// WebSocket-based signaling client for exchanging session setup messages
/// between the CrazyStream viewer and host.
final class SignalingClient: @unchecked Sendable {

    // MARK: - Types

    enum State: Sendable {
        case disconnected
        case connecting
        case connected
        case error(String)
    }

    // MARK: - Properties

    private var webSocket: URLSessionWebSocketTask?
    private let session: URLSession
    private let serverURL: URL
    private var authToken: String?
    private let lock = NSLock()
    private var _state: State = .disconnected

    var state: State {
        lock.lock()
        defer { lock.unlock() }
        return _state
    }

    /// Handler called when a signaling message is received.
    var onMessage: ((SignalingMessage) -> Void)?

    /// Handler called when the connection state changes.
    var onStateChange: ((State) -> Void)?

    // MARK: - Initialization

    /// Create a signaling client targeting the given server URL.
    /// - Parameter serverURL: The WebSocket URL of the signaling server
    ///   (e.g., "wss://signal.crazystream.app/ws").
    init(serverURL: URL) {
        self.serverURL = serverURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
    }

    deinit {
        disconnect()
    }

    // MARK: - Connection

    /// Connect to the signaling server with the given auth token.
    func connect(authToken: String) {
        self.authToken = authToken
        updateState(.connecting)

        var request = URLRequest(url: serverURL)
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("crazystream-mac-client/1.0", forHTTPHeaderField: "User-Agent")

        let ws = session.webSocketTask(with: request)
        self.webSocket = ws

        ws.resume()

        // Start the receive loop
        receiveLoop()

        updateState(.connected)
    }

    /// Disconnect from the signaling server.
    func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        updateState(.disconnected)
    }

    // MARK: - Send Messages

    /// Request the list of available hosts.
    func requestHostList() async throws {
        let msg: [String: Any] = [
            "type": "get_hosts"
        ]
        try await sendJSON(msg)
    }

    /// Send local ICE candidates to a specific host.
    func sendICECandidates(_ candidates: [ICECandidate], toHost hostId: String, sessionId: String) async throws {
        let candidateArray = candidates.map { candidate -> [String: Any] in
            [
                "type": candidate.type,
                "ip": candidate.ip,
                "port": candidate.port,
                "priority": candidate.priority,
                "foundation": candidate.foundation,
            ]
        }

        let msg: [String: Any] = [
            "type": "ice_candidates",
            "session_id": sessionId,
            "host_id": hostId,
            "candidates": candidateArray,
        ]
        try await sendJSON(msg)
    }

    /// Send our DTLS fingerprint to the peer.
    func sendDTLSFingerprint(_ fingerprint: String, toHost hostId: String, sessionId: String) async throws {
        let msg: [String: Any] = [
            "type": "dtls_fingerprint",
            "session_id": sessionId,
            "host_id": hostId,
            "fingerprint": fingerprint,
        ]
        try await sendJSON(msg)
    }

    /// Request a streaming session with a host.
    func requestSession(
        hostId: String,
        codec: String,
        width: UInt32,
        height: UInt32,
        fps: UInt32,
        gamingMode: String
    ) async throws {
        let msg: [String: Any] = [
            "type": "request_session",
            "host_id": hostId,
            "codec": codec,
            "width": width,
            "height": height,
            "fps": fps,
            "gaming_mode": gamingMode,
        ]
        try await sendJSON(msg)
    }

    /// End a streaming session.
    func endSession(sessionId: String) async throws {
        let msg: [String: Any] = [
            "type": "end_session",
            "session_id": sessionId,
        ]
        try await sendJSON(msg)
    }

    /// Send a generic JSON message.
    private func sendJSON(_ json: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: json)
        guard let string = String(data: data, encoding: .utf8) else {
            throw SignalingError.serializationFailed
        }

        guard let ws = webSocket else {
            throw SignalingError.notConnected
        }

        try await ws.send(.string(string))
    }

    // MARK: - Receive Loop

    /// Continuously receive messages from the WebSocket.
    private func receiveLoop() {
        webSocket?.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleMessage(text)
                    }
                @unknown default:
                    break
                }
                // Continue receiving
                self.receiveLoop()

            case .failure(let error):
                let nsError = error as NSError
                // Don't report cancellation as an error
                if nsError.code != 57 && nsError.domain != NSURLErrorDomain {
                    self.updateState(.error(error.localizedDescription))
                    self.onMessage?(.error(error.localizedDescription))
                }
            }
        }
    }

    // MARK: - Message Parsing

    /// Parse an incoming JSON message and dispatch to the appropriate handler.
    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String
        else {
            return
        }

        switch type {
        case "host_list":
            if let hostsJSON = json["hosts"] as? [[String: Any]] {
                let hosts = hostsJSON.compactMap { parseHostInfo($0) }
                onMessage?(.hostList(hosts))
            }

        case "ice_candidate":
            if let sessionId = json["session_id"] as? String,
               let candidateJSON = json["candidate"] as? [String: Any],
               let candidate = parseICECandidate(candidateJSON) {
                onMessage?(.iceCandidate(sessionId: sessionId, candidate: candidate))
            }

        case "dtls_fingerprint":
            if let sessionId = json["session_id"] as? String,
               let fingerprint = json["fingerprint"] as? String {
                onMessage?(.dtlsFingerprint(sessionId: sessionId, fingerprint: fingerprint))
            }

        case "session_started":
            if let sessionId = json["session_id"] as? String {
                onMessage?(.sessionStarted(sessionId: sessionId))
            }

        case "session_ended":
            if let sessionId = json["session_id"] as? String {
                let reason = json["reason"] as? String ?? "unknown"
                onMessage?(.sessionEnded(sessionId: sessionId, reason: reason))
            }

        case "host_state_changed":
            if let hostId = json["host_id"] as? String,
               let online = json["online"] as? Bool {
                onMessage?(.hostStateChanged(hostId: hostId, online: online))
            }

        case "error":
            let msg = json["message"] as? String ?? "Unknown signaling error"
            onMessage?(.error(msg))

        default:
            print("[SignalingClient] Unknown message type: \(type)")
        }
    }

    /// Parse a HostInfo from a JSON dictionary.
    private func parseHostInfo(_ json: [String: Any]) -> HostInfo? {
        guard let id = json["id"] as? String,
              let name = json["name"] as? String
        else { return nil }

        return HostInfo(
            id: id,
            name: name,
            ip: json["ip"] as? String ?? "",
            gpuName: json["gpu_name"] as? String ?? "Unknown GPU",
            os: json["os"] as? String ?? "Windows",
            isOnline: json["is_online"] as? Bool ?? false,
            currentGame: json["current_game"] as? String,
            resolution: json["resolution"] as? String,
            fps: json["fps"] as? Int,
            latencyMs: json["latency_ms"] as? Int,
            lastSeen: nil
        )
    }

    /// Parse an ICECandidate from a JSON dictionary.
    private func parseICECandidate(_ json: [String: Any]) -> ICECandidate? {
        guard let ip = json["ip"] as? String,
              let port = json["port"] as? UInt16
        else { return nil }

        return ICECandidate(
            type: json["type"] as? String ?? "host",
            ip: ip,
            port: port,
            priority: json["priority"] as? UInt32 ?? 0,
            foundation: json["foundation"] as? String ?? ""
        )
    }

    // MARK: - State Management

    private func updateState(_ newState: State) {
        lock.lock()
        _state = newState
        lock.unlock()
        onStateChange?(newState)
    }
}

// MARK: - Errors

enum SignalingError: Error, LocalizedError {
    case notConnected
    case serializationFailed
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Not connected to signaling server."
        case .serializationFailed: return "Failed to serialize message."
        case .invalidResponse: return "Invalid response from server."
        }
    }
}
