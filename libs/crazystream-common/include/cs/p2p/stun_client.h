///////////////////////////////////////////////////////////////////////////////
// stun_client.h -- Minimal STUN Binding Request client (RFC 5389)
//
// Sends a STUN Binding Request to a public STUN server and parses the
// XOR-MAPPED-ADDRESS attribute from the response to discover the public
// IP:port that corresponds to a local UDP socket.
//
// Thread-safe: multiple threads may call discoverPublicEndpoint() on
// different StunClient instances (or even the same one, since the method
// is effectively stateless -- it only touches the provided socket).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <string>

namespace cs {

/// Result of a STUN binding discovery.
struct StunResult {
    std::string public_ip;
    uint16_t    public_port = 0;
    bool        success     = false;
};

class StunClient {
public:
    StunClient()  = default;
    ~StunClient() = default;

    /// Discover the public (server-reflexive) endpoint of \p local_socket
    /// by sending a STUN Binding Request to \p stun_server : \p stun_port.
    ///
    /// The socket must already be bound to a local address.  The method
    /// retries up to 3 times with a 500 ms timeout per attempt.
    ///
    /// Returns a StunResult with success=true and the reflexive address on
    /// success, or success=false on failure.
    StunResult discoverPublicEndpoint(const std::string& stun_server,
                                      uint16_t stun_port,
                                      int local_socket) const;

private:
    /// Build a 20-byte STUN Binding Request.
    /// Layout (RFC 5389 section 6):
    ///   [0-1]   Message Type  = 0x0001 (Binding Request)
    ///   [2-3]   Message Length = 0x0000 (no attributes)
    ///   [4-7]   Magic Cookie  = 0x2112A442
    ///   [8-19]  Transaction ID (96 random bits)
    static void buildBindingRequest(uint8_t out[20], uint8_t txnId[12]);

    /// Parse a STUN Binding Success Response and extract the
    /// XOR-MAPPED-ADDRESS (type 0x0020).
    /// \p txnId is the 12-byte transaction ID we sent, used to verify the
    /// response and XOR the address.
    static bool parseBindingResponse(const uint8_t* data, size_t len,
                                     const uint8_t txnId[12],
                                     std::string& ip, uint16_t& port);
};

} // namespace cs
