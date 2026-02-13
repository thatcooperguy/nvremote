///////////////////////////////////////////////////////////////////////////////
// d3d11_renderer.cpp -- D3D11 video renderer implementation
//
// Creates a D3D11 device and DXGI swap chain, then uses the built-in
// D3D11 Video Processor to convert NV12 decoded textures to BGRA for
// presentation. VSync is disabled for minimum latency.
///////////////////////////////////////////////////////////////////////////////

#include "d3d11_renderer.h"

#include <cs/common.h>

#include <chrono>

#ifdef _WIN32
#include <d3d11_1.h>
#include <dxgi1_2.h>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

D3D11Renderer::D3D11Renderer() = default;

D3D11Renderer::~D3D11Renderer() {
    release();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#ifdef _WIN32
bool D3D11Renderer::initialize(HWND hwnd, uint32_t width, uint32_t height) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        release();
    }

    hwnd_ = hwnd;
    width_ = width;
    height_ = height;

    // Create D3D11 device with video support
    D3D_FEATURE_LEVEL feature_levels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
    };

    UINT create_flags = D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
#ifndef NDEBUG
    create_flags |= D3D11_CREATE_DEVICE_DEBUG;
#endif

    D3D_FEATURE_LEVEL achieved_level;
    HRESULT hr = D3D11CreateDevice(
        nullptr,                    // Default adapter
        D3D_DRIVER_TYPE_HARDWARE,
        nullptr,
        create_flags,
        feature_levels,
        _countof(feature_levels),
        D3D11_SDK_VERSION,
        device_.GetAddressOf(),
        &achieved_level,
        context_.GetAddressOf()
    );

    if (FAILED(hr)) {
        // Retry without debug layer
        create_flags &= ~D3D11_CREATE_DEVICE_DEBUG;
        hr = D3D11CreateDevice(
            nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
            create_flags, feature_levels, _countof(feature_levels),
            D3D11_SDK_VERSION,
            device_.GetAddressOf(), &achieved_level, context_.GetAddressOf()
        );
    }

    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: D3D11CreateDevice failed: 0x%08lx", hr);
        return false;
    }

    CS_LOG(INFO, "D3D11Renderer: device created, feature level 0x%x", achieved_level);

    // Enable multithreaded device access (required when decoder and renderer
    // share the same device but run on different threads)
    ComPtr<ID3D10Multithread> multithread;
    hr = device_.As(&multithread);
    if (SUCCEEDED(hr)) {
        multithread->SetMultithreadProtected(TRUE);
    }

    // Get the DXGI factory from the device
    ComPtr<IDXGIDevice> dxgi_device;
    hr = device_.As(&dxgi_device);
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: failed to get IDXGIDevice: 0x%08lx", hr);
        return false;
    }

    ComPtr<IDXGIAdapter> adapter;
    hr = dxgi_device->GetAdapter(adapter.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: failed to get adapter: 0x%08lx", hr);
        return false;
    }

    ComPtr<IDXGIFactory2> factory;
    hr = adapter->GetParent(IID_PPV_ARGS(factory.GetAddressOf()));
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: failed to get DXGI factory: 0x%08lx", hr);
        return false;
    }

    // Create swap chain
    DXGI_SWAP_CHAIN_DESC1 sc_desc = {};
    sc_desc.Width = width;
    sc_desc.Height = height;
    sc_desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    sc_desc.Stereo = FALSE;
    sc_desc.SampleDesc.Count = 1;
    sc_desc.SampleDesc.Quality = 0;
    sc_desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sc_desc.BufferCount = 2;   // Double buffering
    sc_desc.Scaling = DXGI_SCALING_STRETCH;
    sc_desc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
    sc_desc.AlphaMode = DXGI_ALPHA_MODE_IGNORE;
    sc_desc.Flags = DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING;  // For VSync off

    hr = factory->CreateSwapChainForHwnd(
        device_.Get(),
        hwnd,
        &sc_desc,
        nullptr,   // No fullscreen desc
        nullptr,   // No restrict to output
        swap_chain_.GetAddressOf()
    );

    if (FAILED(hr)) {
        // Retry without tearing flag (older Windows versions)
        sc_desc.Flags = 0;
        sc_desc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL;
        hr = factory->CreateSwapChainForHwnd(
            device_.Get(), hwnd, &sc_desc,
            nullptr, nullptr, swap_chain_.GetAddressOf()
        );
    }

    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: CreateSwapChainForHwnd failed: 0x%08lx", hr);
        return false;
    }

    // Disable Alt+Enter fullscreen toggle (Electron handles this)
    factory->MakeWindowAssociation(hwnd, DXGI_MWA_NO_ALT_ENTER);

    // Get back buffer
    hr = swap_chain_->GetBuffer(0, IID_PPV_ARGS(back_buffer_.GetAddressOf()));
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: failed to get back buffer: 0x%08lx", hr);
        return false;
    }

    // Create render target view
    hr = device_->CreateRenderTargetView(back_buffer_.Get(), nullptr, rtv_.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: failed to create RTV: 0x%08lx", hr);
        return false;
    }

    // Initialize video processor
    hr = device_->QueryInterface(IID_PPV_ARGS(video_device_.GetAddressOf()));
    if (FAILED(hr)) {
        CS_LOG(WARN, "D3D11Renderer: no video device interface, color conversion may fail");
    }

    if (video_device_) {
        ComPtr<ID3D11DeviceContext> ctx;
        device_->GetImmediateContext(ctx.GetAddressOf());
        hr = ctx->QueryInterface(IID_PPV_ARGS(video_context_.GetAddressOf()));
        if (FAILED(hr)) {
            CS_LOG(WARN, "D3D11Renderer: no video context interface");
        }
    }

    initialized_ = true;
    CS_LOG(INFO, "D3D11Renderer: initialized %ux%u swap chain", width, height);
    return true;
}
#endif

