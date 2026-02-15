///////////////////////////////////////////////////////////////////////////////
// coreaudio_playback.h -- macOS audio playback via AudioQueue
//
// Plays decoded PCM audio through the default audio output device using
// Apple's AudioQueue Services for low-latency output.
//
// Input format: 48kHz stereo float32 (matching Opus decoder output).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "audio_playback_interface.h"

#include <cstdint>
#include <mutex>
#include <atomic>
#include <vector>

#ifdef __APPLE__
#include <AudioToolbox/AudioToolbox.h>
#endif

namespace cs {

class CoreAudioPlayback : public IAudioPlayback {
public:
    CoreAudioPlayback();
    ~CoreAudioPlayback() override;

    // Non-copyable
    CoreAudioPlayback(const CoreAudioPlayback&) = delete;
    CoreAudioPlayback& operator=(const CoreAudioPlayback&) = delete;

    bool initialize(uint32_t sample_rate, uint16_t channels) override;
    bool play(const float* samples, size_t frame_count) override;
    void stop() override;
    float getLatencyMs() const override;
    bool isInitialized() const override;

private:
#ifdef __APPLE__
    /// AudioQueue callback: refill a buffer from the ring buffer.
    static void audioQueueCallback(void* userData, AudioQueueRef queue,
                                   AudioQueueBufferRef buffer);

    AudioQueueRef           queue_       = nullptr;
    AudioStreamBasicDescription format_  = {};

    // Number of AudioQueue buffers (triple-buffered for low latency)
    static constexpr int kNumBuffers = 3;
    AudioQueueBufferRef  buffers_[kNumBuffers] = {};

    // Simple ring buffer for PCM samples
    std::vector<float> ring_buffer_;
    size_t             ring_read_  = 0;
    size_t             ring_write_ = 0;
    size_t             ring_count_ = 0;  // samples available
    std::mutex         ring_mutex_;
#endif

    uint32_t sample_rate_    = 48000;
    uint16_t channels_       = 2;
    bool     initialized_    = false;
    bool     started_        = false;
};

} // namespace cs
