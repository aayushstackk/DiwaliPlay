package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.SpinOutcome
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.flow.RoundCard
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.RewardItem
import java.io.File
import java.util.Locale

/** What the wheel needs from the screen's owner. */
class WheelInputs(
    val rewards: List<RewardItem>,
    val requestSpin: suspend () -> SpinOutcome,
    /** `completeSession` hasn't answered: not yet. */
    val held: Boolean = false,
    val onTick: (Float) -> Unit = {},
    val onVictory: () -> Unit = {},
    val onSettled: () -> Unit = {},
    val loadRewards: suspend () -> List<RewardItem>? = { null },
)

/**
 * The one end-of-round screen, with everything in reach: on the left the photo, who it is, the wish and the Save button;
 * on the right the score, the wheel (or, with rewards off, a larger score), feedback and PLAY AGAIN.
 *
 * Trial rounds have no feedback, as on the web. [wheel] is null with rewards off. From a spin's request until the prize
 * is on show there's no way off the screen: the server may have recorded a prize, and the player must see it.
 */
@Composable
fun GameOverScreen(
    card: RoundCard,
    brandName: String,
    isTrial: Boolean,
    autoReturnSeconds: Int?,
    recordedFeedback: GameFeedback?,
    localFiles: Map<String, File>,
    wheel: WheelInputs?,
    onSave: suspend () -> Boolean,
    onFeedback: (GameFeedback) -> Unit,
    onPlayAgain: () -> Unit,
    onClose: () -> Unit,
) {
    var spinBusy by remember { mutableStateOf(false) }
    EndOfRoundFrame(isTrial, autoReturnSeconds, !spinBusy, onClose) {
        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(
                Modifier.weight(1f).fillMaxHeight(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                PhotoFrame(card)
                NamePlate(card)
                WishCard(card.wish, brandName, Modifier.weight(1f).fillMaxWidth())
                SaveCardPanel(onSave, Modifier.fillMaxWidth())
            }
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (wheel != null) {
                    CompactScoreStrip(card)
                    card.earnedReward?.let { EarnedRewardStrip(it, localFiles) }
                    SpinWheelPanel(
                        wheel.rewards, isTrial, localFiles, wheel.requestSpin, wheel.onTick, wheel.onVictory, wheel.onSettled,
                        Modifier.weight(1f).fillMaxWidth(), wheel.loadRewards, wheel.held, { spinBusy = it },
                    )
                } else {
                    LargeScorePanel(card, Modifier.weight(1f).fillMaxWidth())
                    card.earnedReward?.let { EarnedRewardStrip(it, localFiles) }
                }
                if (!isTrial) FeedbackRow(recordedFeedback, onFeedback)
                GoldButton("PLAY AGAIN", Tags.PLAY_AGAIN, Icons.RotateCcw, Modifier.fillMaxWidth(), !spinBusy, onPlayAgain)
            }
        }
    }
}

@Composable
private fun NamePlate(card: RoundCard) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Label(
            card.playerName.uppercase(Locale.ROOT), 34.sp, Palette.Amber300, Modifier.fillMaxWidth(),
            family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText,
        )
        val pill = RoundedCornerShape(999.dp)
        Row(
            Modifier.panel(Palette.Amber500.copy(alpha = 0.25f), Palette.Amber400.copy(alpha = 0.6f), pill).padding(horizontal = 14.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Label(card.achievement.emoji, 15.sp, Palette.Amber200)
            Label(card.achievement.title.uppercase(Locale.ROOT), 15.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider)
            Label("•", 15.sp, Palette.Amber300)
            Label(card.achievement.subtitle, 14.sp, Palette.Amber200.copy(alpha = 0.85f), weight = FontWeight.SemiBold)
        }
    }
}
