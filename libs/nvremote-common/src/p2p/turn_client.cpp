///////////////////////////////////////////////////////////////////////////////
// turn_client.cpp -- TURN relay client (RFC 5766)
//
// Implements TURN Allocate, CreatePermission, Refresh, Send/Data Indication.
// Uses HMAC-SHA1 long-term credential mechanism compatible with coturn's
// --use-auth-secret mode.
//
// Wire format follows STUN (RFC 5389) message structure with TURN-specific
// method codes and attributes.
///////////////////////////////////////////////////////////////////////////////

#include "cs/p2p/turn_client.h"
#include "cs/common.h"

#include <cstring>
#include <random>
#include <vector>

#ifdef _WIN32
  #include <WinSock2.h>
  #include <WS2tcpip.h>
#else
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <arpa/inet.h>
  #include <netdb.h>
  #include <sys/select.h>
#endif

// OpenSSL for HMAC-SHA1 message integrity
#include <openssl/hmac.h>
#include <openssl/evp.h>

namespace cs {

// ---------------------------------------------------------------------------
// STUN/TURN protocol constants (RFC 5389 / RFC 5766)
// Defined at file scope so both free helper functions and TurnClient member
// functions can reference them.
// ---------------------------------------------------------------------------

// TURN message types
static constexpr uint16_t ALLOCATE_REQUEST    = 0x0003;
static constexpr uint16_t ALLOCATE_RESPONSE   = 0x0103;
static constexpr uint16_t ALLOCATE_ERROR      = 0x0113;
static constexpr uint16_t REFRESH_REQUEST     = 0x0004;
static constexpr uint16_t REFRESH_RESPONSE    = 0x0104;
static constexpr uint16_t PERMISSION_REQUEST  = 0x0008;
static constexpr uint16_t PERMISSION_RESPONSE = 0x0108;
static constexpr uint16_t SEND_INDICATION     = 0x0016;
static constexpr uint16_t DATA_INDICATION     = 0x0017;
static constexpr uint16_t CHANNEL_BIND        = 0x0009;

// STUN magic cookie
static constexpr uint32_t MAGIC_COOKIE = 0x2112A442;

// STUN/TURN attribute types
static constexpr uint16_t ATTR_MAPPED_ADDRESS      = 0x0001;
static constexpr uint16_t ATTR_USERNAME             = 0x0006;
static constexpr uint16_t ATTR_MESSAGE_INTEGRITY    = 0x0008;
static constexpr uint16_t ATTR_ERROR_CODE           = 0x0009;
static constexpr uint16_t ATTR_LIFETIME             = 0x000D;
static constexpr uint16_t ATTR_XOR_PEER_ADDRESS     = 0x0012;
static constexpr uint16_t ATTR_DATA                 = 0x0013;
static constexpr uint16_t ATTR_REALM                = 0x0014;
static constexpr uint16_t ATTR_NONCE                = 0x0015;
static constexpr uint16_t ATTR_XOR_RELAYED_ADDRESS  = 0x0016;
static constexpr uint16_t ATTR_REQUESTED_TRANSPORT  = 0x0019;
static constexpr uint16_t ATTR_XOR_MAPPED_ADDRESS   = 0x0020;

// Address family
static constexpr uint8_t ADDR_FAMILY_IPV4 = 0x01;

// Timeout for TURN transactions (ms)
static constexpr int TURN_TIMEOUT_MS   = 3000;
static constexpr int TURN_MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Helper: generate 12-byte transaction ID
// ---------------------------------------------------------------------------
static void generateTxnId(uint8_t txnId[12]) {
    static thread_local std::mt19937 rng(std::random_device{}());
    std::uniform_int_distribution<int> dist(0, 255);
    for (int i = 0; i < 12; ++i) {
        txnId[i] = static_cast<uint8_t>(dist(rng));
    }
}

// ---------------------------------------------------------------------------
// Helper: write uint16 in network byte order
// ---------------------------------------------------------------------------
static void writeU16(uint8_t* p, uint16_t v) {
    p[0] = static_cast<uint8_t>(v >> 8);
    p[1] = static_cast<uint8_t>(v & 0xFF);
}

// ---------------------------------------------------------------------------
// Helper: write uint32 in network byte order
// ---------------------------------------------------------------------------
static void writeU32(uint8_t* p, uint32_t v) {
    p[0] = static_cast<uint8_t>((v >> 24) & 0xFF);
    p[1] = static_cast<uint8_t>((v >> 16) & 0xFF);
    p[2] = static_cast<uint8_t>((v >> 8) & 0xFF);
    p[3] = static_cast<uint8_t>(v & 0xFF);
}

// ---------------------------------------------------------------------------
// Helper: read uint16 from network byte order
// ---------------------------------------------------------------------------
static uint16_t readU16(const uint8_t* p) {
    return (static_cast<uint16_t>(p[0]) << 8) | p[1];
}

// ---------------------------------------------------------------------------
// Helper: read uint32 from network byte order
// ---------------------------------------------------------------------------
static uint32_t readU32(const uint8_t* p) {
    return (static_cast<uint32_t>(p[0]) << 24) |
           (static_cast<uint32_t>(p[1]) << 16) |
           (static_cast<uint32_t>(p[2]) << 8)  |
            static_cast<uint32_t>(p[3]);
}

// ---------------------------------------------------------------------------
// Helper: append a STUN/TURN attribute to a buffer
// ---------------------------------------------------------------------------
static void appendAttribute(std::vector<uint8_t>& buf, uint16_t type,
                            const uint8_t* data, size_t len) {
    size_t off = buf.size();
    buf.resize(off + 4 + ((len + 3) & ~3u)); // pad to 4-byte boundary
    writeU16(&buf[off], type);
    writeU16(&buf[off + 2], static_cast<uint16_t>(len));
    if (len > 0) {
        std::memcpy(&buf[off + 4], data, len);
    }
}

// ---------------------------------------------------------------------------
// Helper: compute HMAC-SHA1 for MESSAGE-INTEGRITY
// ---------------------------------------------------------------------------
static std::vector<uint8_t> computeHmacSha1(const std::string& key,
                                              const uint8_t* data, size_t len) {
    unsigned int outLen = 20;
    std::vector<uint8_t> result(outLen);
    HMAC(EVP_sha1(),
         key.data(), static_cast<int>(key.size()),
         data, len,
         result.data(), &outLen);
    result.resize(outLen);
    return result;
}

// ---------------------------------------------------------------------------
// Helper: build a STUN/TURN message with auth attributes + MESSAGE-INTEGRITY
// ---------------------------------------------------------------------------
static std::vector<uint8_t> buildAuthMessage(uint16_t msgType,
                                              const uint8_t txnId[12],
                                              const std::vector<uint8_t>& attrs,
                                              const std::string& username,
                                              const std::string& realm,
                                              const std::string& nonce,
                                              const std::string& credential) {
    std::vector<uint8_t> msg;
    msg.reserve(20 + attrs.size() + 256);

    // 20-byte header placeholder
    msg.resize(20);
    writeU16(&msg[0], msgType);
    writeU32(&msg[4], MAGIC_COOKIE);
    std::memcpy(&msg[8], txnId, 12);

    // Append method-specific attributes
    msg.insert(msg.end(), attrs.begin(), attrs.end());

    // USERNAME attribute
    appendAttribute(msg, ATTR_USERNAME,
                    reinterpret_cast<const uint8_t*>(username.data()),
                    username.size());

    // REALM attribute
    appendAttribute(msg, ATTR_REALM,
                    reinterpret_cast<const uint8_t*>(realm.data()),
                    realm.size());

    // NONCE attribute
    if (!nonce.empty()) {
        appendAttribute(msg, ATTR_NONCE,
                        reinterpret_cast<const uint8_t*>(nonce.data()),
                        nonce.size());
    }

    // Update message length before computing integrity.
    // Length includes everything after the header, PLUS the 24-byte
    // MESSAGE-INTEGRITY attribute that we're about to append.
    uint16_t lenWithIntegrity = static_cast<uint16_t>(msg.size() - 20 + 24);
    writeU16(&msg[2], lenWithIntegrity);

    // Compute MESSAGE-INTEGRITY HMAC-SHA1 over the message so far
    auto hmac = computeHmacSha1(credential, msg.data(), msg.size());
    appendAttribute(msg, ATTR_MESSAGE_INTEGRITY, hmac.data(), hmac.size());

    // Final length update
    writeU16(&msg[2], static_cast<uint16_t>(msg.size() - 20));

    return msg;
}

// ---------------------------------------------------------------------------
// Helper: send message and wait for response with retry
// ---------------------------------------------------------------------------
static bool sendAndReceive(int sock, const struct sockaddr* addr, socklen_t addrLen,
                           const std::vector<uint8_t>& msg,
                           uint8_t* responseBuf, size_t responseBufSize,
                           int& responseLen) {
    for (int attempt = 0; attempt < TURN_MAX_ATTEMPTS; ++attempt) {
        int sent = ::sendto(sock,
                            reinterpret_cast<const char*>(msg.data()),
                            static_cast<int>(msg.size()), 0,
                            addr, static_cast<int>(addrLen));
        if (sent <= 0) {
            CS_LOG(WARN, "TURN: sendto failed (attempt %d): %d",
                   attempt + 1, cs_socket_error());
            continue;
        }

        fd_set rfds;
        FD_ZERO(&rfds);
        FD_SET(static_cast<unsigned int>(sock), &rfds);

        struct timeval tv;
        tv.tv_sec  = TURN_TIMEOUT_MS / 1000;
        tv.tv_usec = (TURN_TIMEOUT_MS % 1000) * 1000;

        int sel = ::select(sock + 1, &rfds, nullptr, nullptr, &tv);
        if (sel <= 0) {
            CS_LOG(DEBUG, "TURN: timeout on attempt %d", attempt + 1);
            continue;
        }

        struct sockaddr_storage from;
        socklen_t fromLen = sizeof(from);
        int n = ::recvfrom(sock, reinterpret_cast<char*>(responseBuf),
                           static_cast<int>(responseBufSize), 0,
                           reinterpret_cast<sockaddr*>(&from), &fromLen);
        if (n <= 0) {
            CS_LOG(WARN, "TURN: recvfrom failed: %d", cs_socket_error());
            continue;
        }

        responseLen = n;
        return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
// Helper: extract error code from TURN error response
// ---------------------------------------------------------------------------
static int extractErrorCode(const uint8_t* data, size_t len) {
    if (len < 20) return -1;
    uint16_t msgLen = readU16(data + 2);
    size_t offset = 20;
    size_t end = 20 + msgLen;
    if (end > len) end = len;

    while (offset + 4 <= end) {
        uint16_t attrType = readU16(data + offset);
        uint16_t attrLen = readU16(data + offset + 2);
        offset += 4;
        if (offset + attrLen > end) break;

        if (attrType == ATTR_ERROR_CODE && attrLen >= 4) {
            int errorClass = data[offset + 2] & 0x07;
            int errorNumber = data[offset + 3];
            return errorClass * 100 + errorNumber;
        }

        offset += (attrLen + 3) & ~3u;
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Helper: extract NONCE from TURN error response (401 auth challenge)
// ---------------------------------------------------------------------------
static std::string extractNonce(const uint8_t* data, size_t len) {
    if (len < 20) return "";
    uint16_t msgLen = readU16(data + 2);
    size_t offset = 20;
    size_t end = 20 + msgLen;
    if (end > len) end = len;

    while (offset + 4 <= end) {
        uint16_t attrType = readU16(data + offset);
        uint16_t attrLen = readU16(data + offset + 2);
        offset += 4;
        if (offset + attrLen > end) break;

        if (attrType == ATTR_NONCE) {
            return std::string(reinterpret_cast<const char*>(data + offset), attrLen);
        }

        offset += (attrLen + 3) & ~3u;
    }
    return "";
}

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------
TurnClient::TurnClient(const TurnConfig& config)
    : config_(config)
{
    CS_LOG(INFO, "TurnClient created (server=%s:%u, realm=%s)",
           config_.server.c_str(), config_.port, config_.realm.c_str());
}

TurnClient::~TurnClient() {
    close();
}

// ---------------------------------------------------------------------------
// createSocket() -- create and bind a UDP socket
// ---------------------------------------------------------------------------
int TurnClient::createSocket() {
    int sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP));
    if (sock < 0) {
        CS_LOG(ERR, "TURN: failed to create UDP socket: %d", cs_socket_error());
        return -1;
    }

    struct sockaddr_in local = {};
    local.sin_family = AF_INET;
    local.sin_port = 0; // bind to any available port
    local.sin_addr.s_addr = INADDR_ANY;

    if (::bind(sock, reinterpret_cast<const sockaddr*>(&local), sizeof(local)) != 0) {
        CS_LOG(ERR, "TURN: failed to bind socket: %d", cs_socket_error());
        cs_close_socket(sock);
        return -1;
    }

    return sock;
}

// ---------------------------------------------------------------------------
// allocate() -- TURN Allocate (RFC 5766 section 6)
//
// Flow:
//   1. Send Allocate without auth → expect 401 with NONCE + REALM
//   2. Resend with USERNAME + REALM + NONCE + MESSAGE-INTEGRITY
//   3. Parse XOR-RELAYED-ADDRESS and LIFETIME from success response
// ---------------------------------------------------------------------------
TurnAllocation TurnClient::allocate() {
    TurnAllocation result;
    result.success = false;

    // Resolve TURN server address
    struct addrinfo hints = {};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;

    char portStr[8];
    std::snprintf(portStr, sizeof(portStr), "%u", config_.port);

    struct addrinfo* res = nullptr;
    int gai = ::getaddrinfo(config_.server.c_str(), portStr, &hints, &res);
    if (gai != 0 || !res) {
        CS_LOG(ERR, "TURN: failed to resolve %s: %s",
               config_.server.c_str(), gai_strerror(gai));
        return result;
    }

    // Create UDP socket
    int sock = createSocket();
    if (sock < 0) {
        ::freeaddrinfo(res);
        return result;
    }

    // REQUESTED-TRANSPORT attribute: UDP (protocol number 17)
    std::vector<uint8_t> transportAttr;
    {
        uint8_t transport[4] = {17, 0, 0, 0}; // protocol=UDP + 3 bytes RFFU
        appendAttribute(transportAttr, ATTR_REQUESTED_TRANSPORT, transport, 4);
    }

    // Step 1: Send unauthenticated Allocate to get nonce
    uint8_t txnId[12];
    generateTxnId(txnId);

    std::vector<uint8_t> initMsg;
    initMsg.resize(20);
    writeU16(&initMsg[0], ALLOCATE_REQUEST);
    writeU32(&initMsg[4], MAGIC_COOKIE);
    std::memcpy(&initMsg[8], txnId, 12);
    initMsg.insert(initMsg.end(), transportAttr.begin(), transportAttr.end());
    writeU16(&initMsg[2], static_cast<uint16_t>(initMsg.size() - 20));

    uint8_t respBuf[2048];
    int respLen = 0;

    if (!sendAndReceive(sock, res->ai_addr, static_cast<socklen_t>(res->ai_addrlen),
                        initMsg, respBuf, sizeof(respBuf), respLen)) {
        CS_LOG(ERR, "TURN: no response to initial Allocate");
        cs_close_socket(sock);
        ::freeaddrinfo(res);
        return result;
    }

    uint16_t respType = readU16(respBuf);
    int errorCode = extractErrorCode(respBuf, static_cast<size_t>(respLen));

    std::string nonce;
    if (respType == ALLOCATE_ERROR && errorCode == 401) {
        nonce = extractNonce(respBuf, static_cast<size_t>(respLen));
        CS_LOG(DEBUG, "TURN: received 401 challenge, nonce length=%zu", nonce.size());
    } else if (respType == ALLOCATE_RESPONSE) {
        // Server didn't require auth — parse directly
        CS_LOG(INFO, "TURN: allocation succeeded without auth challenge");
    } else {
        CS_LOG(ERR, "TURN: unexpected response type=0x%04X error=%d", respType, errorCode);
        cs_close_socket(sock);
        ::freeaddrinfo(res);
        return result;
    }

    // Step 2: Resend with full credentials if challenged
    if (!nonce.empty()) {
        generateTxnId(txnId);

        auto authMsg = buildAuthMessage(ALLOCATE_REQUEST, txnId, transportAttr,
                                         config_.username, config_.realm, nonce,
                                         config_.credential);

        if (!sendAndReceive(sock, res->ai_addr, static_cast<socklen_t>(res->ai_addrlen),
                            authMsg, respBuf, sizeof(respBuf), respLen)) {
            CS_LOG(ERR, "TURN: no response to authenticated Allocate");
            cs_close_socket(sock);
            ::freeaddrinfo(res);
            return result;
        }
    }

    // Step 3: Parse the Allocate Response
    if (!parseAllocateResponse(respBuf, static_cast<size_t>(respLen))) {
        int err = extractErrorCode(respBuf, static_cast<size_t>(respLen));
        CS_LOG(ERR, "TURN: Allocate failed, error=%d", err);
        cs_close_socket(sock);
        ::freeaddrinfo(res);
        return result;
    }

    allocation_.socket_fd = sock;
    allocation_.success = true;
    allocated_.store(true);

    CS_LOG(INFO, "TURN: allocation successful — relay=%s:%u, mapped=%s:%u, lifetime=%us",
           allocation_.relay_ip.c_str(), allocation_.relay_port,
           allocation_.mapped_ip.c_str(), allocation_.mapped_port,
           allocation_.lifetime);

    ::freeaddrinfo(res);
    result = allocation_;
    return result;
}

// ---------------------------------------------------------------------------
// sendAllocateRequest() — legacy helper, flow is now inline in allocate()
// ---------------------------------------------------------------------------
bool TurnClient::sendAllocateRequest(int /*sock*/, const std::string& /*nonce*/) {
    return true;
}

// ---------------------------------------------------------------------------
// parseAllocateResponse() -- extract XOR-RELAYED-ADDRESS, XOR-MAPPED-ADDRESS, LIFETIME
// ---------------------------------------------------------------------------
bool TurnClient::parseAllocateResponse(const uint8_t* data, size_t len) {
    if (len < 20) return false;

    uint16_t msgType = readU16(data);
    if (msgType != ALLOCATE_RESPONSE) return false;

    uint16_t msgLen = readU16(data + 2);
    size_t offset = 20;
    size_t end = 20 + msgLen;
    if (end > len) end = len;

    bool foundRelay = false;

    while (offset + 4 <= end) {
        uint16_t attrType = readU16(data + offset);
        uint16_t attrLen = readU16(data + offset + 2);
        offset += 4;
        if (offset + attrLen > end) break;

        if (attrType == ATTR_XOR_RELAYED_ADDRESS && attrLen >= 8) {
            uint8_t family = data[offset + 1];
            if (family == ADDR_FAMILY_IPV4) {
                uint16_t xport = readU16(data + offset + 2);
                allocation_.relay_port = xport ^ static_cast<uint16_t>(MAGIC_COOKIE >> 16);

                uint8_t xaddr[4];
                xaddr[0] = data[offset + 4] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 24);
                xaddr[1] = data[offset + 5] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 16);
                xaddr[2] = data[offset + 6] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 8);
                xaddr[3] = data[offset + 7] ^ static_cast<uint8_t>(MAGIC_COOKIE);

                char ipStr[INET_ADDRSTRLEN] = {};
                struct in_addr addr;
                std::memcpy(&addr, xaddr, 4);
                ::inet_ntop(AF_INET, &addr, ipStr, sizeof(ipStr));
                allocation_.relay_ip = ipStr;
                foundRelay = true;
            }
        } else if (attrType == ATTR_XOR_MAPPED_ADDRESS && attrLen >= 8) {
            uint8_t family = data[offset + 1];
            if (family == ADDR_FAMILY_IPV4) {
                uint16_t xport = readU16(data + offset + 2);
                allocation_.mapped_port = xport ^ static_cast<uint16_t>(MAGIC_COOKIE >> 16);

                uint8_t xaddr[4];
                xaddr[0] = data[offset + 4] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 24);
                xaddr[1] = data[offset + 5] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 16);
                xaddr[2] = data[offset + 6] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 8);
                xaddr[3] = data[offset + 7] ^ static_cast<uint8_t>(MAGIC_COOKIE);

