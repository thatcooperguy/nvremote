package com.gridstreamer.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.gridstreamer.app.data.model.StreamStats
import com.gridstreamer.app.ui.theme.CsGreen
import com.gridstreamer.app.ui.theme.CsOnSurface
import com.gridstreamer.app.ui.theme.CsOnSurfaceDim
import com.gridstreamer.app.ui.theme.CsWarning
import com.gridstreamer.app.ui.theme.OverlayBackground

@Composable
fun StatsOverlay(
    stats: StreamStats,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(OverlayBackground)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        StatRow(label = "Latency", value = stats.formattedLatency, warn = stats.latencyMs > 50f)
        StatRow(label = "FPS", value = stats.formattedFps, warn = stats.fps < 50f)
        StatRow(label = "Bitrate", value = stats.formattedBitrate)
        StatRow(label = "Resolution", value = stats.resolution)
        StatRow(label = "Codec", value = stats.codec)
        StatRow(
            label = "Packet Loss",
            value = stats.formattedPacketLoss,
            warn = stats.packetLossPercent > 1f,
        )
        if (stats.framesDropped > 0) {
            StatRow(
                label = "Dropped",
                value = "${stats.framesDropped}",
                warn = true,
            )
        }
    }
}

@Composable
private fun StatRow(
    label: String,
    value: String,
    warn: Boolean = false,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = CsOnSurfaceDim,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.labelSmall,
            color = when {
                warn -> CsWarning
                else -> CsGreen
            },
        )
    }
}
