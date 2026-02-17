///////////////////////////////////////////////////////////////////////////////
// addon.cpp -- Node.js N-API module entry point for nvremote-viewer
//
// Exports the following JavaScript API:
//
//   viewer.start({ sessionId, codec, windowHandle, ... })
//   viewer.stop()
//   viewer.getStats()  -> { bitrate, fps, packetLoss, ... }
//   viewer.onDisconnect(callback)
//   viewer.setQuality('balanced')
//   viewer.gatherIceCandidates(['stun:stun.l.google.com:19302'])
//   viewer.addRemoteCandidate({ type, ip, port, priority })
//   viewer.connectP2P({ dtlsFingerprint: 'AA:BB:CC...' })
//   viewer.disconnectP2P()
//
// Uses Napi::ThreadSafeFunction for async callbacks from C++ threads
// back to the JavaScript event loop.
///////////////////////////////////////////////////////////////////////////////

#include <napi.h>
#include <memory>
#include <string>

#include "viewer.h"
#include <cs/common.h>

namespace {

// ---------------------------------------------------------------------------
// Global viewer instance (singleton per addon)
// ---------------------------------------------------------------------------
static std::unique_ptr<cs::Viewer> g_viewer;
static Napi::ThreadSafeFunction g_disconnect_tsfn;
static Napi::ThreadSafeFunction g_stats_tsfn;
static cs::WinsockGuard g_winsock;

// ---------------------------------------------------------------------------
// Helper: parse CodecType from string
// ---------------------------------------------------------------------------
static cs::CodecType parseCodec(const std::string& s) {
    if (s == "h264" || s == "H264") return cs::CodecType::H264;
    if (s == "h265" || s == "H265" || s == "hevc" || s == "HEVC") return cs::CodecType::H265;
    if (s == "av1"  || s == "AV1")  return cs::CodecType::AV1;
    return cs::CodecType::H264;  // default
}

// ---------------------------------------------------------------------------
// Helper: parse QualityPreset from string
// ---------------------------------------------------------------------------
static cs::QualityPreset parseQuality(const std::string& s) {
    if (s == "performance") return cs::QualityPreset::PERFORMANCE;
    if (s == "balanced")    return cs::QualityPreset::BALANCED;
    if (s == "quality")     return cs::QualityPreset::QUALITY;
    return cs::QualityPreset::BALANCED;
}

// ---------------------------------------------------------------------------
// viewer.start(config)
// ---------------------------------------------------------------------------
Napi::Value Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected config object").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (g_viewer && g_viewer->isRunning()) {
        Napi::Error::New(env, "Viewer is already running. Call stop() first.").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Object opts = info[0].As<Napi::Object>();
    cs::ViewerConfig config;

    // Parse required fields
    if (opts.Has("sessionId") && opts.Get("sessionId").IsString()) {
        config.session_id = opts.Get("sessionId").As<Napi::String>().Utf8Value();
    }

    if (opts.Has("codec") && opts.Get("codec").IsString()) {
        config.codec = opts.Get("codec").As<Napi::String>().Utf8Value();
    } else {
        config.codec = "h264";
    }

    // Window handle: Electron passes an ArrayBuffer containing the native HWND
    if (opts.Has("windowHandle")) {
        Napi::Value wh = opts.Get("windowHandle");
        if (wh.IsBuffer()) {
            // Buffer containing a pointer-sized integer
            auto buf = wh.As<Napi::Buffer<uint8_t>>();
            if (buf.Length() >= sizeof(void*)) {
                void* ptr = nullptr;
                std::memcpy(&ptr, buf.Data(), sizeof(void*));
#ifdef _WIN32
                config.window_handle = reinterpret_cast<HWND>(ptr);
#endif
            }
        } else if (wh.IsNumber()) {
            // Direct integer HWND value
            auto val = wh.As<Napi::Number>().Int64Value();
#ifdef _WIN32
            config.window_handle = reinterpret_cast<HWND>(static_cast<intptr_t>(val));
#endif
        }
    }

