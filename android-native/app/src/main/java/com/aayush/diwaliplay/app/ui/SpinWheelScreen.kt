package com.aayush.diwaliplay.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.SpinDriver
import com.aayush.diwaliplay.app.SpinOutcome
import com.aayush.diwaliplay.app.parseVoucherTitle
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.app.wheelRewards
import com.aayush.diwaliplay.model.RewardItem
import java.io.File
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Spec §10's message for any failed spin. */
const val REWARDS_UNAVAILABLE = "Rewards are unavailable right now"

/** Web: `animate-voucher-zoom`'s length, and the wait before the auto-return starts. */
private const val VOUCHER_ZOOM_MS = 450

private val WHEEL_SIZE = 760.dp

/** The web's wheel is 250 px beside the wish; on its own step it's scaled up, and its pointer and button with it. */
private val POINTER_SCALE = WHEEL_SIZE / 250.dp

private enum class WheelStage { Ready, Spinning, Voucher }

/**
 * GameOverModal's Spin & Win panel as a step of its own. [rewards] is everything the admin has set up: the wheel takes
 * its slices from it once. The wheel's angle and needle are read only in layers, so a spin composes nothing per frame.
 */
@Composable
fun SpinWheelScreen(
    rewards: List<RewardItem>,
    isTrial: Boolean,
    autoReturnSeconds: Int?,
    localFiles: Map<String, File>,
    requestSpin: suspend () -> SpinOutcome,
    onTick: (Float) -> Unit,
    onVictory: () -> Unit,
    onSettled: () -> Unit,
    onContinue: (RewardItem?) -> Unit,
    onClose: () -> Unit,
) {
    val slices = remember { wheelRewards(rewards) }
    var stage by remember { mutableStateOf(WheelStage.Ready) }
    var spins by remember { mutableIntStateOf(0) }
    var hasSpun by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var won by remember { mutableStateOf<RewardItem?>(null) }
    val angle = remember { mutableDoubleStateOf(0.0) }
    val flapper = remember { mutableFloatStateOf(0f) }

    val latestRequest by rememberUpdatedState(requestSpin)
    val latestTick by rememberUpdatedState(onTick)
    val latestVictory by rememberUpdatedState(onVictory)
    val latestSettled by rememberUpdatedState(onSettled)

    LaunchedEffect(Unit) { if (slices.isEmpty()) latestSettled() }

    LaunchedEffect(spins) {
        if (spins == 0) return@LaunchedEffect
        val startMs = withFrameMillis { it }.toDouble()
        val driver = SpinDriver(slices, angle.doubleValue, startMs)
        launch { driver.onResult(latestRequest()) }
        while (driver.settled == null) {
            withFrameMillis { t ->
                val tick = driver.frame(t.toDouble())
                angle.doubleValue = driver.angle
                flapper.floatValue = driver.flapperDegrees
                if (tick >= 0f) latestTick(tick)
            }
        }
        when (val outcome = driver.settled) {
            is SpinOutcome.Won -> {
                won = outcome.reward
                latestVictory()
                stage = WheelStage.Voucher
                delay(VOUCHER_ZOOM_MS.toLong())
            }
            else -> {
                failed = true
                stage = WheelStage.Ready
            }
        }
        // Spec §10: after a failure too, the kiosk moves on. The master session is the view model's to leave alone.
        latestSettled()
    }

    EndOfRoundFrame(Tags.SPIN_SCREEN, isTrial, autoReturnSeconds, onClose) {
        val panel = RoundedCornerShape(16.dp)
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Brush.verticalGradient(listOf(Color(0xF21A1226), Color(0xF2140D22), Color(0xF20E081A))), panel)
                .border(1.dp, Palette.Amber500.copy(alpha = 0.4f), panel),
            contentAlignment = Alignment.Center,
        ) {
            CornerAccents(8.dp, 12.dp, Palette.Amber400.copy(alpha = 0.6f), 1.dp)
            val winner = won
            if (stage == WheelStage.Voucher && winner != null) {
                Voucher(winner, isTrial, localFiles, onSpinAgain = {
                    stage = WheelStage.Ready
                    won = null
                    failed = false
                })
            } else {
                Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Gift, 20.dp, Palette.Amber400)
                        Label("SPIN & WIN", 20.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
                        Icon(Icons.Sparkles, 18.dp, Palette.Amber400)
                    }
                    if (failed) ErrorBanner()
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        if (slices.isEmpty()) {
                            GiftPass()
                        } else {
                            Wheel(slices, angle, flapper, stage == WheelStage.Spinning, isTrial, hasSpun) {
                                if (stage == WheelStage.Spinning || (!isTrial && hasSpun)) return@Wheel
                                if (!isTrial) hasSpun = true
                                failed = false
                                won = null
                                stage = WheelStage.Spinning
                                spins++
                            }
                        }
                    }
                    Label(
                        when {
                            stage == WheelStage.Spinning -> "Spinning..."
                            isTrial -> "Master OTP Active: Unlimited spins enabled"
                            hasSpun -> "Spin chance used for this game"
                            else -> "Tap center SPIN button to win"
                        },
                        13.sp, Palette.Amber200.copy(alpha = 0.7f), family = Fonts.Mono,
                    )
                }
            }
        }
        // Nothing to wait for once the wheel has answered, or if it has nothing on it.
        if (stage != WheelStage.Spinning && (won != null || failed || slices.isEmpty())) {
            Spacer(Modifier.height(10.dp))
            GoldButton("CONTINUE", Tags.SPIN_CONTINUE, null, Modifier.fillMaxWidth()) { onContinue(won) }
        }
    }
}

