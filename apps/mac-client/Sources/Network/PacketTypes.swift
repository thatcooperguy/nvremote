// PacketTypes.swift — Swift packet struct definitions matching C++ wire format
// NVRemote macOS Client
//
// These definitions MUST match the C++ structs in nvremote-common/include/cs/transport/packet.h
// exactly. All multi-byte fields are serialized in network byte order (big-endian).

import Foundation

// MARK: - Packet Type Tag

/// Top-level packet type identifier. First byte after DTLS decryption.
/// Must match cs::PacketType in packet.h.
enum PacketType: UInt8, Sendable {
    case video       = 0x10
    case audio       = 0x20
    case input       = 0x30
    case qosFeedback = 0xFB
    case fec         = 0xFC
    case nack        = 0xFD
}

// MARK: - Codec Type

/// Video codec identifier stored in VideoPacketHeader.codec.
/// Must match cs::CodecType in packet.h.
enum CodecType: UInt8, Sendable {
    case h264 = 0x01
    case h265 = 0x02
    case av1  = 0x03
}

// MARK: - Input Type

/// Sub-type for input events.
/// Must match cs::InputType in packet.h.
enum InputType: UInt8, Sendable {
    case mouseMove   = 1
    case mouseButton = 2
    case key         = 3
    case scroll      = 4
}

// MARK: - VideoPacketHeader (16 bytes)

/// Video packet header — 16 bytes on the wire.
///
/// Wire layout:
/// ```
///   [0]     flags: version(2) | frame_type(1) | keyframe(1) | reserved(4)
///   [1]     codec (CodecType)
///   [2-3]   sequence_number   (big-endian)
///   [4-7]   timestamp_us      (big-endian, lower 32 bits)
///   [8-9]   frame_number      (big-endian)
///   [10]    fragment_index
///   [11]    fragment_total
///   [12-15] payload_length    (big-endian)
/// ```
struct VideoPacketHeader: Sendable {
    var flags: UInt8              // version(2)|frame_type(1)|keyframe(1)|reserved(4)
    var codec: UInt8              // CodecType raw value
    var sequenceNumber: UInt16
    var timestampUs: UInt32
    var frameNumber: UInt16
    var fragmentIndex: UInt8
    var fragmentTotal: UInt8
    var payloadLength: UInt32

    /// Size of this header on the wire.
    static let wireSize = 16

    // MARK: - Flags Accessors

    var version: UInt8   { (flags >> 6) & 0x03 }
    var frameType: UInt8 { (flags >> 5) & 0x01 }
    var keyframe: Bool   { ((flags >> 4) & 0x01) != 0 }

    var codecType: CodecType? { CodecType(rawValue: codec) }

    mutating func setVersion(_ v: UInt8)   { flags = (flags & 0x3F) | ((v & 0x03) << 6) }
    mutating func setFrameType(_ t: UInt8) { flags = (flags & 0xDF) | ((t & 0x01) << 5) }
    mutating func setKeyframe(_ k: Bool)   { flags = (flags & 0xEF) | ((k ? 1 : 0) << 4) }

    // MARK: - Serialization

    /// Deserialize from a raw data buffer (network byte order).
    /// Returns `nil` if the buffer is too small.
    static func deserialize(from data: Data) -> VideoPacketHeader? {
        guard data.count >= wireSize else { return nil }
        return data.withUnsafeBytes { ptr -> VideoPacketHeader in
            let base = ptr.baseAddress!
            return VideoPacketHeader(
                flags:          base.load(fromByteOffset: 0,  as: UInt8.self),
                codec:          base.load(fromByteOffset: 1,  as: UInt8.self),
                sequenceNumber: UInt16(bigEndian: base.load(fromByteOffset: 2,  as: UInt16.self)),
                timestampUs:    UInt32(bigEndian: base.load(fromByteOffset: 4,  as: UInt32.self)),
                frameNumber:    UInt16(bigEndian: base.load(fromByteOffset: 8,  as: UInt16.self)),
                fragmentIndex:  base.load(fromByteOffset: 10, as: UInt8.self),
                fragmentTotal:  base.load(fromByteOffset: 11, as: UInt8.self),
                payloadLength:  UInt32(bigEndian: base.load(fromByteOffset: 12, as: UInt32.self))
            )
        }
    }

