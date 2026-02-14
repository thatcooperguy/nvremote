///////////////////////////////////////////////////////////////////////////////
// wasapi_capture.h -- WASAPI loopback audio capture
//
// Captures the system audio output (loopback) via the Windows Audio Session
// API (WASAPI).  The capture runs on a dedicated thread and delivers PCM
// samples via a callback.
//
// Configuration:
//   - 48 kHz sample rate (native for Opus)
//   - Stereo (2 channels)
//   - 32-bit float samples
//   - 10 ms buffer period (low latency)
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <thread>
#include <atomic>

// Forward-declare COM interfaces to avoid pulling Windows headers into
// every translation unit that includes this header.
struct IAudioClient;
struct IAudioCaptureClient;
struct IMMDevice;

namespace cs::host {

/// Callback signature: (samples, frame_count, sample_rate, channels).
/// |samples| points to interleaved float32 PCM data.
using AudioCallback = std::function<void(
    const float* samples, size_t frame_count,
    uint32_t sample_rate, uint16_t channels)>;

class WasapiCapture {
public:
    WasapiCapture();
    ~WasapiCapture();

    /// Initialize WASAPI loopback capture.
    /// If |device_id| is empty, use the default audio render device.
    bool initialize(const std::string& device_id = "");

    /// Start capturing.  Audio data is delivered via |cb|.
    bool start(AudioCallback cb);

    /// Stop capturing and release resources.
    void stop();

    /// Check if capture is running.
    bool isRunning() const { return running_.load(); }

    /// Get the actual sample rate negotiated with WASAPI.
    uint32_t getSampleRate() const { return sample_rate_; }

    /// Get the number of channels.
    uint16_t getChannels() const { return channels_; }

private:
    void captureThread();

    IAudioClient*         audio_client_   = nullptr;
    IAudioCaptureClient*  capture_client_ = nullptr;
    IMMDevice*            device_         = nullptr;

    uint32_t              sample_rate_    = 48000;
    uint16_t              channels_       = 2;
    uint32_t              buffer_frames_  = 0;

    AudioCallback         callback_;
    std::thread           thread_;
    std::atomic<bool>     running_{false};
    std::atomic<bool>     stop_flag_{false};

    // Event signaled by WASAPI when data is available.
    void*                 event_handle_   = nullptr;  // HANDLE
};

} // namespace cs::host
