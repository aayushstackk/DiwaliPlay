package com.aayush.diwaliplay.render

import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.view.Choreographer
import android.view.SurfaceHolder
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Drives a [Renderer] on a dedicated [HandlerThread] paced by that thread's [Choreographer]. Each vsync it calls
 * `onFrame(dtSeconds, nowMs)` (which steps the game and returns the frame), then draws with
 * `lockHardwareCanvas()`.
 *
 * Lifecycle rules (all methods are safe to call repeatedly, from any thread):
 * - frames run only while [start]ed **and** a surface is available;
 * - [surfaceDestroyed] blocks until any in-flight draw has posted, and no draw starts after it returns;
 * - [shutdown] quits the thread; a later [start] or [surfaceCreated] makes a new one.
 *
 * `nowMs` is `frameTimeNanos / 1e6` (the `System.nanoTime` / uptime clock); step the sims with the same value.
 */
class RenderLoop(
    private val holder: SurfaceHolder,
    private val renderer: Renderer,
    private val monitor: FrameRateMonitor = FrameRateMonitor(),
) : Choreographer.FrameCallback {

    private val lock = Any()            // guards thread/handler and the wanted-running flag
    private val surfaceLock = Any()     // held for the whole lock/draw/post of a frame

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    @Volatile private var running = false
    @Volatile private var onFrame: ((Double, Double) -> RenderFrame)? = null
    private var hasSurface = false      // guarded by surfaceLock

    // Render-thread-only state.
    private var choreographer: Choreographer? = null
    private var scheduled = false
    private var lastFrameNanos = 0L
    private var fpsWindowStartNanos = 0L
    private var fpsFrames = 0

    private val _fps = MutableStateFlow(0f)
    /** Frames per second, updated twice a second while running. */
    val fps: StateFlow<Float> = _fps.asStateFlow()

    private val _lowEnd = MutableStateFlow(false)
    /** Becomes (and stays) true once [FrameRateMonitor] decides low-end mode should switch on. */
    val lowEnd: StateFlow<Boolean> = _lowEnd.asStateFlow()

    fun start(onFrame: (dtSeconds: Double, nowMs: Double) -> RenderFrame) {
        synchronized(lock) {
            this.onFrame = onFrame
            running = true
            ensureThread().post(::scheduleIfNeeded)
        }
    }

    fun stop() {
        synchronized(lock) {
            running = false
            handler?.post(::unschedule)
        }
    }

    fun surfaceCreated() {
        synchronized(surfaceLock) { hasSurface = true }
        synchronized(lock) { if (running) ensureThread().post(::scheduleIfNeeded) }
    }

    fun surfaceDestroyed() {
        // Waits for an in-flight draw (which holds surfaceLock) and blocks any new one.
        synchronized(surfaceLock) { hasSurface = false }
        synchronized(lock) { handler?.post(::unschedule) }
    }

    /** Stops the thread (e.g. view detached). Keeps the started state so [start]/[surfaceCreated] resume. */
    fun shutdown() {
        synchronized(lock) {
            val h = handler ?: return
            h.post {
                unschedule()
                choreographer = null // belongs to the old looper
            }
            thread?.quitSafely()
            thread = null
            handler = null
        }
    }

    /** Re-creates the thread after [shutdown] if the loop is still wanted. */
    fun resume() {
        synchronized(lock) { if (running) ensureThread().post(::scheduleIfNeeded) }
    }

    private fun ensureThread(): Handler {
        handler?.let { return it }
        val t = HandlerThread("DiwaliRender", Process.THREAD_PRIORITY_DISPLAY).apply { start() }
        thread = t
        return Handler(t.looper).also { handler = it }
    }

    // ---- render thread ---------------------------------------------------------------------------------

    private fun scheduleIfNeeded() {
        if (scheduled || !running) return
        val surface = synchronized(surfaceLock) { hasSurface }
        if (!surface) return
        val c = choreographer ?: Choreographer.getInstance().also { choreographer = it }
        lastFrameNanos = 0L
        fpsWindowStartNanos = 0L
        scheduled = true
        c.postFrameCallback(this)
    }

    private fun unschedule() {
        if (!scheduled) return
        choreographer?.removeFrameCallback(this)
        scheduled = false
    }

    override fun doFrame(frameTimeNanos: Long) {
        scheduled = false
        val callback = onFrame
        if (!running || callback == null) return

        val dtSeconds = if (lastFrameNanos == 0L) 1.0 / 60.0 else (frameTimeNanos - lastFrameNanos) / 1e9
        if (lastFrameNanos != 0L && monitor.record(dtSeconds * 1000.0) && !_lowEnd.value) _lowEnd.value = true
        lastFrameNanos = frameTimeNanos
        updateFps(frameTimeNanos)

        val surfaceStillThere = synchronized(surfaceLock) {
            if (hasSurface) {
                val frame = callback(dtSeconds, frameTimeNanos / 1_000_000.0)
                val canvas = try {
                    holder.lockHardwareCanvas()
                } catch (_: IllegalStateException) {
                    null
                } catch (_: IllegalArgumentException) {
                    null
                }
                if (canvas != null) {
                    try {
                        renderer.draw(canvas, frame)
                    } finally {
                        holder.unlockCanvasAndPost(canvas)
                    }
                }
            }
            hasSurface
        }
        // Keep pacing on vsync; surfaceCreated()/start() re-arm if either went away.
        if (running && surfaceStillThere) {
            scheduled = true
            choreographer?.postFrameCallback(this)
        }
    }

    private fun updateFps(frameTimeNanos: Long) {
        if (fpsWindowStartNanos == 0L) {
            fpsWindowStartNanos = frameTimeNanos
            fpsFrames = 0
            return
        }
        fpsFrames++
        val elapsed = frameTimeNanos - fpsWindowStartNanos
        if (elapsed >= FPS_WINDOW_NANOS) {
            _fps.value = (fpsFrames * 1e9 / elapsed).toFloat()
            fpsWindowStartNanos = frameTimeNanos
            fpsFrames = 0
        }
    }

    private companion object {
        const val FPS_WINDOW_NANOS = 500_000_000L
    }
}
