///////////////////////////////////////////////////////////////////////////////
// wasapi_capture.cpp -- WASAPI loopback audio capture implementation
//
// Uses the WASAPI shared-mode loopback to capture the system audio output.
// A dedicated thread waits on the WASAPI event and delivers PCM data via
// the user callback.
///////////////////////////////////////////////////////////////////////////////

#include "wasapi_capture.h"
#include <cs/common.h>

#ifndef WIN32_LEAN_AND_MEAN
#  define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>
#include <mmdeviceapi.h>
#include <Audioclient.h>
#include <functiondiscoverykeys_devpkey.h>

#include <cstring>

// WASAPI CLSID / IID -- defined here to avoid linking against uuid.lib.
static const CLSID CLSID_MMDeviceEnumerator_local =
    { 0xBCDE0395, 0xE52F, 0x467C, { 0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E } };
static const IID IID_IMMDeviceEnumerator_local =
    { 0xA95664D2, 0x9614, 0x4F35, { 0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6 } };
static const IID IID_IAudioClient_local =
    { 0x1CB9AD4C, 0xDBFA, 0x4C32, { 0xB1, 0x78, 0xC2, 0xF5, 0x68, 0xA7, 0x03, 0xB2 } };
static const IID IID_IAudioCaptureClient_local =
    { 0xC8ADBD64, 0xE71E, 0x48A0, { 0xA4, 0xDE, 0x18, 0x5C, 0x39, 0x5C, 0xD3, 0x17 } };

namespace cs::host {

WasapiCapture::WasapiCapture() = default;

WasapiCapture::~WasapiCapture() {
    stop();
}

// ---------------------------------------------------------------------------
// initialize -- set up WASAPI loopback capture on the default render device
// ---------------------------------------------------------------------------

bool WasapiCapture::initialize(const std::string& /*device_id*/) {
    HRESULT hr;

    // Get the default audio render device (we capture its output via loopback).
    IMMDeviceEnumerator* enumerator = nullptr;
    hr = CoCreateInstance(CLSID_MMDeviceEnumerator_local, nullptr, CLSCTX_ALL,
                          IID_IMMDeviceEnumerator_local,
                          reinterpret_cast<void**>(&enumerator));
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: CoCreateInstance(MMDeviceEnumerator) failed (0x%08lX)", hr);
        return false;
    }

    hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device_);
    enumerator->Release();
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: GetDefaultAudioEndpoint failed (0x%08lX)", hr);
        return false;
    }

    // Activate the IAudioClient interface.
    hr = device_->Activate(IID_IAudioClient_local, CLSCTX_ALL, nullptr,
                           reinterpret_cast<void**>(&audio_client_));
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: device->Activate(IAudioClient) failed (0x%08lX)", hr);
        return false;
    }

    // Get the mix format.  WASAPI loopback uses the device's mix format.
    WAVEFORMATEX* mixFmt = nullptr;
    hr = audio_client_->GetMixFormat(&mixFmt);
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: GetMixFormat failed (0x%08lX)", hr);
        return false;
    }

    sample_rate_ = mixFmt->nSamplesPerSec;
    channels_    = static_cast<uint16_t>(mixFmt->nChannels);

    CS_LOG(INFO, "WASAPI: mix format -- %u Hz, %u ch, %u bits, tag=0x%X",
           sample_rate_, channels_, mixFmt->wBitsPerSample, mixFmt->wFormatTag);

    // We need float32 output for Opus.  WASAPI shared mode loopback
    // typically provides IEEE float already.  If not, we accept what we get
    // and let the Opus encoder handle conversion.

    // Create an event for the capture buffer notification.
    event_handle_ = CreateEventA(nullptr, FALSE, FALSE, nullptr);
    if (!event_handle_) {
        CS_LOG(ERR, "WASAPI: CreateEvent failed");
        CoTaskMemFree(mixFmt);
        return false;
    }

    // Initialize the audio client in shared loopback mode.
    // AUDCLNT_STREAMFLAGS_LOOPBACK captures the render endpoint's output.
    REFERENCE_TIME requestedDuration = 100000;  // 10 ms in 100-ns units
    hr = audio_client_->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        requestedDuration,
        0,              // periodicity (must be 0 for shared mode)
        mixFmt,
        nullptr         // session GUID
    );
    CoTaskMemFree(mixFmt);

    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: IAudioClient::Initialize failed (0x%08lX)", hr);
        return false;
    }

    // Set the event handle.
    hr = audio_client_->SetEventHandle(static_cast<HANDLE>(event_handle_));
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: SetEventHandle failed (0x%08lX)", hr);
        return false;
    }

    // Get the actual buffer size.
    hr = audio_client_->GetBufferSize(&buffer_frames_);
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: GetBufferSize failed (0x%08lX)", hr);
        return false;
    }

    // Get the capture client interface.
    hr = audio_client_->GetService(IID_IAudioCaptureClient_local,
                                    reinterpret_cast<void**>(&capture_client_));
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: GetService(IAudioCaptureClient) failed (0x%08lX)", hr);
        return false;
    }

    CS_LOG(INFO, "WASAPI: initialized (buffer=%u frames, rate=%u Hz, ch=%u)",
           buffer_frames_, sample_rate_, channels_);
    return true;
}

