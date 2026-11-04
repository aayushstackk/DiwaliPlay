package com.aayush.diwaliplay.app.ui

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import com.aayush.diwaliplay.app.parseVoucherTitle
import com.aayush.diwaliplay.app.spinPegCount
import com.aayush.diwaliplay.model.RewardItem
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.round
import kotlin.math.sin

private const val C = 250f
private const val ACTIVE_RADIUS = 232f
private const val LINE1_DIST = 152f
private const val LINE2_DIST = 122f
private const val LINE1_ALONE_DIST = 138f
private const val STAR_DIST = 184f
private const val HUB_INNER = 58f

private class SegmentStyle(val bg: Int, val primary: Int, val secondary: Int)

private val SEGMENTS = listOf(
    SegmentStyle(0xFF1E140A.toInt(), 0xFFFFFBEB.toInt(), 0xFFFDE68A.toInt()),
    SegmentStyle(0xFFC2410C.toInt(), 0xFFFFFFFF.toInt(), 0xFFFEF3C7.toInt()),
    SegmentStyle(0xFF2D1A0E.toInt(), 0xFFFFFBEB.toInt(), 0xFFFDE68A.toInt()),
    SegmentStyle(0xFFD97706.toInt(), 0xFFFFFFFF.toInt(), 0xFFFEF3C7.toInt()),
    SegmentStyle(0xFF140E08.toInt(), 0xFFFFFBEB.toInt(), 0xFFFDE68A.toInt()),
    SegmentStyle(0xFFB45309.toInt(), 0xFFFFFFFF.toInt(), 0xFFFEF3C7.toInt()),
    SegmentStyle(0xFF781D42.toInt(), 0xFFFFFBEB.toInt(), 0xFFFDE68A.toInt()),
    SegmentStyle(0xFFEA580C.toInt(), 0xFFFFFFFF.toInt(), 0xFFFEF3C7.toInt()),
)

/**
 * GameOverModal's wheel SVG, in its 500x500 viewBox. Drawn once into a layer that the screen only rotates, so a spin
 * redraws nothing.
 */
fun drawWheel(canvas: Canvas, sizePx: Float, rewards: List<RewardItem>) {
    canvas.save()
    canvas.scale(sizePx / 500f, sizePx / 500f)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val numSlices = max(1, rewards.size)
    val sliceAngle = 360f / numSlices

    val rim = LinearGradient(
        0f, 0f, 500f, 500f,
        intArrayOf(0xFFFDE68A.toInt(), 0xFFB45309.toInt(), 0xFFF59E0B.toInt(), 0xFF78350F.toInt(), 0xFFFCD34D.toInt()),
        null, Shader.TileMode.CLAMP,
    )

    // Multi-layered outer rim
    circle(canvas, paint, 247f, fill = 0xFF0C0704.toInt())
    circle(canvas, paint, 247f, stroke = 6f, shader = rim)
    circle(canvas, paint, 238f, stroke = 12f, strokeColor = 0x6678350F)
    circle(canvas, paint, ACTIVE_RADIUS, stroke = 1.5f, strokeColor = 0xFFF59E0B.toInt())

    rewards.forEachIndexed { i, reward -> drawSlice(canvas, paint, i, reward, numSlices, sliceAngle) }
    rewards.indices.forEach { i -> drawSpoke(canvas, paint, i * sliceAngle) }
    drawPegs(canvas, paint, spinPegCount(numSlices))

    // Hub
    circle(canvas, paint, HUB_INNER, fill = 0xFF140D07.toInt())
    circle(canvas, paint, HUB_INNER, stroke = 4f, shader = rim)
    circle(canvas, paint, 50f, fill = 0xFF20140A.toInt())
    circle(canvas, paint, 50f, stroke = 1.5f, strokeColor = 0xFFF59E0B.toInt())
    canvas.restore()
}

private fun circle(
    canvas: Canvas,
    paint: Paint,
    radius: Float,
    fill: Int? = null,
    stroke: Float = 0f,
    strokeColor: Int = 0,
    shader: Shader? = null,
) {
    paint.shader = shader
    if (fill != null) {
        paint.style = Paint.Style.FILL
        paint.color = fill
    } else {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = stroke
        paint.color = if (shader != null) 0xFF000000.toInt() else strokeColor
    }
    canvas.drawCircle(C, C, radius, paint)
    paint.shader = null
    paint.style = Paint.Style.FILL
}

private fun drawSlice(canvas: Canvas, paint: Paint, i: Int, reward: RewardItem, numSlices: Int, sliceAngle: Float) {
    val style = SEGMENTS[i % SEGMENTS.size]
    val start = i * sliceAngle
    val path = Path()
    if (numSlices == 1) {
        path.addCircle(C, C, ACTIVE_RADIUS, Path.Direction.CW)
    } else {
        // Web angles start at 12 o'clock; Android's at 3.
        path.moveTo(C, C)
        path.arcTo(RectF(C - ACTIVE_RADIUS, C - ACTIVE_RADIUS, C + ACTIVE_RADIUS, C + ACTIVE_RADIUS), start - 90f, sliceAngle)
        path.close()
    }
    paint.color = style.bg
    canvas.drawPath(path, paint)

    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 1.2f
    paint.color = 0x66D97706
    canvas.drawPath(path, paint)
    paint.style = Paint.Style.FILL

    // Laminated sheen: slice-sheen at opacity 0.22.
    paint.color = 0xFF000000.toInt()
    paint.alpha = (0.22f * 255).toInt()
    paint.shader = RadialGradient(
        C, C, 250f,
        intArrayOf(0x40FFFFFF, 0x00000000, 0x66000000), floatArrayOf(0f, 0.65f, 1f), Shader.TileMode.CLAMP,
    )
    canvas.drawPath(path, paint)
    paint.shader = null
    paint.alpha = 255

    val mid = (i + 0.5f) * sliceAngle
    canvas.save()
    canvas.rotate(mid, C, C)
    drawLabels(canvas, paint, reward, numSlices, sliceAngle, style)
    canvas.restore()
}

