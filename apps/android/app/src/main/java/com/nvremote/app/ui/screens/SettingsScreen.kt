package com.nvremote.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.nvremote.app.data.model.GamingMode
import com.nvremote.app.data.model.VideoCodec
import com.nvremote.app.ui.components.GamingModeSelector
import com.nvremote.app.ui.theme.CsError
import com.nvremote.app.ui.theme.CsGreen
import com.nvremote.app.ui.theme.CsOnSurfaceDim
import com.nvremote.app.ui.theme.CsSurface
import com.nvremote.app.ui.theme.CsSurfaceElevated
import com.nvremote.app.ui.viewmodel.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onSignOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val user by viewModel.currentUser.collectAsState()
    val settings by viewModel.settings.collectAsState()
    var showSignOutDialog by remember { mutableStateOf(false) }

    if (showSignOutDialog) {
        AlertDialog(
            onDismissRequest = { showSignOutDialog = false },
            title = { Text("Sign Out") },
            text = { Text("Are you sure you want to sign out?") },
            confirmButton = {
                TextButton(onClick = {
                    showSignOutDialog = false
                    viewModel.signOut { onSignOut() }
                }) {
                    Text("Sign Out", color = CsError)
                }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Settings",
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
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            // Account section
            SectionHeader("Account")
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(CsSurfaceElevated)
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (user?.avatarUrl != null) {
                    AsyncImage(
                        model = user?.avatarUrl,
                        contentDescription = "Avatar",
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape),
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = CsOnSurfaceDim,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = user?.displayName ?: "Not signed in",
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = user?.email ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = CsOnSurfaceDim,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // Default Gaming Mode
            SectionHeader("Default Gaming Mode")
            GamingModeSelector(
                selectedMode = settings.defaultGamingMode,
                onModeSelected = { viewModel.setDefaultGamingMode(it) },
            )

            // Stream Quality
            SectionHeader("Stream Quality")

            SettingRow(label = "Preferred Codec") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    VideoCodec.entries.forEach { codec ->
                        ChipSelector(
                            label = codec.name,
                            isSelected = settings.preferredCodec == codec,
                            onClick = { viewModel.setPreferredCodec(codec) },
                        )
                    }
                }
            }

            SettingRow(label = "Max Bitrate: ${settings.maxBitrateKbps / 1000} Mbps") {
                Slider(
                    value = settings.maxBitrateKbps.toFloat(),
                    onValueChange = { viewModel.setMaxBitrateKbps(it.toInt()) },
                    valueRange = 5000f..100000f,
                    steps = 18,
                    colors = SliderDefaults.colors(
                        thumbColor = CsGreen,
                        activeTrackColor = CsGreen,
                    ),
                )
            }

            SettingRow(label = "Max FPS: ${settings.maxFps}") {
                Slider(
                    value = settings.maxFps.toFloat(),
                    onValueChange = { viewModel.setMaxFps(it.toInt()) },
                    valueRange = 30f..120f,
                    steps = 2,
                    colors = SliderDefaults.colors(
                        thumbColor = CsGreen,
                        activeTrackColor = CsGreen,
                    ),
                )
            }

            // Audio
            SectionHeader("Audio")
            SwitchRow(
                label = "Audio Enabled",
                checked = settings.audioEnabled,
                onCheckedChange = { viewModel.setAudioEnabled(it) },
            )

            // Display
            SectionHeader("Display")
            SwitchRow(
                label = "Show Stats Overlay",
                checked = settings.showStatsOverlay,
                onCheckedChange = { viewModel.setShowStatsOverlay(it) },
            )

            SettingRow(
                label = "Controller Opacity: ${(settings.controllerOpacity * 100).toInt()}%",
            ) {
                Slider(
                    value = settings.controllerOpacity,
                    onValueChange = { viewModel.setControllerOpacity(it) },
                    valueRange = 0.1f..1.0f,
                    colors = SliderDefaults.colors(
                        thumbColor = CsGreen,
                        activeTrackColor = CsGreen,
                    ),
                )
            }

            // Sign out
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(CsSurfaceElevated)
                    .clickable { showSignOutDialog = true }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Logout,
                    contentDescription = null,
                    tint = CsError,
                )
                Text(
                    text = "Sign Out",
                    style = MaterialTheme.typography.titleMedium,
                    color = CsError,
                )
            }

            // App version
            Text(
                text = "NVRemote v0.4.0-alpha",
                style = MaterialTheme.typography.bodySmall,
                color = CsOnSurfaceDim,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        color = CsGreen,
    )
}

@Composable
private fun SettingRow(
    label: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = CsOnSurfaceDim,
        )
        content()
    }
}

@Composable
private fun SwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(CsSurfaceElevated)
            .clickable { onCheckedChange(!checked) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = CsGreen,
                checkedTrackColor = CsGreen.copy(alpha = 0.3f),
            ),
        )
    }
}

@Composable
private fun ChipSelector(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        color = if (isSelected) CsGreen else CsOnSurfaceDim,
        modifier = Modifier
            .clip(shape)
            .background(if (isSelected) CsGreen.copy(alpha = 0.15f) else CsSurfaceElevated)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}
