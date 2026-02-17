///////////////////////////////////////////////////////////////////////////////
// qos_controller.cpp -- Adaptive QoS controller implementation
//
// Processes client feedback and adjusts encoder bitrate, FPS, resolution,
// and FEC redundancy to maximize streaming quality while avoiding congestion.
//
// The controller integrates:
//   - AIMD bitrate control (additive increase, multiplicative decrease)
//   - Profile-aware resolution/FPS ladder walking
//   - Decode bottleneck detection (client-side)
//   - VPN-aware tolerance adjustments
//   - Kalman-filtered delay gradient for congestion detection
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
    current_width_        = config.width;
    current_height_       = config.height;
}

// ---------------------------------------------------------------------------
// applyPreset -- apply a streaming profile preset
// ---------------------------------------------------------------------------

void QosController::applyPreset(const cs::QosPreset& preset) {
    preset_     = preset;
    has_preset_ = true;

    // Apply the preset's target values
    current_bitrate_kbps_ = preset.target_bitrate_kbps;
    current_fps_          = preset.target_fps;
    current_width_        = preset.target_resolution.width;
    current_height_       = preset.target_resolution.height;
    resolution_step_      = 0;  // Start at top of ladder
    fps_step_             = 0;

    // Update encoder config limits from preset
    config_.bitrate_kbps     = preset.target_bitrate_kbps;
    config_.max_bitrate_kbps = preset.max_bitrate_kbps;
    config_.min_bitrate_kbps = preset.min_bitrate_kbps;
    config_.fps              = preset.target_fps;

    // Apply VPN adjustments if in VPN mode
    if (vpn_mode_) {
        current_bitrate_kbps_ = static_cast<uint32_t>(
            current_bitrate_kbps_ * VPN_BITRATE_MULTIPLIER);
    }

    CS_LOG(INFO, "QoS: preset applied: %s (target: %ux%u @ %ufps, %ukbps)",
           cs::gamingModeToString(preset.mode).c_str(),
           current_width_, current_height_, current_fps_, current_bitrate_kbps_);
}

// ---------------------------------------------------------------------------
// setVpnMode -- enable/disable VPN-aware adjustments
// ---------------------------------------------------------------------------

