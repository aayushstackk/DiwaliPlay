package com.aayush.diwaliplay.render

import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.cracker.ParticleView
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SparkBatcherTest {

    private data class P(
        override val x: Double,
        override val y: Double,
        override val trailX: Double,
        override val trailY: Double,
        override val alpha: Double,
        override val size: Double,
        override val color: Int,
        override val flicker: Boolean = false,
        override val active: Boolean = true,
    ) : ParticleView

    private class FixedRandom(private val value: Double) : GameRandom {
        var calls = 0
        override fun nextDouble(): Double { calls++; return value }
    }

    private val red = 0xFFEF4444.toInt()
    private val blue = 0xFF3B82F6.toInt()

    /** (color, alphaLevel, sizeLevel) -> count, for every batch the batcher produced. */
    private fun SparkBatcher.summary(): Map<Triple<Int, Int, Int>, Int> =
        (0 until batchCount).associate { Triple(color(it), alphaLevel(it), sizeLevel(it)) to count(it) }

    @Test
    fun batcherGroupsByColourAlphaSize() {
        val particles = arrayOf<ParticleView>(
            P(10.0, 10.0, 5.0, 5.0, alpha = 0.90, size = 1.5, color = red),   // red, a4, s0
            P(20.0, 20.0, 15.0, 15.0, alpha = 0.95, size = 1.0, color = red), // red, a4, s0
            P(30.0, 30.0, 30.0, 30.0, alpha = 0.50, size = 2.5, color = red), // red, a2, s1 (zero-length)
            P(40.0, 40.0, 35.0, 35.0, alpha = 0.90, size = 5.0, color = blue),// blue, a4, s2
            P(50.0, 50.0, 45.0, 45.0, alpha = 1.00, size = 3.0, color = red), // red, a4 (min(4, 5)), s2
            P(60.0, 60.0, 55.0, 55.0, alpha = 0.90, size = 1.0, color = red, active = false),
        )
        val batcher = SparkBatcher(capacity = particles.size)
        batcher.build(particles, FixedRandom(0.0))

        assertThat(batcher.summary()).containsExactly(
            Triple(red, 4, 0), 2,
            Triple(red, 2, 1), 1,
            Triple(red, 4, 2), 1,
            Triple(blue, 4, 2), 1,
        )
        assertThat(batcher.lineCount).isEqualTo(5)
        for (b in 0 until batcher.batchCount) {
            assertThat(batcher.drawAlpha(b)).isWithin(1e-6f).of((batcher.alphaLevel(b) + 0.5f) / 5f)
            assertThat(batcher.strokeWidth(b)).isEqualTo(floatArrayOf(2.1f, 3.2f, 4.7f)[batcher.sizeLevel(b)])
        }

        // Segment coordinates run trail -> head; the zero-length streak is nudged by +0.01 in x.
        val zeroBatch = (0 until batcher.batchCount).single { batcher.alphaLevel(it) == 2 }
        val off = batcher.lineOffset(zeroBatch)
        assertThat(batcher.lines.copyOfRange(off, off + 4).toList())
            .containsExactly(30f, 30f, 30.01f, 30f).inOrder()

        val pairBatch = (0 until batcher.batchCount).single { batcher.color(it) == red && batcher.sizeLevel(it) == 0 }
        val o = batcher.lineOffset(pairBatch)
        assertThat(batcher.lines.copyOfRange(o, o + 8).toList())
            .containsExactly(5f, 5f, 10f, 10f, 15f, 15f, 20f, 20f).inOrder()
    }

    @Test
    fun batcherSkipsAlphaBelow0_02() {
        val particles = arrayOf<ParticleView>(
            P(1.0, 1.0, 0.0, 0.0, alpha = 0.02, size = 2.0, color = red),   // skipped (<= 0.02)
            P(1.0, 1.0, 0.0, 0.0, alpha = 0.0, size = 2.0, color = red),    // skipped
            P(1.0, 1.0, 0.0, 0.0, alpha = 0.021, size = 2.0, color = red),  // kept, level 0
            // Flicker roll > 0.85 dims to 0.6x: 0.03 -> 0.018, skipped.
            P(1.0, 1.0, 0.0, 0.0, alpha = 0.03, size = 2.0, color = blue, flicker = true),
        )
        val batcher = SparkBatcher(capacity = particles.size)
        batcher.build(particles, FixedRandom(0.9))

        assertThat(batcher.summary()).containsExactly(Triple(red, 0, 1), 1)
        assertThat(batcher.lineCount).isEqualTo(1)
    }

    @Test
    fun batcherAppliesFlickerOnlyToFlickeringSparksAboveRoll() {
        val particles = arrayOf<ParticleView>(
            P(1.0, 1.0, 0.0, 0.0, alpha = 0.5, size = 1.0, color = red, flicker = true),  // 0.3 -> level 1
            P(1.0, 1.0, 0.0, 0.0, alpha = 0.5, size = 1.0, color = blue),                 // level 2, no roll
        )
        val dimming = FixedRandom(0.9)
        val dimmed = SparkBatcher(capacity = 2).apply { build(particles, dimming) }
        assertThat(dimmed.summary()).containsExactly(Triple(red, 1, 0), 1, Triple(blue, 2, 0), 1)
        assertThat(dimming.calls).isEqualTo(1)

        val steady = SparkBatcher(capacity = 2).apply { build(particles, FixedRandom(0.85)) }
        assertThat(steady.summary()).containsExactly(Triple(red, 2, 0), 1, Triple(blue, 2, 0), 1)
    }

    @Test
    fun batcherReusesStateAcrossFrames() {
        val batcher = SparkBatcher(capacity = 2)
        batcher.build(arrayOf(P(1.0, 1.0, 0.0, 0.0, 0.9, 1.0, red), P(1.0, 1.0, 0.0, 0.0, 0.9, 1.0, blue)), FixedRandom(0.0))
        assertThat(batcher.batchCount).isEqualTo(2)
        batcher.build(arrayOf(P(1.0, 1.0, 0.0, 0.0, 0.9, 1.0, blue)), FixedRandom(0.0))
        assertThat(batcher.summary()).containsExactly(Triple(blue, 4, 0), 1)
        batcher.build(emptyArray(), FixedRandom(0.0))
        assertThat(batcher.batchCount).isEqualTo(0)
        assertThat(batcher.lineCount).isEqualTo(0)
    }
}
