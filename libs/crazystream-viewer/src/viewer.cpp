///////////////////////////////////////////////////////////////////////////////
// viewer.cpp -- Main viewer lifecycle manager implementation
//
// Orchestrates the receive -> decode -> render pipeline:
//   1. Receive thread: UDP -> DTLS decrypt -> jitter buffer + NACK + stats
//   2. Decode thread:  jitter buffer -> decoder -> render queue
//   3. Render thread:  render queue -> D3D11 present
//   4. Audio thread:   audio packets -> Opus decode -> WASAPI playback
///////////////////////////////////////////////////////////////////////////////

#include "viewer.h"

#include "decode/nvdec_decoder.h"
#include "decode/d3d11va_decoder.h"
#include "decode/decoder_interface.h"
#include "render/d3d11_renderer.h"
#include "transport/udp_receiver.h"
#include "transport/jitter_buffer.h"
#include "transport/nack_sender.h"
#include "qos/stats_reporter.h"
#include "audio/opus_decoder.h"
#include "audio/wasapi_playback.h"
#include "input/input_capture.h"
#include "input/input_sender.h"

#include <cs/common.h>
#include <cs/transport/packet.h>

#include <chrono>
#include <algorithm>
#include <cstring>

namespace cs {

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

uint8_t Viewer::codecFromString(const std::string& name) {
    if (name == "h264" || name == "H264") return static_cast<uint8_t>(CodecType::H264);
    if (name == "h265" || name == "H265" || name == "hevc" || name == "HEVC")
        return static_cast<uint8_t>(CodecType::H265);
    if (name == "av1"  || name == "AV1")  return static_cast<uint8_t>(CodecType::AV1);
    return static_cast<uint8_t>(CodecType::H264);
}

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

Viewer::Viewer() {
    std::memset(&peer_addr_, 0, sizeof(peer_addr_));
}

Viewer::~Viewer() {
    stop();
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

bool Viewer::start(const ViewerConfig& config) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (running_.load()) {
        CS_LOG(WARN, "Viewer already running");
        return false;
    }

    CS_LOG(INFO, "Starting viewer session: id=%s codec=%s %ux%u",
           config.session_id.c_str(), config.codec.c_str(),
           config.width, config.height);

    config_ = config;
    quality_ = config.quality;
    stopping_.store(false);

    // Initialize subsystems in dependency order
    if (!initRenderer()) {
        CS_LOG(ERR, "Failed to initialize renderer");
        stop();
        return false;
    }

    if (!initDecoder()) {
        CS_LOG(ERR, "Failed to initialize decoder");
        stop();
        return false;
    }

    if (!initAudio()) {
        CS_LOG(WARN, "Failed to initialize audio (continuing without audio)");
        // Audio failure is non-fatal
    }

    if (!initTransport()) {
        CS_LOG(ERR, "Failed to initialize transport");
        stop();
        return false;
    }

    if (!initInput()) {
        CS_LOG(WARN, "Failed to initialize input (continuing without input)");
        // Input failure is non-fatal
    }

    // Set initial stats
    {
        std::lock_guard<std::mutex> slock(stats_mutex_);
        stats_.codec = config.codec;
        stats_.resolution_width = config.width;
        stats_.resolution_height = config.height;
        stats_.connection_type = "p2p";
    }

    running_.store(true);

    // Launch pipeline threads
    decode_thread_ = std::thread(&Viewer::decodeThreadFunc, this);
    render_thread_ = std::thread(&Viewer::renderThreadFunc, this);

    if (audio_playback_ && audio_playback_->isInitialized()) {
        audio_thread_ = std::thread(&Viewer::audioThreadFunc, this);
    }

    CS_LOG(INFO, "Viewer session started successfully");
    return true;
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

void Viewer::stop() {
    if (!running_.load() && !stopping_.load()) {
        return;
    }

    CS_LOG(INFO, "Stopping viewer session");
    stopping_.store(true);
    running_.store(false);

    // Wake up waiting threads
    decode_queue_cv_.notify_all();
    render_queue_cv_.notify_all();
    audio_queue_cv_.notify_all();

    // Stop subsystems (order matters: transport first to stop feeding data)
    if (receiver_) {
        receiver_->stop();
    }

    if (nack_sender_) {
        nack_sender_->stop();
    }

    if (stats_reporter_) {
        stats_reporter_->stop();
    }

    // Join threads
    if (receive_thread_.joinable()) receive_thread_.join();
    if (decode_thread_.joinable())  decode_thread_.join();
    if (render_thread_.joinable())  render_thread_.join();
    if (audio_thread_.joinable())   audio_thread_.join();

    // Release subsystems in reverse order
    if (input_capture_) input_capture_->release();
    if (audio_playback_) audio_playback_->stop();
    if (renderer_) renderer_->release();
    if (decoder_) decoder_->release();

    // Reset unique_ptrs
    input_sender_.reset();
    input_capture_.reset();
    audio_playback_.reset();
    opus_decoder_.reset();
    stats_reporter_.reset();
    nack_sender_.reset();
    jitter_buffer_.reset();
    receiver_.reset();
    renderer_.reset();
    decoder_.reset();

    // Close P2P socket
    if (p2p_socket_ >= 0) {
        cs_close_socket(p2p_socket_);
        p2p_socket_ = -1;
    }

    stopping_.store(false);
    CS_LOG(INFO, "Viewer session stopped");
}

// ---------------------------------------------------------------------------
// isRunning
// ---------------------------------------------------------------------------

bool Viewer::isRunning() const {
    return running_.load();
}

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

ViewerStats Viewer::getStats() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);

