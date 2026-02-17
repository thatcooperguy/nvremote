///////////////////////////////////////////////////////////////////////////////
// controller_capture.h -- XInput controller state capture
//
// Polls XInput controllers at 120Hz on a dedicated thread.  Sends full
// state packets on-change only (not deltas) so lost packets self-heal.
// Supports up to 4 controllers (XInput hardware limit).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <atomic>
#include <thread>
#include <functional>
#include <mutex>

#include <cs/transport/packet.h>

namespace cs {

class ControllerCapture {
public:
    ControllerCapture();
    ~ControllerCapture();

    // Non-copyable
    ControllerCapture(const ControllerCapture&) = delete;
    ControllerCapture& operator=(const ControllerCapture&) = delete;

    /// Callback invoked when controller state changes.
    using OnStateChange = std::function<void(const ControllerPacket& pkt)>;

    /// Start polling. Returns true on success.
    bool start(OnStateChange callback);

    /// Stop polling thread.
    void stop();

    /// Returns true if at least one controller is connected.
    bool hasController() const;

private:
    void pollThread();

    OnStateChange callback_;
    std::thread   thread_;
    std::atomic<bool> running_{false};
    std::atomic<bool> has_controller_{false};

    // Last known state per controller (for on-change detection)
    struct ControllerState {
        uint16_t buttons       = 0;
        uint8_t  left_trigger  = 0;
        uint8_t  right_trigger = 0;
        int16_t  thumb_lx      = 0;
        int16_t  thumb_ly      = 0;
        int16_t  thumb_rx      = 0;
        int16_t  thumb_ry      = 0;
        bool     connected     = false;
    };
    ControllerState last_state_[4];

    uint16_t seq_ = 0;
    std::mutex mutex_;
};

} // namespace cs
