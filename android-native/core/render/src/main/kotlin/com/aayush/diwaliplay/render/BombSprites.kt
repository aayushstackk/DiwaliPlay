package com.aayush.diwaliplay.render

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import com.aayush.diwaliplay.model.BombConfig
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Bomb and mortar artwork pre-rendered once into bitmaps, then drawn with transforms (spec §5: no per-frame
 * vector drawing). The bomb is a port of `CartoonBombSvg.tsx` (100x100 viewBox, 3D sphere gradients, brass
 * collar, lit fuse, preset face or custom-image medallion, points badge); the web skips the drop-shadow
 * filters on Android (`isLowEnd`), so they are not baked in. The mortar tube is the DOM tube from
 * `BombGameOverlay.tsx` (sm breakpoint sizes: 56x80 px).
 *
 * Bitmaps are rendered at [density] x logical size so the 1.35x burst expansion stays sharp.
 * Use from the render thread only.
 *
 * @param imageFor returns the decoded custom image for a config with `imageUrl` (from the branding asset
 *   cache), or null to draw the preset face. Called once per sprite build.
 */
class BombSprites(
    private val density: Float = 2f,
    private val imageFor: (BombConfig) -> Bitmap? = { null },
) {
    /** A pre-rendered bomb: the 2r x 2r box sits [margin] logical px inside [bitmap] on every side. */
    class Sprite internal constructor(val bitmap: Bitmap, val boxSize: Float, val margin: Float, val density: Float)

    private class Entry(val config: BombConfig, val radius: Double, val sprite: Sprite)

    private val entries = ArrayList<Entry>()
    private var mortarBitmap: Bitmap? = null

    /** Sprite for [config] at bomb [radius]; built on first use. Lookup is allocation-free. */
    fun get(config: BombConfig, radius: Double): Sprite {
        for (i in entries.indices) {
            val e = entries[i]
            if ((e.config === config || e.config == config) && e.radius == radius) return e.sprite
        }
        if (entries.size >= MAX_CACHED) entries.removeAt(0).sprite.bitmap.recycle()
        val sprite = renderBomb(config, radius)
        entries.add(Entry(config, radius, sprite))
        return sprite
    }

    /** Builds sprites ahead of the round so the first launch doesn't stall a frame. */
    fun prewarm(configs: List<BombConfig>, radius: Double) {
        for (c in configs) get(c, radius)
        mortar()
    }

    /** Mortar tube bitmap: [MORTAR_W] x [MORTAR_H] logical px at [density]. */
    fun mortar(): Bitmap = mortarBitmap ?: renderMortar().also { mortarBitmap = it }

    /** Drops every cached bitmap (e.g. after the admin changes a bomb image). */
    fun clear() {
        for (e in entries) e.sprite.bitmap.recycle()
        entries.clear()
        mortarBitmap?.recycle()
        mortarBitmap = null
    }

    // ---- bomb ------------------------------------------------------------------------------------------

    private fun renderBomb(config: BombConfig, radius: Double): Sprite {
        val size = (radius * 2).toFloat()
        val margin = ceil(max(12f, size * 0.12f))
        val px = ceil((size + margin * 2) * density).toInt()
        val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.scale(density, density)
        canvas.translate(margin, margin)

        canvas.save()
        canvas.scale(size / 100f, size / 100f)
        drawBombSvg(canvas, config)
        canvas.restore()

        drawBadge(canvas, config, size)
        return Sprite(bitmap, size, margin, density)
    }

    private fun drawBombSvg(c: Canvas, bomb: BombConfig) {
        val points = bomb.points
        val isPenalty = points < 0
        val baseHex = bomb.color.ifBlank { if (isPenalty) "#1E293B" else "#EF4444" }
        val base = Colors.parseHex(baseHex, 0xFFEF4444.toInt())
        val preset = bomb.imagePreset.ifBlank { if (isPenalty) "black_penalty" else "red_classic" }

        val light = adjust(base, 35)
        val dark = adjust(base, -45)
        val deep = adjust(base, -75)
        val rim = if (isPenalty) 0xFFEF4444.toInt() else adjust(base, 40)

        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        val path = Path()

        // Fuse (rope + dashed ribbing).
        path.moveTo(50f, 18f); path.quadTo(55f, 8f, 68f, 6f); path.quadTo(79f, 5f, 83f, 12f)
        stroke(c, stroke, path, 0xFF78350F.toInt(), 3.6f)
        stroke.pathEffect = DashPathEffect(floatArrayOf(2.8f, 1.4f), 0f)
        stroke.strokeCap = Paint.Cap.BUTT // dashes: the web's round cap would merge 1.4-unit gaps visually
        stroke(c, stroke, path, 0xFFD97706.toInt(), 2.8f)
        stroke.pathEffect = null
        stroke.strokeCap = Paint.Cap.ROUND

        // Fuse spark at (83, 12).
        c.save(); c.translate(83f, 12f)
        circle(c, fill, 0f, 0f, 8f, 0xFFF59E0B.toInt(), 0.35f)
        circle(c, fill, 0f, 0f, 5f, 0xFFF97316.toInt(), 0.7f)
        circle(c, fill, 0f, 0f, 3f, 0xFFFEF08A.toInt())
        circle(c, fill, 0f, 0f, 1.4f, 0xFFFFFFFF.toInt())
        line(c, stroke, -6.5f, 0f, 6.5f, 0f, 0xFFFEF08A.toInt(), 1.6f)
        line(c, stroke, 0f, -6.5f, 0f, 6.5f, 0xFFFEF08A.toInt(), 1.6f)
        line(c, stroke, -4f, -4f, 4f, 4f, 0xFFF97316.toInt(), 1.2f)
        line(c, stroke, 4f, -4f, -4f, 4f, 0xFFF97316.toInt(), 1.2f)
        circle(c, fill, 6f, -4f, 1.0f, 0xFFFEF08A.toInt(), 0.8f)
        circle(c, fill, -5f, -5f, 0.8f, 0xFFF97316.toInt(), 0.9f)
        circle(c, fill, 4f, 6f, 0.7f, 0xFFFDE047.toInt(), 0.8f)
        c.restore()

        // Brass collar.
        fill.alpha = 255; fill.shader = LinearGradient(43f, 0f, 57f, 0f,
            intArrayOf(0xFF78350F.toInt(), 0xFFD97706.toInt(), 0xFFFEF08A.toInt(), 0xFFD97706.toInt(), 0xFF78350F.toInt()),
            floatArrayOf(0f, 0.25f, 0.45f, 0.70f, 1f), Shader.TileMode.CLAMP)
        val collar = RectF(43f, 15f, 57f, 21.5f)
        c.drawRoundRect(collar, 2.2f, 2.2f, fill)
        fill.shader = null
        stroke.color = 0xFF451A03.toInt(); stroke.strokeWidth = 0.8f
        c.drawRoundRect(collar, 2.2f, 2.2f, stroke)
        oval(c, fill, 50f, 15f, 6.5f, 1.8f, 0xFFFEF08A.toInt())
        line(c, stroke, 44f, 18.5f, 56f, 18.5f, 0xFFFFFFFF.toInt(), 0.6f, 0.7f)

        // Sphere body.
        oval(c, fill, 50f, 23f, 9f, 2.5f, 0xFF000000.toInt(), 0.5f)
        // objectBoundingBox of the r=36 circle: (14, 20) 72x72 -> cx 34%, cy 32%, r 68%.
        fill.alpha = 255; fill.shader = RadialGradient(14f + 0.34f * 72f, 20f + 0.32f * 72f, 0.68f * 72f,
            intArrayOf(light, base, dark, deep), floatArrayOf(0f, 0.42f, 0.78f, 1f), Shader.TileMode.CLAMP)
        c.drawCircle(50f, 56f, 36f, fill)
        fill.shader = null
        stroke.color = Colors.rgba(255, 255, 255, 0.15); stroke.strokeWidth = 1f
        c.drawCircle(50f, 56f, 36f, stroke)
        // Fresnel rim on the r=35 circle: bbox (15, 21) 70x70 -> cx 78%, cy 78%, r 48%.
        fill.alpha = 255; fill.shader = RadialGradient(15f + 0.78f * 70f, 21f + 0.78f * 70f, 0.48f * 70f,
            intArrayOf(Colors.withAlpha(rim, 0.75), Colors.withAlpha(rim, 0.25), Colors.withAlpha(rim, 0.0)),
            floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
        c.drawCircle(50f, 56f, 35f, fill)
        // Specular glare: ellipse (37, 37) 15x9.5 rotated -28; gradient across its bbox corners.
        fill.alpha = 255; fill.shader = LinearGradient(22f, 27.5f, 52f, 46.5f,
            intArrayOf(Colors.rgba(255, 255, 255, 0.88), Colors.rgba(255, 255, 255, 0.32), Colors.rgba(255, 255, 255, 0.05), Colors.rgba(255, 255, 255, 0.0)),
            floatArrayOf(0f, 0.35f, 0.75f, 1f), Shader.TileMode.CLAMP)
        c.save(); c.rotate(-28f, 37f, 37f); c.drawOval(22f, 27.5f, 52f, 46.5f, fill); c.restore()
        fill.shader = null
        c.save(); c.rotate(-28f, 31f, 34f); oval(c, fill, 31f, 34f, 3.5f, 2.0f, 0xFFFFFFFF.toInt(), 0.9f); c.restore()

        // Face or custom image.
        val image = if (!bomb.imageUrl.isNullOrBlank()) imageFor(bomb) else null
        if (image != null) {
            circle(c, fill, 50f, 56f, 31f, 0xFF0F172A.toInt())
            stroke.color = 0xFFFDE047.toInt(); stroke.strokeWidth = 1.4f
            c.drawCircle(50f, 56f, 31f, stroke)
            // preserveAspectRatio="xMidYMid slice" into (20, 26, 60, 60), clipped to the r=30 circle.
            val scale = max(60f / image.width, 60f / image.height)
            val m = Matrix().apply {
                setScale(scale, scale)
                postTranslate(50f - image.width * scale / 2f, 56f - image.height * scale / 2f)
            }
            fill.alpha = 255; fill.shader = BitmapShader(image, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply { setLocalMatrix(m) }
            fill.isFilterBitmap = true
            c.drawCircle(50f, 56f, 30f, fill)
            fill.shader = null
            c.save(); c.rotate(-25f, 44f, 45f); oval(c, fill, 44f, 45f, 18f, 9f, 0xFFFFFFFF.toInt(), 0.32f); c.restore()
        } else {
            when (preset) {
                "black_penalty" -> facePenalty(c, fill, stroke, path)
                "green_super" -> faceSuper(c, fill, stroke, path)
                "blue_happy" -> faceHappy(c, fill, stroke, path)
                "red_classic" -> faceClassic(c, fill, stroke, path)
            }
        }
    }

    private fun facePenalty(c: Canvas, fill: Paint, stroke: Paint, path: Path) {
        oval(c, fill, 37f, 52f, 7f, 5.5f, 0xFF450A0A.toInt(), 0.8f)
        oval(c, fill, 63f, 52f, 7f, 5.5f, 0xFF450A0A.toInt(), 0.8f)
        oval(c, fill, 37f, 52f, 5.5f, 4f, 0xFFFACC15.toInt())
        oval(c, fill, 63f, 52f, 5.5f, 4f, 0xFFFACC15.toInt())
        oval(c, fill, 37f, 52f, 1.8f, 3.8f, 0xFF7F1D1D.toInt())
        oval(c, fill, 63f, 52f, 1.8f, 3.8f, 0xFF7F1D1D.toInt())
        quad(c, stroke, path, 26f, 42f, 36f, 47f, 46f, 49f, 0xFFEF4444.toInt(), 3.8f)
        quad(c, stroke, path, 74f, 42f, 64f, 47f, 54f, 49f, 0xFFEF4444.toInt(), 3.8f)
        quad(c, stroke, path, 27f, 41f, 36f, 45f, 45f, 47f, 0xFFFCA5A5.toInt(), 1.2f)
        quad(c, stroke, path, 73f, 41f, 64f, 45f, 55f, 47f, 0xFFFCA5A5.toInt(), 1.2f)
        zigzag(c, stroke, path, 66f, 61f, 0xFFEF4444.toInt(), 2.8f)
        zigzag(c, stroke, path, 65f, 60f, 0xFFFEF08A.toInt(), 1.4f)
    }

    private fun faceSuper(c: Canvas, fill: Paint, stroke: Paint, path: Path) {
        oval(c, fill, 37f, 48f, 6.5f, 7.5f, 0xFFFFFFFF.toInt())
        oval(c, fill, 63f, 48f, 6.5f, 7.5f, 0xFFFFFFFF.toInt())
        circle(c, fill, 38f, 48f, 4.2f, 0xFF064E3B.toInt())
        circle(c, fill, 64f, 48f, 4.2f, 0xFF064E3B.toInt())
        circle(c, fill, 36f, 45f, 1.8f, 0xFFFFFFFF.toInt())
        circle(c, fill, 62f, 45f, 1.8f, 0xFFFFFFFF.toInt())
        circle(c, fill, 40f, 50f, 0.9f, 0xFFA7F3D0.toInt())
        circle(c, fill, 66f, 50f, 0.9f, 0xFFA7F3D0.toInt())
        // Mouth: M 35 59 Q 50 78, 65 59 Z
        path.rewind(); path.moveTo(35f, 59f); path.quadTo(50f, 78f, 65f, 59f); path.close()
        fill.color = 0xFF450A0A.toInt(); c.drawPath(path, fill)
        stroke.color = 0xFF064E3B.toInt(); stroke.strokeWidth = 1.8f; c.drawPath(path, stroke)
        // Tongue: M 43 67 Q 50 62, 57 67 Q 50 75, 43 67 Z
        path.rewind(); path.moveTo(43f, 67f); path.quadTo(50f, 62f, 57f, 67f); path.quadTo(50f, 75f, 43f, 67f); path.close()
        fill.color = 0xFFF472B6.toInt(); c.drawPath(path, fill)
        stroke.color = 0xFFBE185D.toInt(); stroke.strokeWidth = 0.8f; c.drawPath(path, stroke)
        oval(c, fill, 27f, 56f, 4.5f, 3.0f, 0xFF6EE7B7.toInt(), 0.75f)
        oval(c, fill, 73f, 56f, 4.5f, 3.0f, 0xFF6EE7B7.toInt(), 0.75f)
    }

    private fun faceHappy(c: Canvas, fill: Paint, stroke: Paint, path: Path) {
        quad(c, stroke, path, 31f, 50f, 37f, 42f, 43f, 50f, 0xFF1E3A8A.toInt(), 4.2f)
        quad(c, stroke, path, 31f, 49f, 37f, 42f, 43f, 49f, 0xFFFFFFFF.toInt(), 2.6f)
        oval(c, fill, 63f, 48f, 6.5f, 7.5f, 0xFFFFFFFF.toInt())
        circle(c, fill, 63f, 48f, 4.2f, 0xFF1E3A8A.toInt())
        circle(c, fill, 61f, 45f, 1.8f, 0xFFFFFFFF.toInt())
        circle(c, fill, 65f, 50f, 0.9f, 0xFF93C5FD.toInt())
        quad(c, stroke, path, 40f, 61f, 50f, 71f, 60f, 61f, 0xFF1E3A8A.toInt(), 4.2f)
        quad(c, stroke, path, 40f, 60f, 50f, 69f, 60f, 60f, 0xFFFFFFFF.toInt(), 2.6f)
        oval(c, fill, 29f, 56f, 4.5f, 2.8f, 0xFF93C5FD.toInt(), 0.65f)
        oval(c, fill, 71f, 56f, 4.5f, 2.8f, 0xFF93C5FD.toInt(), 0.65f)
    }

    private fun faceClassic(c: Canvas, fill: Paint, stroke: Paint, path: Path) {
        quad(c, stroke, path, 31f, 49f, 37f, 41f, 43f, 49f, 0xFF7F1D1D.toInt(), 4.2f)
        quad(c, stroke, path, 31f, 48f, 37f, 41f, 43f, 48f, 0xFFFFFFFF.toInt(), 2.6f)
        quad(c, stroke, path, 57f, 49f, 63f, 41f, 69f, 49f, 0xFF7F1D1D.toInt(), 4.2f)
        quad(c, stroke, path, 57f, 48f, 63f, 41f, 69f, 48f, 0xFFFFFFFF.toInt(), 2.6f)
        quad(c, stroke, path, 39f, 59f, 50f, 69f, 61f, 59f, 0xFF7F1D1D.toInt(), 4.0f)
        quad(c, stroke, path, 39f, 58f, 50f, 67f, 61f, 58f, 0xFFFFFFFF.toInt(), 2.4f)
        oval(c, fill, 28f, 55f, 5.0f, 3.2f, 0xFFFCA5A5.toInt(), 0.75f)
        oval(c, fill, 72f, 55f, 5.0f, 3.2f, 0xFFFCA5A5.toInt(), 0.75f)
    }

    /** Pill badge: centred, bottom edge 8 px below the box, font max(10, round(size * 0.14)), weight 900. */
    private fun drawBadge(c: Canvas, bomb: BombConfig, size: Float) {
        val points = bomb.points
        val isPenalty = points < 0
        val (bg, border) = when {
            isPenalty -> 0xFF7F1D1D.toInt() to 0xFFEF4444.toInt()
            points >= 300 -> 0xFF047857.toInt() to 0xFF6EE7B7.toInt()
            points >= 150 -> 0xFF1D4ED8.toInt() to 0xFF93C5FD.toInt()
            else -> 0xFFEF4444.toInt() to 0xFFFCA5A5.toInt()
        }
        val text = if (points > 0) "+$points" else "$points"
        val fontSize = max(10, (size * 0.14f).roundToInt()).toFloat()
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = blackTypeface()
            textSize = fontSize
            letterSpacing = 0.05f // tracking-wider
            color = 0xFFFFFFFF.toInt()
            textAlign = Paint.Align.CENTER
        }
        val textW = textPaint.measureText(text)
        val w = textW + 2 * 10f + 2f   // px-2.5 + 1 px border
        val h = fontSize * 1.5f + 2 * 2f + 2f // line-height 1.5 + py-0.5 + border
        val cx = size / 2f
        val bottom = size + 8f
        val rect = RectF(cx - w / 2f, bottom - h, cx + w / 2f, bottom)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = bg }
        c.drawRoundRect(rect, h / 2f, h / 2f, p)
        p.style = Paint.Style.STROKE; p.strokeWidth = 1f; p.color = border
        rect.inset(0.5f, 0.5f)
        c.drawRoundRect(rect, h / 2f, h / 2f, p)
        // text-shadow: 0 1px 2px rgba(0,0,0,0.8)
        textPaint.setShadowLayer(Colors.shadowRadius(2f), 0f, 1f, Colors.rgba(0, 0, 0, 0.8))
        val fm = textPaint.fontMetrics
        val baseline = (rect.top + rect.bottom) / 2f - (fm.ascent + fm.descent) / 2f
        c.drawText(text, cx, baseline, textPaint)
    }

    // ---- mortar ----------------------------------------------------------------------------------------

    private fun renderMortar(): Bitmap {
        val bitmap = Bitmap.createBitmap(ceil(MORTAR_W * density).toInt(), ceil(MORTAR_H * density).toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bitmap)
        c.scale(density, density)
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        val cx = MORTAR_W / 2f

        // Barrel (w-10, between the 14 px bore and the 16 px base) with brass bands.
        val boreH = 14f
        val baseH = 16f
        val bTop = boreH
        val bBottom = MORTAR_H - baseH
        fill.alpha = 255; fill.shader = LinearGradient(cx - 20f, 0f, cx + 20f, 0f,
            intArrayOf(0xFF171717.toInt(), 0xFFB45309.toInt(), 0xFF0A0A0A.toInt()), null, Shader.TileMode.CLAMP)
        c.drawRect(cx - 20f, bTop, cx + 20f, bBottom, fill)
        fill.shader = null
        fill.color = Colors.rgba(251, 191, 36, 0.8); c.drawRect(cx - 20f, bTop + 8f, cx + 20f, bTop + 12f, fill)
        fill.color = Colors.rgba(252, 211, 77, 0.6); c.drawRect(cx - 20f, bTop + 20f, cx + 20f, bTop + 22f, fill)
        fill.color = Colors.rgba(251, 191, 36, 0.8); c.drawRect(cx - 20f, bBottom - 16f, cx + 20f, bBottom - 12f, fill)
        fill.color = Colors.rgba(255, 255, 255, 0.2); c.drawRect(cx - 12f, bTop, cx - 6f, bBottom, fill)
        stroke.strokeWidth = 1f; stroke.color = Colors.rgba(245, 158, 11, 0.4)
        c.drawLine(cx - 19.5f, bTop, cx - 19.5f, bBottom, stroke)
        c.drawLine(cx + 19.5f, bTop, cx + 19.5f, bBottom, stroke)

        // Bore (w-12 h-3.5 rounded-full, neutral-950, 2 px amber-400/90 border) with its inner glow.
        val bore = RectF(cx - 24f, 0f, cx + 24f, boreH)
        fill.color = 0xFF0A0A0A.toInt(); c.drawRoundRect(bore, 7f, 7f, fill)
        stroke.strokeWidth = 2f; stroke.color = Colors.rgba(251, 191, 36, 0.9)
        bore.inset(1f, 1f); c.drawRoundRect(bore, 6f, 6f, stroke)
        fill.color = Colors.rgba(245, 158, 11, 0.4)
        c.drawRoundRect(RectF(cx - 12f, boreH / 2f - 3f, cx + 12f, boreH / 2f + 3f), 3f, 3f, fill)

        // Flared base (w-14 h-4, rounded-b-lg, amber-500/30 border).
        val base = RectF(0f, MORTAR_H - baseH, MORTAR_W, MORTAR_H)
        val basePath = Path().apply {
            addRoundRect(base, floatArrayOf(0f, 0f, 0f, 0f, 8f, 8f, 8f, 8f), Path.Direction.CW)
        }
        fill.alpha = 255; fill.shader = LinearGradient(0f, 0f, MORTAR_W, 0f,
            intArrayOf(0xFF0A0A0A.toInt(), 0xFF92400E.toInt(), 0xFF0A0A0A.toInt()), null, Shader.TileMode.CLAMP)
        c.drawPath(basePath, fill)
        fill.shader = null
        stroke.strokeWidth = 1f; stroke.color = Colors.rgba(245, 158, 11, 0.3)
        c.drawPath(basePath, stroke)
        return bitmap
    }

    // ---- helpers ---------------------------------------------------------------------------------------

    private fun circle(c: Canvas, p: Paint, x: Float, y: Float, r: Float, color: Int, opacity: Float = 1f) {
        p.color = color; p.alpha = (opacity * 255).roundToInt(); c.drawCircle(x, y, r, p)
    }

    private fun oval(c: Canvas, p: Paint, cx: Float, cy: Float, rx: Float, ry: Float, color: Int, opacity: Float = 1f) {
        p.color = color; p.alpha = (opacity * 255).roundToInt(); c.drawOval(cx - rx, cy - ry, cx + rx, cy + ry, p)
    }

    private fun line(c: Canvas, p: Paint, x1: Float, y1: Float, x2: Float, y2: Float, color: Int, width: Float, opacity: Float = 1f) {
        p.color = color; p.alpha = (opacity * 255).roundToInt(); p.strokeWidth = width; c.drawLine(x1, y1, x2, y2, p)
    }

    private fun stroke(c: Canvas, p: Paint, path: Path, color: Int, width: Float) {
        p.color = color; p.strokeWidth = width; c.drawPath(path, p)
    }

    private fun quad(c: Canvas, p: Paint, path: Path, x0: Float, y0: Float, qx: Float, qy: Float, x1: Float, y1: Float, color: Int, width: Float) {
        path.rewind(); path.moveTo(x0, y0); path.quadTo(qx, qy, x1, y1)
        stroke(c, p, path, color, width)
    }

    /** Teeth: M 31 low L 36 high L 41 low ... L 70 low. */
    private fun zigzag(c: Canvas, p: Paint, path: Path, low: Float, high: Float, color: Int, width: Float) {
        path.rewind()
        path.moveTo(31f, low)
        val xs = floatArrayOf(36f, 41f, 46f, 51f, 56f, 61f, 66f, 70f)
        for (i in xs.indices) path.lineTo(xs[i], if (i % 2 == 0) high else low)
        stroke(c, p, path, color, width)
    }

    private fun blackTypeface(): Typeface =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) Typeface.create(Typeface.DEFAULT, 900, false)
        else Typeface.DEFAULT_BOLD

    companion object {
        const val MORTAR_W = 56f
        const val MORTAR_H = 80f
        private const val MAX_CACHED = 24

        /** Web `adjustHex`: add `round(255 * percent / 100)` to each channel, clamped. */
        internal fun adjust(argb: Int, percent: Int): Int {
            val d = Math.round(255 * (percent / 100.0)).toInt()
            val r = ((argb shr 16 and 0xFF) + d).coerceIn(0, 255)
            val g = ((argb shr 8 and 0xFF) + d).coerceIn(0, 255)
            val b = ((argb and 0xFF) + d).coerceIn(0, 255)
            return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
    }
}
