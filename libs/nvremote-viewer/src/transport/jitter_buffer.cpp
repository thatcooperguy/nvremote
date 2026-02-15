///////////////////////////////////////////////////////////////////////////////
// jitter_buffer.cpp -- Frame reassembly and jitter buffering
//
// Reassembles fragmented video frames from UDP packets and holds them
// in a time-ordered buffer to smooth out network jitter before releasing
// them for decoding.
///////////////////////////////////////////////////////////////////////////////

#include "jitter_buffer.h"

#include <cs/common.h>

#include <algorithm>
#include <cstring>

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

JitterBuffer::JitterBuffer() = default;

JitterBuffer::~JitterBuffer() = default;

// ---------------------------------------------------------------------------
// pushPacket
// ---------------------------------------------------------------------------

void JitterBuffer::pushPacket(const VideoPacketHeader& header,
                               const uint8_t* payload, size_t len) {
    std::lock_guard<std::mutex> lock(mutex_);

    uint16_t frame_num = header.frame_number;
    uint8_t frag_idx = header.fragment_index;
    uint8_t frag_total = header.fragment_total;

    // Sanity checks
    if (frag_total == 0 || frag_idx >= frag_total) {
        CS_LOG(WARN, "JitterBuffer: invalid fragment %u/%u for frame %u",
               frag_idx, frag_total, frame_num);
        return;
    }

    // Initialize sequence tracking on first packet
    if (first_frame_) {
        next_release_frame_ = frame_num;
        first_frame_ = false;
    }

    // Check if this frame is too old (behind the release pointer by more than
    // half the sequence space). This handles 16-bit wraparound.
    int16_t delta = static_cast<int16_t>(frame_num - next_release_frame_);
    if (delta < -100) {
        // Very old frame, discard
        return;
    }

    // Find or create the frame assembly
    auto& assembly = frames_[frame_num];

    // First fragment for this frame: initialize
    if (assembly.fragment_total == 0) {
        assembly.header = header;
        assembly.fragment_total = frag_total;
        assembly.fragments.resize(frag_total);
        assembly.first_arrival_us = getTimestampUs();
    }

    // Avoid duplicate fragments
    if (frag_idx < assembly.fragments.size() && !assembly.fragments[frag_idx].empty()) {
        return;  // Already received this fragment
    }

    // Store the fragment
    if (frag_idx < assembly.fragments.size()) {
        assembly.fragments[frag_idx].assign(payload, payload + len);
        assembly.fragments_received++;
    }

    // Check if frame is now complete
    if (!assembly.complete && assembly.isComplete()) {
        assembly.complete = true;
    }

    // Expire old incomplete frames periodically
    expireOldFrames();
}

// ---------------------------------------------------------------------------
// popFrame
// ---------------------------------------------------------------------------

bool JitterBuffer::popFrame(std::vector<uint8_t>& frame_data, VideoPacketHeader& header) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Look for the next frame in sequence
    auto it = frames_.find(next_release_frame_);
    if (it == frames_.end()) {
        // Frame not yet received. Check if we should skip ahead
        // (if we have a complete frame further ahead and the current one is very late).
        if (!frames_.empty()) {
            auto first_it = frames_.begin();
            int16_t gap = static_cast<int16_t>(first_it->first - next_release_frame_);
            if (gap > 0 && gap < 100) {
                // Check if the earliest frame we have is complete and old enough
                uint64_t now = getTimestampUs();
                uint64_t age_ms = (now - first_it->second.first_arrival_us) / 1000;
                if (first_it->second.complete && age_ms > target_depth_ms_) {
                    // Skip to this frame (dropping the missing ones)
                    uint16_t skipped = first_it->first - next_release_frame_;
                    frames_dropped_ += skipped;
                    next_release_frame_ = first_it->first;
                    it = first_it;
                }
            }
        }

        if (it == frames_.end()) {
            return false;
        }
    }

    // Check if the frame is complete
    if (!it->second.complete) {
        // Check if we should release it anyway (too old)
        uint64_t now = getTimestampUs();
        uint64_t age_ms = (now - it->second.first_arrival_us) / 1000;
        if (age_ms < max_frame_age_ms_) {
            return false;  // Wait for more fragments
        }

        // Frame is too old and still incomplete, drop it
        CS_LOG(DEBUG, "JitterBuffer: dropping incomplete frame %u (%u/%u fragments, age=%llu ms)",
               it->first, it->second.fragments_received, it->second.fragment_total,
               static_cast<unsigned long long>(age_ms));
        frames_dropped_++;
        frames_.erase(it);
        next_release_frame_++;
        return false;
    }

    // Check jitter buffer depth: don't release if we haven't buffered enough
    uint64_t now = getTimestampUs();
    uint64_t age_ms = (now - it->second.first_arrival_us) / 1000;
    // For very low latency (performance mode), release immediately when complete
    // For balanced/quality, hold for target_depth_ms_
    // Skip this delay if the buffer is getting full (>5 frames waiting)
    uint32_t complete_count = 0;
    for (const auto& f : frames_) {
        if (f.second.complete) complete_count++;
    }
    if (age_ms < target_depth_ms_ && complete_count < 3) {
        return false;  // Hold in buffer
    }

    // Assemble the frame
    if (!assembleFrame(it->second, frame_data)) {
        CS_LOG(WARN, "JitterBuffer: frame assembly failed for frame %u", it->first);
        frames_.erase(it);
        next_release_frame_++;
        return false;
    }

    header = it->second.header;
    frames_.erase(it);
    next_release_frame_++;

    return true;
}

