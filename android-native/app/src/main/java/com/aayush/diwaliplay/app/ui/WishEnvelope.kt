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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import com.aayush.diwaliplay.game.flow.RoundCard
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** handleEnvelopeTap: how long "UNVEILING YOUR BLESSING..." shows. */
private const val ENVELOPE_OPENING_MS = 750L

/** "Saved!" stays up this long. */
private const val SAVED_MS = 3000L

private enum class Envelope { Closed, Opening, Opened }

@Composable
internal fun WishPanel(card: RoundCard, brandName: String, onChime: () -> Unit, onSave: suspend () -> Boolean, modifier: Modifier) {
    var envelope by remember { mutableStateOf(Envelope.Closed) }
    LaunchedEffect(envelope) {
        if (envelope == Envelope.Opening) {
            delay(ENVELOPE_OPENING_MS)
            envelope = Envelope.Opened
        }
    }
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier
            .background(
                Brush.horizontalGradient(listOf(Palette.Amber950.copy(alpha = 0.4f), Color(0x4078350F), Color(0x40422006))),
                shape,
            )
            .border(1.dp, Palette.Amber500.copy(alpha = 0.4f), shape),
        contentAlignment = Alignment.Center,
    ) {
        CornerAccents(8.dp, 12.dp, Palette.Amber400.copy(alpha = 0.6f), 1.dp)
        when (envelope) {
            Envelope.Closed -> ClosedEnvelope(card.playerName) {
                onChime()
                envelope = Envelope.Opening
            }
            Envelope.Opening -> OpeningEnvelope()
            Envelope.Opened -> OpenedWish(card.wish, brandName, onSave, onReread = { envelope = Envelope.Closed })
        }
    }
}

@Composable
private fun ClosedEnvelope(playerName: String, onTap: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Sparkles, 12.dp, Palette.Amber400)
            Label("FESTIVE DIWALI BLESSING", 13.sp, Palette.Amber300, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
            Icon(Icons.Sparkles, 12.dp, Palette.Amber400)
        }
        Spacer(Modifier.height(2.dp))
        Label("Open your personalized Diwali wish", 12.sp, Palette.Amber200.copy(alpha = 0.8f))
        Spacer(Modifier.height(10.dp))
        val shape = RoundedCornerShape(12.dp)
        Column(
            Modifier
                .testTag(Tags.ENVELOPE)
                .width(340.dp)
                .clip(shape)
                .background(Brush.verticalGradient(listOf(Color(0xFF25173D), Color(0xFF1B1130), Color(0xFF140A26))), shape)
                .border(2.dp, Palette.Amber400.copy(alpha = 0.7f), shape)
                .clickable(onClick = onTap)
                .padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Box(
                    Modifier.size(84.dp).background(
                        Brush.radialGradient(listOf(Palette.Amber400.copy(alpha = 0.3f), Color.Transparent)), CircleShape,
                    ),
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Mail, 40.dp, Palette.Amber300)
                    Label("🪔", 14.sp, Palette.Amber300)
                }
            }
            Label("SPECIALLY FOR", 10.sp, Palette.Amber300.copy(alpha = 0.8f), family = Fonts.Mono, tracking = TrackingWidest)
            Label(playerName.uppercase(Locale.ROOT), 16.sp, Palette.Amber100, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
            Spacer(Modifier.height(6.dp))
            Label(
                "TAP TO REVEAL WISH", 11.sp, Palette.Amber200,
                Modifier.panel(Palette.Amber500.copy(alpha = 0.2f), Palette.Amber400.copy(alpha = 0.4f), RoundedCornerShape(999.dp)).padding(horizontal = 12.dp, vertical = 3.dp),
                family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider,
            )
        }
    }
}

@Composable
private fun OpeningEnvelope() {
    Column(Modifier.pulsing(), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center) {
            Box(Modifier.size(56.dp).pinging().background(Palette.Amber400.copy(alpha = 0.5f), CircleShape))
            Icon(Icons.Mail, 40.dp, Palette.Yellow200)
        }
        Spacer(Modifier.height(6.dp))
        Label("UNVEILING YOUR BLESSING...", 13.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
    }
}

@Composable
private fun OpenedWish(wish: FormattedPersonalizedWish, brandName: String, onSave: suspend () -> Boolean, onReread: () -> Unit) {
    Column(Modifier.fillMaxSize().testTag(Tags.WISH).padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Label(
            "🪔 YOUR SPECIAL WISH FROM ${brandName.uppercase(Locale.ROOT)} 🪔", 11.sp, Palette.Amber300,
            family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWidest,
        )
        Spacer(Modifier.height(6.dp))
        val shape = RoundedCornerShape(12.dp)
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0xF2180E2B), Color(0xF2130A24), Color(0xF20E061D))), shape)
                .border(1.dp, Palette.Amber500.copy(alpha = 0.4f), shape)
                .padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Label(wish.heading.uppercase(Locale.ROOT), 24.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText)
            Spacer(Modifier.height(4.dp))
            Box(Modifier.width(96.dp).height(1.dp).background(Brush.horizontalGradient(listOf(Color.Transparent, Palette.Amber400.copy(alpha = 0.5f), Color.Transparent))))
            Column(
                Modifier.weight(1f).fillMaxWidth().padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
            ) {
                for (line in wish.lines) Label(line, 21.sp, Palette.Amber100.copy(alpha = 0.95f), weight = FontWeight.Medium)
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.Amber500.copy(alpha = 0.25f)))
            Spacer(Modifier.height(6.dp))
            val (closing, signature) = splitSignoff(wish.signoff, brandName)
            if (closing != null) Label(closing, 17.sp, Palette.Amber300.copy(alpha = 0.85f), family = Fonts.Display, weight = FontWeight.Medium, style = FontStyle.Italic)
            Label(signature.uppercase(Locale.ROOT), 20.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWidest, brush = GoldText)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Label("Re-read Envelope", 13.sp, Palette.Amber400, Modifier.clickable(onClick = onReread), family = Fonts.Mono)
            Spacer(Modifier.weight(1f))
            SaveCardButton(onSave)
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

@Composable
private fun SaveCardButton(onSave: suspend () -> Boolean) {
    // null: idle; true / false: how the last save went, for a moment.
    var outcome by remember { mutableStateOf<Boolean?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier
            .testTag(Tags.SAVE_CARD)
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
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        when (outcome) {
            true -> {
                Icon(Icons.Check, 12.dp, Palette.Emerald400)
                Label("Saved!", 11.sp, Palette.Emerald400, Modifier.testTag(Tags.CARD_SAVED), family = Fonts.Mono, weight = FontWeight.Bold)
            }
            false -> {
                Icon(Icons.AlertCircle, 12.dp, Palette.Rose400)
                Label("Couldn't save", 11.sp, Palette.Rose300, family = Fonts.Mono)
            }
            null -> {
                Icon(Icons.Download, 12.dp, Palette.Amber300)
                Label("Save Card", 13.sp, Palette.Amber200, family = Fonts.Mono)
            }
        }
    }
}