    /// Serialize to a Data buffer in network byte order.
    func serialize() -> Data {
        var data = Data(count: Self.wireSize)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            base.storeBytes(of: flags,                         toByteOffset: 0,  as: UInt8.self)
            base.storeBytes(of: codec,                         toByteOffset: 1,  as: UInt8.self)
            base.storeBytes(of: sequenceNumber.bigEndian,      toByteOffset: 2,  as: UInt16.self)
            base.storeBytes(of: timestampUs.bigEndian,         toByteOffset: 4,  as: UInt32.self)
            base.storeBytes(of: frameNumber.bigEndian,         toByteOffset: 8,  as: UInt16.self)
            base.storeBytes(of: fragmentIndex,                 toByteOffset: 10, as: UInt8.self)
            base.storeBytes(of: fragmentTotal,                 toByteOffset: 11, as: UInt8.self)
            base.storeBytes(of: payloadLength.bigEndian,       toByteOffset: 12, as: UInt32.self)
        }
        return data
    }
}

// MARK: - AudioPacketHeader (8 bytes)

/// Audio packet header — 8 bytes on the wire.
///
/// Wire layout:
/// ```
///   [0]   ver_type: version(2) | type(6)  — type = 0x20
///   [1]   channel_id
///   [2-3] sequence_number (big-endian)
///   [4-7] timestamp_us    (big-endian)
/// ```
struct AudioPacketHeader: Sendable {
    var verType: UInt8           // version(2) | type(6)
    var channelId: UInt8
    var sequenceNumber: UInt16
    var timestampUs: UInt32

    static let wireSize = 8

    var version: UInt8    { (verType >> 6) & 0x03 }
    var type: UInt8       { verType & 0x3F }

    mutating func setVersion(_ v: UInt8) { verType = (verType & 0x3F) | ((v & 0x03) << 6) }
    mutating func setType(_ t: UInt8)    { verType = (verType & 0xC0) | (t & 0x3F) }

    static func deserialize(from data: Data) -> AudioPacketHeader? {
        guard data.count >= wireSize else { return nil }
        return data.withUnsafeBytes { ptr -> AudioPacketHeader in
            let base = ptr.baseAddress!
            return AudioPacketHeader(
                verType:        base.load(fromByteOffset: 0, as: UInt8.self),
                channelId:      base.load(fromByteOffset: 1, as: UInt8.self),
                sequenceNumber: UInt16(bigEndian: base.load(fromByteOffset: 2, as: UInt16.self)),
                timestampUs:    UInt32(bigEndian: base.load(fromByteOffset: 4, as: UInt32.self))
            )
        }
    }

    func serialize() -> Data {
        var data = Data(count: Self.wireSize)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            base.storeBytes(of: verType,                    toByteOffset: 0, as: UInt8.self)
            base.storeBytes(of: channelId,                  toByteOffset: 1, as: UInt8.self)
            base.storeBytes(of: sequenceNumber.bigEndian,   toByteOffset: 2, as: UInt16.self)
            base.storeBytes(of: timestampUs.bigEndian,      toByteOffset: 4, as: UInt32.self)
        }
        return data
    }
}

// MARK: - InputPacketHeader (4 bytes)

/// Input packet header — 4 bytes on the wire.
///
/// Wire layout:
/// ```
///   [0]   ver_type: version(2) | type(6)  — type = 0x30
///   [1]   input_type (InputType)
///   [2-3] payload_length (big-endian)
/// ```
struct InputPacketHeader: Sendable {
    var verType: UInt8           // version(2) | type(6)
    var inputType: UInt8         // InputType raw value
    var payloadLength: UInt16

