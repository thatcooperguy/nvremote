///////////////////////////////////////////////////////////////////////////////
// nvfbc_capture.h -- NvFBC (NVIDIA FrameBuffer Capture) backend
//
// Uses the NvFBC (NVIDIA FrameBuffer Capture) API to capture the desktop
// directly from the GPU framebuffer.  This is the lowest-latency capture method on NVIDIA
// GPUs.  The library is loaded dynamically at runtime (LoadLibrary) so we
// don't need to link against any .lib file.
//
// If CUDA is available (CS_HAS_CUDA), we use NvFBCToCUDA for zero-copy
// capture to a CUDA device pointer that NVENC can consume directly.
// Otherwise we fall back to NvFBCToSys (system memory copy).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "capture_interface.h"
#include <cstdint>
#include <vector>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <Windows.h>
#endif

namespace cs::host {

// ---------------------------------------------------------------------------
// Minimal NvFBC type declarations.
//
// Minimal NvFBC type declarations for runtime dynamic loading.
// We declare just enough structs and function signatures here so we can
// load the DLL at runtime without requiring the SDK headers at compile
// time.  These definitions are based on the publicly available NvFBC
// Capture SDK documentation.
// ---------------------------------------------------------------------------

/// Status codes returned by NvFBC functions.
enum NvFBCStatus : uint32_t {
    NVFBC_SUCCESS                   = 0,
    NVFBC_ERR_API_VERSION           = 1,
    NVFBC_ERR_INTERNAL              = 2,
    NVFBC_ERR_INVALID_PARAM         = 3,
    NVFBC_ERR_INVALID_PTR           = 4,
    NVFBC_ERR_INVALID_HANDLE        = 5,
    NVFBC_ERR_MAX_CLIENTS           = 6,
    NVFBC_ERR_UNSUPPORTED           = 7,
    NVFBC_ERR_OUT_OF_MEMORY         = 8,
    NVFBC_ERR_BAD_REQUEST           = 9,
    NVFBC_ERR_MUST_RECREATE         = 10,
    NVFBC_ERR_DYNAMIC_DISABLE       = 11,
};

/// Capture-to types.
enum NvFBCCaptureType : uint32_t {
    NVFBC_CAPTURE_TO_SYS           = 0,
    NVFBC_CAPTURE_SHARED_SURF      = 1,
    NVFBC_CAPTURE_TO_HW_ENCODER    = 2,
    NVFBC_CAPTURE_TO_CUDA          = 3,
};

/// Buffer format for ToSys capture.
enum NvFBCBufferFormat : uint32_t {
    NVFBC_BUFFER_FORMAT_ARGB       = 0,
    NVFBC_BUFFER_FORMAT_RGB        = 1,
    NVFBC_BUFFER_FORMAT_NV12       = 4,
    NVFBC_BUFFER_FORMAT_BGRA       = 8,
};

/// Flags for grab operations.
enum NvFBCGrabFlags : uint32_t {
    NVFBC_TOCUDA_GRAB_FLAGS_NOFLAGS           = 0,
    NVFBC_TOCUDA_GRAB_FLAGS_NOWAIT            = (1 << 0),
    NVFBC_TOCUDA_GRAB_FLAGS_NOWAIT_IF_NEW     = (1 << 1),
    NVFBC_TOSYS_GRAB_FLAGS_NOFLAGS            = 0,
    NVFBC_TOSYS_GRAB_FLAGS_NOWAIT             = (1 << 0),
    NVFBC_TOSYS_GRAB_FLAGS_NOWAIT_IF_NEW      = (1 << 1),
};

// Forward-declare opaque handle.
using NVFBC_SESSION_HANDLE = uint64_t;

// ---------------------------------------------------------------------------
// NvFBC API version macro -- we target version 7.
// ---------------------------------------------------------------------------
#define NVFBC_API_VER_MAJOR 7
#define NVFBC_API_VER_MINOR 0
#define NVFBC_STRUCT_VERSION(type, ver) \
    (uint32_t)(sizeof(type) | ((ver) << 16) | (NVFBC_API_VER_MAJOR << 24))

// ---------------------------------------------------------------------------
// NvFBC parameter structs (minimal layout compatible with the real SDK).
// All structs start with dwVersion so the driver can validate them.
// ---------------------------------------------------------------------------

#pragma pack(push, 8)

struct NVFBC_CREATE_HANDLE_PARAMS {
    uint32_t dwVersion          = 0;
    uint32_t dwPrivateDataSize  = 0;
    void*    pPrivateData       = nullptr;
    uint32_t bExternallyManagedContext = 0;
    void*    glxCtx             = nullptr;
    void*    glxFBConfig        = nullptr;
    uint32_t dwReserved[20]     = {};
};

struct NVFBC_DESTROY_HANDLE_PARAMS {
    uint32_t dwVersion = 0;
    uint32_t dwReserved[20] = {};
};

struct NVFBC_GET_STATUS_PARAMS {
    uint32_t dwVersion          = 0;
    uint32_t bIsCapturePossible = 0;
    uint32_t bCurrentlyCapturing= 0;
    uint32_t bCanCreateNow      = 0;
    uint32_t dwMaxWidth         = 0;
    uint32_t dwMaxHeight        = 0;
    uint32_t dwOutputNum        = 0;
    uint32_t dwNvFBCVersion     = 0;
    uint32_t dwReserved[20]     = {};
};

struct NVFBC_CREATE_CAPTURE_SESSION_PARAMS {
    uint32_t dwVersion           = 0;
    NvFBCCaptureType eCaptureType= NVFBC_CAPTURE_TO_SYS;
    uint32_t bWithCursor         = 1;
    uint32_t frameSize_w         = 0;       // 0 = native resolution
    uint32_t frameSize_h         = 0;
    uint32_t bRoundFrameSize     = 0;
    uint32_t dwSamplingRateMs    = 16;      // ~60 fps
    uint32_t bPushModel          = 0;
    uint32_t bAllowDirectCapture = 0;
    uint32_t dwReserved[20]      = {};
};

struct NVFBC_DESTROY_CAPTURE_SESSION_PARAMS {
    uint32_t dwVersion = 0;
    uint32_t dwReserved[20] = {};
};

// ToSys setup / grab
struct NVFBC_TOSYS_SETUP_PARAMS {
    uint32_t dwVersion          = 0;
    NvFBCBufferFormat eBufferFormat = NVFBC_BUFFER_FORMAT_BGRA;
    void**   ppBuffer           = nullptr;  // Receives pointer to captured data
    uint32_t bWithDiffMap       = 0;
    void**   ppDiffMap          = nullptr;
    uint32_t dwDiffMapScalingFactor = 1;
    uint32_t dwReserved[20]     = {};
};

struct NVFBC_FRAME_GRAB_INFO {
    uint32_t dwWidth            = 0;
    uint32_t dwHeight           = 0;
    uint32_t dwByteSize         = 0;
    uint32_t dwCurrentFrame     = 0;
    uint32_t bIsNewFrame        = 0;
    int64_t  i64Timestamp       = 0;
    uint32_t dwReserved[16]     = {};
};

struct NVFBC_TOSYS_GRAB_FRAME_PARAMS {
    uint32_t dwVersion          = 0;
    uint32_t dwFlags            = 0;
    NVFBC_FRAME_GRAB_INFO* pFrameGrabInfo = nullptr;
    uint32_t dwTimeoutMs        = 100;
    uint32_t dwReserved[20]     = {};
};

// ToCUDA setup / grab
struct NVFBC_TOCUDA_SETUP_PARAMS {
    uint32_t dwVersion          = 0;
    NvFBCBufferFormat eBufferFormat = NVFBC_BUFFER_FORMAT_NV12;
    void*    reserved           = nullptr;
    uint32_t dwReserved[20]     = {};
};

struct NVFBC_TOCUDA_GRAB_FRAME_PARAMS {
    uint32_t dwVersion          = 0;
    uint32_t dwFlags            = 0;
    void*    pCUDADeviceBuffer   = nullptr;  // Receives CUdeviceptr
    NVFBC_FRAME_GRAB_INFO* pFrameGrabInfo = nullptr;
    uint32_t dwTimeoutMs        = 100;
    uint32_t dwReserved[20]     = {};
};

#pragma pack(pop)

// ---------------------------------------------------------------------------
// NvFBC function-pointer table.  We fill this from the DLL exports.
// ---------------------------------------------------------------------------
struct NVFBC_API_FUNCTION_LIST {
    uint32_t dwVersion = 0;

