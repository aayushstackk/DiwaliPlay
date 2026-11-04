package com.aayush.diwaliplay.render

import android.content.Context
import android.graphics.PixelFormat
import android.util.AttributeSet
import android.view.SurfaceHolder
import android.view.SurfaceView
import kotlinx.coroutines.flow.StateFlow

/**
 * Gameplay effects surface: a fixed 1920x1080 buffer (the display compositor scales it to the panel), drawn on
 * a dedicated render thread ([RenderLoop]) with `lockHardwareCanvas()`. Logical game coordinates map 1:1 onto
 * the buffer, so the renderer needs no transform.
 *
 * The surface is translucent and ordered as a media overlay: above the camera preview / wallpaper surfaces,
 * below this window's own views (Compose HUD).
 */
class GameSurfaceView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    renderer: Renderer = CanvasRenderer(),
) : SurfaceView(context, attrs), SurfaceHolder.Callback {

    private val loop = RenderLoop(holder, renderer)

    /** Render rate, updated twice a second while running. */
    val fps: StateFlow<Float> get() = loop.fps

    /** Sticky: true once the render rate averaged below 45 fps for 2 s (spec §5 low-end fallback). */
    val lowEnd: StateFlow<Boolean> get() = loop.lowEnd

    init {
        holder.setFixedSize(LOGICAL_WIDTH, LOGICAL_HEIGHT)
        holder.setFormat(PixelFormat.TRANSLUCENT)
        setZOrderMediaOverlay(true)
        holder.addCallback(this)
    }

    /**
     * Starts (or re-targets) the frame loop. [onFrame] runs on the render thread each vsync while a surface
     * exists: step the game with `dtSeconds` and return what to draw. Safe to call repeatedly.
     */
    fun start(onFrame: (dtSeconds: Double, nowMs: Double) -> RenderFrame) = loop.start(onFrame)

    /** Stops calling onFrame/drawing. Safe to call repeatedly or before [start]. */
    fun stop() = loop.stop()

    override fun surfaceCreated(holder: SurfaceHolder) = loop.surfaceCreated()

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

    override fun surfaceDestroyed(holder: SurfaceHolder) = loop.surfaceDestroyed()

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        loop.resume()
    }

    override fun onDetachedFromWindow() {
        loop.shutdown()
        super.onDetachedFromWindow()
    }
}
