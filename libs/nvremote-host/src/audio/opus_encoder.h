///////////////////////////////////////////////////////////////////////////////
// opus_encoder.h -- Opus audio encoder wrapper
//
// Wraps the Opus encoder library for real-time audio encoding.
//
// Configuration:
//   - 48 kHz sample rate (native Opus rate)
//   - Stereo (2 channels)
//   - 128 kbps default bitrate
//   - 10 ms frame size (480 samples at 48 kHz)
//   - OPUS_APPLICATION_RESTRICTED_LOWDELAY for minimum latency
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <vector>

// Forward-declare the opaque Opus encoder type.
struct OpusEncoder;

namespace cs::host {

class OpusEncoderWrapper {
public:
    OpusEncoderWrapper();
    ~OpusEncoderWrapper();

    /// Initialize the encoder.
    /// |sample_rate|: typically 48000.
    /// |channels|:    1 (mono) or 2 (stereo).
    /// |bitrate|:     target bitrate in bps (default 128000).
    bool initialize(uint32_t sample_rate = 48000,
                    uint16_t channels = 2,
                    uint32_t bitrate = 128000);

    /// Encode a frame of float32 PCM samples.
    /// |pcm|:         pointer to interleaved float samples.
    /// |frame_count|: number of audio frames (samples per channel).
    ///                Must equal the frame size (e.g. 480 for 10ms @ 48kHz).
    /// |out|:         receives the Opus-encoded packet bytes.
    /// Returns true on success.
    bool encode(const float* pcm, size_t frame_count, std::vector<uint8_t>& out);

    /// Dynamically change the bitrate.
    void setBitrate(uint32_t bitrate);

    /// Get the configured frame size in samples per channel.
    uint32_t getFrameSize() const { return frame_size_; }

    /// Get the configured sample rate.
    uint32_t getSampleRate() const { return sample_rate_; }

    /// Get the number of channels.
    uint16_t getChannels() const { return channels_; }

    /// Release encoder resources.
    void release();

private:
    OpusEncoder* encoder_      = nullptr;
    uint32_t     sample_rate_  = 48000;
    uint16_t     channels_     = 2;
    uint32_t     bitrate_      = 128000;
    uint32_t     frame_size_   = 480;   // 10 ms at 48 kHz
};

} // namespace cs::host
