////////////////////////////////////////////////////////////////////////////////
// NVRemote — Gaming Mode Presets
//
// Defines the quality/performance trade-off presets users can select:
//   - Competitive: Maximum FPS, lowest latency, sacrifice resolution/quality
//   - Cinematic:   Maximum resolution + quality, allow higher latency
//   - Balanced:    Middle ground, adapts both FPS and quality
//
// The QoS controller uses these presets to guide its adaptive algorithm.
////////////////////////////////////////////////////////////////////////////////

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace cs {

// ---------------------------------------------------------------------------
// Supported resolutions (ordered by pixel count descending)
// ---------------------------------------------------------------------------
struct Resolution {
    uint32_t width;
    uint32_t height;

    uint64_t pixelCount() const { return static_cast<uint64_t>(width) * height; }
    std::string toString() const {
        return std::to_string(width) + "x" + std::to_string(height);
    }

    bool operator==(const Resolution& o) const { return width == o.width && height == o.height; }
    bool operator!=(const Resolution& o) const { return !(*this == o); }
};

// Standard gaming resolutions
namespace Resolutions {
    static constexpr Resolution RES_4K       = { 3840, 2160 };  // 4K UHD
    static constexpr Resolution RES_1440P_UW = { 3440, 1440 };  // Ultrawide 1440p
    static constexpr Resolution RES_1440P    = { 2560, 1440 };  // QHD
    static constexpr Resolution RES_1080P    = { 1920, 1080 };  // Full HD
    static constexpr Resolution RES_900P     = { 1600,  900 };  // HD+
    static constexpr Resolution RES_720P     = { 1280,  720 };  // HD
}

// Standard gaming frame rates
namespace FrameRates {
    static constexpr uint32_t FPS_240 = 240;
    static constexpr uint32_t FPS_165 = 165;
    static constexpr uint32_t FPS_144 = 144;
    static constexpr uint32_t FPS_120 = 120;
    static constexpr uint32_t FPS_60  = 60;
    static constexpr uint32_t FPS_30  = 30;
}

// ---------------------------------------------------------------------------
// Gaming mode enum
// ---------------------------------------------------------------------------
enum class GamingMode : uint8_t {
    Competitive = 0,   // Max FPS, lowest latency
    Balanced    = 1,   // Adapts both FPS and quality
    Cinematic   = 2,   // Max quality, allows higher latency
};

inline std::string gamingModeToString(GamingMode mode) {
    switch (mode) {
        case GamingMode::Competitive: return "Competitive";
        case GamingMode::Balanced:    return "Balanced";
        case GamingMode::Cinematic:   return "Cinematic";
        default:                      return "Unknown";
    }
}

// ---------------------------------------------------------------------------
// QoS Preset Configuration
//
// Each gaming mode defines:
//   - Target and minimum FPS
//   - Target and minimum resolution
//   - Bitrate range
//   - Jitter buffer depth
//   - FEC overhead budget
//   - Priority weights for the adaptive algorithm
// ---------------------------------------------------------------------------
struct QosPreset {
    GamingMode mode;

    // Frame rate bounds
    uint32_t target_fps;       // Ideal frame rate
    uint32_t min_fps;          // Floor — QoS will not drop below this
    uint32_t max_fps;          // Ceiling

    // Resolution bounds
    Resolution target_resolution;
    Resolution min_resolution; // Floor — QoS will not drop below this

    // Resolution step-down ladder (ordered from highest to lowest)
    // QoS walks down this list when bandwidth is constrained
    std::vector<Resolution> resolution_ladder;

    // Frame rate step-down ladder (ordered from highest to lowest)
    std::vector<uint32_t> fps_ladder;

    // Bitrate bounds (kbps)
    uint32_t target_bitrate_kbps;
    uint32_t min_bitrate_kbps;
    uint32_t max_bitrate_kbps;

    // Jitter buffer
    uint32_t jitter_buffer_ms;   // Target jitter buffer depth

    // FEC overhead
    float max_fec_ratio;         // Maximum FEC redundancy (e.g. 0.3 = 30%)
    float min_fec_ratio;         // Minimum FEC redundancy

    // Adaptive algorithm weights (0.0 - 1.0)
    // These guide QoS decisions when degradation is needed:
    //   Higher fps_weight    → prefer dropping quality/resolution first
    //   Higher quality_weight → prefer dropping FPS first
    float fps_weight;
    float quality_weight;
    float latency_weight;

    // How aggressively to recover when conditions improve
    float recovery_speed;        // 0.0 = slow (conservative), 1.0 = fast (aggressive)
};

// ---------------------------------------------------------------------------
// Preset factory
// ---------------------------------------------------------------------------
inline QosPreset getPreset(GamingMode mode, Resolution native_res = Resolutions::RES_1080P) {
    QosPreset p{};
    p.mode = mode;

    switch (mode) {
    // -----------------------------------------------------------------
    // COMPETITIVE: FPS is king. Drop resolution aggressively to maintain
    // frame rate and minimize input latency.
    //
    // Target: 240fps @ native (or 1080p)
    // Will drop to: 720p@240 before 1080p@144
    // Jitter buffer: 1ms (essentially zero — accept visual glitches)
    // -----------------------------------------------------------------
    case GamingMode::Competitive:
        p.target_fps     = FrameRates::FPS_240;
        p.min_fps        = FrameRates::FPS_120;
        p.max_fps        = FrameRates::FPS_240;

        p.target_resolution = (native_res.pixelCount() <= Resolutions::RES_1080P.pixelCount())
                              ? native_res : Resolutions::RES_1080P;
        p.min_resolution = Resolutions::RES_720P;

        p.resolution_ladder = {
            Resolutions::RES_1080P,
            Resolutions::RES_900P,
            Resolutions::RES_720P,
        };
        p.fps_ladder = {
            FrameRates::FPS_240,
            FrameRates::FPS_165,
            FrameRates::FPS_144,
            FrameRates::FPS_120,
        };

        p.target_bitrate_kbps = 50000;  // 50 Mbps
        p.min_bitrate_kbps    = 5000;   // 5 Mbps
        p.max_bitrate_kbps    = 100000; // 100 Mbps

        p.jitter_buffer_ms = 1;         // Near-zero buffer
        p.max_fec_ratio    = 0.15f;     // Low FEC — save bandwidth for frames
        p.min_fec_ratio    = 0.02f;

        // Prioritize FPS and latency over visual quality
        p.fps_weight     = 0.9f;
        p.quality_weight = 0.1f;
        p.latency_weight = 1.0f;

        p.recovery_speed = 0.8f;        // Recover aggressively
        break;

    // -----------------------------------------------------------------
    // CINEMATIC: Visual quality is king. Maintain resolution and bitrate,
    // drop frame rate before resolution.
    //
    // Target: 4K@60fps (or native@60)
    // Will drop to: 4K@30 before 1440p@60
    // Jitter buffer: 8ms (smooth playback, slight input lag acceptable)
    // -----------------------------------------------------------------
    case GamingMode::Cinematic:
        p.target_fps     = FrameRates::FPS_60;
        p.min_fps        = FrameRates::FPS_30;
        p.max_fps        = FrameRates::FPS_60;

        p.target_resolution = (native_res.pixelCount() >= Resolutions::RES_4K.pixelCount())
                              ? Resolutions::RES_4K : native_res;
        p.min_resolution = Resolutions::RES_1080P;

        p.resolution_ladder = {
            Resolutions::RES_4K,
            Resolutions::RES_1440P,
            Resolutions::RES_1080P,
        };
        p.fps_ladder = {
            FrameRates::FPS_60,
            FrameRates::FPS_30,
        };

        p.target_bitrate_kbps = 80000;  // 80 Mbps (high for 4K)
        p.min_bitrate_kbps    = 10000;  // 10 Mbps
        p.max_bitrate_kbps    = 150000; // 150 Mbps

        p.jitter_buffer_ms = 8;         // Smooth playback
        p.max_fec_ratio    = 0.25f;     // Higher FEC — protect quality
        p.min_fec_ratio    = 0.05f;

        // Prioritize quality over FPS
        p.fps_weight     = 0.2f;
        p.quality_weight = 0.9f;
        p.latency_weight = 0.5f;

        p.recovery_speed = 0.4f;        // Recover conservatively
        break;

    // -----------------------------------------------------------------
    // BALANCED: Good FPS + good quality. Adapts both proportionally.
    //
    // Target: 1440p@120fps
    // Will trade off both resolution and FPS as needed
    // Jitter buffer: 4ms
    // -----------------------------------------------------------------
    case GamingMode::Balanced:
    default:
        p.target_fps     = FrameRates::FPS_120;
        p.min_fps        = FrameRates::FPS_60;
        p.max_fps        = FrameRates::FPS_144;

        p.target_resolution = (native_res.pixelCount() >= Resolutions::RES_1440P.pixelCount())
                              ? Resolutions::RES_1440P : native_res;
        p.min_resolution = Resolutions::RES_720P;

        p.resolution_ladder = {
            Resolutions::RES_1440P,
            Resolutions::RES_1080P,
            Resolutions::RES_900P,
            Resolutions::RES_720P,
        };
        p.fps_ladder = {
            FrameRates::FPS_144,
            FrameRates::FPS_120,
            FrameRates::FPS_60,
        };

        p.target_bitrate_kbps = 40000;  // 40 Mbps
        p.min_bitrate_kbps    = 3000;   // 3 Mbps
        p.max_bitrate_kbps    = 100000; // 100 Mbps

        p.jitter_buffer_ms = 4;
        p.max_fec_ratio    = 0.20f;
        p.min_fec_ratio    = 0.03f;

        // Equal-ish weights
        p.fps_weight     = 0.6f;
        p.quality_weight = 0.5f;
        p.latency_weight = 0.7f;

        p.recovery_speed = 0.6f;
        break;
    }

    return p;
}

// ---------------------------------------------------------------------------
// QoS adaptation decision
//
// When the adaptive algorithm detects congestion, it uses these helpers to
// decide whether to reduce FPS or resolution based on the current mode.
// ---------------------------------------------------------------------------
enum class QosAction : uint8_t {
    None           = 0,
    ReduceBitrate  = 1,   // Lower encode bitrate (first resort)
    ReduceFps      = 2,   // Drop to next FPS tier
    ReduceResolution = 3, // Drop to next resolution tier
    IncreaseFec    = 4,   // Add more FEC redundancy
    ForceIdr       = 5,   // Request immediate keyframe
    IncreaseBitrate = 6,  // Recover bitrate
    IncreaseFps     = 7,  // Recover FPS
    IncreaseResolution = 8, // Recover resolution
    DecreaseFec    = 9,   // Reduce FEC overhead
};

// Determine the next degradation action given the current preset and state
inline QosAction getNextDegradationAction(
    const QosPreset& preset,
    uint32_t current_fps,
    Resolution current_resolution,
    uint32_t current_bitrate_kbps,
    float current_fec_ratio
) {
    // Always try bitrate reduction first (cheapest action)
    if (current_bitrate_kbps > preset.min_bitrate_kbps) {
        return QosAction::ReduceBitrate;
    }

    // FEC increase if under budget
    if (current_fec_ratio < preset.max_fec_ratio) {
        return QosAction::IncreaseFec;
    }

    // Now we must sacrifice either FPS or resolution.
    // Use the mode's weight to decide.
    if (preset.fps_weight > preset.quality_weight) {
        // Competitive: sacrifice resolution before FPS
        if (current_resolution != preset.min_resolution) {
            return QosAction::ReduceResolution;
        }
        if (current_fps > preset.min_fps) {
            return QosAction::ReduceFps;
        }
    } else {
        // Cinematic: sacrifice FPS before resolution
        if (current_fps > preset.min_fps) {
            return QosAction::ReduceFps;
        }
        if (current_resolution != preset.min_resolution) {
            return QosAction::ReduceResolution;
        }
    }

    // Nothing left to sacrifice — force IDR and hope for the best
    return QosAction::ForceIdr;
}

} // namespace cs
