package com.gridstreamer.app.data.repository

import android.content.SharedPreferences
import com.gridstreamer.app.data.api.GridStreamerApi
import com.gridstreamer.app.data.model.AuthRequest
import com.gridstreamer.app.data.model.AuthResponse
import com.gridstreamer.app.data.model.RefreshTokenRequest
import com.gridstreamer.app.data.model.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages authentication state, JWT tokens, and user profile.
 * Tokens are stored in EncryptedSharedPreferences for security.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val api: GridStreamerApi,
    private val encryptedPrefs: SharedPreferences,
) {
    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_TOKEN_EXPIRY = "token_expiry"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_USER_NAME = "user_display_name"
        private const val KEY_USER_AVATAR = "user_avatar_url"
    }

    private val refreshMutex = Mutex()

    private val _isAuthenticated = MutableStateFlow(hasValidToken())
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    private val _currentUser = MutableStateFlow(loadSavedUser())
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    /**
     * Authenticate with a Google ID token.
     */
    suspend fun signInWithGoogle(idToken: String): Result<User> {
        return try {
            val response = api.authenticateWithGoogle(AuthRequest(idToken))
            if (response.isSuccessful) {
                val authResponse = response.body()!!
                saveAuthResponse(authResponse)
                _isAuthenticated.value = true
                _currentUser.value = authResponse.user
                Result.success(authResponse.user)
            } else {
                Result.failure(Exception("Authentication failed: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Get the current access token, or null if not authenticated.
     */
    suspend fun getAccessToken(): String? {
        val token = encryptedPrefs.getString(KEY_ACCESS_TOKEN, null)
        val expiry = encryptedPrefs.getLong(KEY_TOKEN_EXPIRY, 0L)

        // If token is expired or about to expire (within 30s), try to refresh
        if (token != null && System.currentTimeMillis() >= expiry - 30_000) {
            refreshAccessToken()
            return encryptedPrefs.getString(KEY_ACCESS_TOKEN, null)
        }

        return token
    }

    /**
     * Attempt to refresh the access token using the stored refresh token.
     * Returns true if the refresh was successful.
     */
    suspend fun refreshAccessToken(): Boolean = refreshMutex.withLock {
        val refreshToken = encryptedPrefs.getString(KEY_REFRESH_TOKEN, null)
            ?: return false

        return try {
            val response = api.refreshToken(RefreshTokenRequest(refreshToken))
            if (response.isSuccessful) {
                val authResponse = response.body()!!
                saveAuthResponse(authResponse)
                _isAuthenticated.value = true
                _currentUser.value = authResponse.user
                true
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Sign out and clear all stored credentials.
     */
    suspend fun signOut() {
        try {
            api.logout()
        } catch (_: Exception) {
            // Best effort — clear local state regardless
        }
        clearAuth()
    }

    /**
     * Clear all stored authentication data.
     */
    suspend fun clearAuth() {
        encryptedPrefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_TOKEN_EXPIRY)
            .remove(KEY_USER_ID)
            .remove(KEY_USER_EMAIL)
            .remove(KEY_USER_NAME)
            .remove(KEY_USER_AVATAR)
            .apply()

        _isAuthenticated.value = false
        _currentUser.value = null
    }

    private fun hasValidToken(): Boolean {
        val token = encryptedPrefs.getString(KEY_ACCESS_TOKEN, null)
        val expiry = encryptedPrefs.getLong(KEY_TOKEN_EXPIRY, 0L)
        return token != null && System.currentTimeMillis() < expiry
    }

    private fun saveAuthResponse(response: AuthResponse) {
        encryptedPrefs.edit()
            .putString(KEY_ACCESS_TOKEN, response.accessToken)
            .putString(KEY_REFRESH_TOKEN, response.refreshToken)
            .putLong(KEY_TOKEN_EXPIRY, System.currentTimeMillis() + response.expiresIn * 1000)
            .putString(KEY_USER_ID, response.user.id)
            .putString(KEY_USER_EMAIL, response.user.email)
            .putString(KEY_USER_NAME, response.user.displayName)
            .putString(KEY_USER_AVATAR, response.user.avatarUrl)
            .apply()
    }

    private fun loadSavedUser(): User? {
        val id = encryptedPrefs.getString(KEY_USER_ID, null) ?: return null
        return User(
            id = id,
            email = encryptedPrefs.getString(KEY_USER_EMAIL, "") ?: "",
            displayName = encryptedPrefs.getString(KEY_USER_NAME, "") ?: "",
            avatarUrl = encryptedPrefs.getString(KEY_USER_AVATAR, null),
        )
    }
}
