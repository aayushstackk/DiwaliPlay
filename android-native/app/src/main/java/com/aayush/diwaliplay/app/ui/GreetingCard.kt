package com.aayush.diwaliplay.app.ui

import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.CardSaver
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.flow.RoundCard
import com.aayush.diwaliplay.model.EarnedReward
import java.io.File
import java.util.Locale
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.pow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** The score's count-up. */
private const val COUNT_UP_MS = 1200.0

private const val MAX_PHOTO_PX = 1280

private val CardFill = Color(0xFF140D26)

@Composable
fun rememberCardSaver(): CardSaver {
    val context = LocalContext.current
    return remember(context) { CardSaver(context) }
}

/** Renders off the main thread, saves on IO, and frees the bitmap. True if the card was saved. */
suspend fun saveCard(saver: CardSaver, card: RoundCard, brandName: String): Boolean = withContext(Dispatchers.Default) {
    val bitmap = renderCard(card.toCardData(brandName))
    try {
        withContext(Dispatchers.IO) { saver.save(bitmap, card.playerName, card.score.score) } != null
    } finally {
        bitmap.recycle()
    }
}

/**
 * GameOverModal: photo and recognition on the left; score, stats, any score prize and the wish envelope on the right.
 * The web's wheel and feedback bar are the next steps here, so the wish takes the wheel's half of the panel and the
 * button that leads on takes PLAY AGAIN's place.
 */
@Composable
fun GreetingCardScreen(
    card: RoundCard,
    brandName: String,
    rewardsEnabled: Boolean,
    isTrial: Boolean,
    autoReturnSeconds: Int?,
    localFiles: Map<String, File>,
    onChime: () -> Unit,
    onSave: suspend () -> Boolean,
    onContinue: () -> Unit,
    onClose: () -> Unit,
) {
    EndOfRoundFrame(Tags.CARD_SCREEN, isTrial, autoReturnSeconds, onClose) {
        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(Modifier.weight(5f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { PhotoFrame(card) }
                Spacer(Modifier.height(8.dp))
                Label("WELL DONE!", 14.sp, Palette.Amber300.copy(alpha = 0.9f), family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWidest)
                Label(
                    card.playerName.uppercase(Locale.ROOT), 36.sp, Palette.Amber300, Modifier.padding(vertical = 2.dp),
                    family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText,
                )
                Label("YOU PLAYED VERY WELL 🎆", 14.sp, Palette.Amber200.copy(alpha = 0.9f), weight = FontWeight.SemiBold, tracking = TrackingWide)
            }
            Column(Modifier.weight(7f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ScorePanel(card)
                StatsRow(card)
                card.earnedReward?.let { EarnedRewardStrip(it, localFiles) }
                WishPanel(card, brandName, onChime, onSave, Modifier.weight(1f).fillMaxWidth())
                GoldButton(
                    if (rewardsEnabled) "SPIN & WIN" else "CONTINUE", Tags.CARD_CONTINUE,
                    if (rewardsEnabled) Icons.Gift else null, Modifier.fillMaxWidth(), onContinue,
                )
            }
        }
    }
}

@Composable
private fun PhotoFrame(card: RoundCard) {
    val photo by produceState<ImageBitmap?>(null, card.photoJpeg) {
        val jpeg = card.photoJpeg
        value = jpeg?.let { withContext(Dispatchers.Default) { decodeBoundedJpeg(it, MAX_PHOTO_PX)?.asImageBitmap() } }
    }
    val outer = RoundedCornerShape(16.dp)
    val inner = RoundedCornerShape(14.dp)
    Box(
        Modifier
            .width(480.dp)
            .height(497.dp) // max-h-[46dvh]
            .background(Brush.verticalGradient(listOf(Palette.Amber400, Palette.Amber500.copy(alpha = 0.6f), Color(0xFFCA8A04))), outer)
            .padding(4.dp),
    ) {
        Box(
            Modifier.fillMaxSize().clip(inner).background(Palette.Neutral900, inner).border(1.dp, Palette.Amber400.copy(alpha = 0.5f), inner),
            contentAlignment = Alignment.Center,
        ) {
            val image = photo
            if (image != null) {
                Image(image, card.playerName, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else if (card.photoJpeg == null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(48.dp).panel(Palette.Amber500.copy(alpha = 0.2f), Palette.Amber400.copy(alpha = 0.4f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Camera, 24.dp, Palette.Amber400)
                    }
                    Spacer(Modifier.height(8.dp))
                    Label(card.playerName.uppercase(Locale.ROOT), 12.sp, Palette.Amber300, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
                }
            }
            CornerAccents(8.dp, 14.dp, Palette.Amber300.copy(alpha = 0.8f))
        }
    }
}

@Composable
private fun ScorePanel(card: RoundCard) {
    val shape = RoundedCornerShape(16.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color(0xFF18112C), Color(0xFF120B22))), shape)
            .border(1.dp, Palette.Amber500.copy(alpha = 0.5f), shape),
    ) {
        CornerAccents(8.dp, 12.dp, Palette.Amber400.copy(alpha = 0.6f), 1.dp)
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            val pill = RoundedCornerShape(999.dp)
            Row(
                Modifier.panel(Palette.Amber500.copy(alpha = 0.25f), Palette.Amber400.copy(alpha = 0.6f), pill).padding(horizontal = 10.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Label(card.achievement.emoji, 12.sp, Palette.Amber200)
                Label(card.achievement.title.uppercase(Locale.ROOT), 12.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider)
                Label(card.achievement.emoji, 12.sp, Palette.Amber200)
            }
            Spacer(Modifier.height(2.dp))
            Label(card.achievement.subtitle, 11.sp, Palette.Amber200.copy(alpha = 0.8f), weight = FontWeight.SemiBold, tracking = TrackingWide)
            CountUpScore(card.score.score)
            Label("TOTAL POINTS", 10.sp, Palette.Amber300.copy(alpha = 0.8f), family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWidest)
        }
    }
}

