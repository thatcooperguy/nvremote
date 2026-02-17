///////////////////////////////////////////////////////////////////////////////
// decoder_interface.h -- Abstract video decoder interface
//
// Provides the common base for all video decoder implementations
// (NVDEC/CUDA, D3D11VA, DXVA2, software). Each decoder takes compressed
// NAL data and produces a DecodedFrame containing a D3D11 texture or
// system-memory buffer ready for rendering.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <string>

#ifdef _WIN32
#include <d3d11.h>
#include <dxgi.h>
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Frame format enumeration
// ---------------------------------------------------------------------------
enum class FrameFormat : uint8_t {
    NV12   = 0,   // Planar Y + interleaved UV, most common HW output
    BGRA   = 1,   // 32-bit BGRA, ready for display
    P010   = 2,   // 10-bit NV12 variant (HDR)
    YUV420 = 3,   // Planar I420 (software path)
};

// ---------------------------------------------------------------------------
// Decoded frame descriptor
// ---------------------------------------------------------------------------
struct DecodedFrame {
    void*       texture;        // ID3D11Texture2D* (HW path) or raw pixel pointer (SW path)
    uint32_t    subresource;    // D3D11 texture array index (typically 0)
    uint32_t    width;
    uint32_t    height;
    FrameFormat format;         // Typically NV12 from hardware decoders
    uint64_t    timestamp_us;   // Presentation timestamp in microseconds
    double      decode_time_ms; // Time spent decoding this frame (performance metric)

    DecodedFrame()
        : texture(nullptr)
        , subresource(0)
        , width(0)
        , height(0)
        , format(FrameFormat::NV12)
        , timestamp_us(0)
        , decode_time_ms(0.0)
    {}
};

// ---------------------------------------------------------------------------
// Abstract decoder interface
// ---------------------------------------------------------------------------
class IDecoder {
public:
    virtual ~IDecoder() = default;

    /// Initialize the decoder for a given codec and initial resolution.
    /// Returns true on success.
    virtual bool initialize(uint8_t codec, uint32_t width, uint32_t height) = 0;

    /// Decode a single NAL unit or access unit.
    /// On success, populates `frame` and returns true.
    /// Returns false if no frame is ready yet (e.g., B-frame reordering)
    /// or if an error occurred.
    virtual bool decode(const uint8_t* data, size_t len, DecodedFrame& frame) = 0;

    /// Flush any buffered frames out of the decoder pipeline.
    virtual void flush() = 0;

    /// Release all resources. Safe to call multiple times.
    virtual void release() = 0;

    /// Return a human-readable name for this decoder backend.
    virtual std::string getName() const = 0;

    /// Optionally share the D3D11 device with the renderer for zero-copy.
    /// Default implementation returns nullptr (no device sharing).
#ifdef _WIN32
    virtual ID3D11Device* getD3D11Device() const { return nullptr; }
    virtual void setD3D11Device(ID3D11Device* /*device*/) {}
#endif
};

} // namespace cs
