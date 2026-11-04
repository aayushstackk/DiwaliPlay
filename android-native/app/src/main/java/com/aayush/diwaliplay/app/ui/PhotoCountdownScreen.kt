package com.aayush.diwaliplay.app.ui

import android.graphics.Matrix
import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.tracking.camera.CameraFrame
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import java.util.Locale

/**
 * PhotoCaptureModal. The controller runs the countdown and the capture; this only shows them. On the web, "CLICK!" is
 * replaced by "PHOTO CAPTURED!" in the same tick, so step 0 shows the flash and the stamp, as it does there.
 */
@Composable
fun PhotoCountdownScreen(phase: GamePhase.PhotoCountdown, playerName: String, status: TrackingStatus, frames: () -> CameraFrame?) {
    val ready = status is TrackingStatus.Running
    val captured = phase.step == 0 && !phase.cameraError
    Box(
        Modifier.fillMaxSize().testTag(Tags.PHOTO_SCREEN).background(Palette.Neutral950.copy(alpha = 0.92f)),
        contentAlignment = Alignment.Center,
    ) {
        val shape = RoundedCornerShape(24.dp)
        Box(Modifier.width(660.dp).panel(Palette.CardPanel, Palette.Amber500.copy(alpha = 0.6f), shape, 2.dp)) {
            CornerAccents(12.dp, 20.dp, Palette.Amber400)
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Header(playerName)
                Spacer(Modifier.height(12.dp))
                Viewport(phase, ready, captured, status, frames)
                Spacer(Modifier.height(16.dp))
                StatusBar(phase, ready, captured)
            }
        }
        if (captured) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.95f)))
    }
}

@Composable
private fun Header(playerName: String) {
    val pill = RoundedCornerShape(999.dp)
    Row(
        Modifier.panel(Palette.Amber500.copy(alpha = 0.15f), Palette.Amber500.copy(alpha = 0.4f), pill).padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Sparkles, 14.dp, Palette.Amber400, Modifier.pulsing())
        Label("VICTORY CELEBRATION SOUVENIR", 12.sp, Palette.Amber300, weight = FontWeight.SemiBold, tracking = TrackingWider)
        Icon(Icons.Sparkles, 14.dp, Palette.Amber400, Modifier.pulsing())
    }
    Spacer(Modifier.height(6.dp))
    Label("Ready for a Shot? 📸", 36.sp, Palette.Amber300, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText)
    Spacer(Modifier.height(4.dp))
    Label(
        "Strike your best festive pose, ${playerName.uppercase(Locale.ROOT)}! Souvenir photo auto-capturing in a moment 🎆",
        14.sp, Palette.Amber200.copy(alpha = 0.9f), weight = FontWeight.Medium,
    )
}

