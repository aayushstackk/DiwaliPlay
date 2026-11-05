package com.aayush.diwaliplay.app.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

private const val W = 1920f
private const val H = 1080f
private val BACKGROUND = 0xFF0A0713.toInt()

/** `rgba` from a Tailwind colour and opacity. */
private fun alpha(rgb: Int, a: Float) = Color.argb((a * 255).toInt(), Color.red(rgb), Color.green(rgb), Color.blue(rgb))

private val NEUTRAL_950 = 0xFF0A0A0A.toInt()
private val AMBER_400 = 0xFFFBBF24.toInt()
private val AMBER_500 = 0xFFF59E0B.toInt()
private val AMBER_600 = 0xFFD97706.toInt()
private val ORANGE_600 = 0xFFEA580C.toInt()
private val STAR = 0xFFFDE68A.toInt()

/**
 * DiwaliWallpaper, drawn on the 1920x1080 backdrop surface: the admin's image, or the built-in festive scene, at the
 * admin's opacity over the page background. The blurred glows are radial gradients.
 *
 * [scrim] is the in-game wallpaper's fixed gradient over an image. The start background has an admin's dim instead.
 */
fun drawWallpaper(canvas: Canvas, image: Bitmap?, opacityPercent: Double, scrim: Boolean = true) {
    canvas.drawColor(BACKGROUND)
    val opacity = (opacityPercent.coerceIn(0.0, 100.0) / 100.0).toFloat()
    val layer = canvas.saveLayerAlpha(0f, 0f, W, H, (opacity * 255).toInt())
    if (image != null) drawCustom(canvas, image, scrim) else drawBuiltIn(canvas)
    canvas.restoreToCount(layer)
}

/** `object-cover object-center`. */
private fun coverMatrix(srcW: Float, srcH: Float): Matrix {
    val k = max(W / srcW, H / srcH)
    return Matrix().apply {
        postScale(k, k)
        postTranslate((W - srcW * k) / 2, (H - srcH * k) / 2)
    }
}

private fun drawCustom(canvas: Canvas, image: Bitmap, scrim: Boolean) {
    canvas.drawBitmap(image, coverMatrix(image.width.toFloat(), image.height.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG))
    // from-neutral-950/60 via-transparent to-neutral-950/40, bottom to top
    if (scrim) verticalGradient(canvas, alpha(NEUTRAL_950, 0.4f), 0, alpha(NEUTRAL_950, 0.6f))
}

private fun verticalGradient(canvas: Canvas, top: Int, middle: Int, bottom: Int) {
    val paint = Paint().apply {
        shader = LinearGradient(0f, 0f, 0f, H, intArrayOf(top, middle, bottom), null, Shader.TileMode.CLAMP)
    }
    canvas.drawRect(0f, 0f, W, H, paint)
}

private fun glow(canvas: Canvas, x: Float, y: Float, radius: Float, color: Int) {
    val paint = Paint().apply {
        shader = RadialGradient(x, y, radius, color, alpha(color, 0f), Shader.TileMode.CLAMP)
    }
    canvas.drawCircle(x, y, radius, paint)
}

private fun drawBuiltIn(canvas: Canvas) {
    // Deep midnight purple base.
    verticalGradient(canvas, 0xFF070312.toInt(), 0xFF0E0620.toInt(), 0xFF15082C.toInt())

    // Ambient glows.
    glow(canvas, W / 2, 60f, 760f, alpha(AMBER_500, 0.12f))
    val horizon = Paint().apply {
        shader = LinearGradient(
            0f, H, 0f, H * 0.55f,
            intArrayOf(alpha(ORANGE_600, 0.15f), alpha(AMBER_600, 0.05f), 0), null, Shader.TileMode.CLAMP,
        )
    }
    canvas.drawRect(0f, H * 0.55f, W, H, horizon)

    // Starry texture: a 32 px dot grid, 30% opacity.
    val star = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = alpha(STAR, 0.3f) }
    var y = 16f
    while (y < H) {
        var x = 16f
        while (x < W) {
            canvas.drawCircle(x, y, 1f, star)
            x += 32f
        }
        y += 32f
    }

    drawGarland(canvas)
    drawMandala(canvas)
    drawDiyas(canvas)

    // Vignette, so sparks stand out.
    val vignette = Paint().apply {
        shader = RadialGradient(
            W / 2, H / 2, W * 0.6f,
            intArrayOf(0, alpha(NEUTRAL_950, 0.2f), alpha(NEUTRAL_950, 0.5f)), null, Shader.TileMode.CLAMP,
        )
    }
    canvas.drawRect(0f, 0f, W, H, vignette)
}

