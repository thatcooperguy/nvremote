///////////////////////////////////////////////////////////////////////////////
// wasapi_playback.h -- Windows audio playback via WASAPI
//
// Plays decoded PCM audio through the default audio output device using
// Windows Audio Session API (WASAPI) in shared mode with low latency.
//
// Input format: 48kHz stereo float32 (matching Opus decoder output).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "audio_playback_interface.h"

#include <cstdint>
#include <mutex>
#include <atomic>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
#endif

namespace cs {

class WasapiPlayback : public IAudioPlayback {
public:
    WasapiPlayback();
    ~WasapiPlayback() override;

    // Non-copyable
    WasapiPlayback(const WasapiPlayback&) = delete;
    WasapiPlayback& operator=(const WasapiPlayback&) = delete;

    bool initialize(uint32_t sample_rate, uint16_t channels) override;
    bool play(const float* samples, size_t frame_count) override;
    void stop() override;
    float getLatencyMs() const override;
    bool isInitialized() const override;

private:
#ifdef _WIN32
    ComPtr<IMMDeviceEnumerator> enumerator_;
    ComPtr<IMMDevice>           device_;
    ComPtr<IAudioClient>        audio_client_;
    ComPtr<IAudioRenderClient>  render_client_;
    HANDLE                      buffer_event_ = nullptr;
    WAVEFORMATEXTENSIBLE        wave_format_  = {};
#endif

    uint32_t sample_rate_    = 48000;
    uint16_t channels_       = 2;
    uint32_t buffer_frames_  = 0;   // Total buffer size in frames
    bool     initialized_    = false;
    bool     started_        = false;

    mutable std::mutex mutex_;
};

} // namespace cs
