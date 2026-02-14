package com.crazystream.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.crazystream.app.data.model.HostStatus
import com.crazystream.app.ui.theme.CsError
import com.crazystream.app.ui.theme.CsOnSurfaceDim
import com.crazystream.app.ui.theme.CsSuccess
import com.crazystream.app.ui.theme.CsSurfaceVariant
import com.crazystream.app.ui.theme.CsWarning

@Composable
fun StatusBadge(
    status: HostStatus,
    modifier: Modifier = Modifier,
) {
    val (color, label) = when (status) {
        HostStatus.ONLINE -> CsSuccess to "Online"
        HostStatus.OFFLINE -> CsOnSurfaceDim to "Offline"
        HostStatus.BUSY -> CsWarning to "Busy"
        HostStatus.STREAMING -> CsError to "Streaming"
    }

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(CsSurfaceVariant)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        StatusDot(color = color)
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

@Composable
fun StatusDot(
    color: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(color),
    )
}
