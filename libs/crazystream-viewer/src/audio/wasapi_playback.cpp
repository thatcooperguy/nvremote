///////////////////////////////////////////////////////////////////////////////
// wasapi_playback.cpp -- Windows audio playback via WASAPI
//
// Plays decoded PCM audio through the default audio output device using
// WASAPI in shared mode with event-driven buffering for low latency.
///////////////////////////////////////////////////////////////////////////////

#include "wasapi_playback.h"

#include <cs/common.h>

#ifdef _WIN32
#include <functiondiscoverykeys_devpkey.h>
#include <avrt.h>
#include <cstring>
#include <cmath>
#include <algorithm>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "avrt.lib")

// WASAPI-related GUIDs
#include <initguid.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#endif

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

WasapiPlayback::WasapiPlayback() = default;

WasapiPlayback::~WasapiPlayback() {
    stop();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool WasapiPlayback::initialize(uint32_t sample_rate, uint16_t channels) {
    std::lock_guard<std::mutex> lock(mutex_);

#ifndef _WIN32
    (void)sample_rate; (void)channels;
    CS_LOG(ERR, "WasapiPlayback: only supported on Windows");
    return false;
#else
    if (initialized_) {
        stop();
    }

    sample_rate_ = sample_rate;
    channels_ = channels;

    // Initialize COM (if not already)
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE && hr != S_FALSE) {
        CS_LOG(ERR, "WasapiPlayback: CoInitializeEx failed: 0x%08lx", hr);
        return false;
    }

    // Get default audio endpoint
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
                          CLSCTX_ALL, IID_PPV_ARGS(enumerator_.GetAddressOf()));
    if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: failed to create device enumerator: 0x%08lx", hr);
        return false;
    }

    hr = enumerator_->GetDefaultAudioEndpoint(eRender, eConsole, device_.GetAddressOf());
    if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: failed to get default audio endpoint: 0x%08lx", hr);
        return false;
    }

    // Activate audio client
    hr = device_->Activate(__uuidof(IAudioClient), CLSCTX_ALL,
                            nullptr, reinterpret_cast<void**>(audio_client_.GetAddressOf()));
    if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: failed to activate audio client: 0x%08lx", hr);
        return false;
    }

    // Set up the desired format: float32, specified sample rate and channels
    std::memset(&wave_format_, 0, sizeof(wave_format_));
    wave_format_.Format.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
    wave_format_.Format.nChannels = channels;
    wave_format_.Format.nSamplesPerSec = sample_rate;
    wave_format_.Format.wBitsPerSample = 32;
    wave_format_.Format.nBlockAlign = channels * 4;  // 4 bytes per float sample
    wave_format_.Format.nAvgBytesPerSec = sample_rate * channels * 4;
    wave_format_.Format.cbSize = sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX);
    wave_format_.Samples.wValidBitsPerSample = 32;
    wave_format_.dwChannelMask = (channels == 2) ?
        (SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT) : SPEAKER_FRONT_CENTER;
    wave_format_.SubFormat = KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;

    // Check if the format is supported
    WAVEFORMATEX* closest = nullptr;
    hr = audio_client_->IsFormatSupported(
        AUDCLNT_SHAREMODE_SHARED,
        &wave_format_.Format,
        &closest
    );

    if (hr == S_FALSE && closest) {
        // Use the closest supported format
        CS_LOG(WARN, "WasapiPlayback: requested format not exact, using closest match");
        // Copy over the closest format if it's still float32
        if (closest->wBitsPerSample == 32) {
            std::memcpy(&wave_format_.Format, closest, sizeof(WAVEFORMATEX));
        }
        CoTaskMemFree(closest);
    } else if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: format not supported: 0x%08lx", hr);
        if (closest) CoTaskMemFree(closest);
        return false;
    }

    // Create an event for buffer notifications
    buffer_event_ = CreateEvent(nullptr, FALSE, FALSE, nullptr);
    if (!buffer_event_) {
        CS_LOG(ERR, "WasapiPlayback: CreateEvent failed");
        return false;
    }

    // Initialize the audio client with low-latency settings
    // Target buffer duration: 10ms (100000 * 100ns units = 10ms)
    REFERENCE_TIME requested_duration = 100000;  // 10ms in 100ns units

    hr = audio_client_->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
            AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
        requested_duration,
        0,                      // Periodicity (must be 0 for shared mode)
        &wave_format_.Format,
        nullptr                 // Audio session GUID
    );

    if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: audio client Initialize failed: 0x%08lx", hr);
        CloseHandle(buffer_event_);
        buffer_event_ = nullptr;
        return false;
    }

    // Set the event handle
    hr = audio_client_->SetEventHandle(buffer_event_);
    if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: SetEventHandle failed: 0x%08lx", hr);
        return false;
    }

    // Get the actual buffer size
    hr = audio_client_->GetBufferSize(&buffer_frames_);
    if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: GetBufferSize failed: 0x%08lx", hr);
        return false;
    }

    // Get the render client
    hr = audio_client_->GetService(IID_PPV_ARGS(render_client_.GetAddressOf()));
    if (FAILED(hr)) {
        CS_LOG(ERR, "WasapiPlayback: GetService(IAudioRenderClient) failed: 0x%08lx", hr);
        return false;
    }

    initialized_ = true;

    float latency_ms = static_cast<float>(buffer_frames_) / static_cast<float>(sample_rate_) * 1000.0f;
    CS_LOG(INFO, "WasapiPlayback: initialized %uHz %uch float32, buffer=%u frames (%.1fms)",
           sample_rate, channels, buffer_frames_, latency_ms);
    return true;
