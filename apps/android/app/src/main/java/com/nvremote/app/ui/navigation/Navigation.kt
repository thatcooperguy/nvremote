package com.nvremote.app.ui.navigation

/**
 * Navigation routes for the NVRemote app.
 */
sealed class Screen(val route: String) {
    data object Login : Screen("login")
    data object HostList : Screen("hosts")
    data object HostDetail : Screen("hosts/{hostId}") {
        fun createRoute(hostId: String) = "hosts/$hostId"
    }
    data object Stream : Screen("stream/{sessionId}") {
        fun createRoute(sessionId: String) = "stream/$sessionId"
    }
    data object Settings : Screen("settings")
}
