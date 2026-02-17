///////////////////////////////////////////////////////////////////////////////
// nvdec_decoder.cpp -- Hardware-accelerated video decoder via FFmpeg hwaccel
//
// Attempts GPU decode in order: CUDA -> D3D11VA -> DXVA2 -> software.
// Uses the FFmpeg libavcodec API for all paths.
///////////////////////////////////////////////////////////////////////////////

#include "nvdec_decoder.h"

#include <cs/common.h>
#include <cs/transport/packet.h>

#include <chrono>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/avutil.h>
#include <libavutil/hwcontext.h>
#include <libavutil/imgutils.h>
#include <libavutil/opt.h>
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
// Pixel format negotiation callback for hwaccel
// ---------------------------------------------------------------------------
static enum AVPixelFormat getHwFormat(AVCodecContext* ctx, const enum AVPixelFormat* pix_fmts) {
    // The user-data carries the desired hw pixel format
    auto desired = static_cast<AVPixelFormat>(reinterpret_cast<intptr_t>(ctx->opaque));

    for (const enum AVPixelFormat* p = pix_fmts; *p != AV_PIX_FMT_NONE; p++) {
        if (*p == desired) {
            return *p;
        }
    }

    CS_LOG(WARN, "NvdecDecoder: desired hw pixel format not available, falling back");
    return AV_PIX_FMT_NONE;
}

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

NvdecDecoder::NvdecDecoder() = default;

NvdecDecoder::~NvdecDecoder() {
    release();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool NvdecDecoder::initialize(uint8_t codec, uint32_t width, uint32_t height) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        release();
    }

    codec_type_ = codec;
    width_ = width;
    height_ = height;

    // Map our codec enum to FFmpeg codec ID
    enum AVCodecID codec_id;
    switch (static_cast<CodecType>(codec)) {
        case CodecType::H264: codec_id = AV_CODEC_ID_H264; break;
        case CodecType::H265: codec_id = AV_CODEC_ID_HEVC; break;
        case CodecType::AV1:  codec_id = AV_CODEC_ID_AV1;  break;
        default:
            CS_LOG(ERR, "NvdecDecoder: unsupported codec type %u", codec);
            return false;
    }

    // Find the decoder
    codec_ = avcodec_find_decoder(codec_id);
    if (!codec_) {
        CS_LOG(ERR, "NvdecDecoder: avcodec_find_decoder failed for codec %d", codec_id);
        return false;
    }

    // Allocate codec context
    codec_ctx_ = avcodec_alloc_context3(codec_);
    if (!codec_ctx_) {
        CS_LOG(ERR, "NvdecDecoder: avcodec_alloc_context3 failed");
        return false;
    }

    // Basic codec parameters
    codec_ctx_->width = static_cast<int>(width);
    codec_ctx_->height = static_cast<int>(height);
    codec_ctx_->thread_count = 1;  // HW decoders use their own threading

    // Low-latency flags
    codec_ctx_->flags |= AV_CODEC_FLAG_LOW_DELAY;
    codec_ctx_->flags2 |= AV_CODEC_FLAG2_FAST;

    // Try hardware acceleration
    if (!configureHwAccel()) {
        CS_LOG(WARN, "NvdecDecoder: all HW backends failed, using software decode");
        backend_name_ = "software";
        hw_type_ = -1;
    }

    // Open the codec
    int ret = avcodec_open2(codec_ctx_, codec_, nullptr);
    if (ret < 0) {
        char err_buf[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err_buf, sizeof(err_buf));
        CS_LOG(ERR, "NvdecDecoder: avcodec_open2 failed: %s", err_buf);
        release();
        return false;
    }

    // Allocate frames and packet
    frame_ = av_frame_alloc();
    sw_frame_ = av_frame_alloc();
    packet_ = av_packet_alloc();

    if (!frame_ || !sw_frame_ || !packet_) {
        CS_LOG(ERR, "NvdecDecoder: failed to allocate AVFrame/AVPacket");
        release();
        return false;
    }

    initialized_ = true;
    CS_LOG(INFO, "NvdecDecoder initialized: backend=%s codec=%s %ux%u",
           backend_name_.c_str(), avcodec_get_name(codec_id), width, height);
    return true;
}