                char ipStr[INET_ADDRSTRLEN] = {};
                struct in_addr addr;
                std::memcpy(&addr, xaddr, 4);
                ::inet_ntop(AF_INET, &addr, ipStr, sizeof(ipStr));
                allocation_.mapped_ip = ipStr;
            }
        } else if (attrType == ATTR_LIFETIME && attrLen >= 4) {
            allocation_.lifetime = readU32(data + offset);
        }

        offset += (attrLen + 3) & ~3u;
    }

    return foundRelay;
}

// ---------------------------------------------------------------------------
// createPermission() -- TURN CreatePermission (RFC 5766 section 9)
// ---------------------------------------------------------------------------
bool TurnClient::createPermission(const std::string& peer_ip) {
    if (!allocated_.load()) {
        CS_LOG(WARN, "TURN: createPermission called without allocation");
        return false;
    }
    return sendCreatePermission(peer_ip);
}

// ---------------------------------------------------------------------------
// sendCreatePermission() -- build and send CreatePermission request
// ---------------------------------------------------------------------------
bool TurnClient::sendCreatePermission(const std::string& peer_ip) {
    struct in_addr inAddr;
    if (::inet_pton(AF_INET, peer_ip.c_str(), &inAddr) != 1) {
        CS_LOG(ERR, "TURN: invalid peer IP for permission: %s", peer_ip.c_str());
        return false;
    }

    // Build XOR-PEER-ADDRESS (port=0 for permissions — only IP matters)
    uint8_t peerAddr[8] = {};
    peerAddr[1] = ADDR_FAMILY_IPV4;
    writeU16(peerAddr + 2, static_cast<uint16_t>(MAGIC_COOKIE >> 16)); // XOR with 0 = magic>>16
    uint8_t rawAddr[4];
    std::memcpy(rawAddr, &inAddr, 4);
    peerAddr[4] = rawAddr[0] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 24);
    peerAddr[5] = rawAddr[1] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 16);
    peerAddr[6] = rawAddr[2] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 8);
    peerAddr[7] = rawAddr[3] ^ static_cast<uint8_t>(MAGIC_COOKIE);

    std::vector<uint8_t> attrs;
    appendAttribute(attrs, ATTR_XOR_PEER_ADDRESS, peerAddr, 8);

    uint8_t txnId[12];
    generateTxnId(txnId);

    // Resolve server
    struct addrinfo hints = {};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;
    char portStr[8];
    std::snprintf(portStr, sizeof(portStr), "%u", config_.port);

    struct addrinfo* res = nullptr;
    if (::getaddrinfo(config_.server.c_str(), portStr, &hints, &res) != 0 || !res) {
        CS_LOG(ERR, "TURN: failed to resolve server for CreatePermission");
        return false;
    }

    auto msg = buildAuthMessage(PERMISSION_REQUEST, txnId, attrs,
                                 config_.username, config_.realm, "",
                                 config_.credential);

    uint8_t respBuf[2048];
    int respLen = 0;

    bool ok = sendAndReceive(allocation_.socket_fd, res->ai_addr,
                              static_cast<socklen_t>(res->ai_addrlen),
                              msg, respBuf, sizeof(respBuf), respLen);
    ::freeaddrinfo(res);

    if (!ok) {
        CS_LOG(ERR, "TURN: no response to CreatePermission");
        return false;
    }

    uint16_t respType = readU16(respBuf);
    if (respType == PERMISSION_RESPONSE) {
        CS_LOG(INFO, "TURN: permission created for peer %s", peer_ip.c_str());
        return true;
    }

    int err = extractErrorCode(respBuf, static_cast<size_t>(respLen));
    CS_LOG(ERR, "TURN: CreatePermission failed, error=%d", err);
    return false;
}

