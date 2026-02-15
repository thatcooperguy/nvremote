///////////////////////////////////////////////////////////////////////////////
// videotoolbox_decoder.mm -- macOS VideoToolbox hardware decoder
//
// Uses VTDecompressionSession for H.264/HEVC hardware decoding.
// Outputs CVPixelBufferRef (NV12/420v) for zero-copy Metal rendering.
//
// NAL unit format: Expects Annex B bitstream (start codes 00 00 00 01).
// Extracts SPS/PPS from the stream to create CMFormatDescription.
///////////////////////////////////////////////////////////////////////////////

#include "videotoolbox_decoder.h"

#include <cs/common.h>
#include <cs/transport/packet.h>

#ifdef __APPLE__
#import <Foundation/Foundation.h>
#import <CoreVideo/CoreVideo.h>
#endif

namespace cs {

// ---------------------------------------------------------------------------
// H.264 NAL unit types
// ---------------------------------------------------------------------------
static constexpr uint8_t H264_NAL_SPS  = 7;
static constexpr uint8_t H264_NAL_PPS  = 8;
static constexpr uint8_t H264_NAL_IDR  = 5;
static constexpr uint8_t H264_NAL_SLICE = 1;

// H.265 NAL unit types
static constexpr uint8_t H265_NAL_VPS     = 32;
static constexpr uint8_t H265_NAL_SPS     = 33;
static constexpr uint8_t H265_NAL_PPS     = 34;
static constexpr uint8_t H265_NAL_IDR_W   = 19;
static constexpr uint8_t H265_NAL_IDR_N   = 20;

// ---------------------------------------------------------------------------
// Helper: find next Annex B start code in data
// ---------------------------------------------------------------------------
static const uint8_t* findStartCode(const uint8_t* data, size_t len) {
    if (len < 4) return nullptr;
    for (size_t i = 0; i + 3 < len; i++) {
        if (data[i] == 0 && data[i+1] == 0 && data[i+2] == 0 && data[i+3] == 1) {
            return data + i;
        }
    }
    return nullptr;
}

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

VideoToolboxDecoder::VideoToolboxDecoder() = default;

VideoToolboxDecoder::~VideoToolboxDecoder() {
    release();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool VideoToolboxDecoder::initialize(uint8_t codec, uint32_t width, uint32_t height) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);

    codec_  = codec;
    width_  = width;
    height_ = height;

    // Session will be created lazily when we have SPS/PPS
    initialized_ = true;
    CS_LOG(INFO, "VideoToolbox decoder ready (codec=%u, %ux%u)", codec, width, height);
    return true;
#else
    (void)codec; (void)width; (void)height;
    return false;
#endif
}

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