    static let wireSize = 4

    var version: UInt8 { (verType >> 6) & 0x03 }
    var type: UInt8    { verType & 0x3F }

    mutating func setVersion(_ v: UInt8) { verType = (verType & 0x3F) | ((v & 0x03) << 6) }
    mutating func setType(_ t: UInt8)    { verType = (verType & 0xC0) | (t & 0x3F) }

    static func deserialize(from data: Data) -> InputPacketHeader? {
        guard data.count >= wireSize else { return nil }
        return data.withUnsafeBytes { ptr -> InputPacketHeader in
            let base = ptr.baseAddress!
            return InputPacketHeader(
                verType:       base.load(fromByteOffset: 0, as: UInt8.self),
                inputType:     base.load(fromByteOffset: 1, as: UInt8.self),
                payloadLength: UInt16(bigEndian: base.load(fromByteOffset: 2, as: UInt16.self))
            )
        }
    }

    func serialize() -> Data {
        var data = Data(count: Self.wireSize)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            base.storeBytes(of: verType,                  toByteOffset: 0, as: UInt8.self)
            base.storeBytes(of: inputType,                toByteOffset: 1, as: UInt8.self)
            base.storeBytes(of: payloadLength.bigEndian,  toByteOffset: 2, as: UInt16.self)
        }
        return data
    }
}

// MARK: - QosFeedbackPacket (22 bytes)

/// QoS feedback packet — 22 bytes on the wire (base).
///
/// Wire layout:
/// ```
///   [0]     type = 0xFB
///   [1]     flags
///   [2-3]   last_seq_received         (big-endian)
///   [4-7]   estimated_bw_kbps         (big-endian)
///   [8-9]   packet_loss_x100          (big-endian, e.g. 250 = 2.50%)
///   [10-11] avg_jitter_us             (big-endian)
///   [12-15] delay_gradient_us         (big-endian, signed)
///   [16-17] nack_count                (big-endian)
///   [18-19] nack_seq_0                (big-endian)
///   [20-21] nack_seq_1                (big-endian)
/// ```
///
/// First 2 NACKs are inlined; additional NACKs are appended as
/// extended uint16 entries after the base 22 bytes.
struct QosFeedbackPacket: Sendable {
    var type: UInt8               // 0xFB
    var flags: UInt8
    var lastSeqReceived: UInt16
    var estimatedBwKbps: UInt32
    var packetLossX100: UInt16    // e.g. 250 = 2.50%
    var avgJitterUs: UInt16
    var delayGradientUs: Int32    // signed: positive = increasing delay
    var nackCount: UInt16
    var nackSeq0: UInt16          // first inline NACK
    var nackSeq1: UInt16          // second inline NACK

    static let wireSize = 22
    static let baseNackCount = 2

    /// Packet loss as a percentage (e.g., 2.50).
    var packetLossPercent: Float { Float(packetLossX100) / 100.0 }

    /// Average jitter in milliseconds.
    var jitterMs: Float { Float(avgJitterUs) / 1000.0 }

    /// Delay gradient in milliseconds.
    var delayGradientMs: Float { Float(delayGradientUs) / 1000.0 }

