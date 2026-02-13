///////////////////////////////////////////////////////////////////////////////
// wasapi_playback.h -- Windows audio playback via WASAPI
//
// Plays decoded PCM audio through the default audio output device using
// Windows Audio Session API (WASAPI) in shared mode with low latency.
//
// Input format: 48kHz stereo float32 (matching Opus decoder output).
///////////////////////////////////////////////////////////////////////////////
#pragma once

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

class WasapiPlayback {
public:
    WasapiPlayback();
    ~WasapiPlayback();

    // Non-copyable
    WasapiPlayback(const WasapiPlayback&) = delete;
    WasapiPlayback& operator=(const WasapiPlayback&) = delete;

    /// Initialize WASAPI audio output.
    /// @param sample_rate  Typically 48000
    /// @param channels     Typically 2 (stereo)
    bool initialize(uint32_t sample_rate, uint16_t channels);

    /// Play PCM float samples. Blocks until the samples are submitted
    /// to the WASAPI buffer (may wait for buffer space).
    /// @param samples      Float PCM samples (interleaved stereo)
    /// @param frame_count  Number of audio frames (1 frame = channels samples)
    /// @return true on success
    bool play(const float* samples, size_t frame_count);

    /// Stop playback and release resources.
    void stop();

    /// Get the current audio output latency in milliseconds.
    float getLatencyMs() const;

    /// Returns true if playback is initialized and active.
    bool isInitialized() const;

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
