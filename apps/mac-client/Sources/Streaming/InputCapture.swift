// InputCapture.swift — Mouse/keyboard/gamepad capture
// GridStreamer macOS Client
//
// Captures input events from the macOS system and forwards them to InputSender.
// Uses NSEvent global/local monitors for keyboard and mouse, CGEvent for
// relative mouse capture, and GCController for gamepad support.

import Foundation
import AppKit
import GameController
import CoreGraphics

/// Represents a captured input event ready for serialization and sending.
enum CapturedInputEvent: Sendable {
    case mouseMove(dx: Int16, dy: Int16, buttons: UInt8)
    case mouseButton(button: UInt8, pressed: Bool)
    case key(keycode: UInt16, pressed: Bool, modifiers: UInt8)
    case scroll(dx: Int16, dy: Int16)
    case gamepadButton(button: String, pressed: Bool)
    case gamepadAxis(axis: String, value: Float)
}

/// Callback type for captured input events.
typealias InputEventHandler = @Sendable (CapturedInputEvent) -> Void

/// Captures mouse, keyboard, and gamepad input from the system.
/// When enabled, the cursor is hidden and locked to the window for FPS-style
/// relative mouse input.
final class InputCapture: @unchecked Sendable {

    // MARK: - Properties

    private var localMouseMonitor: Any?
    private var localKeyMonitor: Any?
    private var globalKeyMonitor: Any?
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private let lock = NSLock()
    private var _isEnabled = false
    private var _isCursorLocked = false

    /// Handler called for each captured input event.
    var onInput: InputEventHandler?