private fun drawLabels(canvas: Canvas, paint: Paint, reward: RewardItem, numSlices: Int, sliceAngle: Float, style: SegmentStyle) {
    val title = parseVoucherTitle(reward.name)

    paint.textAlign = Paint.Align.CENTER
    paint.typeface = Typeface.DEFAULT
    paint.textScaleX = 1f
    paint.letterSpacing = 0f
    paint.textSize = if (numSlices <= 6) 12f else 10f
    paint.color = 0xE6F59E0B.toInt()
    canvas.drawText("★", C, C - STAR_DIST, paint)

    val baseTitle = when {
        numSlices <= 4 -> 22f
        numSlices <= 6 -> 19f
        numSlices <= 8 -> 16.5f
        numSlices <= 10 -> 14.5f
        else -> 13f
    }
    val baseSub = when {
        numSlices <= 4 -> 14f
        numSlices <= 6 -> 12.5f
        numSlices <= 8 -> 11f
        numSlices <= 10 -> 9.5f
        else -> 8.5f
    }
    val halfSlice = sliceAngle * PI.toFloat() / 360f
    val maxLine1 = max(36f, 2 * LINE1_DIST * sin(halfSlice) * 0.84f)
    val maxLine2 = max(30f, 2 * LINE2_DIST * sin(halfSlice) * 0.82f)

    val line1Y = C - if (title.line2.isNotEmpty()) LINE1_DIST else LINE1_ALONE_DIST
    prizeText(
        canvas, paint, title.line1, line1Y, scaledFont(baseTitle, title.line1), 0.6f,
        Typeface.create(Typeface.SERIF, Typeface.BOLD),
        if (title.line1.length > 6) maxLine1 else null,
        if (numSlices <= 6) 3.5f else 2.8f, style.primary,
    )
    if (title.line2.isNotEmpty()) {
        prizeText(
            canvas, paint, title.line2, C - LINE2_DIST, scaledFont(baseSub, title.line2), 1.5f,
            Typeface.create(Typeface.SERIF, Typeface.BOLD),
            if (title.line2.length > 5) maxLine2 else null,
            if (numSlices <= 6) 2.6f else 2f, style.secondary,
        )
    }
    paint.textScaleX = 1f
    paint.letterSpacing = 0f
}

private fun scaledFont(base: Float, text: String): Float {
    val scale = if (text.length > 7) max(0.72f, 7f / text.length) else 1f
    return round(base * scale * 10f) / 10f
}

/** SVG text with `paint-order: stroke fill`. [fitWidth] is `textLength` with `spacingAndGlyphs`. */
private fun prizeText(
    canvas: Canvas,
    paint: Paint,
    text: String,
    y: Float,
    size: Float,
    spacingPx: Float,
    font: Typeface,
    fitWidth: Float?,
    outline: Float,
    color: Int,
) {
    paint.typeface = font
    paint.textSize = size
    paint.letterSpacing = spacingPx / size
    paint.textScaleX = 1f
    if (fitWidth != null) {
        val measured = paint.measureText(text)
        if (measured > 0f) paint.textScaleX = fitWidth / measured
    }
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = outline
    paint.strokeJoin = Paint.Join.ROUND
    paint.color = 0xFF0C0704.toInt()
    canvas.drawText(text, C, y, paint)
    paint.style = Paint.Style.FILL
    paint.color = color
    canvas.drawText(text, C, y, paint)
}

private fun drawSpoke(canvas: Canvas, paint: Paint, angleDegrees: Float) {
    val rad = angleDegrees * PI.toFloat() / 180f
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 2.5f
    paint.strokeCap = Paint.Cap.ROUND
    paint.shader = LinearGradient(
        0f, 0f, 500f, 500f,
        intArrayOf(0xFFFDE68A.toInt(), 0xFFF59E0B.toInt(), 0xFF92400E.toInt()), null, Shader.TileMode.CLAMP,
    )
    paint.color = 0xFF000000.toInt()
    canvas.drawLine(
        C + HUB_INNER * sin(rad), C - HUB_INNER * cos(rad),
        C + ACTIVE_RADIUS * sin(rad), C - ACTIVE_RADIUS * cos(rad),
        paint,
    )
    paint.shader = null
    paint.style = Paint.Style.FILL
}

private fun drawPegs(canvas: Canvas, paint: Paint, count: Int) {
    val step = 360f / count
    val peg = RadialGradient(
        C - 1.3f, C - 239.3f, 4.94f,
        intArrayOf(0xFFFFFFFF.toInt(), 0xFFFDE68A.toInt(), 0xFFD97706.toInt(), 0xFF78350F.toInt()),
        floatArrayOf(0f, 0.25f, 0.6f, 1f), Shader.TileMode.CLAMP,
    )
    for (p in 0 until count) {
        canvas.save()
        canvas.rotate(p * step, C, C)
        paint.shader = peg
        paint.color = 0xFF000000.toInt()
        canvas.drawCircle(C, C - 238f, 3.8f, paint)
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 0.8f
        paint.color = 0xFF451A03.toInt()
        canvas.drawCircle(C, C - 238f, 3.8f, paint)
        paint.style = Paint.Style.FILL
        paint.color = 0xE6FFFFFF.toInt()
        canvas.drawCircle(C - 1f, C - 239.1f, 1.2f, paint)
        canvas.restore()
    }
}
