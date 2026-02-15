///////////////////////////////////////////////////////////////////////////////
// udp_transport.h -- UDP video/audio packet transport with DTLS encryption
//
// Sends pre-serialized packets over a UDP socket with optional DTLS 1.2
// encryption.  All wire-format headers are defined in <cs/transport/packet.h>
// and built by the session manager before handing packets to this layer.
//
// Also handles NACK-based retransmission from a ring-buffer packet cache.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cs/transport/packet.h>

#include <cstdint>
#include <vector>
#include <array>
#include <mutex>
#include <functional>

// Platform socket headers -- must be included before any namespace to avoid
// unqualified sockaddr / sockaddr_in being captured by cs::host::.
#ifdef _WIN32
#include <WinSock2.h>
#include <ws2tcpip.h>
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#endif

// Forward declaration for OpenSSL DTLS context.
struct ssl_st;
typedef struct ssl_st SSL;

namespace cs::host {

// ---------------------------------------------------------------------------
// Wire-format constants derived from packet.h
// ---------------------------------------------------------------------------
constexpr size_t   MAX_MTU_SIZE       = 1400;   // Total UDP payload limit
constexpr size_t   MAX_VIDEO_PAYLOAD  = MAX_MTU_SIZE - sizeof(cs::VideoPacketHeader);  // 1384
constexpr size_t   MAX_AUDIO_PAYLOAD  = MAX_MTU_SIZE - sizeof(cs::AudioPacketHeader);  // 1392
constexpr size_t   PACKET_CACHE_SIZE  = 512;     // Ring buffer size for retransmission

// Compile-time checks: ensure packet.h enums have the expected values
static_assert(static_cast<uint8_t>(cs::PacketType::VIDEO) == 0x10,
              "VIDEO packet type must be 0x10");
static_assert(static_cast<uint8_t>(cs::PacketType::AUDIO) == 0x20,
              "AUDIO packet type must be 0x20");
static_assert(static_cast<uint8_t>(cs::PacketType::FEC)   == 0xFC,
              "FEC packet type must be 0xFC");
static_assert(sizeof(cs::VideoPacketHeader) == 16,
              "VideoPacketHeader must be 16 bytes");
static_assert(sizeof(cs::AudioPacketHeader) == 8,
              "AudioPacketHeader must be 8 bytes");

// ---------------------------------------------------------------------------
// CachedPacket -- stored in the ring buffer for NACK retransmission
// ---------------------------------------------------------------------------
struct CachedPacket {
    std::vector<uint8_t> data;
    uint16_t             seq    = 0;
    bool                 valid  = false;
};

// ---------------------------------------------------------------------------
// DtlsContext -- thin wrapper around an OpenSSL DTLS session.
// The session manager sets this up separately; we just use it to encrypt.
// ---------------------------------------------------------------------------
class DtlsContext {
public:
    DtlsContext() = default;
    ~DtlsContext();

    /// Initialize the DTLS context for the server role.
    bool initialize(const std::string& cert_file, const std::string& key_file);

    /// Perform the DTLS handshake (blocking).
    bool handshake(int socket_fd, const ::sockaddr* peer_addr, int peer_addr_len);

    /// Encrypt a plaintext buffer.  Returns encrypted bytes in |out|.
    bool encrypt(const uint8_t* in, size_t in_len, std::vector<uint8_t>& out);

    /// Decrypt an incoming buffer.  Returns plaintext in |out|.
    bool decrypt(const uint8_t* in, size_t in_len, std::vector<uint8_t>& out);

    bool isReady() const { return ready_; }

private:
    SSL*  ssl_   = nullptr;
    void* ctx_   = nullptr;   // SSL_CTX*
    bool  ready_ = false;
};

// ---------------------------------------------------------------------------
// UdpTransport -- sends pre-built packets over UDP
// ---------------------------------------------------------------------------
class UdpTransport {
public:
    UdpTransport();
    ~UdpTransport();

    /// Initialize with an existing connected UDP socket and peer address.
    bool initialize(int socket_fd, const ::sockaddr_in& peer_addr);

    /// Send a pre-serialized packet (header + payload already built by caller).
    /// The packet is cached by |seq| for NACK retransmission, then sent.
    bool sendPacket(const uint8_t* data, size_t len, uint16_t seq);

    /// Convenience: send a pre-serialized packet from a vector.
    bool sendPacket(const std::vector<uint8_t>& pkt, uint16_t seq) {
        return sendPacket(pkt.data(), pkt.size(), seq);
    }

    /// Handle NACK: retransmit cached packets by sequence number.
    void onNackReceived(const std::vector<uint16_t>& seqs);

    /// Set the DTLS context for encryption.  If null, packets are sent in
    /// the clear (useful for testing or when WireGuard already encrypts).
    void setDtlsContext(DtlsContext* ctx) { dtls_ = ctx; }

    /// Get total bytes sent.
    uint64_t totalBytesSent() const { return bytes_sent_; }

    /// Callback invoked when we receive data on the socket.
    /// The session manager pumps the receive side and calls this.
    using RecvCallback = std::function<void(const uint8_t* data, size_t len)>;
    void setRecvCallback(RecvCallback cb) { recv_cb_ = std::move(cb); }

    /// Receive and dispatch one incoming packet (non-blocking).
    /// Returns true if a packet was received.
    bool receiveOne();

private:
    /// Send a raw buffer (encrypt if DTLS is set, then UDP sendto).
    bool sendRaw(const uint8_t* data, size_t len);

    /// Cache a packet for NACK retransmission.
    void cachePacket(uint16_t seq, const uint8_t* data, size_t len);

    int                 socket_fd_  = -1;
    ::sockaddr_in       peer_addr_  = {};
    DtlsContext*        dtls_       = nullptr;
    uint64_t            bytes_sent_ = 0;

    // Ring buffer for NACK retransmission.
    std::array<CachedPacket, PACKET_CACHE_SIZE> cache_;
    std::mutex                                   cache_mutex_;

    RecvCallback        recv_cb_;
};

} // namespace cs::host
