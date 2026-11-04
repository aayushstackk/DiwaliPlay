package com.aayush.diwaliplay.render

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Port of `renderHandFlame` (src/utils/motionMath.ts): smoothed multi-tongue hand flame with aura, 4 gradient
 * layers, focal bead and rising embers (16, or 6 in low-end mode).
 *
 * The web applies its lerps/ember motion once per ~60 Hz frame; here they are scaled by `k = dt * 60` so the
 * look holds at other refresh rates (spec §5). Gradients are built once in unit space and placed with a
 * reused local matrix, so drawing is allocation-free.
 */
internal class FlameRenderer(private val random: Random) {

    private class Ember {
        var active = false
        var id = 0
        var x = 0.0; var y = 0.0; var vx = 0.0; var vy = 0.0
        var life = 0.0; var decay = 0.0; var size = 0.0; var hue = 0.0; var wobbleSpeed = 0.0
    }

    private class Tracker {
        var x = 0.0; var y = 0.0; var vx = 0.0; var vy = 0.0
        var tilt = 0.0; var alpha = 0.0
        var initialized = false
        var lastSeenMs = 0.0
        val embers = Array(MAX_EMBERS) { Ember() }
        var emberCount = 0
    }

    private val left = Tracker()
    private val right = Tracker()
    private var emberIdCounter = 0

    private val path = Path()
    private val matrix = Matrix()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val plainPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

    private val auraShader = unitRadial(
        intArrayOf(Colors.rgba(255, 185, 45, 0.48), Colors.rgba(249, 115, 22, 0.24), Colors.rgba(220, 38, 38, 0.08), 0),
        floatArrayOf(0f, 0.35f, 0.70f, 1f),
    )
    private val coreGlowShader = unitRadial(
        intArrayOf(Colors.rgba(255, 255, 220, 0.55), Colors.rgba(255, 160, 20, 0.25), 0),
        floatArrayOf(0f, 0.5f, 1f),
    )
    private val grad1 = unitLinear(intArrayOf(hex(0x991B1B), hex(0xDC2626), hex(0xEA580C), hex(0xF97316)), floatArrayOf(0f, 0.25f, 0.65f, 1f))
    private val grad2 = unitLinear(intArrayOf(hex(0xDC2626), hex(0xF97316), hex(0xFBBF24), hex(0xFDE047)), floatArrayOf(0f, 0.35f, 0.75f, 1f))
    private val grad3 = unitLinear(intArrayOf(hex(0xF59E0B), hex(0xFACC15), hex(0xFEF08A), hex(0xFFFFFF)), floatArrayOf(0f, 0.45f, 0.85f, 1f))
    private val coreGrad = unitLinear(intArrayOf(hex(0xFDE047), hex(0xFEF08A), hex(0xFFFFFF)), floatArrayOf(0f, 0.45f, 1f))

    private val beadRim = Colors.rgba(255, 230, 100, 0.4)

    /** Web `resetHandFlameState()`: called every frame outside active gameplay. */
    fun reset() {
        reset(left)
        reset(right)
    }

    private fun reset(t: Tracker) {
        if (!t.initialized && t.emberCount == 0) return
        t.initialized = false
        t.alpha = 0.0
        t.emberCount = 0
        for (e in t.embers) e.active = false
    }

