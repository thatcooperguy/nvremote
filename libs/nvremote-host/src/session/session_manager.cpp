///////////////////////////////////////////////////////////////////////////////
// session_manager.cpp -- Session orchestrator implementation
///////////////////////////////////////////////////////////////////////////////

#include "session_manager.h"

#include "cs/common.h"
#include "cs/qos/gaming_modes.h"
#include "cs/qos/feedback_packet.h"
#include "cs/transport/packet.h"

#include "capture/nvfbc_capture.h"
#include "capture/dxgi_capture.h"
#include "encode/nvenc_encoder.h"

#include <algorithm>
#include <cstring>
#include <cmath>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <Windows.h>
#endif

namespace cs::host {

// ---------------------------------------------------------------------------
// High-resolution timer helpers (Windows QueryPerformanceCounter)
// ---------------------------------------------------------------------------
namespace {

#ifdef _WIN32
struct HiResTimer {
    LARGE_INTEGER freq;
    HiResTimer() { QueryPerformanceFrequency(&freq); }
    uint64_t nowUs() const {
        LARGE_INTEGER now;
        QueryPerformanceCounter(&now);
        return static_cast<uint64_t>(
            (now.QuadPart * 1'000'000) / freq.QuadPart);
    }
};
static const HiResTimer g_timer;
inline uint64_t hires_now_us() { return g_timer.nowUs(); }
#else
inline uint64_t hires_now_us() { return cs::getTimestampUs(); }
#endif

// Exponential moving average factor for timing stats
constexpr float EMA_ALPHA = 0.1f;

// Maximum UDP payload for a single video fragment
constexpr size_t MAX_FRAGMENT_PAYLOAD = MAX_VIDEO_PAYLOAD;

// Convert host CodecType to wire cs::CodecType
cs::CodecType toWireCodec(CodecType ct) {
    switch (ct) {
        case CodecType::H264: return cs::CodecType::H264;
        case CodecType::HEVC: return cs::CodecType::H265;
        case CodecType::AV1:  return cs::CodecType::AV1;
    }
    return cs::CodecType::H264;
}

} // anonymous namespace

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------
SessionManager::SessionManager() {
    std::memset(&peer_addr_, 0, sizeof(peer_addr_));
}

SessionManager::~SessionManager() {
    stopSession();
}

// ---------------------------------------------------------------------------
// initialize() -- detect capture and encoder hardware
// ---------------------------------------------------------------------------
bool SessionManager::initialize() {
    if (initialized_) return true;

    // --- Detect capture device ---
    // Try NvFBC first (lowest latency on NVIDIA GPUs)
    auto nvfbc = std::make_unique<NvfbcCapture>();
    if (nvfbc->initialize(0)) {
        CS_LOG(INFO, "Capture backend: NvFBC (GPU-direct)");
        capture_ = std::move(nvfbc);
    } else {
        CS_LOG(INFO, "NvFBC not available, falling back to DXGI Desktop Duplication");
        nvfbc.reset();

        auto dxgi = std::make_unique<DxgiCapture>();
        if (!dxgi->initialize(0)) {
            CS_LOG(ERR, "Failed to initialize any capture backend");
            return false;
        }
        CS_LOG(INFO, "Capture backend: DXGI Desktop Duplication");
        capture_ = std::move(dxgi);
    }

    // --- Probe NVENC codec support ---
    auto nvenc = std::make_unique<NvencEncoder>();

    // We do not call initialize() yet (that requires a concrete config).
    // Just check codec availability using isCodecSupported().
    bool h264_ok = nvenc->isCodecSupported(CodecType::H264);
    bool hevc_ok = nvenc->isCodecSupported(CodecType::HEVC);
    bool av1_ok  = nvenc->isCodecSupported(CodecType::AV1);

    CS_LOG(INFO, "NVENC codecs available: H.264=%s  HEVC=%s  AV1=%s",
           h264_ok ? "yes" : "no",
           hevc_ok ? "yes" : "no",
           av1_ok  ? "yes" : "no");

    if (!h264_ok && !hevc_ok && !av1_ok) {
        CS_LOG(ERR, "No NVENC codecs available -- cannot encode");
        return false;
    }

    encoder_ = std::move(nvenc);

    initialized_ = true;
    CS_LOG(INFO, "SessionManager initialized successfully");
    return true;
}

// ---------------------------------------------------------------------------
// prepareSession() -- configure all components for an upcoming session
// ---------------------------------------------------------------------------
bool SessionManager::prepareSession(const SessionConfig& config) {
    if (!initialized_) {
        CS_LOG(ERR, "SessionManager not initialized");
        return false;
    }
    if (streaming_.load()) {
        CS_LOG(ERR, "Cannot prepare session while streaming is active");
        return false;
    }

    current_config_ = config;

    // --- Configure encoder ---
    EncoderConfig enc_cfg;
    enc_cfg.codec        = config.codec;
    enc_cfg.width        = config.width;
    enc_cfg.height       = config.height;
    enc_cfg.bitrate_kbps = config.bitrate_kbps;
    enc_cfg.fps          = config.fps;
    enc_cfg.gop_length   = config.fps * 2;  // 2 seconds of GOP
    enc_cfg.enable_intra_refresh = true;
    enc_cfg.intra_refresh_period = config.fps;

    if (!encoder_->initialize(enc_cfg)) {
        CS_LOG(ERR, "Failed to initialize encoder with %ux%u %s @ %u kbps",
               config.width, config.height,
               codecTypeName(config.codec), config.bitrate_kbps);
        return false;
    }
    CS_LOG(INFO, "Encoder configured: %ux%u %s @ %u kbps, %u fps",
           config.width, config.height,
           codecTypeName(config.codec), config.bitrate_kbps, config.fps);

    // --- Gaming mode preset ---
    cs::Resolution native_res = {config.width, config.height};
    current_preset_ = cs::getPreset(config.gaming_mode, native_res);
    CS_LOG(INFO, "Gaming mode: %s", cs::gamingModeToString(config.gaming_mode).c_str());

    // --- FEC encoder ---
    fec_ = std::make_unique<FecEncoder>();
    fec_->setRedundancyRatio(current_preset_.min_fec_ratio);
    CS_LOG(INFO, "FEC redundancy ratio: %.2f", fec_->getRedundancyRatio());

    // --- DTLS context (server role for host) ---
    dtls_ = std::make_unique<cs::DtlsContext>(true);
    CS_LOG(INFO, "DTLS fingerprint: %s", dtls_->getFingerprint().c_str());

    // --- ICE agent ---
    std::vector<std::string> stun = config.stun_servers;
    if (stun.empty()) {
        stun.push_back("stun.l.google.com");
    }
    ice_ = std::make_unique<cs::IceAgent>(stun);
    auto candidates = ice_->gatherCandidates();
    CS_LOG(INFO, "ICE gathered %zu candidates", candidates.size());

    // --- Audio capture + encoder ---
    audio_capture_ = std::make_unique<WasapiCapture>();
    opus_encoder_  = std::make_unique<OpusEncoderWrapper>();

    // Reset counters
    frame_number_ = 0;
    video_seq_    = 0;
    audio_seq_    = 0;
    avg_capture_ms_ = 0.0f;
    avg_encode_ms_  = 0.0f;

    // Reset stats
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_ = SessionStats();
        stats_.width       = config.width;
        stats_.height      = config.height;
        stats_.fps         = config.fps;
        stats_.bitrate_kbps = config.bitrate_kbps;
        stats_.codec       = codecTypeName(config.codec);
        stats_.gaming_mode = cs::gamingModeToString(config.gaming_mode);
    }

