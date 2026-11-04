package com.aayush.diwaliplay.render

import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.model.TrailPoint
import kotlin.math.min

/**
 * Port of `renderHandSkeleton` and `renderHandTrail` (src/utils/motionMath.ts): the neon calibration guides
 * drawn outside active gameplay. Landmarks are raw MediaPipe points (0..1, un-mirrored) and are flipped
 * with `(1 - x) * width` exactly like the web; trails are already in logical pixels.
 * Canvas2D `shadowBlur` maps to `setShadowLayer` (skipped on hardware canvases below API 28).
 */
internal class SkeletonRenderer {

    private class Side(
        val bone: Int, val core: Int, val jointFill: Int, val jointStroke: Int, val predicted: Int,
        val trailRgb: Int, val palmShader: Shader,
    )

    private val leftSide = Side(
        bone = 0xFFF59E0B.toInt(), core = 0xFFFFFDE7.toInt(), jointFill = 0xFFFEF08A.toInt(),
        jointStroke = 0xFFD97706.toInt(), predicted = 0xFFFBBF24.toInt(), trailRgb = 0xFBBF24,
        palmShader = FlameRenderer.unitRadial(
            intArrayOf(Colors.rgba(255, 255, 255, 0.95), Colors.rgba(254, 240, 138, 0.75), Colors.rgba(245, 158, 11, 0.35), Colors.rgba(245, 158, 11, 0.0)),
            floatArrayOf(0f, 0.3f, 0.65f, 1f),
        ),
    )
    private val rightSide = Side(
        bone = 0xFFF43F5E.toInt(), core = 0xFFFFF0F5.toInt(), jointFill = 0xFFFECDD3.toInt(),
        jointStroke = 0xFFBE123C.toInt(), predicted = 0xFFFB7185.toInt(), trailRgb = 0xF43F5E,
        palmShader = FlameRenderer.unitRadial(
            intArrayOf(Colors.rgba(255, 255, 255, 0.95), Colors.rgba(254, 205, 211, 0.75), Colors.rgba(244, 63, 94, 0.35), Colors.rgba(244, 63, 94, 0.0)),
            floatArrayOf(0f, 0.3f, 0.65f, 1f),
        ),
    )

    private val path = Path()
    private val matrix = Matrix()
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

    fun drawTrail(canvas: Canvas, trail: List<TrailPoint>, isLeft: Boolean) {
        val len = trail.size
        if (len < 2) return
        val side = if (isLeft) leftSide else rightSide
        val shadows = Colors.shadowsSupported(canvas.isHardwareAccelerated)
        if (shadows) stroke.setShadowLayer(Colors.shadowRadius(8f), 0f, 0f, side.bone) else stroke.clearShadowLayer()
        for (i in 0 until len - 1) {
            val a = trail[i]
            val b = trail[i + 1]
            val t = (i + 1).toDouble() / len
            stroke.color = Colors.withAlpha(side.trailRgb, min(t * 0.7, 0.75))
            stroke.strokeWidth = (2.5 + t * 5.5).toFloat()
            canvas.drawLine(a.x.toFloat(), a.y.toFloat(), b.x.toFloat(), b.y.toFloat(), stroke)
        }
        stroke.clearShadowLayer()
    }