// ---------------------------------------------------------------------------
// start -- begin capturing on a dedicated thread
// ---------------------------------------------------------------------------

bool WasapiCapture::start(AudioCallback cb) {
    if (running_.load()) return true;
    if (!audio_client_ || !capture_client_) {
        CS_LOG(ERR, "WASAPI: not initialized");
        return false;
    }

    callback_ = std::move(cb);
    stop_flag_.store(false);

    // Start the audio client.
    HRESULT hr = audio_client_->Start();
    if (FAILED(hr)) {
        CS_LOG(ERR, "WASAPI: IAudioClient::Start failed (0x%08lX)", hr);
        return false;
    }

    running_.store(true);
    thread_ = std::thread(&WasapiCapture::captureThread, this);

    CS_LOG(INFO, "WASAPI: capture started");
    return true;
}

// ---------------------------------------------------------------------------
// stop -- stop capture and release resources
// ---------------------------------------------------------------------------

void WasapiCapture::stop() {
    stop_flag_.store(true);

    if (thread_.joinable()) {
        thread_.join();
    }

    if (audio_client_) {
        audio_client_->Stop();
    }

    running_.store(false);

    if (capture_client_) {
        capture_client_->Release();
        capture_client_ = nullptr;
    }
    if (audio_client_) {
        audio_client_->Release();
        audio_client_ = nullptr;
    }
    if (device_) {
        device_->Release();
        device_ = nullptr;
    }
    if (event_handle_) {
        CloseHandle(static_cast<HANDLE>(event_handle_));
        event_handle_ = nullptr;
    }

    CS_LOG(INFO, "WASAPI: capture stopped and resources released");
}

// ---------------------------------------------------------------------------
// captureThread -- runs on dedicated thread, delivers audio via callback
// ---------------------------------------------------------------------------

void WasapiCapture::captureThread() {
    CS_LOG(DEBUG, "WASAPI: capture thread started");

    // Set thread priority for low-latency audio.
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);

    while (!stop_flag_.load()) {
        // Wait for WASAPI to signal that data is available.
        DWORD waitResult = WaitForSingleObject(static_cast<HANDLE>(event_handle_), 50);
        if (waitResult == WAIT_TIMEOUT) {
            continue;
        }
        if (waitResult != WAIT_OBJECT_0) {
            CS_LOG(WARN, "WASAPI: WaitForSingleObject returned %lu", waitResult);
            break;
        }

        // Read all available packets.
        UINT32 packetLength = 0;
        HRESULT hr = capture_client_->GetNextPacketSize(&packetLength);
        if (FAILED(hr)) {
            CS_LOG(ERR, "WASAPI: GetNextPacketSize failed (0x%08lX)", hr);
            break;
        }

        while (packetLength > 0) {
            BYTE*  data          = nullptr;
            UINT32 framesAvail   = 0;
            DWORD  flags         = 0;
            UINT64 devicePosition = 0;
            UINT64 qpcPosition   = 0;

            hr = capture_client_->GetBuffer(&data, &framesAvail, &flags,
                                             &devicePosition, &qpcPosition);
            if (FAILED(hr)) {
                CS_LOG(ERR, "WASAPI: GetBuffer failed (0x%08lX)", hr);
                break;
            }

            // If the buffer is silent, we still deliver silence (zeroes).
            if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                // Deliver silence as zero-filled float buffer.
                size_t total_samples = static_cast<size_t>(framesAvail) * channels_;
                std::vector<float> silence(total_samples, 0.0f);
                if (callback_) {
                    callback_(silence.data(), framesAvail, sample_rate_, channels_);
                }
            } else {
                // Deliver actual audio data.
                if (callback_) {
                    callback_(reinterpret_cast<const float*>(data),
                              framesAvail, sample_rate_, channels_);
                }
            }

            hr = capture_client_->ReleaseBuffer(framesAvail);
            if (FAILED(hr)) {
                CS_LOG(ERR, "WASAPI: ReleaseBuffer failed (0x%08lX)", hr);
                break;
            }

            hr = capture_client_->GetNextPacketSize(&packetLength);
            if (FAILED(hr)) {
                CS_LOG(ERR, "WASAPI: GetNextPacketSize failed (0x%08lX)", hr);
                packetLength = 0;
            }
        }
    }

    CS_LOG(DEBUG, "WASAPI: capture thread exiting");
}

} // namespace cs::host