    ViewerStats stats = stats_;

    // Merge live data from stats reporter
    if (stats_reporter_) {
        ViewerStats live = stats_reporter_->getStats();
        stats.bitrate_kbps = live.bitrate_kbps;
        stats.fps = live.fps;
        stats.packet_loss = live.packet_loss;
        stats.jitter_ms = live.jitter_ms;
        stats.decode_time_ms = live.decode_time_ms;
        stats.render_time_ms = live.render_time_ms;
        stats.frames_decoded = live.frames_decoded;
        stats.frames_dropped = live.frames_dropped;
        stats.packets_received = live.packets_received;
        stats.bytes_received = live.bytes_received;
    }

    return stats;
}

// ---------------------------------------------------------------------------
// setQuality
// ---------------------------------------------------------------------------

void Viewer::setQuality(QualityPreset preset) {
    quality_ = preset;

    if (jitter_buffer_) {
        switch (preset) {
            case QualityPreset::PERFORMANCE:
                jitter_buffer_->setTargetDepthMs(10);
                break;
            case QualityPreset::BALANCED:
                jitter_buffer_->setTargetDepthMs(20);
                break;
            case QualityPreset::QUALITY:
                jitter_buffer_->setTargetDepthMs(40);
                break;
        }
    }

    CS_LOG(INFO, "Quality preset set to %d", static_cast<int>(preset));
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

void Viewer::setOnDisconnect(std::function<void()> cb) {
    std::lock_guard<std::mutex> lock(mutex_);
    on_disconnect_ = std::move(cb);
}

void Viewer::setOnStatsUpdate(std::function<void(const ViewerStats&)> cb) {
    std::lock_guard<std::mutex> lock(mutex_);
    on_stats_update_ = std::move(cb);
}

// ---------------------------------------------------------------------------
// P2P Connection Management
// ---------------------------------------------------------------------------

std::vector<IceCandidate> Viewer::gatherIceCandidates(const std::vector<std::string>& stun_servers) {
    std::vector<IceCandidate> candidates;

    // Gather host candidates from local interfaces
    auto local_ips = getLocalIpAddresses();
    uint32_t priority = 2130706432;  // Host candidate base priority (RFC 8445)

    for (const auto& ip : local_ips) {
        // Create a UDP socket to determine the actual port
        int sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP));
        if (sock < 0) continue;

        struct sockaddr_in addr = {};
        addr.sin_family = AF_INET;
        addr.sin_port = 0;  // Let OS assign
        addr.sin_addr.s_addr = INADDR_ANY;

        if (::bind(sock, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) == 0) {
            socklen_t len = sizeof(addr);
            ::getsockname(sock, reinterpret_cast<struct sockaddr*>(&addr), &len);

            IceCandidate cand;
            cand.type = "host";
            cand.ip = ip;
            cand.port = ntohs(addr.sin_port);
            cand.priority = priority--;
            candidates.push_back(cand);
        }
        cs_close_socket(sock);
    }

    // Gather server-reflexive candidates via STUN
    for (const auto& server : stun_servers) {
        // Parse STUN URI: "stun:host:port"
        std::string host;
        uint16_t port = 3478;

        std::string uri = server;
        if (uri.substr(0, 5) == "stun:") {
            uri = uri.substr(5);
        }

        auto colon_pos = uri.find(':');
        if (colon_pos != std::string::npos) {
            host = uri.substr(0, colon_pos);
            port = static_cast<uint16_t>(std::stoi(uri.substr(colon_pos + 1)));
        } else {
            host = uri;
        }

        // Create a UDP socket and send a STUN Binding Request
        int sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP));
        if (sock < 0) continue;

        struct sockaddr_in stun_addr = {};
        stun_addr.sin_family = AF_INET;
        stun_addr.sin_port = htons(port);

        // Resolve hostname
        struct addrinfo hints = {}, *res = nullptr;
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_DGRAM;
        if (::getaddrinfo(host.c_str(), nullptr, &hints, &res) == 0 && res) {
            auto* sa = reinterpret_cast<struct sockaddr_in*>(res->ai_addr);
            stun_addr.sin_addr = sa->sin_addr;
            ::freeaddrinfo(res);
        } else {
            cs_close_socket(sock);
            continue;
        }

        // Minimal STUN Binding Request (20 bytes)
        // Type: 0x0001 (Binding Request)
        // Length: 0x0000 (no attributes)
        // Magic cookie: 0x2112A442
        // Transaction ID: 12 random bytes
        uint8_t stun_req[20] = {};
        stun_req[0] = 0x00; stun_req[1] = 0x01;  // Type
        stun_req[2] = 0x00; stun_req[3] = 0x00;  // Length
        stun_req[4] = 0x21; stun_req[5] = 0x12;  // Magic cookie
        stun_req[6] = 0xA4; stun_req[7] = 0x42;
        // Transaction ID (bytes 8-19): use simple incrementing values
        for (int i = 8; i < 20; i++) {
            stun_req[i] = static_cast<uint8_t>(i + candidates.size());
        }

        // Set socket timeout