// ---------------------------------------------------------------------------
// createVideoProcessor
// ---------------------------------------------------------------------------

#ifdef _WIN32
bool D3D11Renderer::createVideoProcessor(uint32_t input_width, uint32_t input_height) {
    if (!video_device_) return false;

    // Release old processor if dimensions changed
    if (vp_enum_ && vp_input_width_ == input_width && vp_input_height_ == input_height) {
        return true;  // Already created for this size
    }

    video_processor_.Reset();
    vp_enum_.Reset();
    vp_output_view_.Reset();

    // Create enumerator
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC content_desc = {};
    content_desc.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
    content_desc.InputWidth = input_width;
    content_desc.InputHeight = input_height;
    content_desc.OutputWidth = width_;
    content_desc.OutputHeight = height_;
    content_desc.Usage = D3D11_VIDEO_USAGE_PLAYBACK_NORMAL;

    HRESULT hr = video_device_->CreateVideoProcessorEnumerator(&content_desc, vp_enum_.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: CreateVideoProcessorEnumerator failed: 0x%08lx", hr);
        return false;
    }

    // Create video processor
    hr = video_device_->CreateVideoProcessor(vp_enum_.Get(), 0, video_processor_.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: CreateVideoProcessor failed: 0x%08lx", hr);
        return false;
    }

    // Create output view on the back buffer
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC output_desc = {};
    output_desc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
    output_desc.Texture2D.MipSlice = 0;

    hr = video_device_->CreateVideoProcessorOutputView(
        back_buffer_.Get(), vp_enum_.Get(), &output_desc, vp_output_view_.GetAddressOf()
    );
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: CreateVideoProcessorOutputView failed: 0x%08lx", hr);
        return false;
    }

    // Configure color space (BT.709 for HD content)
    if (video_context_) {
        D3D11_VIDEO_PROCESSOR_COLOR_SPACE color_space = {};
        color_space.Usage = 0;          // Playback
        color_space.RGB_Range = 0;      // Full range
        color_space.YCbCr_Matrix = 1;   // BT.709
        color_space.YCbCr_xvYCC = 0;
        color_space.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_0_255;
        video_context_->VideoProcessorSetStreamColorSpace(video_processor_.Get(), 0, &color_space);

        D3D11_VIDEO_PROCESSOR_COLOR_SPACE output_color = {};
        output_color.Usage = 0;
        output_color.RGB_Range = 0;
        video_context_->VideoProcessorSetOutputColorSpace(video_processor_.Get(), &output_color);
    }

    vp_input_width_ = input_width;
    vp_input_height_ = input_height;

    CS_LOG(DEBUG, "D3D11Renderer: video processor created %ux%u -> %ux%u",
           input_width, input_height, width_, height_);
    return true;
}

