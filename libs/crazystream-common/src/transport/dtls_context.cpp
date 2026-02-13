///////////////////////////////////////////////////////////////////////////////
// dtls_context.cpp -- DTLS 1.2 wrapper implementation
///////////////////////////////////////////////////////////////////////////////

#include "cs/transport/dtls_context.h"
#include "cs/common.h"

#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/x509.h>
#include <openssl/evp.h>
#include <openssl/ec.h>
#include <openssl/bn.h>
#include <openssl/bio.h>
#include <openssl/rand.h>

#include <cstring>
#include <chrono>
#include <thread>

namespace cs {

// ---------------------------------------------------------------------------
// OpenSSL one-time initializer (safe for C++11 and later)
// ---------------------------------------------------------------------------
static void ensureOpenSslInit() {
    static bool done = [] {
        // OpenSSL >= 1.1.0 auto-inits, but calling explicitly is harmless.
        OPENSSL_init_ssl(OPENSSL_INIT_LOAD_SSL_STRINGS |
                         OPENSSL_INIT_LOAD_CRYPTO_STRINGS, nullptr);
        return true;
    }();
    (void)done;
}

// ---------------------------------------------------------------------------
// Helper: log the OpenSSL error queue
// ---------------------------------------------------------------------------
static void logSslErrors(const char* context) {
    unsigned long err;
    while ((err = ERR_get_error()) != 0) {
        char buf[256];
        ERR_error_string_n(err, buf, sizeof(buf));
        CS_LOG(ERR, "OpenSSL [%s]: %s", context, buf);
    }
}

// ---------------------------------------------------------------------------
// DtlsContext constructor
// ---------------------------------------------------------------------------
DtlsContext::DtlsContext(bool is_server)
    : is_server_(is_server)
{
    ensureOpenSslInit();
    std::memset(&peer_addr_, 0, sizeof(peer_addr_));

    // --- Generate EC key + self-signed cert ---
    key_  = generateKey();
    cert_ = generateCert(key_);
    if (!key_ || !cert_) {
        CS_LOG(ERR, "Failed to generate DTLS key/cert");
        return;
    }

    // --- Create SSL_CTX ---
    const SSL_METHOD* method = is_server_ ? DTLS_server_method()
                                          : DTLS_client_method();
    ctx_ = SSL_CTX_new(method);
    if (!ctx_) {
        logSslErrors("SSL_CTX_new");
        return;
    }

    // Restrict to DTLS 1.2
    SSL_CTX_set_min_proto_version(ctx_, DTLS1_2_VERSION);
    SSL_CTX_set_max_proto_version(ctx_, DTLS1_2_VERSION);

    // Set cipher
    if (SSL_CTX_set_cipher_list(ctx_, "ECDHE-ECDSA-AES128-GCM-SHA256") != 1) {
        logSslErrors("set_cipher_list");
    }

    // Load our key + cert into the context
    if (SSL_CTX_use_certificate(ctx_, cert_) != 1) {
        logSslErrors("use_certificate");
    }
    if (SSL_CTX_use_PrivateKey(ctx_, key_) != 1) {
        logSslErrors("use_PrivateKey");
    }
    if (SSL_CTX_check_private_key(ctx_) != 1) {
        logSslErrors("check_private_key");
    }

    // We verify the remote fingerprint out-of-band via signaling, so we
    // accept any peer certificate here.
    SSL_CTX_set_verify(ctx_, SSL_VERIFY_NONE, nullptr);

    // --- Create SSL object ---
    ssl_ = SSL_new(ctx_);
    if (!ssl_) {
        logSslErrors("SSL_new");
        return;
    }

    // --- Create BIO pair ---
    // bio_internal_ is "owned" by the SSL object; bio_network_ is our handle
    // to push/pull raw bytes that correspond to UDP datagrams.
    if (BIO_new_bio_pair(&bio_internal_, 0, &bio_network_, 0) != 1) {
        logSslErrors("BIO_new_bio_pair");
        return;
    }
    SSL_set_bio(ssl_, bio_internal_, bio_internal_);
    // After SSL_set_bio, the SSL object owns bio_internal_; we must not free
    // it ourselves.  We keep bio_network_ to shuttle data.

    // Enable non-blocking mode on the BIO pair
    BIO_set_nbio(bio_internal_, 1);
    BIO_set_nbio(bio_network_, 1);

    // DTLS needs MTU hints
    SSL_set_options(ssl_, SSL_OP_NO_QUERY_MTU);
    DTLS_set_link_mtu(ssl_, 1400);

    CS_LOG(DEBUG, "DtlsContext created (is_server=%d)", (int)is_server_);
}

// ---------------------------------------------------------------------------
// Destructor
// ---------------------------------------------------------------------------
DtlsContext::~DtlsContext() {
    shutdown();
    // SSL_free also frees bio_internal_ (set via SSL_set_bio)
    if (ssl_)  { SSL_free(ssl_);   ssl_ = nullptr; }
    if (ctx_)  { SSL_CTX_free(ctx_); ctx_ = nullptr; }
    if (bio_network_) { BIO_free(bio_network_); bio_network_ = nullptr; }
    if (cert_) { X509_free(cert_);  cert_ = nullptr; }
    if (key_)  { EVP_PKEY_free(key_); key_ = nullptr; }
}

// ---------------------------------------------------------------------------
// Move operations
// ---------------------------------------------------------------------------
DtlsContext::DtlsContext(DtlsContext&& other) noexcept {
    *this = std::move(other);
}

DtlsContext& DtlsContext::operator=(DtlsContext&& other) noexcept {
    if (this != &other) {
        // Clean up our own resources first
        if (ssl_)  SSL_free(ssl_);
        if (ctx_)  SSL_CTX_free(ctx_);
        if (bio_network_) BIO_free(bio_network_);
        if (cert_) X509_free(cert_);
        if (key_)  EVP_PKEY_free(key_);

        is_server_      = other.is_server_;
        established_    = other.established_;
        ctx_            = other.ctx_;
        ssl_            = other.ssl_;
        key_            = other.key_;
        cert_           = other.cert_;
        bio_internal_   = other.bio_internal_;
        bio_network_    = other.bio_network_;
        udp_socket_     = other.udp_socket_;
        peer_addr_      = other.peer_addr_;
        peer_addr_len_  = other.peer_addr_len_;

        other.ctx_          = nullptr;
        other.ssl_          = nullptr;
        other.key_          = nullptr;
        other.cert_         = nullptr;
        other.bio_internal_ = nullptr;
        other.bio_network_  = nullptr;
        other.established_  = false;
    }
    return *this;
}

// ---------------------------------------------------------------------------
// getFingerprint -- SHA-256 of the DER-encoded certificate
// ---------------------------------------------------------------------------
std::string DtlsContext::getFingerprint() const {
    if (!cert_) return {};

    unsigned char md[EVP_MAX_MD_SIZE];
    unsigned int  mdLen = 0;
    if (X509_digest(cert_, EVP_sha256(), md, &mdLen) != 1) {
        logSslErrors("X509_digest");
        return {};
    }

    // Format as colon-separated hex
    std::string result;
    result.reserve(mdLen * 3);
    for (unsigned int i = 0; i < mdLen; ++i) {
        char hex[4];
        std::snprintf(hex, sizeof(hex), "%02X", md[i]);
        if (i > 0) result += ':';
        result += hex;
    }
    return result;
}

// ---------------------------------------------------------------------------
// handshake
// ---------------------------------------------------------------------------
bool DtlsContext::handshake(int udp_socket, const sockaddr* peer, int peer_len) {
    if (!ssl_ || !bio_network_) {
        CS_LOG(ERR, "DtlsContext not properly initialized");
        return false;
    }

    udp_socket_ = udp_socket;
    std::memcpy(&peer_addr_, peer, peer_len);
    peer_addr_len_ = peer_len;

    // Put socket into non-blocking mode so we can use select() with timeout
    cs_set_nonblocking(udp_socket_);

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);

