///////////////////////////////////////////////////////////////////////////////
// clipboard_sync.cpp -- Clipboard text synchronization (viewer side)
//
// Polls clipboard for changes at ~5Hz with 200ms debounce.
// Sends text changes to host via ClipboardPacketHeader + ACK protocol.
///////////////////////////////////////////////////////////////////////////////

#include "clipboard_sync.h"

#include <cs/common.h>

#include <cstring>
#include <algorithm>

#ifdef _WIN32
#include <windows.h>
#endif

#ifdef __APPLE__
// Forward: implemented via NSPasteboard in a .mm if needed.
// For now, use a basic polling approach that works from C++.
#endif

namespace cs {

ClipboardSync::ClipboardSync() = default;

ClipboardSync::~ClipboardSync() {
    stop();
}

bool ClipboardSync::start(SendFunc send_func) {
    if (running_.load()) return false;

    send_func_ = std::move(send_func);
    running_.store(true);

    // Get initial clipboard state
    last_text_ = getClipboardText();
    last_origin_ = Origin::LOCAL;

    monitor_thread_ = std::thread(&ClipboardSync::monitorThread, this);
    CS_LOG(INFO, "Clipboard sync started");
    return true;
}

void ClipboardSync::stop() {
    running_.store(false);
    if (monitor_thread_.joinable()) {
        monitor_thread_.join();
    }
    CS_LOG(INFO, "Clipboard sync stopped");
}

void ClipboardSync::monitorThread() {
    auto last_check = std::chrono::steady_clock::now();

    while (running_.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        if (!running_.load()) break;

        // Check for local clipboard changes
        std::string current = getClipboardText();

        std::lock_guard<std::mutex> lock(mutex_);

        if (current != last_text_) {
            if (last_origin_ == Origin::REMOTE) {
                // This change was caused by us setting clipboard from remote.
                // Reset origin and skip sending.
                last_origin_ = Origin::LOCAL;
                last_text_ = current;
                continue;
            }

            // Debounce
            auto now = std::chrono::steady_clock::now();
            if (now - last_check < kDebounceMs) {
                continue;
            }
            last_check = now;

            last_text_ = current;

            // Send to host if non-empty and within size limit
            if (!current.empty() && current.size() <= kMaxClipboardBytes) {
                sendToHost(current);
            }
        }

        // Check for pending ACK retries
        if (waiting_ack_.load() && retry_count_ < kMaxRetries) {
            auto now = std::chrono::steady_clock::now();
            if (now - last_send_time_ >= kRetryInterval) {
                CS_LOG(DEBUG, "Clipboard: retrying send (attempt %d/%d, seq=%u)",
                       retry_count_ + 1, kMaxRetries, pending_ack_seq_);
                if (send_func_ && !pending_packet_.empty()) {
                    send_func_(pending_packet_);
                }
                last_send_time_ = now;
                retry_count_++;
            }
        } else if (waiting_ack_.load() && retry_count_ >= kMaxRetries) {
            CS_LOG(WARN, "Clipboard: give up after %d retries (seq=%u)", kMaxRetries, pending_ack_seq_);
            waiting_ack_.store(false);
            pending_packet_.clear();
        }
    }
}

void ClipboardSync::sendToHost(const std::string& text) {
    ClipboardPacketHeader hdr = {};
    hdr.type      = static_cast<uint8_t>(PacketType::CLIPBOARD);
    hdr.direction = static_cast<uint8_t>(ClipboardDirection::VIEWER_TO_HOST);
    hdr.sequence  = send_seq_++;
    hdr.format    = static_cast<uint8_t>(ClipboardFormat::TEXT_UTF8);
    std::memset(hdr.reserved, 0, sizeof(hdr.reserved));
    hdr.length    = static_cast<uint32_t>(text.size());

    pending_packet_ = hdr.serialize(
        reinterpret_cast<const uint8_t*>(text.data()), text.size());

    pending_ack_seq_ = hdr.sequence;
    waiting_ack_.store(true);
    retry_count_ = 0;
    last_send_time_ = std::chrono::steady_clock::now();

    if (send_func_) {
        send_func_(pending_packet_);
    }

    CS_LOG(DEBUG, "Clipboard: sent %zu bytes to host (seq=%u)", text.size(), hdr.sequence);
}

void ClipboardSync::onClipboardReceived(const uint8_t* data, size_t len) {
    ClipboardPacketHeader hdr;
    if (!ClipboardPacketHeader::deserialize(data, len, hdr)) return;

    if (hdr.direction != static_cast<uint8_t>(ClipboardDirection::HOST_TO_VIEWER)) return;
    if (hdr.format != static_cast<uint8_t>(ClipboardFormat::TEXT_UTF8)) return;

    size_t payload_offset = sizeof(ClipboardPacketHeader);
    if (len < payload_offset + hdr.length) return;
    if (hdr.length > kMaxClipboardBytes) return;

    std::string text(reinterpret_cast<const char*>(data + payload_offset), hdr.length);

    {
        std::lock_guard<std::mutex> lock(mutex_);
        last_origin_ = Origin::REMOTE;
        last_text_ = text;
    }

    setClipboardText(text);

    // Send ACK
    ClipboardAckPacket ack = {};
    ack.type         = static_cast<uint8_t>(PacketType::CLIP_ACK);
    ack.reserved     = 0;
    ack.ack_sequence = hdr.sequence;

    if (send_func_) {
        send_func_(ack.serialize());
    }

    CS_LOG(DEBUG, "Clipboard: received %u bytes from host (seq=%u)", hdr.length, hdr.sequence);
}

void ClipboardSync::onAckReceived(const uint8_t* data, size_t len) {
    ClipboardAckPacket ack;
    if (!ClipboardAckPacket::deserialize(data, len, ack)) return;

    std::lock_guard<std::mutex> lock(mutex_);
    if (waiting_ack_.load() && ack.ack_sequence == pending_ack_seq_) {
        waiting_ack_.store(false);
        pending_packet_.clear();
        CS_LOG(DEBUG, "Clipboard: ACK received (seq=%u)", ack.ack_sequence);
    }
}

// ---------------------------------------------------------------------------
// Platform-specific clipboard access
// ---------------------------------------------------------------------------

std::string ClipboardSync::getClipboardText() {
#ifdef _WIN32
    if (!OpenClipboard(nullptr)) return "";

    std::string result;
    HANDLE hData = GetClipboardData(CF_UNICODETEXT);
    if (hData) {
        wchar_t* pData = static_cast<wchar_t*>(GlobalLock(hData));
        if (pData) {
            // Convert UTF-16 to UTF-8
            int size = WideCharToMultiByte(CP_UTF8, 0, pData, -1, nullptr, 0, nullptr, nullptr);
            if (size > 0) {
                result.resize(static_cast<size_t>(size - 1));
                WideCharToMultiByte(CP_UTF8, 0, pData, -1, result.data(), size, nullptr, nullptr);
            }
            GlobalUnlock(hData);
        }
    }

    CloseClipboard();
    return result;
#elif defined(__APPLE__)
    // Basic approach: use pbpaste command
    // A proper implementation would use NSPasteboard via Objective-C
    FILE* pipe = popen("pbpaste", "r");
    if (!pipe) return "";
    std::string result;
    char buf[1024];
    while (fgets(buf, sizeof(buf), pipe)) {
        result += buf;
    }
    pclose(pipe);
    return result;
#else
    return "";
#endif
}

void ClipboardSync::setClipboardText(const std::string& text) {
#ifdef _WIN32
    if (!OpenClipboard(nullptr)) return;
    EmptyClipboard();

    // Convert UTF-8 to UTF-16
    int wsize = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, nullptr, 0);
    if (wsize > 0) {
        HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, static_cast<size_t>(wsize) * sizeof(wchar_t));
        if (hMem) {
            wchar_t* pMem = static_cast<wchar_t*>(GlobalLock(hMem));
            if (pMem) {
                MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, pMem, wsize);
                GlobalUnlock(hMem);
                SetClipboardData(CF_UNICODETEXT, hMem);
            }
        }
    }

    CloseClipboard();
#elif defined(__APPLE__)
    // Basic approach: use pbcopy
    FILE* pipe = popen("pbcopy", "w");
    if (pipe) {
        fwrite(text.data(), 1, text.size(), pipe);
        pclose(pipe);
    }
#endif
}

} // namespace cs
