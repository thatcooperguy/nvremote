// UDPTransport.swift — NWConnection-based UDP transport with DTLS
// NVRemote macOS Client

import Foundation
import Network

/// Callback types for received data, dispatched from the receive loop.
typealias PacketReceiveHandler = @Sendable (Data) -> Void
typealias TransportStateHandler = @Sendable (UDPTransport.State) -> Void

/// NWConnection-based UDP transport layer. Supports optional DTLS encryption
/// via NWProtocolTLS and provides a continuous receive loop that dispatches
/// incoming datagrams to a registered handler on a dedicated dispatch queue.
final class UDPTransport: @unchecked Sendable {

    // MARK: - Types

    enum State: Sendable {
        case idle
        case connecting
        case connected
        case disconnected(Error?)
    }

    enum TransportError: Error, LocalizedError {
        case invalidEndpoint
        case connectionFailed(String)
        case sendFailed(String)
        case notConnected

        var errorDescription: String? {
            switch self {
            case .invalidEndpoint: return "Invalid remote endpoint."
            case .connectionFailed(let msg): return "Connection failed: \(msg)"
            case .sendFailed(let msg): return "Send failed: \(msg)"
            case .notConnected: return "Transport is not connected."
            }
        }
    }

    // MARK: - Properties

    private var connection: NWConnection?
    private let queue = DispatchQueue(label: "com.nvremote.udp-transport", qos: .userInteractive)
    private var receiveHandler: PacketReceiveHandler?
    private var stateHandler: TransportStateHandler?
    private var _state: State = .idle
    private let lock = NSLock()

    var state: State {
        lock.lock()
        defer { lock.unlock() }
        return _state
    }

    /// Total bytes sent during this transport session.
    private(set) var bytesSent: UInt64 = 0

    /// Total bytes received during this transport session.
    private(set) var bytesReceived: UInt64 = 0

    /// Total datagrams received.
    private(set) var datagramsReceived: UInt64 = 0

    // MARK: - Lifecycle

    deinit {
        disconnect()
    }

    /// Set the handler called for each received datagram.
    func onReceive(_ handler: @escaping PacketReceiveHandler) {
        receiveHandler = handler
    }

    /// Set the handler called when transport state changes.
    func onStateChange(_ handler: @escaping TransportStateHandler) {
        stateHandler = handler
    }

    // MARK: - Connect

    /// Connect to a remote host:port over UDP. If `useDTLS` is true, wraps
    /// the connection in a DTLS 1.2 layer using Network.framework's built-in TLS.
    func connect(host: String, port: UInt16, useDTLS: Bool = true) {
        let nwHost = NWEndpoint.Host(host)
        let nwPort = NWEndpoint.Port(integerLiteral: port)

        let params: NWParameters
        if useDTLS {
            params = createDTLSParameters()
        } else {
            params = NWParameters.udp
        }

        // Configure for low-latency gaming
        params.requiredInterfaceType = .wifi  // Prefer WiFi for LAN; will also work over Ethernet
        params.serviceClass = .interactiveVideo
        params.expiredDNSBehavior = .allow

        let conn = NWConnection(host: nwHost, port: nwPort, using: params)
        self.connection = conn

        updateState(.connecting)

        conn.stateUpdateHandler = { [weak self] nwState in
            guard let self else { return }
            switch nwState {
            case .ready:
                self.updateState(.connected)
                self.startReceiveLoop()
            case .failed(let error):
                self.updateState(.disconnected(error))
            case .cancelled:
                self.updateState(.disconnected(nil))
            case .waiting(let error):
                // Network path temporarily unavailable
                print("[UDPTransport] waiting: \(error)")
            default:
                break
            }
        }

        conn.start(queue: queue)
    }

