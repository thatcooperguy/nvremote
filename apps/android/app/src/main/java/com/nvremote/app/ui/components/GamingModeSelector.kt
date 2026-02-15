package com.nvremote.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nvremote.app.data.model.GamingMode
import com.nvremote.app.ui.theme.CsGreen
import com.nvremote.app.ui.theme.CsGreenSubtle
import com.nvremote.app.ui.theme.CsOnSurface
import com.nvremote.app.ui.theme.CsOnSurfaceDim
import com.nvremote.app.ui.theme.CsSurfaceElevated

@Composable
fun GamingModeSelector(
    selectedMode: GamingMode,
    onModeSelected: (GamingMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        GamingMode.entries.forEach { mode ->
            GamingModeChip(
                mode = mode,
                isSelected = mode == selectedMode,
                onClick = { onModeSelected(mode) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun GamingModeChip(
    mode: GamingMode,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(12.dp)
    val backgroundColor = if (isSelected) CsGreenSubtle else CsSurfaceElevated
    val borderColor = if (isSelected) CsGreen else Color.Transparent

    Column(
        modifier = modifier
            .clip(shape)
            .border(width = 1.5.dp, color = borderColor, shape = shape)
            .background(backgroundColor)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = mode.displayName,
            style = MaterialTheme.typography.labelLarge,
            color = if (isSelected) CsGreen else CsOnSurface,
            textAlign = TextAlign.Center,
        )
        Text(
            text = mode.description,
            style = MaterialTheme.typography.labelSmall,
            color = CsOnSurfaceDim,
            textAlign = TextAlign.Center,
        )
    }
}

private val GamingMode.displayName: String
    get() = when (this) {
        GamingMode.COMPETITIVE -> "Competitive"
        GamingMode.BALANCED -> "Balanced"
        GamingMode.CINEMATIC -> "Cinematic"
    }

private val GamingMode.description: String
    get() = when (this) {
        GamingMode.COMPETITIVE -> "120 FPS\nLow latency"
        GamingMode.BALANCED -> "60 FPS\nBest quality"
        GamingMode.CINEMATIC -> "4K 60 FPS\nMax detail"
    }
