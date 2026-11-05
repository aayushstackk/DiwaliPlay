package com.aayush.diwaliplay.app.ui

import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.flow.RoundCard
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.pow

/** The score's count-up. */
private const val COUNT_UP_MS = 1200.0

private val CardFill = Color(0xFF140D26)

private fun Modifier.scoreBackground(shape: RoundedCornerShape) =
    background(Brush.verticalGradient(listOf(Color(0xFF18112C), Color(0xFF120B22))), shape)
        .border(1.dp, Palette.Amber500.copy(alpha = 0.5f), shape)

/** Rewards on: the score and stats in one strip above the wheel, which needs the height. */
@Composable
internal fun CompactScoreStrip(card: RoundCard, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier.fillMaxWidth().scoreBackground(shape).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.width(210.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            CountUpScore(card.score.score, 40.sp, 48.dp)
            Label("TOTAL POINTS", 11.sp, Palette.Amber300.copy(alpha = 0.8f), family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWidest)
        }
        StatsRow(card, Modifier.weight(1f), 22.sp, 11.sp)
    }
}

/** Rewards off: the same numbers, in all the room the wheel would have had. */
@Composable
internal fun LargeScorePanel(card: RoundCard, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(16.dp)
    Box(modifier.testTag(Tags.SCORE_LARGE).scoreBackground(shape)) {
        CornerAccents(8.dp, 16.dp, Palette.Amber400.copy(alpha = 0.6f))
        Column(
            Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Label("TOTAL POINTS", 22.sp, Palette.Amber300.copy(alpha = 0.8f), family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWidest)
            CountUpScore(card.score.score, 130.sp, 170.dp)
            Spacer(Modifier.height(32.dp))
            StatsGrid(card)
        }
    }
}

/** The 1.2 s count-up. It's drawn, not composed: the number changes every frame and only this canvas redraws. */
@Composable
private fun CountUpScore(target: Int, textSize: TextUnit, height: Dp) {
    val shown = remember(target) { mutableFloatStateOf(0f) }
    LaunchedEffect(target) {
        val start = withFrameMillis { it }
        while (shown.floatValue < 1f) {
            withFrameMillis { t -> shown.floatValue = min(1.0, (t - start) / COUNT_UP_MS).toFloat() }
        }
    }
    val paint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
    }
    val finalText = remember(target) { formatScore(target) }
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(height)
            .testTag(Tags.CARD_SCORE)
            .semantics { text = AnnotatedString(finalText) },
    ) {
        val progress = shown.floatValue.toDouble()
        val eased = 1.0 - (1.0 - progress).pow(3)
        val value = if (progress >= 1.0) target else floor(target * eased).toInt()
        paint.textSize = textSize.toPx()
        val w = paint.measureText(formatScore(target))
        val cx = size.width / 2
        paint.shader = LinearGradient(
            cx - w / 2, 0f, cx + w / 2, 0f,
            intArrayOf(Palette.Amber100.toArgb(), Palette.Amber300.toArgb(), Palette.Yellow200.toArgb()), null, Shader.TileMode.CLAMP,
        )
        val baseline = size.height / 2 - (paint.ascent() + paint.descent()) / 2
        drawIntoCanvas { it.nativeCanvas.drawText(formatScore(value), cx, baseline, paint) }
    }
}

private class StatLine(val value: String, val label: String, val color: Color, val labelColor: Color, val fill: Color, val border: Color)

private fun statLines(card: RoundCard): List<StatLine> {
    val s = card.score
    val labelColor = Palette.Amber300.copy(alpha = 0.7f)
    val border = Palette.Amber500.copy(alpha = 0.3f)
    fun line(value: String, label: String, color: Color) = StatLine(value, label, color, labelColor, CardFill, border)
    return buildList {
        add(line(s.bombsBurst.toString(), "BOMBS BURST", Palette.Amber100))
        add(line(s.combosAwarded.toString(), "COMBOS", Palette.Amber300))
        add(line(if (s.penaltyDeductions > 0) "-${s.penaltyDeductions}" else "0", "PENALTY DED.", if (s.penaltyDeductions > 0) Palette.Rose400 else Palette.Neutral300))
        add(line("+${s.comboBonusPoints}", "COMBO BONUS", Palette.Emerald400))
        card.targetScore?.let { target ->
            val achieved = card.targetAchieved == true
            add(
                StatLine(
                    formatScore(target),
                    if (achieved) "ACHIEVED 🎯" else "TARGET GOAL",
                    if (achieved) Palette.Emerald300 else Palette.Amber200,
                    if (achieved) Palette.Emerald400 else labelColor,
                    if (achieved) Palette.Emerald950.copy(alpha = 0.4f) else CardFill,
                    if (achieved) Palette.Emerald500.copy(alpha = 0.5f) else border,
                ),
            )
        }
    }
}

@Composable
private fun StatsRow(card: RoundCard, modifier: Modifier, valueSize: TextUnit, labelSize: TextUnit) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (line in statLines(card)) Stat(line, Modifier.weight(1f), valueSize, labelSize, 6.dp)
    }
}

@Composable
private fun StatsGrid(card: RoundCard) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        for (row in statLines(card).chunked(2)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                for (line in row) Stat(line, Modifier.weight(1f), 48.sp, 16.sp, 16.dp)
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun Stat(line: StatLine, modifier: Modifier, valueSize: TextUnit, labelSize: TextUnit, padding: Dp) {
    Column(
        modifier.panel(line.fill, line.border, RoundedCornerShape(8.dp)).padding(vertical = padding, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Label(line.value, valueSize, line.color, family = Fonts.Mono, weight = FontWeight.Bold)
        Label(line.label, labelSize, line.labelColor, family = Fonts.Mono, weight = FontWeight.SemiBold)
    }
}
