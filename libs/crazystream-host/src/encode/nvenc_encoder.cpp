///////////////////////////////////////////////////////////////////////////////
// nvenc_encoder.cpp -- NVENC hardware encoder implementation
//
// Dynamically loads nvEncodeAPI64.dll and drives the NVIDIA hardware encoder.
// Supports H.264, HEVC, and AV1 with ultra-low-latency tuning.
///////////////////////////////////////////////////////////////////////////////

#include "nvenc_encoder.h"
#include <cs/common.h>

#include <d3d11.h>
#include <cstring>

#pragma comment(lib, "d3d11.lib")

namespace cs::host {

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static const char* nvencStatusString(NVENCSTATUS st) {
    switch (st) {
        case NV_ENC_SUCCESS:                      return "SUCCESS";
        case NV_ENC_ERR_NO_ENCODE_DEVICE:         return "NO_ENCODE_DEVICE";
        case NV_ENC_ERR_UNSUPPORTED_DEVICE:       return "UNSUPPORTED_DEVICE";
        case NV_ENC_ERR_INVALID_ENCODERDEVICE:    return "INVALID_ENCODERDEVICE";
        case NV_ENC_ERR_INVALID_DEVICE:           return "INVALID_DEVICE";
        case NV_ENC_ERR_DEVICE_NOT_EXIST:         return "DEVICE_NOT_EXIST";
        case NV_ENC_ERR_INVALID_PTR:              return "INVALID_PTR";
        case NV_ENC_ERR_INVALID_EVENT:            return "INVALID_EVENT";
        case NV_ENC_ERR_INVALID_PARAM:            return "INVALID_PARAM";
        case NV_ENC_ERR_INVALID_CALL:             return "INVALID_CALL";
        case NV_ENC_ERR_OUT_OF_MEMORY:            return "OUT_OF_MEMORY";
        case NV_ENC_ERR_ENCODER_NOT_INITIALIZED:  return "ENCODER_NOT_INITIALIZED";
        case NV_ENC_ERR_UNSUPPORTED_PARAM:        return "UNSUPPORTED_PARAM";
        case NV_ENC_ERR_LOCK_BUSY:                return "LOCK_BUSY";
        case NV_ENC_ERR_NOT_ENOUGH_BUFFER:        return "NOT_ENOUGH_BUFFER";
        case NV_ENC_ERR_INVALID_VERSION:          return "INVALID_VERSION";
        case NV_ENC_ERR_MAP_FAILED:               return "MAP_FAILED";
        case NV_ENC_ERR_NEED_MORE_INPUT:          return "NEED_MORE_INPUT";
        case NV_ENC_ERR_ENCODER_BUSY:             return "ENCODER_BUSY";
        case NV_ENC_ERR_GENERIC:                  return "GENERIC";
        default:                                  return "UNKNOWN";
    }
}

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------

NvencEncoder::NvencEncoder() = default;

NvencEncoder::~NvencEncoder() {
    release();
}

// ---------------------------------------------------------------------------
// loadLibrary -- load nvEncodeAPI64.dll and fill the function table
// ---------------------------------------------------------------------------

bool NvencEncoder::loadLibrary() {
    dll_ = LoadLibraryA("nvEncodeAPI64.dll");
    if (!dll_) {
        CS_LOG(ERR, "NVENC: failed to load nvEncodeAPI64.dll (error=%lu)", GetLastError());
        return false;
    }

    createInst_ = reinterpret_cast<NvEncodeAPICreateInstance_t>(
        GetProcAddress(dll_, "NvEncodeAPICreateInstance"));
    if (!createInst_) {
        CS_LOG(ERR, "NVENC: NvEncodeAPICreateInstance export not found");
        FreeLibrary(dll_);
        dll_ = nullptr;
        return false;
    }

    api_.version = NVENC_STRUCT_VERSION(NV_ENCODE_API_FUNCTION_LIST, 2);
    NVENCSTATUS st = createInst_(&api_);
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(ERR, "NVENC: NvEncodeAPICreateInstance failed: %s", nvencStatusString(st));
        FreeLibrary(dll_);
        dll_ = nullptr;
        return false;
    }

    CS_LOG(DEBUG, "NVENC: library loaded, API table populated");
    return true;
}

// ---------------------------------------------------------------------------
// openSession -- create a D3D11 device and open an NVENC encode session
// ---------------------------------------------------------------------------

