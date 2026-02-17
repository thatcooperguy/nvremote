///////////////////////////////////////////////////////////////////////////////
// stats_reporter.cpp -- QoS statistics collector and feedback sender
//
// Collects streaming statistics and sends QoS feedback to the host
// every 200ms so it can adapt encoding parameters (bitrate, resolution,
// keyframe interval) based on network conditions.
///////////////////////////////////////////////////////////////////////////////

#include "stats_reporter.h"

#include "../transport/nack_sender.h"

#include <cs/common.h>
#include <cs/transport/packet.h>

#include <chrono>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <numeric>

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

StatsReporter::StatsReporter() = default;

StatsReporter::~StatsReporter() {
    stop();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool StatsReporter::initialize(int socket_fd, const ::sockaddr* peer, int peer_len) {
    std::lock_guard<std::mutex> lock(mutex_);

    socket_fd_ = socket_fd;

    if (peer && peer_len > 0) {
        peer_addr_.assign(reinterpret_cast<const uint8_t*>(peer),
                          reinterpret_cast<const uint8_t*>(peer) + peer_len);
        peer_addr_len_ = peer_len;
    }

    CS_LOG(INFO, "StatsReporter: initialized");
    return true;
}

// ---------------------------------------------------------------------------
// setNackSender
// ---------------------------------------------------------------------------

void StatsReporter::setNackSender(NackSender* nack_sender) {
    std::lock_guard<std::mutex> lock(mutex_);
    nack_sender_ = nack_sender;
}

// ---------------------------------------------------------------------------
// onPacketReceived
// ---------------------------------------------------------------------------

void StatsReporter::onPacketReceived(const VideoPacketHeader& header, uint64_t recv_time_us) {
    std::lock_guard<std::mutex> lock(mutex_);

    PacketRecord record;
    record.seq = header.sequence_number;
    record.sender_timestamp_us = header.timestamp_us;
    record.recv_time_us = recv_time_us;
    record.payload_size = header.payload_length + static_cast<uint32_t>(sizeof(VideoPacketHeader));

    // Track sequence numbers for packet loss
    if (first_packet_) {
        expected_seq_ = header.sequence_number;
        window_start_us_ = recv_time_us;
        first_packet_ = false;
    }

    total_received_++;

    // Count expected packets (handling wraparound)
    int16_t delta = static_cast<int16_t>(header.sequence_number - expected_seq_);
    if (delta > 0) {
        total_expected_ += static_cast<uint64_t>(delta);
        expected_seq_ = header.sequence_number + 1;
    } else if (delta == 0) {
        total_expected_++;
        expected_seq_++;
    }
    // Negative delta = reordered/retransmitted packet, already counted

    // Jitter calculation (RFC 3550 interarrival jitter)
    if (jitter_initialized_) {
        int64_t transit = static_cast<int64_t>(recv_time_us) -
                          static_cast<int64_t>(header.timestamp_us);
        int64_t d = transit - last_transit_;
        if (d < 0) d = -d;
        jitter_ += (static_cast<double>(d) - jitter_) / 16.0;
        last_transit_ = transit;
    } else {
        last_transit_ = static_cast<int64_t>(recv_time_us) -
                        static_cast<int64_t>(header.timestamp_us);
        jitter_initialized_ = true;
    }

    // Bandwidth tracking
    window_bytes_ += record.payload_size;

    // Store record
    recent_packets_.push_back(record);
    while (recent_packets_.size() > MAX_RECENT_PACKETS) {
        recent_packets_.pop_front();
    }
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

void StatsReporter::start() {
    if (running_.load()) return;

    running_.store(true);
    feedback_thread_ = std::thread(&StatsReporter::feedbackLoop, this);

    CS_LOG(INFO, "StatsReporter: started (200ms feedback interval)");
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

void StatsReporter::stop() {
    running_.store(false);

    if (feedback_thread_.joinable()) {
        feedback_thread_.join();
    }

    CS_LOG(INFO, "StatsReporter: stopped");
}

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

ViewerStats StatsReporter::getStats() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::lock_guard<std::mutex> slock(stats_mutex_);

    ViewerStats stats;
    stats.bitrate_kbps = calculateBandwidthKbps();
    stats.packet_loss = calculatePacketLoss();
    stats.jitter_ms = calculateJitterUs() / 1000.0;
    stats.decode_time_ms = decode_time_ms_;
    stats.render_time_ms = render_time_ms_;
    stats.codec = codec_name_;
    stats.resolution_width = resolution_width_;
    stats.resolution_height = resolution_height_;
    stats.frames_decoded = frames_decoded_.load();
    stats.frames_dropped = frames_dropped_.load();
    stats.packets_received = total_received_;
    stats.bytes_received = window_bytes_;

    // Estimate FPS from recent frame timestamps
    if (recent_packets_.size() >= 2) {
        uint64_t time_span = recent_packets_.back().recv_time_us -
                             recent_packets_.front().recv_time_us;
        if (time_span > 0) {
            double seconds = static_cast<double>(time_span) / 1e6;
            stats.fps = static_cast<double>(frames_decoded_.load()) > 0 ?
                        static_cast<double>(frames_decoded_.load()) / seconds : 0.0;
            // Clamp to reasonable range
            if (stats.fps > 300.0) stats.fps = 0.0;
        }
    }

    stats.connection_type = "p2p";

    return stats;
}

// ---------------------------------------------------------------------------
// Stat update methods
// ---------------------------------------------------------------------------

void StatsReporter::setDecodeTimeMs(double ms) {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    decode_time_ms_ = ms;
}

void StatsReporter::setRenderTimeMs(double ms) {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    render_time_ms_ = ms;
}

void StatsReporter::setCodecName(const std::string& name) {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    codec_name_ = name;
}

void StatsReporter::setResolution(uint32_t width, uint32_t height) {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    resolution_width_ = width;
    resolution_height_ = height;
}

void StatsReporter::onFrameDecoded() {
    frames_decoded_.fetch_add(1);
}

void StatsReporter::onFrameDropped() {
    frames_dropped_.fetch_add(1);
}

// ---------------------------------------------------------------------------
// feedbackLoop
// ---------------------------------------------------------------------------

void StatsReporter::feedbackLoop() {
    while (running_.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));

        if (!running_.load()) break;

        sendFeedback();
    }
}

