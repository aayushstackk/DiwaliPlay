package com.aayush.diwaliplay.render

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FrameRateMonitorTest {

    @Test
    fun monitorSwitchesAfter2sBelow45() {
        val monitor = FrameRateMonitor(thresholdFps = 45f, windowMs = 2000.0)
        // 40 fps: 25 ms frames. 79 frames = 1975 ms is not yet a full 2 s window.
        repeat(79) { assertThat(monitor.record(25.0)).isFalse() }
        assertThat(monitor.record(25.0)).isTrue() // 80 frames = 2000 ms
        assertThat(monitor.isLowEnd).isTrue()
    }

    @Test
    fun monitorStaysOffAt60fps() {
        val monitor = FrameRateMonitor()
        repeat(600) { assertThat(monitor.record(1000.0 / 60.0)).isFalse() }
    }

    @Test
    fun monitorIgnoresSingleSpikes() {
        val monitor = FrameRateMonitor()
        repeat(120) { assertThat(monitor.record(16.7)).isFalse() }
        assertThat(monitor.record(150.0)).isFalse()   // one janky frame inside a 60 fps window
        repeat(120) { assertThat(monitor.record(16.7)).isFalse() }
        assertThat(monitor.record(1500.0)).isFalse()  // a stall (e.g. app paused) is not a frame-rate sample
        repeat(120) { assertThat(monitor.record(16.7)).isFalse() }
        assertThat(monitor.record(0.0)).isFalse()
        assertThat(monitor.record(-5.0)).isFalse()
        assertThat(monitor.isLowEnd).isFalse()
    }

    @Test
    fun monitorIsSticky() {
        val monitor = FrameRateMonitor()
        repeat(100) { monitor.record(30.0) } // ~33 fps for 3 s
        assertThat(monitor.isLowEnd).isTrue()
        repeat(1000) { assertThat(monitor.record(16.0)).isTrue() }
    }

    @Test
    fun monitorDoesNotSwitchWhenSlowPhaseIsShorterThanWindow() {
        val monitor = FrameRateMonitor()
        repeat(240) { monitor.record(16.7) }
        repeat(40) { assertThat(monitor.record(25.0)).isFalse() } // 1 s at 40 fps + 1 s at 60 fps averages 50 fps
        repeat(240) { assertThat(monitor.record(16.7)).isFalse() }
    }

    @Test
    fun resetForgetsTheVerdictAndTheSamples() {
        val monitor = FrameRateMonitor()
        repeat(100) { monitor.record(30.0) }
        assertThat(monitor.isLowEnd).isTrue()
        monitor.reset()
        assertThat(monitor.isLowEnd).isFalse()
        repeat(66) { assertThat(monitor.record(30.0)).isFalse() } // 1.98 s: not yet a whole window
        assertThat(monitor.record(30.0)).isTrue()
    }
}

class RoundLowEndTest {
    private val slow = 30.0 // 33 fps
    private val fast = 1000.0 / 60.0

    private fun RoundLowEnd.frames(n: Int, playing: Boolean, dtMs: Double): Boolean {
        var last = false
        repeat(n) { last = onFrame(playing, dtMs) }
        return last
    }

    @Test
    fun slowFramesOutsidePlayDontCount() {
        val low = RoundLowEnd()
        assertThat(low.frames(600, playing = false, dtMs = slow)).isFalse()
    }

    @Test
    fun slowFramesBeforeTheRoundDontCarryIntoIt() {
        val low = RoundLowEnd()
        low.frames(600, playing = false, dtMs = slow)
        assertThat(low.frames(66, playing = true, dtMs = slow)).isFalse()
        assertThat(low.onFrame(true, slow)).isTrue()
    }

    @Test
    fun stickyWithinARoundAndUntilTheNext() {
        val low = RoundLowEnd()
        assertThat(low.frames(100, playing = true, dtMs = slow)).isTrue()
        assertThat(low.frames(600, playing = true, dtMs = fast)).isTrue()
        assertThat(low.frames(600, playing = false, dtMs = fast)).isTrue()
    }

    @Test
    fun eachRoundIsJudgedAfresh() {
        val low = RoundLowEnd()
        low.frames(100, playing = true, dtMs = slow)
        low.frames(10, playing = false, dtMs = fast)
        assertThat(low.onFrame(true, fast)).isFalse()
        assertThat(low.frames(600, playing = true, dtMs = fast)).isFalse()
    }

    @Test
    fun noDeltaYetIsNotASample() {
        val low = RoundLowEnd()
        assertThat(low.onFrame(true, -1.0)).isFalse()
    }
}
