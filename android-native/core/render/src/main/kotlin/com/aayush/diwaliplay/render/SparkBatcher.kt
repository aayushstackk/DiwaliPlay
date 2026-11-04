package com.aayush.diwaliplay.render

import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.cracker.ParticleView
import kotlin.math.floor
import kotlin.math.min

/**
 * Pure port of the batching in `CrackerEngine.render()` (src/utils/crackerEngine.ts): live sparks are grouped
 * by colour x 5 alpha levels x 3 size levels so each group is drawn with one stroke call.
 *
 * - Flicker: `p.flicker && random > 0.85 ? alpha * 0.6 : alpha` (one roll per flickering spark, like the web).
 * - Sparks with alpha <= 0.02 are skipped.
 * - Alpha level = min(4, floor(alpha * 5)), drawn at (level + 0.5) / 5.
 * - Size level: size < 2 -> 0, < 3 -> 1, else 2; stroke widths 2.1, 3.2, 4.7 (round caps).
 * - A zero-length streak gets its head nudged by +0.01 in x so the round cap still draws a dot.
 *
 * Output is a flat [lines] array of `trailX, trailY, headX, headY` segments, contiguous per batch, ready for
 * `Canvas.drawLines(lines, lineOffset(b), count(b) * 4, paint)`. Batches are ordered by colour (first-seen
 * order, kept across frames as the web's Map does) then by bucket. Allocation-free once warmed up (it only
 * grows when a new colour or more sparks than [capacity] appear). Not thread-safe.
 */
class SparkBatcher(capacity: Int = 700) {

    /** `trailX, trailY, headX, headY` per segment; valid up to `lineCount * 4`. */
    var lines = FloatArray(capacity * 4)
        private set
    var lineCount = 0
        private set
    var batchCount = 0
        private set

    private var colors = IntArray(16)
    private var colorCount = 0
    private var lastColor = 0
    private var lastColorIndex = -1

    // Per accepted spark: bucket key and pool index, then the counting-sort output.
    private var keys = IntArray(capacity)
    private var indices = IntArray(capacity)
    private var keyCounts = IntArray(16 * BUCKETS_PER_COLOR)

    private var batchKey = IntArray(16 * BUCKETS_PER_COLOR)
    private var batchStart = IntArray(16 * BUCKETS_PER_COLOR)
    private var batchSize = IntArray(16 * BUCKETS_PER_COLOR)

    fun color(batch: Int): Int = colors[batchKey[batch] / BUCKETS_PER_COLOR]
    fun alphaLevel(batch: Int): Int = (batchKey[batch] % BUCKETS_PER_COLOR) / SIZE_LEVELS
    fun sizeLevel(batch: Int): Int = batchKey[batch] % SIZE_LEVELS
    /** Web `globalAlpha = (alphaLevel + 0.5) / ALPHA_LEVELS`. */
    fun drawAlpha(batch: Int): Float = (alphaLevel(batch) + 0.5f) / ALPHA_LEVELS
    fun strokeWidth(batch: Int): Float = STROKE_WIDTHS[sizeLevel(batch)]
    /** Number of segments in [batch]. */
    fun count(batch: Int): Int = batchSize[batch]
    /** Float offset of [batch]'s first segment in [lines]. */
    fun lineOffset(batch: Int): Int = batchStart[batch] * 4

    fun build(particles: Array<out ParticleView>, random: GameRandom) {
        if (keys.size < particles.size) {
            keys = IntArray(particles.size)
            indices = IntArray(particles.size)
            lines = FloatArray(particles.size * 4)
        }

        // 1. Classify live sparks.
        var n = 0
        for (i in particles.indices) {
            val p = particles[i]
            if (!p.active) continue
            val alpha = if (p.flicker && random.nextDouble() > 0.85) p.alpha * 0.6 else p.alpha
            if (alpha <= 0.02) continue
            val alphaLevel = min(ALPHA_LEVELS - 1, floor(alpha * ALPHA_LEVELS).toInt())
            val size = p.size
            val sizeLevel = if (size < 2.0) 0 else if (size < 3.0) 1 else 2
            keys[n] = colorIndex(p.color) * BUCKETS_PER_COLOR + alphaLevel * SIZE_LEVELS + sizeLevel
            indices[n] = i
            n++
        }

        // 2. Counting sort by key -> contiguous batches.
        val keySpace = colorCount * BUCKETS_PER_COLOR
        if (keyCounts.size < keySpace) {
            val grown = keySpace * 2
            keyCounts = IntArray(grown)
            batchKey = IntArray(grown)
            batchStart = IntArray(grown)
            batchSize = IntArray(grown)
        }
        keyCounts.fill(0, 0, keySpace)
        for (k in 0 until n) keyCounts[keys[k]]++

        var batches = 0
        var running = 0
        for (key in 0 until keySpace) {
            val c = keyCounts[key]
            if (c == 0) continue
            batchKey[batches] = key
            batchStart[batches] = running
            batchSize[batches] = c
            keyCounts[key] = running // becomes the write cursor for this key
            running += c
            batches++
        }

        // 3. Emit segments in batch order (stable within a batch, like the web's per-bucket push order).
        val out = lines
        for (k in 0 until n) {
            val slot = keyCounts[keys[k]]++
            val p = particles[indices[k]]
            val o = slot * 4
            out[o] = p.trailX.toFloat()
            out[o + 1] = p.trailY.toFloat()
            val headX = if (p.x == p.trailX && p.y == p.trailY) p.x + 0.01 else p.x
            out[o + 2] = headX.toFloat()
            out[o + 3] = p.y.toFloat()
        }

        lineCount = n
        batchCount = batches
    }

    private fun colorIndex(color: Int): Int {
        if (lastColorIndex >= 0 && color == lastColor) return lastColorIndex
        var idx = -1
        for (c in 0 until colorCount) if (colors[c] == color) { idx = c; break }
        if (idx < 0) {
            if (colorCount == colors.size) colors = colors.copyOf(colorCount * 2)
            colors[colorCount] = color
            idx = colorCount++
        }
        lastColor = color
        lastColorIndex = idx
        return idx
    }

    companion object {
        const val ALPHA_LEVELS = 5
        const val SIZE_LEVELS = 3
        const val BUCKETS_PER_COLOR = ALPHA_LEVELS * SIZE_LEVELS
        /** Web `SIZE_LEVEL_WIDTHS`. */
        private val STROKE_WIDTHS = floatArrayOf(2.1f, 3.2f, 4.7f)
    }
}