#ifdef _WIN32
        DWORD timeout_ms = 2000;
        ::setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO,
                     reinterpret_cast<const char*>(&timeout_ms), sizeof(timeout_ms));
#else
        struct timeval tv = {2, 0};
        ::setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
#endif

        ::sendto(sock, reinterpret_cast<const char*>(stun_req), sizeof(stun_req), 0,
                 reinterpret_cast<struct sockaddr*>(&stun_addr), sizeof(stun_addr));

        // Wait for STUN Binding Response
        uint8_t stun_resp[256];
        struct sockaddr_in from = {};
        socklen_t from_len = sizeof(from);
        int n = ::recvfrom(sock, reinterpret_cast<char*>(stun_resp), sizeof(stun_resp), 0,
                           reinterpret_cast<struct sockaddr*>(&from), &from_len);

        if (n >= 20) {
            // Check it's a Binding Response (0x0101)
            uint16_t resp_type = (static_cast<uint16_t>(stun_resp[0]) << 8) | stun_resp[1];
            if (resp_type == 0x0101) {
                // Parse MAPPED-ADDRESS or XOR-MAPPED-ADDRESS attribute
                int offset = 20;
                while (offset + 4 <= n) {
                    uint16_t attr_type = (static_cast<uint16_t>(stun_resp[offset]) << 8)
                                       | stun_resp[offset + 1];
                    uint16_t attr_len  = (static_cast<uint16_t>(stun_resp[offset + 2]) << 8)
                                       | stun_resp[offset + 3];
                    offset += 4;

                    if ((attr_type == 0x0020 || attr_type == 0x0001) && attr_len >= 8) {
                        // XOR-MAPPED-ADDRESS (0x0020) or MAPPED-ADDRESS (0x0001)
                        uint16_t mapped_port;
                        uint32_t mapped_ip;

                        if (attr_type == 0x0020) {
                            // XOR with magic cookie
                            mapped_port = ((static_cast<uint16_t>(stun_resp[offset + 2]) << 8)
                                         | stun_resp[offset + 3]) ^ 0x2112;
                            uint32_t raw_ip;
                            std::memcpy(&raw_ip, &stun_resp[offset + 4], 4);
                            mapped_ip = ntohl(raw_ip) ^ 0x2112A442;
                        } else {
                            mapped_port = (static_cast<uint16_t>(stun_resp[offset + 2]) << 8)
                                        | stun_resp[offset + 3];
                            uint32_t raw_ip;
                            std::memcpy(&raw_ip, &stun_resp[offset + 4], 4);
                            mapped_ip = ntohl(raw_ip);
                        }

                        // Convert IP to string
                        struct in_addr ia;
                        ia.s_addr = htonl(mapped_ip);
                        char ip_str[INET_ADDRSTRLEN];
                        ::inet_ntop(AF_INET, &ia, ip_str, sizeof(ip_str));

                        IceCandidate cand;
                        cand.type = "srflx";
                        cand.ip = ip_str;
                        cand.port = mapped_port;
                        cand.priority = 1694498816;  // srflx base priority
                        candidates.push_back(cand);

                        CS_LOG(INFO, "STUN srflx candidate: %s:%u", ip_str, mapped_port);
                        break;
                    }

                    // Advance to next attribute (attributes are padded to 4-byte boundary)
                    offset += static_cast<int>((attr_len + 3) & ~3);
                }
            }
        }

        cs_close_socket(sock);
    }

    return candidates;
}

