///////////////////////////////////////////////////////////////////////////////
// dxgi_capture.cpp -- DXGI Desktop Duplication capture implementation
//
// Creates a D3D11 device, obtains the primary output, and uses
// IDXGIOutputDuplication to capture the desktop.  The captured GPU texture
// is copied into a CPU-readable staging texture so the encoder can read it.
//
// Handles DXGI_ERROR_ACCESS_LOST gracefully by recreating the duplication.
///////////////////////////////////////////////////////////////////////////////

#include "dxgi_capture.h"
#include <cs/common.h>

#include <dxgi.h>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")

namespace cs::host {

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------

DxgiCapture::DxgiCapture() = default;

DxgiCapture::~DxgiCapture() {
    release();
}

// ---------------------------------------------------------------------------
// Initialize -- create D3D11 device, get output, set up duplication
// ---------------------------------------------------------------------------

bool DxgiCapture::initialize(int gpu_index) {
    if (initialized_) return true;

    // --- Create D3D11 device ------------------------------------------------
    D3D_FEATURE_LEVEL featureLevels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
    };
    D3D_FEATURE_LEVEL selectedLevel;
    UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
#ifdef _DEBUG
    flags |= D3D11_CREATE_DEVICE_DEBUG;
#endif

    // Enumerate DXGI adapters to select by gpu_index.
    ComPtr<IDXGIFactory1> factory;
    HRESULT hr = CreateDXGIFactory1(__uuidof(IDXGIFactory1),
                                     reinterpret_cast<void**>(factory.GetAddressOf()));
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: CreateDXGIFactory1 failed (0x%08lX)", hr);
        return false;
    }

    ComPtr<IDXGIAdapter1> adapter;
    hr = factory->EnumAdapters1(static_cast<UINT>(gpu_index), adapter.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: EnumAdapters1(%d) failed (0x%08lX)", gpu_index, hr);
        return false;
    }

    DXGI_ADAPTER_DESC1 adapterDesc;
    adapter->GetDesc1(&adapterDesc);
    char adapterName[256] = {};
    WideCharToMultiByte(CP_UTF8, 0, adapterDesc.Description, -1,
                        adapterName, sizeof(adapterName), nullptr, nullptr);
    CS_LOG(INFO, "DXGI: using adapter %d: %s", gpu_index, adapterName);

    hr = D3D11CreateDevice(
        adapter.Get(),
        D3D_DRIVER_TYPE_UNKNOWN,   // Must be UNKNOWN when specifying adapter
        nullptr,
        flags,
        featureLevels,
        _countof(featureLevels),
        D3D11_SDK_VERSION,
        device_.GetAddressOf(),
        &selectedLevel,
        context_.GetAddressOf()
    );
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: D3D11CreateDevice failed (0x%08lX)", hr);
        return false;
    }

    CS_LOG(INFO, "DXGI: D3D11 device created (feature level 0x%X)", (unsigned)selectedLevel);

    // --- Get the primary output (monitor 0) ---------------------------------
    ComPtr<IDXGIOutput> output;
    hr = adapter->EnumOutputs(0, output.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: EnumOutputs(0) failed (0x%08lX) -- no monitors?", hr);
        return false;
    }

    hr = output.As(&output1_);
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: QueryInterface for IDXGIOutput1 failed (0x%08lX)", hr);
        return false;
    }

    DXGI_OUTPUT_DESC outputDesc;
    output->GetDesc(&outputDesc);
    width_  = static_cast<uint32_t>(outputDesc.DesktopCoordinates.right -
                                     outputDesc.DesktopCoordinates.left);
    height_ = static_cast<uint32_t>(outputDesc.DesktopCoordinates.bottom -
                                     outputDesc.DesktopCoordinates.top);
    CS_LOG(INFO, "DXGI: output resolution %ux%u", width_, height_);

    // --- Create the duplication ---------------------------------------------
    if (!createDuplication()) {
        return false;
    }

    // --- Create staging texture for CPU readback ----------------------------
    D3D11_TEXTURE2D_DESC stagingDesc = {};
    stagingDesc.Width              = width_;
    stagingDesc.Height             = height_;
    stagingDesc.MipLevels          = 1;
    stagingDesc.ArraySize          = 1;
    stagingDesc.Format             = DXGI_FORMAT_B8G8R8A8_UNORM;
    stagingDesc.SampleDesc.Count   = 1;
    stagingDesc.SampleDesc.Quality = 0;
    stagingDesc.Usage              = D3D11_USAGE_STAGING;
    stagingDesc.CPUAccessFlags     = D3D11_CPU_ACCESS_READ;
    stagingDesc.BindFlags          = 0;
    stagingDesc.MiscFlags          = 0;

    hr = device_->CreateTexture2D(&stagingDesc, nullptr, staging_.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: CreateTexture2D (staging) failed (0x%08lX)", hr);
        return false;
    }

    initialized_ = true;
    CS_LOG(INFO, "DXGI: Desktop Duplication initialized (%ux%u)", width_, height_);
    return true;
}

