///////////////////////////////////////////////////////////////////////////////
// packet.h -- GridStreamer wire-format packet definitions
//
// All structures use #pragma pack(push,1) so their in-memory layout matches
// the network byte layout exactly.  Multi-byte fields are stored in
// network byte order (big-endian) on the wire; the serialize/deserialize
// helpers perform the necessary swaps.
//
// Packet type byte (first byte after DTLS decryption) disambiguates:
//   0x10 = video   (VideoPacketHeader follows)
//   0x20 = audio   (AudioPacketHeader follows)
//   0x30 = input   (InputPacketHeader follows)
//   0xFB = QoS feedback
//   0xFC = FEC
//   0xFD = NACK
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <cstring>
#include <vector>

#ifdef _WIN32
  #include <WinSock2.h>   // htons / ntohs / htonl / ntohl
#else
  #include <arpa/inet.h>
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Protocol version -- exchanged immediately after DTLS handshake.
// Both sides send this 4-byte tag; a mismatch means incompatible wire formats.
// ---------------------------------------------------------------------------
constexpr uint8_t PROTOCOL_VERSION_TAG[4] = { 'C', 'S', '0', '1' };
constexpr size_t  PROTOCOL_VERSION_TAG_LEN = 4;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Codec identifier stored in VideoPacketHeader::codec
enum class CodecType : uint8_t {
    H264 = 0x01,
    H265 = 0x02,
    AV1  = 0x03,
};

/// Top-level packet type tag (first disambiguating byte or embedded in header)
enum class PacketType : uint8_t {
    VIDEO        = 0x10,
    AUDIO        = 0x20,
    INPUT        = 0x30,
    CONTROLLER   = 0x40,
    CLIPBOARD    = 0x50,
    CLIP_ACK     = 0x51,
    QOS_FEEDBACK = 0xFB,
    FEC          = 0xFC,
    NACK         = 0xFD,
};

/// Sub-type for input events
enum class InputType : uint8_t {
    MOUSE_MOVE   = 1,
    MOUSE_BUTTON = 2,
    KEY          = 3,
    SCROLL       = 4,
};

// ---------------------------------------------------------------------------
// Packed wire structures
// ---------------------------------------------------------------------------

#pragma pack(push, 1)

/// Video packet header -- 16 bytes on the wire.
///
/// Byte layout:
///   [0]   version(2) | frame_type(1) | keyframe(1) | reserved(4)
///   [1]   codec
///   [2-3] sequence_number   (network order)
///   [4-7] timestamp_us      (network order, lower 32 bits)
///   [8-9] frame_number      (network order)
///   [10]  fragment_index
///   [11]  fragment_total
///   [12-15] payload_length  (network order)
struct VideoPacketHeader {
    uint8_t  flags;             // version(2)|frame_type(1)|keyframe(1)|reserved(4)
    uint8_t  codec;             // CodecType
    uint16_t sequence_number;
    uint32_t timestamp_us;
    uint16_t frame_number;
    uint8_t  fragment_index;
    uint8_t  fragment_total;
    uint32_t payload_length;

    // --- Field accessors for the bit-packed flags byte ---

    uint8_t version()    const { return (flags >> 6) & 0x03; }
    uint8_t frameType()  const { return (flags >> 5) & 0x01; }
    bool    keyframe()   const { return ((flags >> 4) & 0x01) != 0; }

    void setVersion(uint8_t v)    { flags = (flags & 0x3F) | ((v & 0x03) << 6); }
    void setFrameType(uint8_t t)  { flags = (flags & 0xDF) | ((t & 0x01) << 5); }
    void setKeyframe(bool k)      { flags = (flags & 0xEF) | ((k ? 1u : 0u) << 4); }

    // --- Serialize to network byte order (in place) ---
    void toNetwork() {
        sequence_number = htons(sequence_number);
        timestamp_us    = htonl(timestamp_us);
        frame_number    = htons(frame_number);
        payload_length  = htonl(payload_length);
    }

    // --- Deserialize from network byte order (in place) ---
    void toHost() {
        sequence_number = ntohs(sequence_number);
        timestamp_us    = ntohl(timestamp_us);
        frame_number    = ntohs(frame_number);
        payload_length  = ntohl(payload_length);
    }