    prepared_ = true;
    CS_LOG(INFO, "Session '%s' prepared successfully", config.session_id.c_str());
    return true;
}

// ---------------------------------------------------------------------------
// startSession() -- connect to peer and begin streaming
// ---------------------------------------------------------------------------
bool SessionManager::startSession(const PeerInfo& peer) {
    if (!prepared_) {
        CS_LOG(ERR, "Session not prepared");
        return false;
    }
    if (streaming_.load()) {
        CS_LOG(ERR, "Session already streaming");
        return false;
    }

    // --- Set up UDP socket ---
    udp_socket_ = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP));
    if (udp_socket_ < 0) {
        CS_LOG(ERR, "Failed to create UDP socket: %d", cs_socket_error());
        return false;
    }

    // Bind to any local address
    struct sockaddr_in local_addr;
    std::memset(&local_addr, 0, sizeof(local_addr));
    local_addr.sin_family = AF_INET;
    local_addr.sin_addr.s_addr = INADDR_ANY;
    local_addr.sin_port = 0;  // OS picks a port

    if (::bind(udp_socket_, reinterpret_cast<struct sockaddr*>(&local_addr),
               sizeof(local_addr)) < 0) {
        CS_LOG(ERR, "Failed to bind UDP socket: %d", cs_socket_error());
        cs_close_socket(udp_socket_);
        udp_socket_ = -1;
        return false;
    }

    // Resolve peer address
    std::memset(&peer_addr_, 0, sizeof(peer_addr_));
    peer_addr_.sin_family = AF_INET;
    peer_addr_.sin_port   = htons(peer.port);
    if (::inet_pton(AF_INET, peer.ip.c_str(), &peer_addr_.sin_addr) != 1) {
        CS_LOG(ERR, "Invalid peer IP address: %s", peer.ip.c_str());
        cs_close_socket(udp_socket_);
        udp_socket_ = -1;
        return false;
    }

    CS_LOG(INFO, "Peer address: %s:%u", peer.ip.c_str(), peer.port);

    // --- DTLS handshake ---
    if (dtls_) {
        CS_LOG(INFO, "Starting DTLS handshake...");
        bool handshake_ok = dtls_->handshake(
            udp_socket_,
            reinterpret_cast<const struct sockaddr*>(&peer_addr_),
            static_cast<int>(sizeof(peer_addr_)));

        if (!handshake_ok) {
            CS_LOG(ERR, "DTLS handshake failed");
            cs_close_socket(udp_socket_);
            udp_socket_ = -1;
            return false;
        }
        CS_LOG(INFO, "DTLS handshake completed");

        // Exchange protocol version tag (CS01) with the viewer.
        // Host sends first, then waits for the viewer's response.
        if (dtls_->isEstablished()) {
            uint8_t enc_buf[cs::PROTOCOL_VERSION_TAG_LEN + 256];
            size_t enc_len = 0;
            if (!dtls_->encrypt(cs::PROTOCOL_VERSION_TAG,
                                cs::PROTOCOL_VERSION_TAG_LEN, enc_buf, &enc_len)) {
                CS_LOG(ERR, "Failed to send protocol version tag");
                cs_close_socket(udp_socket_);
                udp_socket_ = -1;
                return false;
            }
            // Send encrypted version tag
            if (enc_len > 0) {
                ::sendto(udp_socket_, reinterpret_cast<const char*>(enc_buf),
                         static_cast<int>(enc_len), 0,
                         reinterpret_cast<const ::sockaddr*>(&peer_addr_),
                         sizeof(peer_addr_));
            }

            // Wait for viewer's version tag (5 second timeout)
            uint8_t recv_buf[64];
            fd_set read_fds;
            struct timeval tv;
            tv.tv_sec = 5;
            tv.tv_usec = 0;
            FD_ZERO(&read_fds);
            FD_SET(static_cast<unsigned int>(udp_socket_), &read_fds);

            int sel = ::select(udp_socket_ + 1, &read_fds, nullptr, nullptr, &tv);
            if (sel > 0) {
                ::sockaddr_in from = {};
                socklen_t fromLen = sizeof(from);
                int n = ::recvfrom(udp_socket_, reinterpret_cast<char*>(recv_buf),
                                   sizeof(recv_buf), 0,
                                   reinterpret_cast<::sockaddr*>(&from), &fromLen);
                if (n > 0) {
                    uint8_t plain[64];
                    size_t plain_len = 0;
                    if (dtls_->decrypt(recv_buf, static_cast<size_t>(n), plain, &plain_len) &&
                        plain_len == cs::PROTOCOL_VERSION_TAG_LEN &&
                        std::memcmp(plain, cs::PROTOCOL_VERSION_TAG,
                                    cs::PROTOCOL_VERSION_TAG_LEN) == 0) {
                        CS_LOG(INFO, "Protocol version verified: CS01");
                    } else {
                        CS_LOG(ERR, "Protocol version mismatch from viewer");
                        cs_close_socket(udp_socket_);
                        udp_socket_ = -1;
                        return false;
                    }
                }
            } else {
                CS_LOG(ERR, "Timeout waiting for viewer protocol version");
                cs_close_socket(udp_socket_);
                udp_socket_ = -1;
                return false;
            }
        }
    }

    // --- Initialize transport ---
    transport_ = std::make_unique<UdpTransport>();
    if (!transport_->initialize(udp_socket_, peer_addr_)) {
        CS_LOG(ERR, "Failed to initialize UDP transport");
        cs_close_socket(udp_socket_);
        udp_socket_ = -1;
        return false;
    }

    // --- Initialize QoS controller ---
    qos_ = std::make_unique<QosController>(encoder_.get(), transport_.get(), fec_.get());
    EncoderConfig base_cfg;
    base_cfg.codec        = current_config_.codec;
    base_cfg.width        = current_config_.width;
    base_cfg.height       = current_config_.height;
    base_cfg.bitrate_kbps = current_config_.bitrate_kbps;
    base_cfg.fps          = current_config_.fps;
    qos_->setBaseConfig(base_cfg);

    // --- Initialize audio ---
    if (audio_capture_->initialize()) {
        if (opus_encoder_->initialize(audio_capture_->getSampleRate(),
                                       audio_capture_->getChannels(),
                                       128000)) {
            CS_LOG(INFO, "Audio pipeline ready: %u Hz, %u channels",
                   audio_capture_->getSampleRate(), audio_capture_->getChannels());
        } else {
            CS_LOG(WARN, "Opus encoder init failed -- audio disabled");
            opus_encoder_.reset();
        }
    } else {
        CS_LOG(WARN, "WASAPI capture init failed -- audio disabled");
        audio_capture_.reset();
    }

    // --- Update connection type in stats ---
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.connection_type = "p2p";
    }

    // --- Start clipboard injector ---
    clipboard_ = std::make_unique<ClipboardInjector>();
    clipboard_->start([this](const std::vector<uint8_t>& data) {
        if (transport_) {
            // Use a dedicated sequence space (0) for clipboard — non-video
            transport_->sendPacket(data, 0);
        }
    });
    CS_LOG(INFO, "Clipboard injector started");

    // --- Start streaming threads ---
    should_stop_.store(false);
    streaming_.store(true);
    viewer_alive_.store(true);
    last_feedback_time_ = std::chrono::steady_clock::now();

    stream_thread_   = std::thread(&SessionManager::streamingLoop, this);
    feedback_thread_ = std::thread(&SessionManager::feedbackLoop, this);

    if (audio_capture_ && opus_encoder_) {
        audio_thread_ = std::thread(&SessionManager::audioLoop, this);
    }

    CS_LOG(INFO, "Streaming started for session '%s'", current_config_.session_id.c_str());
    return true;
}