    fun draw(
        canvas: Canvas, rawX: Double, rawY: Double, isLeft: Boolean,
        speed: Double, vx: Double, vy: Double, nowMs: Double, lowEnd: Boolean,
    ) {
        val tracker = if (isLeft) left else right
        val sinceLast = nowMs - tracker.lastSeenMs

        // 1. Smooth movement interpolation.
        val k: Double
        if (!tracker.initialized || sinceLast > 200) {
            tracker.x = rawX; tracker.y = rawY
            tracker.vx = vx; tracker.vy = vy
            tracker.tilt = 0.0
            tracker.alpha = 0.2
            tracker.initialized = true
            k = 1.0
        } else {
            k = (sinceLast * 60.0 / 1000.0).coerceIn(0.0, 3.0)
            tracker.x += (rawX - tracker.x) * lerp(0.44, k)
            tracker.y += (rawY - tracker.y) * lerp(0.44, k)
            tracker.vx += (vx - tracker.vx) * lerp(0.32, k)
            tracker.vy += (vy - tracker.vy) * lerp(0.32, k)
            val targetTilt = max(-0.45, min(0.45, -tracker.vx * 0.00065))
            tracker.tilt += (targetTilt - tracker.tilt) * lerp(0.25, k)
            tracker.alpha = min(1.0, tracker.alpha + 0.15 * k)
        }
        tracker.lastSeenMs = nowMs

        // 2. Harmonic oscillations.
        val phase = if (isLeft) 0.0 else 3.14159
        val t1 = nowMs * 0.007 + phase
        val t2 = nowMs * 0.017 + phase * 1.3
        val t3 = nowMs * 0.031 + phase * 0.7
        val t4 = nowMs * 0.048 + phase * 1.7

        val swayCenter = sin(t1) * 5.2 + sin(t3) * 2.6
        val swayLeft = cos(t2) * 5.8 + sin(t4) * 2.2
        val swayRight = sin(t2 + 1.8) * 5.8 + cos(t3) * 2.2

        val hfCenter = 0.94 + sin(t2) * 0.08 + cos(t4) * 0.04
        val hfLeft = 0.92 + cos(t1 * 1.5) * 0.09 + sin(t3) * 0.05
        val hfRight = 0.93 + sin(t1 * 1.4 + 1.2) * 0.09 + cos(t3) * 0.05

        val flameH = 56 + min(speed * 0.035, 14.0)
        val flameW = 34 + min(speed * 0.012, 5.0)

        val alpha = tracker.alpha
        canvas.save()
        canvas.translate(tracker.x.toFloat(), tracker.y.toFloat())
        canvas.rotate(Math.toDegrees(tracker.tilt).toFloat())

        // Layer 0: aura and core radiance.
        val auraR = flameH * 1.35
        fillRadial(canvas, auraShader, 0.0, -flameH * 0.35, auraR, alpha)
        fillRadial(canvas, coreGlowShader, 0.0, -flameH * 0.18, flameH * 0.55, alpha)

        // Layers 1-3: tongues.
        run {
            val w = flameW; val h = flameH
            val tcx = swayCenter; val tcy = -h * 1.02 * hfCenter
            tongues(w, 5.0, -w * 0.58 + swayLeft, -h * 0.65 * hfLeft, tcx, tcy, w * 0.58 + swayRight, -h * 0.68 * hfRight,
                -w * 0.24 + swayCenter * 0.3, -h * 0.40, w * 0.24 + swayCenter * 0.3, -h * 0.42)
            fillLinear(canvas, grad1, 0.0, 5.0, tcx, tcy, alpha)
        }
        run {
            val w = flameW * 0.76; val h = flameH * 0.78
            val tcx = swayCenter * 0.75; val tcy = -h * 1.0 * hfCenter
            tongues(w, 3.5, -w * 0.58 + swayLeft * 0.75, -h * 0.64 * hfLeft, tcx, tcy, w * 0.58 + swayRight * 0.75, -h * 0.66 * hfRight,
                -w * 0.24 + swayCenter * 0.25, -h * 0.39, w * 0.24 + swayCenter * 0.25, -h * 0.40)
            fillLinear(canvas, grad2, 0.0, 3.5, tcx, tcy, alpha)
        }
        run {
            val w = flameW * 0.52; val h = flameH * 0.55
            val tcx = swayCenter * 0.5; val tcy = -h * 0.98 * hfCenter
            tongues(w, 2.0, -w * 0.56 + swayLeft * 0.5, -h * 0.62 * hfLeft, tcx, tcy, w * 0.56 + swayRight * 0.5, -h * 0.64 * hfRight,
                -w * 0.22, -h * 0.38, w * 0.22, -h * 0.39)
            fillLinear(canvas, grad3, 0.0, 2.0, tcx, tcy, alpha)
        }

        // Layer 4: incandescent core.
        val wCore = flameW * 0.28
        val hCore = flameH * 0.35
        val tipCoreX = swayCenter * 0.3
        val tipCoreY = -hCore
        path.rewind()
        path.moveTo(0f, 1.5f)
        path.cubicTo((-wCore * 0.8).toFloat(), 0.5f, (-wCore * 0.6).toFloat(), (-hCore * 0.45).toFloat(), tipCoreX.toFloat(), tipCoreY.toFloat())
        path.cubicTo((wCore * 0.6).toFloat(), (-hCore * 0.45).toFloat(), (wCore * 0.8).toFloat(), 0.5f, 0f, 1.5f)
        path.close()
        fillLinear(canvas, coreGrad, 0.0, 1.5, tipCoreX, tipCoreY, alpha)

        // Layer 5: focal bead.
        plainPaint.color = Colors.withAlpha(beadRim, 0.4 * alpha)
        canvas.drawCircle(0f, 0f, 5.5f, plainPaint)
        plainPaint.color = Colors.withAlpha(0xFFFFFF, alpha)
        canvas.drawCircle(0f, 0f, 3.5f, plainPaint)

        // Layer 6: embers (update + draw), then maybe spawn one.
        val embers = tracker.embers
        for (e in embers) {
            if (!e.active) continue
            e.x += (e.vx + sin(nowMs * e.wobbleSpeed + e.id) * 0.75) * k
            e.y += e.vy * k
            e.life -= e.decay * k
            if (e.life <= 0) { e.active = false; tracker.emberCount--; continue }
            val hue = max(5.0, e.hue * (0.35 + e.life * 0.65))
            plainPaint.color = Colors.hsla(hue, 1.0, 0.65, e.life * 0.95 * alpha)
            canvas.drawCircle(e.x.toFloat(), e.y.toFloat(), (e.size * (0.35 + e.life * 0.65)).toFloat(), plainPaint)
        }
        val maxEmbers = if (lowEnd) LOW_END_EMBERS else MAX_EMBERS
        if (tracker.emberCount < maxEmbers && random.nextDouble() < min(1.0, 0.7 * k)) {
            val e = embers.first { !it.active }
            e.active = true
            e.id = ++emberIdCounter
            e.x = swayCenter * 0.5 + (random.nextDouble() - 0.5) * (flameW * 0.7)
            e.y = -flameH * (0.55 + random.nextDouble() * 0.45)
            e.vx = (random.nextDouble() - 0.5) * 1.4
            e.vy = -(1.8 + random.nextDouble() * 2.2)
            e.life = 1.0
            e.decay = 0.024 + random.nextDouble() * 0.035
            e.size = 1.4 + random.nextDouble() * 1.8
            e.hue = 45.0 + floor(random.nextDouble() * 18)
            e.wobbleSpeed = 0.012 + random.nextDouble() * 0.015
            tracker.emberCount++
        }

        canvas.restore()
    }

