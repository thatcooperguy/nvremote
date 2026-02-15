///////////////////////////////////////////////////////////////////////////////
// pipe_server.h -- Windows Named Pipe IPC server for host-agent communication
//
// Listens on a named pipe (e.g. \\.\pipe\nvremote-host) for JSON
// commands from the host-agent Go binary.  Each message is a JSON object
// terminated by a newline.
//
// Supported commands:
//   prepare_session  { session_id, codec, bitrate_kbps, fps, width, height, gaming_mode }
//   start_session    { session_id, peer_ip, peer_port, dtls_fingerprint }
//   stop_session     { session_id }
//   get_stats        -> returns QoS statistics
//   force_idr        -> force a keyframe
//   reconfigure      { bitrate_kbps, fps, width, height }
//   set_gaming_mode  { mode: "competitive"|"balanced"|"cinematic" }
//
// Responses:
//   { "status": "ok", "data": {...} }
//   { "status": "error", "message": "..." }
//
// JSON parsing uses a minimal built-in implementation (no external deps).
///////////////////////////////////////////////////////////////////////////////
#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <map>
#include <thread>
#include <atomic>

#ifndef WIN32_LEAN_AND_MEAN
#  define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>

namespace cs::host {

// ---------------------------------------------------------------------------
// SimpleJson -- minimal JSON key-value store (string values only)
//
// Supports flat objects: { "key": "value", "num": "123" }
// Callers use getString() / getInt() / getUint() for typed access.
// ---------------------------------------------------------------------------
class SimpleJson {
public:
    SimpleJson() = default;

    /// Parse a JSON object string.  Returns true on success.
    bool parse(const std::string& json);

    /// Check if a key exists.
    bool hasKey(const std::string& key) const;

    /// Get a string value (returns empty string if not found).
    std::string getString(const std::string& key) const;

    /// Get an integer value (returns 0 if not found or not numeric).
    int64_t getInt(const std::string& key) const;

    /// Get an unsigned integer value.
    uint64_t getUint(const std::string& key) const;

    /// Set a string value.
    void setString(const std::string& key, const std::string& value);

    /// Set a numeric value.
    void setInt(const std::string& key, int64_t value);

    /// Set an unsigned numeric value.
    void setUint(const std::string& key, uint64_t value);

    /// Set a floating-point value.
    void setFloat(const std::string& key, double value);

    /// Serialize to a JSON string.
    std::string serialize() const;

    /// Access the underlying map.
    const std::map<std::string, std::string>& entries() const { return entries_; }

private:
    /// Skip whitespace in the input starting at pos.
    static size_t skipWs(const std::string& s, size_t pos);

    /// Parse a JSON string literal starting at pos (including quotes).
    /// Returns the parsed string and advances pos past the closing quote.
    static std::string parseString(const std::string& s, size_t& pos);

    /// Parse a JSON value (string, number, bool, null) starting at pos.
    static std::string parseValue(const std::string& s, size_t& pos);

    /// Escape a string for JSON output.
    static std::string escapeString(const std::string& s);

    std::map<std::string, std::string> entries_;
};

// ---------------------------------------------------------------------------
// Command handler callback
// ---------------------------------------------------------------------------

/// Receives the command name and parsed JSON params, returns a JSON response.
using PipeCommandHandler = std::function<std::string(
    const std::string& command, const SimpleJson& params)>;

// ---------------------------------------------------------------------------
// PipeServer
// ---------------------------------------------------------------------------
class PipeServer {
public:
    /// Construct with a pipe name (e.g. "nvremote-host").
    /// The full path will be \\.\pipe\<name>.
    explicit PipeServer(const std::string& pipe_name);
    ~PipeServer();

    // Non-copyable
    PipeServer(const PipeServer&) = delete;
    PipeServer& operator=(const PipeServer&) = delete;

    /// Set the command handler.
    void setHandler(PipeCommandHandler handler);

    /// Start the pipe server (creates thread, listens for connections).
    bool start();

    /// Stop the pipe server and close the pipe.
    void stop();

    /// Check if the server is running.
    bool isRunning() const { return running_.load(); }

private:
    void serverThread();
    bool createPipeInstance();
    void handleClient();
    std::string processMessage(const std::string& message);

    std::string          pipe_name_;
    std::string          full_pipe_path_;
    HANDLE               pipe_handle_ = INVALID_HANDLE_VALUE;

    PipeCommandHandler   handler_;
    std::thread          thread_;
    std::atomic<bool>    running_{false};
    std::atomic<bool>    stop_flag_{false};

    // Overlapped I/O event for cancellable waits.
    HANDLE               overlap_event_ = INVALID_HANDLE_VALUE;
};

// ---------------------------------------------------------------------------
// Helper: build a JSON success response
// ---------------------------------------------------------------------------
inline std::string makeOkResponse(const SimpleJson& data = {}) {
    SimpleJson resp;
    resp.setString("status", "ok");
    // Embed data fields into response
    for (auto& [k, v] : data.entries()) {
        resp.setString(k, v);
    }
    return resp.serialize();
}

/// Overload accepting a raw data JSON string for nesting.
inline std::string makeOkResponseRaw(const std::string& data_json) {
    // Build response with nested data object
    std::string resp = "{\"status\":\"ok\",\"data\":";
    resp += data_json;
    resp += "}";
    return resp;
}

inline std::string makeErrorResponse(const std::string& message) {
    std::string resp = "{\"status\":\"error\",\"message\":\"";
    // Minimal escape: just backslash and quote
    for (char c : message) {
        if (c == '"') resp += "\\\"";
        else if (c == '\\') resp += "\\\\";
        else resp += c;
    }
    resp += "\"}";
    return resp;
}

} // namespace cs::host