    /// Serialize this header + optional payload into a byte vector ready for
    /// transmission.  The header is converted to network byte order; the
    /// payload is copied verbatim after it.
    std::vector<uint8_t> serialize(const uint8_t* payload = nullptr,
                                   size_t payloadLen = 0) const {
        VideoPacketHeader net = *this;
        net.toNetwork();

        std::vector<uint8_t> buf(sizeof(VideoPacketHeader) + payloadLen);
        std::memcpy(buf.data(), &net, sizeof(net));
        if (payload && payloadLen > 0) {
            std::memcpy(buf.data() + sizeof(net), payload, payloadLen);
        }
        return buf;
    }

    /// Deserialize from a raw buffer.  Returns false if the buffer is too
    /// small.  On success *this is populated in host byte order.
    static bool deserialize(const uint8_t* data, size_t len,
                            VideoPacketHeader& out) {
        if (len < sizeof(VideoPacketHeader)) return false;
        std::memcpy(&out, data, sizeof(VideoPacketHeader));
        out.toHost();
        return true;
    }
};
static_assert(sizeof(VideoPacketHeader) == 16, "VideoPacketHeader must be 16 bytes");

/// Audio packet header -- 8 bytes on the wire.
///
///   [0]   version(2) | type(6)   -- type = 0x20
///   [1]   channel_id
///   [2-3] sequence_number (network order)
///   [4-7] timestamp_us    (network order)
struct AudioPacketHeader {
    uint8_t  ver_type;          // version(2) | type(6)
    uint8_t  channel_id;
    uint16_t sequence_number;
    uint32_t timestamp_us;

    uint8_t version() const { return (ver_type >> 6) & 0x03; }
    uint8_t type()    const { return ver_type & 0x3F; }

    void setVersion(uint8_t v) { ver_type = (ver_type & 0x3F) | ((v & 0x03) << 6); }
    void setType(uint8_t t)    { ver_type = (ver_type & 0xC0) | (t & 0x3F); }

    void toNetwork() {
        sequence_number = htons(sequence_number);
        timestamp_us    = htonl(timestamp_us);
    }
    void toHost() {
        sequence_number = ntohs(sequence_number);
        timestamp_us    = ntohl(timestamp_us);
    }

    std::vector<uint8_t> serialize(const uint8_t* payload = nullptr,
                                   size_t payloadLen = 0) const {
        AudioPacketHeader net = *this;
        net.toNetwork();
        std::vector<uint8_t> buf(sizeof(AudioPacketHeader) + payloadLen);
        std::memcpy(buf.data(), &net, sizeof(net));
        if (payload && payloadLen > 0) {
            std::memcpy(buf.data() + sizeof(net), payload, payloadLen);
        }
        return buf;
    }

    static bool deserialize(const uint8_t* data, size_t len,
                            AudioPacketHeader& out) {
        if (len < sizeof(AudioPacketHeader)) return false;
        std::memcpy(&out, data, sizeof(AudioPacketHeader));
        out.toHost();
        return true;
    }
};
static_assert(sizeof(AudioPacketHeader) == 8, "AudioPacketHeader must be 8 bytes");

/// Input packet header -- 4 bytes on the wire.
///
///   [0]   version(2) | type(6)   -- type = 0x30
///   [1]   input_type  (InputType)
///   [2-3] payload_length (network order)
struct InputPacketHeader {
    uint8_t  ver_type;          // version(2) | type(6)
    uint8_t  input_type;        // InputType
    uint16_t payload_length;

    uint8_t version() const { return (ver_type >> 6) & 0x03; }
    uint8_t type()    const { return ver_type & 0x3F; }

    void setVersion(uint8_t v) { ver_type = (ver_type & 0x3F) | ((v & 0x03) << 6); }
    void setType(uint8_t t)    { ver_type = (ver_type & 0xC0) | (t & 0x3F); }

    void toNetwork() { payload_length = htons(payload_length); }
    void toHost()    { payload_length = ntohs(payload_length); }

    std::vector<uint8_t> serialize(const uint8_t* payload = nullptr,
                                   size_t payloadLen = 0) const {
        InputPacketHeader net = *this;
        net.toNetwork();
        std::vector<uint8_t> buf(sizeof(InputPacketHeader) + payloadLen);
        std::memcpy(buf.data(), &net, sizeof(net));
        if (payload && payloadLen > 0) {
            std::memcpy(buf.data() + sizeof(net), payload, payloadLen);
        }
        return buf;
    }

    static bool deserialize(const uint8_t* data, size_t len,
                            InputPacketHeader& out) {
        if (len < sizeof(InputPacketHeader)) return false;
        std::memcpy(&out, data, sizeof(InputPacketHeader));
        out.toHost();
        return true;
    }
};
static_assert(sizeof(InputPacketHeader) == 4, "InputPacketHeader must be 4 bytes");