#endif
}

// ---------------------------------------------------------------------------
// play
// ---------------------------------------------------------------------------

bool WasapiPlayback::play(const float* samples, size_t frame_count) {
    std::lock_guard<std::mutex> lock(mutex_);

#ifndef _WIN32
    (void)samples; (void)frame_count;
    return false;
#else
    if (!initialized_ || !audio_client_ || !render_client_) {
        return false;
    }

    // Start the audio client on first play
    if (!started_) {
        HRESULT hr = audio_client_->Start();
        if (FAILED(hr)) {
            CS_LOG(ERR, "WasapiPlayback: Start failed: 0x%08lx", hr);
            return false;
        }
        started_ = true;
    }

    size_t remaining = frame_count;
    const float* src = samples;

    while (remaining > 0) {
        // Get the amount of buffer space available
        UINT32 padding = 0;
        HRESULT hr = audio_client_->GetCurrentPadding(&padding);
        if (FAILED(hr)) {
            CS_LOG(WARN, "WasapiPlayback: GetCurrentPadding failed: 0x%08lx", hr);
            return false;
        }

        UINT32 available = buffer_frames_ - padding;
        if (available == 0) {
            // Wait for buffer space
            DWORD wait_result = WaitForSingleObject(buffer_event_, 50);  // 50ms timeout
            if (wait_result == WAIT_TIMEOUT) {
                CS_LOG(WARN, "WasapiPlayback: buffer wait timeout");
                return false;
            }
            continue;
        }

        UINT32 to_write = static_cast<UINT32>(std::min(
            static_cast<size_t>(available), remaining));

        BYTE* buffer_data = nullptr;
        hr = render_client_->GetBuffer(to_write, &buffer_data);
        if (FAILED(hr)) {
            CS_LOG(WARN, "WasapiPlayback: GetBuffer failed: 0x%08lx", hr);
            return false;
        }

        // Copy PCM data (float32, channels_ samples per frame)
        size_t bytes = static_cast<size_t>(to_write) * channels_ * sizeof(float);
        std::memcpy(buffer_data, src, bytes);

        hr = render_client_->ReleaseBuffer(to_write, 0);
        if (FAILED(hr)) {
            CS_LOG(WARN, "WasapiPlayback: ReleaseBuffer failed: 0x%08lx", hr);
            return false;
        }

        src += static_cast<size_t>(to_write) * channels_;
        remaining -= to_write;
    }

    return true;
#endif
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

void WasapiPlayback::stop() {
    std::lock_guard<std::mutex> lock(mutex_);

#ifdef _WIN32
    if (audio_client_ && started_) {
        audio_client_->Stop();
        started_ = false;
    }

    render_client_.Reset();
    audio_client_.Reset();
    device_.Reset();
    enumerator_.Reset();

    if (buffer_event_) {
        CloseHandle(buffer_event_);
        buffer_event_ = nullptr;
    }
#endif

    initialized_ = false;
}

// ---------------------------------------------------------------------------
// getLatencyMs
// ---------------------------------------------------------------------------

float WasapiPlayback::getLatencyMs() const {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_ || sample_rate_ == 0) {
        return 0.0f;
    }

#ifdef _WIN32
    UINT32 padding = 0;
    if (audio_client_) {
        HRESULT hr = audio_client_->GetCurrentPadding(&padding);
        if (SUCCEEDED(hr)) {
            return static_cast<float>(padding) / static_cast<float>(sample_rate_) * 1000.0f;
        }
    }
#endif

    return static_cast<float>(buffer_frames_) / static_cast<float>(sample_rate_) * 1000.0f;
}

// ---------------------------------------------------------------------------
// isInitialized
// ---------------------------------------------------------------------------

bool WasapiPlayback::isInitialized() const {
    return initialized_;
}

} // namespace cs
