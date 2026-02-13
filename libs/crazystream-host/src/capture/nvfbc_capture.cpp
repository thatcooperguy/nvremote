///////////////////////////////////////////////////////////////////////////////
// nvfbc_capture.cpp -- NvFBC capture backend implementation
//
// Dynamically loads NvFBC64.dll and uses the NvFBC API to capture the
// desktop framebuffer.  Prefers CUDA output if CUDA Toolkit is available
// (zero-copy to NVENC), otherwise falls back to system-memory capture.
///////////////////////////////////////////////////////////////////////////////

#include "nvfbc_capture.h"
#include <cs/common.h>

#ifdef CS_HAS_CUDA
#  include <cuda.h>
#endif

namespace cs::host {

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static const char* nvfbcStatusString(NvFBCStatus status) {
    switch (status) {
        case NVFBC_SUCCESS:             return "SUCCESS";
        case NVFBC_ERR_API_VERSION:     return "API_VERSION";
        case NVFBC_ERR_INTERNAL:        return "INTERNAL";
        case NVFBC_ERR_INVALID_PARAM:   return "INVALID_PARAM";
        case NVFBC_ERR_INVALID_PTR:     return "INVALID_PTR";
        case NVFBC_ERR_INVALID_HANDLE:  return "INVALID_HANDLE";
        case NVFBC_ERR_MAX_CLIENTS:     return "MAX_CLIENTS";
        case NVFBC_ERR_UNSUPPORTED:     return "UNSUPPORTED";
        case NVFBC_ERR_OUT_OF_MEMORY:   return "OUT_OF_MEMORY";
        case NVFBC_ERR_BAD_REQUEST:     return "BAD_REQUEST";
        case NVFBC_ERR_MUST_RECREATE:   return "MUST_RECREATE";
        case NVFBC_ERR_DYNAMIC_DISABLE: return "DYNAMIC_DISABLE";
        default:                        return "UNKNOWN";
    }
}

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------

NvfbcCapture::NvfbcCapture() = default;

NvfbcCapture::~NvfbcCapture() {
    release();
}

// ---------------------------------------------------------------------------
// Initialize -- load DLL, create handle, set up capture session
// ---------------------------------------------------------------------------

bool NvfbcCapture::initialize(int /*gpu_index*/) {
    if (initialized_) return true;

    if (!loadLibrary()) {
        CS_LOG(WARN, "NvFBC: failed to load NvFBC64.dll -- GPU may not support NvFBC");
        return false;
    }

    if (!createHandle()) {
        CS_LOG(WARN, "NvFBC: failed to create NvFBC handle");
        return false;
    }

    // Query status to ensure capture is supported on this GPU.
    NVFBC_GET_STATUS_PARAMS statusParams = {};
    statusParams.dwVersion = NVFBC_STRUCT_VERSION(NVFBC_GET_STATUS_PARAMS, 1);

    NvFBCStatus st = api_.nvFBCGetStatus(handle_, &statusParams);
    if (st != NVFBC_SUCCESS || !statusParams.bIsCapturePossible) {
        CS_LOG(WARN, "NvFBC: capture not possible on this system (status=%s, canCapture=%u)",
               nvfbcStatusString(st), statusParams.bIsCapturePossible);
        release();
        return false;
    }

    CS_LOG(INFO, "NvFBC: status OK -- max resolution %ux%u, version=%u",
           statusParams.dwMaxWidth, statusParams.dwMaxHeight, statusParams.dwNvFBCVersion);

    // Decide capture mode: prefer CUDA if available.
#ifdef CS_HAS_CUDA
    use_cuda_ = true;
    CS_LOG(INFO, "NvFBC: using ToCUDA capture mode (GPU-direct)");
#else
    use_cuda_ = false;
    CS_LOG(INFO, "NvFBC: using ToSys capture mode (system memory)");
#endif

    if (!createCaptureSession()) {
        CS_LOG(ERR, "NvFBC: failed to create capture session");
        release();
        return false;
    }

    if (use_cuda_) {
        if (!setupToCuda()) {
            CS_LOG(WARN, "NvFBC: ToCUDA setup failed, falling back to ToSys");
            use_cuda_ = false;
            // Destroy and re-create session for ToSys
            NVFBC_DESTROY_CAPTURE_SESSION_PARAMS destroyParams = {};
            destroyParams.dwVersion = NVFBC_STRUCT_VERSION(NVFBC_DESTROY_CAPTURE_SESSION_PARAMS, 1);
            api_.nvFBCDestroyCaptureSession(handle_, &destroyParams);

            if (!createCaptureSession() || !setupToSys()) {
                CS_LOG(ERR, "NvFBC: ToSys fallback also failed");
                release();
                return false;
            }
        }
    } else {
        if (!setupToSys()) {
            CS_LOG(ERR, "NvFBC: ToSys setup failed");
            release();
            return false;
        }
    }

    initialized_ = true;
    CS_LOG(INFO, "NvFBC: initialized successfully (mode=%s)",
           use_cuda_ ? "ToCUDA" : "ToSys");
    return true;
}

// ---------------------------------------------------------------------------
// captureFrame -- grab a single frame from the GPU
// ---------------------------------------------------------------------------

bool NvfbcCapture::captureFrame(CapturedFrame& frame) {
    if (!initialized_) return false;

    NVFBC_FRAME_GRAB_INFO grabInfo = {};
    NvFBCStatus st;

    if (use_cuda_) {
        NVFBC_TOCUDA_GRAB_FRAME_PARAMS params = {};
        params.dwVersion       = NVFBC_STRUCT_VERSION(NVFBC_TOCUDA_GRAB_FRAME_PARAMS, 1);
        params.dwFlags         = NVFBC_TOCUDA_GRAB_FLAGS_NOWAIT_IF_NEW;
        params.pFrameGrabInfo  = &grabInfo;
        params.dwTimeoutMs     = 100;

        st = api_.nvFBCToCudaGrabFrame(handle_, &params);
        if (st != NVFBC_SUCCESS) {
            if (st == NVFBC_ERR_MUST_RECREATE) {
                CS_LOG(WARN, "NvFBC: session must be recreated (desktop mode change?)");
            }
            CS_LOG(DEBUG, "NvFBC: ToCUDA grab failed: %s", nvfbcStatusString(st));
            return false;
        }

        cuda_buffer_ = params.pCUDADeviceBuffer;
        frame.gpu_ptr      = cuda_buffer_;
        frame.format       = FrameFormat::NV12;
        // Pitch for NV12: width bytes for luma plane
        frame.pitch        = grabInfo.dwWidth;
    } else {
        NVFBC_TOSYS_GRAB_FRAME_PARAMS params = {};
        params.dwVersion       = NVFBC_STRUCT_VERSION(NVFBC_TOSYS_GRAB_FRAME_PARAMS, 1);
        params.dwFlags         = NVFBC_TOSYS_GRAB_FLAGS_NOWAIT_IF_NEW;
        params.pFrameGrabInfo  = &grabInfo;
        params.dwTimeoutMs     = 100;

        st = api_.nvFBCToSysGrabFrame(handle_, &params);
        if (st != NVFBC_SUCCESS) {
            if (st == NVFBC_ERR_MUST_RECREATE) {
                CS_LOG(WARN, "NvFBC: session must be recreated (desktop mode change?)");
            }
            CS_LOG(DEBUG, "NvFBC: ToSys grab failed: %s", nvfbcStatusString(st));
            return false;
        }

        frame.gpu_ptr      = sys_buffer_;
        frame.format       = FrameFormat::BGRA8;
        frame.pitch        = grabInfo.dwWidth * 4;  // 4 bytes per pixel for BGRA
    }

    frame.width        = grabInfo.dwWidth;
    frame.height       = grabInfo.dwHeight;
    frame.timestamp_us = cs::getTimestampUs();
    frame.is_new_frame = (grabInfo.bIsNewFrame != 0);

    last_width_  = grabInfo.dwWidth;
    last_height_ = grabInfo.dwHeight;

    return true;
}

// ---------------------------------------------------------------------------
// release -- tear down NvFBC session, handle, and unload DLL
// ---------------------------------------------------------------------------

void NvfbcCapture::release() {
    if (handle_ && api_.nvFBCDestroyCaptureSession) {
        NVFBC_DESTROY_CAPTURE_SESSION_PARAMS params = {};
        params.dwVersion = NVFBC_STRUCT_VERSION(NVFBC_DESTROY_CAPTURE_SESSION_PARAMS, 1);
        api_.nvFBCDestroyCaptureSession(handle_, &params);
    }

    if (handle_ && api_.nvFBCDestroyHandle) {
        NVFBC_DESTROY_HANDLE_PARAMS params = {};
        params.dwVersion = NVFBC_STRUCT_VERSION(NVFBC_DESTROY_HANDLE_PARAMS, 1);
        api_.nvFBCDestroyHandle(handle_, &params);
        handle_ = 0;
    }

    if (dll_) {
        FreeLibrary(dll_);
        dll_ = nullptr;
    }

    sys_buffer_    = nullptr;
    cuda_buffer_   = nullptr;
    initialized_   = false;
    createInstance_ = nullptr;
    api_           = {};

    CS_LOG(DEBUG, "NvFBC: resources released");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

bool NvfbcCapture::loadLibrary() {
    dll_ = LoadLibraryA("NvFBC64.dll");
    if (!dll_) {
        CS_LOG(DEBUG, "NvFBC: LoadLibrary(NvFBC64.dll) failed, error=%lu", GetLastError());
        return false;
    }

    createInstance_ = reinterpret_cast<NvFBC_CreateInstance_t>(
        GetProcAddress(dll_, "NvFBC_CreateInstance"));
    if (!createInstance_) {
        CS_LOG(ERR, "NvFBC: NvFBC_CreateInstance export not found");
        FreeLibrary(dll_);
        dll_ = nullptr;
        return false;
    }

    // Fill the function pointer table.
    api_.dwVersion = NVFBC_STRUCT_VERSION(NVFBC_API_FUNCTION_LIST, 1);
    NvFBCStatus st = createInstance_(&api_);
    if (st != NVFBC_SUCCESS) {
        CS_LOG(ERR, "NvFBC: NvFBC_CreateInstance returned %s", nvfbcStatusString(st));
        FreeLibrary(dll_);
        dll_ = nullptr;
        return false;
    }

    CS_LOG(DEBUG, "NvFBC: library loaded and function table populated");
    return true;
}

bool NvfbcCapture::createHandle() {
    NVFBC_CREATE_HANDLE_PARAMS params = {};
    params.dwVersion = NVFBC_STRUCT_VERSION(NVFBC_CREATE_HANDLE_PARAMS, 1);

    NvFBCStatus st = api_.nvFBCCreateHandle(&handle_, &params);
    if (st != NVFBC_SUCCESS) {
        CS_LOG(ERR, "NvFBC: CreateHandle failed: %s", nvfbcStatusString(st));
        return false;
    }

    CS_LOG(DEBUG, "NvFBC: handle created (0x%llx)", (unsigned long long)handle_);
    return true;
}

bool NvfbcCapture::createCaptureSession() {
    NVFBC_CREATE_CAPTURE_SESSION_PARAMS params = {};
    params.dwVersion       = NVFBC_STRUCT_VERSION(NVFBC_CREATE_CAPTURE_SESSION_PARAMS, 1);
    params.eCaptureType    = use_cuda_ ? NVFBC_CAPTURE_TO_CUDA : NVFBC_CAPTURE_TO_SYS;
    params.bWithCursor     = 1;
    params.frameSize_w     = 0;   // Native resolution
    params.frameSize_h     = 0;
    params.dwSamplingRateMs = 16;  // ~60 fps ceiling
    params.bPushModel      = 0;

    NvFBCStatus st = api_.nvFBCCreateCaptureSession(handle_, &params);
    if (st != NVFBC_SUCCESS) {
        CS_LOG(ERR, "NvFBC: CreateCaptureSession failed: %s", nvfbcStatusString(st));
        return false;
    }

    CS_LOG(DEBUG, "NvFBC: capture session created (type=%s)",
           use_cuda_ ? "ToCUDA" : "ToSys");
    return true;
}

bool NvfbcCapture::setupToSys() {
    NVFBC_TOSYS_SETUP_PARAMS params = {};
    params.dwVersion     = NVFBC_STRUCT_VERSION(NVFBC_TOSYS_SETUP_PARAMS, 1);
    params.eBufferFormat = NVFBC_BUFFER_FORMAT_BGRA;
    params.ppBuffer      = &sys_buffer_;

    NvFBCStatus st = api_.nvFBCToSysSetUp(handle_, &params);
    if (st != NVFBC_SUCCESS) {
        CS_LOG(ERR, "NvFBC: ToSys setup failed: %s", nvfbcStatusString(st));
        return false;
    }

    CS_LOG(DEBUG, "NvFBC: ToSys setup complete, buffer=%p", sys_buffer_);
    return true;
}

bool NvfbcCapture::setupToCuda() {
#ifdef CS_HAS_CUDA
    // Ensure CUDA is initialized.
    CUresult cr = cuInit(0);
    if (cr != CUDA_SUCCESS) {
        CS_LOG(WARN, "NvFBC: cuInit failed (%d)", (int)cr);
        return false;
    }

    CUdevice cuDev;
    cr = cuDeviceGet(&cuDev, 0);
    if (cr != CUDA_SUCCESS) {
        CS_LOG(WARN, "NvFBC: cuDeviceGet failed (%d)", (int)cr);
        return false;
    }

    CUcontext cuCtx;
    cr = cuCtxCreate(&cuCtx, 0, cuDev);
    if (cr != CUDA_SUCCESS) {
        CS_LOG(WARN, "NvFBC: cuCtxCreate failed (%d)", (int)cr);
        return false;
    }

    NVFBC_TOCUDA_SETUP_PARAMS params = {};
    params.dwVersion     = NVFBC_STRUCT_VERSION(NVFBC_TOCUDA_SETUP_PARAMS, 1);
    params.eBufferFormat = NVFBC_BUFFER_FORMAT_NV12;

    NvFBCStatus st = api_.nvFBCToCudaSetUp(handle_, &params);
    if (st != NVFBC_SUCCESS) {
        CS_LOG(WARN, "NvFBC: ToCUDA setup failed: %s", nvfbcStatusString(st));
        cuCtxDestroy(cuCtx);
        return false;
    }

    CS_LOG(DEBUG, "NvFBC: ToCUDA setup complete");
    return true;
#else
    CS_LOG(WARN, "NvFBC: CUDA not available at compile time");
    return false;
#endif
}

} // namespace cs::host
