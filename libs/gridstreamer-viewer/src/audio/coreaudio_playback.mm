///////////////////////////////////////////////////////////////////////////////
// coreaudio_playback.mm -- macOS audio playback via AudioQueue
//
// Uses AudioQueue Services for low-latency PCM playback. Triple-buffered
// with a ring buffer to decouple the Opus decode thread from the audio
// output callback thread.
///////////////////////////////////////////////////////////////////////////////

#include "coreaudio_playback.h"

#include <cs/common.h>

#ifdef __APPLE__
#include <cstring>
#include <algorithm>
#endif

namespace cs {

// Buffer size per AudioQueue buffer: 10ms of audio at configured rate
static constexpr size_t kBufferDurationMs = 10;

// Ring buffer capacity: 200ms of audio
static constexpr size_t kRingBufferDurationMs = 200;

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

CoreAudioPlayback::CoreAudioPlayback() = default;

CoreAudioPlayback::~CoreAudioPlayback() {
    stop();
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

bool CoreAudioPlayback::initialize(uint32_t sample_rate, uint16_t channels) {
#ifdef __APPLE__
    if (initialized_) {
        stop();
    }

    sample_rate_ = sample_rate;
    channels_    = channels;

    // Configure audio format: 32-bit float, interleaved
    std::memset(&format_, 0, sizeof(format_));
    format_.mSampleRate       = static_cast<double>(sample_rate);
    format_.mFormatID         = kAudioFormatLinearPCM;
    format_.mFormatFlags      = kLinearPCMFormatFlagIsFloat | kLinearPCMFormatFlagIsPacked;
    format_.mBytesPerPacket   = channels * sizeof(float);
    format_.mFramesPerPacket  = 1;
    format_.mBytesPerFrame    = channels * sizeof(float);
    format_.mChannelsPerFrame = channels;
    format_.mBitsPerChannel   = 32;

    // Create AudioQueue for output
    OSStatus status = AudioQueueNewOutput(
        &format_,
        audioQueueCallback,
        this,
        nullptr,   // run loop (null = internal)
        nullptr,   // run loop mode
        0,         // flags
        &queue_);

    if (status != noErr) {
        CS_LOG(ERR, "CoreAudio: AudioQueueNewOutput failed: %d", (int)status);
        return false;
    }

    // Allocate buffers
    size_t frames_per_buffer = (sample_rate * kBufferDurationMs) / 1000;
    size_t buffer_bytes = frames_per_buffer * channels * sizeof(float);

    for (int i = 0; i < kNumBuffers; i++) {
        status = AudioQueueAllocateBuffer(queue_, static_cast<UInt32>(buffer_bytes), &buffers_[i]);
        if (status != noErr) {
            CS_LOG(ERR, "CoreAudio: AudioQueueAllocateBuffer failed: %d", (int)status);
            stop();
            return false;
        }
        // Pre-fill with silence and enqueue
        std::memset(buffers_[i]->mAudioData, 0, buffer_bytes);
        buffers_[i]->mAudioDataByteSize = static_cast<UInt32>(buffer_bytes);
        AudioQueueEnqueueBuffer(queue_, buffers_[i], 0, nullptr);
    }

    // Initialize ring buffer
    size_t ring_capacity = (sample_rate * channels * kRingBufferDurationMs) / 1000;
    ring_buffer_.resize(ring_capacity, 0.0f);
    ring_read_  = 0;
    ring_write_ = 0;
    ring_count_ = 0;

    // Start playback
    status = AudioQueueStart(queue_, nullptr);
    if (status != noErr) {
        CS_LOG(ERR, "CoreAudio: AudioQueueStart failed: %d", (int)status);
        stop();
        return false;
    }

    initialized_ = true;
    started_     = true;
    CS_LOG(INFO, "CoreAudio: initialized @ %uHz %uch (buffer=%zums)",
           sample_rate, channels, kBufferDurationMs);
    return true;
#else
    (void)sample_rate; (void)channels;
    return false;
#endif
}

// ---------------------------------------------------------------------------
// play
// ---------------------------------------------------------------------------

bool CoreAudioPlayback::play(const float* samples, size_t frame_count) {
#ifdef __APPLE__
    if (!initialized_ || !samples || frame_count == 0) return false;

    size_t total_samples = frame_count * channels_;

    std::lock_guard<std::mutex> lock(ring_mutex_);

    size_t capacity = ring_buffer_.size();
    size_t available = capacity - ring_count_;

    if (total_samples > available) {
        // Ring buffer full — drop oldest data to make room
        size_t to_drop = total_samples - available;
        ring_read_ = (ring_read_ + to_drop) % capacity;
        ring_count_ -= to_drop;
    }

    // Copy samples into ring buffer
    for (size_t i = 0; i < total_samples; i++) {
        ring_buffer_[ring_write_] = samples[i];
        ring_write_ = (ring_write_ + 1) % capacity;
    }
    ring_count_ += total_samples;

    return true;
#else
    (void)samples; (void)frame_count;
    return false;
#endif
}

// ---------------------------------------------------------------------------
// audioQueueCallback
// ---------------------------------------------------------------------------

#ifdef __APPLE__
void CoreAudioPlayback::audioQueueCallback(
    void* userData,
    AudioQueueRef queue,
    AudioQueueBufferRef buffer)
{
    auto* self = static_cast<CoreAudioPlayback*>(userData);

    size_t requested_bytes = buffer->mAudioDataBytesCapacity;
    size_t requested_samples = requested_bytes / sizeof(float);
    float* out = static_cast<float*>(buffer->mAudioData);

    std::lock_guard<std::mutex> lock(self->ring_mutex_);

    size_t to_copy = std::min(requested_samples, self->ring_count_);
    size_t capacity = self->ring_buffer_.size();

    // Copy from ring buffer
    for (size_t i = 0; i < to_copy; i++) {
        out[i] = self->ring_buffer_[self->ring_read_];
        self->ring_read_ = (self->ring_read_ + 1) % capacity;
    }
    self->ring_count_ -= to_copy;

    // Fill remainder with silence
    if (to_copy < requested_samples) {
        std::memset(out + to_copy, 0, (requested_samples - to_copy) * sizeof(float));
    }

    buffer->mAudioDataByteSize = static_cast<UInt32>(requested_bytes);
    AudioQueueEnqueueBuffer(queue, buffer, 0, nullptr);
}
#endif

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

void CoreAudioPlayback::stop() {
#ifdef __APPLE__
    if (queue_) {
        if (started_) {
            AudioQueueStop(queue_, true);
            started_ = false;
        }
        AudioQueueDispose(queue_, true);
        queue_ = nullptr;
    }

    for (int i = 0; i < kNumBuffers; i++) {
        buffers_[i] = nullptr;  // Disposed with queue
    }

    ring_buffer_.clear();
    ring_read_  = 0;
    ring_write_ = 0;
    ring_count_ = 0;

    initialized_ = false;
    CS_LOG(INFO, "CoreAudio: stopped");
#endif
}

// ---------------------------------------------------------------------------
// getLatencyMs
// ---------------------------------------------------------------------------

float CoreAudioPlayback::getLatencyMs() const {
#ifdef __APPLE__
    // Approximate: number of buffered samples / (sample_rate * channels) * 1000
    if (sample_rate_ == 0 || channels_ == 0) return 0.0f;
    return static_cast<float>(ring_count_) /
           static_cast<float>(sample_rate_ * channels_) * 1000.0f;
#else
    return 0.0f;
#endif
}

// ---------------------------------------------------------------------------
// isInitialized
// ---------------------------------------------------------------------------

bool CoreAudioPlayback::isInitialized() const {
    return initialized_;
}

} // namespace cs
