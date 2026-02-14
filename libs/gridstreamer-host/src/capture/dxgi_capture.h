///////////////////////////////////////////////////////////////////////////////
// dxgi_capture.h -- DXGI Desktop Duplication capture backend
//
// Uses the Windows Desktop Duplication API (IDXGIOutputDuplication) to
// capture the desktop.  This works on any Windows 8+ system with a D3D11
// capable GPU.  It's the universal fallback when NvFBC is not available.
//
// The captured frame is a D3D11 staging texture mapped into system memory.
// Output format is always BGRA8.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "capture_interface.h"

#ifndef WIN32_LEAN_AND_MEAN
#  define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>   // Microsoft::WRL::ComPtr

namespace cs::host {

using Microsoft::WRL::ComPtr;

class DxgiCapture : public ICaptureDevice {
public:
    DxgiCapture();
    ~DxgiCapture() override;

    bool initialize(int gpu_index = 0) override;
    bool captureFrame(CapturedFrame& frame) override;
    void release() override;
    std::string getName() const override { return "DXGI"; }

private:
    /// (Re-)create the duplication object.  Called on init and after
    /// DXGI_ERROR_ACCESS_LOST (desktop switch, UAC, lock screen, etc.).
    bool createDuplication();

    ComPtr<ID3D11Device>            device_;
    ComPtr<ID3D11DeviceContext>     context_;
    ComPtr<IDXGIOutputDuplication>  duplication_;
    ComPtr<IDXGIOutput1>           output1_;

    /// Staging texture used to copy GPU frames to CPU-readable memory.
    ComPtr<ID3D11Texture2D>         staging_;
    uint32_t                        width_   = 0;
    uint32_t                        height_  = 0;
    bool                            initialized_ = false;

    /// Pointer to the mapped staging texture data (valid between capture calls).
    void*                           mapped_ptr_  = nullptr;
    uint32_t                        mapped_pitch_ = 0;
};

} // namespace cs::host
