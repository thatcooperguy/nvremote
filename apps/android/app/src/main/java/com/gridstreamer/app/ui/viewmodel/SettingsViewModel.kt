package com.gridstreamer.app.ui.viewmodel

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gridstreamer.app.data.model.GamingMode
import com.gridstreamer.app.data.model.User
import com.gridstreamer.app.data.model.VideoCodec
import com.gridstreamer.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val prefs: SharedPreferences,
) : ViewModel() {

    val currentUser: StateFlow<User?> = authRepository.currentUser
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val _settings = MutableStateFlow(loadSettings())
    val settings: StateFlow<AppSettings> = _settings.asStateFlow()

    fun setDefaultGamingMode(mode: GamingMode) {
        updateSettings { it.copy(defaultGamingMode = mode) }
    }

    fun setPreferredCodec(codec: VideoCodec) {
        updateSettings { it.copy(preferredCodec = codec) }
    }

    fun setMaxBitrateKbps(bitrate: Int) {
        updateSettings { it.copy(maxBitrateKbps = bitrate) }
    }

    fun setMaxFps(fps: Int) {
        updateSettings { it.copy(maxFps = fps) }
    }

    fun setAudioEnabled(enabled: Boolean) {
        updateSettings { it.copy(audioEnabled = enabled) }
    }

    fun setShowStatsOverlay(show: Boolean) {
        updateSettings { it.copy(showStatsOverlay = show) }
    }

    fun setControllerOpacity(opacity: Float) {
        updateSettings { it.copy(controllerOpacity = opacity) }
    }

    fun signOut(onComplete: () -> Unit) {
        viewModelScope.launch {
            authRepository.signOut()
            onComplete()
        }
    }

    private fun updateSettings(transform: (AppSettings) -> AppSettings) {
        val newSettings = transform(_settings.value)
        _settings.value = newSettings
        saveSettings(newSettings)
    }

    private fun loadSettings(): AppSettings {
        return AppSettings(
            defaultGamingMode = GamingMode.entries.getOrNull(
                prefs.getInt(KEY_GAMING_MODE, 1),
            ) ?: GamingMode.BALANCED,
            preferredCodec = VideoCodec.entries.getOrNull(
                prefs.getInt(KEY_PREFERRED_CODEC, 1),
            ) ?: VideoCodec.H265,
            maxBitrateKbps = prefs.getInt(KEY_MAX_BITRATE, 20000),
            maxFps = prefs.getInt(KEY_MAX_FPS, 60),
            audioEnabled = prefs.getBoolean(KEY_AUDIO_ENABLED, true),
            showStatsOverlay = prefs.getBoolean(KEY_SHOW_STATS, false),
            controllerOpacity = prefs.getFloat(KEY_CONTROLLER_OPACITY, 0.6f),
        )
    }

    private fun saveSettings(settings: AppSettings) {
        prefs.edit().apply {
            putInt(KEY_GAMING_MODE, settings.defaultGamingMode.ordinal)
            putInt(KEY_PREFERRED_CODEC, settings.preferredCodec.ordinal)
            putInt(KEY_MAX_BITRATE, settings.maxBitrateKbps)
            putInt(KEY_MAX_FPS, settings.maxFps)
            putBoolean(KEY_AUDIO_ENABLED, settings.audioEnabled)
            putBoolean(KEY_SHOW_STATS, settings.showStatsOverlay)
            putFloat(KEY_CONTROLLER_OPACITY, settings.controllerOpacity)
            apply()
        }
    }

    companion object {
        private const val KEY_GAMING_MODE = "settings_gaming_mode"
        private const val KEY_PREFERRED_CODEC = "settings_preferred_codec"
        private const val KEY_MAX_BITRATE = "settings_max_bitrate"
        private const val KEY_MAX_FPS = "settings_max_fps"
        private const val KEY_AUDIO_ENABLED = "settings_audio_enabled"
        private const val KEY_SHOW_STATS = "settings_show_stats"
        private const val KEY_CONTROLLER_OPACITY = "settings_controller_opacity"
    }
}

data class AppSettings(
    val defaultGamingMode: GamingMode = GamingMode.BALANCED,
    val preferredCodec: VideoCodec = VideoCodec.H265,
    val maxBitrateKbps: Int = 20000,
    val maxFps: Int = 60,
    val audioEnabled: Boolean = true,
    val showStatsOverlay: Boolean = false,
    val controllerOpacity: Float = 0.6f,
)