@Composable
private fun ColumnScope.ErrorBanner() {
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier
            .padding(top = 6.dp)
            .testTag(Tags.SPIN_ERROR)
            .background(Palette.Rose950.copy(alpha = 0.8f), shape)
            .border(1.dp, Palette.Rose500.copy(alpha = 0.4f), shape)
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.AlertCircle, 16.dp, Palette.Rose400)
        Label(REWARDS_UNAVAILABLE, 15.sp, Palette.Rose200)
    }
}

@Composable
private fun GiftPass() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Gift, 64.dp, Palette.Amber400.copy(alpha = 0.6f))
        Spacer(Modifier.height(8.dp))
        Label("Diwali Gift Pass", 20.sp, Palette.Amber200, weight = FontWeight.Bold)
        Label("Complimentary festive blessing", 14.sp, Palette.Amber300.copy(alpha = 0.7f))
    }
}

@Composable
private fun Wheel(
    slices: List<RewardItem>,
    angle: androidx.compose.runtime.MutableDoubleState,
    flapper: MutableFloatState,
    spinning: Boolean,
    isTrial: Boolean,
    hasSpun: Boolean,
    onSpin: () -> Unit,
) {
    Box(Modifier.size(WHEEL_SIZE), contentAlignment = Alignment.Center) {
        // Glow for shadow-[0_0_25px_rgba(245,158,11,0.3)].
        Box(
            Modifier.fillMaxSize().background(
                Brush.radialGradient(0.9f to Palette.Amber500.copy(alpha = 0.3f), 1f to Color.Transparent),
                CircleShape,
            ),
        )
        Canvas(
            Modifier
                .fillMaxSize()
                .padding(8.dp)
                .graphicsLayer { rotationZ = (angle.doubleValue % 360.0).toFloat() },
        ) {
            drawIntoCanvas { drawWheel(it.nativeCanvas, size.width, slices) }
        }
        SpinButton(spinning, isTrial, hasSpun, onSpin)
        Pointer(flapper, Modifier.align(Alignment.TopCenter).offset(y = -(12.dp * POINTER_SCALE)))
    }
}

@Composable
private fun SpinButton(spinning: Boolean, isTrial: Boolean, hasSpun: Boolean, onSpin: () -> Unit) {
    val spent = !isTrial && hasSpun
    Box(
        Modifier
            .testTag(Tags.SPIN_BUTTON)
            .size(64.dp * POINTER_SCALE)
            .graphicsLayer { alpha = if (spinning || spent) 0.75f else 1f }
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(Palette.Amber300, Palette.Amber500, Color(0xFFB45309))), CircleShape)
            .border(4.dp * POINTER_SCALE / 1.2f, Color(0xFF140D07), CircleShape)
            .clickable(enabled = !spinning && !spent, onClick = onSpin),
        contentAlignment = Alignment.Center,
    ) {
        Label(
            when {
                spinning -> "..."
                spent -> "DONE"
                else -> "SPIN"
            },
            34.sp, Palette.Neutral950, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider,
        )
    }
}

