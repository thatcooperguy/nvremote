package com.crazystream.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.crazystream.app.data.model.Host
import com.crazystream.app.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HostsViewModel @Inject constructor(
    private val hostRepository: HostRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HostsUiState())
    val uiState: StateFlow<HostsUiState> = _uiState.asStateFlow()

    private var autoRefreshActive = true

    init {
        fetchHosts()
        startAutoRefresh()
    }

    fun fetchHosts() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            hostRepository.fetchHosts()
                .onSuccess { hosts ->
                    _uiState.value = _uiState.value.copy(
                        hosts = hosts,
                        isLoading = false,
                        isRefreshing = false,
                        error = null,
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = error.message ?: "Failed to fetch hosts",
                    )
                }
        }
    }

    fun onRefresh() {
        _uiState.value = _uiState.value.copy(isRefreshing = true)
        fetchHosts()
    }

    private fun startAutoRefresh() {
        viewModelScope.launch {
            while (autoRefreshActive) {
                delay(30_000L)
                if (autoRefreshActive) {
                    hostRepository.fetchHosts().onSuccess { hosts ->
                        _uiState.value = _uiState.value.copy(hosts = hosts)
                    }
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        autoRefreshActive = false
    }
}

data class HostsUiState(
    val hosts: List<Host> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
)