    /// Serialize the base 22-byte packet with optional extended NACKs to network byte order.
    func serialize(extendedNacks: [UInt16] = []) -> Data {
        let extCount = min(extendedNacks.count, 64)
        var data = Data(count: Self.wireSize + extCount * 2)

        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            base.storeBytes(of: type,                                  toByteOffset: 0,  as: UInt8.self)
            base.storeBytes(of: flags,                                 toByteOffset: 1,  as: UInt8.self)
            base.storeBytes(of: lastSeqReceived.bigEndian,             toByteOffset: 2,  as: UInt16.self)
            base.storeBytes(of: estimatedBwKbps.bigEndian,             toByteOffset: 4,  as: UInt32.self)
            base.storeBytes(of: packetLossX100.bigEndian,              toByteOffset: 8,  as: UInt16.self)
            base.storeBytes(of: avgJitterUs.bigEndian,                 toByteOffset: 10, as: UInt16.self)
            let delayU = UInt32(bitPattern: delayGradientUs).bigEndian
            base.storeBytes(of: delayU,                                toByteOffset: 12, as: UInt32.self)
            base.storeBytes(of: nackCount.bigEndian,                   toByteOffset: 16, as: UInt16.self)
            base.storeBytes(of: nackSeq0.bigEndian,                    toByteOffset: 18, as: UInt16.self)
            base.storeBytes(of: nackSeq1.bigEndian,                    toByteOffset: 20, as: UInt16.self)

            for i in 0..<extCount {
                let offset = Self.wireSize + i * 2
                base.storeBytes(of: extendedNacks[i].bigEndian, toByteOffset: offset, as: UInt16.self)
            }
        }

        return data
    }

    /// Deserialize from raw data (network byte order).
    static func deserialize(from data: Data) -> QosFeedbackPacket? {
        guard data.count >= wireSize else { return nil }
        return data.withUnsafeBytes { ptr -> QosFeedbackPacket in
            let base = ptr.baseAddress!
            let rawDelay = UInt32(bigEndian: base.load(fromByteOffset: 12, as: UInt32.self))
            return QosFeedbackPacket(
                type:             base.load(fromByteOffset: 0,  as: UInt8.self),
                flags:            base.load(fromByteOffset: 1,  as: UInt8.self),
                lastSeqReceived:  UInt16(bigEndian: base.load(fromByteOffset: 2,  as: UInt16.self)),
                estimatedBwKbps:  UInt32(bigEndian: base.load(fromByteOffset: 4,  as: UInt32.self)),
                packetLossX100:   UInt16(bigEndian: base.load(fromByteOffset: 8,  as: UInt16.self)),
                avgJitterUs:      UInt16(bigEndian: base.load(fromByteOffset: 10, as: UInt16.self)),
                delayGradientUs:  Int32(bitPattern: rawDelay),
                nackCount:        UInt16(bigEndian: base.load(fromByteOffset: 16, as: UInt16.self)),
                nackSeq0:         UInt16(bigEndian: base.load(fromByteOffset: 18, as: UInt16.self)),
                nackSeq1:         UInt16(bigEndian: base.load(fromByteOffset: 20, as: UInt16.self))
            )
        }
    }
}

// MARK: - Input Event Payloads

/// Mouse move event payload — 5 bytes on the wire.
struct MouseMoveEvent: Sendable {
    var dx: Int16
    var dy: Int16
    var buttons: UInt8

    static let wireSize = 5

    func serialize() -> Data {
        var data = Data(count: Self.wireSize)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            let dxU = UInt16(bitPattern: dx).bigEndian
            let dyU = UInt16(bitPattern: dy).bigEndian
            base.storeBytes(of: dxU,     toByteOffset: 0, as: UInt16.self)
            base.storeBytes(of: dyU,     toByteOffset: 2, as: UInt16.self)
            base.storeBytes(of: buttons, toByteOffset: 4, as: UInt8.self)
        }
        return data
    }

    static func deserialize(from data: Data) -> MouseMoveEvent? {
        guard data.count >= wireSize else { return nil }
        return data.withUnsafeBytes { ptr -> MouseMoveEvent in
            let base = ptr.baseAddress!
            return MouseMoveEvent(
                dx: Int16(bitPattern: UInt16(bigEndian: base.load(fromByteOffset: 0, as: UInt16.self))),
                dy: Int16(bitPattern: UInt16(bigEndian: base.load(fromByteOffset: 2, as: UInt16.self))),
                buttons: base.load(fromByteOffset: 4, as: UInt8.self)
            )
        }
    }
}

/// Mouse button event payload — 2 bytes on the wire.
struct MouseButtonEvent: Sendable {
    var button: UInt8    // 0=left, 1=right, 2=middle
    var action: UInt8    // 0=release, 1=press