// ---------------------------------------------------------------------------
// refresh() -- TURN Refresh (RFC 5766 section 7)
// ---------------------------------------------------------------------------
bool TurnClient::refresh(uint32_t lifetime) {
    if (!allocated_.load() && lifetime > 0) {
        CS_LOG(WARN, "TURN: refresh called without allocation");
        return false;
    }

    uint8_t lifetimeBuf[4];
    writeU32(lifetimeBuf, lifetime);

    std::vector<uint8_t> attrs;
    appendAttribute(attrs, ATTR_LIFETIME, lifetimeBuf, 4);

    uint8_t txnId[12];
    generateTxnId(txnId);

    struct addrinfo hints = {};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;
    char portStr[8];
    std::snprintf(portStr, sizeof(portStr), "%u", config_.port);

    struct addrinfo* res = nullptr;
    if (::getaddrinfo(config_.server.c_str(), portStr, &hints, &res) != 0 || !res) {
        return false;
    }

    auto msg = buildAuthMessage(REFRESH_REQUEST, txnId, attrs,
                                 config_.username, config_.realm, "",
                                 config_.credential);

    uint8_t respBuf[2048];
    int respLen = 0;

    bool ok = sendAndReceive(allocation_.socket_fd, res->ai_addr,
                              static_cast<socklen_t>(res->ai_addrlen),
                              msg, respBuf, sizeof(respBuf), respLen);
    ::freeaddrinfo(res);

    if (!ok) {
        CS_LOG(ERR, "TURN: no response to Refresh");
        return false;
    }

    uint16_t respType = readU16(respBuf);
    if (respType == REFRESH_RESPONSE) {
        if (lifetime == 0) {
            CS_LOG(INFO, "TURN: allocation deallocated via refresh(0)");
            allocated_.store(false);
        } else {
            CS_LOG(INFO, "TURN: allocation refreshed (lifetime=%us)", lifetime);
            allocation_.lifetime = lifetime;
        }
        return true;
    }

    int err = extractErrorCode(respBuf, static_cast<size_t>(respLen));
    CS_LOG(ERR, "TURN: Refresh failed, error=%d", err);
    return false;
}

