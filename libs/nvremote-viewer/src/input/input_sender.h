///////////////////////////////////////////////////////////////////////////////
// input_sender.h -- Serialize and send input events over UDP
//
// Takes InputEvent structures from InputCapture, serializes them into
// the wire format (InputPacketHeader + payload), and sends them over
// the established UDP socket with optional DTLS encryption.
//
// Input is sent immediately (no batching) for lowest latency.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <mutex>
#include <vector>

#include "input_capture.h"

// Platform socket headers -- needed so ::sockaddr resolves inside the namespace.
#ifdef _WIN32
#include <WinSock2.h>
#include <ws2tcpip.h>
#else
#include <sys/socket.h>
#include <netinet/in.h>
#endif

namespace cs {

class InputSender {
public:
    InputSender();
    ~InputSender();

    // Non-copyable
    InputSender(const InputSender&) = delete;
    InputSender& operator=(const InputSender&) = delete;

    /// Initialize with a socket and peer address.
    bool initialize(int socket_fd, const ::sockaddr* peer, int peer_len);

    /// Send an input event to the host immediately.
    /// Returns true on success.
    bool sendInput(const InputEvent& event);

    /// Get total input packets sent.
    uint64_t getPacketsSent() const;

private:
    /// Serialize an InputEvent into the wire format.
    std::vector<uint8_t> serializeEvent(const InputEvent& event) const;

    int socket_fd_ = -1;
    std::vector<uint8_t> peer_addr_;
    int peer_addr_len_ = 0;

    std::atomic<uint64_t> packets_sent_{0};
    std::mutex mutex_;
};

} // namespace cs
