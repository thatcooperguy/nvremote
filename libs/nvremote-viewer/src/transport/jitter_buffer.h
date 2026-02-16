///////////////////////////////////////////////////////////////////////////////
// jitter_buffer.h -- Frame reassembly and jitter buffering
//
// Reassembles fragmented video frames from individual UDP packets and
// buffers them to smooth out network jitter. Frames are released in
// order (by frame_number) once all fragments are received.
//
// Design:
//   - Each video frame may be split into multiple fragments (packets).
//   - Fragments carry frame_number, fragment_index, fragment_total.
//   - A frame is complete when all fragment_total fragments are received.
//   - Complete frames are released in frame_number order.
//   - Incomplete frames older than the max age are dropped.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <vector>
#include <map>
#include <mutex>

#include <cs/transport/packet.h>

namespace cs {

class JitterBuffer {
public:
    JitterBuffer();
    ~JitterBuffer();

    /// Push a received video packet fragment into the buffer.
    void pushPacket(const VideoPacketHeader& header, const uint8_t* payload, size_t len);

    /// Pop the next complete frame (in frame_number order).
    /// Returns true if a frame was available, filling frame_data and header.
    bool popFrame(std::vector<uint8_t>& frame_data, VideoPacketHeader& header);

    /// Get the current buffer depth in milliseconds (estimated from timestamps).
    uint32_t getBufferDepthMs() const;

    /// Set the target jitter buffer depth in milliseconds.
    /// Typical range: 10-50ms. Default: 20ms for low-latency gaming.
    void setTargetDepthMs(uint32_t ms);

    /// Get number of complete frames waiting in the buffer.
    uint32_t getCompleteFrameCount() const;

    /// Get number of frames dropped due to age timeout.
    uint64_t getFramesDropped() const;

    /// Flush all buffered frames (used on reconnect to clear stale data).
    void flush();

private:
    /// Internal structure tracking the assembly state of one frame.
    struct FrameAssembly {
        VideoPacketHeader header;              // Header from the first fragment
        std::vector<std::vector<uint8_t>> fragments;  // Indexed by fragment_index
        uint32_t fragments_received = 0;
        uint32_t fragment_total     = 0;
        uint64_t first_arrival_us   = 0;       // Local timestamp of first fragment arrival
        bool     complete           = false;

        /// Returns true if all fragments have been received.
        bool isComplete() const {
            return fragments_received >= fragment_total && fragment_total > 0;
        }
    };

    /// Expire frames older than the maximum allowed age.
    void expireOldFrames();

    /// Reassemble a complete frame into a contiguous byte buffer.
    bool assembleFrame(const FrameAssembly& assembly, std::vector<uint8_t>& out) const;

    // Map of frame_number -> FrameAssembly, ordered by frame number
    std::map<uint16_t, FrameAssembly> frames_;

    // The next frame number we expect to release (for in-order delivery)
    uint16_t next_release_frame_ = 0;
    bool     first_frame_        = true;

    // Configuration
    uint32_t target_depth_ms_ = 20;     // Target buffer depth
    uint32_t max_frame_age_ms_ = 150;   // Drop frames older than this

    // Statistics
    uint64_t frames_dropped_ = 0;

    mutable std::mutex mutex_;
};

} // namespace cs
