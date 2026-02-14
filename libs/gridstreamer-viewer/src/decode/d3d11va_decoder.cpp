///////////////////////////////////////////////////////////////////////////////
// d3d11va_decoder.cpp -- Dedicated D3D11VA decoder path
//
// Specifically configures FFmpeg for D3D11VA hardware acceleration,
// sharing the D3D11 device with the renderer for zero-copy decoded
// frame output. Decoded frames reference the same GPU texture array
// used by the video processor, avoiding any CPU-side copies.
///////////////////////////////////////////////////////////////////////////////

#include "d3d11va_decoder.h"

#include <cs/common.h>
#include <cs/transport/packet.h>

#include <chrono>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/avutil.h>
#include <libavutil/hwcontext.h>
#include <libavutil/pixdesc.h>
#ifdef _WIN32
#include <libavutil/hwcontext_d3d11va.h>
#endif
}

#ifdef _WIN32
#include <d3d11.h>
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Pixel format negotiation for D3D11VA
// ---------------------------------------------------------------------------
static enum AVPixelFormat d3d11va_get_format(AVCodecContext* /*ctx*/,
                                              const enum AVPixelFormat* pix_fmts) {
    for (const enum AVPixelFormat* p = pix_fmts; *p != AV_PIX_FMT_NONE; p++) {
        if (*p == AV_PIX_FMT_D3D11) {
            return AV_PIX_FMT_D3D11;
        }
    }
    CS_LOG(WARN, "D3D11VADecoder: AV_PIX_FMT_D3D11 not offered by decoder");
    return AV_PIX_FMT_NONE;
}

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

D3D11VADecoder::D3D11VADecoder() = default;

D3D11VADecoder::~D3D11VADecoder() {
    release();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool D3D11VADecoder::initialize(uint8_t codec, uint32_t width, uint32_t height) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        release();
    }

#ifndef _WIN32
    CS_LOG(ERR, "D3D11VADecoder: only supported on Windows");
    return false;
#else
    codec_type_ = codec;
    width_ = width;
    height_ = height;

    if (!shared_device_) {
        CS_LOG(ERR, "D3D11VADecoder: no shared D3D11 device set");
        return false;
    }

    // Map codec type
    enum AVCodecID codec_id;
    switch (static_cast<CodecType>(codec)) {
        case CodecType::H264: codec_id = AV_CODEC_ID_H264; break;
        case CodecType::H265: codec_id = AV_CODEC_ID_HEVC; break;
        case CodecType::AV1:  codec_id = AV_CODEC_ID_AV1;  break;
        default:
            CS_LOG(ERR, "D3D11VADecoder: unsupported codec %u", codec);
            return false;
    }

    // Find decoder
    codec_ = avcodec_find_decoder(codec_id);
    if (!codec_) {
        CS_LOG(ERR, "D3D11VADecoder: decoder not found for codec %d", codec_id);
        return false;
    }

    // Allocate context
    codec_ctx_ = avcodec_alloc_context3(codec_);
    if (!codec_ctx_) {
        CS_LOG(ERR, "D3D11VADecoder: failed to allocate codec context");
        return false;
    }

    codec_ctx_->width = static_cast<int>(width);
    codec_ctx_->height = static_cast<int>(height);
    codec_ctx_->thread_count = 1;
    codec_ctx_->flags |= AV_CODEC_FLAG_LOW_DELAY;
    codec_ctx_->flags2 |= AV_CODEC_FLAG2_FAST;
    codec_ctx_->get_format = d3d11va_get_format;

    // Create hardware device context wrapping our shared D3D11 device
    if (!createHwDeviceFromD3D11()) {
        CS_LOG(ERR, "D3D11VADecoder: failed to create HW device context");
        release();
        return false;
    }

    codec_ctx_->hw_device_ctx = av_buffer_ref(hw_device_);

    // Open codec
    int ret = avcodec_open2(codec_ctx_, codec_, nullptr);
    if (ret < 0) {
        char err_buf[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err_buf, sizeof(err_buf));
        CS_LOG(ERR, "D3D11VADecoder: avcodec_open2 failed: %s", err_buf);
        release();
        return false;
    }

    // Allocate frames
    frame_ = av_frame_alloc();
    sw_frame_ = av_frame_alloc();
    packet_ = av_packet_alloc();

    if (!frame_ || !sw_frame_ || !packet_) {
        CS_LOG(ERR, "D3D11VADecoder: failed to allocate frames/packet");
        release();
        return false;
    }

    initialized_ = true;
    CS_LOG(INFO, "D3D11VADecoder initialized: %s %ux%u (zero-copy with renderer device)",
           avcodec_get_name(codec_id), width, height);
    return true;
#endif
}

// ---------------------------------------------------------------------------
// createHwDeviceFromD3D11
// ---------------------------------------------------------------------------

bool D3D11VADecoder::createHwDeviceFromD3D11() {
#ifdef _WIN32
    // Create an AVHWDeviceContext wrapping our existing D3D11 device
    hw_device_ = av_hwdevice_ctx_alloc(AV_HWDEVICE_TYPE_D3D11VA);
    if (!hw_device_) {
        CS_LOG(ERR, "D3D11VADecoder: av_hwdevice_ctx_alloc failed");
        return false;
    }

    auto* hw_ctx = reinterpret_cast<AVHWDeviceContext*>(hw_device_->data);
    auto* d3d11_ctx = static_cast<AVD3D11VADeviceContext*>(hw_ctx->hwctx);

    // Use our shared device
    d3d11_ctx->device = shared_device_;
    shared_device_->AddRef();

    // Get the immediate context
    shared_device_->GetImmediateContext(&d3d11_ctx->device_context);
    shared_ctx_ = d3d11_ctx->device_context;

    // Initialize the device context
    int ret = av_hwdevice_ctx_init(hw_device_);
    if (ret < 0) {
        char err_buf[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err_buf, sizeof(err_buf));
        CS_LOG(ERR, "D3D11VADecoder: av_hwdevice_ctx_init failed: %s", err_buf);
        av_buffer_unref(&hw_device_);
        return false;
    }

    return true;
#else
    return false;
#endif
}

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

