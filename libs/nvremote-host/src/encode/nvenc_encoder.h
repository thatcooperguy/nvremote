///////////////////////////////////////////////////////////////////////////////
// nvenc_encoder.h -- NVENC hardware encoder (dynamically loaded)
//
// Loads nvEncodeAPI64.dll at runtime and uses the NVIDIA Video Codec SDK
// to hardware-encode captured frames into H.264, HEVC, or AV1 bitstreams.
//
// Key features:
//   - Ultra-low-latency tuning (P1 preset, zero B-frames)
//   - CBR rate control for streaming
//   - Dynamic reconfiguration of bitrate/fps without session recreation
//   - On-demand IDR frame insertion
//   - Async encode with double-buffered input/output
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "encoder_interface.h"

#ifndef WIN32_LEAN_AND_MEAN
#  define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>

#include <cstdint>
#include <vector>

namespace cs::host {

// ---------------------------------------------------------------------------
// Minimal NVENC type declarations.
//
// These are compatible with NVIDIA Video Codec SDK 12.x.  We define just
// enough to dynamically load and call the encoder without the SDK headers.
// All enums and structs use the same memory layout as the official headers.
// ---------------------------------------------------------------------------

// NVENC status codes
enum NVENCSTATUS : int32_t {
    NV_ENC_SUCCESS                          = 0,
    NV_ENC_ERR_NO_ENCODE_DEVICE             = 1,
    NV_ENC_ERR_UNSUPPORTED_DEVICE           = 2,
    NV_ENC_ERR_INVALID_ENCODERDEVICE        = 3,
    NV_ENC_ERR_INVALID_DEVICE               = 4,
    NV_ENC_ERR_DEVICE_NOT_EXIST             = 5,
    NV_ENC_ERR_INVALID_PTR                  = 6,
    NV_ENC_ERR_INVALID_EVENT                = 7,
    NV_ENC_ERR_INVALID_PARAM                = 8,
    NV_ENC_ERR_INVALID_CALL                 = 9,
    NV_ENC_ERR_OUT_OF_MEMORY                = 10,
    NV_ENC_ERR_ENCODER_NOT_INITIALIZED      = 11,
    NV_ENC_ERR_UNSUPPORTED_PARAM            = 12,
    NV_ENC_ERR_LOCK_BUSY                    = 13,
    NV_ENC_ERR_NOT_ENOUGH_BUFFER            = 14,
    NV_ENC_ERR_INVALID_VERSION              = 15,
    NV_ENC_ERR_MAP_FAILED                   = 16,
    NV_ENC_ERR_NEED_MORE_INPUT              = 17,
    NV_ENC_ERR_ENCODER_BUSY                 = 18,
    NV_ENC_ERR_EVENT_NOT_REGISTERD          = 19,
    NV_ENC_ERR_GENERIC                      = 20,
    NV_ENC_ERR_INCOMPATIBLE_CLIENT_KEY      = 21,
    NV_ENC_ERR_UNIMPLEMENTED               = 22,
    NV_ENC_ERR_RESOURCE_REGISTER_FAILED     = 23,
    NV_ENC_ERR_RESOURCE_NOT_REGISTERED      = 24,
    NV_ENC_ERR_RESOURCE_NOT_MAPPED          = 25,
};

// GUID definition for codec and profile selection.
struct NV_ENC_GUID {
    uint32_t Data1;
    uint16_t Data2;
    uint16_t Data3;
    uint8_t  Data4[8];
};

inline bool operator==(const NV_ENC_GUID& a, const NV_ENC_GUID& b) {
    return memcmp(&a, &b, sizeof(NV_ENC_GUID)) == 0;
}

// Well-known codec GUIDs
static const NV_ENC_GUID NV_ENC_CODEC_H264_GUID =
    { 0x6BC82762, 0x4E63, 0x4CA4, { 0xAA, 0x05, 0x1E, 0x69, 0x4F, 0x32, 0xDD, 0x57 } };
static const NV_ENC_GUID NV_ENC_CODEC_HEVC_GUID =
    { 0x790CDC88, 0x4522, 0x4D7B, { 0x94, 0x25, 0xBD, 0xA9, 0x97, 0x5F, 0x76, 0x03 } };
static const NV_ENC_GUID NV_ENC_CODEC_AV1_GUID =
    { 0x0A352289, 0x0AA7, 0x4759, { 0x86, 0x2D, 0x5D, 0x15, 0xCD, 0x16, 0xD2, 0x54 } };

// Profile GUIDs
static const NV_ENC_GUID NV_ENC_H264_PROFILE_HIGH_GUID =
    { 0xE7CBC309, 0x4F7A, 0x4B89, { 0xAF, 0x2A, 0xD5, 0x37, 0xC9, 0x2B, 0xE3, 0x10 } };
static const NV_ENC_GUID NV_ENC_HEVC_PROFILE_MAIN_GUID =
    { 0xB514C39A, 0x09A3, 0x4978, { 0x92, 0x80, 0x15, 0x62, 0xF1, 0x14, 0x6E, 0xF1 } };
static const NV_ENC_GUID NV_ENC_AV1_PROFILE_MAIN_GUID =
    { 0x5F2A39F5, 0xF14E, 0x4F95, { 0x9A, 0x39, 0x69, 0x69, 0xA5, 0xB1, 0xC6, 0xC4 } };

// Preset GUIDs (SDK 12.x style)
static const NV_ENC_GUID NV_ENC_PRESET_P1_GUID =
    { 0xFC0A8D3E, 0x45F8, 0x4CF8, { 0x80, 0xC7, 0x29, 0x88, 0x71, 0x59, 0x0E, 0xBF } };
static const NV_ENC_GUID NV_ENC_PRESET_P3_GUID =
    { 0x36850110, 0x3A07, 0x441F, { 0x94, 0xD5, 0x3E, 0x73, 0x71, 0xA2, 0x2E, 0x68 } };

// Tuning info
enum NV_ENC_TUNING_INFO : uint32_t {
    NV_ENC_TUNING_INFO_UNDEFINED         = 0,
    NV_ENC_TUNING_INFO_HIGH_QUALITY      = 1,
    NV_ENC_TUNING_INFO_LOW_LATENCY       = 2,
    NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY = 3,
    NV_ENC_TUNING_INFO_LOSSLESS          = 4,
};

// Rate control modes
enum NV_ENC_PARAMS_RC_MODE : uint32_t {
    NV_ENC_PARAMS_RC_CONSTQP    = 0x0,
    NV_ENC_PARAMS_RC_VBR        = 0x1,
    NV_ENC_PARAMS_RC_CBR        = 0x2,
    NV_ENC_PARAMS_RC_VBR_HQ     = 0x100,
    NV_ENC_PARAMS_RC_CBR_HQ     = 0x200,
};

// Picture type
enum NV_ENC_PIC_TYPE : uint32_t {
    NV_ENC_PIC_TYPE_P           = 0,
    NV_ENC_PIC_TYPE_B           = 1,
    NV_ENC_PIC_TYPE_I           = 2,
    NV_ENC_PIC_TYPE_IDR         = 3,
    NV_ENC_PIC_TYPE_BI          = 4,
    NV_ENC_PIC_TYPE_SKIPPED     = 5,
    NV_ENC_PIC_TYPE_INTRA_REFRESH = 6,
    NV_ENC_PIC_TYPE_UNKNOWN     = 0xFF,
};

// Input buffer format
enum NV_ENC_BUFFER_FORMAT : uint32_t {
    NV_ENC_BUFFER_FORMAT_UNDEFINED      = 0x00000000,
    NV_ENC_BUFFER_FORMAT_NV12           = 0x00000001,
    NV_ENC_BUFFER_FORMAT_YV12           = 0x00000010,
    NV_ENC_BUFFER_FORMAT_IYUV           = 0x00000100,
    NV_ENC_BUFFER_FORMAT_YUV444         = 0x00001000,
    NV_ENC_BUFFER_FORMAT_ARGB           = 0x00100000,
    NV_ENC_BUFFER_FORMAT_ABGR           = 0x01000000,
};

// Encode device type
enum NV_ENC_DEVICE_TYPE : uint32_t {
    NV_ENC_DEVICE_TYPE_DIRECTX  = 0,
    NV_ENC_DEVICE_TYPE_CUDA     = 1,
};

// Encode picture flags
enum NV_ENC_PIC_FLAGS : uint32_t {
    NV_ENC_PIC_FLAG_FORCEINTRA          = 0x1,
    NV_ENC_PIC_FLAG_FORCEIDR            = 0x2,
    NV_ENC_PIC_FLAG_OUTPUT_SPSPPS       = 0x4,
    NV_ENC_PIC_FLAG_EOS                 = 0x8,
};

// Memory heap (unused on modern drivers, kept for struct compat)
enum NV_ENC_MEMORY_HEAP : uint32_t {
    NV_ENC_MEMORY_HEAP_AUTOSELECT = 0,
};

// ---------------------------------------------------------------------------
// NVENC struct version macros -- must match SDK 12.x layout.
// The version is composed of struct size + API version in upper bits.
// ---------------------------------------------------------------------------
#define NVENC_API_VER_MAJOR 12
#define NVENC_API_VER_MINOR 2
#define NVENCAPI_VERSION ((NVENC_API_VER_MAJOR) | ((NVENC_API_VER_MINOR) << 24))

#define NV_ENC_STRUCT_VER(ver, structSize) \
    ((uint32_t)(structSize) | ((ver) << 16) | (NVENC_API_VER_MAJOR << 28))

// Simplified version macro used by most structs (version 1).
#define NVENC_STRUCT_VERSION(type, ver) \
    NV_ENC_STRUCT_VER(ver, sizeof(type))

// ---------------------------------------------------------------------------
// Minimal NVENC parameter structs.
// These have the same base layout as the SDK headers.  Fields we don't use
// are lumped into reserved arrays to keep the struct size correct.
// ---------------------------------------------------------------------------

#pragma pack(push, 8)

struct NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS {
    uint32_t            version         = 0;
    NV_ENC_DEVICE_TYPE  deviceType      = NV_ENC_DEVICE_TYPE_DIRECTX;
    void*               device          = nullptr;
    void*               reserved        = nullptr;
    uint32_t            apiVersion      = NVENCAPI_VERSION;
    uint32_t            reserved2[253]  = {};
};

struct NV_ENC_CAPS_PARAM {
    uint32_t version    = 0;
    uint32_t capsToQuery= 0;
    uint32_t reserved[62] = {};
};

struct NV_ENC_RC_PARAMS {
    uint32_t                version              = 0;
    NV_ENC_PARAMS_RC_MODE   rateControlMode      = NV_ENC_PARAMS_RC_CBR;
    uint32_t                constQP_I            = 0;
    uint32_t                constQP_P            = 0;
    uint32_t                constQP_B            = 0;
    uint32_t                averageBitRate       = 0;
    uint32_t                maxBitRate           = 0;
    uint32_t                vbvBufferSize        = 0;
    uint32_t                vbvInitialDelay      = 0;
    uint32_t                enableMinQP          = 0;
    uint32_t                enableMaxQP          = 0;
    // Remaining fields are zero-initialized via reserved.
    uint32_t                reserved[256]        = {};
};

struct NV_ENC_CONFIG_H264 {
    uint32_t enableStereoMVC           = 0;
    uint32_t hierarchicalPFrames       = 0;
    uint32_t hierarchicalBFrames       = 0;
    uint32_t outputBufferingPeriodSEI  = 0;
    uint32_t outputPictureTimingSEI    = 0;
    uint32_t outputAUD                 = 0;
    uint32_t disableSPSPPS             = 0;
    uint32_t outputFramePackingSEI     = 0;
    uint32_t outputRecoveryPointSEI    = 0;
    uint32_t enableIntraRefresh        = 0;
    uint32_t enableConstrainedEncoding = 0;
    uint32_t repeatSPSPPS             = 1;
    uint32_t enableVFR                 = 0;
    uint32_t enableLTR                 = 0;
    uint32_t qpPrimeYZeroTransformBypassFlag = 0;
    uint32_t useConstrainedIntraPred   = 0;
    uint32_t level                     = 0;   // 0 = auto
    uint32_t idrPeriod                 = 120;
    uint32_t separateColourPlaneFlag   = 0;
    uint32_t disableDeblockingFilterIDC= 0;
    uint32_t numTemporalLayers         = 0;
    uint32_t spsId                     = 0;
    uint32_t ppsId                     = 0;
    uint32_t sliceMode                 = 0;
    uint32_t sliceModeData             = 0;
    uint32_t maxNumRefFrames           = 0;
    uint32_t useBFramesAsRef           = 0;
    uint32_t numRefL0                  = 0;
    uint32_t numRefL1                  = 0;
    uint32_t intraRefreshPeriod        = 0;
    uint32_t intraRefreshCnt           = 0;
    uint32_t reserved[236]             = {};
};

struct NV_ENC_CONFIG_HEVC {
    uint32_t level                     = 0;
    uint32_t tier                      = 0;
    uint32_t minCUSize                 = 0;
    uint32_t maxCUSize                 = 0;
    uint32_t enableIntraRefresh        = 0;
    uint32_t intraRefreshPeriod        = 0;
    uint32_t intraRefreshCnt           = 0;
    uint32_t idrPeriod                 = 120;
    uint32_t repeatSPSPPS             = 1;
    uint32_t enableSAO                 = 0;
    uint32_t maxNumRefFramesInDPB      = 0;
    uint32_t reserved[252]             = {};
};

struct NV_ENC_CONFIG {
    uint32_t            version         = 0;
    NV_ENC_GUID         profileGUID     = {};
    uint32_t            gopLength       = 120;
    int32_t             frameIntervalP  = 1;   // 1 = no B-frames
    uint32_t            monoChromeEncoding = 0;
    uint32_t            frameFieldMode  = 0;   // 0 = progressive
    uint32_t            mvPrecision     = 0;
    NV_ENC_RC_PARAMS    rcParams        = {};
    // Codec-specific config -- we use a union-like approach.
    // In practice, only one of these is active.
    NV_ENC_CONFIG_H264  encodeCodecConfig_h264 = {};
    NV_ENC_CONFIG_HEVC  encodeCodecConfig_hevc = {};
    uint32_t            reserved[188]   = {};
};

struct NV_ENC_INITIALIZE_PARAMS {
    uint32_t            version          = 0;
    NV_ENC_GUID         encodeGUID       = {};
    NV_ENC_GUID         presetGUID       = {};
    uint32_t            encodeWidth      = 0;
    uint32_t            encodeHeight     = 0;
    uint32_t            darWidth         = 0;
    uint32_t            darHeight        = 0;
    uint32_t            frameRateNum     = 60;
    uint32_t            frameRateDen     = 1;
    uint32_t            enableEncodeAsync= 0;
    uint32_t            enablePTD        = 1;   // Picture Type Decision
    uint32_t            reportSliceOffsets = 0;
    uint32_t            enableSubFrameWrite = 0;
    uint32_t            enableExternalMEHints = 0;
    uint32_t            enableMEOnlyMode = 0;
    uint32_t            enableWeightedPrediction = 0;
    uint32_t            enableOutputInVidmem = 0;
    uint32_t            splitEncodeMode  = 0;
    NV_ENC_CONFIG*      encodeConfig     = nullptr;
    uint32_t            maxEncodeWidth   = 0;
    uint32_t            maxEncodeHeight  = 0;
    NV_ENC_TUNING_INFO  tuningInfo       = NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY;
    uint32_t            reserved[236]    = {};
};

struct NV_ENC_PRESET_CONFIG {
    uint32_t      version       = 0;
    NV_ENC_CONFIG presetCfg     = {};
    uint32_t      reserved[256] = {};
};

struct NV_ENC_CREATE_INPUT_BUFFER {
    uint32_t                version     = 0;
    uint32_t                width       = 0;
    uint32_t                height      = 0;
    NV_ENC_MEMORY_HEAP      memoryHeap  = NV_ENC_MEMORY_HEAP_AUTOSELECT;
    NV_ENC_BUFFER_FORMAT    bufferFmt   = NV_ENC_BUFFER_FORMAT_NV12;
    void*                   inputBuffer = nullptr;
    void*                   pSysMemBuffer = nullptr;
    uint32_t                reserved[57]= {};
};

struct NV_ENC_CREATE_BITSTREAM_BUFFER {
    uint32_t version         = 0;
    void*    bitstreamBuffer = nullptr;
    uint32_t size            = 0;
    NV_ENC_MEMORY_HEAP memoryHeap = NV_ENC_MEMORY_HEAP_AUTOSELECT;
    uint32_t reserved[59]    = {};
};

struct NV_ENC_LOCK_INPUT_BUFFER {
    uint32_t version      = 0;
    uint32_t doNotWait    = 0;
    void*    inputBuffer  = nullptr;
    void*    bufferDataPtr= nullptr;
    uint32_t pitch        = 0;
    uint32_t reserved[62] = {};
};

struct NV_ENC_LOCK_BITSTREAM {
    uint32_t           version            = 0;
    uint32_t           doNotWait          = 0;
    void*              outputBitstream    = nullptr;
    void*              sliceOffsets       = nullptr;
    uint32_t           frameIdx           = 0;
    uint32_t           hwEncodeStatus     = 0;
    uint32_t           numSlices          = 0;
    uint32_t           bitstreamSizeInBytes = 0;
    uint64_t           outputTimeStamp    = 0;
    uint64_t           outputDuration     = 0;
    void*              bitstreamBufferPtr = nullptr;
    NV_ENC_PIC_TYPE    pictureType        = NV_ENC_PIC_TYPE_UNKNOWN;
    uint32_t           reserved[62]       = {};
};

struct NV_ENC_REGISTER_RESOURCE {
    uint32_t             version           = 0;
    uint32_t             resourceType      = 0;   // 0 = DIRECTX, 1 = CUDA, etc.
    uint32_t             width             = 0;
    uint32_t             height            = 0;
    uint32_t             pitch             = 0;
    uint32_t             subResourceIndex  = 0;
    void*                resourceToRegister= nullptr;
    void*                registeredResource= nullptr;
    NV_ENC_BUFFER_FORMAT bufferFormat      = NV_ENC_BUFFER_FORMAT_UNDEFINED;
    uint32_t             bufferUsage       = 0;
    void*                pInputFencePoint  = nullptr;
    void*                pOutputFencePoint = nullptr;
    uint32_t             reserved[248]     = {};
};

struct NV_ENC_MAP_INPUT_RESOURCE {
    uint32_t version             = 0;
    uint32_t subResourceIndex    = 0;
    void*    inputResource       = nullptr;
    void*    registeredResource  = nullptr;
    void*    mappedResource      = nullptr;
    NV_ENC_BUFFER_FORMAT mappedBufferFmt = NV_ENC_BUFFER_FORMAT_UNDEFINED;
    uint32_t reserved[62]        = {};
};

struct NV_ENC_PIC_PARAMS {
    uint32_t                version           = 0;
    uint32_t                inputWidth        = 0;
    uint32_t                inputHeight       = 0;
    uint32_t                inputPitch        = 0;
    uint32_t                encodePicFlags    = 0;
    uint32_t                frameIdx          = 0;
    uint64_t                inputTimeStamp    = 0;
    uint64_t                inputDuration     = 0;
    void*                   inputBuffer       = nullptr;
    void*                   outputBitstream   = nullptr;
    void*                   completionEvent   = nullptr;
    NV_ENC_BUFFER_FORMAT    bufferFmt         = NV_ENC_BUFFER_FORMAT_UNDEFINED;
    NV_ENC_PIC_TYPE         pictureType       = NV_ENC_PIC_TYPE_UNKNOWN;
    uint32_t                reserved[256]     = {};
};

struct NV_ENC_RECONFIGURE_PARAMS {
    uint32_t                   version       = 0;
    NV_ENC_INITIALIZE_PARAMS   reInitEncodeParams = {};
    uint32_t                   resetEncoder  = 0;
    uint32_t                   forceIDR      = 0;
    uint32_t                   reserved[252] = {};
};

#pragma pack(pop)

// ---------------------------------------------------------------------------
// NVENC function pointer table (from nvEncodeAPI64.dll)
// ---------------------------------------------------------------------------
struct NV_ENCODE_API_FUNCTION_LIST {
    uint32_t version = 0;
    uint32_t reserved = 0;

