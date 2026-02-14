///////////////////////////////////////////////////////////////////////////////
// session_manager.h -- Session orchestrator for GridStreamer host
//
// Owns and coordinates all streaming components: screen capture, video
// encoding, audio capture/encoding, UDP transport, FEC, QoS adaptation,
// DTLS encryption, and ICE connectivity.
//
// Lifecycle:
//   1. initialize()       -- detect capture/encoder hardware
//   2. prepareSession()   -- configure components for a session
//   3. startSession()     -- DTLS handshake, start streaming threads
//   4. stopSession()      -- tear down threads and release resources
//
// The streaming loop runs on a dedicated high-priority thread, capturing
// frames at the target FPS using QueryPerformanceCounter for precise timing.
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include "cs/common.h"
#include "cs/qos/gaming_modes.h"
#include "cs/p2p/ice_agent.h"
#include "cs/transport/dtls_context.h"
#include "cs/transport/packet.h"

#include "capture/capture_interface.h"
#include "encode/encoder_interface.h"
#include "transport/udp_transport.h"
#include "transport/fec.h"
#include "qos/qos_controller.h"
#include "audio/wasapi_capture.h"
#include "audio/opus_encoder.h"
#include "input/clipboard_inject.h"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace cs::host {

// ---------------------------------------------------------------------------
// SessionConfig -- parameters for session preparation
// ---------------------------------------------------------------------------
struct SessionConfig {
    std::string session_id;
    CodecType   codec           = CodecType::H264;
    uint32_t    bitrate_kbps    = 20000;
    uint32_t    fps             = 60;
    uint32_t    width           = 1920;
    uint32_t    height          = 1080;
    cs::GamingMode gaming_mode  = cs::GamingMode::Balanced;
    std::vector<std::string> stun_servers;
};

// ---------------------------------------------------------------------------
// PeerInfo -- remote peer connection details
// ---------------------------------------------------------------------------
struct PeerInfo {
    std::string ip;
    uint16_t    port              = 0;
    std::string dtls_fingerprint;
};

// ---------------------------------------------------------------------------
// SessionStats -- snapshot of current streaming statistics
// ---------------------------------------------------------------------------
struct SessionStats {
    uint32_t    bitrate_kbps        = 0;
    uint32_t    fps                 = 0;
    uint32_t    width               = 0;
    uint32_t    height              = 0;
    std::string codec;
    std::string gaming_mode;
    float       packet_loss_percent = 0.0f;
    float       jitter_ms           = 0.0f;
    float       rtt_ms              = 0.0f;
    float       capture_time_ms     = 0.0f;
    float       encode_time_ms      = 0.0f;
    uint64_t    bytes_sent          = 0;
    uint64_t    frames_sent         = 0;
    float       fec_ratio           = 0.0f;
    std::string connection_type;    // "p2p" or "relay"
};

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------
class SessionManager {
public:
    SessionManager();
    ~SessionManager();

    // Non-copyable
    SessionManager(const SessionManager&) = delete;
    SessionManager& operator=(const SessionManager&) = delete;

    /// Detect available capture devices and encoder codecs.
    bool initialize();

    /// Configure encoder, QoS preset, DTLS, and ICE for a session.
    bool prepareSession(const SessionConfig& config);

    /// Perform DTLS handshake and start streaming/audio/feedback threads.
    bool startSession(const PeerInfo& peer);

    /// Stop all threads and release session resources.
    void stopSession();

    /// Force the encoder to produce an IDR keyframe.
    void forceIdr();

    /// Reconfigure encoder bitrate and/or FPS on the fly.
    void reconfigure(uint32_t bitrate_kbps, uint32_t fps);

    /// Switch gaming mode preset and apply new targets.
    void setGamingMode(cs::GamingMode mode);

    /// Get a snapshot of current streaming statistics.
    SessionStats getStats() const;

    /// Returns true if streaming threads are active.
    bool isStreaming() const;

    /// Get the capture device (for testing modes).
    ICaptureDevice* getCaptureDevice() const { return capture_.get(); }

    /// Get the encoder (for testing modes).
    IEncoder* getEncoder() const { return encoder_.get(); }

private:
    /// Main video capture + encode + send loop (runs on stream_thread_).
    void streamingLoop();

    /// Audio capture + Opus encode + send loop (runs on audio_thread_).
    void audioLoop();

    /// QoS feedback receive loop (runs on feedback_thread_).
    void feedbackLoop();

    /// Build a video packet header for the current frame fragment.
    cs::VideoPacketHeader buildVideoHeader(uint16_t seq, uint16_t frame_num,
                                           uint8_t frag_idx, uint8_t frag_total,
                                           bool is_keyframe, uint32_t payload_len,
                                           uint64_t timestamp_us) const;

    // -----------------------------------------------------------------------
    // Components
    // -----------------------------------------------------------------------
    std::unique_ptr<ICaptureDevice>       capture_;
    std::unique_ptr<IEncoder>             encoder_;
    std::unique_ptr<UdpTransport>         transport_;
    std::unique_ptr<FecEncoder>           fec_;
    std::unique_ptr<QosController>        qos_;
    std::unique_ptr<WasapiCapture>        audio_capture_;
    std::unique_ptr<OpusEncoderWrapper>   opus_encoder_;
    std::unique_ptr<cs::DtlsContext>      dtls_;
    std::unique_ptr<cs::IceAgent>         ice_;
    std::unique_ptr<ClipboardInjector>    clipboard_;

    // -----------------------------------------------------------------------
    // Threading state
    // -----------------------------------------------------------------------
    std::atomic<bool> streaming_{false};
    std::atomic<bool> should_stop_{false};
    std::atomic<bool> force_idr_flag_{false};
    std::thread       stream_thread_;
    std::thread       audio_thread_;
    std::thread       feedback_thread_;

    // -----------------------------------------------------------------------
    // Session configuration and counters
    // -----------------------------------------------------------------------
    SessionConfig      current_config_;
    cs::QosPreset      current_preset_;
    uint32_t           frame_number_  = 0;
    uint16_t           video_seq_     = 0;
    uint16_t           audio_seq_     = 0;

    // Peer address for UDP transport
    struct sockaddr_in peer_addr_;
    int                udp_socket_    = -1;

    // -----------------------------------------------------------------------
    // Statistics (protected by stats_mutex_)
    // -----------------------------------------------------------------------
    mutable std::mutex stats_mutex_;
    SessionStats       stats_;

    // Running averages for timing
    float              avg_capture_ms_ = 0.0f;
    float              avg_encode_ms_  = 0.0f;

    // Viewer liveness tracking (for pause-on-timeout)
    std::atomic<bool>  viewer_alive_{true};
    std::chrono::steady_clock::time_point last_feedback_time_;
    static constexpr auto kViewerTimeout = std::chrono::seconds(15);

    // Initialization state
    bool               initialized_ = false;
    bool               prepared_    = false;
};

} // namespace cs::host
