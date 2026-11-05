package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** "Saved!" stays up this long. */
private const val SAVED_MS = 3000L

/** The wish's readable floor on the 1920 layout. */
internal const val WISH_MIN_SP = 18

/**
 * The personalised wish, always in view below the photo. Admins write these, so they can be any length: the body takes
 * the room that's left and its text shrinks to fit, down to a size still readable at kiosk distance, then truncates with
 * an ellipsis. The saved card is drawn separately and always has the whole wish.
 */
@Composable
internal fun WishCard(wish: FormattedPersonalizedWish, brandName: String, modifier: Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier
            .testTag(Tags.WISH)
            .background(Brush.verticalGradient(listOf(Color(0xF2180E2B), Color(0xF2130A24), Color(0xF20E061D))), shape)
            .border(1.dp, Palette.Amber500.copy(alpha = 0.4f), shape),
    ) {
        CornerAccents(6.dp, 12.dp, Palette.Amber400.copy(alpha = 0.6f), 1.dp)
        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Label(
                "🪔 YOUR SPECIAL WISH FROM ${brandName.uppercase(Locale.ROOT)} 🪔", 11.sp, Palette.Amber300,
                family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWidest,
            )
            Spacer(Modifier.height(4.dp))
            Label(wish.heading.uppercase(Locale.ROOT), 24.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText)
            Spacer(Modifier.height(4.dp))
            Box(Modifier.width(96.dp).height(1.dp).background(Brush.horizontalGradient(listOf(Color.Transparent, Palette.Amber400.copy(alpha = 0.5f), Color.Transparent))))
            Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                BasicText(
                    wish.lines.joinToString("\n"),
                    style = TextStyle(
                        fontFamily = Fonts.Body, fontWeight = FontWeight.Medium, color = Palette.Amber100.copy(alpha = 0.95f), textAlign = TextAlign.Center,
                    ),
                    modifier = Modifier.testTag(Tags.WISH_BODY),
                    overflow = TextOverflow.Ellipsis,
                    autoSize = TextAutoSize.StepBased(minFontSize = WISH_MIN_SP.sp, maxFontSize = 26.sp, stepSize = 1.sp),
                )
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.Amber500.copy(alpha = 0.25f)))
            Spacer(Modifier.height(4.dp))
            val (closing, signature) = splitSignoff(wish.signoff, brandName)
            if (closing != null) Label(closing, 15.sp, Palette.Amber300.copy(alpha = 0.85f), family = Fonts.Display, weight = FontWeight.Medium, style = FontStyle.Italic)
            Label(signature.uppercase(Locale.ROOT), 17.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWidest, brush = GoldText)
        }
    }
}

/** GameOverModal's signoff parts: the closing line, if any, and the name beneath it. */
internal fun splitSignoff(signoff: String, brandName: String): Pair<String?, String> {
    val parts = signoff.split("\n")
    return when {
        parts.size > 1 -> parts.dropLast(1).joinToString(" ") to parts.last()
        signoff.startsWith("—") -> null to signoff.removePrefix("—").trimStart()
        else -> signoff to brandName
    }
}

/** The bottom of the left column: saves the greeting card as an image. */
@Composable
internal fun SaveCardPanel(onSave: suspend () -> Boolean, modifier: Modifier = Modifier) {
    // null: idle; true / false: how the last save went, for a moment.
    var outcome by remember { mutableStateOf<Boolean?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .testTag(Tags.SAVE_CARD)
            .height(52.dp)
            .clip(shape)
            .background(Palette.Amber500.copy(alpha = 0.2f), shape)
            .border(1.dp, Palette.Amber400.copy(alpha = 0.5f), shape)
            .clickable(enabled = !saving) {
                saving = true
                scope.launch {
                    outcome = onSave()
                    saving = false
                    delay(SAVED_MS)
                    outcome = null
                }
            }
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        when (outcome) {
            true -> {
                Icon(Icons.Check, 20.dp, Palette.Emerald400)
                Label("Saved!", 16.sp, Palette.Emerald400, Modifier.testTag(Tags.CARD_SAVED), family = Fonts.Mono, weight = FontWeight.Bold)
            }
            false -> {
                Icon(Icons.AlertCircle, 20.dp, Palette.Rose400)
                Label("Couldn't save", 16.sp, Palette.Rose300, family = Fonts.Mono)
            }
            null -> {
                Icon(Icons.Download, 20.dp, Palette.Amber300)
                Label("SAVE YOUR GREETING CARD", 16.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
            }
        }
    }
}
