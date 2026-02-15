// VideoDecoder.swift — VideoToolbox hardware H.264/H.265 decode
// NVRemote macOS Client
//
// Uses VTDecompressionSession for hardware-accelerated video decoding.
// Outputs IOSurface-backed CVPixelBuffers for zero-copy handoff to Metal.
// Supports both H.264 (AVC) and H.265 (HEVC) codecs.

import Foundation
import VideoToolbox
import CoreMedia
import CoreVideo

/// Callback type for decoded frames.
typealias DecodedFrameHandler = @Sendable (CVPixelBuffer, CMTime) -> Void

/// Hardware-accelerated video decoder using VideoToolbox.
/// Decodes H.264/H.265 NAL unit streams into IOSurface-backed CVPixelBuffers
/// for zero-copy rendering via Metal.
final class VideoDecoder: @unchecked Sendable {

    // MARK: - Types

    enum DecoderError: Error, LocalizedError {
        case unsupportedCodec
        case formatDescriptionFailed
        case sessionCreationFailed(OSStatus)
        case decodeFailed(OSStatus)
        case noParameterSets

        var errorDescription: String? {
            switch self {
            case .unsupportedCodec: return "Unsupported video codec."
            case .formatDescriptionFailed: return "Failed to create format description from parameter sets."
            case .sessionCreationFailed(let s): return "VTDecompressionSession creation failed: \(s)"
            case .decodeFailed(let s): return "Decode failed: \(s)"
            case .noParameterSets: return "No SPS/PPS parameter sets found."
            }
        }
    }

    // MARK: - Properties

    private var decompressionSession: VTDecompressionSession?
    private var formatDescription: CMVideoFormatDescription?
    private var codec: CodecType
    private let lock = NSLock()

    /// Called on each decoded frame (on the decoder's callback queue).
    var onDecodedFrame: DecodedFrameHandler?

    /// Whether the decoder has been initialized with parameter sets.
    private(set) var isInitialized = false

    /// Stored H.264 SPS and PPS (or H.265 VPS/SPS/PPS) for session creation.
    private var sps: Data?
    private var pps: Data?
    private var vps: Data?  // H.265 only

    /// Statistics
    private(set) var framesDecoded: UInt64 = 0
    private(set) var lastDecodeTimeMs: Double = 0.0

    // MARK: - Initialization

    /// Create a video decoder for the specified codec.
    init(codec: CodecType) {
        self.codec = codec
    }

    deinit {
        teardown()
    }

    // MARK: - Public API

    /// Feed a complete frame's NAL unit data into the decoder.
    /// The data should contain one or more NAL units (with 4-byte length prefixes
    /// or Annex-B start codes). This method extracts parameter sets on keyframes,
    /// creates the decompression session if needed, and submits the frame for decode.
    ///
    /// - Parameters:
    ///   - nalData: The raw NAL unit data for a single frame.
    ///   - timestamp: The presentation timestamp in microseconds.
    ///   - isKeyframe: Whether this frame is an IDR/keyframe.
    func decode(nalData: Data, timestamp: UInt32, isKeyframe: Bool) throws {
        let startTime = CACurrentMediaTime()

        // Parse NAL units
        let nalUnits = parseNALUnits(from: nalData)

        if isKeyframe {
            // Extract parameter sets from keyframe
            extractParameterSets(from: nalUnits)

            // (Re)create session if we have new parameter sets
            if needsSessionRecreation() {
                try createDecompressionSession()
            }
        }

        guard isInitialized, let session = decompressionSession, let formatDesc = formatDescription else {
            if isKeyframe {
                throw DecoderError.noParameterSets
            }
            // Skip non-keyframes before session is initialized
            return
        }

        // Filter out parameter set NALUs (already handled), keep VCL NALUs
        let vclUnits = nalUnits.filter { !isParameterSetNALU($0) }
        guard !vclUnits.isEmpty else { return }

        // Build the sample buffer from VCL NAL units
        let sampleBuffer = try createSampleBuffer(
            from: vclUnits,
            formatDescription: formatDesc,
            timestamp: timestamp
        )

        // Submit for decode
        let flags: VTDecodeFrameFlags = [._EnableAsynchronousDecompression, ._EnableTemporalProcessing]
        var infoFlags: VTDecodeInfoFlags = []

        let status = VTDecompressionSessionDecodeFrame(
            session,
            sampleBuffer: sampleBuffer,
            flags: flags,
            infoFlags: &infoFlags
        )

        if status != noErr {
            throw DecoderError.decodeFailed(status)
        }

        let elapsed = (CACurrentMediaTime() - startTime) * 1000.0
        lock.lock()
        lastDecodeTimeMs = elapsed
        framesDecoded += 1
        lock.unlock()
    }