    // Optional fields
    if (opts.Has("width") && opts.Get("width").IsNumber()) {
        config.width = opts.Get("width").As<Napi::Number>().Uint32Value();
    }
    if (opts.Has("height") && opts.Get("height").IsNumber()) {
        config.height = opts.Get("height").As<Napi::Number>().Uint32Value();
    }
    if (opts.Has("peerIp") && opts.Get("peerIp").IsString()) {
        config.peer_ip = opts.Get("peerIp").As<Napi::String>().Utf8Value();
    }
    if (opts.Has("peerPort") && opts.Get("peerPort").IsNumber()) {
        config.peer_port = static_cast<uint16_t>(opts.Get("peerPort").As<Napi::Number>().Uint32Value());
    }
    if (opts.Has("dtlsFingerprint") && opts.Get("dtlsFingerprint").IsString()) {
        config.dtls_fingerprint = opts.Get("dtlsFingerprint").As<Napi::String>().Utf8Value();
    }
    if (opts.Has("quality") && opts.Get("quality").IsString()) {
        config.quality = parseQuality(opts.Get("quality").As<Napi::String>().Utf8Value());
    }

    // Create viewer if needed
    if (!g_viewer) {
        g_viewer = std::make_unique<cs::Viewer>();
    }

    bool ok = g_viewer->start(config);
    if (!ok) {
        Napi::Error::New(env, "Failed to start viewer session").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return Napi::Boolean::New(env, true);
}

// ---------------------------------------------------------------------------
// viewer.stop()
// ---------------------------------------------------------------------------
Napi::Value Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_viewer) {
        g_viewer->stop();
    }

    // Release thread-safe functions
    if (g_disconnect_tsfn) {
        g_disconnect_tsfn.Release();
        g_disconnect_tsfn = Napi::ThreadSafeFunction();
    }
    if (g_stats_tsfn) {
        g_stats_tsfn.Release();
        g_stats_tsfn = Napi::ThreadSafeFunction();
    }

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// viewer.getStats() -> object
// ---------------------------------------------------------------------------
Napi::Value GetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!g_viewer) {
        return env.Undefined();
    }

    cs::ViewerStats stats = g_viewer->getStats();

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("bitrate",        Napi::Number::New(env, stats.bitrate_kbps));
    obj.Set("fps",            Napi::Number::New(env, stats.fps));
    obj.Set("packetLoss",     Napi::Number::New(env, stats.packet_loss));
    obj.Set("jitter",         Napi::Number::New(env, stats.jitter_ms));
    obj.Set("rtt",            Napi::Number::New(env, stats.rtt_ms));
    obj.Set("codec",          Napi::String::New(env, stats.codec));
    obj.Set("resolution",     Napi::String::New(env,
        std::to_string(stats.resolution_width) + "x" + std::to_string(stats.resolution_height)));
    obj.Set("connectionType", Napi::String::New(env, stats.connection_type));
    obj.Set("decodeTimeMs",   Napi::Number::New(env, stats.decode_time_ms));
    obj.Set("renderTimeMs",   Napi::Number::New(env, stats.render_time_ms));
    obj.Set("framesDecoded",  Napi::Number::New(env, static_cast<double>(stats.frames_decoded)));
    obj.Set("framesDropped",  Napi::Number::New(env, static_cast<double>(stats.frames_dropped)));

    return obj;
}