void Viewer::addRemoteCandidate(const IceCandidate& candidate) {
    CS_LOG(INFO, "Adding remote ICE candidate: %s %s:%u priority=%u",
           candidate.type.c_str(), candidate.ip.c_str(), candidate.port, candidate.priority);

    // Store the best remote candidate address for later connection
    struct sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(candidate.port);
    ::inet_pton(AF_INET, candidate.ip.c_str(), &addr.sin_addr);

    std::lock_guard<std::mutex> lock(mutex_);
    std::memcpy(&peer_addr_, &addr, sizeof(addr));
    peer_addr_len_ = sizeof(addr);
}

P2PResult Viewer::connectP2P(const std::string& dtls_fingerprint) {
    P2PResult result;

    CS_LOG(INFO, "Attempting P2P connection with DTLS fingerprint: %s",
           dtls_fingerprint.c_str());

    // Create UDP socket
    int sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP));
    if (sock < 0) {
        result.error = "Failed to create socket";
        CS_LOG(ERR, "%s: error=%d", result.error.c_str(), cs_socket_error());
        return result;
    }

    // Bind to any available port
    struct sockaddr_in local_addr = {};
    local_addr.sin_family = AF_INET;
    local_addr.sin_port = 0;
    local_addr.sin_addr.s_addr = INADDR_ANY;

    if (::bind(sock, reinterpret_cast<struct sockaddr*>(&local_addr), sizeof(local_addr)) != 0) {
        result.error = "Failed to bind socket";
        cs_close_socket(sock);
        return result;
    }

    // Get the local port
    socklen_t addr_len = sizeof(local_addr);
    ::getsockname(sock, reinterpret_cast<struct sockaddr*>(&local_addr), &addr_len);

    // Connect to peer
    std::lock_guard<std::mutex> lock(mutex_);
    if (peer_addr_len_ == 0) {
        result.error = "No remote candidate available";
        cs_close_socket(sock);
        return result;
    }

    if (::connect(sock, reinterpret_cast<struct sockaddr*>(&peer_addr_), peer_addr_len_) != 0) {
        result.error = "Failed to connect to peer";
        cs_close_socket(sock);
        return result;
    }

    // Set non-blocking
    cs_set_nonblocking(sock);

    p2p_socket_ = sock;
    config_.socket_fd = sock;
    config_.dtls_fingerprint = dtls_fingerprint;

    // Extract addresses for result
    result.success = true;

    auto local_ips = getLocalIpAddresses();
    result.local_ip = local_ips.empty() ? "0.0.0.0" : local_ips[0];
    result.local_port = ntohs(local_addr.sin_port);

    auto* peer_in = reinterpret_cast<struct sockaddr_in*>(&peer_addr_);
    char ip_buf[INET_ADDRSTRLEN];
    ::inet_ntop(AF_INET, &peer_in->sin_addr, ip_buf, sizeof(ip_buf));
    result.remote_ip = ip_buf;
    result.remote_port = ntohs(peer_in->sin_port);

    CS_LOG(INFO, "P2P connected: local=%s:%u remote=%s:%u",
           result.local_ip.c_str(), result.local_port,
           result.remote_ip.c_str(), result.remote_port);

    return result;
}

