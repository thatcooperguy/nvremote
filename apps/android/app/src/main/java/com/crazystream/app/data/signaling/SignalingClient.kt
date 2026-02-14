package com.crazystream.app.data.signaling

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import org.json.JSONObject
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Socket.IO signaling client — mirrors the desktop client's p2p.ts signaling logic.
 *
 * Lifecycle:
 *   1. connect(signalingUrl, sessionId, accessToken)
 *   2. Observe [events] flow for ICE candidates, SDP offers/answers, session state changes
 *   3. Call sendAnswer / sendIceCandidate to relay back
 *   4. disconnect() when done
 */
@Singleton
class SignalingClient @Inject constructor() {

    companion object {
        private const val TAG = "SignalingClient"
        private const val NAMESPACE = "/signaling"
    }

    private var socket: Socket? = null

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    /**
     * Connect to the signaling server.
     */
    fun connect(signalingUrl: String, sessionId: String, accessToken: String): Flow<SignalingEvent> =
        callbackFlow {
            val opts = IO.Options().apply {
                path = NAMESPACE
                auth = mapOf(
                    "token" to accessToken,
                    "sessionId" to sessionId,
                )
                reconnection = true
                reconnectionAttempts = 5
                reconnectionDelay = 1000
                timeout = 10000
            }

            val uri = URI.create(signalingUrl)
            socket = IO.socket(uri, opts)

            socket?.apply {
                on(Socket.EVENT_CONNECT) {
                    Log.d(TAG, "Connected to signaling server")
                    _connectionState.value = ConnectionState.CONNECTED
                    trySend(SignalingEvent.Connected)

                    // Request to join the session
                    emit("session:join", JSONObject().apply {
                        put("sessionId", sessionId)
                    })
                }

                on(Socket.EVENT_DISCONNECT) { args ->
                    val reason = args.firstOrNull()?.toString() ?: "unknown"
                    Log.d(TAG, "Disconnected: $reason")
                    _connectionState.value = ConnectionState.DISCONNECTED
                    trySend(SignalingEvent.Disconnected(reason))
                }

                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    val error = args.firstOrNull()?.toString() ?: "Connection error"
                    Log.e(TAG, "Connection error: $error")
                    _connectionState.value = ConnectionState.ERROR
                    trySend(SignalingEvent.Error(error))
                }

                on("session:ready") { args ->
                    Log.d(TAG, "Session ready")
                    trySend(SignalingEvent.SessionReady)
                }

                on("sdp:offer") { args ->
                    val data = args.firstOrNull() as? JSONObject ?: return@on
                    val sdp = data.optString("sdp", "")
                    val type = data.optString("type", "offer")
                    Log.d(TAG, "Received SDP offer")
                    trySend(SignalingEvent.SdpOffer(sdp = sdp, type = type))
                }

                on("ice:candidate") { args ->
                    val data = args.firstOrNull() as? JSONObject ?: return@on
                    val candidate = data.optString("candidate", "")
                    val sdpMid = data.optString("sdpMid", "")
                    val sdpMLineIndex = data.optInt("sdpMLineIndex", 0)
                    Log.d(TAG, "Received ICE candidate")
                    trySend(
                        SignalingEvent.IceCandidate(
                            candidate = candidate,
                            sdpMid = sdpMid,
                            sdpMLineIndex = sdpMLineIndex,
                        ),
                    )
                }

                on("session:state") { args ->
                    val data = args.firstOrNull() as? JSONObject ?: return@on
                    val state = data.optString("state", "")
                    Log.d(TAG, "Session state: $state")
                    trySend(SignalingEvent.SessionStateChanged(state))
                }

                on("session:error") { args ->
                    val data = args.firstOrNull() as? JSONObject ?: return@on
                    val message = data.optString("message", "Unknown error")
                    Log.e(TAG, "Session error: $message")
                    trySend(SignalingEvent.Error(message))
                }

                on("host:disconnected") {
                    Log.w(TAG, "Host disconnected")
                    trySend(SignalingEvent.HostDisconnected)
                }

                connect()
            }

            awaitClose {
                disconnect()
            }
        }

    /**
     * Send SDP answer to the host via signaling server.
     */
    fun sendAnswer(sdp: String) {
        socket?.emit("sdp:answer", JSONObject().apply {
            put("sdp", sdp)
            put("type", "answer")
        })
    }

    /**
     * Send ICE candidate to the host via signaling server.
     */
    fun sendIceCandidate(candidate: String, sdpMid: String, sdpMLineIndex: Int) {
        socket?.emit("ice:candidate", JSONObject().apply {
            put("candidate", candidate)
            put("sdpMid", sdpMid)
            put("sdpMLineIndex", sdpMLineIndex)
        })
    }

    /**
     * Request session start.
     */
    fun requestSession(sessionId: String) {
        socket?.emit("session:request", JSONObject().apply {
            put("sessionId", sessionId)
        })
    }

    /**
     * Disconnect from signaling server.
     */
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
}

/**
 * Connection state of the signaling client.
 */
enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR,
}

/**
 * Events emitted by the signaling server.
 */
sealed class SignalingEvent {
    data object Connected : SignalingEvent()
    data class Disconnected(val reason: String) : SignalingEvent()
    data class Error(val message: String) : SignalingEvent()
    data object SessionReady : SignalingEvent()
    data class SdpOffer(val sdp: String, val type: String) : SignalingEvent()
    data class IceCandidate(
        val candidate: String,
        val sdpMid: String,
        val sdpMLineIndex: Int,
    ) : SignalingEvent()

    data class SessionStateChanged(val state: String) : SignalingEvent()
    data object HostDisconnected : SignalingEvent()
}