// ---------------------------------------------------------------------------
// renderWithVideoProcessor
// ---------------------------------------------------------------------------

bool D3D11Renderer::renderWithVideoProcessor(ID3D11Texture2D* input_tex, uint32_t subresource) {
    if (!video_device_ || !video_context_) return false;

    // Get texture description for dimensions
    D3D11_TEXTURE2D_DESC tex_desc;
    input_tex->GetDesc(&tex_desc);

    // Ensure video processor is created for this input size
    if (!createVideoProcessor(tex_desc.Width, tex_desc.Height)) {
        return false;
    }

    // Create input view
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC input_view_desc = {};
    input_view_desc.FourCC = 0;
    input_view_desc.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
    input_view_desc.Texture2D.MipSlice = 0;
    input_view_desc.Texture2D.ArraySlice = subresource;

    ComPtr<ID3D11VideoProcessorInputView> input_view;
    HRESULT hr = video_device_->CreateVideoProcessorInputView(
        input_tex, vp_enum_.Get(), &input_view_desc, input_view.GetAddressOf()
    );
    if (FAILED(hr)) {
        CS_LOG(WARN, "D3D11Renderer: CreateVideoProcessorInputView failed: 0x%08lx", hr);
        return false;
    }

    // Build stream data
    D3D11_VIDEO_PROCESSOR_STREAM stream = {};
    stream.Enable = TRUE;
    stream.OutputIndex = 0;
    stream.InputFrameOrField = 0;
    stream.PastFrames = 0;
    stream.FutureFrames = 0;
    stream.pInputSurface = input_view.Get();

    // Blit (NV12 -> BGRA with scaling)
    hr = video_context_->VideoProcessorBlt(
        video_processor_.Get(),
        vp_output_view_.Get(),
        0,      // Output frame
        1,      // Stream count
        &stream
    );

    if (FAILED(hr)) {
        CS_LOG(WARN, "D3D11Renderer: VideoProcessorBlt failed: 0x%08lx", hr);
        return false;
    }

    return true;
}
#endif

// ---------------------------------------------------------------------------
// renderFrame
// ---------------------------------------------------------------------------

double D3D11Renderer::renderFrame(const DecodedFrame& frame) {
    std::lock_guard<std::mutex> lock(mutex_);

#ifdef _WIN32
    if (!initialized_ || !swap_chain_) {
        return 0.0;
    }

    auto start = std::chrono::steady_clock::now();

    bool rendered = false;

    // If the frame has a D3D11 texture (hardware decode path), use video processor
    if (frame.texture && frame.format == FrameFormat::NV12 && video_device_) {
        auto* tex = static_cast<ID3D11Texture2D*>(frame.texture);
        rendered = renderWithVideoProcessor(tex, frame.subresource);
    }

    if (!rendered) {
        // Fallback: clear to black (no frame to display or conversion failed)
        float clear_color[4] = { 0.0f, 0.0f, 0.0f, 1.0f };
        context_->ClearRenderTargetView(rtv_.Get(), clear_color);
    }

    // Present with no VSync (0) and allow tearing for lowest latency
    UINT present_flags = DXGI_PRESENT_ALLOW_TEARING;
    HRESULT hr = swap_chain_->Present(0, present_flags);
    if (FAILED(hr)) {
        // Retry without tearing flag
        hr = swap_chain_->Present(0, 0);
        if (hr == DXGI_ERROR_DEVICE_REMOVED || hr == DXGI_ERROR_DEVICE_RESET) {
            CS_LOG(ERR, "D3D11Renderer: device lost during Present: 0x%08lx", hr);
            // Would need to recreate device here
        }
    }

    auto end = std::chrono::steady_clock::now();
    double render_ms = std::chrono::duration<double, std::milli>(end - start).count();
    last_render_time_ms_ = render_ms;
    return render_ms;
#else
    (void)frame;
    return 0.0;
#endif
}