bool NvencEncoder::openSession() {
    // Create a private D3D11 device for the encoder.
    // NVENC needs a D3D11 device (or CUDA context) to work with.
    ID3D11Device* dev = nullptr;
    D3D_FEATURE_LEVEL level;
    D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0 };

    HRESULT hr = D3D11CreateDevice(
        nullptr,
        D3D_DRIVER_TYPE_HARDWARE,
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        levels, 2,
        D3D11_SDK_VERSION,
        &dev, &level, nullptr
    );
    if (FAILED(hr)) {
        CS_LOG(ERR, "NVENC: D3D11CreateDevice failed (0x%08lX)", hr);
        return false;
    }
    d3d_device_ = dev;

    // Open encode session.
    NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS sessParams = {};
    sessParams.version    = NVENC_STRUCT_VERSION(NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS, 1);
    sessParams.deviceType = NV_ENC_DEVICE_TYPE_DIRECTX;
    sessParams.device     = d3d_device_;
    sessParams.apiVersion = NVENCAPI_VERSION;

    NVENCSTATUS st = api_.nvEncOpenEncodeSessionEx(&sessParams, &encoder_);
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(ERR, "NVENC: OpenEncodeSessionEx failed: %s", nvencStatusString(st));
        reinterpret_cast<ID3D11Device*>(d3d_device_)->Release();
        d3d_device_ = nullptr;
        return false;
    }

    CS_LOG(DEBUG, "NVENC: encode session opened (encoder=%p)", encoder_);
    return true;
}

// ---------------------------------------------------------------------------
// isCodecSupported -- probe whether the GPU supports the given codec
// ---------------------------------------------------------------------------