void Viewer::disconnectP2P() {
    CS_LOG(INFO, "Disconnecting P2P transport");

    if (receiver_) {
        receiver_->stop();
    }

    if (p2p_socket_ >= 0) {
        cs_close_socket(p2p_socket_);
        p2p_socket_ = -1;
    }
}

// ---------------------------------------------------------------------------
// Subsystem initialization
// ---------------------------------------------------------------------------

bool Viewer::initRenderer() {
#ifdef _WIN32
    if (!config_.window_handle) {
        CS_LOG(ERR, "No window handle provided");
        return false;
    }

    renderer_ = std::make_unique<D3D11Renderer>();
    if (!renderer_->initialize(config_.window_handle, config_.width, config_.height)) {
        CS_LOG(ERR, "D3D11 renderer initialization failed");
        return false;
    }

    CS_LOG(INFO, "D3D11 renderer initialized: %ux%u", config_.width, config_.height);
    return true;
#else
    CS_LOG(ERR, "Renderer not supported on this platform");
    return false;
#endif
}

bool Viewer::initDecoder() {
    uint8_t codec = codecFromString(config_.codec);

    // Try D3D11VA decoder first (shares device with renderer for zero-copy)
    auto d3d11va_dec = std::make_unique<D3D11VADecoder>();

#ifdef _WIN32
    if (renderer_) {
        d3d11va_dec->setD3D11Device(renderer_->getDevice());
    }
#endif

    if (d3d11va_dec->initialize(codec, config_.width, config_.height)) {
        decoder_ = std::move(d3d11va_dec);
        CS_LOG(INFO, "Decoder initialized: %s", decoder_->getName().c_str());
        return true;
    }

    // Fall back to generic NVDEC decoder (tries CUDA, then D3D11VA, then DXVA2, then software)
    auto nvdec = std::make_unique<NvdecDecoder>();

#ifdef _WIN32
    if (renderer_) {
        nvdec->setD3D11Device(renderer_->getDevice());
    }
#endif

    if (nvdec->initialize(codec, config_.width, config_.height)) {
        decoder_ = std::move(nvdec);
        CS_LOG(INFO, "Decoder initialized: %s", decoder_->getName().c_str());
        return true;
    }

    CS_LOG(ERR, "All decoder backends failed");
    return false;
}

bool Viewer::initTransport() {
    // Create jitter buffer
    jitter_buffer_ = std::make_unique<JitterBuffer>();

    switch (quality_) {
        case QualityPreset::PERFORMANCE:
            jitter_buffer_->setTargetDepthMs(10);
            break;
        case QualityPreset::BALANCED:
            jitter_buffer_->setTargetDepthMs(20);
            break;
        case QualityPreset::QUALITY:
            jitter_buffer_->setTargetDepthMs(40);
            break;
    }

    // Create NACK sender
    nack_sender_ = std::make_unique<NackSender>();
    if (p2p_socket_ >= 0 && peer_addr_len_ > 0) {
        nack_sender_->initialize(p2p_socket_,
                                 reinterpret_cast<struct sockaddr*>(&peer_addr_),
                                 peer_addr_len_);
        nack_sender_->start();
    }

    // Create stats reporter
    stats_reporter_ = std::make_unique<StatsReporter>();
    if (p2p_socket_ >= 0 && peer_addr_len_ > 0) {
        stats_reporter_->initialize(p2p_socket_,
                                    reinterpret_cast<struct sockaddr*>(&peer_addr_),
                                    peer_addr_len_);
        stats_reporter_->setNackSender(nack_sender_.get());
        stats_reporter_->setCodecName(config_.codec);
        stats_reporter_->setResolution(config_.width, config_.height);
        stats_reporter_->start();
    }

    // Create UDP receiver
    receiver_ = std::make_unique<UdpReceiver>();
    if (p2p_socket_ >= 0) {
        if (!receiver_->initialize(p2p_socket_, config_.dtls_fingerprint)) {
            CS_LOG(ERR, "Failed to initialize UDP receiver");
            return false;
        }

        // Start receiving packets
        if (!receiver_->start([this](PacketType type, const uint8_t* data, size_t len) {
            switch (type) {
                case PacketType::VIDEO:
                    onVideoPacket(data, len);
                    break;
                case PacketType::AUDIO:
                    onAudioPacket(data, len);
                    break;
                default:
                    break;
            }
        })) {
            CS_LOG(ERR, "Failed to start UDP receiver");
            return false;
        }
    }

    CS_LOG(INFO, "Transport initialized");
    return true;
}

