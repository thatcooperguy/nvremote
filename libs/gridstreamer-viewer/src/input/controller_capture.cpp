///////////////////////////////////////////////////////////////////////////////
// controller_capture.cpp -- XInput controller state capture
//
// Polls XInput at ~120Hz. Sends full-state ControllerPacket on change.
///////////////////////////////////////////////////////////////////////////////

#include "controller_capture.h"

#include <cs/common.h>

#ifdef _WIN32
#include <windows.h>
#include <xinput.h>
#pragma comment(lib, "xinput.lib")
#endif

#include <chrono>
#include <cstring>

namespace cs {

// Poll interval: ~8.3ms = 120Hz
static constexpr auto kPollInterval = std::chrono::microseconds(8333);

// Deadzone threshold for analog sticks (matching XInput defaults)
static constexpr int16_t kLeftStickDeadzone  = 7849;
static constexpr int16_t kRightStickDeadzone = 8689;
static constexpr uint8_t kTriggerDeadzone    = 30;

// Apply deadzone to a stick axis value
static int16_t applyDeadzone(int16_t value, int16_t deadzone) {
    if (value > deadzone)  return value;
    if (value < -deadzone) return value;
    return 0;
}

ControllerCapture::ControllerCapture() = default;

ControllerCapture::~ControllerCapture() {
    stop();
}

bool ControllerCapture::start(OnStateChange callback) {
    if (running_.load()) return false;

    callback_ = std::move(callback);
    running_.store(true);

    std::memset(last_state_, 0, sizeof(last_state_));

    thread_ = std::thread(&ControllerCapture::pollThread, this);
    CS_LOG(INFO, "Controller capture started (120Hz polling)");
    return true;
}

void ControllerCapture::stop() {
    running_.store(false);
    if (thread_.joinable()) {
        thread_.join();
    }
    CS_LOG(INFO, "Controller capture stopped");
}

bool ControllerCapture::hasController() const {
    return has_controller_.load();
}

void ControllerCapture::pollThread() {
#ifdef _WIN32
    while (running_.load()) {
        auto start = std::chrono::steady_clock::now();

        bool any_connected = false;

        for (uint8_t i = 0; i < 4; i++) {
            XINPUT_STATE state = {};
            DWORD result = XInputGetState(i, &state);

            if (result != ERROR_SUCCESS) {
                if (last_state_[i].connected) {
                    last_state_[i].connected = false;
                    CS_LOG(INFO, "Controller %u disconnected", i);
                }
                continue;
            }

            any_connected = true;

            if (!last_state_[i].connected) {
                last_state_[i].connected = true;
                CS_LOG(INFO, "Controller %u connected", i);
            }

            // Apply deadzones
            int16_t lx = applyDeadzone(state.Gamepad.sThumbLX, kLeftStickDeadzone);
            int16_t ly = applyDeadzone(state.Gamepad.sThumbLY, kLeftStickDeadzone);
            int16_t rx = applyDeadzone(state.Gamepad.sThumbRX, kRightStickDeadzone);
            int16_t ry = applyDeadzone(state.Gamepad.sThumbRY, kRightStickDeadzone);
            uint8_t lt = (state.Gamepad.bLeftTrigger  > kTriggerDeadzone) ? state.Gamepad.bLeftTrigger  : 0;
            uint8_t rt = (state.Gamepad.bRightTrigger > kTriggerDeadzone) ? state.Gamepad.bRightTrigger : 0;
            uint16_t buttons = state.Gamepad.wButtons;

            // Check if state changed
            auto& last = last_state_[i];
            if (buttons == last.buttons &&
                lt == last.left_trigger && rt == last.right_trigger &&
                lx == last.thumb_lx && ly == last.thumb_ly &&
                rx == last.thumb_rx && ry == last.thumb_ry) {
                continue;  // No change
            }

            // Update last known state
            last.buttons       = buttons;
            last.left_trigger  = lt;
            last.right_trigger = rt;
            last.thumb_lx      = lx;
            last.thumb_ly      = ly;
            last.thumb_rx      = rx;
            last.thumb_ry      = ry;

            // Build and send packet
            ControllerPacket pkt = {};
            pkt.type           = static_cast<uint8_t>(PacketType::CONTROLLER);
            pkt.controller_id  = i;
            pkt.buttons        = buttons;
            pkt.left_trigger   = lt;
            pkt.right_trigger  = rt;
            pkt.thumb_lx       = lx;
            pkt.thumb_ly       = ly;
            pkt.thumb_rx       = rx;
            pkt.thumb_ry       = ry;

            {
                std::lock_guard<std::mutex> lock(mutex_);
                pkt.sequence = seq_++;
            }

            if (callback_) {
                callback_(pkt);
            }
        }

        has_controller_.store(any_connected);

        // Sleep until next poll interval
        auto elapsed = std::chrono::steady_clock::now() - start;
        auto remaining = kPollInterval - elapsed;
        if (remaining.count() > 0) {
            std::this_thread::sleep_for(remaining);
        }
    }
#else
    // Non-Windows: no XInput, thread exits immediately
    CS_LOG(WARN, "Controller capture not available on this platform");
#endif
}

} // namespace cs
