///////////////////////////////////////////////////////////////////////////////
// videotoolbox_decoder.h -- macOS VideoToolbox hardware decoder
//
// Decodes H.264/HEVC video using Apple's VideoToolbox framework for
// hardware-accelerated decoding on Apple Silicon and Intel Macs.
//
// Outputs CVPixelBufferRef (NV12) which can be imported into Metal
// via CVMetalTextureCache for zero-copy rendering.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "decoder_interface.h"

#include <cstdint>
#include <string>
#include <vector>
#include <mutex>

#ifdef __APPLE__
#include <CoreMedia/CoreMedia.h>
#include <VideoToolbox/VideoToolbox.h>
#endif

namespace cs {

class VideoToolboxDecoder : public IDecoder {
public:
    VideoToolboxDecoder();
    ~VideoToolboxDecoder() override;

    // Non-copyable
    VideoToolboxDecoder(const VideoToolboxDecoder&) = delete;
    VideoToolboxDecoder& operator=(const VideoToolboxDecoder&) = delete;

    bool initialize(uint8_t codec, uint32_t width, uint32_t height) override;
    bool decode(const uint8_t* data, size_t len, DecodedFrame& frame) override;
    void flush() override;
    void release() override;
    std::string getName() const override;

private:
#ifdef __APPLE__
    /// Create the VTDecompressionSession from current SPS/PPS.
    bool createDecompressionSession();

    /// Parse H.264/H.265 NAL units to extract SPS/PPS.
    /// Returns true if parameter sets changed and session needs recreation.
    bool parseParameterSets(const uint8_t* data, size_t len);

    /// Static callback from VideoToolbox when a frame is decoded.
    static void decompressionCallback(
        void* decompressionOutputRefCon,
        void* sourceFrameRefCon,
        OSStatus status,
        VTDecodeInfoFlags infoFlags,
        CVImageBufferRef imageBuffer,
        CMTime presentationTimeStamp,
        CMTime presentationDuration);

    VTDecompressionSessionRef session_ = nullptr;
    CMFormatDescriptionRef    format_desc_ = nullptr;

    // H.264 parameter sets
    std::vector<uint8_t> sps_;
    std::vector<uint8_t> pps_;

    // H.265 parameter sets
    std::vector<uint8_t> vps_;
    std::vector<uint8_t> hevc_sps_;
    std::vector<uint8_t> hevc_pps_;

    // Latest decoded pixel buffer (set by callback)
    CVPixelBufferRef decoded_buffer_ = nullptr;
    bool             decode_ok_      = false;
#endif

    uint8_t  codec_  = 0;
    uint32_t width_  = 0;
    uint32_t height_ = 0;
    bool     initialized_ = false;

    std::mutex mutex_;
};

} // namespace cs
