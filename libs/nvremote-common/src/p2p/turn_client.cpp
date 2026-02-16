///////////////////////////////////////////////////////////////////////////////
// turn_client.cpp -- TURN relay client stub (RFC 5766)
//
// Provides stub implementations so the library links successfully.
// Full TURN relay support will be implemented in a future release.
///////////////////////////////////////////////////////////////////////////////

#include "cs/p2p/turn_client.h"
#include "cs/common.h"

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------
TurnClient::TurnClient(const TurnConfig& config)
    : config_(config)
{
    CS_LOG(INFO, "TurnClient created (server=%s:%u) [stub]",
           config_.server.c_str(), config_.port);
}

TurnClient::~TurnClient() {
    close();
}

// ---------------------------------------------------------------------------
// allocate()
// ---------------------------------------------------------------------------
TurnAllocation TurnClient::allocate() {
    CS_LOG(WARN, "TurnClient::allocate() called but TURN relay is not yet implemented");
    TurnAllocation result;
    result.success = false;
    return result;
}

// ---------------------------------------------------------------------------
// createPermission()
// ---------------------------------------------------------------------------
bool TurnClient::createPermission(const std::string& peer_ip) {
    CS_LOG(WARN, "TurnClient::createPermission(%s) called but TURN relay is not yet implemented",
           peer_ip.c_str());
    return false;
}

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------
bool TurnClient::refresh(uint32_t lifetime) {
    CS_LOG(WARN, "TurnClient::refresh(%u) called but TURN relay is not yet implemented",
           lifetime);
    return false;
}

// ---------------------------------------------------------------------------
// sendData()
// ---------------------------------------------------------------------------
bool TurnClient::sendData(const uint8_t* /*data*/, size_t /*len*/,
                          const std::string& peer_ip, uint16_t peer_port) {
    CS_LOG(WARN, "TurnClient::sendData() to %s:%u called but TURN relay is not yet implemented",
           peer_ip.c_str(), peer_port);
    return false;
}

// ---------------------------------------------------------------------------
// setOnData()
// ---------------------------------------------------------------------------
void TurnClient::setOnData(std::function<void(const uint8_t*, size_t,
                                               const std::string&, uint16_t)> cb) {
    on_data_ = std::move(cb);
}

// ---------------------------------------------------------------------------
// close()
// ---------------------------------------------------------------------------
void TurnClient::close() {
    if (allocated_.exchange(false)) {
        CS_LOG(INFO, "TurnClient closed [stub]");
    }
}

// ---------------------------------------------------------------------------
// Private helpers (stubs)
// ---------------------------------------------------------------------------
int TurnClient::createSocket() {
    return -1;
}

bool TurnClient::sendAllocateRequest(int /*sock*/, const std::string& /*nonce*/) {
    return false;
}

bool TurnClient::parseAllocateResponse(const uint8_t* /*data*/, size_t /*len*/) {
    return false;
}

bool TurnClient::sendCreatePermission(const std::string& /*peer_ip*/) {
    return false;
}

} // namespace cs
