package com.aayush.diwaliplay.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Shader
import android.os.Handler
import android.os.HandlerThread
import android.view.Choreographer
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.aayush.diwaliplay.app.BackdropKind
import com.aayush.diwaliplay.tracking.camera.CameraFrame
import java.io.File
import kotlin.math.max

/** What the backdrop shows. */
data class BackdropContent(val kind: BackdropKind, val wallpaperFile: File?, val wallpaperOpacity: Double)

/**
 * The layer behind the game surface: the wallpaper or the mirrored live camera, on a 1920x1080 surface of its own.
 *
 * Why not a Compose wallpaper and a `PreviewView`: the game surface sits below this window and clears a hole through
 * it (SurfaceView's "punch"), which also erases whatever the window drew underneath. A TextureView preview or a Compose
 * background would vanish. A SurfaceView-backed preview would survive, but can't be mirrored by a view transform. So
 * this plain surface sits below the game's media overlay, and draws the analysis frames itself, mirrored the way the
 * still is. That also keeps the picture in step with the landmarks drawn over it.
 *
 * Draws on its own thread: a static backdrop once, the camera at the frame rate, so the game's frame loop never waits
 * for a camera texture upload.
 */
class BackdropSurfaceView(context: Context, private val frames: () -> CameraFrame?) : SurfaceView(context), SurfaceHolder.Callback {
    private val thread = HandlerThread("DiwaliBackdrop").apply { start() }
    private val handler = Handler(thread.looper)

    /** Held for each draw; surfaceDestroyed takes it, so nothing draws once it returns. */
    private val drawLock = Any()
    @Volatile private var hasSurface = false
    @Volatile private var content = BackdropContent(BackdropKind.Dark, null, 100.0)

    // Backdrop thread only.
    private var drawnContent: BackdropContent? = null
    private var drawnFrame: CameraFrame? = null
    private var image: Bitmap? = null
    private var imageFile: File? = null
    private var frameCallbackPosted = false

    private val framePaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val strongVignette = vignette(0.7f, 0.6f)
    private val softVignette = vignette(0.4f, 0.4f)
    private val frameMatrix = Matrix()

    private val frameCallback = Choreographer.FrameCallback {
        frameCallbackPosted = false
        render()
    }

    init {
        holder.setFixedSize(BACKDROP_WIDTH, BACKDROP_HEIGHT)
        holder.setFormat(PixelFormat.OPAQUE)
        holder.addCallback(this)
    }

    /** Main thread. */
    fun show(next: BackdropContent) {
        content = next
        handler.post { render() }
    }

    fun shutdown() {
        hasSurface = false
        handler.post { Choreographer.getInstance().removeFrameCallback(frameCallback) }
        thread.quitSafely()
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        hasSurface = true
        handler.post {
            drawnContent = null
            render()
        }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        hasSurface = false
        synchronized(drawLock) { }
    }

    /** Backdrop thread. */
    private fun render() {
        val c = content
        val live = c.kind == BackdropKind.CameraStrongVignette || c.kind == BackdropKind.CameraSoftVignette
        if (hasSurface) {
            if (live) {
                val frame = frames()
                if (frame !== drawnFrame || c != drawnContent) draw(c, frame)
            } else if (c != drawnContent) {
                draw(c, null)
            }
        }
        if (live && hasSurface && !frameCallbackPosted) {
            frameCallbackPosted = true
            Choreographer.getInstance().postFrameCallback(frameCallback)
        }
    }

    private fun draw(c: BackdropContent, frame: CameraFrame?) {
        // Decoded ahead of the lock: a wallpaper can take a while, and surfaceDestroyed waits on the lock.
        if (c.kind == BackdropKind.Wallpaper) loadImage(c.wallpaperFile)
        synchronized(drawLock) {
            if (!hasSurface) return
            val canvas = try {
                holder.lockHardwareCanvas()
            } catch (_: IllegalStateException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            } ?: return
            try {
                when (c.kind) {
                    BackdropKind.Dark -> canvas.drawColor(BACKGROUND_COLOR)
                    BackdropKind.Wallpaper -> drawWallpaper(canvas, image, c.wallpaperOpacity)
                    BackdropKind.CameraStrongVignette -> drawCamera(canvas, frame, strongVignette)
                    BackdropKind.CameraSoftVignette -> drawCamera(canvas, frame, softVignette)
                }
            } finally {
                holder.unlockCanvasAndPost(canvas)
            }
        }
        drawnContent = c
        drawnFrame = frame
    }

    /** A file that won't decode leaves null, which draws the built-in scene (the web's onError). */
    private fun loadImage(file: File?) {
        if (file == imageFile) return
        imageFile = file
        image = file?.let { decodeBounded(it, BACKDROP_WIDTH) }
    }

    private fun drawCamera(canvas: Canvas, frame: CameraFrame?, vignette: Paint) {
        canvas.drawColor(BACKGROUND_COLOR)
        if (frame != null) {
            mapFrame(frame, frameMatrix)
            canvas.drawBitmap(frame.bitmap, frameMatrix, framePaint)
        }
        canvas.drawRect(0f, 0f, BACKDROP_WIDTH.toFloat(), BACKDROP_HEIGHT.toFloat(), vignette)
    }

    private fun vignette(top: Float, bottom: Float) = Paint().apply {
        fun neutral(a: Float) = ((a * 255).toInt() shl 24) or 0x0A0A0A
        shader = LinearGradient(
            0f, 0f, 0f, BACKDROP_HEIGHT.toFloat(),
            intArrayOf(neutral(top), 0, neutral(bottom)), null, Shader.TileMode.CLAMP,
        )
    }

    private companion object {
        const val BACKDROP_WIDTH = 1920
        const val BACKDROP_HEIGHT = 1080
        const val BACKGROUND_COLOR = 0xFF0A0713.toInt()

        /** `object-cover -scale-x-100`: upright, centre-cropped to the surface, mirrored like the still. */
        fun mapFrame(frame: CameraFrame, m: Matrix) {
            val bw = frame.bitmap.width.toFloat()
            val bh = frame.bitmap.height.toFloat()
            val rotated = frame.rotationDegrees % 180 != 0
            val w = if (rotated) bh else bw
            val h = if (rotated) bw else bh
            val k = max(BACKDROP_WIDTH / w, BACKDROP_HEIGHT / h)
            m.reset()
            m.postTranslate(-bw / 2, -bh / 2)
            m.postRotate(frame.rotationDegrees.toFloat())
            m.postScale(-k, k)
            m.postTranslate(BACKDROP_WIDTH / 2f, BACKDROP_HEIGHT / 2f)
        }
    }
}