bool D3D11VADecoder::decode(const uint8_t* data, size_t len, DecodedFrame& frame) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_ || !codec_ctx_) {
        return false;
    }

    auto start = std::chrono::steady_clock::now();

    packet_->data = const_cast<uint8_t*>(data);
    packet_->size = static_cast<int>(len);

    int ret = avcodec_send_packet(codec_ctx_, packet_);
    if (ret < 0 && ret != AVERROR(EAGAIN)) {
        if (ret != AVERROR_EOF) {
            char err_buf[AV_ERROR_MAX_STRING_SIZE];
            av_strerror(ret, err_buf, sizeof(err_buf));
            CS_LOG(WARN, "D3D11VADecoder: send_packet failed: %s", err_buf);
        }
        return false;
    }

    ret = avcodec_receive_frame(codec_ctx_, frame_);
    if (ret < 0) {
        if (ret != AVERROR(EAGAIN) && ret != AVERROR_EOF) {
            char err_buf[AV_ERROR_MAX_STRING_SIZE];
            av_strerror(ret, err_buf, sizeof(err_buf));
            CS_LOG(WARN, "D3D11VADecoder: receive_frame failed: %s", err_buf);
        }
        return false;
    }

    auto end = std::chrono::steady_clock::now();
    double decode_ms = std::chrono::duration<double, std::milli>(end - start).count();

    // Extract the D3D11 texture from the decoded frame
    if (!extractFrame(frame_, frame)) {
        av_frame_unref(frame_);
        return false;
    }

    frame.decode_time_ms = decode_ms;
    frame.timestamp_us = static_cast<uint64_t>(frame_->pts);

    av_frame_unref(frame_);
    return true;
}

// ---------------------------------------------------------------------------
// extractFrame
// ---------------------------------------------------------------------------

bool D3D11VADecoder::extractFrame(AVFrame* hw_frame, DecodedFrame& out) {
#ifdef _WIN32
    if (hw_frame->format == AV_PIX_FMT_D3D11) {
        // Zero-copy path: the texture lives on the same D3D11 device as the renderer
        auto* texture = reinterpret_cast<ID3D11Texture2D*>(hw_frame->data[0]);
        auto subresource = static_cast<uint32_t>(reinterpret_cast<intptr_t>(hw_frame->data[1]));

        out.texture = texture;
        out.subresource = subresource;
        out.width = static_cast<uint32_t>(hw_frame->width);
        out.height = static_cast<uint32_t>(hw_frame->height);
        out.format = FrameFormat::NV12;
        return true;
    }
#endif

    // Fallback: transfer to system memory
    sw_frame_->format = AV_PIX_FMT_NV12;
    int ret = av_hwframe_transfer_data(sw_frame_, hw_frame, 0);
    if (ret < 0) {
        char err_buf[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err_buf, sizeof(err_buf));
        CS_LOG(WARN, "D3D11VADecoder: hw transfer failed: %s", err_buf);
        return false;
    }

    out.texture = sw_frame_->data[0];
    out.subresource = 0;
    out.width = static_cast<uint32_t>(sw_frame_->width);
    out.height = static_cast<uint32_t>(sw_frame_->height);
    out.format = FrameFormat::NV12;
    return true;
}

// ---------------------------------------------------------------------------
// flush
// ---------------------------------------------------------------------------

void D3D11VADecoder::flush() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (codec_ctx_) {
        avcodec_flush_buffers(codec_ctx_);
    }
}

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

void D3D11VADecoder::release() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (packet_) { av_packet_free(&packet_); packet_ = nullptr; }
    if (sw_frame_) { av_frame_free(&sw_frame_); sw_frame_ = nullptr; }
    if (frame_) { av_frame_free(&frame_); frame_ = nullptr; }
    if (codec_ctx_) { avcodec_free_context(&codec_ctx_); codec_ctx_ = nullptr; }
    if (hw_device_) { av_buffer_unref(&hw_device_); hw_device_ = nullptr; }

#ifdef _WIN32
    if (staging_tex_) { staging_tex_->Release(); staging_tex_ = nullptr; }
    // shared_ctx_ is obtained from the device context, released when device is destroyed
    shared_ctx_ = nullptr;
    // Do not release shared_device_ -- we don't own it
#endif

    codec_ = nullptr;
    initialized_ = false;
}

// ---------------------------------------------------------------------------
// getName
// ---------------------------------------------------------------------------

std::string D3D11VADecoder::getName() const {
    return "D3D11VADecoder(zero-copy)";
}

// ---------------------------------------------------------------------------
// D3D11 device accessors
// ---------------------------------------------------------------------------

#ifdef _WIN32
ID3D11Device* D3D11VADecoder::getD3D11Device() const {
    return shared_device_;
}

void D3D11VADecoder::setD3D11Device(ID3D11Device* device) {
    shared_device_ = device;
}
#endif

} // namespace cs
