///////////////////////////////////////////////////////////////////////////////
// udp_transport.cpp -- UDP transport implementation
//
// Sends pre-serialized packets over a UDP socket with optional DTLS 1.2
// encryption.  Wire-format headers are built by the session manager using
// the structures from <cs/transport/packet.h>; this layer is format-agnostic
// and simply forwards bytes, caching them for NACK retransmission.
///////////////////////////////////////////////////////////////////////////////

#include "udp_transport.h"
#include <cs/common.h>

#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>

#include <cstring>
#include <algorithm>

namespace cs::host {

// ===========================================================================
// DtlsContext implementation
// ===========================================================================

DtlsContext::~DtlsContext() {
    if (ssl_) {
        SSL_shutdown(static_cast<SSL*>(ssl_));
        SSL_free(static_cast<SSL*>(ssl_));
        ssl_ = nullptr;
    }
    if (ctx_) {
        SSL_CTX_free(static_cast<SSL_CTX*>(ctx_));
        ctx_ = nullptr;
    }
}

bool DtlsContext::initialize(const std::string& cert_file, const std::string& key_file) {
    // Create DTLS 1.2 context (server role).
    SSL_CTX* sslCtx = SSL_CTX_new(DTLS_server_method());
    if (!sslCtx) {
        CS_LOG(ERR, "DTLS: SSL_CTX_new failed");
        return false;
    }
    ctx_ = sslCtx;

    // Set minimum protocol version to DTLS 1.2.
    SSL_CTX_set_min_proto_version(sslCtx, DTLS1_2_VERSION);

    // Load certificate.
    if (SSL_CTX_use_certificate_file(sslCtx, cert_file.c_str(), SSL_FILETYPE_PEM) != 1) {
        CS_LOG(ERR, "DTLS: failed to load certificate from %s", cert_file.c_str());
        return false;
    }

    // Load private key.
    if (SSL_CTX_use_PrivateKey_file(sslCtx, key_file.c_str(), SSL_FILETYPE_PEM) != 1) {
        CS_LOG(ERR, "DTLS: failed to load private key from %s", key_file.c_str());
        return false;
    }

    // Verify key matches cert.
    if (SSL_CTX_check_private_key(sslCtx) != 1) {
        CS_LOG(ERR, "DTLS: certificate/key mismatch");
        return false;
    }

    CS_LOG(INFO, "DTLS: context initialized with cert=%s", cert_file.c_str());
    return true;
}

bool DtlsContext::handshake(int socket_fd, const ::sockaddr* peer_addr, int peer_addr_len) {
    SSL_CTX* sslCtx = static_cast<SSL_CTX*>(ctx_);
    if (!sslCtx) return false;

    // Create BIO pair for DTLS over our existing UDP socket.
    BIO* bio = BIO_new_dgram(static_cast<int>(socket_fd), BIO_NOCLOSE);
    if (!bio) {
        CS_LOG(ERR, "DTLS: BIO_new_dgram failed");
        return false;
    }

    // Connect the BIO to the peer.
    BIO_ctrl(bio, BIO_CTRL_DGRAM_SET_CONNECTED, 0, const_cast<::sockaddr*>(peer_addr));

    // Set read timeout for handshake.
    struct timeval tv;
    tv.tv_sec  = 5;
    tv.tv_usec = 0;
    BIO_ctrl(bio, BIO_CTRL_DGRAM_SET_RECV_TIMEOUT, 0, &tv);

    ssl_ = SSL_new(sslCtx);
    if (!ssl_) {
        CS_LOG(ERR, "DTLS: SSL_new failed");
        BIO_free(bio);
        return false;
    }

    SSL_set_bio(static_cast<SSL*>(ssl_), bio, bio);

    // Server-side accept.
    int ret = SSL_accept(static_cast<SSL*>(ssl_));
    if (ret != 1) {
        int err = SSL_get_error(static_cast<SSL*>(ssl_), ret);
        CS_LOG(ERR, "DTLS: handshake failed (SSL error=%d)", err);
        SSL_free(static_cast<SSL*>(ssl_));
        ssl_ = nullptr;
        return false;
    }

    ready_ = true;
    CS_LOG(INFO, "DTLS: handshake completed successfully");
    return true;
}

bool DtlsContext::encrypt(const uint8_t* in, size_t in_len, std::vector<uint8_t>& out) {
    if (!ready_ || !ssl_) return false;

    int written = SSL_write(static_cast<SSL*>(ssl_), in, static_cast<int>(in_len));
    if (written <= 0) {
        CS_LOG(WARN, "DTLS: SSL_write failed");
        return false;
    }

    // For DTLS, SSL_write sends the encrypted record directly on the socket.
    // We use this path when the transport manages its own socket.
    // The 'out' parameter is not used in this mode -- the data is already sent.
    out.clear();
    return true;
}

bool DtlsContext::decrypt(const uint8_t* in, size_t in_len, std::vector<uint8_t>& out) {
    if (!ready_ || !ssl_) return false;

    out.resize(in_len + 256);
    int read_bytes = SSL_read(static_cast<SSL*>(ssl_), out.data(), static_cast<int>(out.size()));
    if (read_bytes <= 0) {
        CS_LOG(WARN, "DTLS: SSL_read failed");
        out.clear();
        return false;
    }

    out.resize(static_cast<size_t>(read_bytes));
    return true;
}

// ===========================================================================
// UdpTransport implementation
// ===========================================================================

UdpTransport::UdpTransport() = default;

UdpTransport::~UdpTransport() {
    // We do not close socket_fd_ because we don't own it.
}

// ---------------------------------------------------------------------------
// initialize -- bind to an existing connected socket
// ---------------------------------------------------------------------------

bool UdpTransport::initialize(int socket_fd, const ::sockaddr_in& peer_addr) {
    socket_fd_ = socket_fd;
    peer_addr_ = peer_addr;
    bytes_sent_ = 0;

    // Clear the packet cache.
    for (auto& p : cache_) {
        p.valid = false;
        p.data.clear();
    }

    CS_LOG(INFO, "UDP transport: initialized (fd=%d, peer=%s:%d)",
           socket_fd,
           inet_ntoa(peer_addr_.sin_addr),
           ntohs(peer_addr_.sin_port));
    return true;
}

// ---------------------------------------------------------------------------
// sendPacket -- send a pre-serialized packet and cache for NACK retransmission
// ---------------------------------------------------------------------------

bool UdpTransport::sendPacket(const uint8_t* data, size_t len, uint16_t seq) {
    if (socket_fd_ < 0) return false;
    if (!data || len == 0) return false;

    // Cache for potential NACK retransmission.
    cachePacket(seq, data, len);

    // Send.
    if (!sendRaw(data, len)) {
        CS_LOG(WARN, "UDP: failed to send packet (seq=%u, len=%zu)", seq, len);
        return false;
    }

    return true;
}

// ---------------------------------------------------------------------------
// onNackReceived -- retransmit packets by sequence number
// ---------------------------------------------------------------------------

void UdpTransport::onNackReceived(const std::vector<uint16_t>& seqs) {
    std::lock_guard<std::mutex> lock(cache_mutex_);

    for (uint16_t seq : seqs) {
        size_t idx = seq % PACKET_CACHE_SIZE;
        auto& cached = cache_[idx];

        if (cached.valid && cached.seq == seq) {
            if (!sendRaw(cached.data.data(), cached.data.size())) {
                CS_LOG(WARN, "UDP: NACK retransmit failed for seq=%u", seq);
            } else {
                CS_LOG(TRACE, "UDP: retransmitted seq=%u (%zu bytes)", seq, cached.data.size());
            }
        } else {
            CS_LOG(DEBUG, "UDP: NACK for seq=%u but packet not in cache", seq);
        }
    }
}

// ---------------------------------------------------------------------------
// receiveOne -- receive and dispatch one incoming packet (non-blocking)
// ---------------------------------------------------------------------------

bool UdpTransport::receiveOne() {
    if (socket_fd_ < 0) return false;

    uint8_t buf[2048];
    ::sockaddr_in from = {};
    socklen_t fromLen = sizeof(from);

    int n = ::recvfrom(socket_fd_, reinterpret_cast<char*>(buf), sizeof(buf), 0,
                       reinterpret_cast<::sockaddr*>(&from), &fromLen);
    if (n <= 0) return false;

    // If DTLS is active, decrypt first.
    if (dtls_ && dtls_->isReady()) {
        std::vector<uint8_t> plain;
        if (!dtls_->decrypt(buf, static_cast<size_t>(n), plain)) {
            CS_LOG(DEBUG, "UDP: DTLS decrypt failed on incoming packet");
            return false;
        }
        if (recv_cb_) recv_cb_(plain.data(), plain.size());
    } else {
        if (recv_cb_) recv_cb_(buf, static_cast<size_t>(n));
    }

    return true;
}

// ---------------------------------------------------------------------------
// sendRaw -- encrypt (if DTLS) and send on the UDP socket
// ---------------------------------------------------------------------------

bool UdpTransport::sendRaw(const uint8_t* data, size_t len) {
    int sent;

    if (dtls_ && dtls_->isReady()) {
        // DTLS handles encryption and sending via the BIO.
        std::vector<uint8_t> dummy;
        if (!dtls_->encrypt(data, len, dummy)) {
            return false;
        }
        // Data was already sent by SSL_write via the BIO.
        bytes_sent_ += len;
        return true;
    }

    // Plaintext send.
    sent = ::sendto(socket_fd_, reinterpret_cast<const char*>(data), static_cast<int>(len), 0,
                    reinterpret_cast<const ::sockaddr*>(&peer_addr_), sizeof(peer_addr_));
    if (sent < 0) {
        CS_LOG(DEBUG, "UDP: sendto failed (error=%d)", cs_socket_error());
        return false;
    }

    bytes_sent_ += static_cast<uint64_t>(sent);
    return true;
}

// ---------------------------------------------------------------------------
// cachePacket -- store packet in ring buffer for NACK retransmission
// ---------------------------------------------------------------------------

void UdpTransport::cachePacket(uint16_t seq, const uint8_t* data, size_t len) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    size_t idx = seq % PACKET_CACHE_SIZE;
    auto& entry = cache_[idx];
    entry.seq = seq;
    entry.data.assign(data, data + len);
    entry.valid = true;
}

} // namespace cs::host
