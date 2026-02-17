///////////////////////////////////////////////////////////////////////////////
// ice_agent.cpp -- ICE-lite candidate gathering and connectivity checks
///////////////////////////////////////////////////////////////////////////////

#include "cs/p2p/ice_agent.h"
#include "cs/common.h"

#include <cstring>
#include <algorithm>
#include <chrono>

#ifdef _WIN32
  #include <WinSock2.h>
  #include <WS2tcpip.h>
#else
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <arpa/inet.h>
  #include <sys/select.h>
#endif

namespace cs {

// Static member definition
constexpr uint8_t IceAgent::PROBE_MAGIC[4];

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------
IceAgent::IceAgent(const std::vector<std::string>& stun_servers)
    : stun_servers_(stun_servers)
{
}

IceAgent::~IceAgent() {
    stop();
}

// ---------------------------------------------------------------------------
// Compute ICE priority (RFC 5245 section 4.1.2.1)
//
//   priority = (2^24) * type_pref + (2^8) * local_pref + (256 - component)
//
// type_pref: host=126, srflx=100, relay=0
// ---------------------------------------------------------------------------
uint32_t IceAgent::computePriority(const std::string& type,
                                   uint16_t localPref,
                                   uint16_t component) {
    uint32_t typePref = 0;
    if (type == "host")  typePref = 126;
    else if (type == "srflx") typePref = 100;
    else if (type == "relay") typePref = 0;

    return (typePref << 24) + (static_cast<uint32_t>(localPref) << 8) +
           (256 - component);
}

// ---------------------------------------------------------------------------
// gatherCandidates
// ---------------------------------------------------------------------------
std::vector<IceCandidate> IceAgent::gatherCandidates() {
    local_candidates_.clear();
    // Close any previously opened sockets
    for (int s : local_sockets_) {
        if (s >= 0) cs_close_socket(s);
    }
    local_sockets_.clear();

    // -- 1. Gather host candidates --
    auto localIps = getLocalIpAddresses();
    CS_LOG(INFO, "ICE: found %zu local interface(s)", localIps.size());

    uint16_t localPrefCounter = 65535;

    for (const auto& ip : localIps) {
        // Create a UDP socket and bind to the interface IP with port 0
        // (let the OS pick a free port)
        int sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP));
        if (sock < 0) {
            CS_LOG(WARN, "ICE: socket() failed for %s: %d", ip.c_str(), cs_socket_error());
            continue;
        }

        // Allow address reuse
        int reuse = 1;
        ::setsockopt(sock, SOL_SOCKET, SO_REUSEADDR,
                     reinterpret_cast<const char*>(&reuse), sizeof(reuse));

        struct sockaddr_in bindAddr = {};
        bindAddr.sin_family = AF_INET;
        bindAddr.sin_port   = 0;  // OS-assigned
        ::inet_pton(AF_INET, ip.c_str(), &bindAddr.sin_addr);

        if (::bind(sock, reinterpret_cast<sockaddr*>(&bindAddr),
                   sizeof(bindAddr)) != 0) {
            CS_LOG(WARN, "ICE: bind failed on %s: %d", ip.c_str(), cs_socket_error());
            cs_close_socket(sock);
            continue;
        }

        // Read back the assigned port
        struct sockaddr_in boundAddr = {};
        socklen_t addrLen = sizeof(boundAddr);
        ::getsockname(sock, reinterpret_cast<sockaddr*>(&boundAddr), &addrLen);
        uint16_t boundPort = ntohs(boundAddr.sin_port);

        IceCandidate cand;
        cand.type       = "host";
        cand.ip         = ip;
        cand.port       = boundPort;
        cand.priority   = computePriority("host", localPrefCounter--, 1);
        cand.foundation = "host_" + ip;

        local_candidates_.push_back(cand);
        local_sockets_.push_back(sock);

        CS_LOG(INFO, "ICE: host candidate %s:%u (fd=%d)",
               ip.c_str(), boundPort, sock);
    }

    // -- 2. Gather server-reflexive candidates via STUN --
    StunClient stun;

    for (const auto& server : stun_servers_) {
        // Parse optional port from "host:port" format
        std::string host = server;
        uint16_t    port = DEFAULT_STUN_PORT;

        auto colon = server.rfind(':');
        if (colon != std::string::npos) {
            host = server.substr(0, colon);
            port = static_cast<uint16_t>(std::stoi(server.substr(colon + 1)));
        }

        // Query from each local socket
        for (size_t i = 0; i < local_sockets_.size(); ++i) {
            auto result = stun.discoverPublicEndpoint(host, port,
                                                      local_sockets_[i]);
            if (!result.success) continue;

            // Avoid duplicates
            bool dup = false;
            for (const auto& c : local_candidates_) {
                if (c.ip == result.public_ip && c.port == result.public_port) {
                    dup = true;
                    break;
                }
            }
            if (dup) continue;

            IceCandidate cand;
            cand.type       = "srflx";
            cand.ip         = result.public_ip;
            cand.port       = result.public_port;
            cand.priority   = computePriority("srflx", localPrefCounter--, 1);
            cand.foundation = "srflx_" + result.public_ip;

            local_candidates_.push_back(cand);
            // srflx candidates share the socket of the host candidate that
            // generated them.  We store the same socket fd; it will only be
            // closed once (tracked by the host entry index).
            local_sockets_.push_back(local_sockets_[i]);

            CS_LOG(INFO, "ICE: srflx candidate %s:%u (via %s, fd=%d)",
                   result.public_ip.c_str(), result.public_port,
                   server.c_str(), local_sockets_[i]);
        }
    }

    return local_candidates_;
}