bool NvencEncoder::isCodecSupported(CodecType codec) {
    if (!encoder_) return false;

    uint32_t count = 0;
    NVENCSTATUS st = api_.nvEncGetEncodeGUIDCount(encoder_, &count);
    if (st != NV_ENC_SUCCESS || count == 0) return false;

    std::vector<NV_ENC_GUID> guids(count);
    uint32_t actual = 0;
    st = api_.nvEncGetEncodeGUIDs(encoder_, guids.data(), count, &actual);
    if (st != NV_ENC_SUCCESS) return false;

    NV_ENC_GUID target = codecToGuid(codec);
    for (uint32_t i = 0; i < actual; ++i) {
        if (guids[i] == target) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// initialize -- configure and initialize the NVENC encoder
// ---------------------------------------------------------------------------

bool NvencEncoder::initialize(const EncoderConfig& config) {
    if (initialized_) release();
    config_ = config;

    if (!loadLibrary()) return false;
    if (!openSession()) return false;

    // Verify codec support.
    if (!isCodecSupported(config.codec)) {
        CS_LOG(ERR, "NVENC: codec %s not supported by this GPU", codecTypeName(config.codec));
        release();
        return false;
    }
    CS_LOG(INFO, "NVENC: codec %s is supported", codecTypeName(config.codec));

    NV_ENC_GUID encodeGuid = codecToGuid(config.codec);
    NV_ENC_GUID presetGuid = NV_ENC_PRESET_P1_GUID;  // Lowest latency

    // Get the preset configuration as a starting point.
    NV_ENC_PRESET_CONFIG presetConfig = {};
    presetConfig.version           = NVENC_STRUCT_VERSION(NV_ENC_PRESET_CONFIG, 1);
    presetConfig.presetCfg.version = NVENC_STRUCT_VERSION(NV_ENC_CONFIG, 1);

    NVENCSTATUS st = NV_ENC_SUCCESS;
    if (api_.nvEncGetEncodePresetConfigEx) {
        st = api_.nvEncGetEncodePresetConfigEx(encoder_, encodeGuid, presetGuid,
                                                NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY,
                                                &presetConfig);
    }
    if (st != NV_ENC_SUCCESS && api_.nvEncGetEncodePresetConfig) {
        st = api_.nvEncGetEncodePresetConfig(encoder_, encodeGuid, presetGuid, &presetConfig);
    }
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(WARN, "NVENC: GetEncodePresetConfig failed: %s -- using defaults", nvencStatusString(st));
    }

    // Build the encoder config.
    encConfig_ = presetConfig.presetCfg;
    encConfig_.version = NVENC_STRUCT_VERSION(NV_ENC_CONFIG, 1);

    // GOP: all P-frames, no B-frames.
    encConfig_.gopLength       = config.gop_length;
    encConfig_.frameIntervalP  = 1;   // No B-frames (P-frames only)

    // Rate control: CBR for streaming.
    encConfig_.rcParams.rateControlMode = NV_ENC_PARAMS_RC_CBR;
    encConfig_.rcParams.averageBitRate  = config.bitrate_kbps * 1000;
    encConfig_.rcParams.maxBitRate      = config.max_bitrate_kbps * 1000;
    encConfig_.rcParams.vbvBufferSize   = config.bitrate_kbps * 1000 / config.fps;
    encConfig_.rcParams.vbvInitialDelay = encConfig_.rcParams.vbvBufferSize;

    // Codec-specific settings.
    if (config.codec == CodecType::H264) {
        auto& h264 = encConfig_.encodeCodecConfig_h264;
        h264.idrPeriod         = config.gop_length;
        h264.repeatSPSPPS      = 1;   // Repeat SPS/PPS before each IDR
        h264.enableIntraRefresh = config.enable_intra_refresh ? 1 : 0;
        h264.intraRefreshPeriod = config.intra_refresh_period;
        h264.intraRefreshCnt    = 5;   // Number of intra-refresh frames
        h264.maxNumRefFrames    = 1;   // Minimize latency
        encConfig_.profileGUID  = NV_ENC_H264_PROFILE_HIGH_GUID;
    } else if (config.codec == CodecType::HEVC) {
        auto& hevc = encConfig_.encodeCodecConfig_hevc;
        hevc.idrPeriod         = config.gop_length;
        hevc.repeatSPSPPS      = 1;
        hevc.enableIntraRefresh = config.enable_intra_refresh ? 1 : 0;
        hevc.intraRefreshPeriod = config.intra_refresh_period;
        hevc.intraRefreshCnt    = 5;
        encConfig_.profileGUID  = NV_ENC_HEVC_PROFILE_MAIN_GUID;
    } else {
        // AV1
        encConfig_.profileGUID = NV_ENC_AV1_PROFILE_MAIN_GUID;
    }

    // Initialize parameters.
    memset(&initParams_, 0, sizeof(initParams_));
    initParams_.version        = NVENC_STRUCT_VERSION(NV_ENC_INITIALIZE_PARAMS, 1);
    initParams_.encodeGUID     = encodeGuid;
    initParams_.presetGUID     = presetGuid;
    initParams_.encodeWidth    = config.width;
    initParams_.encodeHeight   = config.height;
    initParams_.darWidth       = config.width;
    initParams_.darHeight      = config.height;
    initParams_.frameRateNum   = config.fps;
    initParams_.frameRateDen   = 1;
    initParams_.enableEncodeAsync = 0;  // Synchronous mode for simplicity
    initParams_.enablePTD      = 1;     // Let NVENC decide picture types
    initParams_.encodeConfig   = &encConfig_;
    initParams_.maxEncodeWidth = config.width;
    initParams_.maxEncodeHeight= config.height;
    initParams_.tuningInfo     = NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY;

    st = api_.nvEncInitializeEncoder(encoder_, &initParams_);
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(ERR, "NVENC: InitializeEncoder failed: %s", nvencStatusString(st));
        release();
        return false;
    }

    CS_LOG(INFO, "NVENC: encoder initialized -- %s %ux%u @ %u fps, %u kbps CBR",
           codecTypeName(config.codec), config.width, config.height,
           config.fps, config.bitrate_kbps);

    // Create input and output buffers.
    for (int i = 0; i < NUM_BUFFERS; ++i) {
        // Input buffer.
        NV_ENC_CREATE_INPUT_BUFFER inBuf = {};
        inBuf.version   = NVENC_STRUCT_VERSION(NV_ENC_CREATE_INPUT_BUFFER, 1);
        inBuf.width     = config.width;
        inBuf.height    = config.height;
        inBuf.bufferFmt = NV_ENC_BUFFER_FORMAT_ARGB;  // BGRA is ARGB with swizzle
        inBuf.memoryHeap = NV_ENC_MEMORY_HEAP_AUTOSELECT;

        st = api_.nvEncCreateInputBuffer(encoder_, &inBuf);
        if (st != NV_ENC_SUCCESS) {
            CS_LOG(ERR, "NVENC: CreateInputBuffer[%d] failed: %s", i, nvencStatusString(st));
            release();
            return false;
        }
        input_bufs_[i] = inBuf.inputBuffer;

        // Output (bitstream) buffer.
        NV_ENC_CREATE_BITSTREAM_BUFFER outBuf = {};
        outBuf.version = NVENC_STRUCT_VERSION(NV_ENC_CREATE_BITSTREAM_BUFFER, 1);
        outBuf.memoryHeap = NV_ENC_MEMORY_HEAP_AUTOSELECT;

        st = api_.nvEncCreateBitstreamBuffer(encoder_, &outBuf);
        if (st != NV_ENC_SUCCESS) {
            CS_LOG(ERR, "NVENC: CreateBitstreamBuffer[%d] failed: %s", i, nvencStatusString(st));
            release();
            return false;
        }
        output_bufs_[i] = outBuf.bitstreamBuffer;
    }

    initialized_ = true;
    frame_num_   = 0;
    force_idr_   = false;

    CS_LOG(INFO, "NVENC: ready (double-buffered, %d input/output pairs)", NUM_BUFFERS);
    return true;
}

