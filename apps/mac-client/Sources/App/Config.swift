// Config.swift — App configuration
// NVRemote macOS Client

import Foundation

/// Centralized application configuration. Values can be overridden by
/// environment variables or UserDefaults for development flexibility.
enum AppConfig {
    // MARK: - OAuth

    /// Google OAuth 2.0 client ID.
    /// Set this to your Google Cloud Console client ID for the macOS app.
    /// Can be overridden by the NVREMOTE_GOOGLE_CLIENT_ID environment variable.
    static var googleClientID: String {
        if let envValue = ProcessInfo.processInfo.environment["NVREMOTE_GOOGLE_CLIENT_ID"] {
            return envValue
        }
        return UserDefaults.standard.string(forKey: "google_client_id")
            ?? "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
    }

    // MARK: - Signaling Server

    /// WebSocket URL for the NVRemote signaling server.
    static var signalingServerURL: URL {
        let urlString = UserDefaults.standard.string(forKey: "signaling_url")
            ?? ProcessInfo.processInfo.environment["NVREMOTE_SIGNALING_URL"]
            ?? "wss://signal.nvremote.com/ws"
        return URL(string: urlString)!
    }

    // MARK: - STUN Servers

    /// List of STUN servers for NAT traversal.
    static var stunServers: [String] {
        let custom = UserDefaults.standard.string(forKey: "stun_server")
        if let custom, !custom.isEmpty {
            return [custom]
        }
        return [
            "stun.l.google.com:19302",
            "stun1.l.google.com:19302",
            "stun2.l.google.com:19302",
        ]
    }

    // MARK: - Video Defaults

    /// Default preferred codec.
    static var preferredCodec: CodecType {
        let codecString = UserDefaults.standard.string(forKey: "preferred_codec") ?? "h265"
        switch codecString {
        case "h264": return .h264
        case "av1":  return .av1
        default:     return .h265
        }
    }

    /// Default maximum bitrate in Mbps.
    static var maxBitrateMbps: Double {
        let value = UserDefaults.standard.double(forKey: "max_bitrate_mbps")
        return value > 0 ? value : 50.0
    }

    /// Whether to enable hardware-accelerated video decode.
    static var enableHardwareDecode: Bool {
        if UserDefaults.standard.object(forKey: "hw_decode") != nil {
            return UserDefaults.standard.bool(forKey: "hw_decode")
        }
        return true
    }

    // MARK: - Network Defaults

    /// Whether to enable DTLS encryption on the UDP transport.
    static var enableDTLS: Bool {
        if UserDefaults.standard.object(forKey: "enable_dtls") != nil {
            return UserDefaults.standard.bool(forKey: "enable_dtls")
        }
        return true
    }

    // MARK: - Audio Defaults

    /// Default audio volume (0.0 - 1.0).
    static var audioVolume: Float {
        let value = UserDefaults.standard.float(forKey: "audio_volume")
        return value > 0 ? value : 1.0
    }

    // MARK: - UI Defaults

    /// Whether to show the stats overlay when a stream starts.
    static var showStatsOverlayOnConnect: Bool {
        UserDefaults.standard.bool(forKey: "show_stats_overlay")
    }

    // MARK: - Debug

    /// Enable verbose logging.
    static var verboseLogging: Bool {
        ProcessInfo.processInfo.environment["NVREMOTE_VERBOSE"] == "1"
    }

    // MARK: - Version

    /// Application version string.
    static let version = "1.0.0"

    /// Build number.
    static let build = "1"

    /// Full version string for display.
    static var fullVersion: String {
        "\(version) (\(build))"
    }
}