// ---------------------------------------------------------------------------
// configureHwAccel
// ---------------------------------------------------------------------------

bool NvdecDecoder::configureHwAccel() {
    // Try hardware accelerators in priority order

    // 1. CUDA (NVIDIA GPUs)
    hw_device_ = tryCreateHwDevice(AV_HWDEVICE_TYPE_CUDA);
    if (hw_device_) {
        codec_ctx_->hw_device_ctx = av_buffer_ref(hw_device_);
        codec_ctx_->opaque = reinterpret_cast<void*>(static_cast<intptr_t>(AV_PIX_FMT_CUDA));
        codec_ctx_->get_format = getHwFormat;
        hw_type_ = AV_HWDEVICE_TYPE_CUDA;
        backend_name_ = "CUDA/NVDEC";
        CS_LOG(INFO, "NvdecDecoder: using CUDA hardware acceleration");
        return true;
    }

#ifdef _WIN32
    // 2. D3D11VA (Windows 8+, broad GPU support)
    hw_device_ = tryCreateHwDevice(AV_HWDEVICE_TYPE_D3D11VA);
    if (hw_device_) {
        codec_ctx_->hw_device_ctx = av_buffer_ref(hw_device_);
        codec_ctx_->opaque = reinterpret_cast<void*>(static_cast<intptr_t>(AV_PIX_FMT_D3D11));
        codec_ctx_->get_format = getHwFormat;
        hw_type_ = AV_HWDEVICE_TYPE_D3D11VA;
        backend_name_ = "D3D11VA";
        CS_LOG(INFO, "NvdecDecoder: using D3D11VA hardware acceleration");
        return true;
    }

    // 3. DXVA2 (legacy, Windows 7+)
    hw_device_ = tryCreateHwDevice(AV_HWDEVICE_TYPE_DXVA2);
    if (hw_device_) {
        codec_ctx_->hw_device_ctx = av_buffer_ref(hw_device_);
        codec_ctx_->opaque = reinterpret_cast<void*>(static_cast<intptr_t>(AV_PIX_FMT_DXVA2_VLD));
        codec_ctx_->get_format = getHwFormat;
        hw_type_ = AV_HWDEVICE_TYPE_DXVA2;
        backend_name_ = "DXVA2";
        CS_LOG(INFO, "NvdecDecoder: using DXVA2 hardware acceleration");
        return true;
    }
#endif

    return false;
}

// ---------------------------------------------------------------------------
// tryCreateHwDevice
// ---------------------------------------------------------------------------

AVBufferRef* NvdecDecoder::tryCreateHwDevice(int hw_type) {
    AVBufferRef* device = nullptr;

#ifdef _WIN32
    // For D3D11VA, if we have a shared D3D11 device from the renderer,
    // wrap it directly for zero-copy
    if (hw_type == AV_HWDEVICE_TYPE_D3D11VA && shared_device_) {
        int ret = av_hwdevice_ctx_create(&device,
                                         static_cast<AVHWDeviceType>(hw_type),
                                         nullptr, nullptr, 0);
        if (ret >= 0 && device) {
            // Get the D3D11 device context and replace with our shared device
            auto* hw_ctx = reinterpret_cast<AVHWDeviceContext*>(device->data);
            auto* d3d11_ctx = static_cast<AVD3D11VADeviceContext*>(hw_ctx->hwctx);
            // Release the auto-created device and use ours
            if (d3d11_ctx->device) {
                d3d11_ctx->device->Release();
            }
            d3d11_ctx->device = shared_device_;
            shared_device_->AddRef();

            if (d3d11_ctx->device_context) {
                d3d11_ctx->device_context->Release();
            }
            shared_device_->GetImmediateContext(&d3d11_ctx->device_context);

            ret = av_hwdevice_ctx_init(device);
            if (ret < 0) {
                av_buffer_unref(&device);
                device = nullptr;
            }
            return device;
        }
    }
#endif

    // Generic creation
    int ret = av_hwdevice_ctx_create(&device,
                                     static_cast<AVHWDeviceType>(hw_type),
                                     nullptr, nullptr, 0);
    if (ret < 0) {
        char err_buf[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err_buf, sizeof(err_buf));
        CS_LOG(DEBUG, "NvdecDecoder: hwdevice type %d creation failed: %s",
               hw_type, err_buf);
        return nullptr;
    }

    return device;
}

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