/// QoS feedback packet -- 22 bytes on the wire.
///
/// Wire layout:
///   [0]     type = 0xFB
///   [1]     flags
///   [2-3]   last_seq_received         (network order)
///   [4-7]   estimated_bw_kbps         (network order)
///   [8-9]   packet_loss_x100          (network order, e.g. 250 = 2.50%)
///   [10-11] avg_jitter_us             (network order)
///   [12-15] delay_gradient_us         (network order, signed)
///   [16-17] nack_count                (network order)
///   [18-19] nack_seq_0                (network order)
///   [20-21] nack_seq_1                (network order)
///
/// The first 2 NACKs are inlined; additional NACKs are appended as
/// extended uint16_t entries after the base packet.

struct QosFeedbackPacket {
    uint8_t  type;                        // 0xFB
    uint8_t  flags;
    uint16_t last_seq_received;
    uint32_t estimated_bw_kbps;
    uint16_t packet_loss_x100;            // e.g. 250 = 2.50%
    uint16_t avg_jitter_us;
    int32_t  delay_gradient_us;           // signed: positive = increasing delay
    uint16_t nack_count;
    uint16_t nack_seq_0;                  // first inline NACK
    uint16_t nack_seq_1;                  // second inline NACK

    void toNetwork() {
        last_seq_received  = htons(last_seq_received);
        estimated_bw_kbps  = htonl(estimated_bw_kbps);
        packet_loss_x100   = htons(packet_loss_x100);
        avg_jitter_us      = htons(avg_jitter_us);
        delay_gradient_us  = static_cast<int32_t>(htonl(static_cast<uint32_t>(delay_gradient_us)));
        nack_count         = htons(nack_count);
        nack_seq_0         = htons(nack_seq_0);
        nack_seq_1         = htons(nack_seq_1);
    }
    void toHost() {
        last_seq_received  = ntohs(last_seq_received);
        estimated_bw_kbps  = ntohl(estimated_bw_kbps);
        packet_loss_x100   = ntohs(packet_loss_x100);
        avg_jitter_us      = ntohs(avg_jitter_us);
        delay_gradient_us  = static_cast<int32_t>(ntohl(static_cast<uint32_t>(delay_gradient_us)));
        nack_count         = ntohs(nack_count);
        nack_seq_0         = ntohs(nack_seq_0);
        nack_seq_1         = ntohs(nack_seq_1);
    }

    std::vector<uint8_t> serialize() const {
        QosFeedbackPacket net = *this;
        net.toNetwork();
        std::vector<uint8_t> buf(sizeof(QosFeedbackPacket));
        std::memcpy(buf.data(), &net, sizeof(net));
        return buf;
    }

    static bool deserialize(const uint8_t* data, size_t len,
                            QosFeedbackPacket& out) {
        if (len < sizeof(QosFeedbackPacket)) return false;
        std::memcpy(&out, data, sizeof(QosFeedbackPacket));
        out.toHost();
        return true;
    }
};
static_assert(sizeof(QosFeedbackPacket) == 22,
              "QosFeedbackPacket base is 22 bytes");

// ---------------------------------------------------------------------------
// Input event payloads
// ---------------------------------------------------------------------------

struct MouseMoveEvent {
    int16_t dx;
    int16_t dy;
    uint8_t buttons;       // bitmask of currently held buttons

    void toNetwork() { dx = static_cast<int16_t>(htons(static_cast<uint16_t>(dx)));
                       dy = static_cast<int16_t>(htons(static_cast<uint16_t>(dy))); }
    void toHost()    { dx = static_cast<int16_t>(ntohs(static_cast<uint16_t>(dx)));
                       dy = static_cast<int16_t>(ntohs(static_cast<uint16_t>(dy))); }
};
static_assert(sizeof(MouseMoveEvent) == 5, "MouseMoveEvent must be 5 bytes");

struct MouseButtonEvent {
    uint8_t button;        // 0=left, 1=right, 2=middle, ...
    uint8_t action;        // 0=release, 1=press
};
static_assert(sizeof(MouseButtonEvent) == 2, "MouseButtonEvent must be 2 bytes");

struct KeyEvent {
    uint16_t keycode;      // platform-independent virtual key code
    uint8_t  action;       // 0=release, 1=press
    uint8_t  modifiers;    // bitmask: 1=Shift, 2=Ctrl, 4=Alt, 8=Meta

    void toNetwork() { keycode = htons(keycode); }
    void toHost()    { keycode = ntohs(keycode); }
};
static_assert(sizeof(KeyEvent) == 4, "KeyEvent must be 4 bytes");

