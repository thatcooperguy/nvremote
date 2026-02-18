///////////////////////////////////////////////////////////////////////////////
// turn_client.h -- TURN relay client (RFC 5766)
//
// Implements the TURN protocol for obtaining relay candidates when direct
// P2P connectivity fails. Uses HMAC-SHA1 long-term credential mechanism
// compatible with coturn's --use-auth-secret mode.
//
// Lifecycle:
//   1. Create TurnClient with server address and credentials
//   2. Call allocate() to obtain a relay address
//   3. Call createPermission() for each peer address
//   4. Use the relay socket for sending/receiving relayed data
//   5. Call refresh(0) or destroy to deallocate
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <string>
#include <functional>
#include <atomic>

namespace cs {

/// TURN server configuration passed from the control plane.
struct TurnConfig {
    std::string server;        // hostname or IP
    uint16_t    port = 3478;
    std::string username;      // ephemeral: "<expiry>:<session_id>"
    std::string credential;    // HMAC-SHA1(secret, username) base64
    std::string realm;         // e.g. "nvremote.com"
};

/// Result of a TURN allocation.
struct TurnAllocation {
    std::string relay_ip;
    uint16_t    relay_port = 0;
    std::string mapped_ip;       // server-reflexive address seen by TURN
    uint16_t    mapped_port = 0;
    uint32_t    lifetime = 0;    // allocation lifetime in seconds
    bool        success = false;
    int         socket_fd = -1;  // UDP socket used for this allocation
};

/**
 * TURN relay client.
 *
 * Handles TURN Allocate, CreatePermission, and data relay. Designed to be
 * used as a fallback when direct P2P connectivity checks fail.
 *
 * The credential format follows the REST API for TURN pattern:
 *   username = "<unix_timestamp>:<session_id>"
 *   credential = Base64(HMAC-SHA1(shared_secret, username))
 *
 * This is compatible with coturn's --use-auth-secret mode.
 */
class TurnClient {
public:
    explicit TurnClient(const TurnConfig& config);
    ~TurnClient();

    // Non-copyable
    TurnClient(const TurnClient&) = delete;
    TurnClient& operator=(const TurnClient&) = delete;

    /// Perform a TURN Allocate request and obtain a relay address.
    /// Returns the allocation result including the relay endpoint.
    TurnAllocation allocate();

    /// Create a permission for a peer address so data can be relayed to it.
    /// Must be called after a successful allocate().
    bool createPermission(const std::string& peer_ip);

    /// Refresh the allocation lifetime. Pass 0 to deallocate.
    bool refresh(uint32_t lifetime = 600);

    /// Send data through the relay to a permitted peer.
    bool sendData(const uint8_t* data, size_t len,
                  const std::string& peer_ip, uint16_t peer_port);

    /// Register a callback for data received through the relay.
    void setOnData(std::function<void(const uint8_t*, size_t,
                                       const std::string&, uint16_t)> cb);

    /// Get the relay socket fd (for select/poll integration).
    int getSocket() const { return allocation_.socket_fd; }

    /// Get the relay address.
    std::string getRelayIp() const { return allocation_.relay_ip; }
    uint16_t getRelayPort() const { return allocation_.relay_port; }

    /// Check if allocation is active.
    bool isAllocated() const { return allocated_.load(); }

    /// Deallocate and clean up.
    void close();

private:
    TurnConfig config_;
    TurnAllocation allocation_;
    std::atomic<bool> allocated_{false};
    std::function<void(const uint8_t*, size_t,
                        const std::string&, uint16_t)> on_data_;

    // Internal: build and send TURN messages
    int createSocket();
    bool sendAllocateRequest(int sock, const std::string& nonce = "");
    bool parseAllocateResponse(const uint8_t* data, size_t len);
    bool sendCreatePermission(const std::string& peer_ip);
};

} // namespace cs
