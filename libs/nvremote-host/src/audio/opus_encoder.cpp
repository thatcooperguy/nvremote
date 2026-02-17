///////////////////////////////////////////////////////////////////////////////
// opus_encoder.cpp -- Opus audio encoder wrapper implementation
//
// Wraps the libopus encoder for ultra-low-latency audio encoding.
///////////////////////////////////////////////////////////////////////////////

#include "opus_encoder.h"
#include <cs/common.h>

#include <opus.h>
#include <cstring>

namespace cs::host {

OpusEncoderWrapper::OpusEncoderWrapper() = default;

OpusEncoderWrapper::~OpusEncoderWrapper() {
    release();
}

// ---------------------------------------------------------------------------
// initialize -- create and configure the Opus encoder
// ---------------------------------------------------------------------------

bool OpusEncoderWrapper::initialize(uint32_t sample_rate, uint16_t channels, uint32_t bitrate) {
    if (encoder_) release();

    sample_rate_ = sample_rate;
    channels_    = channels;
    bitrate_     = bitrate;

    // Frame size: 10 ms at the given sample rate.
    frame_size_ = sample_rate / 100;  // 480 samples for 48 kHz

    int error = 0;
    encoder_ = opus_encoder_create(
        static_cast<opus_int32>(sample_rate),
        static_cast<int>(channels),
        OPUS_APPLICATION_RESTRICTED_LOWDELAY,
        &error
    );

    if (error != OPUS_OK || !encoder_) {
        CS_LOG(ERR, "Opus: opus_encoder_create failed (error=%d: %s)",
               error, opus_strerror(error));
        encoder_ = nullptr;
        return false;
    }

    // Set bitrate.
    opus_encoder_ctl(encoder_, OPUS_SET_BITRATE(static_cast<opus_int32>(bitrate)));

    // Enable FEC for resilience against packet loss.
    opus_encoder_ctl(encoder_, OPUS_SET_INBAND_FEC(1));

    // Set expected packet loss percentage (start conservative at 5%).
    opus_encoder_ctl(encoder_, OPUS_SET_PACKET_LOSS_PERC(5));

    // Use CELT-only mode for lowest latency (disable SILK hybrid).
    opus_encoder_ctl(encoder_, OPUS_SET_FORCE_CHANNELS(channels));

    // Set complexity to 5 (balance quality vs CPU for real-time).
    opus_encoder_ctl(encoder_, OPUS_SET_COMPLEXITY(5));

    // Disable DTX (we want continuous audio for game streaming).
    opus_encoder_ctl(encoder_, OPUS_SET_DTX(0));

    CS_LOG(INFO, "Opus: encoder initialized -- %u Hz, %u ch, %u bps, frame=%u samples",
           sample_rate_, channels_, bitrate_, frame_size_);
    return true;
}

// ---------------------------------------------------------------------------
// encode -- encode one frame of PCM audio
// ---------------------------------------------------------------------------

bool OpusEncoderWrapper::encode(const float* pcm, size_t frame_count,
                                 std::vector<uint8_t>& out) {
    if (!encoder_) return false;

    if (frame_count != frame_size_) {
        CS_LOG(WARN, "Opus: frame_count=%zu but expected %u", frame_count, frame_size_);
        return false;
    }

    // Maximum Opus packet size: 1275 bytes per frame (Opus spec).
    out.resize(4000);

    opus_int32 encoded = opus_encode_float(
        encoder_,
        pcm,
        static_cast<int>(frame_count),
        out.data(),
        static_cast<opus_int32>(out.size())
    );

    if (encoded < 0) {
        CS_LOG(ERR, "Opus: opus_encode_float failed (error=%d: %s)",
               encoded, opus_strerror(encoded));
        out.clear();
        return false;
    }

    out.resize(static_cast<size_t>(encoded));

    CS_LOG(TRACE, "Opus: encoded %zu samples -> %d bytes", frame_count, encoded);
    return true;
}

// ---------------------------------------------------------------------------
// setBitrate -- dynamically adjust the audio bitrate
// ---------------------------------------------------------------------------

void OpusEncoderWrapper::setBitrate(uint32_t bitrate) {
    if (!encoder_) return;
    bitrate_ = bitrate;
    opus_encoder_ctl(encoder_, OPUS_SET_BITRATE(static_cast<opus_int32>(bitrate)));
    CS_LOG(DEBUG, "Opus: bitrate set to %u bps", bitrate);
}

// ---------------------------------------------------------------------------
// release -- destroy the Opus encoder
// ---------------------------------------------------------------------------

void OpusEncoderWrapper::release() {
    if (encoder_) {
        opus_encoder_destroy(encoder_);
        encoder_ = nullptr;
    }
    CS_LOG(DEBUG, "Opus: encoder released");
}

} // namespace cs::host