/** Nine hanging lights across the top, at 35%. */
private fun drawGarland(canvas: Canvas) {
    val cell = W / 9
    val line = Paint().apply { strokeWidth = 1f }
    val bulb = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = alpha(AMBER_400, 0.6f * 0.35f) }
    for (i in 0 until 9) {
        val x = cell * (i + 0.5f)
        line.shader = LinearGradient(0f, 0f, 0f, 36f, alpha(AMBER_400, 0.8f * 0.35f), alpha(AMBER_500, 0.1f * 0.35f), Shader.TileMode.CLAMP)
        canvas.drawLine(x, 0f, x, 36f, line)
        glow(canvas, x, 42f, 16f, alpha(AMBER_400, 0.8f * 0.35f))
        canvas.drawCircle(x, 42f, 6f, bulb)
    }
}

/** The faint mandala, 850 px across. Static: the web's slow spin isn't worth a redraw per frame. */
private fun drawMandala(canvas: Canvas) {
    val k = 850f / 200f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 0.75f
        color = alpha(AMBER_500, 0.04f)
    }
    canvas.save()
    canvas.translate(W / 2 - 100 * k, H / 2 - 100 * k)
    canvas.scale(k, k)
    fun ring(r: Float, dash: Float?) {
        paint.pathEffect = dash?.let { DashPathEffect(floatArrayOf(it, it), 0f) }
        canvas.drawCircle(100f, 100f, r, paint)
    }
    ring(90f, 3f)
    ring(70f, 4f)
    ring(50f, null)
    ring(30f, 2f)
    paint.pathEffect = null
    canvas.drawLine(100f, 10f, 100f, 190f, paint)
    canvas.drawLine(10f, 100f, 190f, 100f, paint)
    canvas.drawLine(36f, 36f, 164f, 164f, paint)
    canvas.drawLine(36f, 164f, 164f, 36f, paint)
    for (i in 0 until 12) {
        val a = Math.toRadians(i * 30.0)
        canvas.drawLine(
            100 + 40 * cos(a).toFloat(), 100 + 40 * sin(a).toFloat(),
            100 + 80 * cos(a).toFloat(), 100 + 80 * sin(a).toFloat(), paint,
        )
    }
    canvas.restore()
}

/** Four diyas along the bottom, at 80%. */
private fun drawDiyas(canvas: Canvas) {
    val inset = 64f + 28f
    val centers = listOf(inset to true, W * 0.36f to false, W * 0.64f to false, W - inset to true)
    for ((x, large) in centers) drawDiya(canvas, x, H - 16f, large)
}

private fun drawDiya(canvas: Canvas, centerX: Float, bottom: Float, large: Boolean) {
    val bowlW = if (large) 56f else 32f
    val bowlH = bowlW / 2
    val flameW = if (large) 12f else 10f
    val flameH = if (large) 20f else 16f
    val bowlTop = bottom - bowlH
    val flameBottom = bowlTop

    glow(canvas, centerX, flameBottom - flameH / 2, flameH * 1.6f, alpha(AMBER_400, 0.7f))
    val flame = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = LinearGradient(
            0f, flameBottom, 0f, flameBottom - flameH,
            intArrayOf(alpha(AMBER_500, 0.8f), alpha(0xFFFACC15.toInt(), 0.8f), alpha(Color.WHITE, 0.8f)), null, Shader.TileMode.CLAMP,
        )
    }
    canvas.drawRoundRect(
        RectF(centerX - flameW / 2, flameBottom - flameH, centerX + flameW / 2, flameBottom),
        flameW / 2, flameW / 2, flame,
    )

    // The bowl: path "M4 8c0 6 7 10 16 10s16-4 16-10H4z" in a 40x20 box.
    val k = bowlW / 40f
    val bowl = Path().apply {
        moveTo(4f, 8f)
        rCubicTo(0f, 6f, 7f, 10f, 16f, 10f)
        rCubicTo(9f, 0f, 16f, -4f, 16f, -10f)
        lineTo(4f, 8f)
        close()
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = alpha(AMBER_600, 0.8f) }
    canvas.save()
    canvas.translate(centerX - bowlW / 2, bowlTop)
    canvas.scale(k, k)
    canvas.drawPath(bowl, paint)
    canvas.restore()
}
