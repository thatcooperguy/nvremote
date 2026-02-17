///////////////////////////////////////////////////////////////////////////////
// metal_renderer.mm -- macOS Metal video renderer implementation
//
// Creates a Metal device, command queue, and CAMetalLayer. Renders NV12
// CVPixelBuffers from VideoToolbox using a compute shader for NV12→BGRA
// conversion. Uses CVMetalTextureCache for zero-copy texture import.
///////////////////////////////////////////////////////////////////////////////

#include "metal_renderer.h"

#include <cs/common.h>

#ifdef __APPLE__
#import <Metal/Metal.h>
#import <MetalKit/MetalKit.h>
#import <QuartzCore/CAMetalLayer.h>
#import <CoreVideo/CVMetalTextureCache.h>
#import <Cocoa/Cocoa.h>

#include <chrono>

// ---------------------------------------------------------------------------
// Embedded Metal shader source: NV12 → BGRA compute kernel
// ---------------------------------------------------------------------------
static NSString* const kNV12ToBGRAShader = @R"(
#include <metal_stdlib>
using namespace metal;

kernel void nv12_to_bgra(
    texture2d<float, access::read>  lumaTexture   [[texture(0)]],
    texture2d<float, access::read>  chromaTexture  [[texture(1)]],
    texture2d<float, access::write> outTexture     [[texture(2)]],
    uint2 gid [[thread_position_in_grid]])
{
    if (gid.x >= outTexture.get_width() || gid.y >= outTexture.get_height()) return;

    float y  = lumaTexture.read(gid).r;
    float2 uv = chromaTexture.read(gid / 2).rg;
    float cb = uv.x - 0.5;
    float cr = uv.y - 0.5;

    // BT.709 YCbCr -> RGB
    float r = y + 1.5748 * cr;
    float g = y - 0.1873 * cb - 0.4681 * cr;
    float b = y + 1.8556 * cb;

    outTexture.write(float4(b, g, r, 1.0), gid);  // BGRA
}
)";
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

MetalRenderer::MetalRenderer() = default;

MetalRenderer::~MetalRenderer() {
    release();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool MetalRenderer::initialize(void* window_handle, uint32_t width, uint32_t height) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        release();
    }

    width_  = width;
    height_ = height;

    NSView* view = (__bridge NSView*)window_handle;
    if (!view) {
        CS_LOG(ERR, "Metal: null NSView");
        return false;
    }

    // Create Metal device (default GPU)
    id<MTLDevice> device = MTLCreateSystemDefaultDevice();
    if (!device) {
        CS_LOG(ERR, "Metal: MTLCreateSystemDefaultDevice failed");
        return false;
    }
    device_ = (__bridge_retained void*)device;

    // Create command queue
    id<MTLCommandQueue> queue = [device newCommandQueue];
    if (!queue) {
        CS_LOG(ERR, "Metal: failed to create command queue");
        release();
        return false;
    }
    command_queue_ = (__bridge_retained void*)queue;

    // Create CAMetalLayer and attach to view
    CAMetalLayer* layer = [CAMetalLayer layer];
    layer.device = device;
    layer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    layer.framebufferOnly = NO;  // Need write access for compute
    layer.drawableSize = CGSizeMake(width, height);
    layer.displaySyncEnabled = NO;  // Low latency, no vsync

    [view setWantsLayer:YES];
    [view setLayer:layer];
    metal_layer_ = (__bridge_retained void*)layer;

    // Create CVMetalTextureCache for zero-copy VideoToolbox import
    CVMetalTextureCacheRef cache = nullptr;
    CVReturn cvret = CVMetalTextureCacheCreate(
        kCFAllocatorDefault, nullptr, device, nullptr, &cache);
    if (cvret != kCVReturnSuccess || !cache) {
        CS_LOG(ERR, "Metal: CVMetalTextureCacheCreate failed: %d", cvret);
        release();
        return false;
    }
    texture_cache_ = cache;

    // Compile compute shader
    NSError* error = nil;
    id<MTLLibrary> library = [device newLibraryWithSource:kNV12ToBGRAShader
                                                  options:nil
                                                    error:&error];
    if (!library) {
        CS_LOG(ERR, "Metal: shader compilation failed: %s",
               error ? [[error localizedDescription] UTF8String] : "unknown");
        release();
        return false;
    }

    id<MTLFunction> kernelFunc = [library newFunctionWithName:@"nv12_to_bgra"];
    if (!kernelFunc) {
        CS_LOG(ERR, "Metal: kernel function not found");
        release();
        return false;
    }

    id<MTLComputePipelineState> pso = [device newComputePipelineStateWithFunction:kernelFunc
                                                                           error:&error];
    if (!pso) {
        CS_LOG(ERR, "Metal: pipeline creation failed: %s",
               error ? [[error localizedDescription] UTF8String] : "unknown");
        release();
        return false;
    }
    pipeline_ = (__bridge_retained void*)pso;

    initialized_ = true;
    CS_LOG(INFO, "Metal renderer initialized: %ux%u", width, height);
    return true;
#else
    (void)window_handle; (void)width; (void)height;
    return false;
#endif
}

// ---------------------------------------------------------------------------
// renderFrame
// ---------------------------------------------------------------------------

