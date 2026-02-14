package com.gridstreamer.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.gridstreamer.app.ui.navigation.GridStreamerNavHost
import com.gridstreamer.app.ui.theme.GridStreamerTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GridStreamerTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    GridStreamerNavHost()
                }
            }
        }
    }
}