// ---------------------------------------------------------------------------
// sendData() -- TURN Send Indication (RFC 5766 section 10)
// Send Indications carry data to a peer through the relay. No response
// is expected (indications are fire-and-forget).
// ---------------------------------------------------------------------------
bool TurnClient::sendData(const uint8_t* payload, size_t len,
                          const std::string& peer_ip, uint16_t peer_port) {
    if (!allocated_.load()) {
        CS_LOG(WARN, "TURN: sendData called without allocation");
        return false;
    }

    struct in_addr inAddr;
    if (::inet_pton(AF_INET, peer_ip.c_str(), &inAddr) != 1) {
        CS_LOG(ERR, "TURN: invalid peer IP: %s", peer_ip.c_str());
        return false;
    }

    // Build XOR-PEER-ADDRESS with actual peer port
    uint8_t peerAddr[8] = {};
    peerAddr[1] = ADDR_FAMILY_IPV4;
    uint16_t xPort = peer_port ^ static_cast<uint16_t>(MAGIC_COOKIE >> 16);
    writeU16(peerAddr + 2, xPort);
    uint8_t rawAddr[4];
    std::memcpy(rawAddr, &inAddr, 4);
    peerAddr[4] = rawAddr[0] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 24);
    peerAddr[5] = rawAddr[1] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 16);
    peerAddr[6] = rawAddr[2] ^ static_cast<uint8_t>(MAGIC_COOKIE >> 8);
    peerAddr[7] = rawAddr[3] ^ static_cast<uint8_t>(MAGIC_COOKIE);

    // Build Send Indication (no MESSAGE-INTEGRITY needed for indications)
    std::vector<uint8_t> msg;
    uint8_t txnId[12];
    generateTxnId(txnId);
    msg.resize(20);
    writeU16(&msg[0], SEND_INDICATION);
    writeU32(&msg[4], MAGIC_COOKIE);
    std::memcpy(&msg[8], txnId, 12);

    appendAttribute(msg, ATTR_XOR_PEER_ADDRESS, peerAddr, 8);
    appendAttribute(msg, ATTR_DATA, payload, len);

    // Final message length
    writeU16(&msg[2], static_cast<uint16_t>(msg.size() - 20));

    // Resolve server and send
    struct addrinfo hints = {};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;
    char portStr[8];
    std::snprintf(portStr, sizeof(portStr), "%u", config_.port);

    struct addrinfo* res = nullptr;
    if (::getaddrinfo(config_.server.c_str(), portStr, &hints, &res) != 0 || !res) {
        return false;
    }

    int sent = ::sendto(allocation_.socket_fd,
                        reinterpret_cast<const char*>(msg.data()),
                        static_cast<int>(msg.size()), 0,
                        res->ai_addr, static_cast<int>(res->ai_addrlen));
    ::freeaddrinfo(res);

    if (sent <= 0) {
        CS_LOG(WARN, "TURN: sendData failed: %d", cs_socket_error());
        return false;
    }

    return true;
}

// ---------------------------------------------------------------------------
// setOnData() -- register callback for relayed data
// ---------------------------------------------------------------------------
void TurnClient::setOnData(std::function<void(const uint8_t*, size_t,
                                               const std::string&, uint16_t)> cb) {
    on_data_ = std::move(cb);
}

// ---------------------------------------------------------------------------
// close() -- deallocate and clean up
// ---------------------------------------------------------------------------
void TurnClient::close() {
    if (allocated_.exchange(false)) {
        // Try graceful deallocation via Refresh(lifetime=0)
        if (allocation_.socket_fd >= 0) {
            // Set allocated back briefly so refresh() doesn't bail out
            allocated_.store(true);
            refresh(0);
            allocated_.store(false);
        }
        CS_LOG(INFO, "TURN: allocation closed");
    }

    if (allocation_.socket_fd >= 0) {
        cs_close_socket(allocation_.socket_fd);
        allocation_.socket_fd = -1;
    }
}

} // namespace cs
