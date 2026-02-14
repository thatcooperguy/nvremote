package com.gridstreamer.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.gridstreamer.app.data.model.Host
import com.gridstreamer.app.data.model.HostStatus
import com.gridstreamer.app.ui.theme.CsGreen
import com.gridstreamer.app.ui.theme.CsOnSurfaceDim
import com.gridstreamer.app.ui.theme.CsOnSurfaceMuted
import com.gridstreamer.app.ui.theme.CsSurfaceElevated

@Composable
fun HostCard(
    host: Host,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(CsSurfaceElevated)
            .clickable(enabled = host.status != HostStatus.OFFLINE, onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(
            imageVector = Icons.Default.Computer,
            contentDescription = null,
            modifier = Modifier.size(40.dp),
            tint = if (host.status == HostStatus.ONLINE) CsGreen else CsOnSurfaceDim,
        )

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = host.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                StatusBadge(status = host.status)
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = host.gpuName,
                style = MaterialTheme.typography.bodySmall,
                color = CsOnSurfaceDim,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            if (host.pingMs >= 0) {
                Text(
                    text = "${host.pingMs}ms",
                    style = MaterialTheme.typography.labelSmall,
                    color = CsOnSurfaceMuted,
                )
            }
        }

        if (host.status != HostStatus.OFFLINE) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = "Connect",
                tint = CsOnSurfaceDim,
            )
        }
    }
}
