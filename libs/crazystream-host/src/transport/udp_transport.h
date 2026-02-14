///////////////////////////////////////////////////////////////////////////////
// udp_transport.h -- UDP video/audio packet transport with DTLS encryption
//
// Fragments encoded video frames into MTU-sized packets, adds framing
// headers, optionally encrypts via DTLS, and sends over a UDP socket.
// Also handles audio packets and NACK-based retransmission from a
// ring-buffer packet cache.
//
// Packet wire format (after DTLS decryption):
//
//   Byte 0:      Packet type (0x01 = video, 0x02 = audio, 0xFC = FEC,
//                              0x10 = QoS feedback, 0x20 = NACK)
//   Byte 1-2:    Sequence number (network byte order)
//   Bytes 3+:    Type-specific header + payload
//
// Video header (after common header):
//   Byte 3-4:    Frame number (uint16)
//   Byte 5:      Fragment index (0-based)
//   Byte 6:      Fragment count (total fragments in this frame)
//   Byte 7:      Flags (bit 0 = keyframe, bit 1 = end-of-frame)
//   Bytes 8+:    Payload (encoded bitstream fragment)
//
// Audio header (after common header):
//   Bytes 3+:    Opus-encoded audio data
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "encode/encoder_interface.h"

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
// Packet types on the wire
// ---------------------------------------------------------------------------
enum PacketType : uint8_t {
    PKT_TYPE_VIDEO         = 0x01,
    PKT_TYPE_AUDIO         = 0x02,
    PKT_TYPE_FEC           = 0xFC,
    PKT_TYPE_QOS_FEEDBACK  = 0x10,
    PKT_TYPE_NACK          = 0x20,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
constexpr size_t   MAX_MTU_SIZE       = 1400;   // Total UDP payload limit
constexpr size_t   COMMON_HEADER_SIZE = 3;       // type(1) + seq(2)
constexpr size_t   VIDEO_HEADER_SIZE  = 5;       // frame_num(2) + frag_idx(1) + frag_cnt(1) + flags(1)
constexpr size_t   MAX_VIDEO_PAYLOAD  = MAX_MTU_SIZE - COMMON_HEADER_SIZE - VIDEO_HEADER_SIZE;
constexpr size_t   PACKET_CACHE_SIZE  = 512;     // Ring buffer size for retransmission

// Video flags
constexpr uint8_t  VIDEO_FLAG_KEYFRAME    = 0x01;
constexpr uint8_t  VIDEO_FLAG_END_OF_FRAME = 0x02;

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
// UdpTransport -- sends video/audio packets over UDP
// ---------------------------------------------------------------------------
class UdpTransport {
public:
    UdpTransport();
    ~UdpTransport();

    /// Initialize with an existing connected UDP socket and peer address.
    bool initialize(int socket_fd, const ::sockaddr_in& peer_addr);

    /// Fragment and send a video frame.
    bool sendVideoFrame(const EncodedPacket& packet, uint16_t frame_number);

    /// Send a single audio packet (already Opus-encoded).
    bool sendAudioPacket(const uint8_t* data, size_t len, uint16_t seq);

    /// Send pre-computed FEC packets for the current frame.
    bool sendFecPackets(const std::vector<std::vector<uint8_t>>& fec_packets,
                        uint16_t frame_number, uint8_t group_id);

    /// Handle NACK: retransmit cached packets by sequence number.
    void onNackReceived(const std::vector<uint16_t>& seqs);

    /// Set the DTLS context for encryption.  If null, packets are sent in
    /// the clear (useful for testing or when WireGuard already encrypts).
    void setDtlsContext(DtlsContext* ctx) { dtls_ = ctx; }

    /// Get the next sequence number (for tracking by bandwidth estimator).
    uint16_t currentSeq() const { return seq_; }

    /// Callback invoked when we receive data on the socket.
    /// The session manager pumps the receive side and calls this.
    using RecvCallback = std::function<void(const uint8_t* data, size_t len)>;
    void setRecvCallback(RecvCallback cb) { recv_cb_ = std::move(cb); }

    /// Receive and dispatch one incoming packet (non-blocking).
    /// Returns true if a packet was received.
    bool receiveOne();

    /// Get total bytes sent.
    uint64_t totalBytesSent() const { return bytes_sent_; }

private:
    /// Send a raw buffer (encrypt if DTLS is set, then UDP sendto).
    bool sendRaw(const uint8_t* data, size_t len);

    /// Cache a packet for NACK retransmission.
    void cachePacket(uint16_t seq, const uint8_t* data, size_t len);

    int                 socket_fd_  = -1;
    ::sockaddr_in       peer_addr_  = {};
    DtlsContext*        dtls_       = nullptr;
    uint16_t            seq_        = 0;
    uint64_t            bytes_sent_ = 0;

    // Ring buffer for NACK retransmission.
    std::array<CachedPacket, PACKET_CACHE_SIZE> cache_;
    std::mutex                                   cache_mutex_;

    RecvCallback        recv_cb_;
};

} // namespace cs::host
