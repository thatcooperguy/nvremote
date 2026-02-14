package com.gridstreamer.app.data.model

/**
 * Real-time statistics for the active stream.
 */
data class StreamStats(
    /** Round-trip latency in milliseconds. */
    val latencyMs: Float = 0f,

    /** Decode latency in milliseconds. */
    val decodeTimeMs: Float = 0f,

    /** Network jitter in milliseconds. */
    val jitterMs: Float = 0f,

    /** Current frames per second being rendered. */
    val fps: Float = 0f,

    /** Current receive bitrate in kbps. */
    val bitrateKbps: Float = 0f,

    /** Packet loss percentage (0-100). */
    val packetLossPercent: Float = 0f,

    /** Total packets received. */
    val packetsReceived: Long = 0L,

    /** Total packets lost. */
    val packetsLost: Long = 0L,

    /** Total frames decoded. */
    val framesDecoded: Long = 0L,

    /** Total frames dropped. */
    val framesDropped: Long = 0L,

    /** Current video codec in use. */
    val codec: String = "",

    /** Current stream resolution. */
    val resolutionWidth: Int = 0,
    val resolutionHeight: Int = 0,

    /** Timestamp when these stats were captured. */
    val timestampMs: Long = System.currentTimeMillis(),
) {
    val resolution: String
        get() = "${resolutionWidth}x${resolutionHeight}"

    val formattedLatency: String
        get() = "%.1f ms".format(latencyMs)

    val formattedFps: String
        get() = "%.0f".format(fps)

    val formattedBitrate: String
        get() = if (bitrateKbps >= 1000) {
            "%.1f Mbps".format(bitrateKbps / 1000f)
        } else {
            "%.0f kbps".format(bitrateKbps)
        }

    val formattedPacketLoss: String
        get() = "%.2f%%".format(packetLossPercent)
}

/**
 * Input event types sent from client to host.
 */
sealed class InputEvent {
    data class GamepadState(
        val leftStickX: Float = 0f,    // -1.0 to 1.0
        val leftStickY: Float = 0f,    // -1.0 to 1.0
        val rightStickX: Float = 0f,   // -1.0 to 1.0
        val rightStickY: Float = 0f,   // -1.0 to 1.0
        val leftTrigger: Float = 0f,   // 0.0 to 1.0
        val rightTrigger: Float = 0f,  // 0.0 to 1.0
        val buttons: Int = 0,          // Bitmask of pressed buttons
        val dpadDirection: DpadDirection = DpadDirection.NONE,
        val timestamp: Long = System.currentTimeMillis(),
    ) : InputEvent()

    data class MouseMove(
        val deltaX: Float,
        val deltaY: Float,
        val timestamp: Long = System.currentTimeMillis(),
    ) : InputEvent()

    data class MouseClick(
        val button: MouseButton,
        val pressed: Boolean,
        val timestamp: Long = System.currentTimeMillis(),
    ) : InputEvent()

    data class MouseScroll(
        val deltaX: Float,
        val deltaY: Float,
        val timestamp: Long = System.currentTimeMillis(),
    ) : InputEvent()

    data class KeyPress(
        val keyCode: Int,
        val pressed: Boolean,
        val modifiers: Int = 0,
        val timestamp: Long = System.currentTimeMillis(),
    ) : InputEvent()
}

enum class MouseButton(val value: Int) {
    LEFT(0),
    RIGHT(1),
    MIDDLE(2),
}

enum class DpadDirection(val value: Int) {
    NONE(0),
    UP(1),
    UP_RIGHT(2),
    RIGHT(3),
    DOWN_RIGHT(4),
    DOWN(5),
    DOWN_LEFT(6),
    LEFT(7),
    UP_LEFT(8),
}

/**
 * Gamepad button bitmask constants (Xbox layout).
 */
object GamepadButtons {
    const val A = 0x0001
    const val B = 0x0002
    const val X = 0x0004
    const val Y = 0x0008
    const val LB = 0x0010
    const val RB = 0x0020
    const val BACK = 0x0040    // Select
    const val START = 0x0080
    const val L3 = 0x0100     // Left stick click
    const val R3 = 0x0200     // Right stick click
}
