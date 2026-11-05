package com.aayush.diwaliplay.app.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.Label
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.kiosk.relay.RelayManager
import kotlinx.coroutines.delay

/** The text of the relay section for one [RelayManager.State]. [now] is only used to count down to the code's expiry. */
internal data class RelayLines(val status: String, val code: String?, val expiry: String?, val hint: String?)

internal fun relayLines(state: RelayManager.State, now: Long): RelayLines = when {
    state.paired && state.problem != null -> RelayLines(state.problem?.text.orEmpty(), null, null, "This display isn't reachable from the web admin panel until it is paired again.")
    state.paired -> RelayLines(
        status = if (state.connected) "Paired. Connected." else "Paired. Not connected: retrying.",
        code = null, expiry = null, hint = "Commands from the web admin panel reach this display while connected.",
    )
    state.code != null -> RelayLines(
        status = "Waiting for an admin to claim the code.",
        code = state.code,
        expiry = state.expiresAtMs?.let { "Expires in ${countdown(it - now)}" },
        hint = "In the web admin panel, open Game Settings, then Pair TV, and enter it.",
    )
    state.busy -> RelayLines("Asking the server for a code.", null, null, null)
    else -> RelayLines("Not paired.", null, null, "Pairing shows a 6-digit code to enter in the web admin panel.")
}

internal fun countdown(remainingMs: Long): String {
    val s = (remainingMs.coerceAtLeast(0) + 999) / 1000
    return "%d:%02d".format(s / 60, s % 60)
}

@Composable
internal fun ColumnScope.RelaySection(relay: RelayManager) {
    val state by relay.state.collectAsState()
    RelaySectionContent(state, relay::pair, relay::cancelPairing, relay::unpair)
}

@Composable
internal fun ColumnScope.RelaySectionContent(state: RelayManager.State, onPair: () -> Unit, onCancel: () -> Unit, onUnpair: () -> Unit) {
    val now by tickingClock(state.expiresAtMs != null)
    val lines = relayLines(state, now)
    Label(lines.status, 20.sp, Palette.Neutral100, Modifier.testTag(Tags.ADMIN_RELAY_STATE), weight = FontWeight.Bold, align = androidx.compose.ui.text.style.TextAlign.Start)
    if (lines.code != null) {
        Label(
            lines.code, 56.sp, Palette.Amber100, Modifier.testTag(Tags.ADMIN_RELAY_CODE),
            family = Fonts.Display, weight = FontWeight.Black, tracking = 8.sp, align = androidx.compose.ui.text.style.TextAlign.Start,
        )
    }
    if (lines.expiry != null) Hint(lines.expiry, Modifier.testTag(Tags.ADMIN_RELAY_EXPIRY))
    if (lines.hint != null) Hint(lines.hint)
    var confirming by remember { mutableStateOf(false) }
    val error = state.error
    if (error != null) Hint(error, Modifier.testTag(Tags.ADMIN_RELAY_ERROR), Palette.Rose300)
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            state.paired && confirming -> {
                AdminButton("Yes, unpair", Tags.ADMIN_RELAY_UNPAIR_CONFIRM, Palette.Rose500, Palette.Neutral950) {
                    confirming = false
                    onUnpair()
                }
                AdminButton("Keep paired", Tags.ADMIN_RELAY_UNPAIR_CANCEL, Palette.Neutral800, Palette.Neutral300) { confirming = false }
            }
            state.paired -> AdminButton("Unpair", Tags.ADMIN_RELAY_UNPAIR, Palette.Rose500, Palette.Neutral950) { confirming = true }
            state.busy -> AdminButton("Cancel", Tags.ADMIN_RELAY_CANCEL, Palette.Neutral800, Palette.Neutral300, onCancel)
            else -> AdminButton(if (error != null) "Try again" else "Pair this display", Tags.ADMIN_RELAY_PAIR, onClick = onPair)
        }
    }
}

/** Wall-clock time, once a second, and only while [running]. */
@Composable
private fun tickingClock(running: Boolean): State<Long> = produceState(System.currentTimeMillis(), running) {
    while (running) {
        value = System.currentTimeMillis()
        delay(1000)
    }
}
