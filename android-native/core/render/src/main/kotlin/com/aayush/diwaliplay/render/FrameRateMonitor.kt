package com.aayush.diwaliplay.render

/**
 * Low-end fallback trigger (spec §5): once the render rate, averaged over the last [windowMs] of frames, is
 * below [thresholdFps], low-end mode switches on for the rest of the session (sticky).
 *
 * The web (`recordFrameTimeForAdaptiveQuality`, src/utils/device.ts) averages 30 frames and ignores deltas
 * outside (0, 200) ms; this keeps that sample filter (pauses and resumes are not frame-rate samples) but uses
 * the spec's time window. Allocation-free; not thread-safe (call from the render thread).
 */
class FrameRateMonitor(
    private val thresholdFps: Float = 45f,
    private val windowMs: Double = 2000.0,
) {
    private val samples = DoubleArray(CAPACITY)
    private var head = 0   // index of the oldest sample
    private var count = 0
    private var sumMs = 0.0

    /** True once low-end mode has been triggered; never resets. */
    var isLowEnd = false
        private set

    /** Records one frame delta. Returns true once low-end mode should be on (and on every later call). */
    fun record(dtMs: Double): Boolean {
        if (isLowEnd) return true
        if (!(dtMs > 0.0 && dtMs < MAX_SAMPLE_MS)) return false

        if (count == CAPACITY) dropOldest()
        samples[(head + count) % CAPACITY] = dtMs
        count++
        sumMs += dtMs
        // Keep just enough history to cover the window.
        while (count > 1 && sumMs - samples[head] >= windowMs) dropOldest()

        if (sumMs >= windowMs && count * 1000.0 / sumMs < thresholdFps) isLowEnd = true
        return isLowEnd
    }

    private fun dropOldest() {
        sumMs -= samples[head]
        head = (head + 1) % CAPACITY
        count--
    }

    private companion object {
        const val MAX_SAMPLE_MS = 200.0
        /** Enough for a 2 s window at 500 fps. */
        const val CAPACITY = 1024
    }
}
