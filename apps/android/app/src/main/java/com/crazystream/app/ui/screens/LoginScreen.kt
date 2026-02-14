package com.crazystream.app.ui.screens

import android.app.Activity
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.crazystream.app.R
import com.crazystream.app.ui.theme.CsGreen
import com.crazystream.app.ui.theme.CsOnSurfaceDim
import com.crazystream.app.ui.viewmodel.MainViewModel
import com.google.android.gms.auth.api.identity.BeginSignInRequest
import com.google.android.gms.auth.api.identity.Identity
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private const val TAG = "LoginScreen"

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    viewModel: MainViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var isLoading by remember { mutableStateOf(false) }

    val oneTapClient = remember { Identity.getSignInClient(context) }

    val signInLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartIntentSenderForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            try {
                val credential = oneTapClient.getSignInCredentialFromIntent(result.data)
                val idToken = credential.googleIdToken
                if (idToken != null) {
                    viewModel.signInWithGoogle(idToken) { authResult ->
                        authResult.onSuccess {
                            onLoginSuccess()
                        }.onFailure { error ->
                            isLoading = false
                            scope.launch {
                                snackbarHostState.showSnackbar(
                                    error.message ?: "Authentication failed",
                                )
                            }
                        }
                    }
                } else {
                    isLoading = false
                    scope.launch {
                        snackbarHostState.showSnackbar("No ID token received")
                    }
                }
            } catch (e: Exception) {
                isLoading = false
                Log.e(TAG, "Sign-in credential error", e)
                scope.launch {
                    snackbarHostState.showSnackbar("Sign-in failed: ${e.message}")
                }
            }
        } else {
            isLoading = false
        }
    }

    fun beginSignIn() {
        isLoading = true
        scope.launch {
            try {
                val signInRequest = BeginSignInRequest.builder()
                    .setGoogleIdTokenRequestOptions(
                        BeginSignInRequest.GoogleIdTokenRequestOptions.builder()
                            .setSupported(true)
                            .setServerClientId(context.getString(R.string.google_web_client_id))
                            .setFilterByAuthorizedAccounts(false)
                            .build(),
                    )
                    .setAutoSelectEnabled(true)
                    .build()

                val result = oneTapClient.beginSignIn(signInRequest).await()
                signInLauncher.launch(
                    IntentSenderRequest.Builder(result.pendingIntent.intentSender).build(),
                )
            } catch (e: Exception) {
                isLoading = false
                Log.e(TAG, "One Tap sign-in error", e)
                snackbarHostState.showSnackbar("Google Sign-In unavailable: ${e.message}")
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Image(
                    painter = painterResource(id = R.mipmap.ic_launcher),
                    contentDescription = "CrazyStream",
                    modifier = Modifier.size(96.dp),
                )

                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = "CrazyStream",
                    style = MaterialTheme.typography.headlineLarge,
                    color = CsGreen,
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Stream your PC games anywhere",
                    style = MaterialTheme.typography.bodyLarge,
                    color = CsOnSurfaceDim,
                    textAlign = TextAlign.Center,
                )

                Spacer(modifier = Modifier.height(48.dp))

                Button(
                    onClick = { beginSignIn() },
                    enabled = !isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = CsGreen,
                    ),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(
                            text = "Sign in with Google",
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Sign in to connect to your gaming PC",
                    style = MaterialTheme.typography.bodySmall,
                    color = CsOnSurfaceDim,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
