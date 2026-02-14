///////////////////////////////////////////////////////////////////////////////
// udp_receiver.h -- UDP packet receiver with DTLS decryption
//
// Runs a background receive loop that:
//   1. Reads datagrams from the connected UDP socket
//   2. Decrypts via DTLS (OpenSSL)
//   3. Identifies packet type from the header
//   4. Dispatches to registered callbacks
//
// The socket is assumed to already be connected (by the ICE layer).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <thread>
#include <atomic>
#include <mutex>

#include <cs/transport/packet.h>

// Forward-declare OpenSSL types
typedef struct ssl_st SSL;
typedef struct ssl_ctx_st SSL_CTX;
typedef struct bio_st BIO;

namespace cs {

/// Callback invoked for each received and decrypted packet.
/// Parameters: packet type, pointer to payload after header, length.
using PacketCallback = std::function<void(PacketType type, const uint8_t* data, size_t len)>;

class UdpReceiver {
public:
    UdpReceiver();
    ~UdpReceiver();

    // Non-copyable
    UdpReceiver(const UdpReceiver&) = delete;
    UdpReceiver& operator=(const UdpReceiver&) = delete;

    /// Initialize with a pre-connected socket and optional DTLS context.
    /// If dtls_fingerprint is empty, DTLS is disabled (plaintext mode for testing).
    bool initialize(int socket_fd, const std::string& dtls_fingerprint = "");

    /// Start the receive loop on a background thread.
    bool start(PacketCallback cb);

    /// Stop the receive loop and join the thread.
    void stop();

    /// Returns true if the receiver is running.
    bool isRunning() const;

    // --- Statistics ---
    uint64_t getPacketsReceived() const;
    uint64_t getBytesReceived() const;

private:
    /// Main receive loop running on the background thread.
    void receiveLoop();

    /// Perform DTLS handshake (client side).
    bool performDtlsHandshake();

    /// Decrypt a single datagram. Returns the plaintext length, or -1 on error.
    int dtlsDecrypt(const uint8_t* ciphertext, size_t len,
                    uint8_t* plaintext, size_t max_plaintext);

    // Socket
    int socket_fd_ = -1;

    // DTLS
    SSL_CTX* ssl_ctx_ = nullptr;
    SSL*     ssl_     = nullptr;
    bool     dtls_enabled_ = false;
    std::string dtls_fingerprint_;

    // BIO memory buffers for DTLS (we do our own I/O)
    ::BIO* rbio_ = nullptr;  // read BIO: network -> OpenSSL
    ::BIO* wbio_ = nullptr;  // write BIO: OpenSSL -> network

    // Callback
    PacketCallback callback_;

    // Thread
    std::thread recv_thread_;
    std::atomic<bool> running_{false};

    // Stats
    std::atomic<uint64_t> packets_received_{0};
    std::atomic<uint64_t> bytes_received_{0};

    std::mutex mutex_;
};

} // namespace cs
