///////////////////////////////////////////////////////////////////////////////
// udp_receiver.cpp -- UDP packet receiver with DTLS decryption
//
// Runs a non-blocking receive loop on a background thread:
//   1. poll/select with 1ms timeout for responsiveness
//   2. recv datagram
//   3. If DTLS enabled: decrypt via OpenSSL memory BIOs
//   4. Identify packet type from header
//   5. Dispatch to registered callback
///////////////////////////////////////////////////////////////////////////////

#include "udp_receiver.h"

#include <cs/common.h>

#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>

#include <cstring>
#include <algorithm>

namespace cs {

// Maximum UDP datagram size we expect to receive
static constexpr size_t MAX_DATAGRAM_SIZE = 65536;

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

UdpReceiver::UdpReceiver() = default;

UdpReceiver::~UdpReceiver() {
    stop();

    if (ssl_) {
        SSL_free(ssl_);
        ssl_ = nullptr;
    }
    if (ssl_ctx_) {
        SSL_CTX_free(ssl_ctx_);
        ssl_ctx_ = nullptr;
    }
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool UdpReceiver::initialize(int socket_fd, const std::string& dtls_fingerprint) {
    std::lock_guard<std::mutex> lock(mutex_);

    socket_fd_ = socket_fd;
    dtls_fingerprint_ = dtls_fingerprint;
    dtls_enabled_ = !dtls_fingerprint.empty();

    if (socket_fd_ < 0) {
        CS_LOG(ERR, "UdpReceiver: invalid socket fd");
        return false;
    }

    // Set socket to non-blocking
    cs_set_nonblocking(socket_fd_);

    if (dtls_enabled_) {
        // Initialize OpenSSL DTLS context
        const SSL_METHOD* method = DTLS_client_method();
        ssl_ctx_ = SSL_CTX_new(method);
        if (!ssl_ctx_) {
            CS_LOG(ERR, "UdpReceiver: SSL_CTX_new failed");
            return false;
        }

        // Set DTLS 1.2 minimum
        SSL_CTX_set_min_proto_version(ssl_ctx_, DTLS1_2_VERSION);

        // We use memory BIOs for I/O (since we do our own UDP send/recv)
        ssl_ = SSL_new(ssl_ctx_);
        if (!ssl_) {
            CS_LOG(ERR, "UdpReceiver: SSL_new failed");
            return false;
        }

        // Create memory BIO pair
        rbio_ = BIO_new(BIO_s_mem());
        wbio_ = BIO_new(BIO_s_mem());
        BIO_set_mem_eof_return(rbio_, -1);
        BIO_set_mem_eof_return(wbio_, -1);

        SSL_set_bio(ssl_, rbio_, wbio_);
        SSL_set_connect_state(ssl_);  // Client mode

        CS_LOG(INFO, "UdpReceiver: DTLS initialized, fingerprint=%s",
               dtls_fingerprint.substr(0, 20).c_str());
    }

    CS_LOG(INFO, "UdpReceiver: initialized on fd=%d dtls=%s",
           socket_fd_, dtls_enabled_ ? "on" : "off");
    return true;
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

bool UdpReceiver::start(PacketCallback cb) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (running_.load()) {
        CS_LOG(WARN, "UdpReceiver: already running");
        return false;
    }

    callback_ = std::move(cb);
    running_.store(true);

    recv_thread_ = std::thread(&UdpReceiver::receiveLoop, this);

    CS_LOG(INFO, "UdpReceiver: started");
    return true;
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

void UdpReceiver::stop() {
    running_.store(false);

    if (recv_thread_.joinable()) {
        recv_thread_.join();
    }

    CS_LOG(INFO, "UdpReceiver: stopped (packets=%llu bytes=%llu)",
           static_cast<unsigned long long>(packets_received_.load()),
           static_cast<unsigned long long>(bytes_received_.load()));
}

// ---------------------------------------------------------------------------
// isRunning
// ---------------------------------------------------------------------------

bool UdpReceiver::isRunning() const {
    return running_.load();
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

uint64_t UdpReceiver::getPacketsReceived() const {
    return packets_received_.load();
}

uint64_t UdpReceiver::getBytesReceived() const {
    return bytes_received_.load();
}

// ---------------------------------------------------------------------------
// receiveLoop
// ---------------------------------------------------------------------------

void UdpReceiver::receiveLoop() {
    CS_LOG(INFO, "UdpReceiver: receive loop started");

    // Perform DTLS handshake if enabled
    if (dtls_enabled_) {
        if (!performDtlsHandshake()) {
            CS_LOG(ERR, "UdpReceiver: DTLS handshake failed");
            running_.store(false);
            return;
        }
        CS_LOG(INFO, "UdpReceiver: DTLS handshake complete");

        // Exchange protocol version tag (CS01) with the host
        if (!exchangeProtocolVersion()) {
            CS_LOG(ERR, "UdpReceiver: protocol version exchange failed");
            running_.store(false);
            return;
        }
    }

    std::vector<uint8_t> recv_buf(MAX_DATAGRAM_SIZE);
    std::vector<uint8_t> plain_buf(MAX_DATAGRAM_SIZE);

    while (running_.load()) {
        // Use select with 1ms timeout for responsiveness
        fd_set read_fds;
        FD_ZERO(&read_fds);
        FD_SET(static_cast<unsigned int>(socket_fd_), &read_fds);

        struct timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 1000;  // 1ms

        int sel = ::select(socket_fd_ + 1, &read_fds, nullptr, nullptr, &tv);
        if (sel <= 0) {
            continue;  // Timeout or error, check running_ flag
        }

        // Receive datagram
        int n = ::recv(socket_fd_, reinterpret_cast<char*>(recv_buf.data()),
                       static_cast<int>(recv_buf.size()), 0);
        if (n <= 0) {
            if (n == 0) {
                CS_LOG(WARN, "UdpReceiver: connection closed");
                break;
            }
            int err = cs_socket_error();
#ifdef _WIN32
            if (err == WSAEWOULDBLOCK || err == WSAECONNRESET) continue;
#else
            if (err == EAGAIN || err == EWOULDBLOCK) continue;
#endif
            CS_LOG(WARN, "UdpReceiver: recv error %d", err);
            continue;
        }

        const uint8_t* payload = recv_buf.data();
        size_t payload_len = static_cast<size_t>(n);

        // DTLS decrypt if enabled
        if (dtls_enabled_) {
            int decrypted = dtlsDecrypt(recv_buf.data(), static_cast<size_t>(n),
                                         plain_buf.data(), plain_buf.size());
            if (decrypted <= 0) {
                continue;  // Decrypt failed or handshake packet
            }
            payload = plain_buf.data();
            payload_len = static_cast<size_t>(decrypted);
        }

        // Update stats
        packets_received_.fetch_add(1);
        bytes_received_.fetch_add(payload_len);

        // Identify and dispatch
        if (payload_len > 0 && callback_) {
            PacketType pkt_type = identifyPacket(payload, payload_len);
            if (static_cast<uint8_t>(pkt_type) != 0) {
                callback_(pkt_type, payload, payload_len);
            }
        }
    }

    CS_LOG(INFO, "UdpReceiver: receive loop exited");
}

// ---------------------------------------------------------------------------
// performDtlsHandshake
// ---------------------------------------------------------------------------

bool UdpReceiver::performDtlsHandshake() {
    if (!ssl_) return false;

    // DTLS handshake with memory BIOs
    // We drive the handshake manually: SSL_do_handshake() generates output
    // which we read from the write BIO and send over UDP. Incoming data from
    // UDP is written to the read BIO.

    std::vector<uint8_t> recv_buf(MAX_DATAGRAM_SIZE);
    std::vector<uint8_t> send_buf(MAX_DATAGRAM_SIZE);

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);

    while (running_.load() && std::chrono::steady_clock::now() < deadline) {
        int ret = SSL_do_handshake(ssl_);
        int ssl_err = SSL_get_error(ssl_, ret);

        // Check if there's data to send from the write BIO
        int pending = BIO_ctrl_pending(wbio_);
        if (pending > 0) {
            int read_from_bio = BIO_read(wbio_, send_buf.data(), static_cast<int>(send_buf.size()));
            if (read_from_bio > 0) {
                ::send(socket_fd_, reinterpret_cast<const char*>(send_buf.data()),
                       read_from_bio, 0);
            }
        }

        if (ret == 1) {
            // Handshake complete
            return true;
        }

        if (ssl_err == SSL_ERROR_WANT_READ) {
            // Need to read from network
            fd_set read_fds;
            FD_ZERO(&read_fds);
            FD_SET(static_cast<unsigned int>(socket_fd_), &read_fds);

            struct timeval tv;
            tv.tv_sec = 1;
            tv.tv_usec = 0;

            int sel = ::select(socket_fd_ + 1, &read_fds, nullptr, nullptr, &tv);
            if (sel > 0) {
                int n = ::recv(socket_fd_, reinterpret_cast<char*>(recv_buf.data()),
                               static_cast<int>(recv_buf.size()), 0);
                if (n > 0) {
                    BIO_write(rbio_, recv_buf.data(), n);
                }
            }
            continue;
        }

        if (ssl_err == SSL_ERROR_WANT_WRITE) {
            continue;
        }

        // Fatal error
        unsigned long err_code = ERR_get_error();
        char err_buf[256];
        ERR_error_string_n(err_code, err_buf, sizeof(err_buf));
        CS_LOG(ERR, "UdpReceiver: DTLS handshake error: %s", err_buf);
        return false;
    }

    CS_LOG(ERR, "UdpReceiver: DTLS handshake timed out");
    return false;
}

// ---------------------------------------------------------------------------
// dtlsDecrypt
// ---------------------------------------------------------------------------

int UdpReceiver::dtlsDecrypt(const uint8_t* ciphertext, size_t len,
                              uint8_t* plaintext, size_t max_plaintext) {
    if (!ssl_) return -1;

    // Write the received datagram into the read BIO
    int written = BIO_write(rbio_, ciphertext, static_cast<int>(len));
    if (written <= 0) {
        return -1;
    }

    // Try to read decrypted data from SSL
    int decrypted = SSL_read(ssl_, plaintext, static_cast<int>(max_plaintext));
    if (decrypted <= 0) {
        int ssl_err = SSL_get_error(ssl_, decrypted);
        if (ssl_err == SSL_ERROR_WANT_READ || ssl_err == SSL_ERROR_WANT_WRITE) {
            // Check if there's handshake data to send
            int pending = BIO_ctrl_pending(wbio_);
            if (pending > 0) {
                std::vector<uint8_t> send_buf(pending);
                int read_from_bio = BIO_read(wbio_, send_buf.data(), pending);
                if (read_from_bio > 0) {
                    ::send(socket_fd_, reinterpret_cast<const char*>(send_buf.data()),
                           read_from_bio, 0);
                }
            }
            return 0;  // Not an error, just need more data
        }
        return -1;
    }

    return decrypted;
}

// ---------------------------------------------------------------------------
// dtlsEncryptAndSend -- encrypt plaintext via DTLS and send over UDP
// ---------------------------------------------------------------------------

bool UdpReceiver::dtlsEncryptAndSend(const uint8_t* plaintext, size_t len) {
    if (!ssl_) return false;

    int written = SSL_write(ssl_, plaintext, static_cast<int>(len));
    if (written <= 0) {
        CS_LOG(WARN, "UdpReceiver: SSL_write failed");
        return false;
    }

    // Read encrypted data from write BIO and send via UDP
    int pending = BIO_ctrl_pending(wbio_);
    if (pending > 0) {
        std::vector<uint8_t> send_buf(pending);
        int read_from_bio = BIO_read(wbio_, send_buf.data(), pending);
        if (read_from_bio > 0) {
            int sent = ::send(socket_fd_,
                              reinterpret_cast<const char*>(send_buf.data()),
                              read_from_bio, 0);
            return sent > 0;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// exchangeProtocolVersion -- verify CS01 tag after DTLS handshake
// ---------------------------------------------------------------------------

bool UdpReceiver::exchangeProtocolVersion() {
    // Host sends CS01 first, viewer receives and verifies, then sends CS01 back.
    std::vector<uint8_t> recv_buf(MAX_DATAGRAM_SIZE);
    uint8_t plain_buf[64];

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);

    while (running_.load() && std::chrono::steady_clock::now() < deadline) {
        fd_set read_fds;
        FD_ZERO(&read_fds);
        FD_SET(static_cast<unsigned int>(socket_fd_), &read_fds);

        struct timeval tv;
        tv.tv_sec = 1;
        tv.tv_usec = 0;

        int sel = ::select(socket_fd_ + 1, &read_fds, nullptr, nullptr, &tv);
        if (sel <= 0) continue;

        int n = ::recv(socket_fd_, reinterpret_cast<char*>(recv_buf.data()),
                       static_cast<int>(recv_buf.size()), 0);
        if (n <= 0) continue;

        // Decrypt the version tag
        int decrypted = dtlsDecrypt(recv_buf.data(), static_cast<size_t>(n),
                                     plain_buf, sizeof(plain_buf));
        if (decrypted == static_cast<int>(PROTOCOL_VERSION_TAG_LEN) &&
            std::memcmp(plain_buf, PROTOCOL_VERSION_TAG, PROTOCOL_VERSION_TAG_LEN) == 0) {
            CS_LOG(INFO, "UdpReceiver: received protocol version CS01 from host");

            // Send our version tag back
            if (!dtlsEncryptAndSend(PROTOCOL_VERSION_TAG, PROTOCOL_VERSION_TAG_LEN)) {
                CS_LOG(ERR, "UdpReceiver: failed to send protocol version response");
                return false;
            }

            CS_LOG(INFO, "UdpReceiver: protocol version verified: CS01");
            return true;
        }

        CS_LOG(WARN, "UdpReceiver: unexpected data during version exchange (len=%d)", decrypted);
    }

    CS_LOG(ERR, "UdpReceiver: protocol version exchange timed out");
    return false;
}

} // namespace cs