    /** Web `drawFlameTongues` into [path]. */
    private fun tongues(
        w: Double, baseY: Double,
        tipLX: Double, tipLY: Double, tipCX: Double, tipCY: Double, tipRX: Double, tipRY: Double,
        cleftLX: Double, cleftLY: Double, cleftRX: Double, cleftRY: Double,
    ) {
        val p = path
        p.rewind()
        p.moveTo(f(w * 0.45), f(baseY))
        p.cubicTo(f(w * 0.25), f(baseY + 4), f(-w * 0.25), f(baseY + 4), f(-w * 0.45), f(baseY))
        p.cubicTo(f(-w * 0.78), f(baseY - 6), f(-w * 0.88), f(tipLY * 0.45), f(tipLX), f(tipLY))
        p.cubicTo(f(tipLX * 0.8 + cleftLX * 0.2), f(tipLY * 0.7 + cleftLY * 0.3), f(cleftLX - 3), f(cleftLY - 5), f(cleftLX), f(cleftLY))
        p.cubicTo(f(cleftLX + 3), f(cleftLY - 8), f(tipCX - w * 0.28), f(tipCY * 0.55), f(tipCX), f(tipCY))
        p.cubicTo(f(tipCX + w * 0.28), f(tipCY * 0.55), f(cleftRX - 3), f(cleftRY - 8), f(cleftRX), f(cleftRY))
        p.cubicTo(f(cleftRX + 3), f(cleftRY - 5), f(tipRX * 0.8 + cleftRX * 0.2), f(tipRY * 0.7 + cleftRY * 0.3), f(tipRX), f(tipRY))
        p.cubicTo(f(w * 0.88), f(tipRY * 0.45), f(w * 0.78), f(baseY - 6), f(w * 0.45), f(baseY))
        p.close()
    }

    /** Fills [path] with a unit linear gradient mapped onto (x0, y0) -> (x1, y1). */
    private fun fillLinear(canvas: Canvas, shader: Shader, x0: Double, y0: Double, x1: Double, y1: Double, alpha: Double) {
        val dx = x1 - x0
        val dy = y1 - y0
        val len = sqrt(dx * dx + dy * dy).toFloat().coerceAtLeast(0.001f)
        matrix.setScale(len, len)
        matrix.postRotate(Math.toDegrees(atan2(dy, dx)).toFloat())
        matrix.postTranslate(x0.toFloat(), y0.toFloat())
        shader.setLocalMatrix(matrix)
        paint.shader = shader
        paint.alpha = (alpha * 255).toInt().coerceIn(0, 255)
        canvas.drawPath(path, paint)
        paint.shader = null
    }

    private fun fillRadial(canvas: Canvas, shader: Shader, cx: Double, cy: Double, r: Double, alpha: Double) {
        matrix.setScale(r.toFloat(), r.toFloat())
        matrix.postTranslate(cx.toFloat(), cy.toFloat())
        shader.setLocalMatrix(matrix)
        paint.shader = shader
        paint.alpha = (alpha * 255).toInt().coerceIn(0, 255)
        canvas.drawCircle(cx.toFloat(), cy.toFloat(), r.toFloat(), paint)
        paint.shader = null
    }

    companion object {
        const val MAX_EMBERS = 16
        const val LOW_END_EMBERS = 6

        private fun f(v: Double) = v.toFloat()
        private fun hex(rgb: Int) = 0xFF000000.toInt() or rgb

        /** Per-frame lerp factor [a] applied over [k] 60 Hz frames. */
        private fun lerp(a: Double, k: Double) = 1.0 - (1.0 - a).pow(k)

        internal fun unitRadial(colors: IntArray, stops: FloatArray): Shader =
            RadialGradient(0f, 0f, 1f, colors, stops, Shader.TileMode.CLAMP)

        internal fun unitLinear(colors: IntArray, stops: FloatArray): Shader =
            LinearGradient(0f, 0f, 1f, 0f, colors, stops, Shader.TileMode.CLAMP)
    }
}
