///////////////////////////////////////////////////////////////////////////////
// metal_renderer.h -- macOS Metal video renderer
//
// Presents decoded video frames (CVPixelBuffer NV12 from VideoToolbox) to
// a CAMetalLayer attached to an NSView. Uses a compute shader for NV12-to-
// BGRA conversion and CVMetalTextureCache for zero-copy from VideoToolbox.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "renderer_interface.h"

#include <cstdint>
#include <mutex>

#ifdef __APPLE__
// Forward declarations to avoid including Metal headers in the header
#ifdef __OBJC__
@protocol MTLDevice;
@protocol MTLCommandQueue;
@protocol MTLComputePipelineState;
@class CAMetalLayer;
#else
typedef void* id;
#endif

#include <CoreVideo/CoreVideo.h>
#endif

namespace cs {

class MetalRenderer : public IRenderer {
public:
    MetalRenderer();
    ~MetalRenderer() override;

    // Non-copyable
    MetalRenderer(const MetalRenderer&) = delete;
    MetalRenderer& operator=(const MetalRenderer&) = delete;

    bool initialize(void* window_handle, uint32_t width, uint32_t height) override;
    double renderFrame(const DecodedFrame& frame) override;
    bool resize(uint32_t width, uint32_t height) override;
    void release() override;
    double getLastRenderTimeMs() const override;

private:
#ifdef __APPLE__
    // Opaque pointers to Objective-C objects (stored as void* for C++ header)
    void* device_         = nullptr;  // id<MTLDevice>
    void* command_queue_  = nullptr;  // id<MTLCommandQueue>
    void* pipeline_       = nullptr;  // id<MTLComputePipelineState>
    void* metal_layer_    = nullptr;  // CAMetalLayer*
    void* texture_cache_  = nullptr;  // CVMetalTextureCacheRef
#endif

    uint32_t width_       = 0;
    uint32_t height_      = 0;
    bool     initialized_ = false;
    double   last_render_time_ms_ = 0.0;

    mutable std::mutex mutex_;
};

} // namespace cs
