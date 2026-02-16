package com.nvremote.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nvremote.app.data.model.SessionState
import com.nvremote.app.data.webrtc.WebRtcConnectionState
import com.nvremote.app.data.webrtc.WebRtcManager
import com.nvremote.app.ui.components.StatsOverlay
import com.nvremote.app.ui.components.WebRtcSurfaceView
import com.nvremote.app.ui.theme.CsBlack
import com.nvremote.app.ui.theme.CsGreen
import com.nvremote.app.ui.theme.CsOnSurfaceDim
import com.nvremote.app.ui.theme.OverlayBackground
import com.nvremote.app.ui.viewmodel.SessionViewModel

@Composable
fun StreamScreen(
    sessionId: String,
    onDisconnect: () -> Unit,
    webRtcManager: WebRtcManager,
    viewModel: SessionViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val webRtcState by webRtcManager.connectionState.collectAsState()
    val remoteVideoTrack by webRtcManager.remoteVideoTrack.collectAsState()
    val webRtcStats by webRtcManager.streamStats.collectAsState()
    val webRtcError by webRtcManager.error.collectAsState()
    var showControls by remember { mutableStateOf(true) }

    LaunchedEffect(sessionId) {
        viewModel.loadSession(sessionId)
    }

    // Start WebRTC when session has signaling info
    val session = uiState.session
    LaunchedEffect(session?.signalingUrl, session?.sessionId) {
        val url = session?.signalingUrl ?: return@LaunchedEffect
        val sid = session.sessionId
        if (url.isNotBlank() && webRtcState == WebRtcConnectionState.IDLE) {
            webRtcManager.startSession(
                signalingUrl = url,
                sessionId = sid,
                accessToken = "", // TODO: pass from AuthRepository
                stunServers = session.stunServers,
            )
        }
    }

    // Clean up WebRTC when leaving the screen
    DisposableEffect(Unit) {
        onDispose {
            webRtcManager.endSession()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CsBlack)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) {
                showControls = !showControls
            },
    ) {
        // Determine effective state: prefer WebRTC state when actively connecting/streaming
        val effectiveState = when (webRtcState) {
            WebRtcConnectionState.STREAMING -> SessionState.STREAMING
            WebRtcConnectionState.CONNECTING -> SessionState.CONNECTING
            WebRtcConnectionState.FAILED -> SessionState.ERROR
            WebRtcConnectionState.DISCONNECTED -> SessionState.DISCONNECTED
            WebRtcConnectionState.IDLE -> session?.state ?: SessionState.INITIALIZING
        }

        when (effectiveState) {
            SessionState.INITIALIZING,
            SessionState.SIGNALING,
            SessionState.CONNECTING,
            -> {
                ConnectingOverlay(state = effectiveState)
            }

            SessionState.STREAMING -> {
                if (remoteVideoTrack != null) {
                    // Render the incoming video via hardware-accelerated WebRTC decoder
                    WebRtcSurfaceView(
                        videoTrack = remoteVideoTrack,
                        eglBase = webRtcManager.eglBase,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    // P2P connected but no video track yet
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                color = CsGreen,
                                modifier = Modifier.size(32.dp),
                            )
                            Text(
                                text = "Waiting for video...",
                                style = MaterialTheme.typography.bodyMedium,
                                color = CsOnSurfaceDim,
                            )
                        }
                    }
                }
            }

            SessionState.PAUSED -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Stream Paused",
                        style = MaterialTheme.typography.headlineMedium,
                        color = CsOnSurfaceDim,
                    )
                }
            }

            SessionState.DISCONNECTED -> {
                LaunchedEffect(Unit) {
                    onDisconnect()
                }
            }

            SessionState.ERROR -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = "Stream Error",
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Text(
                            text = webRtcError ?: uiState.error ?: "Connection lost",
                            style = MaterialTheme.typography.bodyMedium,
                            color = CsOnSurfaceDim,
                        )
                    }
                }
            }

            null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = CsGreen)
                }
            }
        }

        // Stats overlay (top-left) — use real WebRTC stats when streaming
        val displayStats = if (webRtcState == WebRtcConnectionState.STREAMING) {
            webRtcStats
        } else {
            uiState.streamStats
        }

        if (uiState.showStatsOverlay) {
            StatsOverlay(
                stats = displayStats,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp),
            )
        }

        // Controls overlay (top-right)
        if (showControls) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                IconButton(
                    onClick = { viewModel.toggleStatsOverlay() },
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(OverlayBackground),
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = "Toggle Stats",
                        tint = CsOnSurfaceDim,
                    )
                }

                IconButton(
                    onClick = {
                        webRtcManager.endSession()
                        viewModel.endSession()
                        onDisconnect()
                    },
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(OverlayBackground),
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Disconnect",
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}

@Composable
private fun ConnectingOverlay(state: SessionState) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircularProgressIndicator(
                color = CsGreen,
                modifier = Modifier.size(48.dp),
            )
            Text(
                text = when (state) {
                    SessionState.INITIALIZING -> "Initializing..."
                    SessionState.SIGNALING -> "Signaling..."
                    SessionState.CONNECTING -> "Connecting..."
                    else -> "Loading..."
                },
                style = MaterialTheme.typography.titleMedium,
                color = CsOnSurfaceDim,
            )
        }
    }
}
