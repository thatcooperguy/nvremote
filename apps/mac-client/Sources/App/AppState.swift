// AppState.swift — Observable app state
// NVRemote macOS Client

import Foundation
import SwiftUI

/// The central observable state object for the NVRemote application.
/// Manages authentication, host discovery, session negotiation, and streaming lifecycle.
@MainActor
final class AppState: ObservableObject {

    // MARK: - Published State

    /// List of discovered streaming hosts.
    @Published var hosts: [HostInfo] = []

    /// Whether a streaming session is currently active.
    @Published var isStreaming = false

    /// Selected gaming mode for the next session.
    @Published var selectedGamingMode: StreamSessionConfig.GamingMode = .balanced

    /// Current error message, if any.
    @Published var errorMessage: String?

    /// The active session configuration (set when streaming).
    @Published private(set) var currentSessionConfig: StreamSessionConfig?

    // MARK: - Subsystems

    /// Authentication manager.
    let authManager: AuthManager

    /// Signaling client for host discovery and session negotiation.
    private var signalingClient: SignalingClient?

    /// ICE agent for P2P connection establishment.
    private var iceAgent: ICEAgent?

    /// The active stream engine (manages decode/render pipeline).
    let streamEngine = StreamEngine()

    // MARK: - Initialization

    init(authManager: AuthManager) {
        self.authManager = authManager
        setupSignaling()
    }

    // MARK: - Signaling

    /// Set up the signaling client and connect to the signaling server.
    private func setupSignaling() {
        let client = SignalingClient(serverURL: AppConfig.signalingServerURL)

        client.onMessage = { [weak self] message in
            Task { @MainActor [weak self] in
                self?.handleSignalingMessage(message)
            }
        }

        client.onStateChange = { [weak self] state in
            Task { @MainActor [weak self] in
                switch state {
                case .error(let msg):
                    self?.errorMessage = "Signaling: \(msg)"
                default:
                    break
                }
            }
        }

        self.signalingClient = client

        // Auto-connect when authenticated
        if authManager.isAuthenticated, let token = authManager.user?.accessToken {
            client.connect(authToken: token)
        }
    }

    /// Handle incoming signaling messages.
    private func handleSignalingMessage(_ message: SignalingMessage) {
        switch message {
        case .hostList(let newHosts):
            hosts = newHosts

        case .iceCandidate(_, let candidate):
            Task {
                await iceAgent?.addRemoteCandidate(candidate)
            }

        case .dtlsFingerprint(let sessionId, let fingerprint):
            // Store for DTLS handshake
            print("[AppState] Received DTLS fingerprint for session \(sessionId): \(fingerprint)")

        case .sessionStarted(let sessionId):
            print("[AppState] Session started: \(sessionId)")

        case .sessionEnded(_, let reason):
            print("[AppState] Session ended: \(reason)")
            disconnect()

        case .hostStateChanged(let hostId, let online):
            if let index = hosts.firstIndex(where: { $0.id == hostId }) {
                hosts[index].isOnline = online
            }

        case .error(let msg):
            errorMessage = msg

        default:
            break
        }
    }

    // MARK: - Host Discovery

    /// Refresh the list of available hosts from the signaling server.
    func refreshHosts() async {
        // Ensure signaling is connected
        if case .disconnected = signalingClient?.state {
            if let token = await authManager.getValidAccessToken() {
                signalingClient?.connect(authToken: token)
            }
        }

        do {
            try await signalingClient?.requestHostList()
        } catch {
            errorMessage = "Failed to refresh hosts: \(error.localizedDescription)"
        }
    }

    // MARK: - Connection

    /// Connect to a specific host and start a streaming session.
    func connectToHost(_ host: HostInfo) async {
        guard host.isOnline else {
            errorMessage = "Host is offline."
            return
        }

        errorMessage = nil

        do {
            // 1. Request a session via signaling
            let codec = codecString(for: AppConfig.preferredCodec)
            let (width, height) = resolutionForMode(selectedGamingMode)
            let fps = selectedGamingMode.targetFps

            try await signalingClient?.requestSession(
                hostId: host.id,
                codec: codec,
                width: width,
                height: height,
                fps: fps,
                gamingMode: selectedGamingMode.rawValue
            )

            // 2. Gather ICE candidates
            let agent = ICEAgent(stunServers: AppConfig.stunServers)
            self.iceAgent = agent
            let localCandidates = await agent.gatherCandidates()

            // 3. Send our candidates to the host
            let sessionId = "\(host.id)-\(UUID().uuidString.prefix(8))"
            try await signalingClient?.sendICECandidates(
                localCandidates,
                toHost: host.id,
                sessionId: sessionId
            )

            // 4. Wait briefly for remote candidates from signaling
            try await Task.sleep(nanoseconds: 2_000_000_000)  // 2 seconds

            // 5. Start connectivity checks
            let p2pResult = await agent.startConnectivityChecks()

            if !p2pResult.success {
                // Fall back to direct connection using the host's IP
                print("[AppState] P2P failed, falling back to direct connection")
            }

            // 6. Build session config
            let config = StreamSessionConfig(
                sessionId: sessionId,
                hostId: host.id,
                hostIP: p2pResult.remoteCandidate?.ip ?? host.ip,
                hostPort: p2pResult.remoteCandidate?.port ?? 9000,
                codec: AppConfig.preferredCodec,
                width: width,
                height: height,
                fps: fps,
                gamingMode: selectedGamingMode,
                useDTLS: AppConfig.enableDTLS
            )

            self.currentSessionConfig = config
            self.isStreaming = true

            // 7. Start the stream engine
            // Note: The MTKView will be provided by the StreamView when it appears.
            // The engine is started via StreamView's onAppear.

        } catch {
            errorMessage = "Connection failed: \(error.localizedDescription)"
        }
    }

    /// Disconnect from the current streaming session.
    func disconnect() {
        streamEngine.stop()
        isStreaming = false
        currentSessionConfig = nil

        if let sessionId = currentSessionConfig?.sessionId {
            Task {
                try? await signalingClient?.endSession(sessionId: sessionId)
            }
        }
    }

    // MARK: - Helpers

    private func codecString(for codec: CodecType) -> String {
        switch codec {
        case .h264: return "h264"
        case .h265: return "h265"
        case .av1:  return "av1"
        }
    }

    private func resolutionForMode(_ mode: StreamSessionConfig.GamingMode) -> (UInt32, UInt32) {
        switch mode {
        case .competitive: return (1920, 1080)
        case .balanced:    return (2560, 1440)
        case .cinematic:   return (3840, 2160)
        }
    }
}
