///////////////////////////////////////////////////////////////////////////////
// d3d11_renderer.h -- D3D11 video renderer
//
// Presents decoded video frames (NV12 textures from the hardware decoder)
// to a DXGI swap chain attached to an HWND. Uses the D3D11 Video Processor
// for NV12-to-BGRA color space conversion with GPU-accelerated scaling.
//
// The renderer creates and owns the D3D11 device, which it shares with
// the decoder for zero-copy frame handoff.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "render_surface.h"
#include "../decode/decoder_interface.h"

#include <cstdint>
#include <mutex>
#include <string>

#ifdef _WIN32
#include <d3d11.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

using Microsoft::WRL::ComPtr;
#endif

namespace cs {

class D3D11Renderer {
public:
    D3D11Renderer();
    ~D3D11Renderer();

    // Non-copyable
    D3D11Renderer(const D3D11Renderer&) = delete;
    D3D11Renderer& operator=(const D3D11Renderer&) = delete;

#ifdef _WIN32
    /// Initialize the renderer, creating the D3D11 device and swap chain.
    bool initialize(HWND hwnd, uint32_t width, uint32_t height);
#endif

    /// Render a decoded frame to the swap chain.
    /// Returns the time spent rendering in milliseconds.
    double renderFrame(const DecodedFrame& frame);

    /// Handle window resize.
    bool resize(uint32_t width, uint32_t height);

    /// Release all GPU resources.
    void release();

    /// Get the shared render surface (for offscreen rendering).
    RenderSurface getSharedSurface() const;

#ifdef _WIN32
    /// Get the D3D11 device for sharing with the decoder.
    ID3D11Device* getDevice() const;

    /// Get the D3D11 device context.
    ID3D11DeviceContext* getDeviceContext() const;
#endif

    /// Get the last render time in milliseconds.
    double getLastRenderTimeMs() const;

private:
#ifdef _WIN32
    /// Create the video processor for NV12->BGRA conversion.
    bool createVideoProcessor(uint32_t input_width, uint32_t input_height);

    /// Render using the video processor (NV12 input).
    bool renderWithVideoProcessor(ID3D11Texture2D* input_tex, uint32_t subresource);

    /// Ensure the staging/output texture matches the expected size.
    bool ensureOutputTexture(uint32_t width, uint32_t height);

    // D3D11 core objects
    ComPtr<ID3D11Device>           device_;
    ComPtr<ID3D11DeviceContext>    context_;
    ComPtr<IDXGISwapChain1>        swap_chain_;

    // Video processor for color conversion
    ComPtr<ID3D11VideoDevice>              video_device_;
    ComPtr<ID3D11VideoContext>             video_context_;
    ComPtr<ID3D11VideoProcessor>           video_processor_;
    ComPtr<ID3D11VideoProcessorEnumerator> vp_enum_;
    ComPtr<ID3D11VideoProcessorOutputView> vp_output_view_;
    uint32_t vp_input_width_  = 0;
    uint32_t vp_input_height_ = 0;

    // Render target (back buffer)
    ComPtr<ID3D11Texture2D>        back_buffer_;
    ComPtr<ID3D11RenderTargetView> rtv_;

    // Window
    HWND hwnd_ = nullptr;
#endif

    // State
    uint32_t width_       = 0;
    uint32_t height_      = 0;
    bool     initialized_ = false;
    double   last_render_time_ms_ = 0.0;

    mutable std::mutex mutex_;
};

} // namespace cs