// ---------------------------------------------------------------------------
// viewer.onDisconnect(callback)
// ---------------------------------------------------------------------------
Napi::Value OnDisconnect(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected callback function").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Release previous TSFN if any
    if (g_disconnect_tsfn) {
        g_disconnect_tsfn.Release();
    }

    // Create a thread-safe function for the disconnect callback
    g_disconnect_tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "onDisconnect",
        0,   // unlimited queue
        1    // one thread
    );

    if (g_viewer) {
        g_viewer->setOnDisconnect([&]() {
            if (g_disconnect_tsfn) {
                g_disconnect_tsfn.NonBlockingCall([](Napi::Env env, Napi::Function jsCallback) {
                    jsCallback.Call({});
                });
            }
        });
    }

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// viewer.setQuality(preset)
// ---------------------------------------------------------------------------
Napi::Value SetQuality(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected quality preset string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string preset = info[0].As<Napi::String>().Utf8Value();

    if (g_viewer) {
        g_viewer->setQuality(parseQuality(preset));
    }

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// viewer.setGamingMode(mode)
// Maps gaming mode strings to quality presets:
//   "competitive" -> PERFORMANCE (lowest latency)
//   "balanced"    -> BALANCED
//   "cinematic"   -> QUALITY (highest quality)
// ---------------------------------------------------------------------------
Napi::Value SetGamingMode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected gaming mode string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string mode = info[0].As<Napi::String>().Utf8Value();

    // Map gaming mode to quality preset
    cs::QualityPreset preset = cs::QualityPreset::BALANCED;
    if (mode == "competitive") {
        preset = cs::QualityPreset::PERFORMANCE;
    } else if (mode == "balanced") {
        preset = cs::QualityPreset::BALANCED;
    } else if (mode == "cinematic") {
        preset = cs::QualityPreset::QUALITY;
    }

    if (g_viewer) {
        g_viewer->setQuality(preset);
    }

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// viewer.gatherIceCandidates(stunServers) -> Promise<candidates[]>
// ---------------------------------------------------------------------------
class GatherIceWorker : public Napi::AsyncWorker {
public:
    GatherIceWorker(Napi::Env env, Napi::Promise::Deferred deferred,
                    std::vector<std::string> stun_servers)
        : Napi::AsyncWorker(env)
        , deferred_(deferred)
        , stun_servers_(std::move(stun_servers))
    {}

    void Execute() override {
        if (g_viewer) {
            candidates_ = g_viewer->gatherIceCandidates(stun_servers_);
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::Array arr = Napi::Array::New(env, candidates_.size());
        for (size_t i = 0; i < candidates_.size(); i++) {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("type",     Napi::String::New(env, candidates_[i].type));
            obj.Set("ip",       Napi::String::New(env, candidates_[i].ip));
            obj.Set("port",     Napi::Number::New(env, candidates_[i].port));
            obj.Set("priority", Napi::Number::New(env, candidates_[i].priority));
            arr.Set(static_cast<uint32_t>(i), obj);
        }
        deferred_.Resolve(arr);
    }

    void OnError(const Napi::Error& err) override {
        deferred_.Reject(err.Value());
    }

private:
    Napi::Promise::Deferred deferred_;
    std::vector<std::string> stun_servers_;
    std::vector<cs::IceCandidate> candidates_;
};

Napi::Value GatherIceCandidates(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);

    std::vector<std::string> stun_servers;
    if (info.Length() >= 1 && info[0].IsArray()) {
        Napi::Array arr = info[0].As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            Napi::Value val = arr.Get(i);
            if (val.IsString()) {
                stun_servers.push_back(val.As<Napi::String>().Utf8Value());
            }
        }
    }

    auto* worker = new GatherIceWorker(env, deferred, std::move(stun_servers));
    worker->Queue();

    return deferred.Promise();
}