    // Drive the handshake loop
    for (;;) {
        int ret;
        if (is_server_) {
            ret = SSL_accept(ssl_);
        } else {
            ret = SSL_connect(ssl_);
        }

        if (ret == 1) {
            established_ = true;
            CS_LOG(INFO, "DTLS handshake completed (is_server=%d)", (int)is_server_);
            return true;
        }

        int err = SSL_get_error(ssl_, ret);
        if (err != SSL_ERROR_WANT_READ && err != SSL_ERROR_WANT_WRITE) {
            logSslErrors("handshake");
            CS_LOG(ERR, "DTLS handshake failed, SSL_get_error=%d", err);
            return false;
        }

        // Flush any outgoing data that OpenSSL generated (e.g. ClientHello)
        if (!flushBioToSocket()) {
            CS_LOG(ERR, "Failed to flush BIO during handshake");
            return false;
        }

        // Check timeout
        if (std::chrono::steady_clock::now() >= deadline) {
            CS_LOG(ERR, "DTLS handshake timed out");
            return false;
        }

        // Wait for incoming UDP data using select()
        fd_set rfds;
        FD_ZERO(&rfds);
        FD_SET(static_cast<unsigned int>(udp_socket_), &rfds);

        struct timeval tv;
        tv.tv_sec  = 0;
        tv.tv_usec = 100'000;  // 100 ms poll

        int sel = ::select(udp_socket_ + 1, &rfds, nullptr, nullptr, &tv);
        if (sel > 0) {
            if (!feedBioFromSocket()) {
                CS_LOG(WARN, "feedBioFromSocket failed during handshake");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// encrypt -- write application data through the SSL object
// ---------------------------------------------------------------------------
bool DtlsContext::encrypt(const uint8_t* data, size_t len,
                          uint8_t* out, size_t* out_len) {
    if (!established_ || !ssl_) return false;

    int written = SSL_write(ssl_, data, static_cast<int>(len));
    if (written <= 0) {
        logSslErrors("SSL_write");
        return false;
    }

    // The encrypted record is now in bio_network_; read it out.
    int pending = BIO_ctrl_pending(bio_network_);
    if (pending <= 0) return false;

    int rd = BIO_read(bio_network_, out, pending);
    if (rd <= 0) return false;

    *out_len = static_cast<size_t>(rd);
    return true;
}

// ---------------------------------------------------------------------------
// decrypt -- feed a received DTLS record into the SSL object and read
//            the plaintext back out
// ---------------------------------------------------------------------------
bool DtlsContext::decrypt(const uint8_t* data, size_t len,
                          uint8_t* out, size_t* out_len) {
    if (!established_ || !ssl_) return false;

    // Push the raw record into the network BIO
    int wr = BIO_write(bio_network_, data, static_cast<int>(len));
    if (wr <= 0) {
        logSslErrors("BIO_write(decrypt)");
        return false;
    }

    // Read decrypted application data out of the SSL object
    int rd = SSL_read(ssl_, out, static_cast<int>(len));
    if (rd <= 0) {
        int err = SSL_get_error(ssl_, rd);
        if (err == SSL_ERROR_WANT_READ) {
            // Not a fatal error -- the record might be a handshake message
            // or an alert, not application data.
            *out_len = 0;
            return true;
        }
        logSslErrors("SSL_read(decrypt)");
        return false;
    }

    *out_len = static_cast<size_t>(rd);
    return true;
}

// ---------------------------------------------------------------------------
// shutdown
// ---------------------------------------------------------------------------
void DtlsContext::shutdown() {
    if (ssl_ && established_) {
        SSL_shutdown(ssl_);
        flushBioToSocket();
        established_ = false;
        CS_LOG(DEBUG, "DTLS shutdown sent");
    }
}

// ---------------------------------------------------------------------------
// generateKey -- EC P-256
// ---------------------------------------------------------------------------
EVP_PKEY* DtlsContext::generateKey() {
    EVP_PKEY_CTX* pctx = EVP_PKEY_CTX_new_id(EVP_PKEY_EC, nullptr);
    if (!pctx) { logSslErrors("EVP_PKEY_CTX_new_id"); return nullptr; }

    EVP_PKEY* pkey = nullptr;
    bool ok = (EVP_PKEY_keygen_init(pctx) == 1) &&
              (EVP_PKEY_CTX_set_ec_paramgen_curve_nid(pctx, NID_X9_62_prime256v1) == 1) &&
              (EVP_PKEY_keygen(pctx, &pkey) == 1);

    EVP_PKEY_CTX_free(pctx);
    if (!ok) {
        logSslErrors("generateKey");
        if (pkey) EVP_PKEY_free(pkey);
        return nullptr;
    }
    return pkey;
}

// ---------------------------------------------------------------------------
// generateCert -- self-signed X509, valid for 24 hours
// ---------------------------------------------------------------------------
X509* DtlsContext::generateCert(EVP_PKEY* key) {
    if (!key) return nullptr;

    X509* x = X509_new();
    if (!x) return nullptr;

    // Serial number: random 64-bit value
    ASN1_INTEGER_set(X509_get_serialNumber(x),
                     static_cast<long>(std::chrono::steady_clock::now()
                         .time_since_epoch().count() & 0x7FFFFFFF));

    // Validity: now to +24h
    X509_gmtime_adj(X509_getm_notBefore(x), 0);
    X509_gmtime_adj(X509_getm_notAfter(x), 86400);

    X509_set_pubkey(x, key);

    // Minimal subject
    X509_NAME* name = X509_get_subject_name(x);
    X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC,
                               reinterpret_cast<const unsigned char*>("CrazyStream"),
                               -1, -1, 0);
    X509_set_issuer_name(x, name);  // self-signed

    // Sign with SHA-256
    if (X509_sign(x, key, EVP_sha256()) == 0) {
        logSslErrors("X509_sign");
        X509_free(x);
        return nullptr;
    }
    return x;
}

// ---------------------------------------------------------------------------
// flushBioToSocket -- send any pending BIO data out on the real UDP socket
// ---------------------------------------------------------------------------
bool DtlsContext::flushBioToSocket() {
    uint8_t buf[2048];
    for (;;) {
        int n = BIO_read(bio_network_, buf, sizeof(buf));
        if (n <= 0) break;

        int sent = ::sendto(udp_socket_, reinterpret_cast<const char*>(buf), n, 0,
                            reinterpret_cast<const sockaddr*>(&peer_addr_),
                            peer_addr_len_);
        if (sent < 0) {
            CS_LOG(WARN, "sendto failed in flushBioToSocket: %d", cs_socket_error());
            return false;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// feedBioFromSocket -- read one UDP datagram and push it into the network BIO
// ---------------------------------------------------------------------------
bool DtlsContext::feedBioFromSocket() {
    uint8_t buf[2048];
    struct sockaddr_storage from;
    socklen_t fromLen = sizeof(from);

    int n = ::recvfrom(udp_socket_, reinterpret_cast<char*>(buf), sizeof(buf), 0,
                       reinterpret_cast<sockaddr*>(&from), &fromLen);
    if (n <= 0) return false;

    int wr = BIO_write(bio_network_, buf, n);
    if (wr <= 0) {
        logSslErrors("BIO_write(feedBio)");
        return false;
    }
    return true;
}

} // namespace cs
