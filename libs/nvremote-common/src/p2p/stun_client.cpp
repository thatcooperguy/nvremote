///////////////////////////////////////////////////////////////////////////////
// stun_client.cpp -- Minimal STUN Binding Request implementation (RFC 5389)
///////////////////////////////////////////////////////////////////////////////

#include "cs/p2p/stun_client.h"
#include "cs/common.h"

#include <cstring>
#include <random>
#include <chrono>

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

namespace cs {

// STUN magic cookie (RFC 5389 section 6)
static constexpr uint32_t STUN_MAGIC_COOKIE = 0x2112A442;

// STUN message types
static constexpr uint16_t STUN_BINDING_REQUEST          = 0x0001;
static constexpr uint16_t STUN_BINDING_SUCCESS_RESPONSE = 0x0101;

// STUN attribute types
static constexpr uint16_t STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020;
static constexpr uint16_t STUN_ATTR_MAPPED_ADDRESS     = 0x0001;

// Address families
static constexpr uint8_t STUN_ADDR_FAMILY_IPV4 = 0x01;

// ---------------------------------------------------------------------------
// Build a 20-byte STUN Binding Request
// ---------------------------------------------------------------------------
void StunClient::buildBindingRequest(uint8_t out[20], uint8_t txnId[12]) {
    std::memset(out, 0, 20);

    // Message type: Binding Request = 0x0001
    out[0] = 0x00;
    out[1] = 0x01;

    // Message length: 0 (no attributes)
    out[2] = 0x00;
    out[3] = 0x00;

    // Magic cookie: 0x2112A442 in network byte order
    out[4] = 0x21;
    out[5] = 0x12;
    out[6] = 0xA4;
    out[7] = 0x42;

    // Transaction ID: 12 random bytes
    // Use a thread-local RNG seeded from hardware entropy
    static thread_local std::mt19937 rng(std::random_device{}());
    std::uniform_int_distribution<int> dist(0, 255);
    for (int i = 0; i < 12; ++i) {
        txnId[i] = static_cast<uint8_t>(dist(rng));
    }
    std::memcpy(out + 8, txnId, 12);
}

// ---------------------------------------------------------------------------
// Parse STUN Binding Success Response for XOR-MAPPED-ADDRESS
// ---------------------------------------------------------------------------
bool StunClient::parseBindingResponse(const uint8_t* data, size_t len,
                                      const uint8_t txnId[12],
                                      std::string& ip, uint16_t& port) {
    // Minimum STUN header is 20 bytes
    if (len < 20) {
        CS_LOG(DEBUG, "STUN response too short: %zu bytes", len);
        return false;
    }

    // Verify it's a Binding Success Response
    uint16_t msgType = (static_cast<uint16_t>(data[0]) << 8) | data[1];
    if (msgType != STUN_BINDING_SUCCESS_RESPONSE) {
        CS_LOG(DEBUG, "STUN unexpected message type: 0x%04X", msgType);
        return false;
    }

    uint16_t msgLen = (static_cast<uint16_t>(data[2]) << 8) | data[3];

    // Verify magic cookie
    uint32_t cookie = (static_cast<uint32_t>(data[4]) << 24) |
                      (static_cast<uint32_t>(data[5]) << 16) |
                      (static_cast<uint32_t>(data[6]) << 8)  |
                      static_cast<uint32_t>(data[7]);
    if (cookie != STUN_MAGIC_COOKIE) {
        CS_LOG(DEBUG, "STUN bad magic cookie: 0x%08X", cookie);
        return false;
    }

    // Verify transaction ID matches
    if (std::memcmp(data + 8, txnId, 12) != 0) {
        CS_LOG(DEBUG, "STUN transaction ID mismatch");
        return false;
    }

    // Walk the attribute list looking for XOR-MAPPED-ADDRESS (or
    // fall back to MAPPED-ADDRESS)
    size_t offset = 20;
    size_t end    = 20 + msgLen;
    if (end > len) end = len;

    bool foundXor    = false;
    bool foundMapped = false;
    std::string mappedIp;
    uint16_t    mappedPort = 0;

    while (offset + 4 <= end) {
        uint16_t attrType = (static_cast<uint16_t>(data[offset]) << 8) |
                             data[offset + 1];
        uint16_t attrLen  = (static_cast<uint16_t>(data[offset + 2]) << 8) |
                             data[offset + 3];
        offset += 4;

        if (offset + attrLen > end) break;

        if (attrType == STUN_ATTR_XOR_MAPPED_ADDRESS && attrLen >= 8) {
            // Byte 0: reserved, Byte 1: family, Bytes 2-3: X-Port,
            // Bytes 4-7: X-Address (IPv4)
            uint8_t family = data[offset + 1];
            if (family == STUN_ADDR_FAMILY_IPV4) {
                // XOR port with upper 16 bits of magic cookie
                uint16_t xport = (static_cast<uint16_t>(data[offset + 2]) << 8) |
                                  data[offset + 3];
                port = xport ^ static_cast<uint16_t>(STUN_MAGIC_COOKIE >> 16);

                // XOR address with full magic cookie
                uint8_t xaddr[4];
                xaddr[0] = data[offset + 4] ^ static_cast<uint8_t>(STUN_MAGIC_COOKIE >> 24);
                xaddr[1] = data[offset + 5] ^ static_cast<uint8_t>(STUN_MAGIC_COOKIE >> 16);
                xaddr[2] = data[offset + 6] ^ static_cast<uint8_t>(STUN_MAGIC_COOKIE >> 8);
                xaddr[3] = data[offset + 7] ^ static_cast<uint8_t>(STUN_MAGIC_COOKIE);

                char ipStr[INET_ADDRSTRLEN] = {};
                struct in_addr addr;
                std::memcpy(&addr, xaddr, 4);
                ::inet_ntop(AF_INET, &addr, ipStr, sizeof(ipStr));
                ip = ipStr;
                foundXor = true;
            }
        } else if (attrType == STUN_ATTR_MAPPED_ADDRESS && attrLen >= 8) {
            // Fallback: plain MAPPED-ADDRESS
            uint8_t family = data[offset + 1];
            if (family == STUN_ADDR_FAMILY_IPV4) {
                mappedPort = (static_cast<uint16_t>(data[offset + 2]) << 8) |
                              data[offset + 3];

                char ipStr[INET_ADDRSTRLEN] = {};
                struct in_addr addr;
                std::memcpy(&addr, data + offset + 4, 4);
                ::inet_ntop(AF_INET, &addr, ipStr, sizeof(ipStr));
                mappedIp = ipStr;
                foundMapped = true;
            }
        }

        // Advance to the next attribute (attributes are padded to 4-byte
        // boundaries per RFC 5389 section 15)
        size_t padded = (attrLen + 3) & ~static_cast<size_t>(3);
        offset += padded;
    }

    if (foundXor) return true;

    // Fall back to MAPPED-ADDRESS if XOR-MAPPED-ADDRESS wasn't present
    if (foundMapped) {
        ip   = mappedIp;
        port = mappedPort;
        return true;
    }

    CS_LOG(DEBUG, "STUN response contained no mapped address attribute");
    return false;
}

// ---------------------------------------------------------------------------
// discoverPublicEndpoint
// ---------------------------------------------------------------------------
StunResult StunClient::discoverPublicEndpoint(const std::string& stun_server,
                                               uint16_t stun_port,
                                               int local_socket) const {
    StunResult result;
    result.success = false;

    // Resolve the STUN server hostname
    struct addrinfo hints = {};
    hints.ai_family   = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;

    char portStr[8];
    std::snprintf(portStr, sizeof(portStr), "%u", stun_port);

    struct addrinfo* res = nullptr;
    int gai = ::getaddrinfo(stun_server.c_str(), portStr, &hints, &res);
    if (gai != 0 || !res) {
        CS_LOG(WARN, "STUN: failed to resolve %s: %s",
               stun_server.c_str(), gai_strerror(gai));
        return result;
    }

    // Build the request
    uint8_t request[20];
    uint8_t txnId[12];
    buildBindingRequest(request, txnId);

    // Retry loop: 3 attempts, 500 ms timeout each
    static constexpr int MAX_ATTEMPTS = 3;
    static constexpr int TIMEOUT_MS   = 500;

    for (int attempt = 0; attempt < MAX_ATTEMPTS; ++attempt) {
        int sent = ::sendto(local_socket,
                            reinterpret_cast<const char*>(request), 20, 0,
                            res->ai_addr,
                            static_cast<int>(res->ai_addrlen));
        if (sent != 20) {
            CS_LOG(WARN, "STUN: sendto failed (attempt %d): %d",
                   attempt + 1, cs_socket_error());
            continue;
        }

        // Wait for response with select()
        fd_set rfds;
        FD_ZERO(&rfds);
        FD_SET(static_cast<unsigned int>(local_socket), &rfds);

        struct timeval tv;
        tv.tv_sec  = TIMEOUT_MS / 1000;
        tv.tv_usec = (TIMEOUT_MS % 1000) * 1000;

        int sel = ::select(local_socket + 1, &rfds, nullptr, nullptr, &tv);
        if (sel <= 0) {
            CS_LOG(DEBUG, "STUN: timeout on attempt %d", attempt + 1);
            continue;
        }

        uint8_t buf[1024];
        struct sockaddr_storage from;
        socklen_t fromLen = sizeof(from);
        int n = ::recvfrom(local_socket, reinterpret_cast<char*>(buf),
                           sizeof(buf), 0,
                           reinterpret_cast<sockaddr*>(&from), &fromLen);
        if (n <= 0) {
            CS_LOG(WARN, "STUN: recvfrom failed: %d", cs_socket_error());
            continue;
        }

        std::string ip;
        uint16_t port = 0;
        if (parseBindingResponse(buf, static_cast<size_t>(n), txnId, ip, port)) {
            result.public_ip   = ip;
            result.public_port = port;
            result.success     = true;
            CS_LOG(INFO, "STUN: discovered %s:%u via %s",
                   ip.c_str(), port, stun_server.c_str());
            break;
        }

        CS_LOG(DEBUG, "STUN: failed to parse response on attempt %d",
               attempt + 1);
    }

    ::freeaddrinfo(res);
    return result;
}

} // namespace cs
