///////////////////////////////////////////////////////////////////////////////
// input_capture.cpp -- Mouse/keyboard input capture from the viewer window
//
// Subclasses the target HWND's window procedure to intercept input
// messages. Uses Raw Input (WM_INPUT) for high-precision relative mouse
// movement data from the HID driver, bypassing mouse acceleration.
///////////////////////////////////////////////////////////////////////////////

#include "input_capture.h"

#include <cs/common.h>

#include <cstring>

#ifdef _WIN32
#include <hidusage.h>
#endif

namespace cs {

#ifdef _WIN32
// Static map from HWND -> InputCapture* for the window procedure callback.
// We use a simple approach: store the InputCapture pointer in the window's
// GWLP_USERDATA property during subclassing.
#endif

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

InputCapture::InputCapture() = default;

InputCapture::~InputCapture() {
    release();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#ifdef _WIN32
bool InputCapture::initialize(HWND hwnd) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        release();
    }

    hwnd_ = hwnd;

    // Store this pointer in the window's user data for the WndProc
    SetWindowLongPtr(hwnd_, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));

    // Subclass the window procedure
    original_proc_ = reinterpret_cast<WNDPROC>(
        SetWindowLongPtr(hwnd_, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(inputWndProc))
    );

    if (!original_proc_) {
        CS_LOG(ERR, "InputCapture: SetWindowLongPtr failed: %lu", GetLastError());
        return false;
    }

    // Register for Raw Input (mouse)
    if (!registerRawInput()) {
        CS_LOG(WARN, "InputCapture: Raw Input registration failed, using fallback");
        // Non-fatal: we can still use WM_MOUSEMOVE as fallback
    }

    initialized_ = true;
    CS_LOG(INFO, "InputCapture: initialized on HWND %p", hwnd);
    return true;
}
#endif

// ---------------------------------------------------------------------------
// setCallback
// ---------------------------------------------------------------------------

void InputCapture::setCallback(InputCallback cb) {
    std::lock_guard<std::mutex> lock(mutex_);
    callback_ = std::move(cb);
}

// ---------------------------------------------------------------------------
// setEnabled / isEnabled
// ---------------------------------------------------------------------------

void InputCapture::setEnabled(bool enabled) {
    enabled_.store(enabled);
}

bool InputCapture::isEnabled() const {
    return enabled_.load();
}

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

void InputCapture::release() {
    std::lock_guard<std::mutex> lock(mutex_);

#ifdef _WIN32
    if (initialized_ && hwnd_ && original_proc_) {
        // Restore the original window procedure
        SetWindowLongPtr(hwnd_, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(original_proc_));
        SetWindowLongPtr(hwnd_, GWLP_USERDATA, 0);
        original_proc_ = nullptr;

        // Unregister Raw Input
        RAWINPUTDEVICE rid = {};
        rid.usUsagePage = HID_USAGE_PAGE_GENERIC;
        rid.usUsage = HID_USAGE_GENERIC_MOUSE;
        rid.dwFlags = RIDEV_REMOVE;
        rid.hwndTarget = nullptr;
        RegisterRawInputDevices(&rid, 1, sizeof(rid));
    }

    hwnd_ = nullptr;
#endif

    initialized_ = false;
    enabled_.store(false);
    CS_LOG(INFO, "InputCapture: released");
}

// ---------------------------------------------------------------------------
// getModifiers
// ---------------------------------------------------------------------------

uint8_t InputCapture::getModifiers() const {
    return modifiers_.load();
}

// ---------------------------------------------------------------------------
// Windows-specific implementation
// ---------------------------------------------------------------------------

#ifdef _WIN32

bool InputCapture::registerRawInput() {
    RAWINPUTDEVICE rid = {};
    rid.usUsagePage = HID_USAGE_PAGE_GENERIC;
    rid.usUsage = HID_USAGE_GENERIC_MOUSE;
    rid.dwFlags = RIDEV_INPUTSINK;  // Receive input even when not focused
    rid.hwndTarget = hwnd_;

    if (!RegisterRawInputDevices(&rid, 1, sizeof(rid))) {
        CS_LOG(ERR, "InputCapture: RegisterRawInputDevices failed: %lu", GetLastError());
        return false;
    }

    return true;
}

