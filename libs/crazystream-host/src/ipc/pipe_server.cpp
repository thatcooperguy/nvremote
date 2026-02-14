///////////////////////////////////////////////////////////////////////////////
// pipe_server.cpp -- Windows Named Pipe IPC server implementation
//
// Creates a named pipe with overlapped I/O and processes newline-delimited
// JSON messages from a single client at a time.  The server runs on its own
// thread and dispatches parsed commands to a registered handler callback.
///////////////////////////////////////////////////////////////////////////////

#include "pipe_server.h"
#include "cs/common.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sstream>

#ifdef _WIN32
#include <sddl.h>
#endif

namespace cs::host {

// ===========================================================================
// SimpleJson implementation
// ===========================================================================

size_t SimpleJson::skipWs(const std::string& s, size_t pos) {
    while (pos < s.size() && std::isspace(static_cast<unsigned char>(s[pos]))) {
        ++pos;
    }
    return pos;
}

std::string SimpleJson::parseString(const std::string& s, size_t& pos) {
    // pos should point to the opening quote
    if (pos >= s.size() || s[pos] != '"') return "";
    ++pos; // skip opening quote

    std::string result;
    result.reserve(64);

    while (pos < s.size()) {
        char c = s[pos++];
        if (c == '"') {
            return result;
        }
        if (c == '\\' && pos < s.size()) {
            char esc = s[pos++];
            switch (esc) {
                case '"':  result += '"';  break;
                case '\\': result += '\\'; break;
                case '/':  result += '/';  break;
                case 'b':  result += '\b'; break;
                case 'f':  result += '\f'; break;
                case 'n':  result += '\n'; break;
                case 'r':  result += '\r'; break;
                case 't':  result += '\t'; break;
                case 'u':
                    // Skip 4 hex digits (minimal handling -- store as-is)
                    if (pos + 4 <= s.size()) {
                        result += "\\u";
                        result += s.substr(pos, 4);
                        pos += 4;
                    }
                    break;
                default:
                    result += esc;
                    break;
            }
        } else {
            result += c;
        }
    }
    return result; // unterminated string -- return what we have
}

std::string SimpleJson::parseValue(const std::string& s, size_t& pos) {
    pos = skipWs(s, pos);
    if (pos >= s.size()) return "";

    char c = s[pos];

    // String value
    if (c == '"') {
        return parseString(s, pos);
    }

    // Number (integer or float, possibly negative)
    if (c == '-' || (c >= '0' && c <= '9')) {
        size_t start = pos;
        if (c == '-') ++pos;
        while (pos < s.size() && ((s[pos] >= '0' && s[pos] <= '9') ||
               s[pos] == '.' || s[pos] == 'e' || s[pos] == 'E' ||
               s[pos] == '+' || s[pos] == '-')) {
            // Avoid consuming '-' after the first character unless after e/E
            if (s[pos] == '-' && pos > start + 1 && s[pos - 1] != 'e' && s[pos - 1] != 'E') {
                break;
            }
            ++pos;
        }
        return s.substr(start, pos - start);
    }

    // Boolean: true
    if (c == 't' && pos + 4 <= s.size() && s.substr(pos, 4) == "true") {
        pos += 4;
        return "true";
    }

    // Boolean: false
    if (c == 'f' && pos + 5 <= s.size() && s.substr(pos, 5) == "false") {
        pos += 5;
        return "false";
    }

    // Null
    if (c == 'n' && pos + 4 <= s.size() && s.substr(pos, 4) == "null") {
        pos += 4;
        return "";
    }

    // Skip nested objects and arrays (store as raw string)
    if (c == '{' || c == '[') {
        char open  = c;
        char close = (c == '{') ? '}' : ']';
        int depth = 1;
        size_t start = pos;
        ++pos;
        bool in_string = false;
        while (pos < s.size() && depth > 0) {
            char ch = s[pos];
            if (in_string) {
                if (ch == '\\') { ++pos; } // skip escaped char
                else if (ch == '"') { in_string = false; }
            } else {
                if (ch == '"') { in_string = true; }
                else if (ch == open) { ++depth; }
                else if (ch == close) { --depth; }
            }
            ++pos;
        }
        return s.substr(start, pos - start);
    }

    return "";
}

bool SimpleJson::parse(const std::string& json) {
    entries_.clear();

    size_t pos = skipWs(json, 0);
    if (pos >= json.size() || json[pos] != '{') return false;
    ++pos; // skip '{'

    while (pos < json.size()) {
        pos = skipWs(json, pos);
        if (pos >= json.size()) return false;

        // End of object
        if (json[pos] == '}') {
            return true;
        }

        // Skip comma between entries
        if (json[pos] == ',') {
            ++pos;
            pos = skipWs(json, pos);
        }

        // Parse key
        if (pos >= json.size() || json[pos] != '"') return false;
        std::string key = parseString(json, pos);

        // Expect colon
        pos = skipWs(json, pos);
        if (pos >= json.size() || json[pos] != ':') return false;
        ++pos;

        // Parse value
        std::string value = parseValue(json, pos);

        entries_[key] = value;
    }

    return false; // unterminated object
}

bool SimpleJson::hasKey(const std::string& key) const {
    return entries_.find(key) != entries_.end();
}

std::string SimpleJson::getString(const std::string& key) const {
    auto it = entries_.find(key);
    if (it == entries_.end()) return "";
    return it->second;
}

int64_t SimpleJson::getInt(const std::string& key) const {
    auto it = entries_.find(key);
    if (it == entries_.end()) return 0;
    try {
        return std::stoll(it->second);
    } catch (...) {
        return 0;
    }
}

uint64_t SimpleJson::getUint(const std::string& key) const {
    auto it = entries_.find(key);
    if (it == entries_.end()) return 0;
    try {
        return std::stoull(it->second);
    } catch (...) {
        return 0;
    }
}

void SimpleJson::setString(const std::string& key, const std::string& value) {
    entries_[key] = value;
}

void SimpleJson::setInt(const std::string& key, int64_t value) {
    entries_[key] = std::to_string(value);
}

void SimpleJson::setUint(const std::string& key, uint64_t value) {
    entries_[key] = std::to_string(value);
}

void SimpleJson::setFloat(const std::string& key, double value) {
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%.2f", value);
    entries_[key] = buf;
}

std::string SimpleJson::escapeString(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b";  break;
            case '\f': out += "\\f";  break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;      break;
        }
    }
    return out;
}

