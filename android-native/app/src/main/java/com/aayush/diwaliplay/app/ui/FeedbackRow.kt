package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.model.GameFeedback

private val GameFeedback.label: String
    get() = when (this) {
        GameFeedback.Good -> "Good"
        GameFeedback.Excellent -> "Excellent"
        GameFeedback.NeedsImprovement -> "Needs Improvement"
    }

/**
 * The small feedback row under the wheel: one tap selects and sends, once. [recorded] is what was sent, if anything;
 * the choice stays lit and the other options go quiet.
 */
@Composable
internal fun FeedbackRow(recorded: GameFeedback?, onSubmit: (GameFeedback) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().height(48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.width(150.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (recorded != null) {
                Icon(Icons.Check, 18.dp, Palette.Emerald400)
                Label("Thank you!", 16.sp, Palette.Emerald400, Modifier.testTag(Tags.FEEDBACK_THANKS), weight = FontWeight.SemiBold)
            } else {
                Icon(Icons.Sparkles, 16.dp, Palette.Amber400)
                Label("How was it?", 16.sp, Palette.Amber300, family = Fonts.Display, weight = FontWeight.Medium)
            }
        }
        for (option in listOf(GameFeedback.Good, GameFeedback.Excellent, GameFeedback.NeedsImprovement)) {
            FeedbackOption(option, recorded, Modifier.weight(if (option == GameFeedback.NeedsImprovement) 1.4f else 1f)) { onSubmit(option) }
        }
    }
}

@Composable
private fun FeedbackOption(option: GameFeedback, recorded: GameFeedback?, modifier: Modifier, onClick: () -> Unit) {
    val selected = recorded == option
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier
            .testTag(Tags.feedback(option.name))
            .height(48.dp)
            .alpha(if (recorded != null && !selected) 0.45f else 1f)
            .clip(shape)
            .background(if (selected) Palette.Amber500.copy(alpha = 0.25f) else Palette.Neutral950, shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) Palette.Amber400 else Palette.Neutral700, shape)
            .clickable(enabled = recorded == null, onClick = onClick)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Label(option.label, 15.sp, if (selected) Palette.Amber100 else Palette.Neutral100, weight = FontWeight.SemiBold)
    }
}
