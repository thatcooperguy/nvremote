////////////////////////////////////////////////////////////////////////////////
// NVRemote — Streaming Profile Presets
//
// Defines the quality/performance trade-off presets users can select:
//   - Competitive: Maximum FPS, lowest latency, sacrifice resolution/quality
//   - Balanced:    Middle ground, adapts both FPS and quality
//   - Cinematic:   Maximum resolution + quality, allow higher latency
//   - Creative:    Native resolution, 4:4:4 chroma, color-accurate
//   - CAD:         Native resolution, AV1, precision work
//   - MobileSaver: Low bandwidth, small screen optimization
//   - LAN:         Maximum everything for same-network streaming
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

// Standard streaming resolutions (ordered by pixel count descending)
//
// Note on high-resolution support:
//   - 8K (7680x4320): Requires HEVC or AV1 codec (H.264 limited to 4096x4096).
//     Supported on Turing+ GPUs (HEVC) and Ada Lovelace+ (AV1).
//     Recommended: LAN only with 100+ Mbps bandwidth, Ada/Blackwell GPU.
//   - 5K (5120x2880): Requires HEVC or AV1. Common for Apple Studio Display,
//     iMac 5K. Well within RTX 3090+ encode capability at 60fps.
//   - Super Ultrawide (5120x1440): Requires HEVC or AV1. Samsung Odyssey G9, etc.
//   - All resolutions above 4K require HEVC or AV1 — H.264 is spec-limited to 4096x4096.
namespace Resolutions {
    static constexpr Resolution RES_8K       = { 7680, 4320 };  // 8K UHD (HEVC/AV1 only, Ada+)
    static constexpr Resolution RES_5K       = { 5120, 2880 };  // 5K (Apple Studio Display, iMac 5K)
    static constexpr Resolution RES_5K_UW    = { 5120, 1440 };  // Super Ultrawide (Samsung G9, etc.)
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
    Creative    = 3,   // Native res, 4:4:4 chroma, color-accurate
    CAD         = 4,   // Native res, AV1, precision work
    MobileSaver = 5,   // Low bandwidth, small screen optimization
    LAN         = 6,   // Maximum everything for same-network streaming
};

inline std::string gamingModeToString(GamingMode mode) {
    switch (mode) {
        case GamingMode::Competitive: return "Competitive";
        case GamingMode::Balanced:    return "Balanced";
        case GamingMode::Cinematic:   return "Cinematic";
        case GamingMode::Creative:    return "Creative";
        case GamingMode::CAD:         return "CAD";
        case GamingMode::MobileSaver: return "MobileSaver";
        case GamingMode::LAN:         return "LAN";
        default:                      return "Unknown";
    }
}

