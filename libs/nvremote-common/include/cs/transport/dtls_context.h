///////////////////////////////////////////////////////////////////////////////
// dtls_context.h -- DTLS 1.2 wrapper for NVRemote
//
// Wraps OpenSSL's DTLS implementation to encrypt / decrypt datagrams over
// a UDP socket.  Each DtlsContext holds:
//   - A self-signed EC (prime256v1) certificate + private key generated at
//     construction time.
//   - An OpenSSL SSL_CTX and SSL object configured for DTLS 1.2 with the
//     cipher TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256.
//   - A BIO pair that bridges OpenSSL's record-layer I/O to the actual
//     UDP socket in a non-blocking fashion.
//
// Typical flow:
//   1. Construct DtlsContext(is_server).
//   2. Exchange getFingerprint() with the remote peer via signaling.
//   3. Call handshake(udp_socket, peer_addr) -- blocks until done or timeout.
//   4. Use encrypt() / decrypt() for application data.
//   5. Call shutdown() when finished.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <string>
#include <memory>

// Platform socket headers -- must be included before any namespace to avoid
// unqualified sockaddr / sockaddr_storage being captured by cs::.
#ifdef _WIN32
#include <WinSock2.h>
#include <ws2tcpip.h>
#else
#include <sys/socket.h>
#include <netinet/in.h>
#endif

// Forward-declare OpenSSL types so consumers don't need OpenSSL headers.
typedef struct ssl_st      SSL;
typedef struct ssl_ctx_st  SSL_CTX;
typedef struct x509_st     X509;
typedef struct evp_pkey_st EVP_PKEY;
typedef struct bio_st      BIO;

namespace cs {

class DtlsContext {
public:
    /// Create a DTLS context.  If \p is_server is true the context will
    /// wait for a ClientHello; otherwise it will initiate the handshake.
    explicit DtlsContext(bool is_server);
    ~DtlsContext();

    // Non-copyable, movable
    DtlsContext(const DtlsContext&) = delete;
    DtlsContext& operator=(const DtlsContext&) = delete;
    DtlsContext(DtlsContext&& other) noexcept;
    DtlsContext& operator=(DtlsContext&& other) noexcept;

    /// SHA-256 fingerprint of the local certificate, hex-encoded with colons
    /// (e.g. "AB:CD:EF:...").  Exchange this via signaling so each side can
    /// verify the peer.
    std::string getFingerprint() const;

    /// Perform the DTLS handshake over the given UDP socket with the remote
    /// peer at \p peer.  Blocks until the handshake completes or a 5-second
    /// timeout elapses.  Returns true on success.
    bool handshake(int udp_socket, const ::sockaddr* peer, int peer_len);

    /// Encrypt application data into a DTLS record.
    /// \p out must be at least \p len + 256 bytes.
    /// On success, \p out_len is set to the number of bytes written.
    bool encrypt(const uint8_t* data, size_t len,
                 uint8_t* out, size_t* out_len);

    /// Decrypt a received DTLS record into application data.
    /// \p out must be at least \p len bytes.
    bool decrypt(const uint8_t* data, size_t len,
                 uint8_t* out, size_t* out_len);

    /// Send a DTLS shutdown alert and free resources.
    void shutdown();

    /// True after a successful handshake and before shutdown.
    bool isEstablished() const { return established_; }

private:
    /// Generate an EC P-256 key pair.
    static EVP_PKEY* generateKey();

    /// Create a self-signed X509 certificate from \p key.
    static X509* generateCert(EVP_PKEY* key);

    /// Flush any pending data from the network BIO out to the real UDP socket.
    bool flushBioToSocket();

    /// Read incoming UDP data into the network BIO so OpenSSL can process it.
    bool feedBioFromSocket();

    bool        is_server_   = false;
    bool        established_ = false;

    SSL_CTX*    ctx_         = nullptr;
    SSL*        ssl_         = nullptr;
    EVP_PKEY*   key_         = nullptr;
    X509*       cert_        = nullptr;

    // BIO pair: ssl_ writes/reads through bio_internal_, and we shuttle
    // bytes between bio_network_ and the real UDP socket.
    BIO*        bio_internal_ = nullptr;
    BIO*        bio_network_  = nullptr;

    int         udp_socket_  = -1;
    ::sockaddr_storage peer_addr_;
    int         peer_addr_len_ = 0;
};

} // namespace cs
