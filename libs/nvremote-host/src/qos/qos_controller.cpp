///////////////////////////////////////////////////////////////////////////////
// qos_controller.cpp -- Adaptive QoS controller implementation
//
// Processes client feedback and adjusts encoder bitrate, FPS, and FEC
// redundancy to maximize streaming quality while avoiding congestion.
///////////////////////////////////////////////////////////////////////////////

#include "qos_controller.h"
#include <cs/common.h>

#include <algorithm>
#include <cmath>

namespace cs::host {

QosController::QosController(IEncoder* encoder, UdpTransport* transport, FecEncoder* fec)
    : encoder_(encoder)
    , transport_(transport)
    , fec_(fec)
    , delay_filter_(1e-3, 0.1)
{
}

// ---------------------------------------------------------------------------
// setBaseConfig -- establish the initial encoder configuration
// ---------------------------------------------------------------------------

void QosController::setBaseConfig(const EncoderConfig& config) {
    config_ = config;
    current_bitrate_kbps_ = config.bitrate_kbps;
    current_fps_          = config.fps;
}

// ---------------------------------------------------------------------------
// onFeedbackReceived -- main QoS decision point
// ---------------------------------------------------------------------------

void QosController::onFeedbackReceived(const QosFeedbackPacket& feedback) {
    feedback_count_++;

    // --- Compute loss rate --------------------------------------------------
    uint32_t total = feedback.received_packets + feedback.lost_packets;
    float loss_rate = (total > 0) ? static_cast<float>(feedback.lost_packets) / total : 0.0f;

    // Exponential moving average of loss rate (alpha = 0.3).
    smoothed_loss_ = 0.3f * loss_rate + 0.7f * smoothed_loss_;

    // EMA of RTT and jitter.
    if (feedback.rtt_us > 0) {
        smoothed_rtt_ = static_cast<uint32_t>(0.3 * feedback.rtt_us + 0.7 * smoothed_rtt_);
    }
    smoothed_jitter_ = static_cast<uint32_t>(0.3 * feedback.jitter_us + 0.7 * smoothed_jitter_);

    // --- Feed the delay gradient filter ------------------------------------
    double gradient = bw_estimator_.getDelayGradient();
    double filtered_gradient = delay_filter_.update(gradient);

    // --- State machine decisions -------------------------------------------
    //
    // Priority of signals:
    //   1. High loss -> DECREASE (regardless of gradient)
    //   2. Positive delay gradient (overuse) -> DECREASE
    //   3. Low loss + negative gradient (underuse) -> INCREASE
    //   4. Otherwise -> HOLD

    if (smoothed_loss_ >= LOSS_THRESH_HIGH) {
        // Significant loss -- back off aggressively.
        if (state_ != QosState::DECREASE) {
            CS_LOG(INFO, "QoS: entering DECREASE -- loss=%.1f%%", smoothed_loss_ * 100.0f);
        }
        enterDecrease();

        // If loss is extremely high, force an IDR so the client can resync.
        if (smoothed_loss_ >= LOSS_THRESH_IDR && encoder_) {
            CS_LOG(WARN, "QoS: loss=%.1f%% -- forcing IDR frame", smoothed_loss_ * 100.0f);
            encoder_->forceIdr();
        }

    } else if (filtered_gradient > GRADIENT_OVERUSE) {
        // Delay is increasing -- network is congested.
        if (state_ != QosState::DECREASE) {
            CS_LOG(INFO, "QoS: entering DECREASE -- gradient=%.2f ms/s", filtered_gradient);
        }
        enterDecrease();

    } else if (smoothed_loss_ <= LOSS_THRESH_LOW && filtered_gradient < GRADIENT_UNDERUSE) {
        // Network is underutilized and loss is very low.
        if (state_ != QosState::INCREASE) {
            CS_LOG(INFO, "QoS: entering INCREASE -- loss=%.1f%%, gradient=%.2f",
                   smoothed_loss_ * 100.0f, filtered_gradient);
        }
        enterIncrease();

    } else {
        // Everything is stable.
        if (state_ != QosState::HOLD) {
            CS_LOG(INFO, "QoS: entering HOLD -- loss=%.1f%%, gradient=%.2f",
                   smoothed_loss_ * 100.0f, filtered_gradient);
        }
        enterHold();
    }

    // --- Adjust FEC based on loss rate -------------------------------------
    adjustFec(smoothed_loss_);

    // --- Apply bitrate/fps to encoder --------------------------------------
    if (encoder_) {
        EncoderConfig newCfg = config_;
        newCfg.bitrate_kbps = current_bitrate_kbps_;
        newCfg.fps          = current_fps_;
        encoder_->reconfigure(newCfg);
    }

    CS_LOG(TRACE, "QoS: state=%s bitrate=%u kbps fps=%u loss=%.2f%% rtt=%u us gradient=%.2f",
           qosStateName(state_), current_bitrate_kbps_, current_fps_,
           smoothed_loss_ * 100.0f, smoothed_rtt_, filtered_gradient);
}

// ---------------------------------------------------------------------------
// enterIncrease -- additive increase: +5% bitrate
// ---------------------------------------------------------------------------

void QosController::enterIncrease() {
    state_ = QosState::INCREASE;

    // Additive increase.
    uint32_t new_bitrate = static_cast<uint32_t>(current_bitrate_kbps_ * INCREASE_FACTOR);
    new_bitrate = std::min(new_bitrate, config_.max_bitrate_kbps);
    current_bitrate_kbps_ = new_bitrate;

    // If we reduced FPS earlier, try to recover it when bitrate headroom exists.
    if (current_fps_ < config_.fps && current_bitrate_kbps_ > config_.min_bitrate_kbps * 2) {
        current_fps_ = config_.fps;
        CS_LOG(INFO, "QoS: restoring FPS to %u", current_fps_);
    }
}

// ---------------------------------------------------------------------------
// enterHold -- no changes
// ---------------------------------------------------------------------------

void QosController::enterHold() {
    state_ = QosState::HOLD;
    // No adjustments.
}

// ---------------------------------------------------------------------------
// enterDecrease -- multiplicative decrease: x0.85 bitrate
// ---------------------------------------------------------------------------

void QosController::enterDecrease() {
    state_ = QosState::DECREASE;

    // Multiplicative decrease.
    uint32_t new_bitrate = static_cast<uint32_t>(current_bitrate_kbps_ * DECREASE_FACTOR);
    new_bitrate = std::max(new_bitrate, config_.min_bitrate_kbps);
    current_bitrate_kbps_ = new_bitrate;

    // Last resort: reduce FPS if bitrate is at the floor.
    if (current_bitrate_kbps_ <= config_.min_bitrate_kbps && current_fps_ > 30) {
        current_fps_ = 30;
        CS_LOG(WARN, "QoS: bitrate at floor (%u kbps) -- reducing FPS to %u",
               current_bitrate_kbps_, current_fps_);
    }
}

// ---------------------------------------------------------------------------
// adjustFec -- scale FEC redundancy based on loss rate
// ---------------------------------------------------------------------------

void QosController::adjustFec(float loss_rate) {
    if (!fec_) return;

    // Scale FEC: minimal at low loss, aggressive at high loss.
    // loss <  2%  -> FEC ratio 0.1 (10%)
    // loss  2-5%  -> FEC ratio 0.2 (20%)
    // loss  5-10% -> FEC ratio 0.3 (30%)
    // loss > 10%  -> FEC ratio 0.5 (50%)
    float ratio;
    if (loss_rate < 0.02f) {
        ratio = 0.1f;
    } else if (loss_rate < 0.05f) {
        ratio = 0.2f;
    } else if (loss_rate < 0.10f) {
        ratio = 0.3f;
    } else {
        ratio = 0.5f;
    }

    fec_->setRedundancyRatio(ratio);
}

// ---------------------------------------------------------------------------
// getStats -- snapshot of current QoS state
// ---------------------------------------------------------------------------

QosStats QosController::getStats() const {
    QosStats stats;
    stats.bitrate_kbps      = current_bitrate_kbps_;
    stats.fps               = current_fps_;
    stats.loss_rate         = smoothed_loss_;
    stats.rtt_us            = smoothed_rtt_;
    stats.jitter_us         = smoothed_jitter_;
    stats.state             = state_;
    stats.fec_ratio         = fec_ ? fec_->getRedundancyRatio() : 0.0f;
    stats.estimated_bw_kbps = bw_estimator_.getEstimatedBandwidthKbps();
    stats.delay_gradient    = delay_filter_.getEstimate();
    return stats;
}

} // namespace cs::host
