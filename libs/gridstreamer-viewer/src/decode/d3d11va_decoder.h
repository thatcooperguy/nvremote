///////////////////////////////////////////////////////////////////////////////
// d3d11va_decoder.h -- Dedicated D3D11VA decoder path
//
// Uses FFmpeg with specifically D3D11VA hardware acceleration configured.
// Shares the D3D11 device with the renderer for zero-copy frame handoff:
// the decoded texture lives on the same GPU device as the swap chain,
// so rendering can happen without any CPU-side copy.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "decoder_interface.h"

#include <mutex>
#include <string>

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

class D3D11VADecoder : public IDecoder {
public:
    D3D11VADecoder();
    ~D3D11VADecoder() override;

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
    /// Create an AVHWDeviceContext wrapping the shared D3D11 device.
    bool createHwDeviceFromD3D11();

    /// Transfer from the decoder's output texture to a texture the renderer can use.
    bool extractFrame(AVFrame* hw_frame, DecodedFrame& out);

    // FFmpeg state
    AVCodecContext* codec_ctx_ = nullptr;
    const AVCodec*  codec_     = nullptr;
    AVFrame*        frame_     = nullptr;
    AVFrame*        sw_frame_  = nullptr;
    AVPacket*       packet_    = nullptr;
    AVBufferRef*    hw_device_ = nullptr;

    // Configuration
    uint8_t  codec_type_  = 0;
    uint32_t width_       = 0;
    uint32_t height_      = 0;
    bool     initialized_ = false;

#ifdef _WIN32
    // Shared D3D11 device from renderer
    ID3D11Device*        shared_device_ = nullptr;
    ID3D11DeviceContext*  shared_ctx_   = nullptr;

    // Staging texture for CPU-accessible copy (only used if direct sharing fails)
    ID3D11Texture2D*      staging_tex_ = nullptr;
    uint32_t staging_width_  = 0;
    uint32_t staging_height_ = 0;
#endif

    std::mutex mutex_;
};

} // namespace cs