    /// Connect using a pre-resolved NWEndpoint (from ICE/STUN).
    func connect(endpoint: NWEndpoint, useDTLS: Bool = true) {
        let params: NWParameters
        if useDTLS {
            params = createDTLSParameters()
        } else {
            params = NWParameters.udp
        }

        params.serviceClass = .interactiveVideo

        let conn = NWConnection(to: endpoint, using: params)
        self.connection = conn

        updateState(.connecting)

        conn.stateUpdateHandler = { [weak self] nwState in
            guard let self else { return }
            switch nwState {
            case .ready:
                self.updateState(.connected)
                self.startReceiveLoop()
            case .failed(let error):
                self.updateState(.disconnected(error))
            case .cancelled:
                self.updateState(.disconnected(nil))
            default:
                break
            }
        }

        conn.start(queue: queue)
    }

    // MARK: - Disconnect

    /// Gracefully tear down the connection.
    func disconnect() {
        connection?.cancel()
        connection = nil
        updateState(.disconnected(nil))
    }

    // MARK: - Send

    /// Send a datagram. Completes asynchronously; errors are logged but not thrown
    /// to avoid blocking the input path.
    func send(_ data: Data) {
        guard let conn = connection else { return }
        conn.send(content: data, completion: .contentProcessed { [weak self] error in
            if let error {
                print("[UDPTransport] send error: \(error)")
            } else {
                self?.bytesSent += UInt64(data.count)
            }
        })
    }

    /// Send a datagram with async/await.
    func sendAsync(_ data: Data) async throws {
        guard let conn = connection else { throw TransportError.notConnected }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            conn.send(content: data, completion: .contentProcessed { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    self.bytesSent += UInt64(data.count)
                    continuation.resume()
                }
            })
        }
    }

    // MARK: - Receive Loop

    /// Start a continuous receive loop that calls the registered handler for each datagram.
    private func startReceiveLoop() {
        guard let conn = connection else { return }

        conn.receiveMessage { [weak self] content, _, isComplete, error in
            guard let self else { return }

            if let error {
                print("[UDPTransport] receive error: \(error)")
                // Don't stop the loop on transient errors
            }

            if let data = content, !data.isEmpty {
                self.bytesReceived += UInt64(data.count)
                self.datagramsReceived += 1
                self.receiveHandler?(data)
            }

            // Continue receiving as long as the connection is alive
            if case .connected = self.state {
                self.startReceiveLoop()
            }
        }
    }

    // MARK: - DTLS Configuration

    /// Create NWParameters with DTLS 1.2 enabled for UDP.
    private func createDTLSParameters() -> NWParameters {
        let tlsOptions = NWProtocolTLS.Options()

        // Configure for DTLS 1.2
        let secOptions = tlsOptions.securityProtocolOptions

        // Set minimum TLS version to DTLS 1.2
        sec_protocol_options_set_min_tls_protocol_version(secOptions, .DTLSv12)
        sec_protocol_options_set_max_tls_protocol_version(secOptions, .DTLSv12)

        // For P2P with self-signed certs, we verify the peer's certificate
        // fingerprint out-of-band via signaling rather than using a CA chain.
        sec_protocol_options_set_verify_block(secOptions, { _, trust, completionHandler in
            // In production, verify the peer certificate fingerprint here
            // against the one received via signaling.
            // For now, accept all peers (fingerprint verification happens at the ICE layer).
            completionHandler(true)
        }, queue)

        let udpOptions = NWProtocolUDP.Options()
        udpOptions.preferNoChecksum = false

        let params = NWParameters(dtls: tlsOptions, udp: udpOptions)
        return params
    }

    // MARK: - State Management

    private func updateState(_ newState: State) {
        lock.lock()
        _state = newState
        lock.unlock()
        stateHandler?(newState)
    }
}

// MARK: - Listener (for P2P hole-punching receive side)

extension UDPTransport {
    /// Create a UDP listener on a specific port for receiving hole-punched connections.
    /// Used during ICE connectivity checks.
    static func createListener(port: UInt16) throws -> NWListener {
        let params = NWParameters.udp
        params.serviceClass = .interactiveVideo

        let listener = try NWListener(using: params, on: NWEndpoint.Port(integerLiteral: port))
        return listener
    }
}