struct ScrollEvent {
    int16_t dx;
    int16_t dy;

    void toNetwork() { dx = static_cast<int16_t>(htons(static_cast<uint16_t>(dx)));
                       dy = static_cast<int16_t>(htons(static_cast<uint16_t>(dy))); }
    void toHost()    { dx = static_cast<int16_t>(ntohs(static_cast<uint16_t>(dx)));
                       dy = static_cast<int16_t>(ntohs(static_cast<uint16_t>(dy))); }
};
static_assert(sizeof(ScrollEvent) == 4, "ScrollEvent must be 4 bytes");

// ---------------------------------------------------------------------------
// Controller state packet -- 15 bytes on the wire.
//
// Full-state (not delta) so lost packets are self-healing.
// Sent on-change only, polled at up to 120Hz on the viewer side.
//
//   [0]   type = 0x40
//   [1]   controller_id (0-3, XInput limit)
//   [2-3] sequence (network order)
//   [4-5] buttons bitmask (network order, matches XINPUT_GAMEPAD)
//   [6]   left_trigger  (0-255)
//   [7]   right_trigger (0-255)
//   [8-9]   thumb_lx (int16, network order)
//   [10-11] thumb_ly (int16, network order)
//   [12-13] thumb_rx (int16, network order)
//   [14-15] thumb_ry (int16, network order)   -- total 16 bytes
// ---------------------------------------------------------------------------
struct ControllerPacket {
    uint8_t  type;              // 0x40
    uint8_t  controller_id;    // 0-3
    uint16_t sequence;
    uint16_t buttons;
    uint8_t  left_trigger;
    uint8_t  right_trigger;
    int16_t  thumb_lx;
    int16_t  thumb_ly;
    int16_t  thumb_rx;
    int16_t  thumb_ry;

    void toNetwork() {
        sequence = htons(sequence);
        buttons  = htons(buttons);
        thumb_lx = static_cast<int16_t>(htons(static_cast<uint16_t>(thumb_lx)));
        thumb_ly = static_cast<int16_t>(htons(static_cast<uint16_t>(thumb_ly)));
        thumb_rx = static_cast<int16_t>(htons(static_cast<uint16_t>(thumb_rx)));
        thumb_ry = static_cast<int16_t>(htons(static_cast<uint16_t>(thumb_ry)));
    }
    void toHost() {
        sequence = ntohs(sequence);
        buttons  = ntohs(buttons);
        thumb_lx = static_cast<int16_t>(ntohs(static_cast<uint16_t>(thumb_lx)));
        thumb_ly = static_cast<int16_t>(ntohs(static_cast<uint16_t>(thumb_ly)));
        thumb_rx = static_cast<int16_t>(ntohs(static_cast<uint16_t>(thumb_rx)));
        thumb_ry = static_cast<int16_t>(ntohs(static_cast<uint16_t>(thumb_ry)));
    }

    std::vector<uint8_t> serialize() const {
        ControllerPacket net = *this;
        net.toNetwork();
        std::vector<uint8_t> buf(sizeof(ControllerPacket));
        std::memcpy(buf.data(), &net, sizeof(net));
        return buf;
    }

    static bool deserialize(const uint8_t* data, size_t len,
                            ControllerPacket& out) {
        if (len < sizeof(ControllerPacket)) return false;
        std::memcpy(&out, data, sizeof(ControllerPacket));
        out.toHost();
        return true;
    }
};
static_assert(sizeof(ControllerPacket) == 16, "ControllerPacket must be 16 bytes");

// ---------------------------------------------------------------------------
// Clipboard packet -- 8 byte header + variable payload.
//
// Text-only in v1. Sent reliably via ACK + retry (3x at 200ms).
//
//   [0]   type = 0x50 (or 0x51 for ACK)
//   [1]   direction: 0=viewer->host, 1=host->viewer
//   [2-3] sequence (network order)
//   [4]   format: 1=UTF-8 text
//   [5-7] reserved (padding)
//   [8-11] length (network order, of following payload)
// ---------------------------------------------------------------------------
enum class ClipboardDirection : uint8_t {
    VIEWER_TO_HOST = 0,
    HOST_TO_VIEWER = 1,
};

enum class ClipboardFormat : uint8_t {
    TEXT_UTF8 = 1,
};

struct ClipboardPacketHeader {
    uint8_t  type;              // 0x50
    uint8_t  direction;         // ClipboardDirection
    uint16_t sequence;
    uint8_t  format;            // ClipboardFormat
    uint8_t  reserved[3];
    uint32_t length;            // payload length in bytes