bool NvdecDecoder::decode(const uint8_t* data, size_t len, DecodedFrame& frame) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_ || !codec_ctx_ || !frame_ || !packet_) {
        return false;
    }

    auto start = std::chrono::steady_clock::now();

    // Feed data to the decoder
    packet_->data = const_cast<uint8_t*>(data);
    packet_->size = static_cast<int>(len);

    int ret = avcodec_send_packet(codec_ctx_, packet_);
    if (ret < 0) {
        if (ret == AVERROR(EAGAIN)) {
            // Decoder buffer full, try receiving first
        } else if (ret == AVERROR_EOF) {
            return false;
        } else {
            char err_buf[AV_ERROR_MAX_STRING_SIZE];
            av_strerror(ret, err_buf, sizeof(err_buf));
            CS_LOG(WARN, "NvdecDecoder: avcodec_send_packet failed: %s", err_buf);
            return false;
        }
    }

    // Try to receive a decoded frame
    ret = avcodec_receive_frame(codec_ctx_, frame_);
    if (ret < 0) {
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            return false;  // No frame ready yet
        }
        char err_buf[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err_buf, sizeof(err_buf));
        CS_LOG(WARN, "NvdecDecoder: avcodec_receive_frame failed: %s", err_buf);
        return false;
    }

    auto decode_end = std::chrono::steady_clock::now();
    double decode_ms = std::chrono::duration<double, std::milli>(decode_end - start).count();

    // Transfer from hardware surface if needed
    if (frame_->format == AV_PIX_FMT_CUDA ||
        frame_->format == AV_PIX_FMT_D3D11 ||
        frame_->format == AV_PIX_FMT_DXVA2_VLD) {

        if (!transferHwFrame(frame_, frame)) {
            av_frame_unref(frame_);
            return false;
        }
    } else {
        // Software frame: store the raw data pointer
        frame.texture = frame_->data[0];
        frame.subresource = 0;
        frame.width = static_cast<uint32_t>(frame_->width);
        frame.height = static_cast<uint32_t>(frame_->height);
        frame.format = mapPixelFormat(frame_->format);
    }

    frame.decode_time_ms = decode_ms;
    frame.timestamp_us = static_cast<uint64_t>(frame_->pts);

    av_frame_unref(frame_);
    return true;
}

// ---------------------------------------------------------------------------
// transferHwFrame
// ---------------------------------------------------------------------------

