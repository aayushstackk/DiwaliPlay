package com.aayush.diwaliplay.render

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.cracker.CrackerSim

/**
 * Port of `CrackerEngine.render()` (src/utils/crackerEngine.ts): screen flash, shockwave rings and batched
 * sparks with additive blending ('lighter' -> PorterDuff ADD). Allocation-free per frame.
 *
 * Each batch is one `Canvas.drawLines` call instead of the web's single path `stroke()` (controller ruling:
 * hardware-canvas path stroking rasterises a mask and is much slower on the Mali GPU). Known deviation: in a
 * path stroke overlapping segments of one batch are painted once, while each `drawLines` segment is blended
 * separately, so where streaks of the same batch overlap (dense burst centres) ADD makes them slightly brighter.
 */
internal class CrackerRenderer(private val random: GameRandom) {
    private val batcher = SparkBatcher()

    private val flashPaint = Paint().apply { style = Paint.Style.FILL }

    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.5f
        xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
    }

    private val sparkPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
    }

    fun draw(canvas: Canvas, sim: CrackerSim, lowEnd: Boolean) {
        // 1. Screen flash (skipped in low-end mode: full-screen fill). Normal blending, like the web.
        val flash = sim.flashIntensity
        if (!lowEnd && sim.flashEnabled && flash > 0.02) {
            flashPaint.color = Colors.rgba(255, 245, 210, flash * 0.3)
            canvas.drawRect(0f, 0f, LOGICAL_WIDTH.toFloat(), LOGICAL_HEIGHT.toFloat(), flashPaint)
        }

        // 2. Shockwave rings.
        val rings = sim.rings
        for (i in rings.indices) {
            val r = rings[i]
            if (!r.active) continue
            ringPaint.color = Colors.withAlpha(r.color, r.alpha)
            canvas.drawCircle(r.x.toFloat(), r.y.toFloat(), r.radius.toFloat(), ringPaint)
        }

        // 3. Sparks: one drawLines per colour/alpha/size batch.
        batcher.build(sim.particles, random)
        val lines = batcher.lines
        for (b in 0 until batcher.batchCount) {
            sparkPaint.color = batcher.color(b)
            sparkPaint.alpha = (batcher.drawAlpha(b) * 255f + 0.5f).toInt()
            sparkPaint.strokeWidth = batcher.strokeWidth(b)
            canvas.drawLines(lines, batcher.lineOffset(b), batcher.count(b) * 4, sparkPaint)
        }
    }
}
