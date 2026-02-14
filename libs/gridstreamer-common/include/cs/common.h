///////////////////////////////////////////////////////////////////////////////
// common.h -- GridStreamer shared utilities
//
// Provides:
//   - Platform socket abstraction (Winsock2 on Windows, POSIX elsewhere)
//   - Printf-based logging macro with timestamp and severity
//   - High-resolution microsecond timestamp helper
//   - Local network interface enumeration
//   - RAII Winsock initializer
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <cstdio>
#include <cstdarg>
#include <cstring>
#include <chrono>
#include <string>
#include <vector>
#include <mutex>

// ---------------------------------------------------------------------------
// Platform socket headers
// ---------------------------------------------------------------------------
#ifdef _WIN32
  #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
  #endif
  #include <WinSock2.h>
  #include <WS2tcpip.h>
  #include <iphlpapi.h>
  #pragma comment(lib, "ws2_32.lib")
  #pragma comment(lib, "iphlpapi.lib")

  // Alias POSIX names used throughout the library
  using ssize_t   = int;
  using socklen_t = int;
  inline int cs_close_socket(int fd) { return ::closesocket(static_cast<SOCKET>(fd)); }

  // Set a socket to non-blocking mode
  inline bool cs_set_nonblocking(int fd) {
      u_long mode = 1;
      return ::ioctlsocket(static_cast<SOCKET>(fd), FIONBIO, &mode) == 0;
  }

  inline int cs_socket_error() { return ::WSAGetLastError(); }
#else
  #include <sys/types.h>
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <arpa/inet.h>
  #include <netdb.h>
  #include <unistd.h>
  #include <fcntl.h>
  #include <ifaddrs.h>
  #include <errno.h>

  inline int cs_close_socket(int fd) { return ::close(fd); }

  inline bool cs_set_nonblocking(int fd) {
      int flags = ::fcntl(fd, F_GETFL, 0);
      if (flags < 0) return false;
      return ::fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0;
  }

  inline int cs_socket_error() { return errno; }

  // Windows compat
  #define INVALID_SOCKET (-1)
  #define SOCKET_ERROR   (-1)
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------
enum class LogLevel : int {
    TRACE = 0,
    DEBUG = 1,
    INFO  = 2,
    WARN  = 3,
    ERR   = 4   // "ERROR" collides with Windows macros
};

/// Current global log level.  Messages below this level are suppressed.
/// Defaults to INFO; callers may lower it for debugging.
inline LogLevel& globalLogLevel() {
    static LogLevel level = LogLevel::INFO;
    return level;
}

inline const char* logLevelStr(LogLevel lv) {
    switch (lv) {
        case LogLevel::TRACE: return "TRACE";
        case LogLevel::DEBUG: return "DEBUG";
        case LogLevel::INFO:  return "INFO ";
        case LogLevel::WARN:  return "WARN ";
        case LogLevel::ERR:   return "ERROR";
    }
    return "?????";
}

/// Thread-safe printf-style log.  Called via CS_LOG macro below.
inline void logMessage(LogLevel level, const char* file, int line,
                       const char* fmt, ...) {
    if (level < globalLogLevel()) return;

    // Timestamp: seconds since epoch with microsecond fraction
    auto now  = std::chrono::system_clock::now();
    auto usec = std::chrono::duration_cast<std::chrono::microseconds>(
                    now.time_since_epoch()).count();
    long sec  = static_cast<long>(usec / 1'000'000);
    long frac = static_cast<long>(usec % 1'000'000);

    // Extract just the filename from path
    const char* base = file;
    for (const char* p = file; *p; ++p) {
        if (*p == '/' || *p == '\\') base = p + 1;
    }

    // Serialize output so lines don't interleave
    static std::mutex mtx;
    std::lock_guard<std::mutex> lock(mtx);

    std::fprintf(stderr, "[%ld.%06ld] [%s] %s:%d  ",
                 sec, frac, logLevelStr(level), base, line);

    va_list args;
    va_start(args, fmt);
    std::vfprintf(stderr, fmt, args);
    va_end(args);

    std::fputc('\n', stderr);
    std::fflush(stderr);
}

