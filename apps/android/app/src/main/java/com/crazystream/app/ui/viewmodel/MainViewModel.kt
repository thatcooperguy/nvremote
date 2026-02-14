package com.crazystream.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.crazystream.app.data.model.User
import com.crazystream.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    val isAuthenticated: StateFlow<Boolean> = authRepository.isAuthenticated
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    val currentUser: StateFlow<User?> = authRepository.currentUser
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun signInWithGoogle(idToken: String, onResult: (Result<User>) -> Unit) {
        viewModelScope.launch {
            val result = authRepository.signInWithGoogle(idToken)
            onResult(result)
        }
    }

    fun signOut() {
        viewModelScope.launch {
            authRepository.signOut()
        }
    }
}
