package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.RewardItem
import java.io.File

private val GameFeedback.label: String
    get() = when (this) {
        GameFeedback.Good -> "Good"
        GameFeedback.Excellent -> "Excellent"
        GameFeedback.NeedsImprovement -> "Needs Improvement"
    }

/**
 * GameOverModal's feedback bar and PLAY AGAIN button, the last step. Its select becomes a row of big buttons, for a
 * touch screen. Trial rounds have no feedback, as on the web. The won voucher stays in view: it isn't anywhere else now.
 */
@Composable
fun FeedbackScreen(
    reward: RewardItem?,
    isTrial: Boolean,
    autoReturnSeconds: Int?,
    recorded: GameFeedback?,
    localFiles: Map<String, File>,
    onSubmit: (GameFeedback) -> Unit,
    onPlayAgain: () -> Unit,
    onClose: () -> Unit,
) {
    EndOfRoundFrame(Tags.FEEDBACK_SCREEN, isTrial, autoReturnSeconds, onClose) {
        Column(
            Modifier.fillMaxWidth().weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Column(Modifier.width(860.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                if (reward != null) {
                    VoucherStrip("YOUR FESTIVE PRIZE", reward.name, reward.couponCode, reward.imageUrl.ifEmpty { null }, localFiles, Tags.FEEDBACK_REWARD)
                    Spacer(Modifier.height(32.dp))
                }
                if (!isTrial) {
                    FeedbackBar(recorded, onSubmit)
                    Spacer(Modifier.height(32.dp))
                }
                GoldButton("PLAY AGAIN", Tags.PLAY_AGAIN, Icons.RotateCcw, Modifier.fillMaxWidth(), onPlayAgain)
            }
        }
    }
}

@Composable
private fun FeedbackBar(recorded: GameFeedback?, onSubmit: (GameFeedback) -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .panel(Palette.Neutral900.copy(alpha = 0.9f), Palette.Amber500.copy(alpha = 0.2f), shape)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Sparkles, 20.dp, Palette.Amber400)
            Label("Game Feedback:", 24.sp, Palette.Amber300, family = Fonts.Display, weight = FontWeight.Medium)
        }
        Spacer(Modifier.height(20.dp))
        if (recorded != null) {
            val thanks = RoundedCornerShape(10.dp)
            Row(
                Modifier
                    .testTag(Tags.FEEDBACK_THANKS)
                    .panel(Palette.Emerald500.copy(alpha = 0.1f), Palette.Emerald500.copy(alpha = 0.3f), thanks)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Check, 20.dp, Palette.Emerald400)
                Label("Feedback recorded: ${recorded.label} — Thank you!", 18.sp, Palette.Emerald400, weight = FontWeight.Medium)
            }
        } else {
            var selected by remember { mutableStateOf<GameFeedback?>(null) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (option in listOf(GameFeedback.Good, GameFeedback.Excellent, GameFeedback.NeedsImprovement)) {
                    FeedbackOption(option, selected == option, Modifier.weight(1f)) { selected = option }
                }
            }
            Spacer(Modifier.height(16.dp))
            SubmitButton(selected, onSubmit)
        }
    }
}

@Composable
private fun FeedbackOption(option: GameFeedback, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier
            .testTag(Tags.feedback(option.name))
            .height(64.dp)
            .clip(shape)
            .background(if (selected) Palette.Amber500.copy(alpha = 0.25f) else Palette.Neutral950, shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) Palette.Amber400 else Palette.Neutral700, shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Label(option.label, 18.sp, if (selected) Palette.Amber100 else Palette.Neutral100, weight = FontWeight.SemiBold)
    }
}

@Composable
private fun SubmitButton(selected: GameFeedback?, onSubmit: (GameFeedback) -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    val background = if (selected != null) {
        Modifier.background(Brush.horizontalGradient(listOf(Palette.Amber500, Palette.Yellow500)), shape)
    } else {
        Modifier.background(Palette.Neutral800, shape)
    }
    Box(
        Modifier
            .testTag(Tags.FEEDBACK_SUBMIT)
            .width(240.dp)
            .height(48.dp)
            .clip(shape)
            .then(background)
            .clickable(enabled = selected != null) { selected?.let(onSubmit) },
        contentAlignment = Alignment.Center,
    ) {
        Label("SUBMIT", 15.sp, if (selected != null) Palette.Neutral950 else Palette.Neutral500, weight = FontWeight.Bold, tracking = TrackingWider)
    }
}