// ---------------------------------------------------------------------------
// stopSession()
// ---------------------------------------------------------------------------
void SessionManager::stopSession() {
    if (!streaming_.load() && !prepared_) return;

    CS_LOG(INFO, "Stopping session...");
    should_stop_.store(true);
    streaming_.store(false);

    // Join threads
    if (stream_thread_.joinable())   stream_thread_.join();
    if (audio_thread_.joinable())    audio_thread_.join();
    if (feedback_thread_.joinable()) feedback_thread_.join();

    // Stop clipboard
    if (clipboard_) {
        clipboard_->stop();
    }

    // Stop audio capture
    if (audio_capture_ && audio_capture_->isRunning()) {
        audio_capture_->stop();
    }

    // Shut down DTLS
    if (dtls_) {
        dtls_->shutdown();
    }

    // Release encoder
    if (encoder_) {
        encoder_->flush();
        encoder_->release();
    }

    // Release capture
    if (capture_) {
        capture_->release();
    }

    // Close UDP socket
    if (udp_socket_ >= 0) {
        cs_close_socket(udp_socket_);
        udp_socket_ = -1;
    }

    // Reset component pointers that are per-session
    clipboard_.reset();
    transport_.reset();
    qos_.reset();
    fec_.reset();
    ice_.reset();
    dtls_.reset();
    audio_capture_.reset();
    opus_encoder_.reset();

    prepared_ = false;
    CS_LOG(INFO, "Session stopped");
}