// ---------------------------------------------------------------------------
// resize
// ---------------------------------------------------------------------------

bool D3D11Renderer::resize(uint32_t width, uint32_t height) {
    std::lock_guard<std::mutex> lock(mutex_);

#ifdef _WIN32
    if (!initialized_ || !swap_chain_) return false;

    if (width == width_ && height == height_) return true;

    CS_LOG(INFO, "D3D11Renderer: resizing %ux%u -> %ux%u", width_, height_, width, height);

    // Release references to the back buffer
    rtv_.Reset();
    back_buffer_.Reset();
    vp_output_view_.Reset();

    // Resize swap chain buffers
    HRESULT hr = swap_chain_->ResizeBuffers(
        2, width, height, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING
    );
    if (FAILED(hr)) {
        CS_LOG(ERR, "D3D11Renderer: ResizeBuffers failed: 0x%08lx", hr);
        return false;
    }

    width_ = width;
    height_ = height;

    // Re-acquire back buffer and RTV
    hr = swap_chain_->GetBuffer(0, IID_PPV_ARGS(back_buffer_.GetAddressOf()));
    if (FAILED(hr)) return false;

    hr = device_->CreateRenderTargetView(back_buffer_.Get(), nullptr, rtv_.GetAddressOf());
    if (FAILED(hr)) return false;

    // Force video processor recreation on next frame
    video_processor_.Reset();
    vp_enum_.Reset();
    vp_input_width_ = 0;
    vp_input_height_ = 0;

    CS_LOG(INFO, "D3D11Renderer: resize complete");
    return true;
#else
    (void)width; (void)height;
    return false;
#endif
}

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

void D3D11Renderer::release() {
    std::lock_guard<std::mutex> lock(mutex_);

#ifdef _WIN32
    vp_output_view_.Reset();
    video_processor_.Reset();
    vp_enum_.Reset();
    video_context_.Reset();
    video_device_.Reset();
    rtv_.Reset();
    back_buffer_.Reset();
    swap_chain_.Reset();
    context_.Reset();
    device_.Reset();
    hwnd_ = nullptr;
#endif

    initialized_ = false;
    CS_LOG(INFO, "D3D11Renderer: released");
}

// ---------------------------------------------------------------------------
// getSharedSurface
// ---------------------------------------------------------------------------

RenderSurface D3D11Renderer::getSharedSurface() const {
    RenderSurface surface;

#ifdef _WIN32
    std::lock_guard<std::mutex> lock(mutex_);
    if (back_buffer_) {
        ComPtr<IDXGIResource> dxgi_resource;
        HRESULT hr = back_buffer_.As(&dxgi_resource);
        if (SUCCEEDED(hr)) {
            dxgi_resource->GetSharedHandle(&surface.shared_handle);
        }
    }
    surface.width = width_;
    surface.height = height_;
    surface.format = DXGI_FORMAT_B8G8R8A8_UNORM;
#endif

    return surface;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

#ifdef _WIN32
ID3D11Device* D3D11Renderer::getDevice() const {
    return device_.Get();
}

ID3D11DeviceContext* D3D11Renderer::getDeviceContext() const {
    return context_.Get();
}
#endif

double D3D11Renderer::getLastRenderTimeMs() const {
    return last_render_time_ms_;
}

} // namespace cs
