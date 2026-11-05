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
 * PhotoCaptureModal, centred at a third of the screen's area: the title sits above the frame, the camera fills the frame edge
 * to edge, and the count and the status sit on it. The controller runs the countdown and the capture; this only shows them. The flash and "PHOTO
 * CAPTURED!" wait for a still to exist, so a failed capture announces nothing.
 */
@Composable
fun PhotoCountdownScreen(phase: GamePhase.PhotoCountdown, playerName: String, status: TrackingStatus, frames: () -> CameraFrame?) {
    val ready = !phase.waitingForCamera && !phase.cameraError
    val captured = phase.captured
    Box(
        Modifier.fillMaxSize().testTag(Tags.PHOTO_SCREEN).background(Palette.Neutral950.copy(alpha = 0.92f)),
        contentAlignment = Alignment.Center,
    ) {
        val shape = RoundedCornerShape(24.dp)
        Box(
            Modifier
                .testTag(Tags.PHOTO_FRAME)
                .width(1040.dp)
                .height(584.dp)
                .clip(shape)
                .background(Palette.Neutral900, shape)
                .border(2.dp, Palette.Amber400.copy(alpha = 0.7f), shape),
        ) {
            if (ready) LivePreview(frames, Modifier.fillMaxSize())
            when {
                phase.cameraError -> CameraErrorState(status)
                !ready -> StartingState()
                phase.step == 0 && !captured -> ClickBadge(Modifier.align(Alignment.Center))
            }
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(100.dp).background(BottomScrim))
            CornerAccents(10.dp, 28.dp, Palette.Amber300.copy(alpha = 0.8f), 3.dp)
            if (ready && phase.step > 0) CountdownRing(phase.step, Modifier.align(Alignment.TopEnd).padding(18.dp))
            // The error state says what's happening. The web's bar reads "Starting selfie camera..." beneath it.
            if (!phase.cameraError) StatusBar(phase, ready, captured, Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp))
            if (captured) CapturedStamp()
        }
        // The space above the centred 584-tall frame on the 1080-tall canvas.
        Box(Modifier.align(Alignment.TopCenter).fillMaxWidth().height(248.dp), contentAlignment = Alignment.Center) {
            Header(playerName, Modifier.testTag(Tags.PHOTO_HEADER))
        }
        if (captured) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.95f)))
    }
}

private val BottomScrim = Brush.verticalGradient(0f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.75f))

