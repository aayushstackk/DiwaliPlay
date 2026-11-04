package com.aayush.diwaliplay.render

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import com.aayush.diwaliplay.game.bomb.BombParticleType
import com.aayush.diwaliplay.game.bomb.BombSim
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Drawing half of `BombGameOverlay.tsx`, in the web's stacking order: bomb sprites (DOM slots, z auto), then
 * the effects canvas (z-10: exhaust, shockwave/flash/muzzle/ember/smoke/spark, score popups), then the mortar
 * row (z-20). Allocation-free per frame once sprites are cached.
 */
internal class BombRenderer(private val sprites: BombSprites) {

    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }

    private val popupFill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) Typeface.create(Typeface.DEFAULT, 900, false) else Typeface.DEFAULT_BOLD
        textSize = 24f
        textAlign = Paint.Align.CENTER
        style = Paint.Style.FILL
    }
    private val popupStroke = Paint(popupFill).apply {
        style = Paint.Style.STROKE
        strokeWidth = 5f
        strokeJoin = Paint.Join.ROUND
    }
    /** textBaseline 'middle': offset from the centre line to the alphabetic baseline. */
    private val popupBaselineOffset = popupFill.fontMetrics.let { -(it.ascent + it.descent) / 2f }

    private val runnerFill = Paint().apply {
        // bg-gradient-to-t from-neutral-950 via-neutral-900 to-amber-950/40 over the bottom 16 px.
        shader = LinearGradient(0f, LOGICAL_HEIGHT.toFloat(), 0f, LOGICAL_HEIGHT - 16f,
            intArrayOf(0xFF0A0A0A.toInt(), 0xFF171717.toInt(), Colors.rgba(69, 26, 3, 0.4)), null, Shader.TileMode.CLAMP)
    }
    private val runnerBorder = Paint().apply { color = Colors.rgba(245, 158, 11, 0.25); strokeWidth = 1f }

    fun draw(canvas: Canvas, bombs: BombSim, nowMs: Double) {
        drawBombs(canvas, bombs, nowMs)
        drawExhaust(canvas, bombs)
        drawEffects(canvas, bombs, nowMs)
        drawPopups(canvas, bombs, nowMs)
        drawMortars(canvas, bombs, nowMs)
    }

    private fun drawBombs(canvas: Canvas, sim: BombSim, now: Double) {
        val slots = sim.bombs
        for (i in slots.indices) {
            val b = slots[i]
            if (!b.active) continue
            var scale = b.scale
            var alpha = 1.0
            if (b.isBursting) {
                // Dissolve into the canvas explosion: fade over 220 ms, expand up to 1.35x over 200 ms.
                val e = now - b.burstStartMs
                alpha = max(0.0, 1 - e / 220)
                if (alpha <= 0) continue
                scale = b.scale * (1.0 + sin(min(1.0, e / 200) * (PI / 2)) * 0.35)
            }
            val sprite = sprites.get(b.config, b.radius)
            val box = sprite.boxSize
            canvas.save()
            canvas.translate(b.x.toFloat(), b.y.toFloat())
            canvas.scale(scale.toFloat(), scale.toFloat())
            // Inner rotation origin is 50% 55% of the box.
            canvas.rotate(b.rot.toFloat(), 0f, box * 0.05f)
            val inv = 1f / sprite.density
            canvas.translate(-box / 2f - sprite.margin, -box / 2f - sprite.margin)
            canvas.scale(inv, inv)
            bitmapPaint.alpha = (alpha * 255).toInt()
            canvas.drawBitmap(sprite.bitmap, 0f, 0f, bitmapPaint)
            canvas.restore()
        }
    }

    private fun drawExhaust(canvas: Canvas, sim: BombSim) {
        val slots = sim.bombs
        for (i in slots.indices) {
            val b = slots[i]
            if (!b.active || b.isBursting || b.vy >= -150) continue
            val x = b.x.toFloat()
            val y = (b.y + b.radius * 0.72).toFloat()
            fill.color = 0xFFF59E0B.toInt()
            canvas.drawOval(x - 4f, y - 10f, x + 4f, y + 10f, fill)
            fill.color = 0xFFFEF08A.toInt()
            canvas.drawOval(x - 2.5f, y - 2f - 6f, x + 2.5f, y - 2f + 6f, fill)
        }
    }

    private fun drawEffects(canvas: Canvas, sim: BombSim, now: Double) {
        val effects = sim.effects
        for (i in effects.indices) {
            val p = effects[i]
            if (!p.active) continue
            val elapsed = now - p.startMs
            if (elapsed >= p.lifetimeMs) continue
            // Smoke is scheduled up to 60 ms ahead, so progress can start negative.
            val t = (elapsed / p.lifetimeMs).coerceIn(0.0, 1.0)
            val x = p.x.toFloat()
            val y = p.y.toFloat()
            when (p.type) {
                BombParticleType.SHOCKWAVE -> {
                    ring.color = Colors.withAlpha(p.color, (1 - t) * 0.95)
                    ring.strokeWidth = max(1.0, 3.5 * (1 - t)).toFloat()
                    canvas.drawCircle(x, y, lerpSize(p.size, p.maxSize, t), ring)
                }
                BombParticleType.FLASH -> {
                    fill.color = Colors.withAlpha(0xFFFFFF, (1 - t) * 0.95)
                    canvas.drawCircle(x, y, lerpSize(p.size, p.maxSize, t), fill)
                }
                BombParticleType.MUZZLE -> {
                    fill.color = Colors.withAlpha(0xFEF08A, (1 - t) * 0.9)
                    canvas.drawCircle(x, y, lerpSize(p.size, p.maxSize, t), fill)
                }
                BombParticleType.EMBER -> {
                    fill.color = Colors.withAlpha(p.color, (1 - t) * 0.9)
                    canvas.drawCircle(x, y, max(1.0, p.size * (1 - t * 0.7)).toFloat(), fill)
                }
                BombParticleType.SMOKE -> {
                    fill.color = Colors.withAlpha(p.color, (1 - t) * p.alpha)
                    canvas.drawCircle(x, y, lerpSize(p.size, p.maxSize, t), fill)
                }
                BombParticleType.SPARK -> {
                    fill.color = Colors.withAlpha(p.color, (1 - t) * 0.85)
                    canvas.drawCircle(x, y, max(1.0, p.size * (1 - t * 0.6)).toFloat(), fill)
                }
            }
        }
    }

    private fun drawPopups(canvas: Canvas, sim: BombSim, now: Double) {
        val popups = sim.popups
        for (i in popups.indices) {
            val p = popups[i]
            if (!p.active) continue
            val elapsed = now - p.startMs
            if (elapsed >= p.durationMs || elapsed < 0) continue
            val t = elapsed / p.durationMs
            val y = (p.startY - sin(t * (PI / 2)) * 42).toFloat() + popupBaselineOffset
            val alpha = if (t > 0.65) max(0.0, 1 - (t - 0.65) / 0.35) else 1.0
            popupStroke.color = Colors.rgba(0, 0, 0, 0.9 * alpha)
            canvas.drawText(p.text, p.x.toFloat(), y, popupStroke)
            popupFill.color = Colors.withAlpha(if (p.isPenalty) 0xEF4444 else 0xFDE047, alpha)
            canvas.drawText(p.text, p.x.toFloat(), y, popupFill)
        }
    }

    /** Mortar row: runner strip, then each tube at `bottom-2`, origin 50% 90%, with gun-like recoil. */
    private fun drawMortars(canvas: Canvas, sim: BombSim, now: Double) {
        val h = LOGICAL_HEIGHT.toFloat()
        canvas.drawRect(0f, h - 16f, LOGICAL_WIDTH.toFloat(), h, runnerFill)
        canvas.drawLine(0f, h - 15.5f, LOGICAL_WIDTH.toFloat(), h - 15.5f, runnerBorder)

        val tube = sprites.mortar()
        val w = BombSprites.MORTAR_W
        val th = BombSprites.MORTAR_H
        val originY = h - 8f - th * 0.1f
        val inv = 1f / (tube.width / w)
        for (i in 0 until sim.mortarCount) {
            val angle = sim.mortarAngleDeg(i)
            val fired = sim.mortarLastFiredMs(i)
            var kickY = 0.0; var scaleY = 1.0; var scaleX = 1.0; var extraRot = 0.0
            val elapsed = now - fired
            if (fired != 0.0 && elapsed in 0.0..240.0) {
                val sign = if (angle >= 0) 1 else -1
                val wave = if (elapsed < 24) {
                    sin(elapsed / 24 * (PI / 2))
                } else {
                    val t = (elapsed - 24) / 196
                    exp(-4.2 * t) * cos(t * PI * 3.5)
                }
                kickY = 18 * wave
                scaleY = 1.0 - 0.16 * wave
                scaleX = 1.0 + 0.1 * wave
                extraRot = sign * 3.5 * wave
            }
            canvas.save()
            canvas.translate((sim.mortarPctX(i) * LOGICAL_WIDTH).toFloat(), originY + kickY.toFloat())
            canvas.scale(scaleX.toFloat(), scaleY.toFloat())
            canvas.rotate((angle + extraRot).toFloat())
            canvas.translate(-w / 2f, -th * 0.9f)
            canvas.scale(inv, inv)
            canvas.drawBitmap(tube, 0f, 0f, bitmapPaint.apply { alpha = 255 })
            canvas.restore()
        }
    }

    private fun lerpSize(size: Double, maxSize: Double, t: Double): Float = (size + (maxSize - size) * t).toFloat()
}
