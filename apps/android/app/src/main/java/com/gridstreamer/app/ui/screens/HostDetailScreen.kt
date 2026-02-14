package com.gridstreamer.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.gridstreamer.app.data.model.HostStatus
import com.gridstreamer.app.ui.components.GamingModeSelector
import com.gridstreamer.app.ui.components.StatusBadge
import com.gridstreamer.app.ui.theme.CsGreen
import com.gridstreamer.app.ui.theme.CsOnSurfaceDim
import com.gridstreamer.app.ui.theme.CsSurface
import com.gridstreamer.app.ui.theme.CsSurfaceElevated
import com.gridstreamer.app.ui.viewmodel.SessionViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HostDetailScreen(
    hostId: String,
    onSessionStarted: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: SessionViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(hostId) {
        viewModel.loadHost(hostId)
    }

    LaunchedEffect(uiState.session) {
        uiState.session?.let { session ->
            onSessionStarted(session.sessionId)
        }
    }

    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            scope.launch {
                snackbarHostState.showSnackbar(error)
                viewModel.clearError()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.host?.name ?: "Host Details",
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = CsSurface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = CsGreen)
                }
            }

            uiState.host != null -> {
                val host = uiState.host!!
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    // Host info card
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Computer,
                            contentDescription = null,
                            modifier = Modifier.size(56.dp),
                            tint = if (host.status == HostStatus.ONLINE) CsGreen else CsOnSurfaceDim,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = host.name,
                                style = MaterialTheme.typography.headlineSmall,
                            )
                            Text(
                                text = host.gpuName,
                                style = MaterialTheme.typography.bodyMedium,
                                color = CsOnSurfaceDim,
                            )
                        }
                        StatusBadge(status = host.status)
                    }

                    // Specs section
                    SectionTitle("System Information")
                    SpecsGrid(
                        items = listOfNotNull(
                            "GPU" to host.gpuName,
                            if (host.gpuDriverVersion.isNotEmpty()) "Driver" to host.gpuDriverVersion else null,
                            if (host.os.isNotEmpty()) "OS" to host.os else null,
                            if (host.hostname.isNotEmpty()) "Hostname" to host.hostname else null,
                            "Max Resolution" to "${host.maxResolutionWidth}x${host.maxResolutionHeight}",
                            "Max FPS" to "${host.maxFps}",
                            if (host.pingMs >= 0) "Latency" to "${host.pingMs}ms" else null,
                        ),
                    )

                    if (host.supportedCodecs.isNotEmpty()) {
                        SectionTitle("Supported Codecs")
                        Text(
                            text = host.supportedCodecs.joinToString(", "),
                            style = MaterialTheme.typography.bodyMedium,
                            color = CsOnSurfaceDim,
                        )
                    }

                    // Gaming mode selector
                    SectionTitle("Gaming Mode")
                    GamingModeSelector(
                        selectedMode = uiState.gamingMode,
                        onModeSelected = { viewModel.setGamingMode(it) },
                    )

                    // Stream config summary
                    val config = uiState.streamConfig
                    Text(
                        text = "${config.width}x${config.height} @ ${config.fps}fps  •  ${config.bitrateKbps / 1000} Mbps  •  ${config.codec.name}",
                        style = MaterialTheme.typography.bodySmall,
                        color = CsOnSurfaceDim,
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Start session button
                    Button(
                        onClick = { viewModel.startSession(hostId) },
                        enabled = host.status == HostStatus.ONLINE && !uiState.isStarting,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = CsGreen),
                    ) {
                        if (uiState.isStarting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(24.dp),
                            )
                            Text(
                                text = "  Start Streaming",
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                    }

                    if (host.status != HostStatus.ONLINE) {
                        Text(
                            text = "Host must be online to start a session",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        color = CsGreen,
    )
}

@Composable
private fun SpecsGrid(items: List<Pair<String, String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                row.forEach { (label, value) ->
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelSmall,
                            color = CsOnSurfaceDim,
                        )
                        Text(
                            text = value,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
                if (row.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}