// ---------------------------------------------------------------------------
// viewer.addRemoteCandidate({ type, ip, port, priority })
// ---------------------------------------------------------------------------
Napi::Value AddRemoteCandidate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected candidate object").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Object obj = info[0].As<Napi::Object>();
    cs::IceCandidate candidate;

    if (obj.Has("type") && obj.Get("type").IsString()) {
        candidate.type = obj.Get("type").As<Napi::String>().Utf8Value();
    }
    if (obj.Has("ip") && obj.Get("ip").IsString()) {
        candidate.ip = obj.Get("ip").As<Napi::String>().Utf8Value();
    }
    if (obj.Has("port") && obj.Get("port").IsNumber()) {
        candidate.port = static_cast<uint16_t>(obj.Get("port").As<Napi::Number>().Uint32Value());
    }
    if (obj.Has("priority") && obj.Get("priority").IsNumber()) {
        candidate.priority = obj.Get("priority").As<Napi::Number>().Uint32Value();
    }

    if (g_viewer) {
        g_viewer->addRemoteCandidate(candidate);
    }

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// viewer.connectP2P({ dtlsFingerprint }) -> Promise<result>
// ---------------------------------------------------------------------------
class ConnectP2PWorker : public Napi::AsyncWorker {
public:
    ConnectP2PWorker(Napi::Env env, Napi::Promise::Deferred deferred,
                     std::string fingerprint)
        : Napi::AsyncWorker(env)
        , deferred_(deferred)
        , fingerprint_(std::move(fingerprint))
    {}

    void Execute() override {
        if (g_viewer) {
            result_ = g_viewer->connectP2P(fingerprint_);
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("success",    Napi::Boolean::New(env, result_.success));
        obj.Set("localIp",    Napi::String::New(env, result_.local_ip));
        obj.Set("localPort",  Napi::Number::New(env, result_.local_port));
        obj.Set("remoteIp",   Napi::String::New(env, result_.remote_ip));
        obj.Set("remotePort", Napi::Number::New(env, result_.remote_port));
        if (!result_.error.empty()) {
            obj.Set("error", Napi::String::New(env, result_.error));
        }
        deferred_.Resolve(obj);
    }

    void OnError(const Napi::Error& err) override {
        deferred_.Reject(err.Value());
    }

private:
    Napi::Promise::Deferred deferred_;
    std::string fingerprint_;
    cs::P2PResult result_;
};

Napi::Value ConnectP2P(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);

    std::string fingerprint;
    if (info.Length() >= 1 && info[0].IsObject()) {
        Napi::Object obj = info[0].As<Napi::Object>();
        if (obj.Has("dtlsFingerprint") && obj.Get("dtlsFingerprint").IsString()) {
            fingerprint = obj.Get("dtlsFingerprint").As<Napi::String>().Utf8Value();
        }
    }

    auto* worker = new ConnectP2PWorker(env, deferred, std::move(fingerprint));
    worker->Queue();

    return deferred.Promise();
}

// ---------------------------------------------------------------------------
// viewer.disconnectP2P()
// ---------------------------------------------------------------------------
Napi::Value DisconnectP2P(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_viewer) {
        g_viewer->disconnectP2P();
    }

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// Module initialization
// ---------------------------------------------------------------------------
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    CS_LOG(INFO, "nvremote-viewer N-API addon loading");

    exports.Set("start",                Napi::Function::New(env, Start));
    exports.Set("stop",                 Napi::Function::New(env, Stop));
    exports.Set("getStats",             Napi::Function::New(env, GetStats));
    exports.Set("onDisconnect",         Napi::Function::New(env, OnDisconnect));
    exports.Set("setQuality",           Napi::Function::New(env, SetQuality));
    exports.Set("setGamingMode",        Napi::Function::New(env, SetGamingMode));
    exports.Set("gatherIceCandidates",  Napi::Function::New(env, GatherIceCandidates));
    exports.Set("addRemoteCandidate",   Napi::Function::New(env, AddRemoteCandidate));
    exports.Set("connectP2P",           Napi::Function::New(env, ConnectP2P));
    exports.Set("disconnectP2P",        Napi::Function::New(env, DisconnectP2P));

    CS_LOG(INFO, "nvremote-viewer N-API addon loaded successfully");
    return exports;
}

}  // anonymous namespace

NODE_API_MODULE(nvremote_viewer, Init)
