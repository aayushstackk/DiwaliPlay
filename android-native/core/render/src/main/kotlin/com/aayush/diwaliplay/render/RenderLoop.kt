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
 * Lifecycle guarantees (all methods are safe to call repeatedly, from any thread):
 * - frames run only while [start]ed **and** a surface is available;
 * - after [stop] returns, `onFrame` is not called again (an in-flight frame is waited out) until the next [start];
 * - after [surfaceDestroyed] returns, nothing is drawn until [surfaceCreated] (an in-flight draw is waited out);
 * - [shutdown] quits and joins the render thread; a later [start]/[resume]/[surfaceCreated] makes a new one.
 *
 * Each render thread is a [Generation] owning its own Choreographer, scheduling flag and timing, so state never
 * leaks between threads: a stale generation's callbacks see they are no longer current and do nothing.
 *
 * `nowMs` is `frameTimeNanos / 1e6` (the `System.nanoTime` / uptime clock); step the sims with the same value.
 */
class RenderLoop(
    private val holder: SurfaceHolder,
    private val renderer: Renderer,
    private val monitor: FrameRateMonitor = FrameRateMonitor(),
) {
    private val lock = Any()        // guards generation creation/teardown and onFrame assignment
    /** Held for a whole frame (running check, onFrame, lock/draw/post); taken by stop()/surfaceDestroyed(). */
    private val frameLock = Any()

    @Volatile private var current: Generation? = null
    @Volatile private var running = false
    @Volatile private var onFrame: ((Double, Double) -> RenderFrame)? = null
    @Volatile private var hasSurface = false

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
            ensureGeneration().requestSchedule()
        }
    }

    /** After this returns, `onFrame` will not be called until the next [start]. */
    fun stop() {
        running = false
        synchronized(frameLock) { }   // wait out a frame already past its running check
        current?.requestUnschedule()
    }

    fun surfaceCreated() {
        hasSurface = true
        synchronized(lock) { if (running) ensureGeneration().requestSchedule() }
    }

    /** After this returns nothing more is drawn to the old surface. */
    fun surfaceDestroyed() {
        hasSurface = false
        synchronized(frameLock) { }   // wait out an in-flight lock/draw/post
        current?.requestUnschedule()
    }

    /** Quits and joins the render thread (e.g. view detached). Keeps the started state so [resume] continues. */
    fun shutdown() {
        val old: Generation
        synchronized(lock) {
            old = current ?: return
            current = null
            old.retire()
        }
        // Join outside `lock`: the render thread never takes `lock`, so this can't deadlock.
        if (Thread.currentThread() !== old.thread) old.thread.join(JOIN_TIMEOUT_MS)
    }

    /** Re-creates the thread after [shutdown] if the loop is still wanted. */
    fun resume() {
        synchronized(lock) { if (running) ensureGeneration().requestSchedule() }
    }

    private fun ensureGeneration(): Generation = current ?: Generation().also { current = it }

    /** One render thread and all state confined to it. */
    private inner class Generation : Choreographer.FrameCallback {
        val thread = HandlerThread("DiwaliRender", Process.THREAD_PRIORITY_DISPLAY).apply { start() }
        private val handler = Handler(thread.looper)
        @Volatile private var retired = false

        // Confined to [thread].
        private var choreographer: Choreographer? = null
        private var scheduled = false
        private var lastFrameNanos = 0L
        private var fpsWindowStartNanos = 0L
        private var fpsFrames = 0

        private val scheduleTask = Runnable { scheduleIfNeeded() }
        private val unscheduleTask = Runnable { unschedule() }

        fun requestSchedule() { handler.post(scheduleTask) }
        fun requestUnschedule() { handler.post(unscheduleTask) }

        fun retire() {
            retired = true
            handler.post(unscheduleTask)
            thread.quitSafely()
        }

        private fun isCurrent() = !retired && current === this

        private fun scheduleIfNeeded() {
            if (scheduled || !running || !hasSurface || !isCurrent()) return
            val c = choreographer ?: Choreographer.getInstance().also { choreographer = it }
            lastFrameNanos = 0L
            fpsWindowStartNanos = 0L
            scheduled = true
            c.postFrameCallback(this)
        }

        private fun unschedule() {
            // A stop/destroy request that lost a race with start/create must not kill a wanted loop.
            if (!scheduled || (running && hasSurface && isCurrent())) return
            choreographer?.removeFrameCallback(this)
            scheduled = false
        }

        override fun doFrame(frameTimeNanos: Long) {
            scheduled = false
            synchronized(frameLock) {
                val callback = onFrame
                if (!running || !hasSurface || callback == null || !isCurrent()) return

                val dtSeconds = if (lastFrameNanos == 0L) 1.0 / 60.0 else (frameTimeNanos - lastFrameNanos) / 1e9
                if (lastFrameNanos != 0L && monitor.record(dtSeconds * 1000.0) && !_lowEnd.value) _lowEnd.value = true
                lastFrameNanos = frameTimeNanos
                updateFps(frameTimeNanos)

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
            // Keep pacing on vsync; start()/surfaceCreated()/resume() re-arm if anything went away.
            if (running && hasSurface && isCurrent()) {
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
    }

    private companion object {
        const val FPS_WINDOW_NANOS = 500_000_000L
        const val JOIN_TIMEOUT_MS = 1000L
    }
}
