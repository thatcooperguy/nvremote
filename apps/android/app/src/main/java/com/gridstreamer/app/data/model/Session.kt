package com.gridstreamer.app.data.model

import com.google.gson.annotations.SerializedName

/**
 * Represents an active streaming session between client and host.
 */
data class Session(
    @SerializedName("session_id")
    val sessionId: String,

    @SerializedName("host_id")
    val hostId: String,

    @SerializedName("client_id")
    val clientId: String,

    @SerializedName("state")
    val state: SessionState = SessionState.INITIALIZING,

    @SerializedName("stream_config")
    val streamConfig: StreamConfig,

    @SerializedName("signaling_url")
    val signalingUrl: String,

    @SerializedName("stun_servers")
    val stunServers: List<String> = listOf("stun:stun.l.google.com:19302"),

    @SerializedName("dtls_fingerprint")
    val dtlsFingerprint: String = "",

    @SerializedName("created_at")
    val createdAt: Long = System.currentTimeMillis(),
)

enum class SessionState {
    @SerializedName("initializing")
    INITIALIZING,

    @SerializedName("signaling")
    SIGNALING,

    @SerializedName("connecting")
    CONNECTING,

    @SerializedName("streaming")
    STREAMING,

    @SerializedName("paused")
    PAUSED,

    @SerializedName("disconnected")
    DISCONNECTED,

    @SerializedName("error")
    ERROR,
}

/**
 * Configuration for stream quality and encoding.
 */
data class StreamConfig(
    @SerializedName("codec")
    val codec: VideoCodec = VideoCodec.H265,

    @SerializedName("width")
    val width: Int = 1920,

    @SerializedName("height")
    val height: Int = 1080,

    @SerializedName("fps")
    val fps: Int = 60,

    @SerializedName("bitrate_kbps")
    val bitrateKbps: Int = 20000,

    @SerializedName("audio_enabled")
    val audioEnabled: Boolean = true,

    @SerializedName("audio_codec")
    val audioCodec: String = "opus",

    @SerializedName("audio_bitrate_kbps")
    val audioBitrateKbps: Int = 128,
)

enum class VideoCodec(val mimeType: String) {
    @SerializedName("h264")
    H264("video/avc"),

    @SerializedName("h265")
    H265("video/hevc"),

    @SerializedName("av1")
    AV1("video/av01"),
}

/**
 * Request to create a new streaming session.
 */
data class SessionRequest(
    @SerializedName("host_id")
    val hostId: String,

    @SerializedName("stream_config")
    val streamConfig: StreamConfig,
)

/**
 * Authentication models.
 */
data class AuthRequest(
    @SerializedName("google_id_token")
    val googleIdToken: String,
)

data class AuthResponse(
    @SerializedName("access_token")
    val accessToken: String,

    @SerializedName("refresh_token")
    val refreshToken: String,

    @SerializedName("expires_in")
    val expiresIn: Long,

    @SerializedName("user")
    val user: User,
)

data class RefreshTokenRequest(
    @SerializedName("refresh_token")
    val refreshToken: String,
)

data class User(
    @SerializedName("id")
    val id: String,

    @SerializedName("email")
    val email: String,

    @SerializedName("display_name")
    val displayName: String,

    @SerializedName("avatar_url")
    val avatarUrl: String? = null,
)

/**
 * Gaming mode presets.
 */
enum class GamingMode {
    COMPETITIVE,  // Low latency: 1080p, 120fps, 30Mbps, prefer H264
    BALANCED,     // Balanced:    1080p, 60fps, 20Mbps, prefer H265
    CINEMATIC,    // High quality: 4K, 60fps, 50Mbps, prefer H265/AV1
}

fun GamingMode.toStreamConfig(): StreamConfig = when (this) {
    GamingMode.COMPETITIVE -> StreamConfig(
        codec = VideoCodec.H264,
        width = 1920,
        height = 1080,
        fps = 120,
        bitrateKbps = 30000,
    )
    GamingMode.BALANCED -> StreamConfig(
        codec = VideoCodec.H265,
        width = 1920,
        height = 1080,
        fps = 60,
        bitrateKbps = 20000,
    )
    GamingMode.CINEMATIC -> StreamConfig(
        codec = VideoCodec.H265,
        width = 3840,
        height = 2160,
        fps = 60,
        bitrateKbps = 50000,
    )
}