double MetalRenderer::renderFrame(const DecodedFrame& frame) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_ || !frame.texture) return 0.0;

    auto start = std::chrono::steady_clock::now();

    CVPixelBufferRef pixel_buffer = static_cast<CVPixelBufferRef>(frame.texture);
    CVMetalTextureCacheRef cache = static_cast<CVMetalTextureCacheRef>(texture_cache_);
    id<MTLDevice> device = (__bridge id<MTLDevice>)device_;
    id<MTLCommandQueue> queue = (__bridge id<MTLCommandQueue>)command_queue_;
    id<MTLComputePipelineState> pso = (__bridge id<MTLComputePipelineState>)pipeline_;
    CAMetalLayer* layer = (__bridge CAMetalLayer*)metal_layer_;

    size_t frameWidth  = CVPixelBufferGetWidth(pixel_buffer);
    size_t frameHeight = CVPixelBufferGetHeight(pixel_buffer);

    // Create Metal textures from the CVPixelBuffer planes (zero-copy)
    // Plane 0: Y (luma), 8-bit single channel
    CVMetalTextureRef lumaTextureRef = nullptr;
    CVReturn ret = CVMetalTextureCacheCreateTextureFromImage(
        kCFAllocatorDefault, cache, pixel_buffer, nullptr,
        MTLPixelFormatR8Unorm,
        frameWidth, frameHeight, 0, &lumaTextureRef);

    if (ret != kCVReturnSuccess || !lumaTextureRef) {
        CS_LOG(WARN, "Metal: failed to create luma texture: %d", ret);
        CVPixelBufferRelease(pixel_buffer);
        return 0.0;
    }

    // Plane 1: CbCr (chroma), 8-bit two-channel
    CVMetalTextureRef chromaTextureRef = nullptr;
    ret = CVMetalTextureCacheCreateTextureFromImage(
        kCFAllocatorDefault, cache, pixel_buffer, nullptr,
        MTLPixelFormatRG8Unorm,
        frameWidth / 2, frameHeight / 2, 1, &chromaTextureRef);

    if (ret != kCVReturnSuccess || !chromaTextureRef) {
        CS_LOG(WARN, "Metal: failed to create chroma texture: %d", ret);
        CFRelease(lumaTextureRef);
        CVPixelBufferRelease(pixel_buffer);
        return 0.0;
    }

    id<MTLTexture> lumaTex   = CVMetalTextureGetTexture(lumaTextureRef);
    id<MTLTexture> chromaTex = CVMetalTextureGetTexture(chromaTextureRef);

    // Get drawable from the layer
    id<CAMetalDrawable> drawable = [layer nextDrawable];
    if (!drawable) {
        CS_LOG(WARN, "Metal: no drawable available");
        CFRelease(lumaTextureRef);
        CFRelease(chromaTextureRef);
        CVPixelBufferRelease(pixel_buffer);
        return 0.0;
    }

    // Create command buffer and compute encoder
    id<MTLCommandBuffer> cmdBuf = [queue commandBuffer];
    id<MTLComputeCommandEncoder> encoder = [cmdBuf computeCommandEncoder];

    [encoder setComputePipelineState:pso];
    [encoder setTexture:lumaTex   atIndex:0];
    [encoder setTexture:chromaTex atIndex:1];
    [encoder setTexture:drawable.texture atIndex:2];

    // Dispatch threads
    MTLSize threadsPerGroup = MTLSizeMake(16, 16, 1);
    MTLSize threadgroups = MTLSizeMake(
        (frameWidth  + 15) / 16,
        (frameHeight + 15) / 16,
        1);
    [encoder dispatchThreadgroups:threadgroups threadsPerThreadgroup:threadsPerGroup];
    [encoder endEncoding];

    [cmdBuf presentDrawable:drawable];
    [cmdBuf commit];
    [cmdBuf waitUntilCompleted];

    // Cleanup
    CFRelease(lumaTextureRef);
    CFRelease(chromaTextureRef);
    CVPixelBufferRelease(pixel_buffer);

    // Flush texture cache periodically
    CVMetalTextureCacheFlush(cache, 0);

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

bool MetalRenderer::resize(uint32_t width, uint32_t height) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_) return false;

    width_  = width;
    height_ = height;

    CAMetalLayer* layer = (__bridge CAMetalLayer*)metal_layer_;
    layer.drawableSize = CGSizeMake(width, height);

    CS_LOG(INFO, "Metal renderer resized: %ux%u", width, height);
    return true;
#else
    (void)width; (void)height;
    return false;
#endif
}

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

void MetalRenderer::release() {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);

    if (texture_cache_) {
        CFRelease(static_cast<CVMetalTextureCacheRef>(texture_cache_));
        texture_cache_ = nullptr;
    }

    if (pipeline_) {
        CFRelease(pipeline_);
        pipeline_ = nullptr;
    }

    if (metal_layer_) {
        CFRelease(metal_layer_);
        metal_layer_ = nullptr;
    }

    if (command_queue_) {
        CFRelease(command_queue_);
        command_queue_ = nullptr;
    }

    if (device_) {
        CFRelease(device_);
        device_ = nullptr;
    }

    initialized_ = false;
    CS_LOG(INFO, "Metal renderer released");
#endif
}

// ---------------------------------------------------------------------------
// getLastRenderTimeMs
// ---------------------------------------------------------------------------

double MetalRenderer::getLastRenderTimeMs() const {
    return last_render_time_ms_;
}

} // namespace cs