    NvFBCStatus (*nvFBCCreateHandle)(NVFBC_SESSION_HANDLE* handle,
                                     NVFBC_CREATE_HANDLE_PARAMS* params)       = nullptr;
    NvFBCStatus (*nvFBCDestroyHandle)(NVFBC_SESSION_HANDLE handle,
                                      NVFBC_DESTROY_HANDLE_PARAMS* params)     = nullptr;
    NvFBCStatus (*nvFBCGetStatus)(NVFBC_SESSION_HANDLE handle,
                                   NVFBC_GET_STATUS_PARAMS* params)            = nullptr;
    NvFBCStatus (*nvFBCCreateCaptureSession)(NVFBC_SESSION_HANDLE handle,
                                             NVFBC_CREATE_CAPTURE_SESSION_PARAMS* params) = nullptr;
    NvFBCStatus (*nvFBCDestroyCaptureSession)(NVFBC_SESSION_HANDLE handle,
                                              NVFBC_DESTROY_CAPTURE_SESSION_PARAMS* params) = nullptr;
    NvFBCStatus (*nvFBCToSysSetUp)(NVFBC_SESSION_HANDLE handle,
                                    NVFBC_TOSYS_SETUP_PARAMS* params)          = nullptr;
    NvFBCStatus (*nvFBCToSysGrabFrame)(NVFBC_SESSION_HANDLE handle,
                                        NVFBC_TOSYS_GRAB_FRAME_PARAMS* params) = nullptr;
    NvFBCStatus (*nvFBCToCudaSetUp)(NVFBC_SESSION_HANDLE handle,
                                     NVFBC_TOCUDA_SETUP_PARAMS* params)        = nullptr;
    NvFBCStatus (*nvFBCToCudaGrabFrame)(NVFBC_SESSION_HANDLE handle,
                                         NVFBC_TOCUDA_GRAB_FRAME_PARAMS* params) = nullptr;
};

/// Typedef for the single DLL export: NvFBC_CreateInstance()
using NvFBC_CreateInstance_t = NvFBCStatus (*)(NVFBC_API_FUNCTION_LIST* list);

// ---------------------------------------------------------------------------
// NvfbcCapture -- ICaptureDevice implementation via NvFBC
// ---------------------------------------------------------------------------
class NvfbcCapture : public ICaptureDevice {
public:
    NvfbcCapture();
    ~NvfbcCapture() override;

    bool initialize(int gpu_index = 0) override;
    bool captureFrame(CapturedFrame& frame) override;
    void release() override;
    std::string getName() const override { return "NvFBC"; }

private:
    bool loadLibrary();
    bool createHandle();
    bool createCaptureSession();
    bool setupToSys();
    bool setupToCuda();

    HMODULE                             dll_           = nullptr;
    NvFBC_CreateInstance_t              createInstance_ = nullptr;
    NVFBC_API_FUNCTION_LIST             api_           = {};
    NVFBC_SESSION_HANDLE                handle_        = 0;

    bool                                use_cuda_      = false;
    bool                                initialized_   = false;

    // ToSys state
    void*                               sys_buffer_    = nullptr;

    // ToCUDA state
    void*                               cuda_buffer_   = nullptr;  // CUdeviceptr

    // Cached frame dimensions from last grab
    uint32_t                            last_width_    = 0;
    uint32_t                            last_height_   = 0;
};

} // namespace cs::host
