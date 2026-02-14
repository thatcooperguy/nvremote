///////////////////////////////////////////////////////////////////////////////
// nvdec_decoder.h -- Hardware-accelerated video decoder via FFmpeg hwaccel
//
// Attempts GPU decoding in the following order:
//   1. CUDA (AV_HWDEVICE_TYPE_CUDA) -- best for NVIDIA GPUs
//   2. D3D11VA (AV_HWDEVICE_TYPE_D3D11VA) -- broad Windows support
//   3. DXVA2 (AV_HWDEVICE_TYPE_DXVA2) -- legacy fallback
//   4. Software decode -- final fallback, always works
//
// The decoded frames are transferred to D3D11 textures when possible
// for zero-copy handoff to the renderer.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "decoder_interface.h"

#include <mutex>
#include <string>

// Forward-declare FFmpeg types to avoid leaking libav headers into consumers
struct AVCodecContext;
struct AVCodec;
struct AVFrame;
struct AVPacket;
struct AVBufferRef;

#ifdef _WIN32
struct ID3D11Device;
struct ID3D11DeviceContext;
struct ID3D11Texture2D;
#endif

namespace cs {

class NvdecDecoder : public IDecoder {
public:
    NvdecDecoder();
    ~NvdecDecoder() override;

    bool initialize(uint8_t codec, uint32_t width, uint32_t height) override;
    bool decode(const uint8_t* data, size_t len, DecodedFrame& frame) override;
    void flush() override;
    void release() override;
    std::string getName() const override;

#ifdef _WIN32
    ID3D11Device* getD3D11Device() const override;
    void setD3D11Device(ID3D11Device* device) override;
#endif

private:
    /// Try to create a hardware device context of the given type.
    /// Returns the AVBufferRef on success, nullptr on failure.
    AVBufferRef* tryCreateHwDevice(int hw_type);

    /// Configure the codec context for hardware acceleration.
    bool configureHwAccel();

    /// Transfer a hardware frame to a staging texture accessible by the renderer.
    bool transferHwFrame(AVFrame* hw_frame, DecodedFrame& out);

    /// Map an FFmpeg pixel format to our FrameFormat enum.
    static FrameFormat mapPixelFormat(int av_pix_fmt);

    // FFmpeg state
    AVCodecContext* codec_ctx_   = nullptr;
    const AVCodec*  codec_       = nullptr;  // owned by FFmpeg, do not free
    AVFrame*        frame_       = nullptr;
    AVFrame*        sw_frame_    = nullptr;   // for hw->sw transfer
    AVPacket*       packet_      = nullptr;
    AVBufferRef*    hw_device_   = nullptr;

    // Configuration
    uint8_t  codec_type_  = 0;
    uint32_t width_       = 0;
    uint32_t height_      = 0;
    bool     initialized_ = false;

    // Which HW backend we ended up using
    int      hw_type_     = -1;  // AV_HWDEVICE_TYPE_* or -1 for software
    std::string backend_name_ = "none";

    // D3D11 device sharing (set by renderer for zero-copy)
#ifdef _WIN32
    ID3D11Device*        shared_device_  = nullptr;
    ID3D11DeviceContext*  shared_ctx_    = nullptr;
    ID3D11Texture2D*      staging_tex_  = nullptr;
    uint32_t staging_width_  = 0;
    uint32_t staging_height_ = 0;
#endif

    std::mutex mutex_;
};

} // namespace cs
