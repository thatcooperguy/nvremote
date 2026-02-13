///////////////////////////////////////////////////////////////////////////////
// opus_decoder.cpp -- Opus audio decoder wrapper
//
// Decodes Opus-compressed audio to float PCM. Supports packet loss
// concealment (PLC) for graceful degradation when audio packets are
// dropped or arrive out of order.
///////////////////////////////////////////////////////////////////////////////

#include "opus_decoder.h"

#include <cs/common.h>

#include <opus/opus.h>

namespace cs {

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

OpusDecoderWrapper::OpusDecoderWrapper() = default;

OpusDecoderWrapper::~OpusDecoderWrapper() {
    release();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool OpusDecoderWrapper::initialize(uint32_t sample_rate, uint16_t channels) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        release();
    }

    sample_rate_ = sample_rate;
    channels_ = channels;

    // Validate parameters
    if (channels != 1 && channels != 2) {
        CS_LOG(ERR, "OpusDecoder: invalid channel count %u (must be 1 or 2)", channels);
        return false;
    }

    if (sample_rate != 8000 && sample_rate != 12000 &&
        sample_rate != 16000 && sample_rate != 24000 && sample_rate != 48000) {
        CS_LOG(ERR, "OpusDecoder: invalid sample rate %u", sample_rate);
        return false;
    }

    int error = 0;
    decoder_ = opus_decoder_create(static_cast<opus_int32>(sample_rate),
                                    static_cast<int>(channels),
                                    &error);
    if (error != OPUS_OK || !decoder_) {
        CS_LOG(ERR, "OpusDecoder: opus_decoder_create failed: %s", opus_strerror(error));
        decoder_ = nullptr;
        return false;
    }

    initialized_ = true;
    CS_LOG(INFO, "OpusDecoder: initialized %uHz %uch", sample_rate, channels);
    return true;
}

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

bool OpusDecoderWrapper::decode(const uint8_t* data, size_t len, std::vector<float>& pcm) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_ || !decoder_) {
        return false;
    }

    // Allocate output buffer for maximum frame size
    pcm.resize(static_cast<size_t>(MAX_FRAME_SIZE) * channels_);

    int samples = opus_decode_float(
        decoder_,
        data,
        static_cast<opus_int32>(len),
        pcm.data(),
        MAX_FRAME_SIZE,
        0   // no FEC
    );

    if (samples < 0) {
        CS_LOG(WARN, "OpusDecoder: decode failed: %s", opus_strerror(samples));
        pcm.clear();
        return false;
    }

    // Resize to actual decoded samples (samples * channels for interleaved)
    pcm.resize(static_cast<size_t>(samples) * channels_);
    return true;
}

// ---------------------------------------------------------------------------
// decodePLC
// ---------------------------------------------------------------------------

bool OpusDecoderWrapper::decodePLC(size_t frame_count, std::vector<float>& pcm) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!initialized_ || !decoder_) {
        return false;
    }

    // PLC: pass nullptr as data to opus_decode_float
    // This tells the decoder to generate concealment audio based on
    // its internal state from previous successfully decoded packets.
    int decode_size = FRAME_SIZE * static_cast<int>(frame_count);
    if (decode_size > MAX_FRAME_SIZE) {
        decode_size = MAX_FRAME_SIZE;
    }

    pcm.resize(static_cast<size_t>(decode_size) * channels_);

    int samples = opus_decode_float(
        decoder_,
        nullptr,    // PLC mode
        0,
        pcm.data(),
        decode_size,
        0
    );

    if (samples < 0) {
        CS_LOG(WARN, "OpusDecoder: PLC failed: %s", opus_strerror(samples));
        pcm.clear();
        return false;
    }

    pcm.resize(static_cast<size_t>(samples) * channels_);
    return true;
}

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

void OpusDecoderWrapper::release() {
    // Note: this may be called without lock from destructor, but also from
    // initialize() which holds the lock. Use a simple flag check.
    if (decoder_) {
        opus_decoder_destroy(decoder_);
        decoder_ = nullptr;
    }
    initialized_ = false;
}

} // namespace cs
