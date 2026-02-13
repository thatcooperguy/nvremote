// InputSender.swift — Serialize input events and send over UDP
// CrazyStream macOS Client
//
// Mirrors the C++ InputSender from crazystream-viewer. Takes CapturedInputEvents,
// serializes them into the wire format (InputPacketHeader + payload), and sends
// them immediately over the UDP transport for lowest latency.

import Foundation

/// Serializes captured input events into the CrazyStream wire format
/// and sends them to the host via the UDP transport.
final class InputSender: @unchecked Sendable {

    // MARK: - Properties

    private let transport: UDPTransport
    private let lock = NSLock()

    /// Total input packets sent.
    private(set) var packetsSent: UInt64 = 0

    /// Protocol version for the input header.
    private let protocolVersion: UInt8 = 1

    // MARK: - Initialization

    init(transport: UDPTransport) {
        self.transport = transport
    }

    // MARK: - Send

    /// Serialize and send a captured input event immediately.
    /// Input is sent without batching for lowest possible latency.
    func send(event: CapturedInputEvent) {
        let data: Data

        switch event {
        case .mouseMove(let dx, let dy, let buttons):
            data = serializeMouseMove(dx: dx, dy: dy, buttons: buttons)

        case .mouseButton(let button, let pressed):
            data = serializeMouseButton(button: button, pressed: pressed)

        case .key(let keycode, let pressed, let modifiers):
            data = serializeKey(keycode: keycode, pressed: pressed, modifiers: modifiers)

        case .scroll(let dx, let dy):
            data = serializeScroll(dx: dx, dy: dy)

        case .gamepadButton(let button, let pressed):
            // Gamepad buttons are mapped to keyboard events for simplicity.
            // A full implementation would define a gamepad-specific input subtype.
            let keycode = mapGamepadButton(button)
            data = serializeKey(keycode: keycode, pressed: pressed, modifiers: 0)

        case .gamepadAxis(let axis, let value):
            // Gamepad axes are mapped to mouse movement for simplicity.
            let scaled = Int16(value * 127)
            if axis.lowercased().contains("x") {
                data = serializeMouseMove(dx: scaled, dy: 0, buttons: 0)
            } else {
                data = serializeMouseMove(dx: 0, dy: scaled, buttons: 0)
            }
        }

        transport.send(data)

        lock.lock()
        packetsSent += 1
        lock.unlock()
    }

    // MARK: - Serialization

    /// Serialize a mouse move event.
    ///
    /// Wire format: InputPacketHeader (4 bytes) + MouseMoveEvent (5 bytes) = 9 bytes
    private func serializeMouseMove(dx: Int16, dy: Int16, buttons: UInt8) -> Data {
        let payload = MouseMoveEvent(dx: dx, dy: dy, buttons: buttons).serialize()
        return buildPacket(inputType: .mouseMove, payload: payload)
    }

    /// Serialize a mouse button event.
    ///
    /// Wire format: InputPacketHeader (4 bytes) + MouseButtonEvent (2 bytes) = 6 bytes
    private func serializeMouseButton(button: UInt8, pressed: Bool) -> Data {
        let payload = MouseButtonEvent(button: button, action: pressed ? 1 : 0).serialize()
        return buildPacket(inputType: .mouseButton, payload: payload)
    }

    /// Serialize a key event.
    ///
    /// Wire format: InputPacketHeader (4 bytes) + KeyEvent (4 bytes) = 8 bytes
    private func serializeKey(keycode: UInt16, pressed: Bool, modifiers: UInt8) -> Data {
        let payload = KeyEvent(
            keycode: keycode,
            action: pressed ? 1 : 0,
            modifiers: modifiers
        ).serialize()
        return buildPacket(inputType: .key, payload: payload)
    }

    /// Serialize a scroll event.
    ///
    /// Wire format: InputPacketHeader (4 bytes) + ScrollEvent (4 bytes) = 8 bytes
    private func serializeScroll(dx: Int16, dy: Int16) -> Data {
        let payload = ScrollEvent(dx: dx, dy: dy).serialize()
        return buildPacket(inputType: .scroll, payload: payload)
    }

    /// Build a complete input packet: InputPacketHeader + payload.
    private func buildPacket(inputType: InputType, payload: Data) -> Data {
        var header = InputPacketHeader(
            verType: 0,
            inputType: inputType.rawValue,
            payloadLength: UInt16(payload.count)
        )
        header.setVersion(protocolVersion)
        header.setType(PacketType.input.rawValue & 0x3F)

        var result = header.serialize()
        result.append(payload)
        return result
    }

    /// Map a gamepad button name to a virtual keycode.
    /// This is a simplified mapping; a production implementation would use
    /// platform-independent virtual key codes.
    private func mapGamepadButton(_ name: String) -> UInt16 {
        let lowered = name.lowercased()
        switch lowered {
        case "a", "button a":           return 0xF001
        case "b", "button b":           return 0xF002
        case "x", "button x":           return 0xF003
        case "y", "button y":           return 0xF004
        case "left shoulder":           return 0xF005
        case "right shoulder":          return 0xF006
        case "left trigger":            return 0xF007
        case "right trigger":           return 0xF008
        case "left thumbstick button":  return 0xF009
        case "right thumbstick button": return 0xF00A
        case "menu", "start":           return 0xF00B
        case "options", "select":       return 0xF00C
        case "d-pad up":                return 0xF010
        case "d-pad down":              return 0xF011
        case "d-pad left":              return 0xF012
        case "d-pad right":             return 0xF013
        default:                        return 0xF0FF
        }
    }
}
