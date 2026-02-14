package com.crazystream.app.data.repository

import com.crazystream.app.data.api.CrazyStreamApi
import com.crazystream.app.data.model.Session
import com.crazystream.app.data.model.SessionRequest
import com.crazystream.app.data.model.StreamConfig
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRepository @Inject constructor(
    private val api: CrazyStreamApi,
) {
    suspend fun createSession(hostId: String, config: StreamConfig): Result<Session> {
        return try {
            val response = api.createSession(SessionRequest(hostId, config))
            if (response.isSuccessful) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Failed to create session: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSession(sessionId: String): Result<Session> {
        return try {
            val response = api.getSession(sessionId)
            if (response.isSuccessful) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Failed to get session: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun endSession(sessionId: String): Result<Unit> {
        return try {
            val response = api.endSession(sessionId)
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to end session: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateConfig(sessionId: String, config: StreamConfig): Result<Session> {
        return try {
            val response = api.updateSessionConfig(sessionId, config)
            if (response.isSuccessful) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Failed to update config: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