std::string SimpleJson::serialize() const {
    std::string out = "{";
    bool first = true;
    for (auto& [key, value] : entries_) {
        if (!first) out += ",";
        first = false;
        out += "\"" + escapeString(key) + "\":";

        // Determine if value looks numeric, boolean, or null
        bool is_number = false;
        bool is_bool_or_null = (value == "true" || value == "false" || value.empty());
        if (!is_bool_or_null && !value.empty()) {
            // Check if value is a valid number
            const char* p = value.c_str();
            if (*p == '-') ++p;
            bool has_digit = false;
            bool has_dot = false;
            while (*p) {
                if (*p >= '0' && *p <= '9') { has_digit = true; ++p; }
                else if (*p == '.' && !has_dot) { has_dot = true; ++p; }
                else if ((*p == 'e' || *p == 'E') && has_digit) {
                    ++p;
                    if (*p == '+' || *p == '-') ++p;
                }
                else break;
            }
            is_number = has_digit && (*p == '\0');
        }

        // Check if value is a raw JSON object/array
        bool is_raw_json = (!value.empty() && (value[0] == '{' || value[0] == '['));

        if (is_number || is_raw_json) {
            out += value;
        } else if (value == "true") {
            out += "true";
        } else if (value == "false") {
            out += "false";
        } else if (value.empty()) {
            out += "null";
        } else {
            out += "\"" + escapeString(value) + "\"";
        }
    }
    out += "}";
    return out;
}

// ===========================================================================
// PipeServer implementation
// ===========================================================================

static constexpr DWORD PIPE_BUFFER_SIZE = 8192;
static constexpr DWORD PIPE_TIMEOUT_MS  = 5000;

#ifdef _WIN32
/// Create a SECURITY_ATTRIBUTES that restricts pipe access to the current user.
/// Uses an SDDL string: "D:(A;;GA;;;$USER_SID)" = allow Generic All to current user.
/// Returns true on success; caller must free with LocalFree(sa.lpSecurityDescriptor).
static bool createCurrentUserSecurityAttributes(SECURITY_ATTRIBUTES& sa) {
    // Get the current user's SID
    HANDLE token = INVALID_HANDLE_VALUE;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
        return false;
    }

    DWORD needed = 0;
    GetTokenInformation(token, TokenUser, nullptr, 0, &needed);
    std::vector<uint8_t> buf(needed);
    if (!GetTokenInformation(token, TokenUser, buf.data(), needed, &needed)) {
        CloseHandle(token);
        return false;
    }
    CloseHandle(token);

    TOKEN_USER* pTokenUser = reinterpret_cast<TOKEN_USER*>(buf.data());
    LPSTR sidString = nullptr;
    if (!ConvertSidToStringSidA(pTokenUser->User.Sid, &sidString)) {
        return false;
    }

    // Build SDDL: grant Generic All to the current user only
    std::string sddl = std::string("D:(A;;GA;;;") + sidString + ")";
    LocalFree(sidString);

    PSECURITY_DESCRIPTOR pSD = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorA(
            sddl.c_str(), SDDL_REVISION_1, &pSD, nullptr)) {
        return false;
    }

    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.lpSecurityDescriptor = pSD;
    sa.bInheritHandle = FALSE;

    return true;
}
#endif