// ---------------------------------------------------------------------------
// encode -- encode one frame
// ---------------------------------------------------------------------------

bool NvencEncoder::encode(const CapturedFrame& frame, EncodedPacket& packet) {
    if (!initialized_) return false;

    int idx = cur_buf_;
    cur_buf_ = (cur_buf_ + 1) % NUM_BUFFERS;

    // Lock the input buffer and copy frame data into it.
    NV_ENC_LOCK_INPUT_BUFFER lockIn = {};
    lockIn.version     = NVENC_STRUCT_VERSION(NV_ENC_LOCK_INPUT_BUFFER, 1);
    lockIn.inputBuffer = input_bufs_[idx];

    NVENCSTATUS st = api_.nvEncLockInputBuffer(encoder_, &lockIn);
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(ERR, "NVENC: LockInputBuffer failed: %s", nvencStatusString(st));
        return false;
    }

    // Copy the captured frame into the NVENC input buffer.
    // The source may be BGRA from DXGI capture or NV12 from NvFBC.
    if (frame.format == FrameFormat::BGRA8 || frame.format == FrameFormat::ARGB8) {
        // Row-by-row copy (source pitch may differ from destination pitch).
        uint32_t rowBytes = frame.width * 4;
        const uint8_t* src = static_cast<const uint8_t*>(frame.gpu_ptr);
        uint8_t* dst = static_cast<uint8_t*>(lockIn.bufferDataPtr);
        uint32_t srcPitch = frame.pitch;
        uint32_t dstPitch = lockIn.pitch;

        for (uint32_t y = 0; y < frame.height; ++y) {
            memcpy(dst + y * dstPitch, src + y * srcPitch, rowBytes);
        }
    } else if (frame.format == FrameFormat::NV12) {
        // NV12: luma plane + interleaved chroma plane.
        const uint8_t* src = static_cast<const uint8_t*>(frame.gpu_ptr);
        uint8_t* dst = static_cast<uint8_t*>(lockIn.bufferDataPtr);
        uint32_t srcPitch = frame.pitch;
        uint32_t dstPitch = lockIn.pitch;

        // Luma plane.
        for (uint32_t y = 0; y < frame.height; ++y) {
            memcpy(dst + y * dstPitch, src + y * srcPitch, frame.width);
        }
        // Chroma plane (half height).
        const uint8_t* srcChroma = src + frame.height * srcPitch;
        uint8_t* dstChroma = dst + frame.height * dstPitch;
        for (uint32_t y = 0; y < frame.height / 2; ++y) {
            memcpy(dstChroma + y * dstPitch, srcChroma + y * srcPitch, frame.width);
        }
    }

    api_.nvEncUnlockInputBuffer(encoder_, input_bufs_[idx]);

    // Set up the encode picture params.
    NV_ENC_PIC_PARAMS picParams = {};
    picParams.version         = NVENC_STRUCT_VERSION(NV_ENC_PIC_PARAMS, 1);
    picParams.inputWidth      = frame.width;
    picParams.inputHeight     = frame.height;
    picParams.inputPitch      = lockIn.pitch;
    picParams.inputBuffer     = input_bufs_[idx];
    picParams.outputBitstream = output_bufs_[idx];
    picParams.bufferFmt       = frameFormatToNvenc(frame.format);
    picParams.frameIdx        = frame_num_;
    picParams.inputTimeStamp  = frame.timestamp_us;
    picParams.pictureType     = NV_ENC_PIC_TYPE_UNKNOWN;  // Let PTD decide

    if (force_idr_) {
        picParams.encodePicFlags = NV_ENC_PIC_FLAG_FORCEIDR | NV_ENC_PIC_FLAG_OUTPUT_SPSPPS;
        force_idr_ = false;
        CS_LOG(DEBUG, "NVENC: forcing IDR frame at frame %u", frame_num_);
    }

    // Encode.
    st = api_.nvEncEncodePicture(encoder_, &picParams);
    if (st != NV_ENC_SUCCESS && st != NV_ENC_ERR_NEED_MORE_INPUT) {
        CS_LOG(ERR, "NVENC: EncodePicture failed: %s", nvencStatusString(st));
        return false;
    }

    if (st == NV_ENC_ERR_NEED_MORE_INPUT) {
        // Encoder needs more input (shouldn't happen with sync mode + no B-frames).
        CS_LOG(DEBUG, "NVENC: encoder needs more input");
        return false;
    }

    // Lock the bitstream and retrieve the encoded data.
    NV_ENC_LOCK_BITSTREAM lockBits = {};
    lockBits.version          = NVENC_STRUCT_VERSION(NV_ENC_LOCK_BITSTREAM, 1);
    lockBits.outputBitstream  = output_bufs_[idx];

    st = api_.nvEncLockBitstream(encoder_, &lockBits);
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(ERR, "NVENC: LockBitstream failed: %s", nvencStatusString(st));
        return false;
    }

    // Copy bitstream to output packet.
    packet.data.resize(lockBits.bitstreamSizeInBytes);
    memcpy(packet.data.data(), lockBits.bitstreamBufferPtr, lockBits.bitstreamSizeInBytes);
    packet.timestamp_us = frame.timestamp_us;
    packet.frame_number = frame_num_;
    packet.codec        = config_.codec;
    packet.is_keyframe  = (lockBits.pictureType == NV_ENC_PIC_TYPE_IDR ||
                           lockBits.pictureType == NV_ENC_PIC_TYPE_I);

    api_.nvEncUnlockBitstream(encoder_, output_bufs_[idx]);

    frame_num_++;

    CS_LOG(TRACE, "NVENC: encoded frame %u, %u bytes, keyframe=%d",
           packet.frame_number, (uint32_t)packet.data.size(), packet.is_keyframe);

    return true;
}

