///////////////////////////////////////////////////////////////////////////////
// stats_reporter.h -- QoS statistics collector and feedback sender
//
// Collects real-time streaming statistics (packet loss, jitter, bandwidth,
// one-way delay gradient) and periodically sends QoS feedback packets to
// the host so it can adapt encoding parameters.
//
// Feedback is sent every 200ms using the QosFeedbackPacket format defined
// in crazystream-common.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <mutex>
#include <thread>
#include <atomic>
#include <deque>
#include <vector>

// Platform socket headers -- needed so ::sockaddr resolves inside the namespace.
#ifdef _WIN32
#include <WinSock2.h>
#include <ws2tcpip.h>
#else
#include <sys/socket.h>
#include <netinet/in.h>
#endif

#include <cs/transport/packet.h>
#include "../viewer.h"

namespace cs {

class NackSender;  // forward

class StatsReporter {
public:
    StatsReporter();
    ~StatsReporter();

    // Non-copyable
    StatsReporter(const StatsReporter&) = delete;
    StatsReporter& operator=(const StatsReporter&) = delete;

    /// Initialize with a socket and peer address for sending feedback.
    bool initialize(int socket_fd, const ::sockaddr* peer, int peer_len);

    /// Set the NACK sender to query for missing sequences.
    void setNackSender(NackSender* nack_sender);

    /// Called for each received video packet to update statistics.
    void onPacketReceived(const VideoPacketHeader& header, uint64_t recv_time_us);

    /// Start sending feedback every 200ms.
    void start();

    /// Stop the feedback loop.
    void stop();

    /// Get a snapshot of current statistics.
    ViewerStats getStats() const;

    /// Update decode time from the decoder.
    void setDecodeTimeMs(double ms);

    /// Update render time from the renderer.
    void setRenderTimeMs(double ms);

    /// Update codec name.
    void setCodecName(const std::string& name);

    /// Update resolution.
    void setResolution(uint32_t width, uint32_t height);

    /// Increment frames decoded counter.
    void onFrameDecoded();

    /// Increment frames dropped counter.
    void onFrameDropped();

private:
    /// Background thread function.
    void feedbackLoop();

    /// Calculate and send a QoS feedback packet.
    void sendFeedback();

    /// Calculate packet loss rate over the recent window.
    double calculatePacketLoss() const;

    /// Calculate average jitter in microseconds.
    double calculateJitterUs() const;

    /// Estimate bandwidth in kbps over the recent window.
    double calculateBandwidthKbps() const;

    /// Calculate one-way delay gradient using a simple Kalman filter.
    int32_t calculateDelayGradientUs() const;

    // Socket
    int socket_fd_ = -1;
    std::vector<uint8_t> peer_addr_;
    int peer_addr_len_ = 0;

    // NACK sender reference (not owned)
    NackSender* nack_sender_ = nullptr;

    // Packet arrival records for statistics calculation
    struct PacketRecord {
        uint16_t seq;
        uint32_t sender_timestamp_us;
        uint64_t recv_time_us;
        uint32_t payload_size;
    };
    std::deque<PacketRecord> recent_packets_;
    static constexpr size_t MAX_RECENT_PACKETS = 1000;

    // Sequence tracking for packet loss
    uint16_t expected_seq_       = 0;
    uint64_t total_expected_     = 0;
    uint64_t total_received_     = 0;
    bool     first_packet_       = true;

    // Jitter calculation (RFC 3550 style)
    double   jitter_             = 0.0;
    int64_t  last_transit_       = 0;
    bool     jitter_initialized_ = false;

    // Bandwidth window
    uint64_t window_start_us_    = 0;
    uint64_t window_bytes_       = 0;

    // One-way delay Kalman filter state
    mutable double kalman_estimate_ = 0.0;
    mutable double kalman_error_    = 1.0;
    static constexpr double KALMAN_Q = 0.001;  // Process noise
    static constexpr double KALMAN_R = 0.1;    // Measurement noise

    // Stats snapshot (thread-safe)
    mutable std::mutex stats_mutex_;
    double   decode_time_ms_    = 0.0;
    double   render_time_ms_    = 0.0;
    std::string codec_name_;
    uint32_t resolution_width_  = 0;
    uint32_t resolution_height_ = 0;
    std::atomic<uint64_t> frames_decoded_{0};
    std::atomic<uint64_t> frames_dropped_{0};

    // Thread
    std::thread feedback_thread_;
    std::atomic<bool> running_{false};

    mutable std::mutex mutex_;
};

} // namespace cs