// ---------------------------------------------------------------------------
// createDuplication -- (re)create the IDXGIOutputDuplication
// ---------------------------------------------------------------------------

bool DxgiCapture::createDuplication() {
    duplication_.Reset();

    HRESULT hr = output1_->DuplicateOutput(device_.Get(), duplication_.GetAddressOf());
    if (FAILED(hr)) {
        if (hr == DXGI_ERROR_NOT_CURRENTLY_AVAILABLE) {
            CS_LOG(ERR, "DXGI: too many duplication clients -- another app is capturing");
        } else if (hr == E_ACCESSDENIED) {
            CS_LOG(ERR, "DXGI: access denied -- running in session 0 or secure desktop?");
        } else {
            CS_LOG(ERR, "DXGI: DuplicateOutput failed (0x%08lX)", hr);
        }
        return false;
    }

    CS_LOG(DEBUG, "DXGI: DuplicateOutput succeeded");
    return true;
}

// ---------------------------------------------------------------------------
// captureFrame -- grab the latest desktop frame
// ---------------------------------------------------------------------------

bool DxgiCapture::captureFrame(CapturedFrame& frame) {
    if (!initialized_) return false;

    // If we had a mapped resource from last call, unmap it.
    if (mapped_ptr_) {
        context_->Unmap(staging_.Get(), 0);
        mapped_ptr_ = nullptr;
        mapped_pitch_ = 0;
    }

    // Acquire the next frame with a short timeout.
    ComPtr<IDXGIResource> desktopResource;
    DXGI_OUTDUPL_FRAME_INFO frameInfo = {};
    HRESULT hr = duplication_->AcquireNextFrame(100, &frameInfo, desktopResource.GetAddressOf());

    if (hr == DXGI_ERROR_WAIT_TIMEOUT) {
        // No new frame.  Report duplicate.
        frame.is_new_frame = false;
        frame.width        = width_;
        frame.height       = height_;
        frame.timestamp_us = cs::getTimestampUs();
        frame.gpu_ptr      = nullptr;
        return true;
    }

    if (hr == DXGI_ERROR_ACCESS_LOST) {
        // Desktop switch (e.g. Ctrl+Alt+Del, UAC, lock screen).
        CS_LOG(WARN, "DXGI: ACCESS_LOST -- recreating duplication");
        duplication_.Reset();
        if (!createDuplication()) {
            CS_LOG(ERR, "DXGI: failed to recreate duplication after ACCESS_LOST");
            return false;
        }
        // Try once more.
        hr = duplication_->AcquireNextFrame(100, &frameInfo, desktopResource.GetAddressOf());
        if (FAILED(hr)) {
            CS_LOG(DEBUG, "DXGI: AcquireNextFrame still failing after recreate (0x%08lX)", hr);
            return false;
        }
    } else if (FAILED(hr)) {
        CS_LOG(DEBUG, "DXGI: AcquireNextFrame failed (0x%08lX)", hr);
        return false;
    }

    // Get the acquired texture.
    ComPtr<ID3D11Texture2D> desktopTex;
    hr = desktopResource.As(&desktopTex);
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: QueryInterface for ID3D11Texture2D failed (0x%08lX)", hr);
        duplication_->ReleaseFrame();
        return false;
    }

    // Copy the desktop texture into our staging texture.
    context_->CopyResource(staging_.Get(), desktopTex.Get());

    // Release the DXGI frame as soon as we've copied it.
    duplication_->ReleaseFrame();

    // Map the staging texture for CPU read access.
    D3D11_MAPPED_SUBRESOURCE mapped = {};
    hr = context_->Map(staging_.Get(), 0, D3D11_MAP_READ, 0, &mapped);
    if (FAILED(hr)) {
        CS_LOG(ERR, "DXGI: Map staging texture failed (0x%08lX)", hr);
        return false;
    }

    mapped_ptr_   = mapped.pData;
    mapped_pitch_ = mapped.RowPitch;

    // Fill the output frame.
    frame.gpu_ptr      = mapped_ptr_;
    frame.width        = width_;
    frame.height       = height_;
    frame.pitch        = mapped_pitch_;
    frame.format       = FrameFormat::BGRA8;
    frame.timestamp_us = cs::getTimestampUs();
    frame.is_new_frame = true;

    return true;
}

// ---------------------------------------------------------------------------
// release -- tear down all D3D11 / DXGI resources
// ---------------------------------------------------------------------------

void DxgiCapture::release() {
    if (mapped_ptr_ && staging_ && context_) {
        context_->Unmap(staging_.Get(), 0);
        mapped_ptr_ = nullptr;
    }

    duplication_.Reset();
    staging_.Reset();
    output1_.Reset();
    context_.Reset();
    device_.Reset();

    width_       = 0;
    height_      = 0;
    initialized_ = false;

    CS_LOG(DEBUG, "DXGI: resources released");
}

} // namespace cs::host
