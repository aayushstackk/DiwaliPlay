package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.utf16CodePoint
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.StartUi
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.branding.BrandingState
import com.google.zxing.BarcodeFormat
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter

/** KioskStartupScreen: branding, then the QR card and the code card side by side. */
@Composable
fun StartScreen(
    ui: StartUi,
    branding: BrandingState,
    registrationUrl: String,
    onDigit: (Char) -> Unit,
    onClear: () -> Unit,
    onBackspace: () -> Unit,
    onPlay: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }

    Box(
        Modifier
            .fillMaxSize()
            .testTag(Tags.START_SCREEN)
            .background(Palette.Background)
            .ambientGlow(Palette.Amber500.copy(alpha = 0.10f), 0.333f, 0.148f, 420.dp)
            .ambientGlow(Palette.Orange600.copy(alpha = 0.10f), 0.667f, 0.852f, 420.dp)
            .focusRequester(focus)
            .onPreviewKeyEvent { e ->
                // KioskStartupScreen's physical keyboard support.
                if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                val c = e.utf16CodePoint.toChar()
                when {
                    c in '0'..'9' -> { onDigit(c); true }
                    e.key == Key.Backspace -> { onBackspace(); true }
                    e.key == Key.Escape -> { onClear(); true }
                    e.key == Key.Enter || e.key == Key.NumPadEnter -> { onPlay(); true }
                    else -> false
                }
            }
            .focusable()
            .padding(20.dp),
    ) {
        BrandingBlock(branding, Modifier.align(Alignment.TopCenter).padding(top = 4.dp))

        Row(
            Modifier.align(Alignment.Center).width(1024.dp).padding(top = 72.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            QrCard(registrationUrl, Modifier.weight(1f))
            CodeCard(ui, Modifier.weight(1f), onDigit, onClear, onBackspace, onPlay)
        }

        Label(
            "Free Diwali Fun Play · Kiosk Experience", 10.sp, Palette.Neutral500,
            Modifier.align(Alignment.BottomCenter).padding(bottom = 4.dp), family = Fonts.Mono,
        )
        if (!ui.serverReachable) ConnectingBadge(Modifier.align(Alignment.BottomEnd))
    }
}