// ---------------------------------------------------------------------------
// forceIdr()
// ---------------------------------------------------------------------------
void SessionManager::forceIdr() {
    force_idr_flag_.store(true);
    CS_LOG(INFO, "IDR frame requested");
}

// ---------------------------------------------------------------------------
// reconfigure()
// ---------------------------------------------------------------------------
void SessionManager::reconfigure(uint32_t bitrate_kbps, uint32_t fps) {
    if (!encoder_) return;

    EncoderConfig cfg;
    cfg.codec        = current_config_.codec;
    cfg.width        = current_config_.width;
    cfg.height       = current_config_.height;
    cfg.bitrate_kbps = bitrate_kbps;
    cfg.fps          = fps;
    cfg.gop_length   = fps * 2;

    if (encoder_->reconfigure(cfg)) {
        current_config_.bitrate_kbps = bitrate_kbps;
        current_config_.fps          = fps;
        CS_LOG(INFO, "Encoder reconfigured: %u kbps, %u fps", bitrate_kbps, fps);

        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.bitrate_kbps = bitrate_kbps;
        stats_.fps          = fps;
    } else {
        CS_LOG(WARN, "Encoder reconfiguration failed");
    }
}

// ---------------------------------------------------------------------------
// setGamingMode()
// ---------------------------------------------------------------------------
void SessionManager::setGamingMode(cs::GamingMode mode) {
    cs::Resolution native_res = {current_config_.width, current_config_.height};
    current_preset_ = cs::getPreset(mode, native_res);
    current_config_.gaming_mode = mode;

    // Apply new bitrate/fps targets from the preset
    reconfigure(current_preset_.target_bitrate_kbps, current_preset_.target_fps);

    // Update FEC ratio
    if (fec_) {
        fec_->setRedundancyRatio(current_preset_.min_fec_ratio);
    }

    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.gaming_mode = cs::gamingModeToString(mode);
    }

    CS_LOG(INFO, "Gaming mode changed to %s", cs::gamingModeToString(mode).c_str());
}

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------
SessionStats SessionManager::getStats() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    return stats_;
}