    fun drawSkeleton(
        canvas: Canvas, marks: List<LandmarkPoint>, isLeft: Boolean, movementSpeed: Double, isPredicted: Boolean,
        width: Float = LOGICAL_WIDTH.toFloat(), height: Float = LOGICAL_HEIGHT.toFloat(),
    ) {
        if (marks.size < 21) return
        val side = if (isLeft) leftSide else rightSide
        val shadows = Colors.shadowsSupported(canvas.isHardwareAccelerated)
        val speedGlow = min(movementSpeed / 400.0, 1.0)
        val glowBlur = if (isPredicted) 10f else (15 + speedGlow * 8).toFloat()

        // 1. Bones, batched into one path.
        path.rewind()
        for (j in BONES.indices step 2) {
            val p1 = marks[BONES[j]]
            val p2 = marks[BONES[j + 1]]
            path.moveTo(((1 - p1.x) * width).toFloat(), (p1.y * height).toFloat())
            path.lineTo(((1 - p2.x) * width).toFloat(), (p2.y * height).toFloat())
        }
        // Pass 1: neon halo.
        stroke.strokeWidth = 5.5f
        stroke.color = if (isPredicted) side.predicted else side.bone
        shadow(stroke, shadows, glowBlur, side.bone)
        canvas.drawPath(path, stroke)
        // Pass 2: core filament.
        stroke.strokeWidth = 2f
        stroke.color = side.core
        shadow(stroke, shadows, 4f, 0xFFFFFFFF.toInt())
        canvas.drawPath(path, stroke)

        // 2. Joints (the web keeps the shadow set for every op inside each joint).
        for (i in 0 until 21) {
            val lm = marks[i]
            val x = ((1 - lm.x) * width).toFloat()
            val y = (lm.y * height).toFloat()
            when {
                i == 4 || i == 8 || i == 12 || i == 16 || i == 20 -> {
                    shadow(fill, shadows, 10f, side.bone)
                    fill.color = side.bone
                    canvas.drawCircle(x, y, 6.5f, fill)
                    fill.color = 0xFFFFFFFF.toInt()
                    canvas.drawCircle(x, y, 2.8f, fill)
                }
                i == 0 -> {
                    shadow(fill, shadows, 8f, side.bone)
                    fill.color = side.jointFill
                    canvas.drawCircle(x, y, 5.5f, fill)
                    stroke.strokeWidth = 1.8f
                    stroke.color = side.bone
                    shadow(stroke, shadows, 8f, side.bone)
                    canvas.drawCircle(x, y, 5.5f, stroke)
                }
                else -> {
                    shadow(fill, shadows, 6f, side.bone)
                    fill.color = side.jointFill
                    canvas.drawCircle(x, y, 3.8f, fill)
                    stroke.strokeWidth = 1.2f
                    stroke.color = side.jointStroke
                    shadow(stroke, shadows, 6f, side.bone)
                    canvas.drawCircle(x, y, 3.8f, stroke)
                }
            }
        }
        fill.clearShadowLayer()
        stroke.clearShadowLayer()

        // 3. Palm aura (palm centre = mean of landmarks 0, 5, 9, 17, mirrored) and bright core.
        val px = ((1 - (marks[0].x + marks[5].x + marks[9].x + marks[17].x) / 4) * width).toFloat()
        val py = ((marks[0].y + marks[5].y + marks[9].y + marks[17].y) / 4 * height).toFloat()
        val palmR = (18 + speedGlow * 12).toFloat()
        matrix.setScale(palmR, palmR)
        matrix.postTranslate(px, py)
        side.palmShader.setLocalMatrix(matrix)
        fill.shader = side.palmShader
        canvas.drawCircle(px, py, palmR, fill)
        fill.shader = null
        fill.color = 0xFFFFFFFF.toInt()
        shadow(fill, shadows, 12f, side.bone)
        canvas.drawCircle(px, py, 4.2f, fill)
        fill.clearShadowLayer()
    }

    private fun shadow(paint: Paint, enabled: Boolean, blur: Float, color: Int) {
        if (enabled) paint.setShadowLayer(Colors.shadowRadius(blur), 0f, 0f, color)
    }

    private companion object {
        /** HAND_BONES: palm, then thumb/index/middle/ring/pinky chains, as start/end index pairs. */
        val BONES = intArrayOf(
            0, 1, 0, 5, 0, 9, 0, 13, 0, 17, 5, 9, 9, 13, 13, 17,
            1, 2, 2, 3, 3, 4,
            5, 6, 6, 7, 7, 8,
            9, 10, 10, 11, 11, 12,
            13, 14, 14, 15, 15, 16,
            17, 18, 18, 19, 19, 20,
        )
    }
}
