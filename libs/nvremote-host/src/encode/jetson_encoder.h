///////////////////////////////////////////////////////////////////////////////
// jetson_encoder.h -- NVIDIA Multimedia API encoder for Jetson/Orin/DGX Spark
//
// Hardware video encoder using NVIDIA's Multimedia API (NvVideoEncoder)
// instead of the desktop NVENC SDK. This is the encoder backend for all
// NVIDIA ARM64 platforms:
//
//   - Jetson Nano (Tegra X1):       H.264
//   - Jetson Xavier NX:             H.264, HEVC
//   - Jetson Orin Nano / NX:        H.264, HEVC
//   - Jetson AGX Orin:              H.264, HEVC (AV1 decode only)
//   - DGX Spark (Grace Blackwell):  H.264, HEVC, AV1
//
// Key differences from desktop NVENC:
//   - Uses V4L2-based NvVideoEncoder API (part of JetPack Multimedia API)
//   - Supports NVMM zero-copy from DRM capture to encoder (no CPU memcpy)
//   - Power-aware: reads power mode and thermal zone to adapt quality
//   - Encode API is /dev/nvhost-msenc (Jetson) not libnvidia-encode.so
//
// Compile requirements:
//   - JetPack SDK >= 5.0
//   - libnvbuf_utils (NVMM buffer management)
//   - libv4l2 (V4L2 video encoder interface)
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "encoder_interface.h"
#include "capture/drm_capture.h"  // For JetsonPlatformInfo

#include <string>
#include <vector>
#include <atomic>

namespace cs::host {

// ---------------------------------------------------------------------------
// JetsonEncoderConfig -- extended config for Jetson-specific features
// ---------------------------------------------------------------------------
struct JetsonEncoderConfig : public EncoderConfig {
    bool     use_nvmm       = true;      // Use NVMM zero-copy buffers (Jetson unified memory)
    bool     power_aware    = true;      // Adapt to power mode / thermal throttling
    int      v4l2_device_fd = -1;        // Pre-opened V4L2 encoder device (or -1 for auto-detect)
    uint32_t max_perf_mode  = 0;         // NVENC performance level (0=auto)
};

// ---------------------------------------------------------------------------
// JetsonEncoder -- Multimedia API hardware encoder for ARM64 NVIDIA platforms
// ---------------------------------------------------------------------------
class JetsonEncoder : public IEncoder {
public:
    JetsonEncoder();
    ~JetsonEncoder() override;

    // IEncoder interface
    bool initialize(const EncoderConfig& config) override;
    bool encode(const CapturedFrame& frame, EncodedPacket& packet) override;
    bool reconfigure(const EncoderConfig& config) override;
    void forceIdr() override;
    void flush() override;
    void release() override;
    std::string getCodecName() const override;

    /// Initialize with Jetson-specific extended configuration.
    bool initializeJetson(const JetsonEncoderConfig& config);

    /// Query the encoder's supported codecs on this hardware.
    /// Returns a list of CodecType values available on the current SoC.
    static std::vector<CodecType> querySupportedCodecs();

    /// Get current thermal throttle status.
    /// Returns true if the encoder is being thermally throttled.
    bool isThermalThrottled() const;

    /// Get current GPU encoder utilization (0-100%).
    int getEncoderUtilization() const;

private:
    // V4L2 encoder state
    int             encoder_fd_    = -1;    // /dev/nvhost-msenc or /dev/video*
    bool            initialized_   = false;
    EncoderConfig   config_;
    JetsonPlatformInfo platform_info_;

    // NVMM buffer management
    bool            nvmm_enabled_  = false;
    int             nvmm_capture_plane_fd_ = -1;
    int             nvmm_output_plane_fd_  = -1;

    // Encode state
    uint32_t        frame_counter_ = 0;
    std::atomic<bool> force_idr_{false};

    // Thermal monitoring
    int             thermal_zone_fd_ = -1;
    int             thermal_throttle_temp_ = 85000;  // 85C in millidegrees

    // Internal helpers
    bool openEncoderDevice();
    bool configureV4l2Encoder();
    bool allocateNvmmBuffers();
    int  readThermalZone() const;
    bool adaptForThermal(EncoderConfig& config);
    bool adaptForPowerMode(EncoderConfig& config);

    /// Map codec type to V4L2 pixel format
    static uint32_t codecToV4l2Format(CodecType codec);
};

} // namespace cs::host