bool Viewer::initAudio() {
    opus_decoder_ = std::make_unique<OpusDecoderWrapper>();
    if (!opus_decoder_->initialize(48000, 2)) {
        CS_LOG(WARN, "Failed to initialize Opus decoder");
        return false;
    }

    audio_playback_ = std::make_unique<WasapiPlayback>();
    if (!audio_playback_->initialize(48000, 2)) {
        CS_LOG(WARN, "Failed to initialize WASAPI playback");
        return false;
    }

    CS_LOG(INFO, "Audio initialized: Opus + WASAPI @ 48kHz stereo");
    return true;
}

bool Viewer::initInput() {
#ifdef _WIN32
    if (!config_.window_handle) {
        return false;
    }

    input_capture_ = std::make_unique<InputCapture>();
    if (!input_capture_->initialize(config_.window_handle)) {
        CS_LOG(WARN, "Failed to initialize input capture");
        return false;
    }

    // Create input sender
    if (p2p_socket_ >= 0 && peer_addr_len_ > 0) {
        input_sender_ = std::make_unique<InputSender>();
        input_sender_->initialize(p2p_socket_,
                                  reinterpret_cast<struct sockaddr*>(&peer_addr_),
                                  peer_addr_len_);

        // Wire input capture -> sender
        input_capture_->setCallback([this](const InputEvent& event) {
            if (input_sender_) {
                input_sender_->sendInput(event);
            }
        });

        input_capture_->setEnabled(true);
    }

    CS_LOG(INFO, "Input capture initialized");
    return true;
#else
    return false;
#endif
}

// ---------------------------------------------------------------------------
// Packet dispatch
// ---------------------------------------------------------------------------

void Viewer::onVideoPacket(const uint8_t* data, size_t len) {
    if (len < sizeof(VideoPacketHeader)) return;

    VideoPacketHeader header;
    if (!VideoPacketHeader::deserialize(data, len, header)) return;

    const uint8_t* payload = data + sizeof(VideoPacketHeader);
    size_t payload_len = len - sizeof(VideoPacketHeader);

    if (payload_len != header.payload_length) {
        // Truncated or invalid packet
        return;
    }

    uint64_t now = getTimestampUs();

    // Feed stats reporter
    if (stats_reporter_) {
        stats_reporter_->onPacketReceived(header, now);
    }

    // Feed NACK sender
    if (nack_sender_) {
        nack_sender_->onPacketReceived(header.sequence_number);
    }

    // Push into jitter buffer
    if (jitter_buffer_) {
        jitter_buffer_->pushPacket(header, payload, payload_len);
        decode_queue_cv_.notify_one();
    }
}

void Viewer::onAudioPacket(const uint8_t* data, size_t len) {
    if (len < sizeof(AudioPacketHeader)) return;

    AudioPacketHeader header;
    if (!AudioPacketHeader::deserialize(data, len, header)) return;

    const uint8_t* payload = data + sizeof(AudioPacketHeader);
    size_t payload_len = len - sizeof(AudioPacketHeader);

    // Queue for audio thread
    {
        std::lock_guard<std::mutex> lock(audio_queue_mutex_);
        audio_queue_.push_back({
            std::vector<uint8_t>(payload, payload + payload_len),
            header.timestamp_us
        });
    }
    audio_queue_cv_.notify_one();
}