    /// Whether input capture is currently enabled.
    var isEnabled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isEnabled
    }

    /// Whether the cursor is locked (hidden + confined to window).
    var isCursorLocked: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isCursorLocked
    }

    /// Current modifier key bitmask: 1=Shift, 2=Ctrl, 4=Alt/Option, 8=Cmd.
    private var currentModifiers: UInt8 = 0

    /// Current button state bitmask.
    private var currentButtons: UInt8 = 0

    /// The window to confine the cursor to when locked.
    weak var targetWindow: NSWindow?

    // MARK: - Initialization

    deinit {
        disable()
    }

    // MARK: - Enable / Disable

    /// Enable input capture. Installs event monitors and optionally locks the cursor.
    func enable(lockCursor: Bool = true) {
        lock.lock()
        guard !_isEnabled else {
            lock.unlock()
            return
        }
        _isEnabled = true
        lock.unlock()

        installEventMonitors()
        setupGamepadObservation()

        if lockCursor {
            self.lockCursor()
        }
    }

    /// Disable input capture. Removes all event monitors and unlocks the cursor.
    func disable() {
        lock.lock()
        guard _isEnabled else {
            lock.unlock()
            return
        }
        _isEnabled = false
        lock.unlock()

        removeEventMonitors()
        unlockCursor()
    }

    // MARK: - Cursor Lock

    /// Lock the cursor: hide it and capture relative mouse movement.
    func lockCursor() {
        lock.lock()
        _isCursorLocked = true
        lock.unlock()

        DispatchQueue.main.async {
            NSCursor.hide()
            CGAssociateMouseAndMouseCursorPosition(0)  // Dissociate to get raw deltas
        }

        installMouseEventTap()
    }

    /// Unlock the cursor: show it and stop capturing relative movement.
    func unlockCursor() {
        lock.lock()
        _isCursorLocked = false
        lock.unlock()

        removeMouseEventTap()

        DispatchQueue.main.async {
            CGAssociateMouseAndMouseCursorPosition(1)  // Re-associate
            NSCursor.unhide()
        }
    }

    /// Toggle the cursor lock state. Typically bound to a hotkey (e.g., Cmd+Shift+M).
    func toggleCursorLock() {
        if isCursorLocked {
            unlockCursor()
        } else {
            lockCursor()
        }
    }

    // MARK: - Event Monitors (Keyboard + Mouse Buttons + Scroll)

    private func installEventMonitors() {
        // Local monitor for key events
        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged]) { [weak self] event in
            self?.handleKeyEvent(event)
            return nil  // Consume the event (don't forward to the app)
        }

        // Local monitor for mouse button events
        localMouseMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
                       .otherMouseDown, .otherMouseUp, .scrollWheel]
        ) { [weak self] event in
            self?.handleMouseButtonOrScroll(event)
            return nil
        }
    }

    private func removeEventMonitors() {
        if let monitor = localKeyMonitor {
            NSEvent.removeMonitor(monitor)
            localKeyMonitor = nil
        }
        if let monitor = localMouseMonitor {
            NSEvent.removeMonitor(monitor)
            localMouseMonitor = nil
        }
        if let monitor = globalKeyMonitor {
            NSEvent.removeMonitor(monitor)
            globalKeyMonitor = nil
        }
    }

    // MARK: - Mouse Event Tap (Relative Movement)

    /// Install a CGEvent tap to capture raw mouse deltas for relative movement.
    private func installMouseEventTap() {
        let eventMask: CGEventMask = (1 << CGEventType.mouseMoved.rawValue) |
                                     (1 << CGEventType.leftMouseDragged.rawValue) |
                                     (1 << CGEventType.rightMouseDragged.rawValue) |
                                     (1 << CGEventType.otherMouseDragged.rawValue)

        let callback: CGEventTapCallBack = { proxy, type, event, refcon in
            guard let refcon else { return Unmanaged.passUnretained(event) }
            let capture = Unmanaged<InputCapture>.fromOpaque(refcon).takeUnretainedValue()

            let dx = event.getIntegerValueField(.mouseEventDeltaX)
            let dy = event.getIntegerValueField(.mouseEventDeltaY)

            if dx != 0 || dy != 0 {
                let clampedDx = Int16(clamping: dx)
                let clampedDy = Int16(clamping: dy)
                capture.onInput?(.mouseMove(dx: clampedDx, dy: clampedDy, buttons: capture.currentButtons))
            }

            return Unmanaged.passUnretained(event)
        }

        let tap = CGEvent.tapCreate(
            tap: .cghidEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: eventMask,
            callback: callback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        )

        guard let tap else {
            print("[InputCapture] Failed to create event tap. Check Accessibility permissions.")
            return
        }

        self.eventTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        self.runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    private func removeMouseEventTap() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
            if let source = runLoopSource {
                CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes)
            }
            // CFMachPort is managed by the system; setting to nil releases our reference
            eventTap = nil
            runLoopSource = nil
        }
    }

    // MARK: - Key Event Handling

    private func handleKeyEvent(_ event: NSEvent) {
        guard isEnabled else { return }

        if event.type == .flagsChanged {
            updateModifiers(from: event)
            return
        }

        let pressed = event.type == .keyDown
        let keycode = event.keyCode

        // Check for cursor unlock hotkey: Cmd+Shift+Escape
        if pressed && keycode == 0x35 /* Escape */ && currentModifiers & 0x0A == 0x0A {
            toggleCursorLock()
            return
        }

        updateModifiers(from: event)

        onInput?(.key(keycode: UInt16(keycode), pressed: pressed, modifiers: currentModifiers))
    }

    /// Update the modifier bitmask from an NSEvent.
    private func updateModifiers(from event: NSEvent) {
        var mods: UInt8 = 0
        if event.modifierFlags.contains(.shift)   { mods |= 1 }
        if event.modifierFlags.contains(.control)  { mods |= 2 }
        if event.modifierFlags.contains(.option)   { mods |= 4 }
        if event.modifierFlags.contains(.command)  { mods |= 8 }
        currentModifiers = mods
    }

    // MARK: - Mouse Button / Scroll Handling

    private func handleMouseButtonOrScroll(_ event: NSEvent) {
        guard isEnabled else { return }

        switch event.type {
        case .leftMouseDown:
            currentButtons |= 1
            onInput?(.mouseButton(button: 0, pressed: true))
        case .leftMouseUp:
            currentButtons &= ~1
            onInput?(.mouseButton(button: 0, pressed: false))
        case .rightMouseDown:
            currentButtons |= 2
            onInput?(.mouseButton(button: 1, pressed: true))
        case .rightMouseUp:
            currentButtons &= ~2
            onInput?(.mouseButton(button: 1, pressed: false))
        case .otherMouseDown:
            let btn = UInt8(event.buttonNumber)
            currentButtons |= (1 << min(btn, 7))
            onInput?(.mouseButton(button: btn, pressed: true))
        case .otherMouseUp:
            let btn = UInt8(event.buttonNumber)
            currentButtons &= ~(1 << min(btn, 7))
            onInput?(.mouseButton(button: btn, pressed: false))
        case .scrollWheel:
            let dx = Int16(clamping: Int(event.scrollingDeltaX))
            let dy = Int16(clamping: Int(event.scrollingDeltaY))
            if dx != 0 || dy != 0 {
                onInput?(.scroll(dx: dx, dy: dy))
            }
        default:
            break
        }
    }

    // MARK: - Gamepad Support

    private func setupGamepadObservation() {
        NotificationCenter.default.addObserver(
            forName: .GCControllerDidConnect,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let controller = notification.object as? GCController else { return }
            self?.configureGamepad(controller)
        }

        // Configure any already-connected controllers
        for controller in GCController.controllers() {
            configureGamepad(controller)
        }
    }

    private func configureGamepad(_ controller: GCController) {
        guard let gamepad = controller.extendedGamepad else { return }

        gamepad.valueChangedHandler = { [weak self] _, element in
            guard let self, self.isEnabled else { return }

            if let button = element as? GCControllerButtonInput {
                self.onInput?(.gamepadButton(
                    button: button.localizedName ?? "unknown",
                    pressed: button.isPressed
                ))
            } else if let axis = element as? GCControllerAxisInput {
                self.onInput?(.gamepadAxis(
                    axis: axis.localizedName ?? "unknown",
                    value: axis.value
                ))
            }
        }
    }
}
