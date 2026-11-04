package com.aayush.diwaliplay.render

import android.graphics.Canvas
import android.graphics.PixelFormat
import android.graphics.Rect
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import android.view.SurfaceHolder
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.game.cracker.CrackerSim
import com.aayush.diwaliplay.game.flow.GamePhase
import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicInteger

/** Drives [RenderLoop] against a real 1920x1080 ImageReader surface: frames, fps, and surface/start lifecycle. */
@RunWith(AndroidJUnit4::class)
class RenderLoopTest {

    private val readerThread = HandlerThread("reader").apply { start() }
    private val reader = ImageReader.newInstance(LOGICAL_WIDTH, LOGICAL_HEIGHT, PixelFormat.RGBA_8888, 3).apply {
        setOnImageAvailableListener({ r -> r.acquireLatestImage()?.close() }, Handler(readerThread.looper))
    }

    private val holder = object : SurfaceHolder {
        override fun getSurface(): Surface = reader.surface
        override fun lockHardwareCanvas(): Canvas = reader.surface.lockHardwareCanvas()
        override fun unlockCanvasAndPost(canvas: Canvas) = reader.surface.unlockCanvasAndPost(canvas)
        override fun addCallback(callback: SurfaceHolder.Callback?) = Unit
        override fun removeCallback(callback: SurfaceHolder.Callback?) = Unit
        override fun isCreating() = false
        @Deprecated("unused") override fun setType(type: Int) = Unit
        override fun setFixedSize(width: Int, height: Int) = Unit
        override fun setSizeFromLayout() = Unit
        override fun setFormat(format: Int) = Unit
        override fun setKeepScreenOn(screenOn: Boolean) = Unit
        override fun lockCanvas(): Canvas = throw UnsupportedOperationException()
        override fun lockCanvas(dirty: Rect?): Canvas = throw UnsupportedOperationException()
        override fun getSurfaceFrame() = Rect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
    }

    private val sim = CrackerSim(random = Mulberry32(3))
    private val draws = AtomicInteger()
    private val frames = AtomicInteger()
    private val renderer = object : Renderer {
        val inner = CanvasRenderer()
        override fun draw(canvas: Canvas, frame: RenderFrame) {
            inner.draw(canvas, frame)
            draws.incrementAndGet()
        }
    }
    private val loop = RenderLoop(holder, renderer)

    private val onFrame: (Double, Double) -> RenderFrame = { dt, now ->
        frames.incrementAndGet()
        if (frames.get() % 20 == 1) sim.createSparkBurst(960.0, 540.0)
        sim.step(dt)
        RenderFrame(sim, null, emptyList(), GamePhase.Playing, lowEnd = false, nowMs = now)
    }

    @After
    fun tearDown() {
        loop.stop()
        loop.surfaceDestroyed()
        loop.shutdown()
        reader.close()
        readerThread.quitSafely()
    }

    @Test
    fun drawsOnlyWhileStartedWithSurface() {
        loop.start(onFrame)            // started, but no surface yet
        Thread.sleep(300)
        assertThat(draws.get()).isEqualTo(0)

        loop.surfaceCreated()
        loop.start(onFrame)            // repeated start is harmless
        Thread.sleep(1500)
        assertThat(draws.get()).isGreaterThan(20)
        assertThat(loop.fps.value).isGreaterThan(5f)

        loop.surfaceDestroyed()        // returns only after any in-flight draw finished
        val afterDestroy = draws.get()
        Thread.sleep(300)
        assertThat(draws.get()).isEqualTo(afterDestroy)

        loop.surfaceCreated()
        Thread.sleep(500)
        assertThat(draws.get()).isGreaterThan(afterDestroy)

        loop.stop()
        loop.stop()
        Thread.sleep(100)
        val afterStop = draws.get()
        Thread.sleep(300)
        assertThat(draws.get()).isEqualTo(afterStop)

        // Restart after a thread shutdown (view detach/attach).
        loop.shutdown()
        loop.start(onFrame)
        Thread.sleep(500)
        assertThat(draws.get()).isGreaterThan(afterStop)
        assertThat(frames.get()).isAtLeast(draws.get())
    }
}