void QosController::setVpnMode(bool enabled) {
    vpn_mode_ = enabled;
    if (enabled) {
        // Reduce initial bitrate for VPN overhead
        current_bitrate_kbps_ = static_cast<uint32_t>(
            current_bitrate_kbps_ * VPN_BITRATE_MULTIPLIER);
        CS_LOG(INFO, "QoS: VPN mode enabled — reduced bitrate to %u kbps", current_bitrate_kbps_);
    }
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

    // EMA of RTT, jitter, and decode time.
    if (feedback.rtt_us > 0) {
        smoothed_rtt_ = static_cast<uint32_t>(0.3 * feedback.rtt_us + 0.7 * smoothed_rtt_);
    }
    smoothed_jitter_ = static_cast<uint32_t>(0.3 * feedback.jitter_us + 0.7 * smoothed_jitter_);
    if (feedback.decode_time_us > 0) {
        smoothed_decode_ = static_cast<uint32_t>(0.3 * feedback.decode_time_us + 0.7 * smoothed_decode_);
    }

    // Apply VPN jitter tolerance
    double effective_overuse_thresh = vpn_mode_
        ? GRADIENT_OVERUSE * VPN_JITTER_MULTIPLIER
        : GRADIENT_OVERUSE;

    // --- Feed the delay gradient filter ------------------------------------
    double gradient = bw_estimator_.getDelayGradient();
    double filtered_gradient = delay_filter_.update(gradient);

    // --- Decode bottleneck detection ---------------------------------------
    // If client decode time exceeds threshold, reduce resolution (not bitrate)
    // because the client's decoder is the bottleneck, not the network.
    bool decode_bottleneck = smoothed_decode_ > DECODE_BOTTLENECK_US;

    if (decode_bottleneck && has_preset_ &&
        (feedback_count_ - last_resolution_change_tick_) > RESOLUTION_CHANGE_COOLDOWN) {
        CS_LOG(WARN, "QoS: decode bottleneck detected (decode=%uus) — reducing resolution",
               smoothed_decode_);
        tryReduceResolution();
    }

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
            CS_LOG(INFO, "QoS: entering DECREASE — loss=%.1f%%", smoothed_loss_ * 100.0f);
        }
        enterDecrease();

        // If loss is extremely high, force an IDR so the client can resync.
        if (smoothed_loss_ >= LOSS_THRESH_IDR && encoder_) {
            CS_LOG(WARN, "QoS: loss=%.1f%% — forcing IDR frame", smoothed_loss_ * 100.0f);
            encoder_->forceIdr();
        }

    } else if (filtered_gradient > effective_overuse_thresh) {
        // Delay is increasing -- network is congested.
        if (state_ != QosState::DECREASE) {
            CS_LOG(INFO, "QoS: entering DECREASE — gradient=%.2f ms/s", filtered_gradient);
        }
        enterDecrease();

    } else if (smoothed_loss_ <= LOSS_THRESH_LOW && filtered_gradient < GRADIENT_UNDERUSE) {
        // Network is underutilized and loss is very low.
        if (state_ != QosState::INCREASE) {
            CS_LOG(INFO, "QoS: entering INCREASE — loss=%.1f%%, gradient=%.2f",
                   smoothed_loss_ * 100.0f, filtered_gradient);
        }
        enterIncrease();

    } else {
        // Everything is stable.
        if (state_ != QosState::HOLD) {
            CS_LOG(INFO, "QoS: entering HOLD — loss=%.1f%%, gradient=%.2f",
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
        newCfg.width        = current_width_;
        newCfg.height       = current_height_;
        encoder_->reconfigure(newCfg);
    }

    CS_LOG(TRACE, "QoS: state=%s bitrate=%u kbps fps=%u res=%ux%u loss=%.2f%% "
                  "rtt=%u us gradient=%.2f decode=%uus",
           qosStateName(state_), current_bitrate_kbps_, current_fps_,
           current_width_, current_height_,
           smoothed_loss_ * 100.0f, smoothed_rtt_, filtered_gradient,
           smoothed_decode_);
}

// ---------------------------------------------------------------------------
// enterIncrease -- additive increase: +5% bitrate, then recover FPS/res
// ---------------------------------------------------------------------------

void QosController::enterIncrease() {
    state_ = QosState::INCREASE;

    // Additive increase of bitrate.
    uint32_t max_bw = has_preset_ ? preset_.max_bitrate_kbps : config_.max_bitrate_kbps;
    uint32_t new_bitrate = static_cast<uint32_t>(current_bitrate_kbps_ * INCREASE_FACTOR);
    new_bitrate = std::min(new_bitrate, max_bw);
    current_bitrate_kbps_ = new_bitrate;

    // If bitrate has recovered past 60% of target, try recovering FPS
    uint32_t target_bw = has_preset_ ? preset_.target_bitrate_kbps : config_.bitrate_kbps;
    if (current_bitrate_kbps_ > static_cast<uint32_t>(target_bw * 0.6f)) {
        tryRecoverFps();
    }

    // If bitrate has recovered past 80% of target, try recovering resolution
    if (current_bitrate_kbps_ > static_cast<uint32_t>(target_bw * 0.8f)) {
        tryRecoverResolution();
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
// enterDecrease -- multiplicative decrease: x0.85 bitrate, then degrade
// ---------------------------------------------------------------------------

void QosController::enterDecrease() {
    state_ = QosState::DECREASE;

    uint32_t min_bw = has_preset_ ? preset_.min_bitrate_kbps : config_.min_bitrate_kbps;

    // Multiplicative decrease.
    uint32_t new_bitrate = static_cast<uint32_t>(current_bitrate_kbps_ * DECREASE_FACTOR);
    new_bitrate = std::max(new_bitrate, min_bw);
    current_bitrate_kbps_ = new_bitrate;

    // If bitrate is at the floor, use profile-aware degradation
    if (current_bitrate_kbps_ <= min_bw && has_preset_) {
        // Use the profile's priority weights to decide what to sacrifice
        if (preset_.fps_weight > preset_.quality_weight) {
            // Profile prioritizes FPS → sacrifice resolution first
            tryReduceResolution();
            if (current_bitrate_kbps_ <= min_bw) {
                tryReduceFps();
            }
        } else {
            // Profile prioritizes quality → sacrifice FPS first
            tryReduceFps();
            if (current_bitrate_kbps_ <= min_bw) {
                tryReduceResolution();
            }
        }
    } else if (current_bitrate_kbps_ <= min_bw) {
        // No preset — legacy behavior: drop FPS as last resort
        uint32_t min_fps = has_preset_ ? preset_.min_fps : 30u;
        if (current_fps_ > min_fps) {
            current_fps_ = min_fps;
            CS_LOG(WARN, "QoS: bitrate at floor (%u kbps) — reducing FPS to %u",
                   current_bitrate_kbps_, current_fps_);
        }
    }
}

// ---------------------------------------------------------------------------
// Profile-aware resolution stepping
// ---------------------------------------------------------------------------

void QosController::tryReduceResolution() {
    if (!has_preset_ || preset_.resolution_ladder.empty()) return;
    if ((feedback_count_ - last_resolution_change_tick_) < RESOLUTION_CHANGE_COOLDOWN) return;

    uint32_t next_step = resolution_step_ + 1;
    if (next_step < static_cast<uint32_t>(preset_.resolution_ladder.size())) {
        const auto& new_res = preset_.resolution_ladder[next_step];
        CS_LOG(INFO, "QoS: reducing resolution %ux%u → %ux%u (step %u→%u)",
               current_width_, current_height_,
               new_res.width, new_res.height,
               resolution_step_, next_step);

        resolution_step_ = next_step;
        current_width_   = new_res.width;
        current_height_  = new_res.height;
        last_resolution_change_tick_ = feedback_count_;

        // Notify the session manager so it can reinitialize capture
        if (resolution_change_cb_) {
            resolution_change_cb_(current_width_, current_height_);
        }
    }
}

void QosController::tryReduceFps() {
    if (!has_preset_ || preset_.fps_ladder.empty()) return;

    uint32_t next_step = fps_step_ + 1;
    if (next_step < static_cast<uint32_t>(preset_.fps_ladder.size())) {
        uint32_t new_fps = preset_.fps_ladder[next_step];
        CS_LOG(INFO, "QoS: reducing FPS %u → %u (step %u→%u)",
               current_fps_, new_fps, fps_step_, next_step);
        fps_step_    = next_step;
        current_fps_ = new_fps;
    }
}

void QosController::tryRecoverResolution() {
    if (!has_preset_ || resolution_step_ == 0) return;
    if ((feedback_count_ - last_resolution_change_tick_) < RESOLUTION_CHANGE_COOLDOWN) return;

    // Only recover if the profile allows aggressive recovery
    float recovery = preset_.recovery_speed;
    if (recovery < 0.3f) return;  // Too conservative for resolution recovery

    uint32_t prev_step = resolution_step_ - 1;
    const auto& new_res = preset_.resolution_ladder[prev_step];

    CS_LOG(INFO, "QoS: recovering resolution %ux%u → %ux%u (step %u→%u)",
           current_width_, current_height_,
           new_res.width, new_res.height,
           resolution_step_, prev_step);

    resolution_step_ = prev_step;
    current_width_   = new_res.width;
    current_height_  = new_res.height;
    last_resolution_change_tick_ = feedback_count_;

    if (resolution_change_cb_) {
        resolution_change_cb_(current_width_, current_height_);
    }
}

void QosController::tryRecoverFps() {
    if (!has_preset_ || fps_step_ == 0) return;

    uint32_t prev_step = fps_step_ - 1;
    uint32_t new_fps = preset_.fps_ladder[prev_step];

    CS_LOG(INFO, "QoS: recovering FPS %u → %u (step %u→%u)",
           current_fps_, new_fps, fps_step_, prev_step);

    fps_step_    = prev_step;
    current_fps_ = new_fps;
}

// ---------------------------------------------------------------------------
// adjustFec -- scale FEC redundancy based on loss rate
// ---------------------------------------------------------------------------

void QosController::adjustFec(float loss_rate) {
    if (!fec_) return;

    float max_fec = has_preset_ ? preset_.max_fec_ratio : 0.5f;
    float min_fec = has_preset_ ? preset_.min_fec_ratio : 0.02f;

    // Scale FEC: minimal at low loss, aggressive at high loss.
    // loss <  2%  -> min_fec
    // loss  2-5%  -> 2x min_fec
    // loss  5-10% -> 0.6x max_fec
    // loss > 10%  -> max_fec
    float ratio;
    if (loss_rate < 0.02f) {
        ratio = min_fec;
    } else if (loss_rate < 0.05f) {
        ratio = std::min(min_fec * 2.0f, max_fec);
    } else if (loss_rate < 0.10f) {
        ratio = max_fec * 0.6f;
    } else {
        ratio = max_fec;
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
    stats.width             = current_width_;
    stats.height            = current_height_;
    stats.loss_rate         = smoothed_loss_;
    stats.rtt_us            = smoothed_rtt_;
    stats.jitter_us         = smoothed_jitter_;
    stats.state             = state_;
    stats.fec_ratio         = fec_ ? fec_->getRedundancyRatio() : 0.0f;
    stats.estimated_bw_kbps = bw_estimator_.getEstimatedBandwidthKbps();
    stats.delay_gradient    = delay_filter_.getEstimate();
    stats.decode_time_us    = smoothed_decode_;
    stats.resolution_step   = resolution_step_;
    stats.fps_step          = fps_step_;

    if (has_preset_) {
        stats.profile_name = cs::gamingModeToString(preset_.mode);
    }

    if (encoder_) {
        stats.codec_name = encoder_->getCodecName();
    }

    return stats;
}

} // namespace cs::host