// ---------------------------------------------------------------------------
// addRemoteCandidate
// ---------------------------------------------------------------------------
void IceAgent::addRemoteCandidate(const IceCandidate& candidate) {
    std::lock_guard<std::mutex> lock(remote_mutex_);
    remote_candidates_.push_back(candidate);
    CS_LOG(DEBUG, "ICE: added remote candidate %s %s:%u",
           candidate.type.c_str(), candidate.ip.c_str(), candidate.port);
}

// ---------------------------------------------------------------------------
// startConnectivityChecks
// ---------------------------------------------------------------------------
bool IceAgent::startConnectivityChecks() {
    std::lock_guard<std::mutex> lock(remote_mutex_);
    if (remote_candidates_.empty() || local_candidates_.empty()) {
        CS_LOG(WARN, "ICE: cannot start checks -- no candidates");
        return false;
    }
    if (running_.load()) {
        CS_LOG(WARN, "ICE: checks already running");
        return false;
    }

    running_.store(true);
    connected_.store(false);
    worker_ = std::thread(&IceAgent::connectivityCheckLoop, this);
    return true;
}

// ---------------------------------------------------------------------------
// connectivityCheckLoop -- background thread
//
// Strategy: for each (local, remote) pair, send a probe packet every 200 ms.
// Simultaneously listen on all local sockets for incoming probes.  The first
// pair to receive a valid probe response wins.
// ---------------------------------------------------------------------------
void IceAgent::connectivityCheckLoop() {
    CS_LOG(INFO, "ICE: connectivity check thread started");

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);

    // Snapshot remote candidates (they shouldn't change during checks, but
    // holding the lock for 5 seconds is undesirable).
    std::vector<IceCandidate> remotes;
    {
        std::lock_guard<std::mutex> lock(remote_mutex_);
        remotes = remote_candidates_;
    }

    // Put all local sockets into non-blocking mode
    for (int s : local_sockets_) {
        cs_set_nonblocking(s);
    }

    // Precompute destination sockaddrs for each remote candidate
    struct RemoteAddr {
        struct sockaddr_in addr;
        size_t remoteIdx;
    };
    std::vector<RemoteAddr> dests;
    for (size_t ri = 0; ri < remotes.size(); ++ri) {
        RemoteAddr ra;
        std::memset(&ra.addr, 0, sizeof(ra.addr));
        ra.addr.sin_family = AF_INET;
        ra.addr.sin_port   = htons(remotes[ri].port);
        ::inet_pton(AF_INET, remotes[ri].ip.c_str(), &ra.addr.sin_addr);
        ra.remoteIdx = ri;
        dests.push_back(ra);
    }

    auto lastSend = std::chrono::steady_clock::now() - std::chrono::seconds(1);

    while (running_.load() && !connected_.load()) {
        auto now = std::chrono::steady_clock::now();

        // Check timeout
        if (now >= deadline) {
            CS_LOG(WARN, "ICE: connectivity checks timed out after 5 s");
            running_.store(false);
            if (on_failed_) on_failed_();
            return;
        }

        // Send probes every 200 ms from each local socket to each remote addr
        if (now - lastSend >= std::chrono::milliseconds(200)) {
            lastSend = now;
            for (size_t li = 0; li < local_sockets_.size(); ++li) {
                for (const auto& dest : dests) {
                    ::sendto(local_sockets_[li],
                             reinterpret_cast<const char*>(PROBE_MAGIC),
                             sizeof(PROBE_MAGIC), 0,
                             reinterpret_cast<const sockaddr*>(&dest.addr),
                             sizeof(dest.addr));
                }
            }
        }

        // Build fd_set for all local sockets and poll for 50 ms
        fd_set rfds;
        FD_ZERO(&rfds);
        int maxfd = 0;
        for (int s : local_sockets_) {
            FD_SET(static_cast<unsigned int>(s), &rfds);
            if (s > maxfd) maxfd = s;
        }

        struct timeval tv;
        tv.tv_sec  = 0;
        tv.tv_usec = 50'000; // 50 ms

        int sel = ::select(maxfd + 1, &rfds, nullptr, nullptr, &tv);
        if (sel <= 0) continue;

        // Check which socket(s) have data
        for (size_t li = 0; li < local_sockets_.size(); ++li) {
            int s = local_sockets_[li];
            if (!FD_ISSET(static_cast<unsigned int>(s), &rfds)) continue;

            uint8_t buf[64];
            struct sockaddr_in from = {};
            socklen_t fromLen = sizeof(from);
            int n = ::recvfrom(s, reinterpret_cast<char*>(buf), sizeof(buf), 0,
                               reinterpret_cast<sockaddr*>(&from), &fromLen);
            if (n < static_cast<int>(sizeof(PROBE_MAGIC))) continue;

            // Verify the probe magic
            if (std::memcmp(buf, PROBE_MAGIC, sizeof(PROBE_MAGIC)) != 0) continue;

            // Identify which remote candidate this came from
            char fromIp[INET_ADDRSTRLEN] = {};
            ::inet_ntop(AF_INET, &from.sin_addr, fromIp, sizeof(fromIp));
            uint16_t fromPort = ntohs(from.sin_port);

            for (size_t ri = 0; ri < remotes.size(); ++ri) {
                if (remotes[ri].ip == fromIp && remotes[ri].port == fromPort) {
                    // We have a winning pair!
                    {
                        std::lock_guard<std::mutex> lock(result_mutex_);
                        selected_local_  = local_candidates_[li];
                        selected_remote_ = remotes[ri];
                        selected_socket_ = s;
                    }
                    connected_.store(true);
                    running_.store(false);

                    CS_LOG(INFO, "ICE: connected! local %s:%u <-> remote %s:%u (fd=%d)",
                           local_candidates_[li].ip.c_str(),
                           local_candidates_[li].port,
                           remotes[ri].ip.c_str(), remotes[ri].port, s);

                    // Connect the socket to the peer so the caller can just
                    // use send()/recv() without specifying the address.
                    ::connect(s, reinterpret_cast<const sockaddr*>(&from),
                              sizeof(from));

                    if (on_connected_) {
                        on_connected_(local_candidates_[li], remotes[ri]);
                    }
                    return;
                }
            }

            // Probe came from an unknown source -- possibly the peer is
            // using a port we haven't been told about.  Accept it anyway
            // as a "peer-reflexive" match against the first remote candidate
            // (best-effort).
            CS_LOG(INFO, "ICE: probe from unknown source %s:%u -- treating as peer-reflexive",
                   fromIp, fromPort);

            IceCandidate prflxRemote;
            prflxRemote.type       = "prflx";
            prflxRemote.ip         = fromIp;
            prflxRemote.port       = fromPort;
            prflxRemote.priority   = computePriority("srflx", 1, 1);
            prflxRemote.foundation = "prflx_" + std::string(fromIp);

            {
                std::lock_guard<std::mutex> lock(result_mutex_);
                selected_local_  = local_candidates_[li];
                selected_remote_ = prflxRemote;
                selected_socket_ = s;
            }
            connected_.store(true);
            running_.store(false);

            ::connect(s, reinterpret_cast<const sockaddr*>(&from),
                      sizeof(from));

            if (on_connected_) {
                on_connected_(local_candidates_[li], prflxRemote);
            }
            return;
        }
    }

    CS_LOG(WARN, "ICE: connectivity check loop exited without connection");
    if (!connected_.load() && on_failed_) {
        on_failed_();
    }
}