PipeServer::PipeServer(const std::string& pipe_name)
    : pipe_name_(pipe_name)
{
    full_pipe_path_ = "\\\\.\\pipe\\" + pipe_name;
}

PipeServer::~PipeServer() {
    stop();
}

void PipeServer::setHandler(PipeCommandHandler handler) {
    handler_ = std::move(handler);
}

bool PipeServer::start() {
    if (running_.load()) {
        CS_LOG(WARN, "Pipe server already running");
        return false;
    }

    // Create overlapped event for cancellable ConnectNamedPipe
    overlap_event_ = CreateEventA(nullptr, TRUE, FALSE, nullptr);
    if (overlap_event_ == INVALID_HANDLE_VALUE || overlap_event_ == nullptr) {
        CS_LOG(ERR, "CreateEvent failed: %lu", GetLastError());
        return false;
    }

    stop_flag_.store(false);
    running_.store(true);

    thread_ = std::thread(&PipeServer::serverThread, this);

    CS_LOG(INFO, "Pipe server started on %s", full_pipe_path_.c_str());
    return true;
}

void PipeServer::stop() {
    if (!running_.load()) return;

    CS_LOG(INFO, "Stopping pipe server...");
    stop_flag_.store(true);

    // Signal the overlapped event to unblock ConnectNamedPipe
    if (overlap_event_ != INVALID_HANDLE_VALUE) {
        SetEvent(overlap_event_);
    }

    // Close the pipe to wake up any blocked reads
    if (pipe_handle_ != INVALID_HANDLE_VALUE) {
        CancelIoEx(pipe_handle_, nullptr);
        DisconnectNamedPipe(pipe_handle_);
        CloseHandle(pipe_handle_);
        pipe_handle_ = INVALID_HANDLE_VALUE;
    }

    // Join the thread
    if (thread_.joinable()) {
        thread_.join();
    }

    if (overlap_event_ != INVALID_HANDLE_VALUE) {
        CloseHandle(overlap_event_);
        overlap_event_ = INVALID_HANDLE_VALUE;
    }

    running_.store(false);
    CS_LOG(INFO, "Pipe server stopped");
}

bool PipeServer::createPipeInstance() {
    // Create security attributes restricting access to the current user.
    SECURITY_ATTRIBUTES sa = {};
    PSECURITY_DESCRIPTOR pSD = nullptr;
    SECURITY_ATTRIBUTES* pSA = nullptr;

    if (createCurrentUserSecurityAttributes(sa)) {
        pSA = &sa;
        pSD = sa.lpSecurityDescriptor;
    } else {
        CS_LOG(WARN, "Failed to create pipe security descriptor, "
                      "falling back to default (error=%lu)", GetLastError());
    }

    pipe_handle_ = CreateNamedPipeA(
        full_pipe_path_.c_str(),
        PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
        PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
        1,                    // max instances
        PIPE_BUFFER_SIZE,     // output buffer size
        PIPE_BUFFER_SIZE,     // input buffer size
        PIPE_TIMEOUT_MS,      // default timeout
        pSA);                 // current-user-only security

    // Free the security descriptor (pipe keeps a copy internally)
    if (pSD) {
        LocalFree(pSD);
    }

    if (pipe_handle_ == INVALID_HANDLE_VALUE) {
        CS_LOG(ERR, "CreateNamedPipe failed: %lu", GetLastError());
        return false;
    }
    return true;
}