    static let wireSize = 2

    func serialize() -> Data {
        Data([button, action])
    }

    static func deserialize(from data: Data) -> MouseButtonEvent? {
        guard data.count >= wireSize else { return nil }
        return MouseButtonEvent(button: data[data.startIndex], action: data[data.startIndex + 1])
    }
}

/// Key event payload — 4 bytes on the wire.
struct KeyEvent: Sendable {
    var keycode: UInt16     // platform-independent virtual key code
    var action: UInt8       // 0=release, 1=press
    var modifiers: UInt8    // bitmask: 1=Shift, 2=Ctrl, 4=Alt, 8=Meta

    static let wireSize = 4

    func serialize() -> Data {
        var data = Data(count: Self.wireSize)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            base.storeBytes(of: keycode.bigEndian, toByteOffset: 0, as: UInt16.self)
            base.storeBytes(of: action,            toByteOffset: 2, as: UInt8.self)
            base.storeBytes(of: modifiers,         toByteOffset: 3, as: UInt8.self)
        }
        return data
    }

    static func deserialize(from data: Data) -> KeyEvent? {
        guard data.count >= wireSize else { return nil }
        return data.withUnsafeBytes { ptr -> KeyEvent in
            let base = ptr.baseAddress!
            return KeyEvent(
                keycode:   UInt16(bigEndian: base.load(fromByteOffset: 0, as: UInt16.self)),
                action:    base.load(fromByteOffset: 2, as: UInt8.self),
                modifiers: base.load(fromByteOffset: 3, as: UInt8.self)
            )
        }
    }
}

/// Scroll event payload — 4 bytes on the wire.
struct ScrollEvent: Sendable {
    var dx: Int16
    var dy: Int16

    static let wireSize = 4

    func serialize() -> Data {
        var data = Data(count: Self.wireSize)
        data.withUnsafeMutableBytes { ptr in
            let base = ptr.baseAddress!
            base.storeBytes(of: UInt16(bitPattern: dx).bigEndian, toByteOffset: 0, as: UInt16.self)
            base.storeBytes(of: UInt16(bitPattern: dy).bigEndian, toByteOffset: 2, as: UInt16.self)
        }
        return data
    }

    static func deserialize(from data: Data) -> ScrollEvent? {
        guard data.count >= wireSize else { return nil }
        return data.withUnsafeBytes { ptr -> ScrollEvent in
            let base = ptr.baseAddress!
            return ScrollEvent(
                dx: Int16(bitPattern: UInt16(bigEndian: base.load(fromByteOffset: 0, as: UInt16.self))),
                dy: Int16(bitPattern: UInt16(bigEndian: base.load(fromByteOffset: 2, as: UInt16.self)))
            )
        }
    }
}

// MARK: - Packet Identification

/// Identify the packet type from the first byte(s) of a decrypted buffer.
/// Mirrors cs::identifyPacket() from packet.h.
func identifyPacket(_ data: Data) -> PacketType? {
    guard !data.isEmpty else { return nil }

    let first = data[data.startIndex]

    // QoS, FEC, NACK have a dedicated type byte
    if first == PacketType.qosFeedback.rawValue { return .qosFeedback }
    if first == PacketType.fec.rawValue         { return .fec }
    if first == PacketType.nack.rawValue        { return .nack }

    // Audio / Input embed type in the lower 6 bits of byte 0
    let type6 = first & 0x3F
    if type6 == 0x20 && data.count >= AudioPacketHeader.wireSize { return .audio }
    if type6 == 0x30 && data.count >= InputPacketHeader.wireSize { return .input }

    // Default to video if codec byte is valid
    if data.count >= VideoPacketHeader.wireSize {
        let codec = data[data.startIndex + 1]
        if codec == CodecType.h264.rawValue ||
           codec == CodecType.h265.rawValue ||
           codec == CodecType.av1.rawValue {
            return .video
        }
    }

    return nil
}
