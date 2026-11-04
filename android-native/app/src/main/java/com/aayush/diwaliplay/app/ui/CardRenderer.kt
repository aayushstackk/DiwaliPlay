package com.aayush.diwaliplay.app.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import androidx.annotation.WorkerThread
import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import com.aayush.diwaliplay.game.PlayerAchievement
import com.aayush.diwaliplay.game.flow.RoundCard
import com.aayush.diwaliplay.model.GameScoreState
import java.util.Locale

/** What the souvenir card shows (GameOverModal's props). */
class CardData(
    val playerName: String,
    val brandName: String,
    val score: GameScoreState,
    val achievement: PlayerAchievement,
    val wish: FormattedPersonalizedWish,
    val photoJpeg: ByteArray?,
    /** Null when the round had no target. */
    val targetScore: Int?,
    val targetAchieved: Boolean?,
)

fun RoundCard.toCardData(brandName: String) =
    CardData(playerName, brandName, score, achievement, wish, photoJpeg, targetScore, targetAchieved)

private const val CARD_WIDTH = 900
private const val CARD_HEIGHT = 1150
private const val CENTER_X = CARD_WIDTH / 2f

private const val PHOTO_X = 135f
private const val PHOTO_Y = 150f
private const val PHOTO_WIDTH = 630f
private const val PHOTO_HEIGHT = 354f

/** The photo is drawn 630 wide, so a camera frame needs no more than this. */
private const val MAX_PHOTO_EDGE = 1280

private const val GOLD = 0xFFF59E0B.toInt()
private const val AMBER_300 = 0xFFFCD34D.toInt()
private const val AMBER_200 = 0xFFFDE68A.toInt()
private const val WHITE = 0xFFFFFFFF.toInt()
private const val GREY_200 = 0xFFE5E7EB.toInt()
private const val GREY_400 = 0xFF9CA3AF.toInt()
private const val RED_400 = 0xFFF87171.toInt()
private const val EMERALD_400 = 0xFF34D399.toInt()
private const val PANEL = 0xFF140D26.toInt()

private class Stat(val label: String, val value: String, val color: Int)

/**
 * GameOverModal's `handleDownloadCard` canvas, coordinate for coordinate. Takes a while (it decodes the photo), so not
 * on the main thread. The caller owns the returned bitmap.
 */
