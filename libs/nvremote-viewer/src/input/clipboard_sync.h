///////////////////////////////////////////////////////////////////////////////
// clipboard_sync.h -- Clipboard text synchronization (viewer side)
//
// Monitors the local clipboard for text changes and sends them to the host.
// Also receives clipboard text from the host and sets it locally.
//
// Loop prevention: tracks whether the last clipboard set was LOCAL or REMOTE.
// When we set the clipboard from a remote packet, we ignore the resulting
// clipboard-change notification.
//
// Constraints: text-only, max 64KB, 200ms debounce, ACK-based reliability.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cs/transport/packet.h>

#include <cstdint>
#include <string>
#include <mutex>
#include <atomic>
#include <thread>
#include <functional>
#include <chrono>

namespace cs {

class ClipboardSync {
public:
    ClipboardSync();
    ~ClipboardSync();

    // Non-copyable
    ClipboardSync(const ClipboardSync&) = delete;
    ClipboardSync& operator=(const ClipboardSync&) = delete;

    /// Callback to send a serialized clipboard packet over the transport.
    using SendFunc = std::function<void(const std::vector<uint8_t>& data)>;

    /// Start clipboard monitoring.
    bool start(SendFunc send_func);

    /// Stop monitoring.
    void stop();

    /// Called when we receive a clipboard packet from the host.
    void onClipboardReceived(const uint8_t* data, size_t len);

    /// Called when we receive a clipboard ACK from the host.
    void onAckReceived(const uint8_t* data, size_t len);

private:
    /// Monitor thread: watches for local clipboard changes.
    void monitorThread();

    /// Get current clipboard text (platform-specific).
    std::string getClipboardText();

    /// Set clipboard text locally (platform-specific).
    void setClipboardText(const std::string& text);

    /// Send clipboard text to host with retry logic.
    void sendToHost(const std::string& text);

    SendFunc send_func_;
    std::thread monitor_thread_;
    std::atomic<bool> running_{false};

    // Last known clipboard content (for change detection)
    std::string last_text_;

    // Loop prevention
    enum class Origin { LOCAL, REMOTE };
    Origin last_origin_ = Origin::LOCAL;

    // Sequence tracking
    uint16_t send_seq_ = 0;

    // Pending ACK
    std::atomic<bool> waiting_ack_{false};
    uint16_t pending_ack_seq_ = 0;
    std::chrono::steady_clock::time_point last_send_time_;
    int retry_count_ = 0;
    std::vector<uint8_t> pending_packet_;

    // Max payload size
    static constexpr size_t kMaxClipboardBytes = 65536;
    // Debounce interval
    static constexpr auto kDebounceMs = std::chrono::milliseconds(200);
    // Retry parameters
    static constexpr int kMaxRetries = 3;
    static constexpr auto kRetryInterval = std::chrono::milliseconds(200);

    std::mutex mutex_;

#ifdef _WIN32
    // Window handle for clipboard listener
    void* listener_hwnd_ = nullptr;
#endif
};

} // namespace cs
