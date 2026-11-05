package com.aayush.diwaliplay.tracking.camera

import java.util.concurrent.Executor

/**
 * Keeps one landmarker across runs, apart from MediaPipe's types. Loading the model takes seconds, so it happens once
 * (the web creates one per mount, useHandTracking.ts) and on [buildExecutor], not the thread the camera frames arrive
 * on: frames must keep reaching the backdrop and the photo while it loads.
 *
 * [closeExecutor] is the thread that detects, so a host can't be closed with a detect in progress on it.
 */
internal class LandmarkerKeeper<H : Any>(
    private val buildExecutor: Executor,
    private val closeExecutor: Executor,
    private val build: () -> H,
    private val close: (H) -> Unit,
) {
    @Volatile private var kept: H? = null
    @Volatile private var broken = false

    /** The landmarker to detect with: null until built, and from when it's marked broken. Any thread. */
    val host: H? get() = if (broken) null else kept

    /** Builds one unless a good one is kept. One of the callbacks then runs, on the build thread. */
    fun ensure(onReady: (H) -> Unit, onFailed: (Throwable) -> Unit) {
        buildExecutor.execute {
            if (broken) discard()
            val existing = kept
            if (existing != null) {
                onReady(existing)
            } else {
                try {
                    val built = build()
                    kept = built
                    onReady(built)
                } catch (t: Throwable) {
                    onFailed(t)
                }
            }
        }
    }

    /** It can't be trusted any more: stop using it, and replace it at the next [ensure]. Any thread. */
    fun markBroken() {
        broken = true
    }

    /** Lets go of the memory. The next [ensure] builds a new one. Any thread. */
    fun release() {
        buildExecutor.execute { discard() }
    }

    private fun discard() {
        val old = kept
        kept = null
        broken = false
        if (old != null) closeExecutor.execute { close(old) }
    }
}

/**
 * Says which run a landmarker result belongs to. The landmarker outlives runs, and its timestamps strictly increase for
 * its whole life, so each run owns everything from its first frame's timestamp up. A result from before that is left
 * over from an earlier run. Allocates only when a run begins.
 */
internal class RunStamps {
    private class Run(val generation: Int, val firstTimestampMs: Long)

    @Volatile private var run: Run? = null

    /** Analysis thread, just before a frame goes in. False: a newer run has begun, so don't send this frame. */
    fun onFrame(generation: Int, timestampMs: Long): Boolean {
        val current = run
        if (current != null && generation < current.generation) return false
        if (current == null || generation != current.generation) run = Run(generation, timestampMs)
        return true
    }

    /** Result thread. Null: the frame is from an earlier run. */
    fun generationOf(timestampMs: Long): Int? = run?.takeIf { timestampMs >= it.firstTimestampMs }?.generation
}

/**
 * The result of the GPU probe, remembered for the process: it costs a whole model load, and the answer doesn't change.
 * GPU trouble later on (the emulator's GPU creates fine then fails, for one) makes it false for the rest of the process.
 */
internal class GpuProbeMemo {
    private var usable: Boolean? = null

    /** Runs [probe] the first time only. [probe] throwing means no. */
    @Synchronized
    fun usable(probe: () -> Boolean): Boolean = usable ?: try {
        probe()
    } catch (e: VirtualMachineError) {
        throw e
    } catch (_: Throwable) {
        false
    }.also { usable = it }

    @Synchronized
    fun markUnusable() {
        usable = false
    }
}
