///////////////////////////////////////////////////////////////////////////////
// audio_playback_interface.h -- Abstract audio playback interface
//
// Provides the common base for platform audio playback implementations
// (WASAPI on Windows, CoreAudio on macOS). Each implementation receives
// decoded PCM float samples and outputs them to the default audio device.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <cstddef>

namespace cs {

class IAudioPlayback {
public:
    virtual ~IAudioPlayback() = default;

    /// Initialize audio output.
    /// @param sample_rate  Typically 48000
    /// @param channels     Typically 2 (stereo)
    virtual bool initialize(uint32_t sample_rate, uint16_t channels) = 0;

    /// Play PCM float samples. May block until buffer space is available.
    /// @param samples      Float PCM samples (interleaved stereo)
    /// @param frame_count  Number of audio frames (1 frame = channels samples)
    virtual bool play(const float* samples, size_t frame_count) = 0;

    /// Stop playback and release resources.
    virtual void stop() = 0;

    /// Get the current audio output latency in milliseconds.
    virtual float getLatencyMs() const = 0;

    /// Returns true if playback is initialized and active.
    virtual bool isInitialized() const = 0;
};

} // namespace cs
