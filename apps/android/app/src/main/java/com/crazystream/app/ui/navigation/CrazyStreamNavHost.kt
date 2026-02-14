package com.crazystream.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.crazystream.app.ui.screens.HostDetailScreen
import com.crazystream.app.ui.screens.HostListScreen
import com.crazystream.app.ui.screens.LoginScreen
import com.crazystream.app.ui.screens.SettingsScreen
import com.crazystream.app.ui.screens.StreamScreen
import com.crazystream.app.ui.viewmodel.MainViewModel

@Composable
fun CrazyStreamNavHost() {
    val navController = rememberNavController()
    val mainViewModel: MainViewModel = hiltViewModel()
    val isAuthenticated by mainViewModel.isAuthenticated.collectAsState()

    val startDestination = if (isAuthenticated) Screen.HostList.route else Screen.Login.route

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.HostList.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                },
            )
        }

        composable(Screen.HostList.route) {
            HostListScreen(
                onHostClick = { hostId ->
                    navController.navigate(Screen.HostDetail.createRoute(hostId))
                },
                onSettingsClick = {
                    navController.navigate(Screen.Settings.route)
                },
            )
        }

        composable(Screen.HostDetail.route) { backStackEntry ->
            val hostId = backStackEntry.arguments?.getString("hostId") ?: return@composable
            HostDetailScreen(
                hostId = hostId,
                onSessionStarted = { sessionId ->
                    navController.navigate(Screen.Stream.createRoute(sessionId))
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(Screen.Stream.route) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
            StreamScreen(
                sessionId = sessionId,
                onDisconnect = {
                    navController.popBackStack(Screen.HostList.route, inclusive = false)
                },
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onSignOut = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
    }
}