inline GamingMode gamingModeFromString(const std::string& name) {
    if (name == "Competitive" || name == "competitive") return GamingMode::Competitive;
    if (name == "Balanced"    || name == "balanced")    return GamingMode::Balanced;
    if (name == "Cinematic"   || name == "cinematic")   return GamingMode::Cinematic;
    if (name == "Creative"    || name == "creative")    return GamingMode::Creative;
    if (name == "CAD"         || name == "cad")         return GamingMode::CAD;
    if (name == "MobileSaver" || name == "mobile_saver" || name == "mobile") return GamingMode::MobileSaver;
    if (name == "LAN"         || name == "lan")         return GamingMode::LAN;
    return GamingMode::Balanced;  // default
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
// Preferred codec hint for the QoS engine
enum class PreferredCodec : uint8_t {
    H264    = 0,  // Widest compatibility, fastest encode
    HEVC    = 1,  // Better compression, good for higher resolutions
    AV1     = 2,  // Best compression, requires Ada Lovelace+
    Auto    = 3,  // Let QoS engine decide based on conditions
};

// Chroma subsampling mode
enum class ChromaMode : uint8_t {
    YUV420  = 0,  // Standard — best compression
    YUV444  = 1,  // Full chroma — color-accurate for creative work
};

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

    // Codec preference
    PreferredCodec preferred_codec = PreferredCodec::Auto;

    // Chroma subsampling
    ChromaMode chroma = ChromaMode::YUV420;

    // VPN-aware QoS adjustments (applied automatically when VPN detected)
    bool vpn_mode = false;
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
    // Target: up to 8K@60fps (or native@60)
    // Supports: 8K, 5K, 4K with graceful step-down
    // Will drop to: 4K@30 before 1440p@60
    // Jitter buffer: 8ms (smooth playback, slight input lag acceptable)
    //
    // Note: 8K requires HEVC/AV1 and Ada+ GPU. 5K requires HEVC/AV1.
    // The QoS engine will auto-select the highest resolution the
    // host GPU can encode and client can decode.
    // -----------------------------------------------------------------
    case GamingMode::Cinematic:
        p.target_fps     = FrameRates::FPS_60;
        p.min_fps        = FrameRates::FPS_30;
        p.max_fps        = FrameRates::FPS_60;

        // Target native resolution — QoS will step down if encode/bandwidth can't keep up
        p.target_resolution = native_res;
        p.min_resolution = Resolutions::RES_1080P;

        p.resolution_ladder = {
            Resolutions::RES_8K,
            Resolutions::RES_5K,
            Resolutions::RES_4K,
            Resolutions::RES_1440P,
            Resolutions::RES_1080P,
        };
        p.fps_ladder = {
            FrameRates::FPS_60,
            FrameRates::FPS_30,
        };

        p.target_bitrate_kbps = 80000;  // 80 Mbps (4K baseline)
        p.min_bitrate_kbps    = 10000;  // 10 Mbps
        p.max_bitrate_kbps    = 200000; // 200 Mbps (headroom for 5K/8K)

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

        p.recovery_speed     = 0.6f;
        p.preferred_codec    = PreferredCodec::HEVC;
        break;

    // -----------------------------------------------------------------
    // CREATIVE: Color-accurate, native resolution, 4:4:4 chroma.
    // For photo/video editing, color grading, design work.
    //
    // Target: native@60fps with full chroma (supports up to 8K)
    // Will drop FPS before resolution — visual fidelity is paramount
    // Uses HEVC for better quality at given bitrate + 4:4:4 support
    // 5K is common for Apple Studio Display creative workflows
    // -----------------------------------------------------------------
    case GamingMode::Creative:
        p.target_fps     = FrameRates::FPS_60;
        p.min_fps        = FrameRates::FPS_30;
        p.max_fps        = FrameRates::FPS_60;

        p.target_resolution = native_res;
        p.min_resolution = Resolutions::RES_1080P;

        p.resolution_ladder = {
            Resolutions::RES_8K,
            Resolutions::RES_5K,
            Resolutions::RES_4K,
            Resolutions::RES_1440P,
            Resolutions::RES_1080P,
        };
        p.fps_ladder = {
            FrameRates::FPS_60,
            FrameRates::FPS_30,
        };

        p.target_bitrate_kbps = 60000;  // 60 Mbps (higher for 4:4:4)
        p.min_bitrate_kbps    = 10000;  // 10 Mbps
        p.max_bitrate_kbps    = 200000; // 200 Mbps (headroom for 5K/8K 4:4:4)

        p.jitter_buffer_ms = 8;
        p.max_fec_ratio    = 0.20f;
        p.min_fec_ratio    = 0.05f;

        // Heavily prioritize quality
        p.fps_weight     = 0.2f;
        p.quality_weight = 1.0f;
        p.latency_weight = 0.3f;

        p.recovery_speed     = 0.3f;    // Very conservative recovery
        p.preferred_codec    = PreferredCodec::HEVC;
        p.chroma             = ChromaMode::YUV444;
        break;

    // -----------------------------------------------------------------
    // CAD / ENGINEERING: Precision work, native resolution, AV1.
    // For SolidWorks, AutoCAD, Fusion 360, 3D modeling.
    //
    // Target: native@60fps with AV1 (best compression for static scenes)
    // CAD apps have lots of static frames — AV1 excels here
    // 4:4:4 for line clarity and text readability
    // Supports up to 8K for multi-monitor / high-DPI CAD setups
    // -----------------------------------------------------------------
    case GamingMode::CAD:
        p.target_fps     = FrameRates::FPS_60;
        p.min_fps        = FrameRates::FPS_30;
        p.max_fps        = FrameRates::FPS_60;

        p.target_resolution = native_res;
        p.min_resolution = Resolutions::RES_1080P;

        p.resolution_ladder = {
            Resolutions::RES_8K,
            Resolutions::RES_5K,
            Resolutions::RES_4K,
            Resolutions::RES_1440P,
            Resolutions::RES_1080P,
        };
        p.fps_ladder = {
            FrameRates::FPS_60,
            FrameRates::FPS_30,
        };

        p.target_bitrate_kbps = 40000;  // 40 Mbps (AV1 is very efficient)
        p.min_bitrate_kbps    = 5000;   // 5 Mbps
        p.max_bitrate_kbps    = 120000; // 120 Mbps (headroom for 5K/8K AV1)

        p.jitter_buffer_ms = 10;         // Can tolerate more buffering
        p.max_fec_ratio    = 0.25f;
        p.min_fec_ratio    = 0.05f;

        // Heavily prioritize quality and resolution sharpness
        p.fps_weight     = 0.1f;
        p.quality_weight = 1.0f;
        p.latency_weight = 0.4f;

        p.recovery_speed     = 0.3f;
        p.preferred_codec    = PreferredCodec::AV1;
        p.chroma             = ChromaMode::YUV444;
        break;

    // -----------------------------------------------------------------
    // MOBILE SAVER: Optimized for phones on cellular or weak WiFi.
    // Low bandwidth, small screen, battery-friendly.
    //
    // Target: 720p@60fps at low bitrate
    // H.264 for widest compatibility and lowest decode power
    // -----------------------------------------------------------------
    case GamingMode::MobileSaver:
        p.target_fps     = FrameRates::FPS_60;
        p.min_fps        = FrameRates::FPS_30;
        p.max_fps        = FrameRates::FPS_60;

        p.target_resolution = Resolutions::RES_720P;
        p.min_resolution = Resolutions::RES_720P;

        p.resolution_ladder = {
            Resolutions::RES_720P,
        };
        p.fps_ladder = {
            FrameRates::FPS_60,
            FrameRates::FPS_30,
        };

        p.target_bitrate_kbps = 10000;  // 10 Mbps
        p.min_bitrate_kbps    = 2000;   // 2 Mbps
        p.max_bitrate_kbps    = 20000;  // 20 Mbps

        p.jitter_buffer_ms = 8;
        p.max_fec_ratio    = 0.30f;     // Higher FEC — cellular has more loss
        p.min_fec_ratio    = 0.10f;

        // Balanced — save bandwidth wherever possible
        p.fps_weight     = 0.5f;
        p.quality_weight = 0.3f;
        p.latency_weight = 0.6f;

        p.recovery_speed     = 0.5f;
        p.preferred_codec    = PreferredCodec::H264;
        break;

    // -----------------------------------------------------------------
    // LAN: Maximum everything for same-network streaming.
    // Assumes abundant bandwidth (1 Gbps LAN), minimal latency.
    //
    // Target: native@240fps at maximum bitrate
    // Supports up to 8K on capable hardware
    // Use H.264 up to 4K (fastest encode), HEVC/AV1 for 5K+ (spec limit)
    // 8K@60 HEVC ~100-150 Mbps, 4K@240 H.264 ~100-200 Mbps — both
    // fit comfortably in Gigabit LAN.
    // -----------------------------------------------------------------
    case GamingMode::LAN:
        p.target_fps     = FrameRates::FPS_240;
        p.min_fps        = FrameRates::FPS_120;
        p.max_fps        = FrameRates::FPS_240;

        p.target_resolution = native_res;
        p.min_resolution = Resolutions::RES_1080P;

        p.resolution_ladder = {
            Resolutions::RES_8K,
            Resolutions::RES_5K,
            Resolutions::RES_5K_UW,
            Resolutions::RES_4K,
            Resolutions::RES_1440P,
            Resolutions::RES_1080P,
        };
        p.fps_ladder = {
            FrameRates::FPS_240,
            FrameRates::FPS_165,
            FrameRates::FPS_144,
            FrameRates::FPS_120,
        };

        p.target_bitrate_kbps = 150000; // 150 Mbps
        p.min_bitrate_kbps    = 20000;  // 20 Mbps
        p.max_bitrate_kbps    = 300000; // 300 Mbps (Gigabit LAN headroom)

        p.jitter_buffer_ms = 1;         // Near-zero
        p.max_fec_ratio    = 0.05f;     // Minimal FEC — LAN is reliable
        p.min_fec_ratio    = 0.01f;

        // Everything maxed
        p.fps_weight     = 0.8f;
        p.quality_weight = 0.8f;
        p.latency_weight = 1.0f;

        p.recovery_speed     = 1.0f;    // Recover instantly
        p.preferred_codec    = PreferredCodec::H264;
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