bool VideoToolboxDecoder::decode(const uint8_t* data, size_t len, DecodedFrame& frame) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_ || !data || len == 0) return false;

    // Parse NAL units to extract/update parameter sets
    bool params_changed = parseParameterSets(data, len);

    // Create or recreate session if needed
    if (!session_ || params_changed) {
        if (!createDecompressionSession()) {
            return false;
        }
    }

    if (!session_) return false;

    // Convert Annex B to AVCC/HVCC format for VideoToolbox
    // (replace start codes with 4-byte length prefixes)
    std::vector<uint8_t> avcc_data;
    avcc_data.reserve(len);

    const uint8_t* pos = data;
    const uint8_t* end = data + len;

    while (pos < end) {
        const uint8_t* sc = findStartCode(pos, static_cast<size_t>(end - pos));
        if (!sc) break;

        const uint8_t* nal_start = sc + 4;
        const uint8_t* next_sc = findStartCode(nal_start, static_cast<size_t>(end - nal_start));
        size_t nal_len = next_sc ? static_cast<size_t>(next_sc - nal_start)
                                 : static_cast<size_t>(end - nal_start);

        if (nal_len == 0) {
            pos = nal_start;
            continue;
        }

        // Get NAL type
        uint8_t nal_type;
        bool is_hevc = (codec_ == static_cast<uint8_t>(CodecType::H265));
        if (is_hevc) {
            nal_type = (nal_start[0] >> 1) & 0x3F;
        } else {
            nal_type = nal_start[0] & 0x1F;
        }

        // Skip parameter set NALs (already extracted)
        bool skip = false;
        if (is_hevc) {
            skip = (nal_type == H265_NAL_VPS || nal_type == H265_NAL_SPS || nal_type == H265_NAL_PPS);
        } else {
            skip = (nal_type == H264_NAL_SPS || nal_type == H264_NAL_PPS);
        }

        if (!skip) {
            // Write 4-byte big-endian length + NAL data
            uint32_t be_len = static_cast<uint32_t>(nal_len);
            uint8_t len_bytes[4] = {
                static_cast<uint8_t>((be_len >> 24) & 0xFF),
                static_cast<uint8_t>((be_len >> 16) & 0xFF),
                static_cast<uint8_t>((be_len >>  8) & 0xFF),
                static_cast<uint8_t>((be_len      ) & 0xFF),
            };
            avcc_data.insert(avcc_data.end(), len_bytes, len_bytes + 4);
            avcc_data.insert(avcc_data.end(), nal_start, nal_start + nal_len);
        }

        pos = next_sc ? next_sc : end;
    }

    if (avcc_data.empty()) return false;

    // Create CMBlockBuffer from the AVCC data
    CMBlockBufferRef block_buffer = nullptr;
    OSStatus status = CMBlockBufferCreateWithMemoryBlock(
        kCFAllocatorDefault,
        const_cast<uint8_t*>(avcc_data.data()),
        avcc_data.size(),
        kCFAllocatorNull,  // Don't free the data
        nullptr,
        0,
        avcc_data.size(),
        0,
        &block_buffer);

    if (status != noErr || !block_buffer) {
        CS_LOG(WARN, "VT: CMBlockBufferCreateWithMemoryBlock failed: %d", (int)status);
        return false;
    }

    // Create CMSampleBuffer
    CMSampleBufferRef sample_buffer = nullptr;
    const size_t sample_size = avcc_data.size();
    status = CMSampleBufferCreateReady(
        kCFAllocatorDefault,
        block_buffer,
        format_desc_,
        1,            // numSamples
        0, nullptr,   // numSampleTimingEntries
        1, &sample_size,
        &sample_buffer);

    CFRelease(block_buffer);

    if (status != noErr || !sample_buffer) {
        CS_LOG(WARN, "VT: CMSampleBufferCreateReady failed: %d", (int)status);
        return false;
    }

    // Decode
    decode_ok_ = false;
    if (decoded_buffer_) {
        CVPixelBufferRelease(decoded_buffer_);
        decoded_buffer_ = nullptr;
    }

    VTDecodeFrameFlags flags = kVTDecodeFrame_EnableAsynchronousDecompression;
    VTDecodeInfoFlags info_flags = 0;

    status = VTDecompressionSessionDecodeFrame(
        session_,
        sample_buffer,
        flags,
        nullptr,  // sourceFrameRefCon
        &info_flags);

    CFRelease(sample_buffer);

    if (status != noErr) {
        CS_LOG(WARN, "VT: DecodeFrame failed: %d", (int)status);
        return false;
    }

    // Wait for the decode to complete
    VTDecompressionSessionWaitForAsynchronousFrames(session_);

    if (!decode_ok_ || !decoded_buffer_) {
        return false;
    }

    // Fill the output frame
    frame.texture     = static_cast<void*>(decoded_buffer_);
    frame.subresource = 0;
    frame.width       = static_cast<uint32_t>(CVPixelBufferGetWidth(decoded_buffer_));
    frame.height      = static_cast<uint32_t>(CVPixelBufferGetHeight(decoded_buffer_));
    frame.format      = FrameFormat::NV12;

    // Transfer ownership: caller must ensure this pixel buffer stays alive
    // until the Metal renderer has consumed it. The renderer will release it.
    decoded_buffer_ = nullptr;

    return true;
