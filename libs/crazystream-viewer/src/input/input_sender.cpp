///////////////////////////////////////////////////////////////////////////////
// input_sender.cpp -- Serialize and send input events to the host
//
// Converts InputEvent structures into the wire format defined in
// cs/transport/packet.h (InputPacketHeader + type-specific payload),
// and sends them immediately over UDP for lowest possible latency.
//
// Wire format (after DTLS encryption):
//   [InputPacketHeader]   4 bytes: ver_type(1) + input_type(1) + payload_length(2)
//   [Payload]             variable: type-specific event data
//
// Each event is sent as a standalone datagram -- no batching.
///////////////////////////////////////////////////////////////////////////////

#include "input_sender.h"
#include "input_capture.h"

#include "cs/common.h"
#include "cs/transport/packet.h"

#include <cstring>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <WinSock2.h>
#  include <WS2tcpip.h>
#else
#  include <sys/socket.h>
#  include <netinet/in.h>
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------
InputSender::InputSender() = default;

InputSender::~InputSender() {
    // We do not own the socket -- do not close it.
}

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------
bool InputSender::initialize(int socket_fd, const ::sockaddr* peer, int peer_len) {
    if (socket_fd < 0 || !peer || peer_len <= 0) {
        CS_LOG(ERR, "InputSender::initialize: invalid arguments");
        return false;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    socket_fd_ = socket_fd;

    // Store a copy of the peer address
    peer_addr_.resize(static_cast<size_t>(peer_len));
    std::memcpy(peer_addr_.data(), peer, static_cast<size_t>(peer_len));
    peer_addr_len_ = peer_len;

    CS_LOG(INFO, "InputSender initialized (socket=%d, peer_len=%d)",
           socket_fd_, peer_addr_len_);
    return true;
}

// ---------------------------------------------------------------------------
// serializeEvent() -- build wire-format packet from an InputEvent
// ---------------------------------------------------------------------------
std::vector<uint8_t> InputSender::serializeEvent(const InputEvent& event) const {
    // Determine the input type and build the payload
    InputType wire_type;
    std::vector<uint8_t> payload;

    switch (event.type) {
        case InputEventType::MOUSE_MOVE: {
            wire_type = InputType::MOUSE_MOVE;

            MouseMoveEvent mv;
            mv.dx      = event.mouse_move.dx;
            mv.dy      = event.mouse_move.dy;
            mv.buttons = event.mouse_move.buttons;

            // Convert to network byte order
            mv.toNetwork();

            payload.resize(sizeof(MouseMoveEvent));
            std::memcpy(payload.data(), &mv, sizeof(mv));
            break;
        }

        case InputEventType::MOUSE_BUTTON: {
            wire_type = InputType::MOUSE_BUTTON;

            MouseButtonEvent btn;
            btn.button = event.mouse_button.button;
            btn.action = event.mouse_button.action;

            payload.resize(sizeof(MouseButtonEvent));
            std::memcpy(payload.data(), &btn, sizeof(btn));
            break;
        }

        case InputEventType::KEY: {
            wire_type = InputType::KEY;

            KeyEvent key;
            key.keycode   = event.key.keycode;
            key.action    = event.key.action;
            key.modifiers = event.key.modifiers;

            // Convert to network byte order
            key.toNetwork();

            payload.resize(sizeof(KeyEvent));
            std::memcpy(payload.data(), &key, sizeof(key));
            break;
        }

        case InputEventType::SCROLL: {
            wire_type = InputType::SCROLL;

            ScrollEvent scr;
            scr.dx = event.scroll.dx;
            scr.dy = event.scroll.dy;

            // Convert to network byte order
            scr.toNetwork();

            payload.resize(sizeof(ScrollEvent));
            std::memcpy(payload.data(), &scr, sizeof(scr));
            break;
        }

        default:
            CS_LOG(WARN, "InputSender: unknown event type %u",
                   static_cast<unsigned>(event.type));
            return {};
    }

    // Build the InputPacketHeader
    InputPacketHeader hdr;
    std::memset(&hdr, 0, sizeof(hdr));
    hdr.setVersion(1);
    hdr.setType(static_cast<uint8_t>(PacketType::INPUT) & 0x3F);
    hdr.input_type     = static_cast<uint8_t>(wire_type);
    hdr.payload_length = static_cast<uint16_t>(payload.size());

    // Serialize header + payload
    return hdr.serialize(payload.data(), payload.size());
}

// ---------------------------------------------------------------------------
// sendInput() -- serialize and send immediately
// ---------------------------------------------------------------------------
bool InputSender::sendInput(const InputEvent& event) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (socket_fd_ < 0 || peer_addr_.empty()) {
        CS_LOG(WARN, "InputSender: not initialized");
        return false;
    }

    // Serialize the event into wire format
    std::vector<uint8_t> packet = serializeEvent(event);
    if (packet.empty()) {
        return false;
    }

    // Send the packet immediately via UDP sendto
    ssize_t sent = ::sendto(
        static_cast<SOCKET>(socket_fd_),
        reinterpret_cast<const char*>(packet.data()),
        static_cast<int>(packet.size()),
        0,
        reinterpret_cast<const ::sockaddr*>(peer_addr_.data()),
        peer_addr_len_);

    if (sent < 0) {
        CS_LOG(WARN, "InputSender: sendto failed (error %d)", cs_socket_error());
        return false;
    }

    if (static_cast<size_t>(sent) != packet.size()) {
        CS_LOG(WARN, "InputSender: partial send (%zd / %zu bytes)",
               sent, packet.size());
        return false;
    }

    packets_sent_.fetch_add(1, std::memory_order_relaxed);
    return true;
}

// ---------------------------------------------------------------------------
// getPacketsSent()
// ---------------------------------------------------------------------------
uint64_t InputSender::getPacketsSent() const {
    return packets_sent_.load(std::memory_order_relaxed);
}

} // namespace cs
