package com.aayush.diwaliplay.app.ui

import android.graphics.Bitmap
import android.view.SurfaceHolder
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import com.aayush.diwaliplay.app.GameViewModel
import com.aayush.diwaliplay.app.SpriteWarmer
import com.aayush.diwaliplay.game.bomb.bombRadiusFor
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.BombGameSettings
import com.aayush.diwaliplay.render.BombSprites
import com.aayush.diwaliplay.render.CanvasRenderer
import com.aayush.diwaliplay.render.GameSurfaceView
import com.aayush.diwaliplay.render.LOGICAL_HEIGHT
import com.aayush.diwaliplay.render.LOGICAL_WIDTH
import java.io.File

/** Custom bomb images need no more than this: sprites are at most about 400 px across. */
private const val MAX_BOMB_IMAGE_PX = 512

/**
 * [GameSurfaceView] for the app's whole life, so a round's first frame doesn't wait on a new surface. The frame loop
 * runs only while [active]; on the start screen the surface sits unused behind opaque UI.
 */
@Composable
fun GameSurfaceLayer(vm: GameViewModel, active: Boolean, onSurface: (GameSurfaceView?) -> Unit = {}) {
    var view by remember { mutableStateOf<GameSurfaceView?>(null) }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            val sprites = BombSprites(imageFor = { config -> decodeBombImage(vm, config) })
            GameSurfaceView(context, renderer = CanvasRenderer(sprites)).also { surface ->
                val warmer = BombSpriteWarmer(
                    clear = sprites::clear,
                    prewarm = { config, radius -> sprites.prewarm(listOf(config), radius) },
                    imageFile = { config -> bombImageFile(vm, config) },
                )
                vm.frameStepper.attachSurface(surface, warmer) { surface.lowEnd.value }
                surface.holder.addCallback(object : SurfaceHolder.Callback {
                    override fun surfaceCreated(holder: SurfaceHolder) = Unit
                    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit
                    // Frames stop with the surface while the round clock runs on: see onInterrupted.
                    override fun surfaceDestroyed(holder: SurfaceHolder) = vm.onSurfaceLost()
                })
                view = surface
            }
        },
    )

    val surface = view
    LaunchedEffect(surface) { onSurface(surface) }
    LaunchedEffect(surface, active) {
        if (surface != null) {
            if (active) surface.start(vm.frameStepper::step) else surface.stop()
        }
    }
    // `view` starts null, so this effect first runs without a surface and is disposed as soon as the factory publishes
    // one. That disposal must not touch the hooks the factory has just attached.
    DisposableEffect(surface) {
        onDispose {
            if (surface != null) {
                surface.stop()
                vm.frameStepper.detachSurface(surface)
            }
        }
    }
}

private fun bombImageFile(vm: GameViewModel, config: BombConfig): File? =
    config.imageUrl?.let { vm.branding.value.localFiles[it] }

private fun decodeBombImage(vm: GameViewModel, config: BombConfig): Bitmap? =
    bombImageFile(vm, config)?.let { decodeBounded(it, MAX_BOMB_IMAGE_PX) }

/**
 * Rebuilds sprites when the round's bombs differ from the last round's, one per config at its own radius. Which file
 * each image resolves to counts as a difference: a sprite built before its image had downloaded is the fallback drawing.
 */
internal class BombSpriteWarmer(
    private val clear: () -> Unit,
    private val prewarm: (BombConfig, Double) -> Unit,
    private val imageFile: (BombConfig) -> File?,
) : SpriteWarmer {
    private var lastConfigs: List<BombConfig>? = null
    private var lastSettings: BombGameSettings? = null
    private var lastImages: List<String?>? = null

    override fun warm(configs: List<BombConfig>, settings: BombGameSettings) {
        // lastModified: a revalidated image replaces the file under the same name.
        val images = configs.map { c -> imageFile(c)?.let { "${it.path}@${it.lastModified()}" } }
        if (configs != lastConfigs || settings != lastSettings || images != lastImages) {
            clear()
            lastConfigs = configs
            lastSettings = settings
            lastImages = images
        }
        for (config in configs) prewarm(config, bombRadiusFor(config, settings))
    }
}

/** The surface's input in touch mode: every finger going down is a tap, in 1920x1080 game space. */
@Composable
fun TouchLayer(onTouch: (x: Double, y: Double) -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .testTag(Tags.TOUCH_LAYER)
            .pointerInput(Unit) {
                val scaleX = LOGICAL_WIDTH.toDouble() / size.width
                val scaleY = LOGICAL_HEIGHT.toDouble() / size.height
                awaitEachGesture {
                    val first = awaitFirstDown(requireUnconsumed = false)
                    onTouch(first.position.x * scaleX, first.position.y * scaleY)
                    do {
                        val event = awaitPointerEvent()
                        for (c in event.changes) {
                            if (c.pressed && !c.previousPressed) onTouch(c.position.x * scaleX, c.position.y * scaleY)
                        }
                    } while (event.changes.any { it.pressed })
                }
            },
    )
}
