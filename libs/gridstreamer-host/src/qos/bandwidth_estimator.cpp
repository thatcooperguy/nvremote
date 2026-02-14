///////////////////////////////////////////////////////////////////////////////
// bandwidth_estimator.cpp -- Bandwidth estimation implementation
//
// Estimates available bandwidth by tracking per-packet send/receive
// timestamps.  A 1-second sliding window of completed timing pairs is
// maintained.  Bandwidth = total_bytes_acked / window_duration.
//
// A Kalman-filtered delay gradient detects congestion by measuring the
// trend in one-way delay over time.
///////////////////////////////////////////////////////////////////////////////

#include "bandwidth_estimator.h"
#include <cs/common.h>

#include <algorithm>
#include <numeric>

namespace cs::host {

BandwidthEstimator::BandwidthEstimator()
    : delay_filter_(1e-3, 0.1)
{}

// ---------------------------------------------------------------------------
// onPacketSent -- record that we sent a packet
// ---------------------------------------------------------------------------

void BandwidthEstimator::onPacketSent(uint16_t seq, size_t bytes, uint64_t send_time_us) {
    std::lock_guard<std::mutex> lock(mutex_);

    SentPacketInfo info;
    info.seq         = seq;
    info.bytes       = bytes;
    info.send_time_us = send_time_us;

    pending_[seq] = info;

    // Prune stale entries (packets we never got ACKs for, > 5 seconds old).
    auto now = cs::getTimestampUs();
    for (auto it = pending_.begin(); it != pending_.end(); ) {
        if (now - it->second.send_time_us > 5'000'000) {
            it = pending_.erase(it);
        } else {
            ++it;
        }
    }
}

// ---------------------------------------------------------------------------
// onAckReceived -- match with a sent packet and update estimates
// ---------------------------------------------------------------------------

void BandwidthEstimator::onAckReceived(uint16_t seq, uint64_t recv_time_us) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = pending_.find(seq);
    if (it == pending_.end()) {
        // Already expired or duplicate ACK.
        return;
    }

    const SentPacketInfo& sent = it->second;

    // Compute RTT.
    uint64_t rtt_us = recv_time_us - sent.send_time_us;
    latest_rtt_us_ = rtt_us;

    // Estimate one-way delay as RTT/2 (rough approximation without clock sync).
    int64_t owd_us = static_cast<int64_t>(rtt_us / 2);

    // Compute delay gradient: change in OWD over time.
    if (last_owd_time_us_ > 0) {
        int64_t delta_owd_us  = owd_us - last_owd_us_;
        uint64_t delta_time_us = recv_time_us - last_owd_time_us_;
        if (delta_time_us > 0) {
            // Gradient in ms per second.
            double gradient = (static_cast<double>(delta_owd_us) / 1000.0) /
                              (static_cast<double>(delta_time_us) / 1'000'000.0);
            delay_filter_.update(gradient);
        }
    }
    last_owd_us_      = owd_us;
    last_owd_time_us_ = recv_time_us;

    // Add to the timing window.
    TimingPair pair;
    pair.send_time_us = sent.send_time_us;
    pair.recv_time_us = recv_time_us;
    pair.bytes        = sent.bytes;
    window_.push_back(pair);

    // Remove from pending.
    pending_.erase(it);

    // Trim the window to the last WINDOW_DURATION_US.
    uint64_t cutoff = recv_time_us > WINDOW_DURATION_US
                        ? recv_time_us - WINDOW_DURATION_US
                        : 0;
    while (!window_.empty() && window_.front().recv_time_us < cutoff) {
        window_.pop_front();
    }

    // Update bandwidth estimate.
    if (window_.size() >= 2) {
        uint64_t time_span = window_.back().recv_time_us - window_.front().recv_time_us;
        if (time_span > 0) {
            size_t total_bytes = 0;
            for (const auto& p : window_) {
                total_bytes += p.bytes;
            }
            // bytes/us -> kbps: (bytes * 8 * 1e6) / (time_span * 1000)
            double bw = (static_cast<double>(total_bytes) * 8.0 * 1'000'000.0) /
                        (static_cast<double>(time_span) * 1000.0);
            estimated_bw_kbps_ = static_cast<uint32_t>(bw);
        }
    }
}

// ---------------------------------------------------------------------------
// getEstimatedBandwidthKbps
// ---------------------------------------------------------------------------

uint32_t BandwidthEstimator::getEstimatedBandwidthKbps() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return estimated_bw_kbps_;
}

// ---------------------------------------------------------------------------
// getDelayGradient -- smoothed delay gradient in ms/s
// ---------------------------------------------------------------------------

double BandwidthEstimator::getDelayGradient() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return delay_filter_.getEstimate();
}

} // namespace cs::host