// ---------------------------------------------------------------------------
// reconfigure -- change bitrate/fps without recreating the session
// ---------------------------------------------------------------------------

bool NvencEncoder::reconfigure(const EncoderConfig& config) {
    if (!initialized_) return false;

    // Clamp bitrate to bounds.
    uint32_t newBitrate = config.bitrate_kbps;
    if (newBitrate < config_.min_bitrate_kbps) newBitrate = config_.min_bitrate_kbps;
    if (newBitrate > config_.max_bitrate_kbps) newBitrate = config_.max_bitrate_kbps;

    // Update the config.
    encConfig_.rcParams.averageBitRate = newBitrate * 1000;
    encConfig_.rcParams.maxBitRate     = config.max_bitrate_kbps * 1000;
    encConfig_.rcParams.vbvBufferSize  = newBitrate * 1000 / config.fps;
    encConfig_.rcParams.vbvInitialDelay= encConfig_.rcParams.vbvBufferSize;

    initParams_.frameRateNum = config.fps;
    initParams_.frameRateDen = 1;

    NV_ENC_RECONFIGURE_PARAMS reconfParams = {};
    reconfParams.version          = NVENC_STRUCT_VERSION(NV_ENC_RECONFIGURE_PARAMS, 1);
    reconfParams.reInitEncodeParams = initParams_;
    reconfParams.resetEncoder     = 0;
    reconfParams.forceIDR         = 0;

    NVENCSTATUS st = api_.nvEncReconfigureEncoder(encoder_, &reconfParams);
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(WARN, "NVENC: ReconfigureEncoder failed: %s", nvencStatusString(st));
        return false;
    }

    config_.bitrate_kbps = newBitrate;
    config_.fps          = config.fps;

    CS_LOG(INFO, "NVENC: reconfigured -- bitrate=%u kbps, fps=%u", newBitrate, config.fps);
    return true;
}

