package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.MutableDoubleState
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.SpinDriver
import com.aayush.diwaliplay.app.SpinOutcome
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.app.wheelRewards
import com.aayush.diwaliplay.model.RewardItem
import java.io.File
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Spec §10's message for any failed spin. */
const val REWARDS_UNAVAILABLE = "Rewards are unavailable right now"

/** The web's wheel is 250 px across: the pointer and hub are specified at that size. */
private val WEB_WHEEL = 250.dp

/** How far the pointer stands above the wheel, at [WEB_WHEEL]. */
private val POINTER_OVERHANG = 12.dp

/** Holds the status line or the failure banner, so the wheel doesn't change size when one replaces the other. */
private val STATUS_HEIGHT = 44.dp

private enum class WheelStage { Ready, Spinning, Voucher }

private enum class Hub { Ready, Waiting, Spinning, Spent }

/**
 * GameOverModal's Spin & Win panel, spun in place. [rewards] is everything the admin has set up: the wheel takes its
 * slices from it once, then from [loadRewards]. Once it has given its answer, the voucher takes the wheel's place. While
 * [held], or until those slices are in, it can't be spun and says so. [onBusy] is true from a spin's request until its
 * prize is on show or it has failed. The
 * wheel's angle and needle are read only in layers, so a spin composes nothing per frame.
 *
 * All of this is kept here because it lasts exactly as long as the screen does: leaving the screen ends the spin too.
 */
