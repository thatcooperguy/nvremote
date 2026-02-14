///////////////////////////////////////////////////////////////////////////////
// renderer_interface.h -- Abstract renderer interface
//
// Provides the common base for all renderer implementations (D3D11, Metal,
// OpenGL/Vulkan). Each renderer takes decoded frames and presents them
// to a platform-native window surface.
//
// Platform-specific initialization (device sharing with decoders, shared
// surfaces for offscreen rendering) is handled by concrete subclasses.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "../decode/decoder_interface.h"

#include <cstdint>

namespace cs {

class IRenderer {
public:
    virtual ~IRenderer() = default;

    /// Initialize the renderer with a platform window handle and initial size.
    /// On Windows, window_handle is an HWND. On macOS, it is an NSView*.
    virtual bool initialize(void* window_handle, uint32_t width, uint32_t height) = 0;

    /// Render a decoded frame to the window surface.
    /// Returns the time spent rendering in milliseconds.
    virtual double renderFrame(const DecodedFrame& frame) = 0;

    /// Handle window resize.
    virtual bool resize(uint32_t width, uint32_t height) = 0;

    /// Release all GPU resources. Safe to call multiple times.
    virtual void release() = 0;

    /// Get the last render time in milliseconds.
    virtual double getLastRenderTimeMs() const = 0;
};

} // namespace cs