/** Spec §6: the state shown while the backend is unreachable. The trial code still works. */
@Composable
private fun ConnectingBadge(modifier: Modifier) {
    val pulse by rememberPulse()
    Row(
        modifier
            .testTag(Tags.CONNECTING)
            .panel(Palette.Neutral950.copy(alpha = 0.8f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(8.dp).alpha(pulse).background(Palette.Amber400, CircleShape))
        Label("Connecting to server…", 12.sp, Palette.Amber200, family = Fonts.Mono)
    }
}

@Composable
private fun QrCard(url: String, modifier: Modifier) {
    val pulse by rememberPulse()
    Column(
        modifier
            .panel(Palette.Neutral900.copy(alpha = 0.8f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(24.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Label("SCAN TO PLAY", 24.sp, Palette.Amber100, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
        Spacer(Modifier.height(12.dp))
        Centered(
            Modifier
                .panel(Color.White.copy(alpha = 0.05f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                .padding(14.dp),
        ) {
            Centered(
                Modifier
                    .panel(Palette.Amber100, Palette.Amber400, RoundedCornerShape(12.dp), 2.dp)
                    .padding(8.dp),
            ) { QrCode(url, 175.dp) }
        }
        Spacer(Modifier.height(16.dp))
        Centered(
            Modifier
                .alpha(pulse)
                .panel(Palette.Amber500.copy(alpha = 0.25f), Palette.Amber400, RoundedCornerShape(100.dp), 2.dp)
                .padding(horizontal = 24.dp, vertical = 8.dp),
        ) {
            Label("✨ FREE TO PLAY ✨", 16.sp, Palette.Amber200, weight = FontWeight.ExtraBold, tracking = TrackingWidest)
        }
    }
}

/** Modules drawn like QrCodeSvg: a white ground with a 4-module quiet zone, #0A0713 modules. */
@Composable
fun QrCode(url: String, size: Dp) {
    val matrix = remember(url) { encodeQr(url) }
    Canvas(
        Modifier
            .size(size)
            .testTag(Tags.QR)
            .clip(RoundedCornerShape(8.dp)),
    ) {
        drawRect(Color.White)
        val cell = this.size.width / matrix.width
        for (y in 0 until matrix.height) {
            for (x in 0 until matrix.width) {
                if (matrix[x, y]) drawRect(Palette.Background, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
            }
        }
    }
}

/** Size 1 asks for the bare matrix; ZXing's default margin is the 4-module quiet zone. */
private fun encodeQr(url: String): BitMatrix = QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 1, 1)

@Composable
private fun CodeCard(
    ui: StartUi,
    modifier: Modifier,
    onDigit: (Char) -> Unit,
    onClear: () -> Unit,
    onBackspace: () -> Unit,
    onPlay: () -> Unit,
) {
    val welcomed = ui.welcomeName != null
    val locked = ui.busy
    Column(
        modifier
            .panel(Palette.Neutral900.copy(alpha = 0.9f), Palette.Amber500.copy(alpha = 0.35f), RoundedCornerShape(24.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Label("ENTER YOUR CODE", 24.sp, Palette.Amber100, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
        Spacer(Modifier.height(8.dp))

        ui.error?.let { Notice(it, Palette.Rose500.copy(alpha = 0.2f), Palette.Rose500.copy(alpha = 0.5f), Palette.Rose300, Tags.ERROR) }
        ui.welcomeName?.let {
            Notice("Welcome, $it! Starting...", Palette.Emerald500.copy(alpha = 0.2f), Palette.Emerald400.copy(alpha = 0.6f), Palette.Emerald300, Tags.WELCOME)
        }

        Row(Modifier.padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            repeat(4) { i -> CodeBox(ui.code.getOrNull(i), isCurrent = ui.code.length == i, success = welcomed) }
        }

        Column(Modifier.width(300.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (row in listOf("123", "456", "789")) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    for (d in row) DigitKey(d, !locked, Modifier.weight(1f)) { onDigit(d) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SideKey(!locked && ui.code.isNotEmpty(), Modifier.weight(1f).testTag(Tags.CLEAR), onClear) {
                    Label("CLEAR", 12.sp, Palette.Neutral400, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
                }
                DigitKey('0', !locked, Modifier.weight(1f)) { onDigit('0') }
                SideKey(!locked && ui.code.isNotEmpty(), Modifier.weight(1f).testTag(Tags.BACKSPACE), onBackspace) {
                    Icon(Icons.Delete, 20.dp, Palette.Amber400)
                }
            }
            PlayButton(enabled = ui.code.length == 4 && !locked, busy = ui.busy && !welcomed, onPlay)
        }
    }
}

@Composable
private fun Notice(text: String, fill: Color, border: Color, color: Color, tag: String) {
    Box(
        Modifier
            .padding(bottom = 8.dp)
            .width(320.dp)
            .testTag(tag)
            .panel(fill, border, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) { Label(text, 12.sp, color, weight = FontWeight.Bold) }
}

@Composable
private fun CodeBox(digit: Char?, isCurrent: Boolean, success: Boolean) {
    val pulse by rememberPulse()
    val fill = if (success) Palette.Emerald950.copy(alpha = 0.9f) else Palette.Neutral950
    val (border, width) = when {
        success -> Palette.Emerald400 to 2.dp
        digit != null -> Palette.Amber400 to 2.dp
        isCurrent -> Palette.Amber500.copy(alpha = pulse) to 2.dp
        else -> Palette.Neutral700 to 1.dp
    }
    val color = when {
        success -> Palette.Emerald300
        digit != null -> Palette.Amber300
        isCurrent -> Palette.Amber400
        else -> Palette.Neutral600
    }
    Centered(Modifier.size(56.dp, 64.dp).panel(fill, border, RoundedCornerShape(12.dp), width)) {
        Label((digit ?: '—').toString(), 30.sp, color, family = Fonts.Mono, weight = FontWeight.Black)
    }
}

@Composable
private fun DigitKey(digit: Char, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    KeyBox(
        enabled,
        modifier.testTag(Tags.key(digit)),
        Palette.Neutral950.copy(alpha = 0.8f),
        Palette.Amber500.copy(alpha = 0.25f),
        disabledAlpha = 0.4f,
        onClick,
    ) { Label(digit.toString(), 20.sp, Palette.Neutral100, family = Fonts.Mono, weight = FontWeight.Bold) }
}

@Composable
private fun SideKey(enabled: Boolean, modifier: Modifier, onClick: () -> Unit, content: @Composable () -> Unit) {
    KeyBox(enabled, modifier, Palette.Neutral950.copy(alpha = 0.6f), Palette.Neutral800, disabledAlpha = 0.3f, onClick, content)
}

@Composable
private fun KeyBox(
    enabled: Boolean,
    modifier: Modifier,
    fill: Color,
    border: Color,
    disabledAlpha: Float,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    Centered(
        modifier
            .height(44.dp)
            .alpha(if (enabled) 1f else disabledAlpha)
            .clip(shape)
            .panel(fill, border, shape)
            .clickable(enabled = enabled, onClick = onClick),
    ) { content() }
}

@Composable
private fun PlayButton(enabled: Boolean, busy: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    val fill = if (enabled || busy) {
        Brush.horizontalGradient(listOf(Palette.Amber500, Palette.Amber400))
    } else {
        Brush.horizontalGradient(listOf(Palette.Neutral800, Palette.Neutral800))
    }
    Centered(
        Modifier
            .padding(top = 2.dp)
            .fillMaxWidth()
            .height(48.dp)
            .testTag(Tags.PLAY)
            .clip(shape)
            .background(fill, shape)
            .clickable(enabled = enabled, onClick = onClick),
    ) {
        if (busy) {
            Spinner(16.dp, Palette.Neutral950)
        } else {
            Label(
                "PLAY", 14.sp, if (enabled) Palette.Neutral950 else Palette.Neutral500,
                family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWidest,
            )
        }
    }
}
