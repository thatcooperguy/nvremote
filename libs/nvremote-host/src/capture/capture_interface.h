///////////////////////////////////////////////////////////////////////////////
// capture_interface.h -- Abstract capture device interface
//
// Defines the contract for screen capture backends.  Implementations:
//   - NvfbcCapture   (NvFBC -- NVIDIA FrameBuffer Capture, GPU-direct, Windows)
//   - DxgiCapture    (DXGI Desktop Duplication, D3D11-based fallback, Windows)
//   - DrmCapture     (DRM/KMS framebuffer, Linux ARM64 -- Jetson/Orin/DGX Spark)
//
// The session manager probes backends in order:
//   Windows: NvFBC → DXGI
//   Linux ARM64: NvFBC (DGX Spark only) → DRM/KMS
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <string>

namespace cs::host {

// ---------------------------------------------------------------------------
// FrameFormat -- pixel layout of the captured surface
// ---------------------------------------------------------------------------
enum class FrameFormat {
    BGRA8,   // 32-bit BGRA (DXGI default)
    NV12,    // Semi-planar 4:2:0 (NVENC native input)
    ARGB8,   // 32-bit ARGB
};

// ---------------------------------------------------------------------------
// CapturedFrame -- one captured desktop frame
// ---------------------------------------------------------------------------
struct CapturedFrame {
    void*       gpu_ptr        = nullptr;  // GPU memory (CUDA device ptr or D3D11 texture)
    uint32_t    width          = 0;
    uint32_t    height         = 0;
    uint32_t    pitch          = 0;        // Row pitch in bytes
    FrameFormat format         = FrameFormat::BGRA8;
    uint64_t    timestamp_us   = 0;        // Capture timestamp (steady clock, microseconds)
    bool        is_new_frame   = true;     // False if the desktop hasn't changed since last grab
};

// ---------------------------------------------------------------------------
// ICaptureDevice -- abstract interface for all capture backends
// ---------------------------------------------------------------------------
class ICaptureDevice {
public:
    virtual ~ICaptureDevice() = default;

    /// Initialize the capture device for the specified GPU adapter.
    /// Returns true on success; false if the backend is unavailable.
    virtual bool initialize(int gpu_index = 0) = 0;

    /// Capture the next frame into |frame|.
    /// Returns true on success.  On duplicate frames, is_new_frame will be false.
    virtual bool captureFrame(CapturedFrame& frame) = 0;

    /// Release all internal resources.
    virtual void release() = 0;

    /// Human-readable name for this capture backend (e.g. "NvFBC", "DXGI").
    virtual std::string getName() const = 0;
};

} // namespace cs::host
