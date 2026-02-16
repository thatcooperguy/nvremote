package com.nvremote.app.ui.components

import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/**
 * Composable wrapper around WebRTC's [SurfaceViewRenderer].
 *
 * Renders the incoming [videoTrack] using hardware-accelerated OpenGL decoding.
 * The surface is initialized with the shared [eglBase] context and automatically
 * cleaned up when removed from composition.
 */
@Composable
fun WebRtcSurfaceView(
    videoTrack: VideoTrack?,
    eglBase: EglBase,
    modifier: Modifier = Modifier,
    scalingType: RendererCommon.ScalingType = RendererCommon.ScalingType.SCALE_ASPECT_FIT,
    mirror: Boolean = false,
) {
    val context = LocalContext.current
    val renderer = remember {
        SurfaceViewRenderer(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }

    // Initialize renderer and manage video track sink
    DisposableEffect(renderer, eglBase) {
        renderer.init(eglBase.eglBaseContext, null)
        renderer.setScalingType(scalingType)
        renderer.setMirror(mirror)
        renderer.setEnableHardwareScaler(true)

        onDispose {
            renderer.release()
        }
    }

    // Attach/detach video track as a sink
    DisposableEffect(videoTrack) {
        videoTrack?.addSink(renderer)

        onDispose {
            videoTrack?.removeSink(renderer)
        }
    }

    AndroidView(
        factory = { renderer },
        modifier = modifier,
    )
}