    void toNetwork() {
        sequence = htons(sequence);
        length   = htonl(length);
    }
    void toHost() {
        sequence = ntohs(sequence);
        length   = ntohl(length);
    }

    std::vector<uint8_t> serialize(const uint8_t* payload = nullptr,
                                   size_t payloadLen = 0) const {
        ClipboardPacketHeader net = *this;
        net.toNetwork();
        std::vector<uint8_t> buf(sizeof(ClipboardPacketHeader) + payloadLen);
        std::memcpy(buf.data(), &net, sizeof(net));
        if (payload && payloadLen > 0) {
            std::memcpy(buf.data() + sizeof(net), payload, payloadLen);
        }
        return buf;
    }

    static bool deserialize(const uint8_t* data, size_t len,
                            ClipboardPacketHeader& out) {
        if (len < sizeof(ClipboardPacketHeader)) return false;
        std::memcpy(&out, data, sizeof(ClipboardPacketHeader));
        out.toHost();
        return true;
    }
};
static_assert(sizeof(ClipboardPacketHeader) == 12, "ClipboardPacketHeader must be 12 bytes");

/// Clipboard ACK -- 4 bytes on the wire.
///   [0]   type = 0x51
///   [1]   reserved
///   [2-3] ack_sequence (network order)
struct ClipboardAckPacket {
    uint8_t  type;          // 0x51
    uint8_t  reserved;
    uint16_t ack_sequence;

    void toNetwork() { ack_sequence = htons(ack_sequence); }
    void toHost()    { ack_sequence = ntohs(ack_sequence); }

    std::vector<uint8_t> serialize() const {
        ClipboardAckPacket net = *this;
        net.toNetwork();
        std::vector<uint8_t> buf(sizeof(ClipboardAckPacket));
        std::memcpy(buf.data(), &net, sizeof(net));
        return buf;
    }

    static bool deserialize(const uint8_t* data, size_t len,
                            ClipboardAckPacket& out) {
        if (len < sizeof(ClipboardAckPacket)) return false;
        std::memcpy(&out, data, sizeof(ClipboardAckPacket));
        out.toHost();
        return true;
    }
};
static_assert(sizeof(ClipboardAckPacket) == 4, "ClipboardAckPacket must be 4 bytes");

#pragma pack(pop)

// ---------------------------------------------------------------------------
// Quick packet-type detection from the first byte(s) of a decrypted datagram
// ---------------------------------------------------------------------------

/// Identify the packet type from a raw decrypted buffer.
/// Returns PacketType or 0 if unrecognized.
inline PacketType identifyPacket(const uint8_t* data, size_t len) {
    if (len == 0) return static_cast<PacketType>(0);

    // Dedicated type byte for control/data packets
    uint8_t first = data[0];
    if (first == static_cast<uint8_t>(PacketType::QOS_FEEDBACK)) return PacketType::QOS_FEEDBACK;
    if (first == static_cast<uint8_t>(PacketType::FEC))          return PacketType::FEC;
    if (first == static_cast<uint8_t>(PacketType::NACK))         return PacketType::NACK;
    if (first == static_cast<uint8_t>(PacketType::CONTROLLER) && len >= sizeof(ControllerPacket))
        return PacketType::CONTROLLER;
    if (first == static_cast<uint8_t>(PacketType::CLIPBOARD) && len >= sizeof(ClipboardPacketHeader))
        return PacketType::CLIPBOARD;
    if (first == static_cast<uint8_t>(PacketType::CLIP_ACK) && len >= sizeof(ClipboardAckPacket))
        return PacketType::CLIP_ACK;

    // Video / Audio / Input embed the type in the upper bits of byte 0.
    uint8_t type6 = first & 0x3F;
    if (type6 == 0x20 && len >= sizeof(AudioPacketHeader)) return PacketType::AUDIO;
    if (type6 == 0x30 && len >= sizeof(InputPacketHeader)) return PacketType::INPUT;

    // Default to video if the buffer is large enough and codec byte is valid
    if (len >= sizeof(VideoPacketHeader)) {
        uint8_t codec = data[1];
        if (codec == static_cast<uint8_t>(CodecType::H264) ||
            codec == static_cast<uint8_t>(CodecType::H265) ||
            codec == static_cast<uint8_t>(CodecType::AV1)) {
            return PacketType::VIDEO;
        }
    }

    return static_cast<PacketType>(0);
}

} // namespace cs