// ---------------------------------------------------------------------------
// CS_LOG macro
// Usage: CS_LOG(INFO, "received %d bytes from %s", n, addr.c_str());
// ---------------------------------------------------------------------------
#define CS_LOG(level, fmt, ...) \
    ::cs::logMessage(::cs::LogLevel::level, __FILE__, __LINE__, fmt, ##__VA_ARGS__)

// ---------------------------------------------------------------------------
// Error codes returned by library functions
// ---------------------------------------------------------------------------
enum class ErrorCode : int {
    OK              =  0,
    SOCKET_FAIL     = -1,
    BIND_FAIL       = -2,
    TIMEOUT         = -3,
    HANDSHAKE_FAIL  = -4,
    ENCRYPT_FAIL    = -5,
    DECRYPT_FAIL    = -6,
    STUN_FAIL       = -7,
    ICE_FAIL        = -8,
    INVALID_PACKET  = -9,
    UNKNOWN         = -100,
};

// ---------------------------------------------------------------------------
// High-resolution microsecond timestamp (monotonic clock)
// ---------------------------------------------------------------------------
inline uint64_t getTimestampUs() {
    auto now = std::chrono::steady_clock::now();
    return static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::microseconds>(
            now.time_since_epoch()).count());
}

// ---------------------------------------------------------------------------
// Enumerate local (non-loopback, IPv4) interface addresses
// ---------------------------------------------------------------------------
inline std::vector<std::string> getLocalIpAddresses() {
    std::vector<std::string> result;

#ifdef _WIN32
    // Use GetAdaptersAddresses on Windows
    ULONG bufLen = 15000;
    std::vector<uint8_t> buf(bufLen);
    auto* addrs = reinterpret_cast<PIP_ADAPTER_ADDRESSES>(buf.data());

    ULONG flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST |
                  GAA_FLAG_SKIP_DNS_SERVER;
    ULONG ret = ::GetAdaptersAddresses(AF_INET, flags, nullptr, addrs, &bufLen);
    if (ret == ERROR_BUFFER_OVERFLOW) {
        buf.resize(bufLen);
        addrs = reinterpret_cast<PIP_ADAPTER_ADDRESSES>(buf.data());
        ret = ::GetAdaptersAddresses(AF_INET, flags, nullptr, addrs, &bufLen);
    }
    if (ret != NO_ERROR) return result;

    for (auto* adapter = addrs; adapter; adapter = adapter->Next) {
        // Skip loopback and down interfaces
        if (adapter->IfType == IF_TYPE_SOFTWARE_LOOPBACK) continue;
        if (adapter->OperStatus != IfOperStatusUp) continue;

        for (auto* ua = adapter->FirstUnicastAddress; ua; ua = ua->Next) {
            auto* sa = reinterpret_cast<sockaddr_in*>(ua->Address.lpSockaddr);
            if (sa->sin_family != AF_INET) continue;

            char ipStr[INET_ADDRSTRLEN] = {};
            ::inet_ntop(AF_INET, &sa->sin_addr, ipStr, sizeof(ipStr));

            // Skip 127.x.x.x
            if (std::strncmp(ipStr, "127.", 4) == 0) continue;

            result.emplace_back(ipStr);
        }
    }
#else
    // POSIX: getifaddrs
    struct ifaddrs* ifap = nullptr;
    if (::getifaddrs(&ifap) != 0) return result;

    for (auto* ifa = ifap; ifa; ifa = ifa->ifa_next) {
        if (!ifa->ifa_addr) continue;
        if (ifa->ifa_addr->sa_family != AF_INET) continue;

        auto* sa = reinterpret_cast<sockaddr_in*>(ifa->ifa_addr);
        char ipStr[INET_ADDRSTRLEN] = {};
        ::inet_ntop(AF_INET, &sa->sin_addr, ipStr, sizeof(ipStr));

        if (std::strncmp(ipStr, "127.", 4) == 0) continue;
        result.emplace_back(ipStr);
    }
    ::freeifaddrs(ifap);
#endif

    return result;
}

// ---------------------------------------------------------------------------
// RAII Winsock initializer.  Create one instance at program startup on
// Windows; on other platforms this is a no-op.
// ---------------------------------------------------------------------------
class WinsockGuard {
public:
    WinsockGuard() {
#ifdef _WIN32
        WSADATA wsa;
        int err = ::WSAStartup(MAKEWORD(2, 2), &wsa);
        if (err != 0) {
            std::fprintf(stderr, "WSAStartup failed: %d\n", err);
            ok_ = false;
        } else {
            ok_ = true;
        }
#else
        ok_ = true;
#endif
    }

    ~WinsockGuard() {
#ifdef _WIN32
        if (ok_) ::WSACleanup();
#endif
    }

    bool ok() const { return ok_; }

    // Non-copyable, non-movable
    WinsockGuard(const WinsockGuard&) = delete;
    WinsockGuard& operator=(const WinsockGuard&) = delete;

private:
    bool ok_ = false;
};

} // namespace cs