    NVENCSTATUS (*nvEncOpenEncodeSession)(void* device, uint32_t deviceType, void** encoder)     = nullptr;
    NVENCSTATUS (*nvEncGetEncodeGUIDCount)(void* encoder, uint32_t* count)                        = nullptr;
    NVENCSTATUS (*nvEncGetEncodeGUIDs)(void* encoder, NV_ENC_GUID* guids, uint32_t count, uint32_t* outCount) = nullptr;
    NVENCSTATUS (*nvEncGetEncodeProfileGUIDCount)(void* encoder, NV_ENC_GUID codec, uint32_t* count) = nullptr;
    NVENCSTATUS (*nvEncGetEncodeProfileGUIDs)(void* encoder, NV_ENC_GUID codec, NV_ENC_GUID* guids, uint32_t count, uint32_t* outCount) = nullptr;
    NVENCSTATUS (*nvEncGetInputFormatCount)(void* encoder, NV_ENC_GUID codec, uint32_t* count)   = nullptr;
    NVENCSTATUS (*nvEncGetInputFormats)(void* encoder, NV_ENC_GUID codec, NV_ENC_BUFFER_FORMAT* fmts, uint32_t count, uint32_t* outCount) = nullptr;
    NVENCSTATUS (*nvEncGetEncodeCaps)(void* encoder, NV_ENC_GUID codec, NV_ENC_CAPS_PARAM* caps, int* val) = nullptr;
    NVENCSTATUS (*nvEncGetEncodePresetCount)(void* encoder, NV_ENC_GUID codec, uint32_t* count)  = nullptr;
    NVENCSTATUS (*nvEncGetEncodePresetGUIDs)(void* encoder, NV_ENC_GUID codec, NV_ENC_GUID* guids, uint32_t count, uint32_t* outCount) = nullptr;
    NVENCSTATUS (*nvEncGetEncodePresetConfig)(void* encoder, NV_ENC_GUID codec, NV_ENC_GUID preset, NV_ENC_PRESET_CONFIG* config) = nullptr;
    NVENCSTATUS (*nvEncGetEncodePresetConfigEx)(void* encoder, NV_ENC_GUID codec, NV_ENC_GUID preset, NV_ENC_TUNING_INFO tuning, NV_ENC_PRESET_CONFIG* config) = nullptr;
    NVENCSTATUS (*nvEncInitializeEncoder)(void* encoder, NV_ENC_INITIALIZE_PARAMS* params)       = nullptr;
    NVENCSTATUS (*nvEncCreateInputBuffer)(void* encoder, NV_ENC_CREATE_INPUT_BUFFER* params)     = nullptr;
    NVENCSTATUS (*nvEncDestroyInputBuffer)(void* encoder, void* inputBuffer)                      = nullptr;
    NVENCSTATUS (*nvEncCreateBitstreamBuffer)(void* encoder, NV_ENC_CREATE_BITSTREAM_BUFFER* params) = nullptr;
    NVENCSTATUS (*nvEncDestroyBitstreamBuffer)(void* encoder, void* bitstreamBuffer)              = nullptr;
    NVENCSTATUS (*nvEncEncodePicture)(void* encoder, NV_ENC_PIC_PARAMS* params)                  = nullptr;
    NVENCSTATUS (*nvEncLockBitstream)(void* encoder, NV_ENC_LOCK_BITSTREAM* params)              = nullptr;
    NVENCSTATUS (*nvEncUnlockBitstream)(void* encoder, void* bitstreamBuffer)                     = nullptr;
    NVENCSTATUS (*nvEncLockInputBuffer)(void* encoder, NV_ENC_LOCK_INPUT_BUFFER* params)         = nullptr;
    NVENCSTATUS (*nvEncUnlockInputBuffer)(void* encoder, void* inputBuffer)                       = nullptr;
    NVENCSTATUS (*nvEncRegisterResource)(void* encoder, NV_ENC_REGISTER_RESOURCE* params)        = nullptr;
    NVENCSTATUS (*nvEncUnregisterResource)(void* encoder, void* registeredResource)               = nullptr;
    NVENCSTATUS (*nvEncMapInputResource)(void* encoder, NV_ENC_MAP_INPUT_RESOURCE* params)       = nullptr;
    NVENCSTATUS (*nvEncUnmapInputResource)(void* encoder, void* mappedResource)                   = nullptr;
    NVENCSTATUS (*nvEncDestroyEncoder)(void* encoder)                                             = nullptr;
    NVENCSTATUS (*nvEncReconfigureEncoder)(void* encoder, NV_ENC_RECONFIGURE_PARAMS* params)     = nullptr;
    NVENCSTATUS (*nvEncOpenEncodeSessionEx)(void* params, void** encoder)                         = nullptr;