void PipeServer::serverThread() {
    CS_LOG(DEBUG, "Pipe server thread started");

    while (!stop_flag_.load()) {
        // Create a new pipe instance for each client connection
        if (!createPipeInstance()) {
            CS_LOG(ERR, "Failed to create pipe instance, retrying in 1s");
            Sleep(1000);
            continue;
        }

        // Wait for a client to connect using overlapped I/O
        OVERLAPPED overlap = {};
        overlap.hEvent = overlap_event_;
        ResetEvent(overlap_event_);

        BOOL connected = ConnectNamedPipe(pipe_handle_, &overlap);
        DWORD err = GetLastError();

        if (!connected) {
            if (err == ERROR_IO_PENDING) {
                // Wait for connection or stop signal
                DWORD wait = WaitForSingleObject(overlap_event_, INFINITE);
                if (stop_flag_.load()) {
                    CloseHandle(pipe_handle_);
                    pipe_handle_ = INVALID_HANDLE_VALUE;
                    break;
                }
                if (wait != WAIT_OBJECT_0) {
                    CS_LOG(WARN, "WaitForSingleObject returned %lu", wait);
                    CloseHandle(pipe_handle_);
                    pipe_handle_ = INVALID_HANDLE_VALUE;
                    continue;
                }
                // Check if ConnectNamedPipe completed successfully
                DWORD bytes_transferred = 0;
                if (!GetOverlappedResult(pipe_handle_, &overlap,
                                          &bytes_transferred, FALSE)) {
                    DWORD ovr_err = GetLastError();
                    if (ovr_err != ERROR_PIPE_CONNECTED) {
                        CS_LOG(WARN, "GetOverlappedResult error: %lu", ovr_err);
                        CloseHandle(pipe_handle_);
                        pipe_handle_ = INVALID_HANDLE_VALUE;
                        continue;
                    }
                }
            } else if (err == ERROR_PIPE_CONNECTED) {
                // Client connected between CreateNamedPipe and ConnectNamedPipe
                // This is fine, proceed.
            } else {
                CS_LOG(ERR, "ConnectNamedPipe error: %lu", err);
                CloseHandle(pipe_handle_);
                pipe_handle_ = INVALID_HANDLE_VALUE;
                continue;
            }
        }

        if (stop_flag_.load()) {
            CloseHandle(pipe_handle_);
            pipe_handle_ = INVALID_HANDLE_VALUE;
            break;
        }

        CS_LOG(INFO, "Client connected to pipe");

        // Handle this client (blocking, one at a time)
        handleClient();

        // Disconnect and close pipe for next client
        DisconnectNamedPipe(pipe_handle_);
        CloseHandle(pipe_handle_);
        pipe_handle_ = INVALID_HANDLE_VALUE;

        CS_LOG(INFO, "Client disconnected");
    }

    CS_LOG(DEBUG, "Pipe server thread exiting");
}

void PipeServer::handleClient() {
    std::string buffer;
    buffer.reserve(PIPE_BUFFER_SIZE);

    char read_buf[PIPE_BUFFER_SIZE];

    while (!stop_flag_.load()) {
        DWORD bytes_read = 0;
        BOOL ok = ReadFile(pipe_handle_, read_buf, sizeof(read_buf) - 1,
                           &bytes_read, nullptr);

        if (!ok || bytes_read == 0) {
            DWORD err = GetLastError();
            if (err == ERROR_BROKEN_PIPE || err == ERROR_NO_DATA) {
                CS_LOG(DEBUG, "Pipe client disconnected (error %lu)", err);
                return;
            }
            if (err == ERROR_OPERATION_ABORTED) {
                // Cancelled by stop()
                return;
            }
            CS_LOG(WARN, "ReadFile error: %lu", err);
            return;
        }

        // Append received data to buffer
        buffer.append(read_buf, bytes_read);

        // Process complete newline-delimited messages
        size_t newline_pos;
        while ((newline_pos = buffer.find('\n')) != std::string::npos) {
            std::string message = buffer.substr(0, newline_pos);
            buffer.erase(0, newline_pos + 1);

            // Trim trailing \r if present
            if (!message.empty() && message.back() == '\r') {
                message.pop_back();
            }

            if (message.empty()) continue;

            CS_LOG(DEBUG, "Pipe recv: %s", message.c_str());

            // Process and send response
            std::string response = processMessage(message);
            response += "\n";

            DWORD bytes_written = 0;
            WriteFile(pipe_handle_, response.c_str(),
                      static_cast<DWORD>(response.size()),
                      &bytes_written, nullptr);
            FlushFileBuffers(pipe_handle_);

            CS_LOG(DEBUG, "Pipe send: %s", response.c_str());
        }
    }
}

std::string PipeServer::processMessage(const std::string& message) {
    // Parse the JSON message
    SimpleJson json;
    if (!json.parse(message)) {
        return makeErrorResponse("Invalid JSON");
    }

    // Extract command name
    std::string command = json.getString("command");
    if (command.empty()) {
        // Try "cmd" as alternate key
        command = json.getString("cmd");
    }
    if (command.empty()) {
        return makeErrorResponse("Missing 'command' field");
    }

    // Dispatch to handler
    if (!handler_) {
        return makeErrorResponse("No command handler registered");
    }

    try {
        return handler_(command, json);
    } catch (const std::exception& e) {
        CS_LOG(ERR, "Handler exception for '%s': %s", command.c_str(), e.what());
        return makeErrorResponse(std::string("Handler error: ") + e.what());
    } catch (...) {
        CS_LOG(ERR, "Unknown handler exception for '%s'", command.c_str());
        return makeErrorResponse("Unknown handler error");
    }
}

} // namespace cs::host
