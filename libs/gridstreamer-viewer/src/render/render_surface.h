///////////////////////////////////////////////////////////////////////////////
// render_surface.h -- Shared texture handle for offscreen rendering
//
// When the viewer renders to an offscreen surface (e.g., for Electron's
// offscreen rendering mode), this structure describes the shared DXGI
// texture that can be imported into another D3D11 device or compositor.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>

#ifdef _WIN32
#include <dxgi.h>
#include <windows.h>
#endif

namespace cs {

/// Describes a shared GPU texture that can be opened by another process
/// or device via DXGI shared handle (NT handle or legacy HANDLE).
struct RenderSurface {
#ifdef _WIN32
    HANDLE      shared_handle;  // DXGI shared texture handle (IDXGIResource::GetSharedHandle)
#else
    void*       shared_handle;  // Placeholder on non-Windows platforms
#endif
    uint32_t    width;
    uint32_t    height;
    uint32_t    format;         // DXGI_FORMAT value (e.g., DXGI_FORMAT_B8G8R8A8_UNORM = 87)

    RenderSurface()
        : shared_handle(nullptr)
        , width(0)
        , height(0)
        , format(0)
    {}
};

} // namespace cs
