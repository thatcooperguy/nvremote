package com.nvremote.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.nvremote.app.ui.navigation.NVRemoteNavHost
import com.nvremote.app.ui.theme.NVRemoteTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NVRemoteTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    NVRemoteNavHost()
                }
            }
        }
    }
}
