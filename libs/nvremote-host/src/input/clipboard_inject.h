///////////////////////////////////////////////////////////////////////////////
// clipboard_inject.h -- Clipboard text injection (host side)
//
// Receives clipboard text from the viewer and sets it on the host clipboard.
// Also monitors the host clipboard for changes and sends them to the viewer.
//
// Text-only in v1, max 64KB, with ACK-based reliable delivery.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cs/transport/packet.h>

#include <cstdint>
#include <string>
#include <mutex>
#include <atomic>
#include <thread>
#include <functional>
#include <vector>
#include <chrono>

namespace cs::host {

class ClipboardInjector {
public:
    ClipboardInjector();
    ~ClipboardInjector();

    // Non-copyable
    ClipboardInjector(const ClipboardInjector&) = delete;
    ClipboardInjector& operator=(const ClipboardInjector&) = delete;

    /// Callback to send a serialized clipboard packet over the transport.
    using SendFunc = std::function<void(const std::vector<uint8_t>& data)>;

    /// Start clipboard monitoring and injection.
    bool start(SendFunc send_func);

    /// Stop.
    void stop();

    /// Called when a clipboard packet arrives from the viewer.
    void onClipboardReceived(const uint8_t* data, size_t len);

    /// Called when a clipboard ACK arrives from the viewer.
    void onAckReceived(const uint8_t* data, size_t len);

private:
    void monitorThread();
    std::string getClipboardText();
    void setClipboardText(const std::string& text);
    void sendToViewer(const std::string& text);

    SendFunc send_func_;
    std::thread monitor_thread_;
    std::atomic<bool> running_{false};

    std::string last_text_;

    enum class Origin { LOCAL, REMOTE };
    Origin last_origin_ = Origin::LOCAL;

    uint16_t send_seq_ = 0;

    std::atomic<bool> waiting_ack_{false};
    uint16_t pending_ack_seq_ = 0;
    std::chrono::steady_clock::time_point last_send_time_;
    int retry_count_ = 0;
    std::vector<uint8_t> pending_packet_;

    static constexpr size_t kMaxClipboardBytes = 65536;
    static constexpr int kMaxRetries = 3;
    static constexpr auto kRetryInterval = std::chrono::milliseconds(200);

    std::mutex mutex_;
};

} // namespace cs::host