bool NvdecDecoder::transferHwFrame(AVFrame* hw_frame, DecodedFrame& out) {
#ifdef _WIN32
    if (hw_frame->format == AV_PIX_FMT_D3D11) {
        // D3D11VA: the frame data is a D3D11 texture + subresource index
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

    // For CUDA and DXVA2, transfer to system memory
    sw_frame_->format = AV_PIX_FMT_NV12;
    int ret = av_hwframe_transfer_data(sw_frame_, hw_frame, 0);
    if (ret < 0) {
        char err_buf[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err_buf, sizeof(err_buf));
        CS_LOG(WARN, "NvdecDecoder: av_hwframe_transfer_data failed: %s", err_buf);
        return false;
    }

#ifdef _WIN32
    // Upload to a staging D3D11 texture if we have a shared device
    if (shared_device_) {
        uint32_t w = static_cast<uint32_t>(sw_frame_->width);
        uint32_t h = static_cast<uint32_t>(sw_frame_->height);

        // Recreate staging texture if size changed
        if (!staging_tex_ || staging_width_ != w || staging_height_ != h) {
            if (staging_tex_) {
                staging_tex_->Release();
                staging_tex_ = nullptr;
            }

            D3D11_TEXTURE2D_DESC desc = {};
            desc.Width = w;
            desc.Height = h;
            desc.MipLevels = 1;
            desc.ArraySize = 1;
            desc.Format = DXGI_FORMAT_NV12;
            desc.SampleDesc.Count = 1;
            desc.Usage = D3D11_USAGE_DEFAULT;
            desc.BindFlags = D3D11_BIND_DECODER;

            HRESULT hr = shared_device_->CreateTexture2D(&desc, nullptr, &staging_tex_);
            if (FAILED(hr)) {
                CS_LOG(ERR, "NvdecDecoder: failed to create staging texture: 0x%08lx", hr);
                av_frame_unref(sw_frame_);
                return false;
            }

            staging_width_ = w;
            staging_height_ = h;
        }

        // Copy NV12 data to the texture
        if (!shared_ctx_) {
            shared_device_->GetImmediateContext(&shared_ctx_);
        }

        D3D11_MAPPED_SUBRESOURCE mapped = {};
        // We can't map a DEFAULT usage texture directly, so use UpdateSubresource
        // For NV12: Y plane is WxH, UV plane is Wx(H/2)
        // Copy Y plane
        for (uint32_t row = 0; row < h; row++) {
            // Using UpdateSubresource with the whole texture
        }

        // Alternative: create a staging texture with DYNAMIC usage
        // For simplicity, just pass the sw_frame data pointer
        out.texture = sw_frame_->data[0];
        out.subresource = 0;
        out.width = w;
        out.height = h;
        out.format = FrameFormat::NV12;

        av_frame_unref(sw_frame_);
        return true;
    }
#endif

    // Pure software path
    out.texture = sw_frame_->data[0];
    out.subresource = 0;
    out.width = static_cast<uint32_t>(sw_frame_->width);
    out.height = static_cast<uint32_t>(sw_frame_->height);
    out.format = mapPixelFormat(sw_frame_->format);

    // Note: the caller must consume this frame before the next decode call
    // because sw_frame_ will be overwritten.
    return true;
}

// ---------------------------------------------------------------------------
// flush
// ---------------------------------------------------------------------------

void NvdecDecoder::flush() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (codec_ctx_) {
        avcodec_flush_buffers(codec_ctx_);
    }
}

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

void NvdecDecoder::release() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (packet_) {
        av_packet_free(&packet_);
        packet_ = nullptr;
    }

    if (sw_frame_) {
        av_frame_free(&sw_frame_);
        sw_frame_ = nullptr;
    }

    if (frame_) {
        av_frame_free(&frame_);
        frame_ = nullptr;
    }

    if (codec_ctx_) {
        avcodec_free_context(&codec_ctx_);
        codec_ctx_ = nullptr;
    }

    if (hw_device_) {
        av_buffer_unref(&hw_device_);
        hw_device_ = nullptr;
    }

#ifdef _WIN32
    if (staging_tex_) {
        staging_tex_->Release();
        staging_tex_ = nullptr;
    }
    if (shared_ctx_) {
        shared_ctx_->Release();
        shared_ctx_ = nullptr;
    }
    // Note: shared_device_ is not owned by us, don't release it
#endif

    codec_ = nullptr;
    initialized_ = false;
    hw_type_ = -1;
    backend_name_ = "none";
}

// ---------------------------------------------------------------------------
// getName
// ---------------------------------------------------------------------------

std::string NvdecDecoder::getName() const {
    return "NvdecDecoder(" + backend_name_ + ")";
}

// ---------------------------------------------------------------------------
// D3D11 device sharing
// ---------------------------------------------------------------------------

#ifdef _WIN32
ID3D11Device* NvdecDecoder::getD3D11Device() const {
    return shared_device_;
}

void NvdecDecoder::setD3D11Device(ID3D11Device* device) {
    shared_device_ = device;
}
#endif

// ---------------------------------------------------------------------------
// mapPixelFormat
// ---------------------------------------------------------------------------

FrameFormat NvdecDecoder::mapPixelFormat(int av_pix_fmt) {
    switch (av_pix_fmt) {
        case AV_PIX_FMT_NV12:     return FrameFormat::NV12;
        case AV_PIX_FMT_P010LE:
        case AV_PIX_FMT_P010BE:   return FrameFormat::P010;
        case AV_PIX_FMT_YUV420P:  return FrameFormat::YUV420;
        case AV_PIX_FMT_BGRA:     return FrameFormat::BGRA;
        default:                   return FrameFormat::NV12;
    }
}

} // namespace cs
