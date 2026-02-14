package com.gridstreamer.app.data.api

import com.gridstreamer.app.data.model.*
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit API interface for GridStreamer backend.
 */
interface GridStreamerApi {

    // --- Authentication ---

    @POST("api/v1/auth/google")
    suspend fun authenticateWithGoogle(
        @Body request: AuthRequest,
    ): Response<AuthResponse>

    @POST("api/v1/auth/refresh")
    suspend fun refreshToken(
        @Body request: RefreshTokenRequest,
    ): Response<AuthResponse>

    @POST("api/v1/auth/logout")
    suspend fun logout(): Response<Unit>

    // --- Hosts ---

    @GET("api/v1/hosts")
    suspend fun getHosts(): Response<List<Host>>

    @GET("api/v1/hosts/{hostId}")
    suspend fun getHost(
        @Path("hostId") hostId: String,
    ): Response<Host>

    @POST("api/v1/hosts/{hostId}/pair")
    suspend fun pairWithHost(
        @Path("hostId") hostId: String,
    ): Response<Host>

    @DELETE("api/v1/hosts/{hostId}/pair")
    suspend fun unpairFromHost(
        @Path("hostId") hostId: String,
    ): Response<Unit>

    // --- Sessions ---

    @POST("api/v1/sessions")
    suspend fun createSession(
        @Body request: SessionRequest,
    ): Response<Session>

    @GET("api/v1/sessions/{sessionId}")
    suspend fun getSession(
        @Path("sessionId") sessionId: String,
    ): Response<Session>

    @DELETE("api/v1/sessions/{sessionId}")
    suspend fun endSession(
        @Path("sessionId") sessionId: String,
    ): Response<Unit>

    @PUT("api/v1/sessions/{sessionId}/config")
    suspend fun updateSessionConfig(
        @Path("sessionId") sessionId: String,
        @Body config: StreamConfig,
    ): Response<Session>
}
