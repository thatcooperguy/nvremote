package com.gridstreamer.app.data.api

import com.gridstreamer.app.data.repository.AuthRepository
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp interceptor that attaches JWT bearer tokens to API requests
 * and handles automatic token refresh on 401 responses.
 *
 * Uses [dagger.Lazy] to break the circular dependency:
 * AuthInterceptor -> AuthRepository -> GridStreamerApi -> OkHttpClient -> AuthInterceptor
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val authRepository: dagger.Lazy<AuthRepository>,
) : Interceptor {

    companion object {
        private const val HEADER_AUTHORIZATION = "Authorization"
        private const val TOKEN_PREFIX = "Bearer "
        private val NO_AUTH_PATHS = setOf(
            "api/v1/auth/google",
            "api/v1/auth/refresh",
        )
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Skip auth for authentication endpoints
        val path = originalRequest.url.encodedPath.removePrefix("/")
        if (NO_AUTH_PATHS.any { path.endsWith(it) }) {
            return chain.proceed(originalRequest)
        }

        // Attach access token
        val accessToken = runBlocking { authRepository.get().getAccessToken() }
        if (accessToken.isNullOrEmpty()) {
            return chain.proceed(originalRequest)
        }

        val authenticatedRequest = originalRequest.newBuilder()
            .header(HEADER_AUTHORIZATION, TOKEN_PREFIX + accessToken)
            .build()

        val response = chain.proceed(authenticatedRequest)

        // If unauthorized, try to refresh token
        if (response.code == 401) {
            response.close()

            val refreshed = runBlocking { authRepository.get().refreshAccessToken() }
            if (refreshed) {
                val newToken = runBlocking { authRepository.get().getAccessToken() }
                if (!newToken.isNullOrEmpty()) {
                    val retryRequest = originalRequest.newBuilder()
                        .header(HEADER_AUTHORIZATION, TOKEN_PREFIX + newToken)
                        .build()
                    return chain.proceed(retryRequest)
                }
            }

            // Refresh failed — clear auth state
            runBlocking { authRepository.get().clearAuth() }
        }

        return response
    }
}
