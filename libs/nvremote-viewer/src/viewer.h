///////////////////////////////////////////////////////////////////////////////
// viewer.h -- Main viewer lifecycle manager
//
// The Viewer class orchestrates the entire receive -> decode -> render
// pipeline for a single streaming session. It owns the decoder, renderer,
// transport, audio, and input subsystems and manages their lifecycle on
// background threads.
//
// Thread model:
//   - Receive thread: UDP recv loop -> jitter buffer + NACK + stats
//   - Decode thread:  pulls from jitter buffer -> decodes -> render queue
//   - Render thread:  pulls decoded frames -> presents via D3D11
//   - Audio thread:   receives audio packets -> Opus decode -> WASAPI play
//   - Stats thread:   periodic QoS feedback to host
//   - Input is captured on the window's message pump thread
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <string>
#include <functional>
#include <memory>
#include <mutex>
#include <atomic>
#include <thread>
#include <condition_variable>

#ifdef _WIN32
#include <windows.h>
#endif

#include <cs/common.h>
#include <cs/transport/packet.h>

// Forward declarations for subsystems
namespace cs {

class IDecoder;
class IRenderer;
class UdpReceiver;
class JitterBuffer;
class NackSender;
class StatsReporter;
class OpusDecoderWrapper;
class IAudioPlayback;
class InputCapture;
class InputSender;
class ClipboardSync;
struct DecodedFrame;

// ---------------------------------------------------------------------------
// Quality preset
// ---------------------------------------------------------------------------
enum class QualityPreset : uint8_t {
    PERFORMANCE = 0,  // Lowest latency, lower quality
    BALANCED    = 1,  // Default
    QUALITY     = 2,  // Highest quality, may add latency
};

// ---------------------------------------------------------------------------
// Viewer configuration (passed from JavaScript)
// ---------------------------------------------------------------------------
struct ViewerConfig {
    std::string session_id;
    std::string codec;            // "h264", "h265", "av1"
    uint32_t    width  = 1920;
    uint32_t    height = 1080;
#ifdef _WIN32
    HWND        window_handle = nullptr;
#else
    void*       window_handle = nullptr;
#endif
    int         socket_fd     = -1;       // Pre-connected socket from ICE
    std::string peer_ip;
    uint16_t    peer_port     = 0;

    // DTLS parameters
    std::string dtls_fingerprint;

    // Quality
    QualityPreset quality = QualityPreset::BALANCED;
};

// ---------------------------------------------------------------------------
// Real-time statistics
// ---------------------------------------------------------------------------
struct ViewerStats {
    double   bitrate_kbps      = 0.0;
    double   fps               = 0.0;
    double   packet_loss       = 0.0;   // 0.0 to 1.0
    double   jitter_ms         = 0.0;
    double   rtt_ms            = 0.0;
    std::string codec;
    uint32_t resolution_width  = 0;
    uint32_t resolution_height = 0;
    std::string connection_type;        // "p2p", "relay"
    double   decode_time_ms    = 0.0;
    double   render_time_ms    = 0.0;
    uint64_t frames_decoded    = 0;
    uint64_t frames_dropped    = 0;
    uint64_t packets_received  = 0;
    uint64_t bytes_received    = 0;
};

// ---------------------------------------------------------------------------
// ICE candidate (for P2P connection)
// ---------------------------------------------------------------------------
struct IceCandidate {
    std::string type;       // "host", "srflx", "relay"
    std::string ip;
    uint16_t    port     = 0;
    uint32_t    priority = 0;
};

// ---------------------------------------------------------------------------
// P2P connection result
// ---------------------------------------------------------------------------
struct P2PResult {
    bool        success = false;
    std::string local_ip;
    uint16_t    local_port  = 0;
    std::string remote_ip;
    uint16_t    remote_port = 0;
    std::string error;
};

// ---------------------------------------------------------------------------
// Viewer class -- singleton per session
// ---------------------------------------------------------------------------
class Viewer {
public:
    Viewer();
    ~Viewer();

    // Non-copyable, non-movable
    Viewer(const Viewer&) = delete;
    Viewer& operator=(const Viewer&) = delete;

    /// Start the viewer session. Initializes all subsystems and begins
    /// receiving/decoding/rendering. Returns true on success.
    bool start(const ViewerConfig& config);

    /// Stop the viewer session. Tears down all threads and releases resources.
    /// Safe to call multiple times or if never started.
    void stop();

    /// Returns true if the viewer is currently running.
    bool isRunning() const;

    /// Get a snapshot of current statistics.
    ViewerStats getStats() const;

    /// Set quality preset (adjusts decode parameters and jitter buffer).
    void setQuality(QualityPreset preset);

