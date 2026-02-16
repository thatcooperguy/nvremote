package com.nvremote.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.nvremote.app.data.webrtc.WebRtcManager
import com.nvremote.app.ui.navigation.NVRemoteNavHost
import com.nvremote.app.ui.theme.NVRemoteTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var webRtcManager: WebRtcManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize WebRTC early so codec factories are ready before navigation
        webRtcManager.initialize()

        enableEdgeToEdge()
        setContent {
            NVRemoteTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    NVRemoteNavHost(webRtcManager = webRtcManager)
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) {
            webRtcManager.release()
        }
    }
}
