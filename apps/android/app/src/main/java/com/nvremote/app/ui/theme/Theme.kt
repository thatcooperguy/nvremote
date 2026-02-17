package com.nvremote.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val NVRemoteColorScheme = darkColorScheme(
    primary = CsGreen,
    onPrimary = CsBlack,
    primaryContainer = CsGreenDark,
    onPrimaryContainer = CsGreenLight,
    secondary = CsGreen,
    onSecondary = CsBlack,
    secondaryContainer = CsGreenSubtle,
    onSecondaryContainer = CsGreenLight,
    tertiary = CsGreenLight,
    onTertiary = CsBlack,
    background = CsBlack,
    onBackground = CsOnSurface,
    surface = CsSurface,
    onSurface = CsOnSurface,
    surfaceVariant = CsSurfaceVariant,
    onSurfaceVariant = CsOnSurfaceDim,
    error = CsError,
    onError = CsBlack,
    errorContainer = CsErrorContainer,
    onErrorContainer = CsError,
    outline = CsOnSurfaceMuted,
    outlineVariant = CsSurfaceBright,
    inverseSurface = CsOnSurface,
    inverseOnSurface = CsBlack,
    inversePrimary = CsGreenDark,
    surfaceTint = CsGreen,
)

@Composable
fun NVRemoteTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = NVRemoteColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = CsBlack.toArgb()
            window.navigationBarColor = CsBlack.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = NVRemoteTypography,
        content = content
    )
}