// ---------------------------------------------------------------------------
// getSelectedPair
// ---------------------------------------------------------------------------
std::pair<IceCandidate, IceCandidate> IceAgent::getSelectedPair() const {
    std::lock_guard<std::mutex> lock(result_mutex_);
    return {selected_local_, selected_remote_};
}

// ---------------------------------------------------------------------------
// getSocket
// ---------------------------------------------------------------------------
int IceAgent::getSocket() const {
    std::lock_guard<std::mutex> lock(result_mutex_);
    return selected_socket_;
}

// ---------------------------------------------------------------------------
// Callback setters
// ---------------------------------------------------------------------------
void IceAgent::setOnConnected(
        std::function<void(const IceCandidate&, const IceCandidate&)> cb) {
    on_connected_ = std::move(cb);
}

void IceAgent::setOnFailed(std::function<void()> cb) {
    on_failed_ = std::move(cb);
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------
void IceAgent::stop() {
    running_.store(false);
    if (worker_.joinable()) {
        worker_.join();
    }

    // Close all local sockets (deduplicate, since srflx entries share a fd)
    std::vector<int> closed;
    for (int s : local_sockets_) {
        if (s < 0) continue;
        if (std::find(closed.begin(), closed.end(), s) != closed.end()) continue;
        cs_close_socket(s);
        closed.push_back(s);
    }
    local_sockets_.clear();

    selected_socket_ = -1;
    CS_LOG(DEBUG, "ICE: agent stopped");
}

} // namespace cs
