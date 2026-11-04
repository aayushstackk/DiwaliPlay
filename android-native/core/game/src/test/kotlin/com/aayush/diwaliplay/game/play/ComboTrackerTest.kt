package com.aayush.diwaliplay.game.play

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComboTrackerTest {
    @Test
    fun thirdHitWithinWindowAwardsAndClears() {
        val t = ComboTracker()
        assertThat(t.recordHit(0.0)).isFalse()
        assertThat(t.recordHit(400.0)).isFalse()
        assertThat(t.recordHit(1000.0)).isTrue() // 1000 - 0 <= 1000 (inclusive window)
        // cleared: the next hit starts a fresh streak
        assertThat(t.recordHit(1100.0)).isFalse()
        assertThat(t.recordHit(1200.0)).isFalse()
    }

    @Test
    fun hitJustOutsideWindowDropsOldest() {
        val t = ComboTracker()
        t.recordHit(0.0)
        t.recordHit(500.0)
        // 1001 - 0 = 1001 > 1000 -> first hit expires, streak is [500, 1001] -> 2 hits, no award
        assertThat(t.recordHit(1001.0)).isFalse()
    }

    @Test
    fun resetReportsWhetherStreakWasBroken() {
        val t = ComboTracker()
        assertThat(t.reset()).isFalse()
        t.recordHit(0.0)
        assertThat(t.reset()).isTrue()
        assertThat(t.reset()).isFalse()
    }
}