#else
    (void)data; (void)len; (void)frame;
    return false;
#endif
}

// ---------------------------------------------------------------------------
// parseParameterSets
// ---------------------------------------------------------------------------

#ifdef __APPLE__
bool VideoToolboxDecoder::parseParameterSets(const uint8_t* data, size_t len) {
    bool changed = false;
    bool is_hevc = (codec_ == static_cast<uint8_t>(CodecType::H265));

    const uint8_t* pos = data;
    const uint8_t* end = data + len;

    while (pos < end) {
        const uint8_t* sc = findStartCode(pos, static_cast<size_t>(end - pos));
        if (!sc) break;

        const uint8_t* nal_start = sc + 4;
        const uint8_t* next_sc = findStartCode(nal_start, static_cast<size_t>(end - nal_start));
        size_t nal_len = next_sc ? static_cast<size_t>(next_sc - nal_start)
                                 : static_cast<size_t>(end - nal_start);

        if (nal_len == 0) {
            pos = nal_start;
            continue;
        }

        if (is_hevc) {
            uint8_t nal_type = (nal_start[0] >> 1) & 0x3F;
            if (nal_type == H265_NAL_VPS) {
                std::vector<uint8_t> new_vps(nal_start, nal_start + nal_len);
                if (new_vps != vps_) { vps_ = std::move(new_vps); changed = true; }
            } else if (nal_type == H265_NAL_SPS) {
                std::vector<uint8_t> new_sps(nal_start, nal_start + nal_len);
                if (new_sps != hevc_sps_) { hevc_sps_ = std::move(new_sps); changed = true; }
            } else if (nal_type == H265_NAL_PPS) {
                std::vector<uint8_t> new_pps(nal_start, nal_start + nal_len);
                if (new_pps != hevc_pps_) { hevc_pps_ = std::move(new_pps); changed = true; }
            }
        } else {
            uint8_t nal_type = nal_start[0] & 0x1F;
            if (nal_type == H264_NAL_SPS) {
                std::vector<uint8_t> new_sps(nal_start, nal_start + nal_len);
                if (new_sps != sps_) { sps_ = std::move(new_sps); changed = true; }
            } else if (nal_type == H264_NAL_PPS) {
                std::vector<uint8_t> new_pps(nal_start, nal_start + nal_len);
                if (new_pps != pps_) { pps_ = std::move(new_pps); changed = true; }
            }
        }

        pos = next_sc ? next_sc : end;
    }

    return changed;
}
#endif

// ---------------------------------------------------------------------------
// createDecompressionSession
// ---------------------------------------------------------------------------