@Composable
fun SpinWheelPanel(
    rewards: List<RewardItem>,
    isTrial: Boolean,
    localFiles: Map<String, File>,
    requestSpin: suspend () -> SpinOutcome,
    onTick: (Float) -> Unit,
    onVictory: () -> Unit,
    onSettled: () -> Unit,
    modifier: Modifier = Modifier,
    loadRewards: suspend () -> List<RewardItem>? = { null },
    held: Boolean = false,
    onBusy: (Boolean) -> Unit = {},
) {
    // The cached copy shows at once; today's replaces it before the wheel can be spun.
    var slices by remember { mutableStateOf(wheelRewards(rewards)) }
    var loaded by remember { mutableStateOf(false) }
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
    val latestLoad by rememberUpdatedState(loadRewards)
    val latestBusy by rememberUpdatedState(onBusy)

    LaunchedEffect(Unit) {
        latestLoad()?.let { slices = it }
        loaded = true
        if (slices.isEmpty()) latestSettled()
    }

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
        latestBusy(false)
        // Spec §10: after a failure too, the kiosk moves on. The master session is the view model's to leave alone.
        latestSettled()
    }

    val panel = RoundedCornerShape(16.dp)
    Box(
        modifier
            .background(Brush.verticalGradient(listOf(Color(0xF21A1226), Color(0xF2140D22), Color(0xF20E081A))), panel)
            .border(1.dp, Palette.Amber500.copy(alpha = 0.4f), panel),
        contentAlignment = Alignment.Center,
    ) {
        CornerAccents(8.dp, 12.dp, Palette.Amber400.copy(alpha = 0.6f), 1.dp)
        val winner = won
        if (stage == WheelStage.Voucher && winner != null) {
            SpinVoucher(winner, isTrial, localFiles, onSpinAgain = {
                stage = WheelStage.Ready
                won = null
                failed = false
            })
        } else {
            Column(Modifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Gift, 20.dp, Palette.Amber400)
                    Label("SPIN & WIN", 20.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
                    Icon(Icons.Sparkles, 18.dp, Palette.Amber400)
                }
                BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    if (slices.isEmpty()) {
                        if (loaded) GiftPass() else Spinner(48.dp, Palette.Amber400)
                    } else {
                        // Whatever else the column is showing, the whole wheel and its pointer fit what's left.
                        val size = min(maxWidth, maxHeight * (WEB_WHEEL / (WEB_WHEEL + POINTER_OVERHANG)))
                        val hub = when {
                            stage == WheelStage.Spinning -> Hub.Spinning
                            hasSpun && !isTrial -> Hub.Spent
                            !loaded || held -> Hub.Waiting
                            else -> Hub.Ready
                        }
                        Wheel(
                            slices, size, angle, flapper, hub,
                            Modifier.offset(y = size * (POINTER_OVERHANG / WEB_WHEEL) / 2),
                        ) {
                            if (hub != Hub.Ready) return@Wheel
                            if (!isTrial) hasSpun = true
                            latestBusy(true)
                            failed = false
                            won = null
                            stage = WheelStage.Spinning
                            spins++
                        }
                    }
                }
                Box(Modifier.height(STATUS_HEIGHT).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    if (failed) {
                        ErrorBanner()
                    } else {
                        Label(
                            when {
                                stage == WheelStage.Spinning -> "Spinning..."
                                !loaded || held -> "Getting your wheel ready..."
                                isTrial -> "Master OTP Active: Unlimited spins enabled"
                                hasSpun -> "Spin chance used for this game"
                                else -> "Tap the wheel to spin and win"
                            },
                            14.sp, Palette.Amber200.copy(alpha = 0.7f), family = Fonts.Mono,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ErrorBanner() {
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier
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
    size: Dp,
    angle: MutableDoubleState,
    flapper: MutableFloatState,
    hub: Hub,
    modifier: Modifier,
    onSpin: () -> Unit,
) {
    val described = slices.joinToString { it.name }
    val scale = size / WEB_WHEEL
    Box(
        modifier.size(size).testTag(Tags.WHEEL).semantics { contentDescription = described },
        contentAlignment = Alignment.Center,
    ) {
        // Glow for shadow-[0_0_25px_rgba(245,158,11,0.3)]. The clip keeps a tap outside the rim from counting.
        Box(
            Modifier
                .fillMaxSize()
                .clip(CircleShape)
                .background(Brush.radialGradient(0.9f to Palette.Amber500.copy(alpha = 0.3f), 1f to Color.Transparent), CircleShape)
                .clickable(enabled = hub == Hub.Ready, onClick = onSpin),
        )
        Canvas(
            Modifier
                .fillMaxSize()
                .padding(8.dp)
                .graphicsLayer { rotationZ = (angle.doubleValue % 360.0).toFloat() },
        ) {
            drawIntoCanvas { drawWheel(it.nativeCanvas, this.size.width, slices) }
        }
        SpinButton(scale, hub, onSpin)
        Pointer(scale, flapper, Modifier.align(Alignment.TopCenter).offset(y = -(POINTER_OVERHANG * scale)))
    }
}

@Composable
private fun SpinButton(scale: Float, hub: Hub, onSpin: () -> Unit) {
    Box(
        Modifier
            .testTag(Tags.SPIN_BUTTON)
            .size(64.dp * scale)
            .graphicsLayer { alpha = if (hub == Hub.Spinning || hub == Hub.Spent) 0.75f else 1f }
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(Palette.Amber300, Palette.Amber500, Color(0xFFB45309))), CircleShape)
            .border(4.dp * scale / 1.2f, Color(0xFF140D07), CircleShape)
            .clickable(enabled = hub == Hub.Ready, onClick = onSpin),
        contentAlignment = Alignment.Center,
    ) {
        if (hub == Hub.Waiting) {
            // Moving, so it's plainly on its way rather than broken.
            Column(Modifier.testTag(Tags.SPIN_WAITING), horizontalAlignment = Alignment.CenterHorizontally) {
                Spinner(20.dp * scale, Palette.Neutral950)
                Label("WAIT", (6.5f * scale).sp, Palette.Neutral950, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider)
            }
        } else {
            Label(
                when (hub) {
                    Hub.Spinning -> "..."
                    Hub.Spent -> "DONE"
                    else -> "SPIN"
                },
                (13.3f * scale).sp, Palette.Neutral950, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider,
            )
        }
    }
}

/** The pivot jewel and the deflecting needle, which hinges at its top. */
@Composable
private fun Pointer(scale: Float, flapper: MutableFloatState, modifier: Modifier) {
    val jewel: Dp = 16.dp * scale
    val needleWidth: Dp = 14.dp * scale
    val needleHeight: Dp = 17.dp * scale
    Column(modifier.testTag(Tags.POINTER), horizontalAlignment = Alignment.CenterHorizontally) {
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
                .offset(y = -(4.dp * scale))
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