@WorkerThread
fun renderCard(data: CardData): Bitmap {
    val bitmap = Bitmap.createBitmap(CARD_WIDTH, CARD_HEIGHT, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

    paint.shader = LinearGradient(
        0f, 0f, 0f, CARD_HEIGHT.toFloat(),
        intArrayOf(0xFF0E0A1A.toInt(), 0xFF160E2A.toInt(), 0xFF090514.toInt()), floatArrayOf(0f, 0.5f, 1f),
        Shader.TileMode.CLAMP,
    )
    canvas.drawRect(0f, 0f, CARD_WIDTH.toFloat(), CARD_HEIGHT.toFloat(), paint)
    paint.shader = null
    canvas.stroke(paint, GOLD, 6f, 20f, 20f, 860f, 1110f)

    canvas.text(paint, "DIWALI MOTION SOUVENIR", CENTER_X, 75f, AMBER_300, 22f, CardFont.DisplayBold)
    canvas.text(paint, "CHALLENGE COMPLETE", CENTER_X, 115f, WHITE, 36f, CardFont.DisplayBold)

    drawPhoto(canvas, paint, data.photoJpeg)

    val name = data.playerName.uppercase(Locale.ROOT)
    canvas.text(paint, "WELL DONE!", CENTER_X, 545f, AMBER_300, 18f, CardFont.DisplayBold)
    canvas.text(paint, name, CENTER_X, 588f, WHITE, 36f, CardFont.DisplayBold)
    canvas.text(paint, "YOU PLAYED VERY WELL 🎆", CENTER_X, 620f, AMBER_200, 17f, CardFont.BodyBold)

    drawScorePanel(canvas, paint, data)
    drawStats(canvas, paint, data)

    canvas.text(paint, "🪔 SPECIAL DIWALI BLESSING FOR $name 🪔", CENTER_X, 940f, GOLD, 16f, CardFont.DisplayBold)
    canvas.text(paint, data.wish.heading, CENTER_X, 970f, AMBER_200, 15f, CardFont.BodyBold)
    var lineY = 1000f
    for (line in data.wish.lines) {
        canvas.text(paint, line, CENTER_X, lineY, GREY_200, 14f, CardFont.BodyItalic)
        lineY += 24f
    }
    canvas.text(paint, "Presented with warmth by ${data.brandName}", CENTER_X, 1095f, GREY_400, 12f, CardFont.Mono)
    return bitmap
}

private fun drawPhoto(canvas: Canvas, paint: Paint, jpeg: ByteArray?) {
    paint.color = 0xFF1A132B.toInt()
    paint.style = Paint.Style.FILL
    canvas.drawRect(PHOTO_X - 4, PHOTO_Y - 4, PHOTO_X + PHOTO_WIDTH + 4, PHOTO_Y + PHOTO_HEIGHT + 4, paint)
    canvas.stroke(paint, GOLD, 3f, PHOTO_X - 4, PHOTO_Y - 4, PHOTO_WIDTH + 8, PHOTO_HEIGHT + 8)

    val rect = RectF(PHOTO_X, PHOTO_Y, PHOTO_X + PHOTO_WIDTH, PHOTO_Y + PHOTO_HEIGHT)
    val photo = jpeg?.let { decodeBoundedJpeg(it, MAX_PHOTO_EDGE) }
    if (photo != null) {
        paint.color = WHITE
        // drawImage(x, y, w, h): the whole frame, stretched to fit, not cropped.
        canvas.drawBitmap(photo, null, rect, paint)
        photo.recycle()
    } else {
        paint.color = 0xFF261C3D.toInt()
        canvas.drawRect(rect, paint)
        canvas.text(paint, "HAPPY DIWALI", CENTER_X, PHOTO_Y + PHOTO_HEIGHT / 2, AMBER_300, 28f, CardFont.DisplayBold)
    }
}

private fun drawScorePanel(canvas: Canvas, paint: Paint, data: CardData) {
    val y = 645f
    val width = 680f
    val height = 165f
    val x = (CARD_WIDTH - width) / 2
    paint.color = PANEL
    paint.style = Paint.Style.FILL
    canvas.drawRect(x, y, x + width, y + height, paint)
    canvas.stroke(paint, GOLD, 2f, x, y, width, height)

    val a = data.achievement
    canvas.text(paint, "${a.emoji} ${a.title} ${a.emoji}", CENTER_X, y + 36, AMBER_300, 20f, CardFont.DisplayBold)
    canvas.text(paint, a.subtitle, CENTER_X, y + 60, GREY_200, 14f, CardFont.Body)
    canvas.text(paint, formatScore(data.score.score), CENTER_X, y + 115, AMBER_200, 44f, CardFont.MonoBold)
    canvas.text(paint, "TOTAL POINTS", CENTER_X, y + 144, GOLD, 13f, CardFont.MonoBold)
}

private fun drawStats(canvas: Canvas, paint: Paint, data: CardData) {
    val s = data.score
    val penalty = s.penaltyDeductions
    val stats = buildList {
        add(Stat("BOMBS BURST", "${s.bombsBurst}", AMBER_200))
        add(Stat("COMBOS", "${s.combosAwarded}", AMBER_200))
        add(Stat("PENALTIES", if (penalty > 0) "-$penalty" else "0", if (penalty > 0) RED_400 else AMBER_200))
        add(Stat("COMBO BONUS", "+${s.comboBonusPoints}", EMERALD_400))
        data.targetScore?.let { target ->
            val achieved = data.targetAchieved == true
            add(Stat(if (achieved) "TARGET ✓" else "TARGET", "$target", if (achieved) AMBER_300 else GREY_400))
        }
    }
    val hasTarget = data.targetScore != null
    val boxWidth = if (hasTarget) 128f else 155f
    val gap = if (hasTarget) 10f else 20f
    val total = stats.size * boxWidth + (stats.size - 1) * gap
    val startX = (CARD_WIDTH - total) / 2
    stats.forEachIndexed { i, stat ->
        val x = startX + i * (boxWidth + gap)
        paint.color = PANEL
        paint.style = Paint.Style.FILL
        canvas.drawRect(x, 830f, x + boxWidth, 905f, paint)
        canvas.stroke(paint, 0xFF372B54.toInt(), 1f, x, 830f, boxWidth, 75f)
        canvas.text(paint, stat.value, x + boxWidth / 2, 864f, stat.color, 20f, CardFont.MonoBold)
        canvas.text(paint, stat.label, x + boxWidth / 2, 888f, GREY_400, 11f, CardFont.MonoBold)
    }
}

private fun Canvas.stroke(paint: Paint, color: Int, width: Float, x: Float, y: Float, w: Float, h: Float) {
    paint.color = color
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = width
    drawRect(x, y, x + w, y + h, paint)
    paint.style = Paint.Style.FILL
}

private fun Canvas.text(paint: Paint, text: String, x: Float, y: Float, color: Int, size: Float, font: Typeface) {
    paint.color = color
    paint.textSize = size
    paint.typeface = font
    paint.textAlign = Paint.Align.CENTER
    drawText(text, x, y, paint)
}

/** Cinzel, Plus Jakarta Sans and JetBrains Mono aren't bundled: the same system families as `theme/Type.kt`. */
private object CardFont {
    val DisplayBold: Typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
    val Body: Typeface = Typeface.SANS_SERIF
    val BodyBold: Typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    val BodyItalic: Typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.ITALIC)
    val Mono: Typeface = Typeface.MONOSPACE
    val MonoBold: Typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
}

/** `toLocaleString()`. */
internal fun formatScore(score: Int): String = "%,d".format(Locale.US, score)

/** Scaled down by powers of two while its longer side stays at least [maxEdge]. Null when it won't decode. */
internal fun decodeBoundedJpeg(jpeg: ByteArray, maxEdge: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
    return BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, BitmapFactory.Options().apply { inSampleSize = sample })
}

private val UNSAFE_IN_FILE_NAME = Regex("[/\\\\:*?\"<>|\\x00-\\x1F]")

/** `Diwali_Fun_Play_${playerName}_${score}.jpg`, minus what a file name can't hold. */
fun cardFileName(playerName: String, score: Int): String =
    "Diwali_Fun_Play_${playerName}_$score.jpg".replace(UNSAFE_IN_FILE_NAME, "_")