// ---------------------------------------------------------------------------
// Pipeline threads
// ---------------------------------------------------------------------------

void Viewer::decodeThreadFunc() {
    CS_LOG(INFO, "Decode thread started");

    while (running_.load()) {
        // Wait for data in the jitter buffer
        {
            std::unique_lock<std::mutex> lock(decode_queue_mutex_);
            decode_queue_cv_.wait_for(lock, std::chrono::milliseconds(5), [this]() {
                return !running_.load() ||
                       (jitter_buffer_ && jitter_buffer_->getCompleteFrameCount() > 0);
            });
        }

        if (!running_.load()) break;
        if (!jitter_buffer_ || !decoder_) continue;

        // Pop complete frames from the jitter buffer
        std::vector<uint8_t> frame_data;
        VideoPacketHeader header;

        while (jitter_buffer_->popFrame(frame_data, header)) {
            if (!running_.load()) break;

            auto start = std::chrono::steady_clock::now();

            DecodedFrame decoded;
            bool ok = decoder_->decode(frame_data.data(), frame_data.size(), decoded);

            auto end = std::chrono::steady_clock::now();
            double decode_ms = std::chrono::duration<double, std::milli>(end - start).count();

            if (ok) {
                decoded.timestamp_us = header.timestamp_us;
                decoded.decode_time_ms = decode_ms;

                // Update stats
                if (stats_reporter_) {
                    stats_reporter_->setDecodeTimeMs(decode_ms);
                    stats_reporter_->onFrameDecoded();
                }

                // Push to render queue
                {
                    std::lock_guard<std::mutex> lock(render_queue_mutex_);
                    pending_frame_ = std::make_unique<DecodedFrame>(decoded);
                }
                render_queue_cv_.notify_one();
            } else {
                if (stats_reporter_) {
                    stats_reporter_->onFrameDropped();
                }
            }
        }
    }

    CS_LOG(INFO, "Decode thread exited");
}

void Viewer::renderThreadFunc() {
    CS_LOG(INFO, "Render thread started");

    while (running_.load()) {
        std::unique_ptr<DecodedFrame> frame;

        // Wait for a decoded frame
        {
            std::unique_lock<std::mutex> lock(render_queue_mutex_);
            render_queue_cv_.wait_for(lock, std::chrono::milliseconds(16), [this]() {
                return !running_.load() || pending_frame_ != nullptr;
            });

            if (!running_.load()) break;

            frame = std::move(pending_frame_);
        }

        if (!frame || !renderer_) continue;

        double render_ms = renderer_->renderFrame(*frame);

        if (stats_reporter_) {
            stats_reporter_->setRenderTimeMs(render_ms);
        }
    }

    CS_LOG(INFO, "Render thread exited");
}

void Viewer::audioThreadFunc() {
    CS_LOG(INFO, "Audio thread started");

    while (running_.load()) {
        std::vector<AudioPacketData> packets;

        // Wait for audio data
        {
            std::unique_lock<std::mutex> lock(audio_queue_mutex_);
            audio_queue_cv_.wait_for(lock, std::chrono::milliseconds(5), [this]() {
                return !running_.load() || !audio_queue_.empty();
            });

            if (!running_.load()) break;

            packets = std::move(audio_queue_);
            audio_queue_.clear();
        }

        // Decode and play each audio packet
        for (const auto& pkt : packets) {
            if (!running_.load()) break;
            if (!opus_decoder_ || !audio_playback_) continue;

            std::vector<float> pcm;
            if (opus_decoder_->decode(pkt.data.data(), pkt.data.size(), pcm)) {
                size_t frame_count = pcm.size() / opus_decoder_->getChannels();
                audio_playback_->play(pcm.data(), frame_count);
            } else {
                // Packet loss concealment
                opus_decoder_->decodePLC(1, pcm);
                if (!pcm.empty()) {
                    size_t frame_count = pcm.size() / opus_decoder_->getChannels();
                    audio_playback_->play(pcm.data(), frame_count);
                }
            }
        }
    }

    CS_LOG(INFO, "Audio thread exited");
}

} // namespace cs
