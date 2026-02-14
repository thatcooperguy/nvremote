///////////////////////////////////////////////////////////////////////////////
// opus_decoder.h -- Opus audio decoder wrapper
//
// Decodes Opus-compressed audio packets to PCM float samples.
// Supports packet loss concealment (PLC) for graceful audio degradation
// when packets are lost.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <vector>
#include <mutex>

// Forward-declare Opus types
struct OpusDecoder;

namespace cs {

class OpusDecoderWrapper {
public:
    OpusDecoderWrapper();
    ~OpusDecoderWrapper();

    // Non-copyable
    OpusDecoderWrapper(const OpusDecoderWrapper&) = delete;
    OpusDecoderWrapper& operator=(const OpusDecoderWrapper&) = delete;

    /// Initialize the decoder.
    /// @param sample_rate  Typically 48000
    /// @param channels     1 (mono) or 2 (stereo)
    bool initialize(uint32_t sample_rate, uint16_t channels);

    /// Decode an Opus packet to float PCM samples.
    /// @param data     Opus compressed data
    /// @param len      Length of compressed data in bytes
    /// @param pcm      Output: decoded float samples (interleaved if stereo)
    /// @return true on success
    bool decode(const uint8_t* data, size_t len, std::vector<float>& pcm);

    /// Decode with packet loss concealment (when a packet is known to be lost).
    /// @param frame_count  Number of frames to conceal (typically 1)
    /// @param pcm          Output: synthesized float samples
    /// @return true on success
    bool decodePLC(size_t frame_count, std::vector<float>& pcm);

    /// Release the decoder. Safe to call multiple times.
    void release();

    /// Get the configured sample rate.
    uint32_t getSampleRate() const { return sample_rate_; }

    /// Get the configured channel count.
    uint16_t getChannels() const { return channels_; }

private:
    ::OpusDecoder* decoder_     = nullptr;
    uint32_t sample_rate_       = 48000;
    uint16_t channels_          = 2;
    bool     initialized_       = false;

    // Frame size: 480 samples = 10ms at 48kHz
    static constexpr int FRAME_SIZE = 480;
    // Maximum frame size for safety (120ms at 48kHz)
    static constexpr int MAX_FRAME_SIZE = 5760;

    std::mutex mutex_;
};

} // namespace cs
