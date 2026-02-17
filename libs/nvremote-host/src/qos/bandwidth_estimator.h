///////////////////////////////////////////////////////////////////////////////
// bandwidth_estimator.h -- Bandwidth estimation via send/receive timing
//
// Tracks packet send and receive timestamps to estimate the available
// bandwidth.  Uses a sliding window over the last 1 second of data to
// compute the rate, and detects congestion via delay gradient trends.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "kalman_filter.h"

#include <cstdint>
#include <deque>
#include <mutex>
#include <unordered_map>

namespace cs::host {

class BandwidthEstimator {
public:
    BandwidthEstimator();
    ~BandwidthEstimator() = default;

    /// Record that a packet was sent.
    void onPacketSent(uint16_t seq, size_t bytes, uint64_t send_time_us);

    /// Record that an ACK was received for a packet.
    void onAckReceived(uint16_t seq, uint64_t recv_time_us);

    /// Get the estimated available bandwidth in kbps.
    uint32_t getEstimatedBandwidthKbps() const;

    /// Get the smoothed one-way delay gradient (ms/s).
    /// Positive = increasing delay (congestion).
    double getDelayGradient() const;

    /// Get the latest RTT measurement in microseconds.
    uint64_t getLatestRttUs() const { return latest_rtt_us_; }

private:
    /// Information about a sent packet, kept until ACK.
    struct SentPacketInfo {
        uint16_t seq         = 0;
        size_t   bytes       = 0;
        uint64_t send_time_us = 0;
    };

    /// A completed send-receive pair used for bandwidth calculation.
    struct TimingPair {
        uint64_t send_time_us = 0;
        uint64_t recv_time_us = 0;
        size_t   bytes        = 0;
    };

    mutable std::mutex          mutex_;

    // Sent packets awaiting ACK (keyed by sequence number).
    std::unordered_map<uint16_t, SentPacketInfo> pending_;

    // Completed timing pairs in the sliding window.
    std::deque<TimingPair>      window_;

    // Sliding window duration.
    static constexpr uint64_t WINDOW_DURATION_US = 1'000'000;  // 1 second

    // Kalman filter for delay gradient smoothing.
    KalmanFilter                delay_filter_;

    // Last one-way delay (for computing gradient).
    int64_t                     last_owd_us_       = 0;
    uint64_t                    last_owd_time_us_  = 0;
    uint64_t                    latest_rtt_us_     = 0;

    // Cached bandwidth estimate.
    mutable uint32_t            estimated_bw_kbps_ = 20000;
};

} // namespace cs::host
