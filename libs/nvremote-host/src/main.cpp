///////////////////////////////////////////////////////////////////////////////
// main.cpp -- Entry point for nvremote-host.exe
//
// Command-line options:
//   --ipc-pipe <name>     Run as IPC server on named pipe \\.\pipe\<name>
//   --config <path>       Load session config from JSON file (not yet implemented)
//   --capture-test        Capture 10 frames and log timing, then exit
//   --encode-test         Capture + encode 100 frames to test.h264, then exit
//   --help                Show usage information
//
// If --ipc-pipe is given, the host operates as a service controlled by the
// Go host-agent via named pipe commands.  Otherwise it runs in standalone
// mode and waits for 'q' + Enter to quit.
///////////////////////////////////////////////////////////////////////////////

#include "cs/common.h"
#include "cs/qos/gaming_modes.h"

#include "session/session_manager.h"
#include "ipc/pipe_server.h"

#include <atomic>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <Windows.h>
#  include <objbase.h>   // CoInitializeEx
#endif

using namespace cs::host;

// ---------------------------------------------------------------------------
// Global state for signal handling
// ---------------------------------------------------------------------------
static std::atomic<bool> g_shutdown_requested{false};
static SessionManager*   g_session_manager = nullptr;

#ifdef _WIN32
static BOOL WINAPI consoleCtrlHandler(DWORD ctrl_type) {
    switch (ctrl_type) {
        case CTRL_C_EVENT:
        case CTRL_BREAK_EVENT:
        case CTRL_CLOSE_EVENT:
            CS_LOG(INFO, "Received console control signal %lu, shutting down...",
                   ctrl_type);
            g_shutdown_requested.store(true);
            if (g_session_manager) {
                g_session_manager->stopSession();
            }
            return TRUE;
        default:
            return FALSE;
    }
}
#endif

