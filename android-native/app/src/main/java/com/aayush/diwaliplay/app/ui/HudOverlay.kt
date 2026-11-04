package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.flow.HudState
import com.aayush.diwaliplay.game.formatGameTimer
import java.util.Locale
import kotlinx.coroutines.delay

/** App.tsx: the "COMBO x3 +50 BONUS!" banner stays up this long. */
private const val COMBO_NOTICE_MS = 1400L

private fun Int.grouped() = String.format(Locale.US, "%,d", this)

/** App.tsx's round HUD: timer, score and the target bar at top right, and its two popups. */
@Composable
fun HudOverlay(hud: HudState, targetScore: Int?) {
    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.align(Alignment.TopEnd).padding(horizontal = 32.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                TimerPill(hud.secondsLeftCeil)
                ScorePill(hud)
            }
            val progress = hud.targetProgress
            if (targetScore != null && progress != null) TargetBar(hud.score, targetScore, progress)
        }
        ComboNotice(hud.comboCount, Modifier.align(Alignment.TopCenter).padding(top = 144.dp))
        if (hud.targetAchieved && targetScore != null) {
            TargetAchievedPopup(targetScore, Modifier.align(Alignment.TopCenter).padding(top = 96.dp))
        }
    }
}

@Composable
private fun TimerPill(seconds: Int) {
    val urgent = seconds <= 10
    val pulse by rememberPulse()
    Row(
        Modifier
            .alpha(if (urgent) pulse else 1f)
            .panel(
                if (urgent) Palette.Rose950.copy(alpha = 0.85f) else Palette.Neutral950.copy(alpha = 0.7f),
                if (urgent) Palette.Rose500 else Palette.Amber500.copy(alpha = 0.35f),
                RoundedCornerShape(16.dp),
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Timer, 20.dp, if (urgent) Palette.Rose400 else Palette.Amber400)
        Label(
            formatGameTimer(seconds.toDouble()), 24.sp, if (urgent) Palette.Rose200 else Palette.Amber100,
            Modifier.testTag(Tags.HUD_TIMER),
            family = Fonts.Mono, weight = FontWeight.Black, tracking = TrackingWider,
        )
    }
}

@Composable
private fun ScorePill(hud: HudState) {
    Row(
        Modifier
            .panel(Palette.Neutral950.copy(alpha = 0.7f), Palette.Amber500.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Trophy, 20.dp, Palette.Amber400)
        Label("SCORE", 12.sp, Palette.Neutral400, family = Fonts.Mono, weight = FontWeight.Bold)
        Label(
            hud.score.grouped(), 24.sp, Palette.Amber300, Modifier.testTag(Tags.HUD_SCORE),
            family = Fonts.Mono, weight = FontWeight.Black,
        )
        if (hud.comboCount > 0) {
            Label(
                "${hud.comboCount} ${if (hud.comboCount == 1) "COMBO" else "COMBOS"}", 11.sp, Palette.Neutral950,
                Modifier
                    .padding(start = 4.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Brush.horizontalGradient(listOf(Palette.Amber500, Palette.Yellow400)))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                weight = FontWeight.Black,
            )
        }
    }
}

/** App.tsx's "TARGET GOAL" bar, only when a target score is on. */
@Composable
private fun TargetBar(score: Int, target: Int, percent: Int) {
    val achieved = score >= target
    Column(
        Modifier
            .width(340.dp)
            .panel(Palette.Neutral950.copy(alpha = 0.85f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Target, 14.dp, Palette.Amber400)
                Label("TARGET GOAL", 11.sp, Palette.Amber300, family = Fonts.Mono, weight = FontWeight.Bold)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Label("${score.grouped()} / ${target.grouped()}", 11.sp, Palette.Neutral200, family = Fonts.Mono, weight = FontWeight.Bold)
                val shape = RoundedCornerShape(4.dp)
                Label(
                    "$percent%", 10.sp, if (achieved) Palette.Emerald300 else Palette.Amber300,
                    Modifier
                        .background(if (achieved) Palette.Emerald500.copy(alpha = 0.25f) else Palette.Amber500.copy(alpha = 0.15f), shape)
                        .border(1.dp, if (achieved) Palette.Emerald500.copy(alpha = 0.4f) else Palette.Amber500.copy(alpha = 0.3f), shape)
                        .padding(horizontal = 6.dp),
                    family = Fonts.Mono, weight = FontWeight.Black,
                )
            }
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(CircleShape)
                .panel(Palette.Neutral900, Palette.Neutral800, CircleShape),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(percent.coerceIn(0, 100) / 100f)
                    .height(8.dp)
                    .background(
                        Brush.horizontalGradient(
                            if (achieved) {
                                listOf(Palette.Emerald400, Palette.Teal300, Palette.Emerald400)
                            } else {
                                listOf(Palette.Amber500, Palette.Yellow400, Palette.Amber300)
                            },
                        ),
                    ),
            )
        }
    }
}

/** Shown for 1400 ms each time the awarded-combo count rises. */
@Composable
private fun ComboNotice(comboCount: Int, modifier: Modifier) {
    var lastSeen by remember { mutableIntStateOf(comboCount) }
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(comboCount) {
        val rose = comboCount > lastSeen
        lastSeen = comboCount
        if (rose) {
            visible = true
            delay(COMBO_NOTICE_MS)
            visible = false
        }
    }
    if (visible) {
        Label(
            "⚡ COMBO x3  +50 BONUS! 💥", 16.sp, Palette.Neutral950,
            modifier
                .clip(RoundedCornerShape(16.dp))
                .background(Brush.horizontalGradient(listOf(Palette.Amber500, Palette.Yellow400, Palette.Amber500)))
                .border(1.dp, Palette.Yellow200, RoundedCornerShape(16.dp))
                .padding(horizontal = 20.dp, vertical = 10.dp),
            family = Fonts.Mono, weight = FontWeight.Black, tracking = TrackingWider,
        )
    }
}

@Composable
private fun TargetAchievedPopup(target: Int, modifier: Modifier) {
    Row(
        modifier
            .panel(Palette.Neutral950.copy(alpha = 0.95f), Palette.Amber400, RoundedCornerShape(16.dp), 2.dp)
            .padding(horizontal = 24.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Centered(Modifier.size(44.dp).panel(Palette.Amber500.copy(alpha = 0.2f), Palette.Amber400, CircleShape, 2.dp)) {
            Label("🎯", 24.sp, Palette.Amber100)
        }
        Column {
            Label(
                "TARGET ACHIEVED!", 18.sp, Palette.Amber100,
                family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider,
                brush = Brush.horizontalGradient(listOf(Palette.Amber100, Palette.Amber300, Palette.Yellow200)),
            )
            Label("${target.grouped()} POINTS REACHED 🎆", 12.sp, Palette.Amber200.copy(alpha = 0.95f), family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWide)
        }
    }
}
