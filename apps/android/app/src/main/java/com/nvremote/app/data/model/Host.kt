package com.nvremote.app.data.model

import com.google.gson.annotations.SerializedName

/**
 * Represents an NVRemote host machine that can stream games.
 */
data class Host(
    @SerializedName("id")
    val id: String,

    @SerializedName("name")
    val name: String,

    @SerializedName("ip_address")
    val ipAddress: String,

    @SerializedName("port")
    val port: Int = 47984,

    @SerializedName("status")
    val status: HostStatus = HostStatus.OFFLINE,

    @SerializedName("gpu_name")
    val gpuName: String = "Unknown GPU",

    @SerializedName("gpu_driver_version")
    val gpuDriverVersion: String = "",

    @SerializedName("os")
    val os: String = "",

    @SerializedName("hostname")
    val hostname: String = "",

    @SerializedName("supported_codecs")
    val supportedCodecs: List<String> = emptyList(),

    @SerializedName("max_resolution_width")
    val maxResolutionWidth: Int = 1920,

    @SerializedName("max_resolution_height")
    val maxResolutionHeight: Int = 1080,

    @SerializedName("max_fps")
    val maxFps: Int = 60,

    @SerializedName("ping_ms")
    val pingMs: Int = -1,

    @SerializedName("last_seen")
    val lastSeen: Long = 0L,

    @SerializedName("is_paired")
    val isPaired: Boolean = false,
)

enum class HostStatus {
    @SerializedName("online")
    ONLINE,

    @SerializedName("offline")
    OFFLINE,

    @SerializedName("busy")
    BUSY,

    @SerializedName("streaming")
    STREAMING,
}

/**
 * Lightweight host info for list display.
 */
data class HostSummary(
    val id: String,
    val name: String,
    val status: HostStatus,
    val gpuName: String,
    val pingMs: Int,
)

fun Host.toSummary() = HostSummary(
    id = id,
    name = name,
    status = status,
    gpuName = gpuName,
    pingMs = pingMs,
)
