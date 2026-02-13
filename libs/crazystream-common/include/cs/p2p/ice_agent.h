///////////////////////////////////////////////////////////////////////////////
// ice_agent.h -- ICE-lite candidate gathering and connectivity checks
//
// Implements a simplified ICE agent that:
//   1. Gathers local "host" candidates from every non-loopback IPv4
//      interface on the machine.
//   2. Gathers "srflx" (server-reflexive) candidates by querying one or
//      more STUN servers.
//   3. Accepts remote candidates from the peer (exchanged via signaling).
//   4. Performs simultaneous connectivity checks (bidirectional UDP hole
//      punching) to find a working local/remote pair.
//   5. Notifies the caller when a pair is selected or when all checks fail.
//
// The probe protocol is deliberately simple: we send a 4-byte magic value
// (0x43 0x53 0x49 0x43 -- "CSIC") to each remote candidate from each
// local candidate, and wait for the same magic to come back.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "cs/p2p/stun_client.h"

#include <cstdint>
#include <string>
#include <vector>
#include <functional>
#include <mutex>
#include <atomic>
#include <thread>
#include <utility>

namespace cs {

/// A single ICE candidate (local or remote).
struct IceCandidate {
    std::string type;         // "host", "srflx", "relay"
    std::string ip;
    uint16_t    port       = 0;
    uint32_t    priority   = 0;
    std::string foundation; // opaque string used for frozen/unfrozen logic

    bool operator==(const IceCandidate& o) const {
        return type == o.type && ip == o.ip && port == o.port;
    }
};

class IceAgent {
public:
    /// Construct with a list of STUN server hostnames (port defaults to 3478).
    /// Example: {"stun.l.google.com", "stun1.l.google.com"}
    explicit IceAgent(const std::vector<std::string>& stun_servers);
    ~IceAgent();

    // Non-copyable
    IceAgent(const IceAgent&) = delete;
    IceAgent& operator=(const IceAgent&) = delete;

    /// Phase 1: gather local candidates.
    /// Enumerates host interfaces and queries STUN servers for srflx addresses.
    /// Returns the full list of gathered local candidates (host + srflx).
    std::vector<IceCandidate> gatherCandidates();

    /// Phase 2 (signaling): add a remote candidate received from the peer.
    void addRemoteCandidate(const IceCandidate& candidate);

    /// Phase 3: start connectivity checks against all remote candidates.
    /// Spawns a background thread that simultaneously probes every
    /// local-remote pair.  Returns true if the check thread was started,
    /// false if there are no candidates to check.
    bool startConnectivityChecks();

    /// Returns the winning (local, remote) pair once connectivity succeeds.
    /// If no pair has been selected yet both candidates will have empty ip
    /// fields.
    std::pair<IceCandidate, IceCandidate> getSelectedPair() const;

    /// Returns the connected UDP socket file descriptor, or -1 if not yet
    /// connected.  Ownership remains with IceAgent; callers must not close it.
    int getSocket() const;

    /// Register a callback fired when a candidate pair succeeds.
    void setOnConnected(std::function<void(const IceCandidate&,
                                           const IceCandidate&)> cb);

    /// Register a callback fired when all connectivity checks fail.
    void setOnFailed(std::function<void()> cb);

    /// Stop the agent: cancel any in-progress checks and close sockets.
    void stop();

private:
    /// Background thread entry point for connectivity checks.
    void connectivityCheckLoop();

    /// Compute ICE priority for a candidate.
    static uint32_t computePriority(const std::string& type,
                                    uint16_t localPref,
                                    uint16_t component);

    // STUN server list (host:port pairs; port defaults to 3478)
    std::vector<std::string> stun_servers_;
    static constexpr uint16_t DEFAULT_STUN_PORT = 3478;

    // Gathered local candidates and their associated sockets.
    // local_sockets_[i] is the UDP socket bound for local_candidates_[i].
    std::vector<IceCandidate> local_candidates_;
    std::vector<int>          local_sockets_;

    // Remote candidates supplied via addRemoteCandidate().
    mutable std::mutex         remote_mutex_;
    std::vector<IceCandidate>  remote_candidates_;

    // Result
    mutable std::mutex    result_mutex_;
    IceCandidate          selected_local_;
    IceCandidate          selected_remote_;
    int                   selected_socket_ = -1;

    // Callbacks
    std::function<void(const IceCandidate&, const IceCandidate&)> on_connected_;
    std::function<void()> on_failed_;

    // Worker
    std::thread      worker_;
    std::atomic<bool> running_{false};
    std::atomic<bool> connected_{false};

    // 4-byte magic for probe packets: "CSIC"
    static constexpr uint8_t PROBE_MAGIC[4] = {0x43, 0x53, 0x49, 0x43};
};

} // namespace cs
