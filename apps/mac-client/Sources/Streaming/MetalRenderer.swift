// MetalRenderer.swift — Metal-based video rendering
// NVRemote macOS Client
//
// Renders decoded CVPixelBuffers (NV12 IOSurface-backed) to screen via Metal.
// Performs NV12 -> RGB conversion in a fragment shader and presents frames
// with minimal latency using CAMetalLayer.

import Foundation
import Metal
import MetalKit
import CoreVideo
import IOSurface

/// Metal-based renderer that displays decoded video frames in an MTKView.
/// Uses zero-copy IOSurface-backed CVPixelBuffers for NV12 -> RGB conversion.
final class MetalRenderer: NSObject, MTKViewDelegate, @unchecked Sendable {

    // MARK: - Properties

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState
    private var textureCache: CVMetalTextureCache?
    private let lock = NSLock()

    /// The current frame's pixel buffer waiting to be rendered.
    private var currentPixelBuffer: CVPixelBuffer?

    /// The MTKView this renderer draws into.
    weak var view: MTKView?

    /// Statistics
    private(set) var framesRendered: UInt64 = 0
    private(set) var lastRenderTimeMs: Double = 0.0

    // MARK: - Shader Source

    /// Metal shader for NV12 (Y + CbCr biplanar) to RGB conversion.
    private static let shaderSource = """
    #include <metal_stdlib>
    using namespace metal;

    struct VertexOut {
        float4 position [[position]];
        float2 texCoord;
    };

    // Full-screen quad vertices
    constant float2 quadVertices[] = {
        float2(-1, -1),
        float2( 1, -1),
        float2(-1,  1),
        float2( 1, -1),
        float2( 1,  1),
        float2(-1,  1),
    };

    constant float2 quadTexCoords[] = {
        float2(0, 1),
        float2(1, 1),
        float2(0, 0),
        float2(1, 1),
        float2(1, 0),
        float2(0, 0),
    };

    vertex VertexOut vertexShader(uint vertexID [[vertex_id]]) {
        VertexOut out;
        out.position = float4(quadVertices[vertexID], 0, 1);
        out.texCoord = quadTexCoords[vertexID];
        return out;
    }

    // BT.709 color matrix for NV12 -> RGB conversion
    constant float3x3 colorMatrix = float3x3(
        float3(1.164,  1.164, 1.164),
        float3(0.0,   -0.213, 2.112),
        float3(1.793, -0.533, 0.0)
    );

    fragment float4 fragmentShader(
        VertexOut in [[stage_in]],
        texture2d<float> textureY  [[texture(0)]],
        texture2d<float> textureCbCr [[texture(1)]]
    ) {
        constexpr sampler s(mag_filter::linear, min_filter::linear);

        float y = textureY.sample(s, in.texCoord).r;
        float2 cbcr = textureCbCr.sample(s, in.texCoord).rg;

        // Offset Y and CbCr for BT.709
        float3 ycbcr = float3(y - 16.0/255.0, cbcr.x - 0.5, cbcr.y - 0.5);
        float3 rgb = colorMatrix * ycbcr;

        return float4(saturate(rgb), 1.0);
    }
    """

    // MARK: - Initialization

    /// Create a Metal renderer using the specified device.
    /// Returns nil if the device doesn't support the required features.
    init?(device: MTLDevice? = MTLCreateSystemDefaultDevice()) {
        guard let device else {
            print("[MetalRenderer] No Metal device available.")
            return nil
        }
        self.device = device

        guard let queue = device.makeCommandQueue() else {
            print("[MetalRenderer] Failed to create command queue.")
            return nil
        }
        self.commandQueue = queue

        // Create texture cache for CVPixelBuffer -> MTLTexture conversion
        var cache: CVMetalTextureCache?
        let cacheStatus = CVMetalTextureCacheCreate(
            kCFAllocatorDefault,
            nil,
            device,
            nil,
            &cache
        )
        guard cacheStatus == kCVReturnSuccess, let textureCache = cache else {
            print("[MetalRenderer] Failed to create texture cache: \(cacheStatus)")
            return nil
        }
        self.textureCache = textureCache

        // Compile shaders and create pipeline
        do {
            let library = try device.makeLibrary(source: Self.shaderSource, options: nil)
            guard let vertexFunc = library.makeFunction(name: "vertexShader"),
                  let fragmentFunc = library.makeFunction(name: "fragmentShader")
            else {
                print("[MetalRenderer] Failed to find shader functions.")
                return nil
            }

            let pipelineDesc = MTLRenderPipelineDescriptor()
            pipelineDesc.vertexFunction = vertexFunc
            pipelineDesc.fragmentFunction = fragmentFunc
            pipelineDesc.colorAttachments[0].pixelFormat = .bgra8Unorm

            self.pipelineState = try device.makeRenderPipelineState(descriptor: pipelineDesc)
        } catch {
            print("[MetalRenderer] Pipeline creation failed: \(error)")
            return nil
        }

        super.init()
    }

