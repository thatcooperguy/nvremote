///////////////////////////////////////////////////////////////////////////////
// qos_controller.h -- Adaptive bitrate / QoS controller (GCC-inspired)
//
// Implements a state machine that adjusts encoder bitrate, FPS, and FEC
// redundancy based on feedback from the client (packet loss, RTT, jitter).
//
// Algorithm (inspired by Google Congestion Control):
//   - Kalman-filtered one-way delay gradient detects congestion.
//   - AIMD: Additive Increase (+5%), Multiplicative Decrease (x0.85).
//   - Loss thresholds:  >5% -> DECREASE,  >10% -> force IDR.
//   - FPS reduction (60->30) only as last resort when bitrate is at floor.
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

#include <cstdint>
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
// QosStats -- current QoS statistics snapshot
// ---------------------------------------------------------------------------
struct QosStats {
    uint32_t  bitrate_kbps       = 0;
    uint32_t  fps                = 0;
    float     loss_rate          = 0.0f;   // 0.0 to 1.0
    uint32_t  rtt_us             = 0;
    uint32_t  jitter_us          = 0;
    QosState  state              = QosState::HOLD;
    float     fec_ratio          = 0.0f;
    uint32_t  estimated_bw_kbps  = 0;
    double    delay_gradient     = 0.0;
};

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

private:
    void enterIncrease();
    void enterHold();
    void enterDecrease();
    void adjustFec(float loss_rate);

    IEncoder*           encoder_     = nullptr;
    UdpTransport*       transport_   = nullptr;
    FecEncoder*         fec_         = nullptr;

    BandwidthEstimator  bw_estimator_;
    KalmanFilter        delay_filter_;

    QosState            state_       = QosState::HOLD;
    EncoderConfig       config_;

    // Current working values.
    uint32_t            current_bitrate_kbps_ = 20000;
    uint32_t            current_fps_          = 60;

    // AIMD parameters.
    static constexpr float INCREASE_FACTOR  = 1.05f;  // +5% per feedback cycle
    static constexpr float DECREASE_FACTOR  = 0.85f;  // x0.85 on congestion
    static constexpr float LOSS_THRESH_LOW  = 0.02f;  // 2% loss: enter HOLD
    static constexpr float LOSS_THRESH_HIGH = 0.05f;  // 5% loss: enter DECREASE
    static constexpr float LOSS_THRESH_IDR  = 0.10f;  // 10% loss: force IDR

    // Delay gradient thresholds (ms/s).
    static constexpr double GRADIENT_OVERUSE  = 5.0;   // Positive trend = congestion
    static constexpr double GRADIENT_UNDERUSE = -1.0;  // Negative trend = available bandwidth

    // Feedback tracking.
    uint32_t            feedback_count_ = 0;
    float               smoothed_loss_  = 0.0f;
    uint32_t            smoothed_rtt_   = 0;
    uint32_t            smoothed_jitter_ = 0;
};

} // namespace cs::host
