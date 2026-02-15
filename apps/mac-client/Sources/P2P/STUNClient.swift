// STUNClient.swift — STUN Binding Request/Response (RFC 5389)
// NVRemote macOS Client
//
// Mirrors the C++ StunClient from nvremote-common. Sends a STUN Binding
// Request to a public STUN server and parses the XOR-MAPPED-ADDRESS attribute
// to discover our public IP:port for NAT traversal.

import Foundation
import Network

/// Result of a STUN binding discovery.
struct STUNResult: Sendable {
    let publicIP: String
    let publicPort: UInt16
    let success: Bool

    static let failure = STUNResult(publicIP: "", publicPort: 0, success: false)
}

/// Minimal STUN client implementing Binding Request/Response per RFC 5389.
/// Uses Network.framework NWConnection for UDP transport.
actor STUNClient {

    // MARK: - Constants

    /// STUN magic cookie (RFC 5389 section 6).
    private static let magicCookie: UInt32 = 0x2112A442

    /// STUN message types.
    private static let bindingRequest: UInt16 = 0x0001
    private static let bindingResponse: UInt16 = 0x0101

    /// STUN attribute types.
    private static let attrXorMappedAddress: UInt16 = 0x0020
    private static let attrMappedAddress: UInt16 = 0x0001

    /// Default STUN port.
    static let defaultPort: UInt16 = 3478

    /// Timeout per attempt in seconds.
    private let timeoutSec: Double = 2.0

    /// Number of retry attempts.
    private let maxRetries = 3

    // MARK: - Public API

    /// Discover the public (server-reflexive) endpoint by sending a STUN Binding
    /// Request to the specified STUN server.
    func discoverPublicEndpoint(
        server: String,
        port: UInt16 = STUNClient.defaultPort
    ) async -> STUNResult {
        for attempt in 1...maxRetries {
            if let result = await sendBindingRequest(server: server, port: port) {
                return result
            }
            if attempt < maxRetries {
                // Brief pause before retry
                try? await Task.sleep(nanoseconds: 200_000_000)  // 200ms
            }
        }
        return .failure
    }

    // MARK: - Binding Request

    /// Send a single STUN Binding Request and await the response.
    private func sendBindingRequest(server: String, port: UInt16) async -> STUNResult? {
        // Generate random 12-byte transaction ID
        var transactionID = [UInt8](repeating: 0, count: 12)
        for i in 0..<12 {
            transactionID[i] = UInt8.random(in: 0...255)
        }

        // Build 20-byte STUN Binding Request
        let request = buildRequest(transactionID: transactionID)

        return await withCheckedContinuation { continuation in
            let host = NWEndpoint.Host(server)
            let nwPort = NWEndpoint.Port(integerLiteral: port)
            let connection = NWConnection(host: host, port: nwPort, using: .udp)

            let queue = DispatchQueue(label: "com.nvremote.stun-\(UUID().uuidString)")
            var completed = false
            let completionLock = NSLock()

            func complete(result: STUNResult?) {
                completionLock.lock()
                guard !completed else {
                    completionLock.unlock()
                    return
                }
                completed = true
                completionLock.unlock()
                connection.cancel()
                continuation.resume(returning: result)
            }

            // Timeout
            queue.asyncAfter(deadline: .now() + timeoutSec) {
                complete(result: nil)
            }

            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    // Send the binding request
                    connection.send(content: request, completion: .contentProcessed { error in
                        if let error {
                            print("[STUNClient] send error: \(error)")
                            complete(result: nil)
                            return
                        }

                        // Receive the response
                        connection.receiveMessage { content, _, _, error in
                            if let error {
                                print("[STUNClient] receive error: \(error)")
                                complete(result: nil)
                                return
                            }

                            guard let data = content else {
                                complete(result: nil)
                                return
                            }

                            let result = self.parseResponse(data: data, transactionID: transactionID)
                            complete(result: result)
                        }
                    })

                case .failed(let error):
                    print("[STUNClient] connection failed: \(error)")
                    complete(result: nil)

                case .cancelled:
                    break

                default:
                    break
                }
            }

            connection.start(queue: queue)
        }
    }

    // MARK: - Packet Building

    /// Build a 20-byte STUN Binding Request.
    ///
    /// Layout (RFC 5389 section 6):
    /// ```
    ///   [0-1]   Message Type  = 0x0001 (Binding Request)
    ///   [2-3]   Message Length = 0x0000 (no attributes)
    ///   [4-7]   Magic Cookie  = 0x2112A442
    ///   [8-19]  Transaction ID (96 random bits)
    /// ```
    private func buildRequest(transactionID: [UInt8]) -> Data {
        var data = Data(count: 20)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            // Message Type: Binding Request
            base.storeBytes(of: Self.bindingRequest.bigEndian, toByteOffset: 0, as: UInt16.self)
            // Message Length: 0 (no attributes in request)
            base.storeBytes(of: UInt16(0).bigEndian, toByteOffset: 2, as: UInt16.self)
            // Magic Cookie
            base.storeBytes(of: Self.magicCookie.bigEndian, toByteOffset: 4, as: UInt32.self)
            // Transaction ID
            for i in 0..<12 {
                base.storeBytes(of: transactionID[i], toByteOffset: 8 + i, as: UInt8.self)
            }
        }
        return data
    }

    // MARK: - Response Parsing

    /// Parse a STUN Binding Response and extract XOR-MAPPED-ADDRESS.
    private func parseResponse(data: Data, transactionID: [UInt8]) -> STUNResult? {
        guard data.count >= 20 else { return nil }

        return data.withUnsafeBytes { ptr -> STUNResult? in
            let base = ptr.baseAddress!

            // Verify message type is Binding Response
            let msgType = UInt16(bigEndian: base.load(fromByteOffset: 0, as: UInt16.self))
            guard msgType == Self.bindingResponse else { return nil }

            // Verify magic cookie
            let cookie = UInt32(bigEndian: base.load(fromByteOffset: 4, as: UInt32.self))
            guard cookie == Self.magicCookie else { return nil }

            // Verify transaction ID
            for i in 0..<12 {
                let b = base.load(fromByteOffset: 8 + i, as: UInt8.self)
                guard b == transactionID[i] else { return nil }
            }

            let msgLen = Int(UInt16(bigEndian: base.load(fromByteOffset: 2, as: UInt16.self)))
            guard data.count >= 20 + msgLen else { return nil }

            // Parse attributes looking for XOR-MAPPED-ADDRESS
            var offset = 20
            while offset + 4 <= 20 + msgLen {
                let attrType = UInt16(bigEndian: base.load(fromByteOffset: offset, as: UInt16.self))
                let attrLen = Int(UInt16(bigEndian: base.load(fromByteOffset: offset + 2, as: UInt16.self)))

                if attrType == Self.attrXorMappedAddress {
                    return parseXorMappedAddress(base: base, offset: offset + 4, length: attrLen, transactionID: transactionID)
                }

                if attrType == Self.attrMappedAddress {
                    return parseMappedAddress(base: base, offset: offset + 4, length: attrLen)
                }

                // Move to next attribute (4-byte aligned)
                offset += 4 + ((attrLen + 3) & ~3)
            }

            return nil
        }
    }

    /// Parse an XOR-MAPPED-ADDRESS attribute (type 0x0020).
    ///
    /// Layout:
    /// ```
    ///   [0]     reserved (0x00)
    ///   [1]     family (0x01 = IPv4, 0x02 = IPv6)
    ///   [2-3]   X-Port (XORed with top 16 bits of magic cookie)
    ///   [4-7]   X-Address (XORed with magic cookie for IPv4)
    /// ```
    private func parseXorMappedAddress(
        base: UnsafeRawPointer,
        offset: Int,
        length: Int,
        transactionID: [UInt8]
    ) -> STUNResult? {
        guard length >= 8 else { return nil }

        let family = base.load(fromByteOffset: offset + 1, as: UInt8.self)
        guard family == 0x01 else { return nil }  // Only IPv4 for now

        let xPort = UInt16(bigEndian: base.load(fromByteOffset: offset + 2, as: UInt16.self))
        let xAddr = UInt32(bigEndian: base.load(fromByteOffset: offset + 4, as: UInt32.self))

        // XOR with magic cookie
        let magicHi = UInt16(Self.magicCookie >> 16)
        let port = xPort ^ magicHi
        let addr = xAddr ^ Self.magicCookie

        let ip = "\((addr >> 24) & 0xFF).\((addr >> 16) & 0xFF).\((addr >> 8) & 0xFF).\(addr & 0xFF)"

        return STUNResult(publicIP: ip, publicPort: port, success: true)
    }

    /// Parse a MAPPED-ADDRESS attribute (fallback, type 0x0001).
    private func parseMappedAddress(base: UnsafeRawPointer, offset: Int, length: Int) -> STUNResult? {
        guard length >= 8 else { return nil }

        let family = base.load(fromByteOffset: offset + 1, as: UInt8.self)
        guard family == 0x01 else { return nil }

        let port = UInt16(bigEndian: base.load(fromByteOffset: offset + 2, as: UInt16.self))
        let addr = UInt32(bigEndian: base.load(fromByteOffset: offset + 4, as: UInt32.self))

        let ip = "\((addr >> 24) & 0xFF).\((addr >> 16) & 0xFF).\((addr >> 8) & 0xFF).\(addr & 0xFF)"

        return STUNResult(publicIP: ip, publicPort: port, success: true)
    }
}