LRESULT CALLBACK InputCapture::inputWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    auto* self = reinterpret_cast<InputCapture*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
    if (!self || !self->enabled_.load()) {
        if (self && self->original_proc_) {
            return CallWindowProc(self->original_proc_, hwnd, msg, wParam, lParam);
        }
        return DefWindowProc(hwnd, msg, wParam, lParam);
    }

    switch (msg) {
        case WM_INPUT:
            self->processRawInput(lParam);
            break;

        case WM_KEYDOWN:
        case WM_KEYUP:
        case WM_SYSKEYDOWN:
        case WM_SYSKEYUP:
            self->processKeyMessage(msg, wParam, lParam);
            break;

        case WM_LBUTTONDOWN:
        case WM_LBUTTONUP:
        case WM_RBUTTONDOWN:
        case WM_RBUTTONUP:
        case WM_MBUTTONDOWN:
        case WM_MBUTTONUP:
        case WM_XBUTTONDOWN:
        case WM_XBUTTONUP:
            self->processMouseButtonMessage(msg, wParam, lParam);
            break;

        case WM_MOUSEWHEEL:
        case WM_MOUSEHWHEEL:
            self->processScrollMessage(msg, wParam, lParam);
            break;

        case WM_SETFOCUS:
            self->enabled_.store(true);
            break;

        case WM_KILLFOCUS:
            // Optionally disable capture when losing focus
            // self->enabled_.store(false);
            break;
    }

    // Chain to the original window procedure
    if (self->original_proc_) {
        return CallWindowProc(self->original_proc_, hwnd, msg, wParam, lParam);
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

void InputCapture::processRawInput(LPARAM lParam) {
    UINT size = 0;
    GetRawInputData(reinterpret_cast<HRAWINPUT>(lParam), RID_INPUT, nullptr, &size,
                     sizeof(RAWINPUTHEADER));

    if (size == 0) return;

    std::vector<uint8_t> buf(size);
    UINT result = GetRawInputData(reinterpret_cast<HRAWINPUT>(lParam), RID_INPUT,
                                   buf.data(), &size, sizeof(RAWINPUTHEADER));
    if (result == UINT(-1)) return;

    auto* raw = reinterpret_cast<RAWINPUT*>(buf.data());
    if (raw->header.dwType != RIM_TYPEMOUSE) return;

    const RAWMOUSE& mouse = raw->data.mouse;

    // Only process relative movement (not absolute)
    if ((mouse.usFlags & MOUSE_MOVE_ABSOLUTE) != 0) return;

    if (mouse.lLastX != 0 || mouse.lLastY != 0) {
        InputEvent event;
        event.type = InputEventType::MOUSE_MOVE;
        event.mouse_move.dx = static_cast<int16_t>(mouse.lLastX);
        event.mouse_move.dy = static_cast<int16_t>(mouse.lLastY);

        // Get current button state
        uint8_t buttons = 0;
        if (GetAsyncKeyState(VK_LBUTTON) & 0x8000) buttons |= 0x01;
        if (GetAsyncKeyState(VK_RBUTTON) & 0x8000) buttons |= 0x02;
        if (GetAsyncKeyState(VK_MBUTTON) & 0x8000) buttons |= 0x04;
        event.mouse_move.buttons = buttons;

        std::lock_guard<std::mutex> lock(mutex_);
        if (callback_) callback_(event);
    }
}

void InputCapture::processKeyMessage(UINT msg, WPARAM wParam, LPARAM /*lParam*/) {
    InputEvent event;
    event.type = InputEventType::KEY;
    event.key.keycode = static_cast<uint16_t>(wParam);
    event.key.action = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) ? 1 : 0;

    // Update modifier tracking
    uint8_t mods = 0;
    if (GetAsyncKeyState(VK_SHIFT) & 0x8000)   mods |= 0x01;
    if (GetAsyncKeyState(VK_CONTROL) & 0x8000)  mods |= 0x02;
    if (GetAsyncKeyState(VK_MENU) & 0x8000)     mods |= 0x04;  // Alt
    if ((GetAsyncKeyState(VK_LWIN) | GetAsyncKeyState(VK_RWIN)) & 0x8000) mods |= 0x08;  // Meta
    event.key.modifiers = mods;
    modifiers_.store(mods);

    std::lock_guard<std::mutex> lock(mutex_);
    if (callback_) callback_(event);
}

void InputCapture::processMouseButtonMessage(UINT msg, WPARAM wParam, LPARAM /*lParam*/) {
    InputEvent event;
    event.type = InputEventType::MOUSE_BUTTON;

    switch (msg) {
        case WM_LBUTTONDOWN:
            event.mouse_button.button = 0;
            event.mouse_button.action = 1;
            break;
        case WM_LBUTTONUP:
            event.mouse_button.button = 0;
            event.mouse_button.action = 0;
            break;
        case WM_RBUTTONDOWN:
            event.mouse_button.button = 1;
            event.mouse_button.action = 1;
            break;
        case WM_RBUTTONUP:
            event.mouse_button.button = 1;
            event.mouse_button.action = 0;
            break;
        case WM_MBUTTONDOWN:
            event.mouse_button.button = 2;
            event.mouse_button.action = 1;
            break;
        case WM_MBUTTONUP:
            event.mouse_button.button = 2;
            event.mouse_button.action = 0;
            break;
        case WM_XBUTTONDOWN:
        case WM_XBUTTONUP: {
            WORD xbutton = GET_XBUTTON_WPARAM(wParam);
            event.mouse_button.button = (xbutton == XBUTTON1) ? 3 : 4;
            event.mouse_button.action = (msg == WM_XBUTTONDOWN) ? 1 : 0;
            break;
        }
        default:
            return;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    if (callback_) callback_(event);
}

void InputCapture::processScrollMessage(UINT msg, WPARAM wParam, LPARAM /*lParam*/) {
    InputEvent event;
    event.type = InputEventType::SCROLL;

    short delta = static_cast<short>(GET_WHEEL_DELTA_WPARAM(wParam));
    // Normalize: WHEEL_DELTA (120) = 1 tick
    int16_t ticks = static_cast<int16_t>(delta / WHEEL_DELTA);

    if (msg == WM_MOUSEWHEEL) {
        event.scroll.dx = 0;
        event.scroll.dy = ticks;
    } else {
        // WM_MOUSEHWHEEL: horizontal scroll
        event.scroll.dx = ticks;
        event.scroll.dy = 0;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    if (callback_) callback_(event);
}

#endif  // _WIN32

} // namespace cs
