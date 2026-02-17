///////////////////////////////////////////////////////////////////////////////
// controller_inject.h -- Virtual controller injection via ViGEmBus
//
// Creates virtual Xbox 360 controllers using the ViGEmBus driver and
// injects controller state received from the remote viewer. Supports
// up to 4 simultaneous controllers (XInput limit).
//
// Graceful degradation: if ViGEmBus is not installed, logs a warning
// and silently drops controller packets.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cs/transport/packet.h>

#include <cstdint>
#include <mutex>
#include <array>

namespace cs::host {

class ControllerInjector {
public:
    ControllerInjector();
    ~ControllerInjector();

    // Non-copyable
    ControllerInjector(const ControllerInjector&) = delete;
    ControllerInjector& operator=(const ControllerInjector&) = delete;

    /// Initialize ViGEmBus client. Returns false if ViGEm is not installed.
    bool initialize();

    /// Inject a controller state update. Creates the virtual controller
    /// on first use for the given controller_id.
    void inject(const cs::ControllerPacket& pkt);

    /// Release all virtual controllers and disconnect from ViGEmBus.
    void release();

    /// Returns true if ViGEmBus is available.
    bool isAvailable() const { return available_; }

private:
    /// Create a virtual X360 controller for the given slot.
    bool createController(uint8_t index);

    // ViGEmBus client handle (PVIGEM_CLIENT)
    void* client_ = nullptr;

    // Virtual controller targets (PVIGEM_TARGET), up to 4
    std::array<void*, 4> targets_ = {nullptr, nullptr, nullptr, nullptr};

    // Sequence tracking per controller for out-of-order detection
    std::array<uint16_t, 4> last_seq_ = {0, 0, 0, 0};
    std::array<bool, 4>     seq_initialized_ = {false, false, false, false};

    bool available_ = false;
    std::mutex mutex_;
};

} // namespace cs::host
