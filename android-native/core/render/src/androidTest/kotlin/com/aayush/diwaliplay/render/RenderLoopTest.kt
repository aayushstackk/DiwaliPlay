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
import com.google.common.truth.Truth.assertWithMessage
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

    @Test
    fun noOnFrameAfterStopReturns() {
        // A slow game step makes stop() very likely to land while a frame is in flight.
        val inFlight = AtomicInteger()
        val slowFrame: (Double, Double) -> RenderFrame = { dt, now ->
            inFlight.incrementAndGet()
            Thread.sleep(15)
            onFrame(dt, now)
        }
        loop.surfaceCreated()
        repeat(40) {
            loop.start(slowFrame)
            Thread.sleep(25)
            loop.stop()
            val afterStop = frames.get()
            Thread.sleep(30)
            assertThat(frames.get()).isEqualTo(afterStop)
        }
        assertThat(inFlight.get()).isGreaterThan(0)
    }

    @Test
    fun survivesShutdownRestartAndSurfaceChurn() {
        loop.surfaceCreated()
        loop.start(onFrame)
        repeat(8) { round ->
            val churn = Thread {
                repeat(80) { i ->
                    when (i % 4) {
                        0 -> { loop.shutdown(); loop.start(onFrame) }
                        1 -> { loop.surfaceDestroyed(); loop.surfaceCreated() }
                        2 -> { loop.shutdown(); loop.resume() }
                        else -> { loop.stop(); loop.start(onFrame) }
                    }
                }
            }
            churn.start()
            repeat(80) { i ->
                if (i % 2 == 0) { loop.shutdown(); loop.start(onFrame) } else { loop.surfaceDestroyed(); loop.surfaceCreated() }
            }
            churn.join()
            // Tight restart without letting the old thread clean up first.
            repeat(50) { loop.shutdown(); loop.start(onFrame) }

            // Whatever the interleaving, the loop must still be alive and pacing frames.
            val before = draws.get()
            Thread.sleep(400)
            assertWithMessage("round $round").that(draws.get() - before).isGreaterThan(5)
        }

        // And a final destroy still stops drawing.
        loop.surfaceDestroyed()
        val afterDestroy = draws.get()
        Thread.sleep(200)
        assertThat(draws.get()).isEqualTo(afterDestroy)
    }
}
