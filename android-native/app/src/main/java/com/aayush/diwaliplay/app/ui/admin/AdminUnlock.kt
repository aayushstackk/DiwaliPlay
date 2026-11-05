package com.aayush.diwaliplay.app.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.utf16CodePoint
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.Centered
import com.aayush.diwaliplay.app.ui.Icon
import com.aayush.diwaliplay.app.ui.Icons
import com.aayush.diwaliplay.app.ui.Label
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.app.ui.TrackingWider
import com.aayush.diwaliplay.app.ui.panel
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.kiosk.AdminPin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val UNLOCK_TAPS = 5
private const val UNLOCK_WINDOW_MS = 3_000L

internal const val PIN_LENGTH_MESSAGE = "The PIN must be 4 to 8 digits"
internal const val PIN_MISMATCH_MESSAGE = "Those PINs didn't match. Start again"
internal const val PIN_WRONG_MESSAGE = "Wrong PIN"

/** Where the start screen is on its way to the admin screen. */
enum class AdminStage { Closed, CreatePin, EnterPin, Open }

/** Spec §9: 5 taps within 3 s. */
class LogoTapCounter {
    private val taps = ArrayDeque<Long>()

    /** True on the tap that completes the sequence. Counting then starts over. */
    fun onTap(nowMs: Long): Boolean {
        taps.addLast(nowMs)
        if (taps.size > UNLOCK_TAPS) taps.removeFirst()
        val complete = taps.size == UNLOCK_TAPS && nowMs - taps.first() <= UNLOCK_WINDOW_MS
        if (complete) taps.clear()
        return complete
    }
}

/**
 * Over the start screen, with its own keypad: a kiosk may have no on-screen keyboard. [creating] is the first launch's
 * forced creation, which can't be cancelled.
 */
@Composable
fun AdminPinDialog(pin: AdminPin, creating: Boolean, onDone: () -> Unit, onCancel: () -> Unit) {
    var entered by remember { mutableStateOf("") }
    var firstEntry by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun type(digit: Char) {
        if (busy || entered.length >= AdminPin.MAX_LENGTH) return
        entered += digit
        error = null
    }

    fun backspace() {
        if (!busy) entered = entered.dropLast(1)
    }

    fun submit() {
        if (busy) return
        val value = entered
        if (!AdminPin.isValid(value)) {
            error = if (creating) PIN_LENGTH_MESSAGE else PIN_WRONG_MESSAGE
            entered = ""
            return
        }
        val first = firstEntry
        when {
            creating && first == null -> {
                firstEntry = value
                entered = ""
            }
            creating && first != value -> {
                firstEntry = null
                entered = ""
                error = PIN_MISMATCH_MESSAGE
            }
            else -> {
                busy = true
                scope.launch {
                    // PBKDF2 is slow on purpose.
                    val accepted = withContext(Dispatchers.Default) {
                        if (creating) {
                            pin.set(value)
                            true
                        } else {
                            pin.verify(value)
                        }
                    }
                    busy = false
                    if (accepted) {
                        onDone()
                    } else {
                        entered = ""
                        error = PIN_WRONG_MESSAGE
                    }
                }
            }
        }
    }

    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }

    Box(
        Modifier
            .fillMaxSize()
            .testTag(Tags.PIN_DIALOG)
            .background(Palette.Background.copy(alpha = 0.92f))
            // The start screen's keypad is underneath. A gesture detector, as `clickable` would merge the semantics below.
            .pointerInput(Unit) { detectTapGestures {} }
            .focusRequester(focus)
            .onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                val c = e.utf16CodePoint.toChar()
                when {
                    c in '0'..'9' -> { type(c); true }
                    e.key == Key.Backspace -> { backspace(); true }
                    e.key == Key.Enter || e.key == Key.NumPadEnter -> { submit(); true }
                    e.key == Key.Escape && !creating -> { onCancel(); true }
                    else -> false
                }
            }
            .focusable(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .width(440.dp)
                .panel(Palette.Neutral900, Palette.Amber500.copy(alpha = 0.5f), RoundedCornerShape(24.dp))
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val title = when {
                !creating -> "ADMIN PIN"
                firstEntry == null -> "CREATE ADMIN PIN"
                else -> "CONFIRM ADMIN PIN"
            }
            Label(
                title, 24.sp, Palette.Amber100, Modifier.testTag(Tags.PIN_TITLE),
                family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider,
            )
            if (creating) {
                Spacer(Modifier.height(6.dp))
                Label("4 to 8 digits. It protects the admin screen on this kiosk.", 14.sp, Palette.Neutral400)
            }
            Spacer(Modifier.height(16.dp))
            PinDots(entered.length)
            Box(Modifier.height(30.dp).padding(top = 6.dp), contentAlignment = Alignment.Center) {
                error?.let { Label(it, 15.sp, Palette.Rose300, Modifier.testTag(Tags.PIN_ERROR), weight = FontWeight.Bold) }
            }
            Spacer(Modifier.height(6.dp))
            PinKeypad(enabled = !busy, onDigit = ::type, onBackspace = ::backspace)
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!creating) {
                    PinButton("CANCEL", Tags.PIN_CANCEL, Palette.Neutral800, Palette.Neutral300, !busy, Modifier.weight(1f), onCancel)
                }
                PinButton(
                    if (busy) "…" else "OK", Tags.PIN_OK, Palette.Amber500, Palette.Neutral950,
                    !busy && entered.isNotEmpty(), Modifier.weight(1f), ::submit,
                )
            }
        }
    }
}

@Composable
private fun PinDots(count: Int) {
    Row(
        Modifier.height(24.dp).testTag(Tags.PIN_DOTS),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(AdminPin.MAX_LENGTH) { i ->
            val on = i < count
            Box(
                Modifier
                    .size(16.dp)
                    .panel(if (on) Palette.Amber400 else Color.Transparent, if (on) Palette.Amber400 else Palette.Neutral600, CircleShape),
            )
        }
    }
}

@Composable
private fun PinKeypad(enabled: Boolean, onDigit: (Char) -> Unit, onBackspace: () -> Unit) {
    Column(Modifier.width(300.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (row in listOf("123", "456", "789")) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (d in row) PinDigit(d, enabled, Modifier.weight(1f)) { onDigit(d) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Spacer(Modifier.weight(1f))
            PinDigit('0', enabled, Modifier.weight(1f)) { onDigit('0') }
            PinKey(enabled, Modifier.weight(1f).testTag(Tags.PIN_BACKSPACE), onBackspace) { Icon(Icons.Delete, 22.dp, Palette.Amber400) }
        }
    }
}

@Composable
private fun PinDigit(digit: Char, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    PinKey(enabled, modifier.testTag(Tags.pinKey(digit)), onClick) {
        Label(digit.toString(), 22.sp, Palette.Neutral100, family = Fonts.Mono, weight = FontWeight.Bold)
    }
}

@Composable
private fun PinKey(enabled: Boolean, modifier: Modifier, onClick: () -> Unit, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Centered(
        modifier
            .height(52.dp)
            .clip(shape)
            .panel(Palette.Neutral950.copy(alpha = 0.8f), Palette.Amber500.copy(alpha = 0.25f), shape)
            .clickable(enabled = enabled, onClick = onClick),
    ) { content() }
}

@Composable
private fun PinButton(text: String, tag: String, fill: Color, color: Color, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Centered(
        modifier
            .height(52.dp)
            .testTag(tag)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(shape)
            .background(fill, shape)
            .clickable(enabled = enabled, onClick = onClick),
    ) { Label(text, 16.sp, color, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider) }
}