    /// Register a callback for disconnect events.
    void setOnDisconnect(std::function<void()> cb);

    /// Register a callback for periodic stats updates.
    void setOnStatsUpdate(std::function<void(const ViewerStats&)> cb);

    /// Register a callback for reconnect requests (fires when the viewer
    /// detects a dead connection and wants the signaling layer to initiate
    /// an ICE restart).
    void setOnReconnectNeeded(std::function<void()> cb);

    /// Called by the signaling layer after ICE restart completes and a new
    /// P2P connection is ready. Resets transport with the new socket.
    void onReconnected(int new_socket_fd, const std::string& dtls_fingerprint);

    // --- P2P Connection Management ---

    /// Gather ICE candidates using the provided STUN servers.
    std::vector<IceCandidate> gatherIceCandidates(const std::vector<std::string>& stun_servers);

    /// Add a remote ICE candidate received from signaling.
    void addRemoteCandidate(const IceCandidate& candidate);

    /// Attempt P2P connection with DTLS.
    P2PResult connectP2P(const std::string& dtls_fingerprint);

    /// Disconnect P2P session (transport only, keeps viewer alive for reconnect).
    void disconnectP2P();

private:
    // --- Subsystem initialization ---
    bool initTransport();
    bool initDecoder();
    bool initRenderer();
    bool initAudio();
    bool initInput();

    // --- Thread entry points ---
    void receiveThreadFunc();
    void decodeThreadFunc();
    void renderThreadFunc();
    void audioThreadFunc();

    // --- Packet dispatch ---
    void onVideoPacket(const uint8_t* data, size_t len);
    void onAudioPacket(const uint8_t* data, size_t len);
    void onClipboardPacket(const uint8_t* data, size_t len);
    void onClipboardAck(const uint8_t* data, size_t len);

    // --- Codec type helper ---
    static uint8_t codecFromString(const std::string& name);

    // --- Configuration ---
    ViewerConfig config_;
    QualityPreset quality_ = QualityPreset::BALANCED;

    // --- Subsystems ---
    std::unique_ptr<IDecoder>           decoder_;
    std::unique_ptr<IRenderer>          renderer_;
    std::unique_ptr<UdpReceiver>        receiver_;
    std::unique_ptr<JitterBuffer>       jitter_buffer_;
    std::unique_ptr<NackSender>         nack_sender_;
    std::unique_ptr<StatsReporter>      stats_reporter_;
    std::unique_ptr<OpusDecoderWrapper> opus_decoder_;
    std::unique_ptr<IAudioPlayback>     audio_playback_;
    std::unique_ptr<InputCapture>       input_capture_;
    std::unique_ptr<InputSender>        input_sender_;
    std::unique_ptr<ClipboardSync>      clipboard_sync_;

    // --- Threads ---
    std::thread receive_thread_;
    std::thread decode_thread_;
    std::thread render_thread_;
    std::thread audio_thread_;

    // --- State ---
    std::atomic<bool> running_{false};
    std::atomic<bool> stopping_{false};
    mutable std::mutex mutex_;

    // --- Decode/render queue signaling ---
    std::mutex decode_queue_mutex_;
    std::condition_variable decode_queue_cv_;

    std::mutex render_queue_mutex_;
    std::condition_variable render_queue_cv_;
    std::unique_ptr<DecodedFrame> pending_frame_;

    // --- Audio queue ---
    std::mutex audio_queue_mutex_;
    std::condition_variable audio_queue_cv_;
    struct AudioPacketData {
        std::vector<uint8_t> data;
        uint32_t timestamp_us;
    };
    std::vector<AudioPacketData> audio_queue_;

    // --- Callbacks ---
    std::function<void()> on_disconnect_;
    std::function<void(const ViewerStats&)> on_stats_update_;
    std::function<void()> on_reconnect_needed_;

    // --- Reconnect state ---
    enum class ConnectionState : uint8_t {
        CONNECTED,
        RECONNECTING,
        DISCONNECTED,
    };
    std::atomic<ConnectionState> conn_state_{ConnectionState::CONNECTED};
    std::chrono::steady_clock::time_point last_packet_time_;
    int reconnect_attempts_ = 0;
    static constexpr int kMaxReconnectAttempts = 3;
    static constexpr auto kDeadConnectionTimeout = std::chrono::seconds(10);
    static constexpr auto kReconnectTotalTimeout = std::chrono::seconds(30);

    // --- P2P state ---
    int p2p_socket_ = -1;
    struct sockaddr_storage peer_addr_;
    socklen_t peer_addr_len_ = 0;

    // --- Stats snapshot ---
    mutable std::mutex stats_mutex_;
    ViewerStats stats_;
};

} // namespace cs