    void* reserved2[256] = {};
};

/// DLL export: NvEncodeAPICreateInstance
using NvEncodeAPICreateInstance_t = NVENCSTATUS (*)(NV_ENCODE_API_FUNCTION_LIST* functionList);

// ---------------------------------------------------------------------------
// NvencEncoder -- IEncoder implementation via NVENC
// ---------------------------------------------------------------------------
class NvencEncoder : public IEncoder {
public:
    NvencEncoder();
    ~NvencEncoder() override;

    bool initialize(const EncoderConfig& config) override;
    bool encode(const CapturedFrame& frame, EncodedPacket& packet) override;
    bool reconfigure(const EncoderConfig& config) override;
    void forceIdr() override;
    void flush() override;
    void release() override;
    std::string getCodecName() const override;

    /// Check if a specific codec is supported by the GPU.
    bool isCodecSupported(CodecType codec) override;

private:
    bool loadLibrary();
    bool openSession();
    NV_ENC_GUID codecToGuid(CodecType codec) const;
    NV_ENC_GUID profileGuid(CodecType codec) const;
    NV_ENC_BUFFER_FORMAT frameFormatToNvenc(FrameFormat fmt) const;

    HMODULE                           dll_          = nullptr;
    NvEncodeAPICreateInstance_t       createInst_   = nullptr;
    NV_ENCODE_API_FUNCTION_LIST       api_          = {};
    void*                             encoder_      = nullptr;

    // Encoder state
    EncoderConfig                     config_       = {};
    NV_ENC_INITIALIZE_PARAMS          initParams_   = {};
    NV_ENC_CONFIG                     encConfig_    = {};
    bool                              initialized_  = false;
    bool                              force_idr_    = false;
    uint32_t                          frame_num_    = 0;

    // Input / output buffers (double-buffered)
    static constexpr int NUM_BUFFERS = 2;
    void*                             input_bufs_[NUM_BUFFERS]  = {};
    void*                             output_bufs_[NUM_BUFFERS] = {};
    int                               cur_buf_                  = 0;

    // D3D11 device for NVENC session (if using D3D11 device type)
    void*                             d3d_device_   = nullptr;
};

} // namespace cs::host