static void signalHandler(int sig) {
    CS_LOG(INFO, "Received signal %d, shutting down...", sig);
    g_shutdown_requested.store(true);
    if (g_session_manager) {
        g_session_manager->stopSession();
    }
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------
static void printUsage(const char* argv0) {
    std::fprintf(stderr,
        "Usage: %s [OPTIONS]\n"
        "\n"
        "Options:\n"
        "  --ipc-pipe <name>     Run as IPC service on \\\\.\\.\\pipe\\<name>\n"
        "  --config <path>       Load session config from JSON file\n"
        "  --capture-test        Capture 10 frames, log timing, exit\n"
        "  --encode-test         Capture + encode 100 frames to test.h264, exit\n"
        "  --help                Show this help\n"
        "\n"
        "Without --ipc-pipe, runs in standalone mode (press 'q' + Enter to quit).\n",
        argv0);
}

// ---------------------------------------------------------------------------
// Parse GamingMode from string
// ---------------------------------------------------------------------------
static cs::GamingMode parseGamingMode(const std::string& s) {
    if (s == "competitive" || s == "Competitive") return cs::GamingMode::Competitive;
    if (s == "cinematic"   || s == "Cinematic")   return cs::GamingMode::Cinematic;
    return cs::GamingMode::Balanced;
}

// ---------------------------------------------------------------------------
// Parse CodecType from string
// ---------------------------------------------------------------------------
static CodecType parseCodec(const std::string& s) {
    if (s == "h265" || s == "H265" || s == "hevc" || s == "HEVC") return CodecType::HEVC;
    if (s == "av1"  || s == "AV1")                                 return CodecType::AV1;
    return CodecType::H264;
}

// ---------------------------------------------------------------------------
// IPC command handler
// ---------------------------------------------------------------------------
static std::string handlePipeCommand(const std::string& command,
                                     const SimpleJson& params,
                                     SessionManager& session) {
    // ---- prepare_session ----
    if (command == "prepare_session") {
        SessionConfig cfg;
        cfg.session_id    = params.getString("session_id");
        cfg.codec         = parseCodec(params.getString("codec"));
        cfg.bitrate_kbps  = static_cast<uint32_t>(params.getUint("bitrate_kbps"));
        cfg.fps           = static_cast<uint32_t>(params.getUint("fps"));
        cfg.width         = static_cast<uint32_t>(params.getUint("width"));
        cfg.height        = static_cast<uint32_t>(params.getUint("height"));
        cfg.gaming_mode   = parseGamingMode(params.getString("gaming_mode"));

        // Defaults
        if (cfg.bitrate_kbps == 0) cfg.bitrate_kbps = 20000;
        if (cfg.fps == 0)          cfg.fps = 60;
        if (cfg.width == 0)        cfg.width = 1920;
        if (cfg.height == 0)       cfg.height = 1080;

        if (!session.prepareSession(cfg)) {
            return makeErrorResponse("Failed to prepare session");
        }

        SimpleJson data;
        data.setString("session_id", cfg.session_id);
        return makeOkResponse(data);
    }

    // ---- start_session ----
    if (command == "start_session") {
        PeerInfo peer;
        peer.ip               = params.getString("peer_ip");
        peer.port             = static_cast<uint16_t>(params.getUint("peer_port"));
        peer.dtls_fingerprint = params.getString("dtls_fingerprint");

        if (peer.ip.empty() || peer.port == 0) {
            return makeErrorResponse("Missing peer_ip or peer_port");
        }

        if (!session.startSession(peer)) {
            return makeErrorResponse("Failed to start session");
        }
        return makeOkResponse();
    }

    // ---- stop_session ----
    if (command == "stop_session") {
        session.stopSession();
        return makeOkResponse();
    }

    // ---- get_stats ----
    if (command == "get_stats") {
        SessionStats st = session.getStats();
        SimpleJson data;
        data.setUint("bitrate_kbps",        st.bitrate_kbps);
        data.setUint("fps",                 st.fps);
        data.setUint("width",               st.width);
        data.setUint("height",              st.height);
        data.setString("codec",             st.codec);
        data.setString("gaming_mode",       st.gaming_mode);
        data.setFloat("packet_loss_percent", st.packet_loss_percent);
        data.setFloat("jitter_ms",          st.jitter_ms);
        data.setFloat("rtt_ms",             st.rtt_ms);
        data.setFloat("capture_time_ms",    st.capture_time_ms);
        data.setFloat("encode_time_ms",     st.encode_time_ms);
        data.setUint("bytes_sent",          st.bytes_sent);
        data.setUint("frames_sent",         st.frames_sent);
        data.setFloat("fec_ratio",          st.fec_ratio);
        data.setString("connection_type",   st.connection_type);
        data.setString("streaming",         session.isStreaming() ? "true" : "false");
        return makeOkResponseRaw(data.serialize());
    }

    // ---- force_idr ----
    if (command == "force_idr") {
        session.forceIdr();
        return makeOkResponse();
    }

    // ---- reconfigure ----
    if (command == "reconfigure") {
        uint32_t bitrate = static_cast<uint32_t>(params.getUint("bitrate_kbps"));
        uint32_t fps     = static_cast<uint32_t>(params.getUint("fps"));
        if (bitrate == 0 && fps == 0) {
            return makeErrorResponse("Must provide bitrate_kbps and/or fps");
        }
        SessionStats st = session.getStats();
        if (bitrate == 0) bitrate = st.bitrate_kbps;
        if (fps == 0)     fps     = st.fps;

        session.reconfigure(bitrate, fps);
        return makeOkResponse();
    }

    // ---- set_gaming_mode ----
    if (command == "set_gaming_mode") {
        std::string mode_str = params.getString("mode");
        if (mode_str.empty()) {
            return makeErrorResponse("Missing 'mode' parameter");
        }
        cs::GamingMode mode = parseGamingMode(mode_str);
        session.setGamingMode(mode);

        SimpleJson data;
        data.setString("mode", cs::gamingModeToString(mode));
        return makeOkResponse(data);
    }

    return makeErrorResponse("Unknown command: " + command);
}

// ---------------------------------------------------------------------------
// Capture test mode
// ---------------------------------------------------------------------------
static int runCaptureTest(SessionManager& session) {
    CS_LOG(INFO, "=== Capture Test Mode: 10 frames ===");

    auto* cap = session.getCaptureDevice();
    if (!cap) {
        CS_LOG(ERR, "No capture device available");
        return 1;
    }

    for (int i = 0; i < 10; ++i) {
        uint64_t start = cs::getTimestampUs();
        CapturedFrame frame;
        bool ok = cap->captureFrame(frame);
        uint64_t end = cs::getTimestampUs();

        float ms = static_cast<float>(end - start) / 1000.0f;

        if (ok) {
            CS_LOG(INFO, "Frame %d: %ux%u  new=%s  capture=%.2f ms",
                   i, frame.width, frame.height,
                   frame.is_new_frame ? "yes" : "no",
                   ms);
        } else {
            CS_LOG(WARN, "Frame %d: capture FAILED (%.2f ms)", i, ms);
        }
    }

    CS_LOG(INFO, "=== Capture test complete ===");
    return 0;
}

// ---------------------------------------------------------------------------
// Encode test mode
// ---------------------------------------------------------------------------
static int runEncodeTest(SessionManager& session) {
    CS_LOG(INFO, "=== Encode Test Mode: 100 frames -> test.h264 ===");

    auto* cap = session.getCaptureDevice();
    auto* enc = session.getEncoder();
    if (!cap || !enc) {
        CS_LOG(ERR, "Capture device or encoder not available");
        return 1;
    }

    // Initialize encoder with default config
    EncoderConfig cfg;
    cfg.codec        = CodecType::H264;
    cfg.width        = 1920;
    cfg.height       = 1080;
    cfg.bitrate_kbps = 20000;
    cfg.fps          = 60;
    cfg.gop_length   = 120;

    if (!enc->initialize(cfg)) {
        CS_LOG(ERR, "Failed to initialize encoder for test");
        return 1;
    }

    std::ofstream outfile("test.h264", std::ios::binary);
    if (!outfile.is_open()) {
        CS_LOG(ERR, "Failed to open test.h264 for writing");
        return 1;
    }

    uint32_t frames_encoded = 0;
    float total_capture_ms = 0;
    float total_encode_ms  = 0;

    for (int i = 0; i < 100; ++i) {
        // Capture
        uint64_t cap_start = cs::getTimestampUs();
        CapturedFrame frame;
        if (!cap->captureFrame(frame)) {
            CS_LOG(WARN, "Frame %d: capture failed, skipping", i);
            continue;
        }
        uint64_t cap_end = cs::getTimestampUs();
        float cap_ms = static_cast<float>(cap_end - cap_start) / 1000.0f;
        total_capture_ms += cap_ms;

        if (!frame.is_new_frame) {
            CS_LOG(DEBUG, "Frame %d: duplicate, skipping", i);
            continue;
        }

        // Encode
        uint64_t enc_start = cs::getTimestampUs();
        EncodedPacket packet;
        packet.frame_number = static_cast<uint32_t>(i);
        if (!enc->encode(frame, packet)) {
            CS_LOG(WARN, "Frame %d: encode failed", i);
            continue;
        }
        uint64_t enc_end = cs::getTimestampUs();
        float enc_ms = static_cast<float>(enc_end - enc_start) / 1000.0f;
        total_encode_ms += enc_ms;

        // Write to file
        outfile.write(reinterpret_cast<const char*>(packet.data.data()),
                      static_cast<std::streamsize>(packet.data.size()));
        ++frames_encoded;

        CS_LOG(INFO, "Frame %d: %zu bytes  keyframe=%s  cap=%.2f ms  enc=%.2f ms",
               i, packet.data.size(),
               packet.is_keyframe ? "yes" : "no",
               cap_ms, enc_ms);
    }

    outfile.close();
    enc->flush();

    float avg_cap = frames_encoded > 0 ? total_capture_ms / frames_encoded : 0;
    float avg_enc = frames_encoded > 0 ? total_encode_ms  / frames_encoded : 0;

    CS_LOG(INFO, "=== Encode test complete ===");
    CS_LOG(INFO, "Frames encoded: %u", frames_encoded);
    CS_LOG(INFO, "Avg capture time: %.2f ms", avg_cap);
    CS_LOG(INFO, "Avg encode time:  %.2f ms", avg_enc);
    CS_LOG(INFO, "Output: test.h264");

    return 0;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------
int main(int argc, char* argv[]) {
    // ---- Parse command-line arguments ----
    std::string ipc_pipe_name;
    std::string config_path;
    bool capture_test = false;
    bool encode_test  = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];

        if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return 0;
        }
        if (arg == "--ipc-pipe" && i + 1 < argc) {
            ipc_pipe_name = argv[++i];
            continue;
        }
        if (arg == "--config" && i + 1 < argc) {
            config_path = argv[++i];
            continue;
        }
        if (arg == "--capture-test") {
            capture_test = true;
            continue;
        }
        if (arg == "--encode-test") {
            encode_test = true;
            continue;
        }

        std::fprintf(stderr, "Unknown option: %s\n", arg.c_str());
        printUsage(argv[0]);
        return 1;
    }

    // ---- Initialize Winsock ----
    cs::WinsockGuard winsock;
    if (!winsock.ok()) {
        std::fprintf(stderr, "Failed to initialize Winsock\n");
        return 1;
    }

    // ---- Initialize COM (required for WASAPI audio capture) ----