/** The pivot jewel and the deflecting needle, which hinges at its top. */
@Composable
private fun Pointer(flapper: MutableFloatState, modifier: Modifier) {
    val jewel: Dp = 16.dp * POINTER_SCALE
    val needleWidth: Dp = 14.dp * POINTER_SCALE
    val needleHeight: Dp = 17.dp * POINTER_SCALE
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(jewel)
                .background(Brush.linearGradient(listOf(Palette.Amber200, Palette.Amber400, Color(0xFFB45309))), CircleShape)
                .border(1.dp, Palette.Amber950, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(jewel * 0.375f).background(Palette.Amber100, CircleShape))
        }
        Canvas(
            Modifier
                .offset(y = -(4.dp * POINTER_SCALE))
                .width(needleWidth)
                .height(needleHeight)
                .graphicsLayer {
                    rotationZ = flapper.floatValue
                    transformOrigin = TransformOrigin(0.5f, 0f)
                },
        ) {
            val path = Path().apply {
                moveTo(0f, 0f)
                lineTo(size.width, 0f)
                lineTo(size.width / 2, size.height)
                close()
            }
            drawPath(path, Palette.Amber400)
        }
    }
}

/** The zoomed winning voucher. */
@Composable
private fun Voucher(reward: RewardItem, isTrial: Boolean, localFiles: Map<String, File>, onSpinAgain: () -> Unit) {
    val zoom = remember { Animatable(0f) }
    LaunchedEffect(Unit) { zoom.animateTo(1f, tween(VOUCHER_ZOOM_MS, easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f))) }
    Column(
        Modifier
            .testTag(Tags.SPIN_VOUCHER)
            .width(620.dp)
            .graphicsLayer {
                // voucherZoom: 0.6 to 1.03 and opaque at 75%, then 1.
                val t = zoom.value
                val s = if (t < 0.75f) 0.6f + (1.03f - 0.6f) * (t / 0.75f) else 1.03f - 0.03f * ((t - 0.75f) / 0.25f)
                scaleX = s
                scaleY = s
                alpha = (t / 0.75f).coerceAtMost(1f)
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Label("🎉 YOU WON A FESTIVE PRIZE! 🎉", 26.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText)
        Spacer(Modifier.height(20.dp))
        val outer = RoundedCornerShape(24.dp)
        Box(
            Modifier
                .size(240.dp)
                .background(Brush.verticalGradient(listOf(Palette.Amber300, Palette.Yellow500, Color(0xFFB45309))), outer)
                .padding(5.dp),
        ) {
            val inner = RoundedCornerShape(20.dp)
            Box(Modifier.fillMaxSize().clip(inner).background(Color(0xFF1C1226), inner).padding(12.dp), contentAlignment = Alignment.Center) {
                val image = rememberRewardImage(reward.imageUrl.ifEmpty { null }, localFiles)
                if (image != null) {
                    Image(image, reward.name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                } else {
                    val title = parseVoucherTitle(reward.name)
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Gift, 80.dp, Palette.Amber400, Modifier.pulsing())
                        Spacer(Modifier.height(6.dp))
                        Label(title.line1, 24.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black)
                        if (title.line2.isNotEmpty()) Label(title.line2, 16.sp, Palette.Amber300.copy(alpha = 0.8f), weight = FontWeight.Bold, tracking = TrackingWider)
                    }
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        Label(reward.name, 28.sp, Palette.Amber100, family = Fonts.Display, weight = FontWeight.Black)
        Spacer(Modifier.height(14.dp))
        val box = RoundedCornerShape(12.dp)
        Column(
            Modifier.fillMaxWidth().background(Color(0xFF140803), box).border(1.dp, Palette.Amber400.copy(alpha = 0.6f), box).padding(vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Label("COUPON CODE", 12.sp, Palette.Amber300.copy(alpha = 0.7f), family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWidest)
            Spacer(Modifier.height(4.dp))
            Label(reward.couponCode, 32.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Black, tracking = TrackingWidest)
        }
        Spacer(Modifier.height(14.dp))
        Label(
            reward.termsAndConditions.ifEmpty { reward.description.ifEmpty { "Present this code to claim your reward." } },
            15.sp, Palette.Amber200.copy(alpha = 0.75f),
        )
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val pill = RoundedCornerShape(999.dp)
            Row(
                Modifier.panel(Palette.Emerald500.copy(alpha = 0.2f), Palette.Emerald400.copy(alpha = 0.4f), pill).padding(horizontal = 14.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Check, 14.dp, Palette.Emerald300)
                Label("VOUCHER UNLOCKED", 13.sp, Palette.Emerald300, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
            }
            if (isTrial) {
                Row(
                    Modifier
                        .testTag(Tags.SPIN_AGAIN)
                        .clip(pill)
                        .background(Palette.Amber500, pill)
                        .clickable(onClick = onSpinAgain)
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(Icons.RotateCw, 14.dp, Palette.Neutral950)
                    Label("SPIN AGAIN", 13.sp, Palette.Neutral950, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
                }
            }
        }
    }
}