// ---------------------------------------------------------------------------
// isStreaming()
// ---------------------------------------------------------------------------
bool SessionManager::isStreaming() const {
    return streaming_.load();
}

// ---------------------------------------------------------------------------
// buildVideoHeader()
// ---------------------------------------------------------------------------
cs::VideoPacketHeader SessionManager::buildVideoHeader(
    uint16_t seq, uint16_t frame_num,
    uint8_t frag_idx, uint8_t frag_total,
    bool is_keyframe, uint32_t payload_len,
    uint64_t timestamp_us) const
{
    cs::VideoPacketHeader hdr;
    std::memset(&hdr, 0, sizeof(hdr));

    hdr.setVersion(1);
    hdr.setFrameType(0);     // 0 = progressive
    hdr.setKeyframe(is_keyframe);
    hdr.codec            = static_cast<uint8_t>(toWireCodec(current_config_.codec));
    hdr.sequence_number  = seq;
    hdr.timestamp_us     = static_cast<uint32_t>(timestamp_us & 0xFFFFFFFF);
    hdr.frame_number     = frame_num;
    hdr.fragment_index   = frag_idx;
    hdr.fragment_total   = frag_total;
    hdr.payload_length   = payload_len;

    return hdr;
}

// ---------------------------------------------------------------------------
// streamingLoop() -- main video capture + encode + send loop
// ---------------------------------------------------------------------------
void SessionManager::streamingLoop() {
    CS_LOG(INFO, "Streaming loop started");

#ifdef _WIN32
    // Raise thread priority for consistent frame pacing
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
#endif

    // Re-initialize capture device for the streaming session
    if (!capture_->initialize(0)) {
        CS_LOG(ERR, "Failed to re-initialize capture device in streaming loop");
        streaming_.store(false);
        return;
    }

    while (!should_stop_.load()) {
        uint64_t frame_start_us = hires_now_us();

        // Target frame interval in microseconds
        uint32_t target_fps = current_config_.fps;
        if (target_fps == 0) target_fps = 60;
        uint64_t frame_interval_us = 1'000'000ULL / target_fps;

        // --- Viewer liveness check: pause encoding if no QoS feedback ---
        {
            auto now = std::chrono::steady_clock::now();
            if (now - last_feedback_time_ > kViewerTimeout) {
                if (viewer_alive_.exchange(false)) {
                    CS_LOG(WARN, "No QoS feedback for 15s — pausing encoding (viewer may be dead)");
                }
                // Sleep instead of encoding while viewer is unresponsive
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                continue;
            } else if (!viewer_alive_.load()) {
                viewer_alive_.store(true);
                CS_LOG(INFO, "Viewer feedback resumed — resuming encoding");
                // Send an IDR frame on resume so viewer can recover quickly
                encoder_->forceIdr();
            }
        }

        // --- Check IDR request ---
        if (force_idr_flag_.exchange(false)) {
            encoder_->forceIdr();
        }

        // --- Capture ---
        uint64_t cap_start = hires_now_us();
        CapturedFrame frame;
        if (!capture_->captureFrame(frame)) {
            // Brief sleep on capture failure to avoid spinning
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            continue;
        }
        uint64_t cap_end = hires_now_us();
        float cap_ms = static_cast<float>(cap_end - cap_start) / 1000.0f;

        // Skip duplicate frames but still pace
        if (!frame.is_new_frame) {
            uint64_t elapsed = hires_now_us() - frame_start_us;
            if (elapsed < frame_interval_us) {
                uint64_t sleep_us = frame_interval_us - elapsed;
                std::this_thread::sleep_for(std::chrono::microseconds(sleep_us));
            }
            continue;
        }

        // --- Encode ---
        uint64_t enc_start = hires_now_us();
        EncodedPacket encoded;
        encoded.frame_number = frame_number_;
        if (!encoder_->encode(frame, encoded)) {
            CS_LOG(WARN, "Encode failed for frame %u", frame_number_);
            continue;
        }
        uint64_t enc_end = hires_now_us();
        float enc_ms = static_cast<float>(enc_end - enc_start) / 1000.0f;

        // Update timing averages
        avg_capture_ms_ = avg_capture_ms_ * (1.0f - EMA_ALPHA) + cap_ms * EMA_ALPHA;
        avg_encode_ms_  = avg_encode_ms_  * (1.0f - EMA_ALPHA) + enc_ms * EMA_ALPHA;

        // --- Fragment and send ---
        const uint8_t* payload = encoded.data.data();
        size_t payload_len = encoded.data.size();
        uint8_t frag_total = static_cast<uint8_t>(
            (payload_len + MAX_FRAGMENT_PAYLOAD - 1) / MAX_FRAGMENT_PAYLOAD);
        if (frag_total == 0) frag_total = 1;

        // Collect fragments for FEC
        std::vector<std::vector<uint8_t>> data_packets;

        for (uint8_t frag = 0; frag < frag_total; ++frag) {
            size_t offset = static_cast<size_t>(frag) * MAX_FRAGMENT_PAYLOAD;
            size_t chunk_len = std::min(MAX_FRAGMENT_PAYLOAD, payload_len - offset);

            cs::VideoPacketHeader hdr = buildVideoHeader(
                video_seq_, static_cast<uint16_t>(frame_number_ & 0xFFFF),
                frag, frag_total,
                encoded.is_keyframe,
                static_cast<uint32_t>(chunk_len),
                encoded.timestamp_us);

            // Serialize header + payload fragment
            std::vector<uint8_t> pkt = hdr.serialize(payload + offset, chunk_len);

            // Send via transport (pre-serialized packet.h format)
            transport_->sendPacket(pkt, video_seq_);

            data_packets.push_back(std::move(pkt));
            ++video_seq_;
        }

        // --- FEC ---
        if (fec_ && data_packets.size() > 1) {
            auto fec_payloads = fec_->encode(data_packets);
            if (!fec_payloads.empty()) {
                uint8_t group_id = fec_->currentGroupId();
                for (size_t i = 0; i < fec_payloads.size(); ++i) {
                    // Build FEC packet: [0xFC][seq:2][group_id][group_sz][fec_idx][frame_low][payload]
                    std::vector<uint8_t> fec_pkt;
                    fec_pkt.reserve(7 + fec_payloads[i].size());
                    fec_pkt.push_back(static_cast<uint8_t>(cs::PacketType::FEC));
                    uint16_t seq = video_seq_++;
                    fec_pkt.push_back(static_cast<uint8_t>(seq >> 8));
                    fec_pkt.push_back(static_cast<uint8_t>(seq & 0xFF));
                    fec_pkt.push_back(group_id);
                    fec_pkt.push_back(static_cast<uint8_t>(fec_payloads.size()));
                    fec_pkt.push_back(static_cast<uint8_t>(i));
                    fec_pkt.push_back(static_cast<uint8_t>(frame_number_ & 0xFF));
                    fec_pkt.insert(fec_pkt.end(),
                                   fec_payloads[i].begin(), fec_payloads[i].end());
                    transport_->sendPacket(fec_pkt, seq);
                }
            }
        }

        ++frame_number_;

        // --- Update stats ---
        {
            std::lock_guard<std::mutex> lock(stats_mutex_);
            stats_.frames_sent    = frame_number_;
            stats_.bytes_sent     = transport_->totalBytesSent();
            stats_.capture_time_ms = avg_capture_ms_;
            stats_.encode_time_ms  = avg_encode_ms_;
            if (fec_) {
                stats_.fec_ratio = fec_->getRedundancyRatio();
            }
            if (qos_) {
                QosStats qs = qos_->getStats();
                stats_.bitrate_kbps        = qs.bitrate_kbps;
                stats_.packet_loss_percent = qs.loss_rate * 100.0f;
                stats_.jitter_ms           = static_cast<float>(qs.jitter_us) / 1000.0f;
                stats_.rtt_ms              = static_cast<float>(qs.rtt_us) / 1000.0f;
            }
        }

        // --- Frame pacing ---
        uint64_t frame_end_us = hires_now_us();
        uint64_t elapsed_us = frame_end_us - frame_start_us;
        if (elapsed_us < frame_interval_us) {
            uint64_t sleep_us = frame_interval_us - elapsed_us;
            // Spin-wait for the last 500us for precision
            if (sleep_us > 500) {
                std::this_thread::sleep_for(
                    std::chrono::microseconds(sleep_us - 500));
            }
            // Busy-wait for remaining time
            while (hires_now_us() - frame_start_us < frame_interval_us) {
                // spin
            }
        }
    }

    CS_LOG(INFO, "Streaming loop stopped (sent %u frames)", frame_number_);
}