@Composable
private fun Header(playerName: String, modifier: Modifier) {
    Column(modifier.width(1500.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        val pill = RoundedCornerShape(999.dp)
        Row(
            Modifier.panel(Palette.Neutral950.copy(alpha = 0.6f), Palette.Amber500.copy(alpha = 0.5f), pill).padding(horizontal = 18.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Sparkles, 18.dp, Palette.Amber400, Modifier.pulsing())
            Label("VICTORY CELEBRATION SOUVENIR", 16.sp, Palette.Amber300, weight = FontWeight.SemiBold, tracking = TrackingWider)
            Icon(Icons.Sparkles, 18.dp, Palette.Amber400, Modifier.pulsing())
        }
        Spacer(Modifier.height(8.dp))
        Label("Ready for a Shot? 📸", 56.sp, Palette.Amber300, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText)
        Spacer(Modifier.height(4.dp))
        Label(
            "Strike your best festive pose, ${playerName.uppercase(Locale.ROOT)}! Souvenir photo auto-capturing in a moment 🎆",
            24.sp, Palette.Amber100, weight = FontWeight.Medium,
        )
    }
}

/** The mirrored analysis frames: a PreviewView can't live under the game surface (BackdropSurfaceView's KDoc). */
@Composable
internal fun LivePreview(frames: () -> CameraFrame?, modifier: Modifier) {
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
    Box(modifier.size(100.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().pinging().background(Color.Transparent, CircleShape).border(2.dp, Palette.Amber400.copy(alpha = 0.12f), CircleShape))
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
        Label(step.toString(), 52.sp, Palette.Amber300, Modifier.testTag(Tags.PHOTO_COUNT), family = Fonts.Mono, weight = FontWeight.Black, brush = GoldText)
    }
}

@Composable
private fun StartingState() {
    Column(
        Modifier.fillMaxSize().background(Palette.Neutral950.copy(alpha = 0.8f)).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spinner(96.dp, Palette.Amber400)
        Spacer(Modifier.height(20.dp))
        Label("STARTING CAMERA...", 32.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
        Spacer(Modifier.height(8.dp))
        Label("Preparing front selfie camera for your victory souvenir", 20.sp, Palette.Neutral300)
    }
}

/** What the error state says. A hand-tracking failure says nothing about the camera, which may be fine. */
internal fun photoErrorMessage(status: TrackingStatus): String {
    val failed = status as? TrackingStatus.Failed
    return when {
        failed?.cameraAlive == true -> "Your photo couldn't be taken this time. Continuing automatically to your celebration results..."
        failed?.reason.orEmpty().contains("permission", ignoreCase = true) ->
            "Camera permission was denied. Continuing automatically to your celebration results..."
        // The camera never failed; it just never delivered a frame (the 8 s watchdog).
        status is TrackingStatus.Starting || status is TrackingStatus.Running ->
            "Camera failed to start video feed. Continuing to celebration results..."
        else -> "Front camera unavailable. Continuing automatically to your celebration results..."
    }
}

@Composable
private fun CameraErrorState(status: TrackingStatus) {
    val message = photoErrorMessage(status)
    Column(
        Modifier.fillMaxSize().testTag(Tags.PHOTO_ERROR).background(Palette.Neutral950.copy(alpha = 0.9f)).padding(horizontal = 200.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(96.dp).panel(Palette.Rose500.copy(alpha = 0.2f), Palette.Rose500.copy(alpha = 0.4f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Alert, 48.dp, Palette.Rose400)
        }
        Spacer(Modifier.height(10.dp))
        Label(if (status is TrackingStatus.Failed && status.cameraAlive) "Photo Unavailable" else "Camera Unavailable", 36.sp, Palette.Rose200, family = Fonts.Display, weight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Label(message, 24.sp, Palette.Neutral300)
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.panel(Palette.Amber500.copy(alpha = 0.15f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(999.dp)).padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Spinner(22.dp, Palette.Amber400)
            Label("Continuing to results...", 22.sp, Palette.Amber300, family = Fonts.Mono)
        }
    }
}

/** "CLICK!", while the capture runs. */
@Composable
private fun ClickBadge(modifier: Modifier) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier
            .background(Brush.horizontalGradient(listOf(Palette.Amber500, Palette.Amber400, Palette.Yellow300)), shape)
            .padding(horizontal = 36.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(Icons.Camera, 44.dp, Palette.Neutral950, strokeWidth = 2.5f)
        Label("CLICK! \uD83D\uDCF8", 44.sp, Palette.Neutral950, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider)
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
                .padding(horizontal = 30.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Icon(Icons.Check, 30.dp, Palette.Neutral950, strokeWidth = 3f)
            Label("PHOTO CAPTURED!", 30.sp, Palette.Neutral950, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider)
        }
    }
}

@Composable
private fun StatusBar(phase: GamePhase.PhotoCountdown, ready: Boolean, captured: Boolean, modifier: Modifier) {
    Row(
        modifier.panel(Palette.Neutral950.copy(alpha = 0.7f), Palette.Amber500.copy(alpha = 0.5f), RoundedCornerShape(999.dp)).padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        when {
            captured -> {
                Icon(Icons.Check, 20.dp, Palette.Emerald400)
                Label("Transferring to celebration results...", 18.sp, Palette.Emerald300, family = Fonts.Mono, weight = FontWeight.Bold)
            }
            ready && phase.step == 0 -> {
                Icon(Icons.Camera, 20.dp, Palette.Amber400, Modifier.pulsing())
                Label("Capturing your celebration moment!", 18.sp, Palette.Amber300, family = Fonts.Mono, weight = FontWeight.Bold)
            }
            ready -> {
                Icon(Icons.Sparkles, 20.dp, Palette.Amber400, Modifier.spinning())
                Label("Auto-capturing in ${phase.step}s • Strike your pose!", 18.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Medium)
            }
            else -> {
                Spinner(18.dp, Palette.Amber400)
                Label("Starting selfie camera...", 18.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Medium)
            }
        }
    }
}
