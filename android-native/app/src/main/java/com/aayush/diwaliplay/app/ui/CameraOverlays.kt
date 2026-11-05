package com.aayush.diwaliplay.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette

/** App.tsx's vision-model loading overlay. */
@Composable
fun VisionLoadingOverlay() {
    Column(
        Modifier.fillMaxSize().background(Palette.Neutral950.copy(alpha = 0.85f)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
            Spinner(64.dp, Palette.Amber400)
            Icon(Icons.Sparkles, 24.dp, Palette.Amber400)
        }
        Spacer(Modifier.height(16.dp))
        Label("INITIALIZING VISION ENGINE", 18.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider)
        Label("Loading Hand Landmarker...", 12.sp, Palette.Amber400.copy(alpha = 0.8f), Modifier.padding(top = 4.dp), family = Fonts.Mono)
    }
}

/** App.tsx's camera error overlay. */
@Composable
fun CameraErrorOverlay(reason: String, onRetry: () -> Unit, onCancel: () -> Unit, cameraAlive: Boolean = false) {
    Column(
        Modifier.fillMaxSize().background(Palette.Neutral950.copy(alpha = 0.9f)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Centered(Modifier.size(56.dp).panel(Palette.Rose500.copy(alpha = 0.1f), Palette.Rose500.copy(alpha = 0.3f), CircleShape)) {
            Icon(Icons.Alert, 28.dp, Palette.Rose400)
        }
        Spacer(Modifier.height(12.dp))
        // A hand-tracking failure isn't about camera access: the camera may be fine.
        Label(if (cameraAlive) "HAND TRACKING UNAVAILABLE" else "CAMERA ACCESS REQUIRED", 18.sp, Palette.Rose200, weight = FontWeight.Bold, tracking = TrackingWider)
        Spacer(Modifier.height(8.dp))
        Label(reason, 14.sp, Palette.Neutral300, Modifier.width(448.dp))
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val shape = RoundedCornerShape(8.dp)
            Row(
                Modifier
                    .clip(shape)
                    .background(Palette.Amber500, shape)
                    .clickable(onClick = onRetry)
                    .padding(horizontal = 20.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Camera, 16.dp, Palette.Neutral950)
                Label(if (cameraAlive) "TRY AGAIN" else "GRANT & START CAMERA", 12.sp, Palette.Neutral950, weight = FontWeight.Bold, tracking = TrackingWider)
            }
            Box(
                Modifier
                    .clip(shape)
                    .background(Palette.Neutral800, shape)
                    .clickable(onClick = onCancel)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) { Label("Cancel", 12.sp, Palette.Neutral200) }
        }
    }
}

/** A spinning three-quarter ring. */
@Composable
fun Spinner(size: Dp, color: Color) {
    val angle by rememberInfiniteTransition(label = "spin").animateFloat(
        0f, 360f, infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Restart), label = "angle",
    )
    Canvas(Modifier.size(size)) {
        val w = 2.dp.toPx()
        drawCircle(color.copy(alpha = 0.2f), radius = this.size.minDimension / 2 - w / 2, style = Stroke(w))
        drawArc(color, angle, 270f, useCenter = false, style = Stroke(w, cap = StrokeCap.Round))
    }
}
