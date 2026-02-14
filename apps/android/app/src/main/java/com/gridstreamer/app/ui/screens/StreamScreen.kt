package com.gridstreamer.app.ui.screens

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
import com.gridstreamer.app.data.model.SessionState
import com.gridstreamer.app.ui.components.StatsOverlay
import com.gridstreamer.app.ui.theme.CsBlack
import com.gridstreamer.app.ui.theme.CsGreen
import com.gridstreamer.app.ui.theme.CsOnSurfaceDim
import com.gridstreamer.app.ui.theme.OverlayBackground
import com.gridstreamer.app.ui.viewmodel.SessionViewModel

@Composable
fun StreamScreen(
    sessionId: String,
    onDisconnect: () -> Unit,
    viewModel: SessionViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var showControls by remember { mutableStateOf(true) }

    LaunchedEffect(sessionId) {
        viewModel.loadSession(sessionId)
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
        // Placeholder for video surface — actual WebRTC rendering deferred
        val session = uiState.session
        when (session?.state) {
            SessionState.INITIALIZING,
            SessionState.SIGNALING,
            SessionState.CONNECTING,
            -> {
                ConnectingOverlay(state = session.state)
            }

            SessionState.STREAMING -> {
                // Video surface will go here
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Stream Active",
                        style = MaterialTheme.typography.headlineMedium,
                        color = CsGreen,
                    )
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
                            text = uiState.error ?: "Connection lost",
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

        // Stats overlay (top-left)
        if (uiState.showStatsOverlay) {
            StatsOverlay(
                stats = uiState.streamStats,
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
