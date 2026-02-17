///////////////////////////////////////////////////////////////////////////////
// qos_controller.h -- Adaptive bitrate / QoS controller (GCC-inspired)
//
// Implements a state machine that adjusts encoder bitrate, FPS, resolution,
// and FEC redundancy based on feedback from the client (packet loss, RTT,
// jitter) and the active streaming profile.
//
// Algorithm (inspired by Google Congestion Control):
//   - Kalman-filtered one-way delay gradient detects congestion.
//   - AIMD: Additive Increase (+5%), Multiplicative Decrease (x0.85).
//   - Loss thresholds:  >5% -> DECREASE,  >10% -> force IDR.
//   - Resolution/FPS ladder walking based on profile priority weights.
//   - FEC ratio scales with loss rate.
//
// The controller is driven by QoS feedback packets sent by the client
// approximately 5 times per second.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "bandwidth_estimator.h"
#include "encode/encoder_interface.h"
#include "transport/udp_transport.h"
#include "transport/fec.h"
#include "cs/qos/gaming_modes.h"

#include <cstdint>
#include <functional>
#include <string>

namespace cs::host {

// ---------------------------------------------------------------------------
// QosFeedbackPacket -- sent by the client in QoS feedback messages
// ---------------------------------------------------------------------------
struct QosFeedbackPacket {
    uint32_t received_packets    = 0;  // Packets received since last report
    uint32_t lost_packets        = 0;  // Packets lost since last report
    uint32_t jitter_us           = 0;  // Inter-arrival jitter (microseconds)
    uint64_t last_recv_time_us   = 0;  // Client's receive timestamp of last packet
    uint16_t last_seq            = 0;  // Highest sequence number received
    uint32_t rtt_us              = 0;  // Round-trip time measured by client (if available)
    uint32_t decode_time_us      = 0;  // Client-side decode time per frame
    uint32_t frames_dropped      = 0;  // Frames dropped on client since last report
};

// ---------------------------------------------------------------------------
// QoS state machine states
// ---------------------------------------------------------------------------
enum class QosState {
    INCREASE,   // Network is underutilized, ramp up bitrate
    HOLD,       // Network is stable, maintain current settings
    DECREASE,   // Network is congested, reduce bitrate
};

inline const char* qosStateName(QosState s) {
    switch (s) {
        case QosState::INCREASE: return "INCREASE";
        case QosState::HOLD:     return "HOLD";
        case QosState::DECREASE: return "DECREASE";
    }
    return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// QosStats -- current QoS statistics snapshot (reported to admin dashboard)
// ---------------------------------------------------------------------------
struct QosStats {
    uint32_t  bitrate_kbps       = 0;
    uint32_t  fps                = 0;
    uint32_t  width              = 0;
    uint32_t  height             = 0;
    float     loss_rate          = 0.0f;   // 0.0 to 1.0
    uint32_t  rtt_us             = 0;
    uint32_t  jitter_us          = 0;
    QosState  state              = QosState::HOLD;
    float     fec_ratio          = 0.0f;
    uint32_t  estimated_bw_kbps  = 0;
    double    delay_gradient     = 0.0;
    uint32_t  decode_time_us     = 0;
    uint32_t  resolution_step    = 0;      // Index into resolution ladder
    uint32_t  fps_step           = 0;      // Index into FPS ladder
    std::string codec_name;
    std::string profile_name;
};

// ---------------------------------------------------------------------------
// Resolution change callback
// ---------------------------------------------------------------------------
using ResolutionChangeCallback = std::function<void(uint32_t width, uint32_t height)>;

// ---------------------------------------------------------------------------
// QosController
// ---------------------------------------------------------------------------
class QosController {
public:
    QosController(IEncoder* encoder, UdpTransport* transport, FecEncoder* fec);
    ~QosController() = default;

    /// Process a QoS feedback packet from the client.
    /// This is the main entry point, called ~5 times per second.
    void onFeedbackReceived(const QosFeedbackPacket& feedback);

    /// Get the current QoS statistics.
    QosStats getStats() const;

    /// Get the bandwidth estimator (for transport-level packet tracking).
    BandwidthEstimator& getBandwidthEstimator() { return bw_estimator_; }

    /// Set the initial / baseline encoder config.
    void setBaseConfig(const EncoderConfig& config);

    /// Apply a streaming profile preset (gaming mode).
    void applyPreset(const cs::QosPreset& preset);

    /// Set callback for resolution changes (so SessionManager can
    /// reinitialize the capture device at the new resolution).
    void setResolutionChangeCallback(ResolutionChangeCallback cb) {
        resolution_change_cb_ = std::move(cb);
    }

    /// Enable VPN-aware QoS adjustments.
    void setVpnMode(bool enabled);

private:
    void enterIncrease();
    void enterHold();
    void enterDecrease();
    void adjustFec(float loss_rate);
    void tryReduceResolution();
    void tryReduceFps();
    void tryRecoverResolution();
    void tryRecoverFps();

    IEncoder*           encoder_     = nullptr;
    UdpTransport*       transport_   = nullptr;
    FecEncoder*         fec_         = nullptr;

    BandwidthEstimator  bw_estimator_;
    KalmanFilter        delay_filter_;

    QosState            state_       = QosState::HOLD;
    EncoderConfig       config_;

    // Active streaming profile
    cs::QosPreset       preset_;
    bool                has_preset_  = false;

    // Current working values.
    uint32_t            current_bitrate_kbps_ = 20000;
    uint32_t            current_fps_          = 60;
    uint32_t            current_width_        = 1920;
    uint32_t            current_height_       = 1080;
    uint32_t            resolution_step_      = 0;  // Index into preset resolution ladder
    uint32_t            fps_step_             = 0;  // Index into preset FPS ladder

    // VPN-aware adjustments
    bool                vpn_mode_             = false;
    static constexpr float VPN_JITTER_MULTIPLIER = 1.5f;
    static constexpr float VPN_BITRATE_MULTIPLIER = 0.85f;

    // AIMD parameters.
    static constexpr float INCREASE_FACTOR  = 1.05f;  // +5% per feedback cycle
    static constexpr float DECREASE_FACTOR  = 0.85f;  // x0.85 on congestion
    static constexpr float LOSS_THRESH_LOW  = 0.02f;  // 2% loss: enter HOLD
    static constexpr float LOSS_THRESH_HIGH = 0.05f;  // 5% loss: enter DECREASE
    static constexpr float LOSS_THRESH_IDR  = 0.10f;  // 10% loss: force IDR

    // Delay gradient thresholds (ms/s).
    static constexpr double GRADIENT_OVERUSE  = 5.0;   // Positive trend = congestion
    static constexpr double GRADIENT_UNDERUSE = -1.0;  // Negative trend = available bandwidth

    // Decode bottleneck threshold (microseconds).
    static constexpr uint32_t DECODE_BOTTLENECK_US = 20000;  // 20ms = decode is struggling

    // Feedback tracking.
    uint32_t            feedback_count_  = 0;
    float               smoothed_loss_   = 0.0f;
    uint32_t            smoothed_rtt_    = 0;
    uint32_t            smoothed_jitter_ = 0;
    uint32_t            smoothed_decode_ = 0;

    // Resolution change callback
    ResolutionChangeCallback resolution_change_cb_;

    // Cooldown: prevent rapid resolution changes (min 2 seconds between changes)
    uint32_t            last_resolution_change_tick_ = 0;
    static constexpr uint32_t RESOLUTION_CHANGE_COOLDOWN = 10;  // ~2 seconds at 5 feedback/sec
};

} // namespace cs::host
