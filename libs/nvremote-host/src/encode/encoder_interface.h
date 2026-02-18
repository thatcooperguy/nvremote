///////////////////////////////////////////////////////////////////////////////
// encoder_interface.h -- Abstract video encoder interface
//
// Defines the contract for hardware video encoders.  The primary (and
// currently only) implementation is NvencEncoder which uses NVIDIA's
// NVENC hardware encoder loaded dynamically at runtime.
//
// The interface supports dynamic reconfiguration of bitrate and framerate
// without tearing down the encode session -- critical for adaptive QoS.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "capture/capture_interface.h"

#include <cstdint>
#include <string>
#include <vector>

namespace cs::host {

// ---------------------------------------------------------------------------
// CodecType -- supported video codecs
// ---------------------------------------------------------------------------
enum class CodecType {
    H264,
    HEVC,
    AV1,
};

inline const char* codecTypeName(CodecType ct) {
    switch (ct) {
        case CodecType::H264: return "H.264";
        case CodecType::HEVC: return "HEVC";
        case CodecType::AV1:  return "AV1";
    }
    return "Unknown";
}

// ---------------------------------------------------------------------------
// EncoderConfig -- parameters for encoder initialization / reconfiguration
// ---------------------------------------------------------------------------
struct EncoderConfig {
    CodecType codec              = CodecType::H264;
    uint32_t  width              = 1920;
    uint32_t  height             = 1080;
    uint32_t  bitrate_kbps       = 20000;       // 20 Mbps default
    uint32_t  max_bitrate_kbps   = 100000;      // 100 Mbps cap
    uint32_t  min_bitrate_kbps   = 1000;        // 1 Mbps floor
    uint32_t  fps                = 60;
    uint32_t  gop_length         = 120;          // 2 seconds at 60fps
    bool      enable_intra_refresh = true;
    uint32_t  intra_refresh_period = 60;         // Spread IDR over 60 frames
};

// ---------------------------------------------------------------------------
// EncodedPacket -- one encoded video frame (NAL units / OBUs)
// ---------------------------------------------------------------------------
struct EncodedPacket {
    std::vector<uint8_t> data;                   // Encoded bitstream
    uint64_t             timestamp_us   = 0;     // PTS from capture
    uint32_t             frame_number   = 0;     // Monotonic frame counter
    bool                 is_keyframe    = false;  // True for IDR / CRA / Key
    CodecType            codec          = CodecType::H264;
};

// ---------------------------------------------------------------------------
// IEncoder -- abstract encoder interface
// ---------------------------------------------------------------------------
class IEncoder {
public:
    virtual ~IEncoder() = default;

    /// Initialize the encoder with the given configuration.
    /// Must be called before encode().
    virtual bool initialize(const EncoderConfig& config) = 0;

    /// Encode a single captured frame.
    /// Returns true on success; the encoded bitstream is written to |packet|.
    virtual bool encode(const CapturedFrame& frame, EncodedPacket& packet) = 0;

    /// Dynamically reconfigure the encoder (bitrate / fps / GOP).
    /// Does NOT require session recreation -- uses NvEncReconfigureEncoder.
    virtual bool reconfigure(const EncoderConfig& config) = 0;

    /// Force the next encoded frame to be an IDR keyframe.
    virtual void forceIdr() = 0;

    /// Flush any pending frames from the encoder pipeline.
    virtual void flush() = 0;

    /// Release all encoder resources.
    virtual void release() = 0;

    /// Query whether a given codec is supported by this encoder / GPU.
    virtual bool isCodecSupported(CodecType codec) = 0;

    /// Human-readable codec name (e.g. "NVENC H.264").
    virtual std::string getCodecName() const = 0;
};

} // namespace cs::host