// ---------------------------------------------------------------------------
// forceIdr -- set flag to force IDR on next encode call
// ---------------------------------------------------------------------------

void NvencEncoder::forceIdr() {
    force_idr_ = true;
    CS_LOG(DEBUG, "NVENC: IDR requested for next frame");
}

// ---------------------------------------------------------------------------
// flush -- send EOS to drain any pending frames
// ---------------------------------------------------------------------------

void NvencEncoder::flush() {
    if (!initialized_ || !encoder_) return;

    NV_ENC_PIC_PARAMS eosParams = {};
    eosParams.version        = NVENC_STRUCT_VERSION(NV_ENC_PIC_PARAMS, 1);
    eosParams.encodePicFlags = NV_ENC_PIC_FLAG_EOS;

    NVENCSTATUS st = api_.nvEncEncodePicture(encoder_, &eosParams);
    if (st != NV_ENC_SUCCESS) {
        CS_LOG(WARN, "NVENC: flush (EOS) returned: %s", nvencStatusString(st));
    } else {
        CS_LOG(DEBUG, "NVENC: flushed encoder pipeline");
    }
}

// ---------------------------------------------------------------------------
// release -- destroy buffers, session, unload DLL
// ---------------------------------------------------------------------------

void NvencEncoder::release() {
    if (encoder_) {
        // Destroy input buffers.
        for (int i = 0; i < NUM_BUFFERS; ++i) {
            if (input_bufs_[i]) {
                api_.nvEncDestroyInputBuffer(encoder_, input_bufs_[i]);
                input_bufs_[i] = nullptr;
            }
            if (output_bufs_[i]) {
                api_.nvEncDestroyBitstreamBuffer(encoder_, output_bufs_[i]);
                output_bufs_[i] = nullptr;
            }
        }

        api_.nvEncDestroyEncoder(encoder_);
        encoder_ = nullptr;
    }

    if (d3d_device_) {
        reinterpret_cast<ID3D11Device*>(d3d_device_)->Release();
        d3d_device_ = nullptr;
    }

    if (dll_) {
        FreeLibrary(dll_);
        dll_ = nullptr;
    }

    initialized_ = false;
    frame_num_   = 0;
    force_idr_   = false;
    cur_buf_     = 0;

    CS_LOG(DEBUG, "NVENC: resources released");
}

// ---------------------------------------------------------------------------
// getCodecName
// ---------------------------------------------------------------------------

std::string NvencEncoder::getCodecName() const {
    return std::string("NVENC ") + codecTypeName(config_.codec);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

NV_ENC_GUID NvencEncoder::codecToGuid(CodecType codec) const {
    switch (codec) {
        case CodecType::H264: return NV_ENC_CODEC_H264_GUID;
        case CodecType::HEVC: return NV_ENC_CODEC_HEVC_GUID;
        case CodecType::AV1:  return NV_ENC_CODEC_AV1_GUID;
    }
    return NV_ENC_CODEC_H264_GUID;
}

NV_ENC_GUID NvencEncoder::profileGuid(CodecType codec) const {
    switch (codec) {
        case CodecType::H264: return NV_ENC_H264_PROFILE_HIGH_GUID;
        case CodecType::HEVC: return NV_ENC_HEVC_PROFILE_MAIN_GUID;
        case CodecType::AV1:  return NV_ENC_AV1_PROFILE_MAIN_GUID;
    }
    return NV_ENC_H264_PROFILE_HIGH_GUID;
}

NV_ENC_BUFFER_FORMAT NvencEncoder::frameFormatToNvenc(FrameFormat fmt) const {
    switch (fmt) {
        case FrameFormat::BGRA8: return NV_ENC_BUFFER_FORMAT_ARGB;   // BGRA maps to ARGB in NVENC
        case FrameFormat::ARGB8: return NV_ENC_BUFFER_FORMAT_ARGB;
        case FrameFormat::NV12:  return NV_ENC_BUFFER_FORMAT_NV12;
    }
    return NV_ENC_BUFFER_FORMAT_ARGB;
}

} // namespace cs::host