// ---------------------------------------------------------------------------
// getBufferDepthMs
// ---------------------------------------------------------------------------

uint32_t JitterBuffer::getBufferDepthMs() const {
    std::lock_guard<std::mutex> lock(mutex_);

    if (frames_.empty()) return 0;

    uint64_t now = getTimestampUs();
    uint64_t oldest = frames_.begin()->second.first_arrival_us;
    return static_cast<uint32_t>((now - oldest) / 1000);
}

// ---------------------------------------------------------------------------
// setTargetDepthMs
// ---------------------------------------------------------------------------

void JitterBuffer::setTargetDepthMs(uint32_t ms) {
    std::lock_guard<std::mutex> lock(mutex_);
    target_depth_ms_ = ms;
    CS_LOG(DEBUG, "JitterBuffer: target depth set to %u ms", ms);
}

// ---------------------------------------------------------------------------
// getCompleteFrameCount
// ---------------------------------------------------------------------------

uint32_t JitterBuffer::getCompleteFrameCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    uint32_t count = 0;
    for (const auto& pair : frames_) {
        if (pair.second.complete) count++;
    }
    return count;
}

// ---------------------------------------------------------------------------
// getFramesDropped
// ---------------------------------------------------------------------------

uint64_t JitterBuffer::getFramesDropped() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return frames_dropped_;
}

// ---------------------------------------------------------------------------
// expireOldFrames
// ---------------------------------------------------------------------------

void JitterBuffer::expireOldFrames() {
    // Called under lock

    uint64_t now = getTimestampUs();
    uint64_t max_age_us = static_cast<uint64_t>(max_frame_age_ms_) * 1000;

    auto it = frames_.begin();
    while (it != frames_.end()) {
        if (!it->second.complete) {
            uint64_t age = now - it->second.first_arrival_us;
            if (age > max_age_us) {
                CS_LOG(DEBUG, "JitterBuffer: expiring frame %u (age=%llu us, %u/%u frags)",
                       it->first, static_cast<unsigned long long>(age),
                       it->second.fragments_received, it->second.fragment_total);
                frames_dropped_++;
                it = frames_.erase(it);
                continue;
            }
        }
        ++it;
    }

    // Also limit total buffer size to prevent unbounded growth
    while (frames_.size() > 100) {
        auto oldest = frames_.begin();
        CS_LOG(WARN, "JitterBuffer: buffer overflow, dropping frame %u", oldest->first);
        frames_dropped_++;
        frames_.erase(oldest);
    }
}

// ---------------------------------------------------------------------------
// assembleFrame
// ---------------------------------------------------------------------------

bool JitterBuffer::assembleFrame(const FrameAssembly& assembly,
                                  std::vector<uint8_t>& out) const {
    // Calculate total size
    size_t total_size = 0;
    for (const auto& frag : assembly.fragments) {
        if (frag.empty()) {
            // Should not happen if frame is complete, but be safe
            CS_LOG(WARN, "JitterBuffer: missing fragment in 'complete' frame");
            return false;
        }
        total_size += frag.size();
    }

    // Assemble in order
    out.clear();
    out.reserve(total_size);

    for (const auto& frag : assembly.fragments) {
        out.insert(out.end(), frag.begin(), frag.end());
    }

    return true;
}

} // namespace cs