    /// Flush any pending frames from the decoder.
    func flush() {
        guard let session = decompressionSession else { return }
        VTDecompressionSessionFinishDelayedFrames(session)
        VTDecompressionSessionWaitForAsynchronousFrames(session)
    }

    /// Tear down the decompression session and release resources.
    func teardown() {
        if let session = decompressionSession {
            VTDecompressionSessionInvalidate(session)
            decompressionSession = nil
        }
        formatDescription = nil
        isInitialized = false
        sps = nil
        pps = nil
        vps = nil
    }

    // MARK: - Session Creation

    /// Create (or recreate) the VTDecompressionSession from stored parameter sets.
    private func createDecompressionSession() throws {
        // Tear down existing session
        if let existing = decompressionSession {
            VTDecompressionSessionInvalidate(existing)
            decompressionSession = nil
        }

        // Build format description from parameter sets
        let formatDesc = try createFormatDescription()
        self.formatDescription = formatDesc

        // Destination pixel buffer attributes — IOSurface-backed for zero-copy Metal
        let destAttrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ]

        // Decoder specification — prefer hardware decoder, low-latency mode
        let decoderSpec: [String: Any] = [
            kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder as String: true,
            kVTVideoDecoderSpecification_RequireHardwareAcceleratedVideoDecoder as String: false,
        ]

        // Output callback
        var callbackRecord = VTDecompressionOutputCallbackRecord(
            decompressionOutputCallback: decompressionCallback,
            decompressionOutputRefCon: Unmanaged.passUnretained(self).toOpaque()
        )