/** The 1.2 s count-up. It's drawn, not composed: the number changes every frame and only this canvas redraws. */
@Composable
private fun CountUpScore(target: Int) {
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
            .height(48.dp)
            .testTag(Tags.CARD_SCORE)
            .semantics { text = AnnotatedString(finalText) },
    ) {
        val progress = shown.floatValue.toDouble()
        val eased = 1.0 - (1.0 - progress).pow(3)
        val value = if (progress >= 1.0) target else floor(target * eased).toInt()
        paint.textSize = 42.sp.toPx()
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

@Composable
private fun StatsRow(card: RoundCard) {
    val s = card.score
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val m = Modifier.weight(1f)
        Stat(s.bombsBurst.toString(), "BOMBS BURST", Palette.Amber100, m)
        Stat(s.combosAwarded.toString(), "COMBOS", Palette.Amber300, m)
        Stat(if (s.penaltyDeductions > 0) "-${s.penaltyDeductions}" else "0", "PENALTY DED.", if (s.penaltyDeductions > 0) Palette.Rose400 else Palette.Neutral300, m)
        Stat("+${s.comboBonusPoints}", "COMBO BONUS", Palette.Emerald400, m)
        card.targetScore?.let { target ->
            val achieved = card.targetAchieved == true
            Stat(
                formatScore(target),
                if (achieved) "ACHIEVED 🎯" else "TARGET GOAL",
                if (achieved) Palette.Emerald300 else Palette.Amber200,
                m,
                labelColor = if (achieved) Palette.Emerald400 else Palette.Amber300.copy(alpha = 0.7f),
                fill = if (achieved) Palette.Emerald950.copy(alpha = 0.4f) else CardFill,
                border = if (achieved) Palette.Emerald500.copy(alpha = 0.5f) else Palette.Amber500.copy(alpha = 0.3f),
            )
        }
    }
}

@Composable
private fun Stat(
    value: String,
    label: String,
    color: Color,
    modifier: Modifier,
    labelColor: Color = Palette.Amber300.copy(alpha = 0.7f),
    fill: Color = CardFill,
    border: Color = Palette.Amber500.copy(alpha = 0.3f),
) {
    Column(
        modifier.panel(fill, border, RoundedCornerShape(8.dp)).padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Label(value, 18.sp, color, family = Fonts.Mono, weight = FontWeight.Bold)
        Label(label, 10.sp, labelColor, family = Fonts.Mono, weight = FontWeight.SemiBold, tracking = TrackingWider)
    }
}

@Composable
private fun EarnedRewardStrip(reward: EarnedReward, localFiles: Map<String, File>) {
    var copied by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    LaunchedEffect(copied) {
        if (copied) {
            delay(2_000)
            copied = false
        }
    }
    VoucherStrip("SCORE PRIZE UNLOCKED!", reward.name, reward.couponCode, reward.imageUrl, localFiles, Tags.CARD_REWARD) {
        val shape = RoundedCornerShape(8.dp)
        Box(
            Modifier
                .size(36.dp)
                .clip(shape)
                .background(Palette.Amber500.copy(alpha = 0.2f), shape)
                .border(1.dp, Palette.Amber400.copy(alpha = 0.5f), shape)
                .clickable {
                    clipboard.setText(AnnotatedString(reward.couponCode))
                    copied = true
                },
            contentAlignment = Alignment.Center,
        ) {
            if (copied) Icon(Icons.Check, 16.dp, Palette.Emerald400) else Icon(Icons.Copy, 16.dp, Palette.Amber200)
        }
    }
}
