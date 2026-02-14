package com.gridstreamer.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gridstreamer.app.data.model.GamingMode
import com.gridstreamer.app.data.model.Host
import com.gridstreamer.app.data.model.Session
import com.gridstreamer.app.data.model.SessionState
import com.gridstreamer.app.data.model.StreamConfig
import com.gridstreamer.app.data.model.StreamStats
import com.gridstreamer.app.data.model.toStreamConfig
import com.gridstreamer.app.data.repository.HostRepository
import com.gridstreamer.app.data.repository.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SessionViewModel @Inject constructor(
    private val hostRepository: HostRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SessionUiState())
    val uiState: StateFlow<SessionUiState> = _uiState.asStateFlow()

    private var pollingActive = false

    fun loadHost(hostId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            hostRepository.getHost(hostId)
                .onSuccess { host ->
                    _uiState.value = _uiState.value.copy(
                        host = host,
                        isLoading = false,
                        streamConfig = _uiState.value.gamingMode.toStreamConfig(),
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Failed to load host",
                    )
                }
        }
    }

    fun setGamingMode(mode: GamingMode) {
        _uiState.value = _uiState.value.copy(
            gamingMode = mode,
            streamConfig = mode.toStreamConfig(),
        )
    }

    fun startSession(hostId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isStarting = true, error = null)
            val config = _uiState.value.streamConfig
            sessionRepository.createSession(hostId, config)
                .onSuccess { session ->
                    _uiState.value = _uiState.value.copy(
                        session = session,
                        isStarting = false,
                    )
                    startSessionPolling(session.sessionId)
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isStarting = false,
                        error = error.message ?: "Failed to start session",
                    )
                }
        }
    }

    fun loadSession(sessionId: String) {
        viewModelScope.launch {
            sessionRepository.getSession(sessionId)
                .onSuccess { session ->
                    _uiState.value = _uiState.value.copy(session = session)
                    startSessionPolling(sessionId)
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        error = error.message ?: "Failed to load session",
                    )
                }
        }
    }

    fun endSession() {
        val sessionId = _uiState.value.session?.sessionId ?: return
        viewModelScope.launch {
            pollingActive = false
            sessionRepository.endSession(sessionId)
            _uiState.value = _uiState.value.copy(
                session = _uiState.value.session?.copy(state = SessionState.DISCONNECTED),
            )
        }
    }

    fun toggleStatsOverlay() {
        _uiState.value = _uiState.value.copy(
            showStatsOverlay = !_uiState.value.showStatsOverlay,
        )
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    private fun startSessionPolling(sessionId: String) {
        pollingActive = true
        viewModelScope.launch {
            while (pollingActive) {
                delay(5_000L)
                if (!pollingActive) break
                sessionRepository.getSession(sessionId).onSuccess { session ->
                    _uiState.value = _uiState.value.copy(session = session)
                    if (session.state == SessionState.DISCONNECTED ||
                        session.state == SessionState.ERROR
                    ) {
                        pollingActive = false
                    }
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollingActive = false
    }
}

data class SessionUiState(
    val host: Host? = null,
    val session: Session? = null,
    val gamingMode: GamingMode = GamingMode.BALANCED,
    val streamConfig: StreamConfig = GamingMode.BALANCED.toStreamConfig(),
    val streamStats: StreamStats = StreamStats(),
    val isLoading: Boolean = false,
    val isStarting: Boolean = false,
    val showStatsOverlay: Boolean = false,
    val error: String? = null,
)
