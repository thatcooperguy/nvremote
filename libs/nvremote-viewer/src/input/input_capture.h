///////////////////////////////////////////////////////////////////////////////
// input_capture.h -- Mouse/keyboard input capture from the viewer window
//
// Hooks into the viewer window's message loop to capture mouse and
// keyboard events. Uses Raw Input (WM_INPUT) for high-precision relative
// mouse movement and standard WM_KEY* / WM_MOUSEBUTTON* for other events.
//
// Input capture can be toggled on/off (disabled when the window loses
// focus to prevent accidental input theft).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <functional>
#include <mutex>
#include <atomic>

#ifdef _WIN32
#include <windows.h>
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Input event types and structures
// ---------------------------------------------------------------------------

enum class InputEventType : uint8_t {
    MOUSE_MOVE   = 1,
    MOUSE_BUTTON = 2,
    KEY          = 3,
    SCROLL       = 4,
};

struct InputEvent {
    InputEventType type;

    union {
        struct {
            int16_t dx;
            int16_t dy;
            uint8_t buttons;   // Bitmask of held buttons
        } mouse_move;

        struct {
            uint8_t button;    // 0=left, 1=right, 2=middle, 3=x1, 4=x2
            uint8_t action;    // 0=release, 1=press
        } mouse_button;

        struct {
            uint16_t keycode;  // Virtual key code
            uint8_t  action;   // 0=release, 1=press
            uint8_t  modifiers; // 1=Shift, 2=Ctrl, 4=Alt, 8=Meta
        } key;

        struct {
            int16_t dx;        // Horizontal scroll
            int16_t dy;        // Vertical scroll (positive = up)
        } scroll;
    };

    InputEvent() : type(InputEventType::MOUSE_MOVE) {
        std::memset(&mouse_move, 0, sizeof(mouse_move));
    }
};

/// Callback type for captured input events.
using InputCallback = std::function<void(const InputEvent& event)>;

// ---------------------------------------------------------------------------
// InputCapture class
// ---------------------------------------------------------------------------

class InputCapture {
public:
    InputCapture();
    ~InputCapture();

    // Non-copyable
    InputCapture(const InputCapture&) = delete;
    InputCapture& operator=(const InputCapture&) = delete;

#ifdef _WIN32
    /// Initialize input capture for the given window.
    bool initialize(HWND hwnd);
#endif

    /// Set the callback for captured input events.
    void setCallback(InputCallback cb);

    /// Enable or disable input capture.
    /// When disabled, events are not forwarded to the callback.
    void setEnabled(bool enabled);

    /// Returns true if input capture is enabled.
    bool isEnabled() const;

    /// Release resources and unhook from the window.
    void release();

    /// Get current modifier key state.
    uint8_t getModifiers() const;

private:
#ifdef _WIN32
    /// Window procedure that intercepts messages for input capture.
    static LRESULT CALLBACK inputWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);

    /// Register for Raw Input (mouse).
    bool registerRawInput();

    /// Process a raw input message.
    void processRawInput(LPARAM lParam);

    /// Process keyboard messages.
    void processKeyMessage(UINT msg, WPARAM wParam, LPARAM lParam);

    /// Process mouse button messages.
    void processMouseButtonMessage(UINT msg, WPARAM wParam, LPARAM lParam);

    /// Process mouse wheel messages.
    void processScrollMessage(UINT msg, WPARAM wParam, LPARAM lParam);

    HWND     hwnd_          = nullptr;
    WNDPROC  original_proc_ = nullptr;  // Original window procedure (for chaining)
#endif

    InputCallback callback_;
    std::atomic<bool> enabled_{false};
    bool initialized_ = false;

    // Modifier key tracking
    std::atomic<uint8_t> modifiers_{0};

    std::mutex mutex_;
};

} // namespace cs
