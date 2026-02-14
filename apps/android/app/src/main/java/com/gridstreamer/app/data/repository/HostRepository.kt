package com.gridstreamer.app.data.repository

import com.gridstreamer.app.data.api.GridStreamerApi
import com.gridstreamer.app.data.model.Host
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HostRepository @Inject constructor(
    private val api: GridStreamerApi,
) {
    private val _hosts = MutableStateFlow<List<Host>>(emptyList())
    val hosts: StateFlow<List<Host>> = _hosts.asStateFlow()

    suspend fun fetchHosts(): Result<List<Host>> {
        return try {
            val response = api.getHosts()
            if (response.isSuccessful) {
                val hostList = response.body() ?: emptyList()
                _hosts.value = hostList
                Result.success(hostList)
            } else {
                Result.failure(Exception("Failed to fetch hosts: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getHost(hostId: String): Result<Host> {
        return try {
            val response = api.getHost(hostId)
            if (response.isSuccessful) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Failed to get host: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun pairWithHost(hostId: String): Result<Host> {
        return try {
            val response = api.pairWithHost(hostId)
            if (response.isSuccessful) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Failed to pair: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun unpairFromHost(hostId: String): Result<Unit> {
        return try {
            val response = api.unpairFromHost(hostId)
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to unpair: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