#ifdef _WIN32
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) {
        std::fprintf(stderr, "CoInitializeEx failed: 0x%08lx\n", hr);
        return 1;
    }
#endif

    // ---- Set up logging ----
    cs::globalLogLevel() = cs::LogLevel::INFO;
    CS_LOG(INFO, "nvremote-host starting...");

    // ---- Install signal handlers ----
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);
#ifdef _WIN32
    SetConsoleCtrlHandler(consoleCtrlHandler, TRUE);
#endif

    // ---- Create SessionManager ----
    SessionManager session;
    g_session_manager = &session;

    if (!session.initialize()) {
        CS_LOG(ERR, "Failed to initialize session manager");
#ifdef _WIN32
        CoUninitialize();
#endif
        return 1;
    }

    // ---- Capture test mode ----
    if (capture_test) {
        int ret = runCaptureTest(session);
        session.stopSession();
        g_session_manager = nullptr;
#ifdef _WIN32
        CoUninitialize();
#endif
        return ret;
    }

    // ---- Encode test mode ----
    if (encode_test) {
        int ret = runEncodeTest(session);
        session.stopSession();
        g_session_manager = nullptr;
#ifdef _WIN32
        CoUninitialize();
#endif
        return ret;
    }

    // ---- IPC pipe mode ----
    if (!ipc_pipe_name.empty()) {
        CS_LOG(INFO, "Starting IPC pipe server: %s", ipc_pipe_name.c_str());

        PipeServer pipe(ipc_pipe_name);
        pipe.setHandler([&session](const std::string& cmd,
                                    const SimpleJson& params) -> std::string {
            return handlePipeCommand(cmd, params, session);
        });

        if (!pipe.start()) {
            CS_LOG(ERR, "Failed to start pipe server");
            g_session_manager = nullptr;
#ifdef _WIN32
            CoUninitialize();
#endif
            return 1;
        }

        // Run event loop: wait for shutdown signal
        CS_LOG(INFO, "IPC mode active, waiting for commands...");
        while (!g_shutdown_requested.load()) {
            Sleep(100);
        }

        pipe.stop();
        session.stopSession();
        g_session_manager = nullptr;

        CS_LOG(INFO, "nvremote-host exiting (IPC mode)");
#ifdef _WIN32
        CoUninitialize();
#endif
        return 0;
    }

    // ---- Standalone mode ----
    CS_LOG(INFO, "Standalone mode (no --ipc-pipe specified)");
    std::fprintf(stderr,
        "\nnvremote-host is running in standalone mode.\n"
        "Use --ipc-pipe <name> for agent-controlled mode.\n"
        "Press 'q' + Enter to quit.\n\n");

    // Wait for 'q' + Enter or signal
    while (!g_shutdown_requested.load()) {
        if (std::cin.peek() != EOF) {
            std::string line;
            std::getline(std::cin, line);
            if (!line.empty() && (line[0] == 'q' || line[0] == 'Q')) {
                CS_LOG(INFO, "Quit requested by user");
                break;
            }
        } else {
            Sleep(100);
        }
    }

    // ---- Clean shutdown ----
    session.stopSession();
    g_session_manager = nullptr;

    CS_LOG(INFO, "nvremote-host exiting");

#ifdef _WIN32
    CoUninitialize();
#endif

    return 0;
}