// ---------------------------------------------------------------------------
// sendFeedback
// ---------------------------------------------------------------------------

void StatsReporter::sendFeedback() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (socket_fd_ < 0 || peer_addr_.empty()) {
        return;
    }

    QosFeedbackPacket feedback = {};
    feedback.type = static_cast<uint8_t>(PacketType::QOS_FEEDBACK);
    feedback.flags = 0;

    // Fill in stats
    if (!recent_packets_.empty()) {
        feedback.last_seq_received = recent_packets_.back().seq;
    }

    feedback.estimated_bw_kbps = static_cast<uint32_t>(calculateBandwidthKbps());

    double loss = calculatePacketLoss();
    feedback.packet_loss_x100 = static_cast<uint16_t>(loss * 10000.0);

    double jitter_us = calculateJitterUs();
    feedback.avg_jitter_us = static_cast<uint16_t>(
        std::min(jitter_us, static_cast<double>(UINT16_MAX)));

    feedback.delay_gradient_us = calculateDelayGradientUs();

    // Include NACK sequences from the NACK sender
    feedback.nack_count = 0;
    feedback.nack_seq_0 = 0;
    feedback.nack_seq_1 = 0;

    if (nack_sender_) {
        auto missing = nack_sender_->getMissingSequences();
        feedback.nack_count = static_cast<uint16_t>(std::min(missing.size(), static_cast<size_t>(UINT16_MAX)));
        if (missing.size() >= 1) feedback.nack_seq_0 = missing[0];
        if (missing.size() >= 2) feedback.nack_seq_1 = missing[1];
    }

    // Serialize and send
    auto buf = feedback.serialize();

    int sent = ::sendto(socket_fd_,
                         reinterpret_cast<const char*>(buf.data()),
                         static_cast<int>(buf.size()),
                         0,
                         reinterpret_cast<const ::sockaddr*>(peer_addr_.data()),
                         peer_addr_len_);

    if (sent <= 0) {
        CS_LOG(WARN, "StatsReporter: sendto failed: %d", cs_socket_error());
    }
}

// ---------------------------------------------------------------------------
// calculatePacketLoss
// ---------------------------------------------------------------------------

double StatsReporter::calculatePacketLoss() const {
    // Called under lock
    if (total_expected_ == 0) return 0.0;

    uint64_t lost = (total_expected_ > total_received_) ?
                    (total_expected_ - total_received_) : 0;
    return static_cast<double>(lost) / static_cast<double>(total_expected_);
}

// ---------------------------------------------------------------------------
// calculateJitterUs
// ---------------------------------------------------------------------------

double StatsReporter::calculateJitterUs() const {
    // Called under lock
    return jitter_;
}

// ---------------------------------------------------------------------------
// calculateBandwidthKbps
// ---------------------------------------------------------------------------

double StatsReporter::calculateBandwidthKbps() const {
    // Called under lock
    if (recent_packets_.size() < 2) return 0.0;

    uint64_t time_span = recent_packets_.back().recv_time_us -
                         recent_packets_.front().recv_time_us;
    if (time_span == 0) return 0.0;

    // Sum bytes in the recent window
    uint64_t total_bytes = 0;
    for (const auto& pkt : recent_packets_) {
        total_bytes += pkt.payload_size;
    }

    double seconds = static_cast<double>(time_span) / 1e6;
    double bits = static_cast<double>(total_bytes) * 8.0;
    return bits / seconds / 1000.0;  // kbps
}

// ---------------------------------------------------------------------------
// calculateDelayGradientUs
// ---------------------------------------------------------------------------

int32_t StatsReporter::calculateDelayGradientUs() const {
    // Simple Kalman filter on one-way delay measurements
    // Called under lock

    if (recent_packets_.size() < 2) return 0;

    // Calculate inter-packet delay differences
    const auto& prev = recent_packets_[recent_packets_.size() - 2];
    const auto& curr = recent_packets_.back();

    // One-way delay: (recv_time - sender_timestamp)
    int64_t prev_delay = static_cast<int64_t>(prev.recv_time_us) -
                         static_cast<int64_t>(prev.sender_timestamp_us);
    int64_t curr_delay = static_cast<int64_t>(curr.recv_time_us) -
                         static_cast<int64_t>(curr.sender_timestamp_us);

    double measurement = static_cast<double>(curr_delay - prev_delay);

    // Kalman filter update
    double predict_error = kalman_error_ + KALMAN_Q;
    double kalman_gain = predict_error / (predict_error + KALMAN_R);
    kalman_estimate_ = kalman_estimate_ + kalman_gain * (measurement - kalman_estimate_);
    kalman_error_ = (1.0 - kalman_gain) * predict_error;

    return static_cast<int32_t>(kalman_estimate_);
}

} // namespace cs