// ---------------------------------------------------------------------------
// audioLoop() -- audio capture + Opus encode + send
// ---------------------------------------------------------------------------
void SessionManager::audioLoop() {
    CS_LOG(INFO, "Audio loop started");

    if (!audio_capture_ || !opus_encoder_ || !transport_) {
        CS_LOG(WARN, "Audio components not available, audio loop exiting");
        return;
    }

    // Start WASAPI capture with a callback that encodes and sends
    audio_capture_->start([this](const float* samples, size_t frame_count,
                                  uint32_t sample_rate, uint16_t channels) {
        if (should_stop_.load()) return;

        // Opus expects a specific frame size (e.g., 480 samples for 10ms @ 48kHz)
        uint32_t opus_frame_size = opus_encoder_->getFrameSize();

        // Process complete Opus frames from the captured audio
        size_t offset = 0;
        while (offset + opus_frame_size <= frame_count && !should_stop_.load()) {
            std::vector<uint8_t> opus_data;
            if (opus_encoder_->encode(samples + offset * channels,
                                       opus_frame_size, opus_data)) {
                // Build audio packet using packet.h format
                cs::AudioPacketHeader ahdr;
                std::memset(&ahdr, 0, sizeof(ahdr));
                ahdr.setVersion(1);
                ahdr.setType(static_cast<uint8_t>(cs::PacketType::AUDIO) & 0x3F);
                ahdr.channel_id      = 0;  // stereo channel 0
                ahdr.sequence_number = audio_seq_;
                ahdr.timestamp_us    = static_cast<uint32_t>(hires_now_us() & 0xFFFFFFFF);

                std::vector<uint8_t> audio_pkt = ahdr.serialize(
                    opus_data.data(), opus_data.size());

                transport_->sendPacket(audio_pkt, audio_seq_);
                ++audio_seq_;
            }
            offset += opus_frame_size;
        }
    });

    // Wait for stop signal
    while (!should_stop_.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    // Stop WASAPI capture
    if (audio_capture_->isRunning()) {
        audio_capture_->stop();
    }

    CS_LOG(INFO, "Audio loop stopped (sent %u packets)", audio_seq_);
}

// ---------------------------------------------------------------------------
// feedbackLoop() -- receive and process QoS feedback from the client
// ---------------------------------------------------------------------------
void SessionManager::feedbackLoop() {
    CS_LOG(INFO, "Feedback loop started");

    if (!transport_ || !qos_) {
        CS_LOG(WARN, "Transport or QoS not available, feedback loop exiting");
        return;
    }

    // Set the socket to non-blocking for the feedback receive loop
    if (udp_socket_ >= 0) {
        cs_set_nonblocking(udp_socket_);
    }

    // Set up transport recv callback for feedback and NACK processing
    transport_->setRecvCallback([this](const uint8_t* data, size_t len) {
        if (len == 0) return;

        cs::PacketType ptype = cs::identifyPacket(data, len);

        if (ptype == cs::PacketType::QOS_FEEDBACK) {
            // Track viewer liveness
            last_feedback_time_ = std::chrono::steady_clock::now();
            viewer_alive_.store(true);

            // Deserialize QoS feedback
            cs::QosFeedback fb = cs::QosFeedback::deserialize(data, len);

            // Convert to QoS controller's feedback format
            QosFeedbackPacket ctrl_fb;
            ctrl_fb.jitter_us         = fb.avg_jitter_us;
            ctrl_fb.last_seq          = fb.last_seq_received;
            ctrl_fb.rtt_us            = 0;  // Client-measured RTT if available

            // Compute loss from x100 format
            float loss = fb.getPacketLossPercent() / 100.0f;
            // Approximate received/lost from loss rate
            ctrl_fb.received_packets  = 100;
            ctrl_fb.lost_packets      = static_cast<uint32_t>(loss * 100.0f);

            qos_->onFeedbackReceived(ctrl_fb);

            // Handle NACKs
            if (!fb.nack_seqs.empty()) {
                transport_->onNackReceived(fb.nack_seqs);
            }
        } else if (ptype == cs::PacketType::CLIPBOARD) {
            if (clipboard_) {
                clipboard_->onClipboardReceived(data, len);
            }
        } else if (ptype == cs::PacketType::CLIP_ACK) {
            if (clipboard_) {
                clipboard_->onAckReceived(data, len);
            }
        } else if (ptype == cs::PacketType::NACK) {
            // Standalone NACK packets -- extract sequence numbers
            // NACK format: type(1) + count(2) + seq_list(count * 2)
            if (len >= 3) {
                uint16_t count = 0;
                std::memcpy(&count, data + 1, 2);
                count = ntohs(count);

                std::vector<uint16_t> seqs;
                for (uint16_t i = 0; i < count && (3 + (i + 1) * 2) <= len; ++i) {
                    uint16_t seq = 0;
                    std::memcpy(&seq, data + 3 + i * 2, 2);
                    seq = ntohs(seq);
                    seqs.push_back(seq);
                }
                if (!seqs.empty()) {
                    transport_->onNackReceived(seqs);
                }
            }
        }
    });

    // Poll for incoming packets
    while (!should_stop_.load()) {
        if (!transport_->receiveOne()) {
            // No packet ready -- sleep briefly to avoid busy-waiting
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }

    CS_LOG(INFO, "Feedback loop stopped");
}

} // namespace cs::host
