///////////////////////////////////////////////////////////////////////////////
// clipboard_inject.cpp -- Clipboard text injection (host side)
//
// Mirrors the viewer-side clipboard_sync.cpp with reversed direction.
// Host → Viewer uses HOST_TO_VIEWER direction.
///////////////////////////////////////////////////////////////////////////////

#include "clipboard_inject.h"

#include <cs/common.h>

#include <cstring>

#ifdef _WIN32
#include <windows.h>
#endif

namespace cs::host {

ClipboardInjector::ClipboardInjector() = default;

ClipboardInjector::~ClipboardInjector() {
    stop();
}

bool ClipboardInjector::start(SendFunc send_func) {
    if (running_.load()) return false;

    send_func_ = std::move(send_func);
    running_.store(true);

    last_text_ = getClipboardText();
    last_origin_ = Origin::LOCAL;

    monitor_thread_ = std::thread(&ClipboardInjector::monitorThread, this);
    CS_LOG(INFO, "Host clipboard sync started");
    return true;
}

void ClipboardInjector::stop() {
    running_.store(false);
    if (monitor_thread_.joinable()) {
        monitor_thread_.join();
    }
    CS_LOG(INFO, "Host clipboard sync stopped");
}

void ClipboardInjector::monitorThread() {
    while (running_.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        if (!running_.load()) break;

        std::string current = getClipboardText();

        std::lock_guard<std::mutex> lock(mutex_);

        if (current != last_text_) {
            if (last_origin_ == Origin::REMOTE) {
                last_origin_ = Origin::LOCAL;
                last_text_ = current;
                continue;
            }

            last_text_ = current;

            if (!current.empty() && current.size() <= kMaxClipboardBytes) {
                sendToViewer(current);
            }
        }

        // Retry logic
        if (waiting_ack_.load() && retry_count_ < kMaxRetries) {
            auto now = std::chrono::steady_clock::now();
            if (now - last_send_time_ >= kRetryInterval) {
                if (send_func_ && !pending_packet_.empty()) {
                    send_func_(pending_packet_);
                }
                last_send_time_ = now;
                retry_count_++;
            }
        } else if (waiting_ack_.load() && retry_count_ >= kMaxRetries) {
            waiting_ack_.store(false);
            pending_packet_.clear();
        }
    }
}

void ClipboardInjector::sendToViewer(const std::string& text) {
    cs::ClipboardPacketHeader hdr = {};
    hdr.type      = static_cast<uint8_t>(cs::PacketType::CLIPBOARD);
    hdr.direction = static_cast<uint8_t>(cs::ClipboardDirection::HOST_TO_VIEWER);
    hdr.sequence  = send_seq_++;
    hdr.format    = static_cast<uint8_t>(cs::ClipboardFormat::TEXT_UTF8);
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
}

void ClipboardInjector::onClipboardReceived(const uint8_t* data, size_t len) {
    cs::ClipboardPacketHeader hdr;
    if (!cs::ClipboardPacketHeader::deserialize(data, len, hdr)) return;

    if (hdr.direction != static_cast<uint8_t>(cs::ClipboardDirection::VIEWER_TO_HOST)) return;
    if (hdr.format != static_cast<uint8_t>(cs::ClipboardFormat::TEXT_UTF8)) return;

    size_t payload_offset = sizeof(cs::ClipboardPacketHeader);
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
    cs::ClipboardAckPacket ack = {};
    ack.type         = static_cast<uint8_t>(cs::PacketType::CLIP_ACK);
    ack.reserved     = 0;
    ack.ack_sequence = hdr.sequence;

    if (send_func_) {
        send_func_(ack.serialize());
    }

    CS_LOG(DEBUG, "Host clipboard: received %u bytes from viewer", hdr.length);
}

void ClipboardInjector::onAckReceived(const uint8_t* data, size_t len) {
    cs::ClipboardAckPacket ack;
    if (!cs::ClipboardAckPacket::deserialize(data, len, ack)) return;

    std::lock_guard<std::mutex> lock(mutex_);
    if (waiting_ack_.load() && ack.ack_sequence == pending_ack_seq_) {
        waiting_ack_.store(false);
        pending_packet_.clear();
    }
}

// ---------------------------------------------------------------------------
// Platform-specific clipboard
// ---------------------------------------------------------------------------

std::string ClipboardInjector::getClipboardText() {
#ifdef _WIN32
    if (!OpenClipboard(nullptr)) return "";
    std::string result;
    HANDLE hData = GetClipboardData(CF_UNICODETEXT);
    if (hData) {
        wchar_t* pData = static_cast<wchar_t*>(GlobalLock(hData));
        if (pData) {
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
#else
    return "";
#endif
}

void ClipboardInjector::setClipboardText(const std::string& text) {
#ifdef _WIN32
    if (!OpenClipboard(nullptr)) return;
    EmptyClipboard();
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
#else
    (void)text;
#endif
}

} // namespace cs::host