@Composable
private fun Viewport(phase: GamePhase.PhotoCountdown, ready: Boolean, captured: Boolean, status: TrackingStatus, frames: () -> CameraFrame?) {
    val shape = RoundedCornerShape(16.dp)
    Box(
        Modifier
            .width(500.dp)
            .height(281.dp)
            .clip(shape)
            .background(Palette.Neutral900, shape)
            .border(2.dp, Palette.Amber400.copy(alpha = 0.7f), shape),
    ) {
        if (ready && !phase.cameraError) LivePreview(frames, Modifier.fillMaxSize())
        CornerAccents(8.dp, 16.dp, Palette.Amber300.copy(alpha = 0.8f))
        when {
            phase.cameraError -> CameraErrorState(status)
            !ready -> StartingState()
            else -> {
                Label(
                    "📸 LIVE SELFIE PREVIEW", 10.sp, Palette.Amber200.copy(alpha = 0.9f),
                    Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 10.dp)
                        .panel(Palette.Neutral950.copy(alpha = 0.7f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                        .padding(horizontal = 12.dp, vertical = 2.dp),
                    family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider,
                )
                if (phase.step > 0) CountdownRing(phase.step, Modifier.align(Alignment.TopEnd).padding(12.dp))
            }
        }
        if (captured) CapturedStamp()
    }
}

/** The mirrored analysis frames: a PreviewView can't live under the game surface (BackdropSurfaceView's KDoc). */
@Composable
private fun LivePreview(frames: () -> CameraFrame?, modifier: Modifier) {
    var frameCount by remember { mutableIntStateOf(0) } // read only while drawing: no recomposition per frame
    LaunchedEffect(frames) {
        var last: CameraFrame? = null
        while (true) {
            withFrameMillis { }
            val f = frames()
            if (f !== last) {
                last = f
                frameCount++
            }
        }
    }
    val matrix = remember { Matrix() }
    val paint = remember { Paint(Paint.FILTER_BITMAP_FLAG) }
    Canvas(modifier) {
        @Suppress("UNUSED_EXPRESSION") frameCount
        val f = frames() ?: return@Canvas
        mapFrame(f.bitmap.width, f.bitmap.height, f.rotationDegrees, matrix, size.width, size.height)
        drawIntoCanvas { it.nativeCanvas.drawBitmap(f.bitmap, matrix, paint) }
    }
}

@Composable
private fun CountdownRing(step: Int, modifier: Modifier) {
    Box(modifier.size(52.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().pinging().background(Color.Transparent, CircleShape).border(1.dp, Palette.Amber400.copy(alpha = 0.12f), CircleShape))
        Box(Modifier.fillMaxSize().panel(Palette.Neutral950.copy(alpha = 0.8f), Palette.Amber400.copy(alpha = 0.8f), CircleShape))
        Canvas(Modifier.fillMaxSize()) {
            val k = size.width / 48f
            val stroke = 2.5f * k
            val r = 20f * k
            drawCircle(Palette.Amber500.copy(alpha = 0.25f), r, style = Stroke(stroke))
            val inset = size.width / 2 - r
            drawArc(
                Brush.linearGradient(listOf(Palette.Amber500, Palette.Amber400, Palette.Yellow300)),
                -90f, 360f * step / 5f, useCenter = false,
                topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                size = androidx.compose.ui.geometry.Size(2 * r, 2 * r),
                style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
        Label(step.toString(), 24.sp, Palette.Amber300, Modifier.testTag(Tags.PHOTO_COUNT), family = Fonts.Mono, weight = FontWeight.Black, brush = GoldText)
    }
}

@Composable
private fun StartingState() {
    Column(
        Modifier.fillMaxSize().background(Palette.Neutral950.copy(alpha = 0.8f)).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spinner(48.dp, Palette.Amber400)
        Spacer(Modifier.height(12.dp))
        Label("STARTING CAMERA...", 14.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
        Spacer(Modifier.height(4.dp))
        Label("Preparing front selfie camera for your victory souvenir", 11.sp, Palette.Neutral400)
    }
}

@Composable
private fun CameraErrorState(status: TrackingStatus) {
    val reason = (status as? TrackingStatus.Failed)?.reason.orEmpty()
    val message = if (reason.contains("permission", ignoreCase = true)) {
        "Camera permission was denied. Continuing automatically to your celebration results..."
    } else {
        "Front camera unavailable. Continuing automatically to your celebration results..."
    }
    Column(
        Modifier.fillMaxSize().testTag(Tags.PHOTO_ERROR).background(Palette.Neutral950.copy(alpha = 0.9f)).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(48.dp).panel(Palette.Rose500.copy(alpha = 0.2f), Palette.Rose500.copy(alpha = 0.4f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Alert, 24.dp, Palette.Rose400)
        }
        Spacer(Modifier.height(10.dp))
        Label("Camera Unavailable", 14.sp, Palette.Rose200, family = Fonts.Display, weight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Label(message, 12.sp, Palette.Neutral300)
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.panel(Palette.Amber500.copy(alpha = 0.15f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(999.dp)).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Spinner(14.dp, Palette.Amber400)
            Label("Continuing to results...", 12.sp, Palette.Amber300, family = Fonts.Mono)
        }
    }
}

@Composable
private fun CapturedStamp() {
    Box(Modifier.fillMaxSize().background(Palette.Neutral950.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
        val shape = RoundedCornerShape(16.dp)
        Row(
            Modifier
                .testTag(Tags.PHOTO_CAPTURED)
                .background(Brush.horizontalGradient(listOf(Palette.Emerald500.copy(alpha = 0.95f), Palette.Teal500.copy(alpha = 0.95f))), shape)
                .border(1.dp, Palette.Emerald300, shape)
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Check, 20.dp, Palette.Neutral950, strokeWidth = 3f)
            Label("PHOTO CAPTURED!", 16.sp, Palette.Neutral950, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider)
        }
    }
}

@Composable
private fun StatusBar(phase: GamePhase.PhotoCountdown, ready: Boolean, captured: Boolean) {
    Row(
        Modifier.panel(Palette.Amber500.copy(alpha = 0.1f), Palette.Amber500.copy(alpha = 0.25f), RoundedCornerShape(999.dp)).padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        when {
            captured -> {
                Icon(Icons.Check, 14.dp, Palette.Emerald400)
                Label("Transferring to celebration results...", 12.sp, Palette.Emerald300, family = Fonts.Mono, weight = FontWeight.Bold)
            }
            ready && !phase.cameraError -> {
                Icon(Icons.Sparkles, 14.dp, Palette.Amber400, Modifier.spinning())
                Label("Auto-capturing in ${phase.step}s • Strike your pose!", 12.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Medium)
            }
            else -> {
                Spinner(12.dp, Palette.Amber400)
                Label("Starting selfie camera...", 12.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Medium)
            }
        }
    }
}