        var session: VTDecompressionSession?
        let status = VTDecompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            formatDescription: formatDesc,
            decoderSpecification: decoderSpec as CFDictionary,
            imageBufferAttributes: destAttrs as CFDictionary,
            outputCallback: &callbackRecord,
            decompressionSessionOut: &session
        )

        guard status == noErr, let session else {
            throw DecoderError.sessionCreationFailed(status)
        }

        // Enable low-latency mode
        VTSessionSetProperty(session, key: kVTDecompressionPropertyKey_RealTime, value: kCFBooleanTrue)

        self.decompressionSession = session
        self.isInitialized = true
    }

    /// Create a CMVideoFormatDescription from the stored SPS/PPS (and VPS for HEVC).
    private func createFormatDescription() throws -> CMVideoFormatDescription {
        var formatDesc: CMVideoFormatDescription?
        var status: OSStatus

        switch codec {
        case .h264:
            guard let sps, let pps else { throw DecoderError.noParameterSets }
            let paramSets: [Data] = [sps, pps]
            status = paramSets.withContiguousStorageIfAvailable { _ in
                sps.withUnsafeBytes { spsPtr in
                    pps.withUnsafeBytes { ppsPtr in
                        let pointers = [spsPtr.baseAddress!, ppsPtr.baseAddress!]
                        let sizes = [sps.count, pps.count]
                        return pointers.withUnsafeBufferPointer { ptrsBuffer in
                            sizes.withUnsafeBufferPointer { sizesBuffer in
                                CMVideoFormatDescriptionCreateFromH264ParameterSets(
                                    allocator: kCFAllocatorDefault,
                                    parameterSetCount: 2,
                                    parameterSetPointers: ptrsBuffer.baseAddress!,
                                    parameterSetSizes: sizesBuffer.baseAddress!,
                                    nalUnitHeaderLength: 4,
                                    formatDescriptionOut: &formatDesc
                                )
                            }
                        }
                    }
                }
            } ?? errSecParam

        case .h265:
            guard let vps, let sps, let pps else { throw DecoderError.noParameterSets }
            status = vps.withUnsafeBytes { vpsPtr in
                sps.withUnsafeBytes { spsPtr in
                    pps.withUnsafeBytes { ppsPtr in
                        let pointers = [vpsPtr.baseAddress!, spsPtr.baseAddress!, ppsPtr.baseAddress!]
                        let sizes = [vps.count, sps.count, pps.count]
                        return pointers.withUnsafeBufferPointer { ptrsBuffer in
                            sizes.withUnsafeBufferPointer { sizesBuffer in
                                CMVideoFormatDescriptionCreateFromHEVCParameterSets(
                                    allocator: kCFAllocatorDefault,
                                    parameterSetCount: 3,
                                    parameterSetPointers: ptrsBuffer.baseAddress!,
                                    parameterSetSizes: sizesBuffer.baseAddress!,
                                    nalUnitHeaderLength: 4,
                                    extensions: nil,
                                    formatDescriptionOut: &formatDesc
                                )
                            }
                        }
                    }
                }
            }

        case .av1:
            throw DecoderError.unsupportedCodec
        }

        guard status == noErr, let desc = formatDesc else {
            throw DecoderError.formatDescriptionFailed
        }

        return desc
    }

    // MARK: - NAL Unit Parsing

    /// Parse NAL units from a buffer. Supports both Annex-B (start code) and
    /// AVCC/HVCC (4-byte length prefix) formats.
    private func parseNALUnits(from data: Data) -> [Data] {
        var units: [Data] = []

        // Try length-prefixed format first (most common in streaming)
        var offset = 0
        while offset + 4 <= data.count {
            let length = data.withUnsafeBytes { ptr -> UInt32 in
                UInt32(bigEndian: ptr.load(fromByteOffset: offset, as: UInt32.self))
            }

            let nalStart = offset + 4
            let nalEnd = nalStart + Int(length)

            if nalEnd <= data.count && length > 0 && length < 10_000_000 {
                units.append(data[nalStart..<nalEnd])
                offset = nalEnd
            } else {
                // Fall back to Annex-B parsing
                return parseAnnexBNALUnits(from: data)
            }
        }

        if units.isEmpty {
            return parseAnnexBNALUnits(from: data)
        }

        return units
    }

    /// Parse NAL units from Annex-B format (0x00000001 or 0x000001 start codes).
    private func parseAnnexBNALUnits(from data: Data) -> [Data] {
        var units: [Data] = []
        var startPositions: [Int] = []

        data.withUnsafeBytes { ptr in
            let bytes = ptr.bindMemory(to: UInt8.self)
            var i = 0
            while i < bytes.count - 3 {
                if bytes[i] == 0 && bytes[i + 1] == 0 {
                    if bytes[i + 2] == 1 {
                        startPositions.append(i + 3)
                        i += 3
                        continue
                    } else if i < bytes.count - 4 && bytes[i + 2] == 0 && bytes[i + 3] == 1 {
                        startPositions.append(i + 4)
                        i += 4
                        continue
                    }
                }
                i += 1
            }
        }

        for (index, start) in startPositions.enumerated() {
            let end = index + 1 < startPositions.count
                ? findStartCodeBefore(startPositions[index + 1], in: data)
                : data.count
            if end > start {
                units.append(data[start..<end])
            }
        }

        return units
    }

    private func findStartCodeBefore(_ pos: Int, in data: Data) -> Int {
        // Walk backwards to find the beginning of the start code
        var p = pos - 1
        while p > 0 && data[p - 1] == 0 {
            p -= 1
        }
        return p
    }

    /// Check if a NAL unit is a parameter set (SPS/PPS/VPS).
    private func isParameterSetNALU(_ data: Data) -> Bool {
        guard !data.isEmpty else { return false }
        let naluType: UInt8

        switch codec {
        case .h264:
            naluType = data[data.startIndex] & 0x1F
            return naluType == 7 || naluType == 8  // SPS=7, PPS=8

        case .h265:
            naluType = (data[data.startIndex] >> 1) & 0x3F
            return naluType == 32 || naluType == 33 || naluType == 34  // VPS=32, SPS=33, PPS=34

        case .av1:
            return false
        }
    }

    /// Extract SPS/PPS (and VPS for HEVC) from a set of NAL units.
    private func extractParameterSets(from nalUnits: [Data]) {
        for unit in nalUnits {
            guard !unit.isEmpty else { continue }

            switch codec {
            case .h264:
                let naluType = unit[unit.startIndex] & 0x1F
                if naluType == 7 { sps = unit }
                else if naluType == 8 { pps = unit }

            case .h265:
                let naluType = (unit[unit.startIndex] >> 1) & 0x3F
                if naluType == 32 { vps = unit }
                else if naluType == 33 { sps = unit }
                else if naluType == 34 { pps = unit }

            case .av1:
                break
            }
        }
    }

    /// Check if we need to recreate the session (new parameter sets differ from current).
    private func needsSessionRecreation() -> Bool {
        if !isInitialized { return true }
        // For simplicity, recreate on every keyframe with parameter sets.
        // A production implementation would compare the new sets to the old ones.
        return sps != nil && pps != nil
    }

    // MARK: - Sample Buffer Creation

    /// Create a CMSampleBuffer from VCL NAL units with AVCC/HVCC length-prefixed format.
    private func createSampleBuffer(
        from nalUnits: [Data],
        formatDescription: CMVideoFormatDescription,
        timestamp: UInt32
    ) throws -> CMSampleBuffer {
        // Build a single buffer with 4-byte length prefixes
        var blockData = Data()
        for unit in nalUnits {
            var length = UInt32(unit.count).bigEndian
            blockData.append(Data(bytes: &length, count: 4))
            blockData.append(unit)
        }

        // Create CMBlockBuffer
        var blockBuffer: CMBlockBuffer?
        var status = blockData.withUnsafeBytes { rawPtr in
            let ptr = rawPtr.baseAddress!
            return CMBlockBufferCreateWithMemoryBlock(
                allocator: kCFAllocatorDefault,
                memoryBlock: UnsafeMutableRawPointer(mutating: ptr),
                blockLength: blockData.count,
                blockAllocator: kCFAllocatorNull,
                customBlockSource: nil,
                offsetToData: 0,
                dataLength: blockData.count,
                flags: 0,
                blockBufferOut: &blockBuffer
            )
        }

        // Need to copy the data since we're using kCFAllocatorNull
        if status == noErr, let srcBlock = blockBuffer {
            var copiedBlock: CMBlockBuffer?
            status = CMBlockBufferCreateContiguous(
                allocator: kCFAllocatorDefault,
                sourceBuffer: srcBlock,
                blockAllocator: kCFAllocatorDefault,
                customBlockSource: nil,
                offsetToData: 0,
                dataLength: blockData.count,
                flags: 0,
                blockBufferOut: &copiedBlock
            )
            blockBuffer = copiedBlock
        }

        guard status == noErr, let finalBlock = blockBuffer else {
            throw DecoderError.decodeFailed(status)
        }

        // Create CMSampleBuffer
        let pts = CMTimeMake(value: Int64(timestamp), timescale: 1_000_000)
        var timing = CMSampleTimingInfo(
            duration: .invalid,
            presentationTimeStamp: pts,
            decodeTimeStamp: .invalid
        )
        var sampleSize = blockData.count

        var sampleBuffer: CMSampleBuffer?
        status = CMSampleBufferCreateReady(
            allocator: kCFAllocatorDefault,
            dataBuffer: finalBlock,
            formatDescription: formatDescription,
            sampleCount: 1,
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timing,
            sampleSizeEntryCount: 1,
            sampleSizeArray: &sampleSize,
            sampleBufferOut: &sampleBuffer
        )

        guard status == noErr, let buffer = sampleBuffer else {
            throw DecoderError.decodeFailed(status)
        }

        // Mark as display-immediately for low latency
        let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: true)
        if let arr = attachments, CFArrayGetCount(arr) > 0 {
            let dict = unsafeBitCast(CFArrayGetValueAtIndex(arr, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(dict,
                                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        }

        return buffer
    }
}

// MARK: - VTDecompressionOutputCallback

/// C-function callback invoked by VideoToolbox when a frame is decoded.
private func decompressionCallback(
    decompressionOutputRefCon: UnsafeMutableRawPointer?,
    sourceFrameRefCon: UnsafeMutableRawPointer?,
    status: OSStatus,
    infoFlags: VTDecodeInfoFlags,
    imageBuffer: CVImageBuffer?,
    presentationTimeStamp: CMTime,
    presentationDuration: CMTime
) {
    guard status == noErr,
          let refCon = decompressionOutputRefCon,
          let pixelBuffer = imageBuffer
    else { return }

    let decoder = Unmanaged<VideoDecoder>.fromOpaque(refCon).takeUnretainedValue()
    decoder.onDecodedFrame?(pixelBuffer as CVPixelBuffer, presentationTimeStamp)
}
