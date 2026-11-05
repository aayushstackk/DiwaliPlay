package com.aayush.diwaliplay.app.ui

import android.view.SurfaceView
import androidx.annotation.OptIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import java.io.File

/**
 * The admin's start screen video: muted, looping and cropped to fill, on a surface of its own.
 *
 * The media overlay tier puts it above [BackdropSurfaceView], which keeps the built-in drawn underneath. The game
 * surface shares the tier, but draws nothing on the start screen, so their order doesn't matter.
 *
 * The player lives only while this is composed and the activity is resumed: hand tracking is sensitive to load, so no
 * decoder may outlast the start screen. [onFailed] reports a file that won't play, once, after releasing its player.
 * That includes a file with no video the device can decode, which the player itself doesn't treat as an error.
 */
@OptIn(UnstableApi::class)
@Composable
fun StartVideoSurface(
    file: File,
    onFailed: (File) -> Unit,
    modifier: Modifier = Modifier,
    onFirstFrame: () -> Unit = {},
    onReleased: () -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val surface = remember(context) { SurfaceView(context).apply { setZOrderMediaOverlay(true) } }
    val failed by rememberUpdatedState(onFailed)
    val firstFrame by rememberUpdatedState(onFirstFrame)
    val released by rememberUpdatedState(onReleased)

    AndroidView(factory = { surface }, modifier = modifier)

    DisposableEffect(surface, file, lifecycle) {
        var player: ExoPlayer? = null
        var broken = false

        fun release() {
            val p = player ?: return
            player = null
            p.release()
            released()
        }

        fun fail() {
            if (broken) return
            broken = true
            release()
            failed(file)
        }

        fun build() {
            if (player != null || broken) return
            player = ExoPlayer.Builder(context).build().apply {
                trackSelectionParameters = trackSelectionParameters.buildUpon()
                    .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                    .build()
                volume = 0f
                repeatMode = Player.REPEAT_MODE_ONE
                videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
                addListener(object : Player.Listener {
                    override fun onRenderedFirstFrame() = firstFrame()

                    override fun onTracksChanged(tracks: Tracks) {
                        // Empty until the file has been read. False with no video track, or no decoder for it. A video
                        // over the decoder's stated limits still gets a try: onPlayerError catches it if that fails.
                        if (!tracks.isEmpty && !tracks.isTypeSupported(C.TRACK_TYPE_VIDEO, true)) fail()
                    }

                    override fun onPlayerError(error: PlaybackException) = fail()
                })
                setVideoSurfaceView(surface)
                setMediaItem(MediaItem.fromUri(file.toURI().toString()))
                playWhenReady = true
                prepare()
            }
        }

        // Replays up to the current state, so this also starts a player when composed while already resumed.
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> build()
                Lifecycle.Event.ON_PAUSE -> release()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            release()
        }
    }
}
