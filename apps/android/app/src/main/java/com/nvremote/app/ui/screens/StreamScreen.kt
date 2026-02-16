package com.nvremote.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

/** Available streaming profiles */
private val STREAMING_PROFILES = listOf(
    "Competitive" to "Max FPS",
    "Balanced" to "Default",
    "Cinematic" to "Max quality",
    "Creative" to "Color-accurate",
    "CAD" to "Precision",
    "MobileSaver" to "Low bandwidth",
    "LAN" to "Same network",
)

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
    var showProfileMenu by remember { mutableStateOf(false) }
    var currentProfile by remember { mutableStateOf("Balanced") }

    LaunchedEffect(sessionId) {
        viewModel.loadSession(sessionId)
    }

    // Start WebRTC when session has signaling info
    val session = uiState.session
    LaunchedEffect(session?.signalingUrl, session?.sessionId) {
        val url = session?.signalingUrl ?: return@LaunchedEffect
        val sid = session.sessionId
        if (url.isNotBlank() && webRtcState == WebRtcConnectionState.IDLE) {
            val token = viewModel.getAccessToken()
            if (token == null) {
                // Token is null — the ViewModel has already set the error in uiState.
                // Do NOT start WebRTC with an empty/missing token; it will silently
                // fail signaling auth and never establish the P2P connection.
                return@LaunchedEffect
            }
            webRtcManager.startSession(
                signalingUrl = url,
                sessionId = sid,
                accessToken = token,
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
        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopEnd),
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // Profile selector button
                Box {
                    IconButton(
                        onClick = { showProfileMenu = !showProfileMenu },
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(OverlayBackground),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Streaming Profile",
                            tint = CsGreen,
                        )
                    }

                    DropdownMenu(
                        expanded = showProfileMenu,
                        onDismissRequest = { showProfileMenu = false },
                    ) {
                        STREAMING_PROFILES.forEach { (name, desc) ->
                            DropdownMenuItem(
                                text = {
                                    Column {
                                        Text(
                                            text = name,
                                            fontWeight = if (name == currentProfile) FontWeight.Bold else FontWeight.Normal,
                                            color = if (name == currentProfile) CsGreen else Color.Unspecified,
                                        )
                                        Text(
                                            text = desc,
                                            fontSize = 11.sp,
                                            color = CsOnSurfaceDim,
                                        )
                                    }
                                },
                                onClick = {
                                    currentProfile = name
                                    showProfileMenu = false
                                    webRtcManager.requestProfileChange(sessionId, name)
                                },
                            )
                        }
                    }
                }

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