    // MARK: - Configuration

    /// Configure an MTKView for low-latency rendering.
    func configure(view: MTKView) {
        self.view = view
        view.device = device
        view.delegate = self
        view.colorPixelFormat = .bgra8Unorm
        view.framebufferOnly = true
        view.isPaused = false
        view.enableSetNeedsDisplay = false

        // Low latency: disable vsync by using presentsWithTransaction
        // and setting preferredFramesPerSecond to the maximum
        view.preferredFramesPerSecond = 240

        // Use a CAMetalLayer for direct control
        if let metalLayer = view.layer as? CAMetalLayer {
            metalLayer.displaySyncEnabled = false  // VSync off for lowest latency
            metalLayer.framebufferOnly = true
            metalLayer.presentsWithTransaction = false
            metalLayer.pixelFormat = .bgra8Unorm
            metalLayer.wantsExtendedDynamicRangeContent = false
        }
    }

    // MARK: - Frame Submission

    /// Submit a decoded pixel buffer for rendering. The buffer will be displayed
    /// on the next draw call. Thread-safe.
    func enqueueFrame(_ pixelBuffer: CVPixelBuffer) {
        lock.lock()
        currentPixelBuffer = pixelBuffer
        lock.unlock()
    }

    // MARK: - MTKViewDelegate

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        // No-op: we render the full frame regardless of view size
    }

    func draw(in view: MTKView) {
        let startTime = CACurrentMediaTime()

        // Grab the latest pixel buffer
        lock.lock()
        let pixelBuffer = currentPixelBuffer
        lock.unlock()

        guard let pixelBuffer else { return }
        guard let drawable = view.currentDrawable else { return }
        guard let commandBuffer = commandQueue.makeCommandBuffer() else { return }
        guard let renderPassDesc = view.currentRenderPassDescriptor else { return }

        // Create Metal textures from CVPixelBuffer planes (zero-copy via IOSurface)
        guard let textureY = createTexture(from: pixelBuffer, plane: 0, format: .r8Unorm),
              let textureCbCr = createTexture(from: pixelBuffer, plane: 1, format: .rg8Unorm)
        else { return }

        // Encode the render pass
        guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: renderPassDesc) else { return }

        encoder.setRenderPipelineState(pipelineState)
        encoder.setFragmentTexture(textureY, index: 0)
        encoder.setFragmentTexture(textureCbCr, index: 1)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        encoder.endEncoding()

        commandBuffer.present(drawable)
        commandBuffer.commit()

        let elapsed = (CACurrentMediaTime() - startTime) * 1000.0
        lock.lock()
        lastRenderTimeMs = elapsed
        framesRendered += 1
        lock.unlock()
    }

    // MARK: - Texture Creation

    /// Create an MTLTexture from a plane of a CVPixelBuffer using the texture cache.
    /// This is zero-copy when the pixel buffer is IOSurface-backed.
    private func createTexture(
        from pixelBuffer: CVPixelBuffer,
        plane: Int,
        format: MTLPixelFormat
    ) -> MTLTexture? {
        guard let cache = textureCache else { return nil }

        let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, plane)
        let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, plane)

        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault,
            cache,
            pixelBuffer,
            nil,
            format,
            width,
            height,
            plane,
            &cvTexture
        )

        guard status == kCVReturnSuccess, let cvTex = cvTexture else {
            return nil
        }

        return CVMetalTextureGetTexture(cvTex)
    }

    // MARK: - Cleanup

    /// Flush the texture cache to release any cached textures.
    func flushTextureCache() {
        if let cache = textureCache {
            CVMetalTextureCacheFlush(cache, 0)
        }
    }
}
