package com.nvremote.app.data.webrtc

import android.content.Context
import android.util.Log
import com.nvremote.app.BuildConfig
import com.nvremote.app.data.model.StreamStats
import com.nvremote.app.data.signaling.SignalingClient
import com.nvremote.app.data.signaling.SignalingEvent
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnection.IceConnectionState
import org.webrtc.PeerConnection.IceGatheringState
import org.webrtc.PeerConnection.IceServer
import org.webrtc.PeerConnection.SignalingState
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages the WebRTC peer connection for receiving video/audio streams.
 *
 * Lifecycle:
 *   1. [initialize] — create PeerConnectionFactory and EglBase (once per app launch)
 *   2. [startSession] — connect signaling, create PeerConnection, handle SDP/ICE exchange
 *   3. Observe [remoteVideoTrack] for the incoming video track
 *   4. Observe [connectionState] for connection lifecycle
 *   5. Observe [streamStats] for real-time metrics
 *   6. [endSession] — tear down peer connection and signaling
 */
@Singleton
class WebRtcManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val signalingClient: SignalingClient,
) {

    companion object {
        private const val TAG = "WebRtcManager"

        private val DEFAULT_STUN_SERVERS = listOf(
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
        )
    }

    // ── Public state ───────────────────────────────────────────────────

    private val _connectionState = MutableStateFlow(WebRtcConnectionState.IDLE)
    val connectionState: StateFlow<WebRtcConnectionState> = _connectionState.asStateFlow()

    private val _remoteVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteVideoTrack: StateFlow<VideoTrack?> = _remoteVideoTrack.asStateFlow()

    private val _streamStats = MutableStateFlow(StreamStats())
    val streamStats: StateFlow<StreamStats> = _streamStats.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    // ── EglBase (shared OpenGL context for decoding & rendering) ──────

    private var _eglBase: EglBase? = null
    val eglBase: EglBase
        get() = _eglBase ?: EglBase.create().also { _eglBase = it }

    // ── Internal state ─────────────────────────────────────────────────

    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var signalingJob: Job? = null
    private var statsJob: Job? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var initialized = false

    // ── Initialization ─────────────────────────────────────────────────

    /**
     * Initialize the WebRTC subsystem. Safe to call multiple times.
     */
    fun initialize() {
        if (initialized) return

        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions(),
        )

        val egl = eglBase

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
            .createPeerConnectionFactory()

        initialized = true
        if (BuildConfig.DEBUG) Log.d(TAG, "WebRTC initialized with hardware codec support")
    }

    // ── Session lifecycle ──────────────────────────────────────────────

    /**
     * TURN server configuration received from the API.
     */
    data class TurnServer(
        val urls: String,
        val username: String,
        val credential: String,
    )

    /**
     * Start a streaming session. Connects signaling, creates a PeerConnection,
     * and handles the SDP/ICE exchange.
     */
    fun startSession(
        signalingUrl: String,
        sessionId: String,
        accessToken: String,
        stunServers: List<String> = DEFAULT_STUN_SERVERS,
        turnServers: List<TurnServer> = emptyList(),
    ) {
        if (!initialized) initialize()

        _connectionState.value = WebRtcConnectionState.CONNECTING
        _error.value = null

        // Create PeerConnection with STUN servers
        val iceServers = stunServers.map { url ->
            IceServer.builder(url).createIceServer()
        }.toMutableList()

        // Add TURN servers with credentials for NAT traversal fallback
        for (turn in turnServers) {
            iceServers.add(
                IceServer.builder(turn.urls)
                    .setUsername(turn.username)
                    .setPassword(turn.credential)
                    .createIceServer(),
            )
            if (BuildConfig.DEBUG) Log.d(TAG, "Added TURN server: ${turn.urls}")
        }

        val config = PeerConnection.RTCConfiguration(iceServers).apply {
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(
            config,
            createPeerConnectionObserver(),
        )

        if (peerConnection == null) {
            _connectionState.value = WebRtcConnectionState.FAILED
            _error.value = "Failed to create PeerConnection"
            return
        }

        // Receive-only: add transceivers for video and audio
        peerConnection?.addTransceiver(
            org.webrtc.MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            org.webrtc.RtpTransceiver.RtpTransceiverInit(
                org.webrtc.RtpTransceiver.RtpTransceiverDirection.RECV_ONLY,
            ),
        )
        peerConnection?.addTransceiver(
            org.webrtc.MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
            org.webrtc.RtpTransceiver.RtpTransceiverInit(
                org.webrtc.RtpTransceiver.RtpTransceiverDirection.RECV_ONLY,
            ),
        )

        // Connect signaling and handle events
        signalingJob = scope.launch {
            signalingClient.connect(signalingUrl, sessionId, accessToken)
                .collect { event ->
                    handleSignalingEvent(event)

                    // Send client capabilities once connected
                    if (event is SignalingEvent.Connected) {
                        sendClientCapabilities(sessionId)
                    }
                }
        }
    }

    /**
     * Send the Android client's device capabilities to the signaling server
     * for the capability negotiation protocol (Phase 4).
     */
    @Suppress("DEPRECATION")
    private fun sendClientCapabilities(sessionId: String) {
        val displayMetrics = context.resources.displayMetrics
        val refreshRate = 60

        val decoders = mutableListOf("h264", "hevc")
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            decoders.add("av1")
        }

        val connectivityManager = context.getSystemService(
            android.content.Context.CONNECTIVITY_SERVICE,
        ) as? android.net.ConnectivityManager
        val networkType = when (connectivityManager?.activeNetworkInfo?.type) {
            android.net.ConnectivityManager.TYPE_WIFI -> "wifi"
            android.net.ConnectivityManager.TYPE_ETHERNET -> "ethernet"
            else -> "cellular"
        }

        signalingClient.sendClientCapabilities(
            sessionId = sessionId,
            displayWidth = displayMetrics.widthPixels,
            displayHeight = displayMetrics.heightPixels,
            refreshRate = refreshRate,
            decoders = decoders,
            networkType = networkType,
        )

        if (BuildConfig.DEBUG) Log.d(TAG, "Sent client capabilities: ${displayMetrics.widthPixels}x${displayMetrics.heightPixels}, decoders=$decoders, network=$networkType")
    }

    /**
     * Request a streaming profile change via signaling.
     * The profile change is relayed to the host agent which applies it to the QoS engine.
     */
    fun requestProfileChange(sessionId: String, profile: String) {
        if (BuildConfig.DEBUG) Log.d(TAG, "Requesting profile change: $profile for session $sessionId")
        signalingClient.requestProfileChange(sessionId, profile)
    }

    /**
     * End the current session and release all resources.
     */
    fun endSession() {
        if (BuildConfig.DEBUG) Log.d(TAG, "Ending session")

        signalingJob?.cancel()
        signalingJob = null
        statsJob?.cancel()
        statsJob = null

        _remoteVideoTrack.value?.setEnabled(false)
        _remoteVideoTrack.value = null

        peerConnection?.close()
        peerConnection?.dispose()
        peerConnection = null

        signalingClient.disconnect()

        _connectionState.value = WebRtcConnectionState.IDLE
        _streamStats.value = StreamStats()
    }

    /**
     * Release all resources when the app is being destroyed.
     */
    fun release() {
        endSession()
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        _eglBase?.release()
        _eglBase = null
        initialized = false
    }

    // ── Signaling event handler ────────────────────────────────────────

    private fun handleSignalingEvent(event: SignalingEvent) {
        when (event) {
            is SignalingEvent.Connected -> {
                if (BuildConfig.DEBUG) Log.d(TAG, "Signaling connected")
            }

            is SignalingEvent.SessionReady -> {
                if (BuildConfig.DEBUG) Log.d(TAG, "Session ready — waiting for SDP offer from host")
            }

            is SignalingEvent.SdpOffer -> {
                if (BuildConfig.DEBUG) Log.d(TAG, "Received SDP offer, setting remote description")
                val sdp = SessionDescription(SessionDescription.Type.OFFER, event.sdp)
                peerConnection?.setRemoteDescription(object : SdpObserverAdapter("setRemote") {
                    override fun onSetSuccess() {
                        super.onSetSuccess()
                        createAnswer()
                    }
                }, sdp)
            }

            is SignalingEvent.IceCandidate -> {
                if (BuildConfig.DEBUG) Log.d(TAG, "Received remote ICE candidate")
                val candidate = IceCandidate(
                    event.sdpMid,
                    event.sdpMLineIndex,
                    event.candidate,
                )
                peerConnection?.addIceCandidate(candidate)
            }

            is SignalingEvent.SessionStateChanged -> {
                if (BuildConfig.DEBUG) Log.d(TAG, "Session state changed: ${event.state}")
            }

            is SignalingEvent.HostDisconnected -> {
                Log.w(TAG, "Host disconnected")
                _connectionState.value = WebRtcConnectionState.DISCONNECTED
                _error.value = "Host disconnected"
            }

            is SignalingEvent.Error -> {
                Log.e(TAG, "Signaling error: ${event.message}")
                _error.value = event.message
                _connectionState.value = WebRtcConnectionState.FAILED
            }

            is SignalingEvent.Disconnected -> {
                if (BuildConfig.DEBUG) Log.d(TAG, "Signaling disconnected: ${event.reason}")
                if (_connectionState.value == WebRtcConnectionState.STREAMING) {
                    // Lost signaling while streaming — the P2P connection may still be alive
                    Log.w(TAG, "Lost signaling during stream, P2P may still be active")
                }
            }
        }
    }

    // ── SDP answer creation ────────────────────────────────────────────

    private fun createAnswer() {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
        }

        peerConnection?.createAnswer(object : SdpObserverAdapter("createAnswer") {
            override fun onCreateSuccess(sdp: SessionDescription) {
                super.onCreateSuccess(sdp)
                peerConnection?.setLocalDescription(
                    SdpObserverAdapter("setLocal"),
                    sdp,
                )
                // Send answer to host via signaling
                signalingClient.sendAnswer(sdp.description)
                if (BuildConfig.DEBUG) Log.d(TAG, "Sent SDP answer to host")
            }
        }, constraints)
    }

    // ── PeerConnection observer ────────────────────────────────────────

    private fun createPeerConnectionObserver() = object : PeerConnection.Observer {
        override fun onSignalingChange(state: SignalingState) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Signaling state: $state")
        }

        override fun onIceConnectionChange(state: IceConnectionState) {
            if (BuildConfig.DEBUG) Log.d(TAG, "ICE connection state: $state")
            when (state) {
                IceConnectionState.CONNECTED, IceConnectionState.COMPLETED -> {
                    _connectionState.value = WebRtcConnectionState.STREAMING
                    startStatsPolling()
                }
                IceConnectionState.DISCONNECTED -> {
                    _connectionState.value = WebRtcConnectionState.DISCONNECTED
                }
                IceConnectionState.FAILED -> {
                    _connectionState.value = WebRtcConnectionState.FAILED
                    _error.value = "ICE connection failed"
                }
                IceConnectionState.CLOSED -> {
                    _connectionState.value = WebRtcConnectionState.IDLE
                }
                else -> {}
            }
        }

        override fun onIceConnectionReceivingChange(receiving: Boolean) {
            if (BuildConfig.DEBUG) Log.d(TAG, "ICE receiving: $receiving")
        }

        override fun onIceGatheringChange(state: IceGatheringState) {
            if (BuildConfig.DEBUG) Log.d(TAG, "ICE gathering state: $state")
        }

        override fun onIceCandidate(candidate: IceCandidate) {
            // Send our ICE candidates to the host via signaling
            if (BuildConfig.DEBUG) Log.d(TAG, "Sending local ICE candidate")
            signalingClient.sendIceCandidate(
                candidate.sdp,
                candidate.sdpMid,
                candidate.sdpMLineIndex,
            )
        }

        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {
            if (BuildConfig.DEBUG) Log.d(TAG, "ICE candidates removed: ${candidates.size}")
        }

        override fun onAddStream(stream: MediaStream) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Remote stream added: ${stream.videoTracks.size} video, ${stream.audioTracks.size} audio")
            if (stream.videoTracks.isNotEmpty()) {
                val videoTrack = stream.videoTracks[0]
                videoTrack.setEnabled(true)
                _remoteVideoTrack.value = videoTrack
                if (BuildConfig.DEBUG) Log.d(TAG, "Remote video track attached")
            }
        }

        override fun onRemoveStream(stream: MediaStream) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Remote stream removed")
            _remoteVideoTrack.value = null
        }

        override fun onDataChannel(channel: DataChannel) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Data channel received: ${channel.label()}")
            // Could be used for input forwarding in the future
        }

        override fun onRenegotiationNeeded() {
            if (BuildConfig.DEBUG) Log.d(TAG, "Renegotiation needed")
        }

        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Track added: ${receiver.track()?.kind()}")
            val track = receiver.track()
            if (track is VideoTrack) {
                track.setEnabled(true)
                _remoteVideoTrack.value = track
                if (BuildConfig.DEBUG) Log.d(TAG, "Remote video track received via onAddTrack")
            }
        }
    }

    // ── Stats polling ──────────────────────────────────────────────────

    private fun startStatsPolling() {
        statsJob?.cancel()
        statsJob = scope.launch {
            while (isActive && _connectionState.value == WebRtcConnectionState.STREAMING) {
                peerConnection?.getStats { report ->
                    var fps = 0f
                    var bitrateKbps = 0f
                    var packetsReceived = 0L
                    var packetsLost = 0L
                    var framesDecoded = 0L
                    var framesDropped = 0L
                    var jitterMs = 0f
                    var codec = ""
                    var width = 0
                    var height = 0

                    for (stats in report.statsMap.values) {
                        when (stats.type) {
                            "inbound-rtp" -> {
                                val members = stats.members
                                if (members["kind"] == "video") {
                                    framesDecoded = (members["framesDecoded"] as? Number)?.toLong() ?: 0L
                                    framesDropped = (members["framesDropped"] as? Number)?.toLong() ?: 0L
                                    packetsReceived = (members["packetsReceived"] as? Number)?.toLong() ?: 0L
                                    packetsLost = (members["packetsLost"] as? Number)?.toLong() ?: 0L
                                    jitterMs = ((members["jitter"] as? Number)?.toFloat() ?: 0f) * 1000f
                                    fps = (members["framesPerSecond"] as? Number)?.toFloat() ?: 0f
                                    bitrateKbps = ((members["bytesReceived"] as? Number)?.toLong() ?: 0L).toFloat() / 125f
                                    width = (members["frameWidth"] as? Number)?.toInt() ?: 0
                                    height = (members["frameHeight"] as? Number)?.toInt() ?: 0
                                }
                            }
                            "codec" -> {
                                val mimeType = stats.members["mimeType"] as? String ?: ""
                                if (mimeType.startsWith("video/")) {
                                    codec = mimeType.removePrefix("video/")
                                }
                            }
                        }
                    }

                    val totalPackets = packetsReceived + packetsLost
                    val lossPercent = if (totalPackets > 0) {
                        (packetsLost.toFloat() / totalPackets) * 100f
                    } else {
                        0f
                    }

                    _streamStats.value = StreamStats(
                        fps = fps,
                        bitrateKbps = bitrateKbps,
                        packetsReceived = packetsReceived,
                        packetsLost = packetsLost,
                        packetLossPercent = lossPercent,
                        framesDecoded = framesDecoded,
                        framesDropped = framesDropped,
                        jitterMs = jitterMs,
                        codec = codec,
                        resolutionWidth = width,
                        resolutionHeight = height,
                    )
                }
                delay(1000L) // Poll every second
            }
        }
    }
}

// ── Connection state ───────────────────────────────────────────────────

enum class WebRtcConnectionState {
    IDLE,
    CONNECTING,
    STREAMING,
    DISCONNECTED,
    FAILED,
}

// ── SDP observer helper ────────────────────────────────────────────────

private open class SdpObserverAdapter(private val label: String) : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {
        if (BuildConfig.DEBUG) Log.d("SdpObserver", "$label onCreateSuccess")
    }

    override fun onSetSuccess() {
        if (BuildConfig.DEBUG) Log.d("SdpObserver", "$label onSetSuccess")
    }

    override fun onCreateFailure(error: String) {
        Log.e("SdpObserver", "$label onCreateFailure: $error")
    }

    override fun onSetFailure(error: String) {
        Log.e("SdpObserver", "$label onSetFailure: $error")
    }
}
