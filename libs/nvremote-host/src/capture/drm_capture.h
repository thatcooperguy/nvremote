///////////////////////////////////////////////////////////////////////////////
// drm_capture.h -- DRM/KMS framebuffer capture for Linux ARM64
//
// Captures the display framebuffer via Linux DRM (Direct Rendering Manager)
// and KMS (Kernel Mode Setting). This is the primary capture backend for
// NVIDIA Jetson (Orin, Xavier, Nano) and DGX Spark platforms where NvFBC
// is not available.
//
// Key features:
//   - Zero-copy path to NVMM buffers when available (Jetson unified memory)
//   - Supports headless capture via DRM dumb buffers
//   - Cursor overlay via DRM plane or software compositing
//   - Falls back to GStreamer nvvidconv pipeline if DRM is unavailable
//
// Supported platforms:
//   - Jetson Orin Nano / NX / AGX Orin (JetPack 5.x+)
//   - DGX Spark (JetPack 6.x / DGX OS)
//   - Any Linux ARM64 with DRM/KMS support
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "capture_interface.h"
#include <string>

namespace cs::host {

// ---------------------------------------------------------------------------
// JetsonPlatformInfo -- detected Jetson hardware details
// ---------------------------------------------------------------------------
struct JetsonPlatformInfo {
    std::string model;           // e.g. "NVIDIA Jetson AGX Orin"
    std::string soc;             // e.g. "Orin", "Xavier", "Tegra X1"
    std::string jetpack_version; // e.g. "5.1.2", "6.0"
    std::string l4t_version;     // e.g. "35.4.1" (Linux for Tegra)
    bool        has_nvmm = false;         // NVIDIA Multimedia Memory available
    bool        has_nvfbc = false;        // NvFBC available (DGX Spark may have this)
    int         max_nvenc_sessions = 0;   // Max concurrent encode sessions
    std::string power_mode;               // e.g. "MAXN", "15W", "10W"
};

/// Detect the Jetson/DGX platform by reading /proc/device-tree/model
/// and parsing JetPack/L4T version from /etc/nv_tegra_release.
/// Returns a populated JetsonPlatformInfo.
JetsonPlatformInfo detectJetsonPlatform();

// ---------------------------------------------------------------------------
// DrmCapture -- DRM/KMS capture backend for Linux ARM64 (Jetson/DGX)
// ---------------------------------------------------------------------------
class DrmCapture : public ICaptureDevice {
public:
    DrmCapture();
    ~DrmCapture() override;

    // ICaptureDevice interface
    bool initialize(int gpu_index = 0) override;
    bool captureFrame(CapturedFrame& frame) override;
    void release() override;
    std::string getName() const override;

    /// Get the detected platform info.
    const JetsonPlatformInfo& getPlatformInfo() const { return platform_info_; }

    /// Check if NVMM zero-copy is active (Jetson unified memory optimization).
    bool isNvmmEnabled() const { return nvmm_enabled_; }

private:
    // DRM file descriptor and resources
    int         drm_fd_       = -1;
    uint32_t    crtc_id_      = 0;
    uint32_t    connector_id_ = 0;
    uint32_t    fb_id_        = 0;

    // Captured frame buffer
    void*       mapped_buffer_  = nullptr;
    uint32_t    buffer_width_   = 0;
    uint32_t    buffer_height_  = 0;
    uint32_t    buffer_pitch_   = 0;

    // Platform detection
    JetsonPlatformInfo platform_info_;
    bool               nvmm_enabled_ = false;

    // Internal helpers
    bool openDrmDevice(int gpu_index);
    bool setupCrtc();
    bool mapFramebuffer();
};

} // namespace cs::host