#ifdef __APPLE__
bool VideoToolboxDecoder::createDecompressionSession() {
    // Tear down existing session
    if (session_) {
        VTDecompressionSessionInvalidate(session_);
        CFRelease(session_);
        session_ = nullptr;
    }
    if (format_desc_) {
        CFRelease(format_desc_);
        format_desc_ = nullptr;
    }

    bool is_hevc = (codec_ == static_cast<uint8_t>(CodecType::H265));

    if (is_hevc) {
        if (vps_.empty() || hevc_sps_.empty() || hevc_pps_.empty()) {
            CS_LOG(DEBUG, "VT: waiting for VPS/SPS/PPS");
            return false;
        }

        const uint8_t* param_sets[] = { vps_.data(), hevc_sps_.data(), hevc_pps_.data() };
        size_t param_sizes[] = { vps_.size(), hevc_sps_.size(), hevc_pps_.size() };

        OSStatus status = CMVideoFormatDescriptionCreateFromHEVCParameterSets(
            kCFAllocatorDefault,
            3,
            param_sets,
            param_sizes,
            4,  // NAL unit header length
            nullptr,
            &format_desc_);

        if (status != noErr) {
            CS_LOG(ERR, "VT: CMVideoFormatDescriptionCreateFromHEVCParameterSets failed: %d", (int)status);
            return false;
        }
    } else {
        if (sps_.empty() || pps_.empty()) {
            CS_LOG(DEBUG, "VT: waiting for SPS/PPS");
            return false;
        }

        const uint8_t* param_sets[] = { sps_.data(), pps_.data() };
        size_t param_sizes[] = { sps_.size(), pps_.size() };

        OSStatus status = CMVideoFormatDescriptionCreateFromH264ParameterSets(
            kCFAllocatorDefault,
            2,
            param_sets,
            param_sizes,
            4,  // NAL unit header length
            &format_desc_);

        if (status != noErr) {
            CS_LOG(ERR, "VT: CMVideoFormatDescriptionCreateFromH264ParameterSets failed: %d", (int)status);
            return false;
        }
    }

    // Configure output pixel format: NV12 (kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
    NSDictionary* dest_attrs = @{
        (__bridge NSString*)kCVPixelBufferPixelFormatTypeKey:
            @(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange),
        (__bridge NSString*)kCVPixelBufferMetalCompatibilityKey: @YES,
        (__bridge NSString*)kCVPixelBufferWidthKey: @(width_),
        (__bridge NSString*)kCVPixelBufferHeightKey: @(height_),
    };

    // Decoder callback
    VTDecompressionOutputCallbackRecord callback;
    callback.decompressionOutputCallback = decompressionCallback;
    callback.decompressionOutputRefCon = this;

    OSStatus status = VTDecompressionSessionCreate(
        kCFAllocatorDefault,
        format_desc_,
        nullptr,   // videoDecoderSpecification
        (__bridge CFDictionaryRef)dest_attrs,
        &callback,
        &session_);

    if (status != noErr) {
        CS_LOG(ERR, "VT: VTDecompressionSessionCreate failed: %d", (int)status);
        return false;
    }

    // Request real-time decoding (low latency)
    VTSessionSetProperty(session_, kVTDecompressionPropertyKey_RealTime, kCFBooleanTrue);

    CS_LOG(INFO, "VT: decompression session created (%s, %ux%u)",
           is_hevc ? "HEVC" : "H.264", width_, height_);
    return true;
}
#endif

// ---------------------------------------------------------------------------
// decompressionCallback
// ---------------------------------------------------------------------------

#ifdef __APPLE__
void VideoToolboxDecoder::decompressionCallback(
    void* decompressionOutputRefCon,
    void* /*sourceFrameRefCon*/,
    OSStatus status,
    VTDecodeInfoFlags /*infoFlags*/,
    CVImageBufferRef imageBuffer,
    CMTime /*presentationTimeStamp*/,
    CMTime /*presentationDuration*/)
{
    auto* self = static_cast<VideoToolboxDecoder*>(decompressionOutputRefCon);

    if (status != noErr || !imageBuffer) {
        self->decode_ok_ = false;
        return;
    }

    // Retain the pixel buffer for the caller
    CVPixelBufferRetain(imageBuffer);
    self->decoded_buffer_ = imageBuffer;
    self->decode_ok_ = true;
}
#endif

// ---------------------------------------------------------------------------
// flush
// ---------------------------------------------------------------------------

void VideoToolboxDecoder::flush() {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    if (session_) {
        VTDecompressionSessionWaitForAsynchronousFrames(session_);
    }
#endif
}

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

void VideoToolboxDecoder::release() {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);

    if (decoded_buffer_) {
        CVPixelBufferRelease(decoded_buffer_);
        decoded_buffer_ = nullptr;
    }

    if (session_) {
        VTDecompressionSessionInvalidate(session_);
        CFRelease(session_);
        session_ = nullptr;
    }

    if (format_desc_) {
        CFRelease(format_desc_);
        format_desc_ = nullptr;
    }

    sps_.clear();
    pps_.clear();
    vps_.clear();
    hevc_sps_.clear();
    hevc_pps_.clear();

    initialized_ = false;
    CS_LOG(INFO, "VideoToolbox decoder released");
#endif
}

// ---------------------------------------------------------------------------
// getName
// ---------------------------------------------------------------------------

std::string VideoToolboxDecoder::getName() const {
    return "VideoToolbox";
}

} // namespace cs
