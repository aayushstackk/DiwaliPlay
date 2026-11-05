package com.aayush.diwaliplay.app.ui.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.Label
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.app.ui.panel
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.tracking.camera.DELEGATE_NONE
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

/** Compose overlays aren't per-frame (spec §5): the numbers are sampled, so they can recompose this at most this often. */
private const val SAMPLE_MS = 500L

/** Spec §9's performance overlay. Sampling is why the sources are functions rather than state. */
@Composable
fun PerfOverlay(
    status: () -> TrackingStatus,
    renderFps: () -> Float,
    lowEnd: () -> Boolean,
    modifier: Modifier = Modifier,
) {
    val lines by produceState(perfOverlayLines(status(), renderFps(), lowEnd())) {
        while (true) {
            value = perfOverlayLines(status(), renderFps(), lowEnd())
            delay(SAMPLE_MS)
        }
    }
    Column(
        modifier
            .padding(16.dp)
            .testTag(Tags.PERF_OVERLAY)
            .panel(Palette.Neutral950.copy(alpha = 0.8f), Palette.Amber500.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        for (line in lines) {
            Label(line, 16.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Bold, align = TextAlign.Start)
        }
    }
}

internal fun perfOverlayLines(status: TrackingStatus, renderFps: Float, lowEnd: Boolean): List<String> =
    listOf("Render ${renderFps.roundToInt()} fps" + if (lowEnd) " (low-end)" else "") + trackingLines(status)

/** The tracking half: also the admin camera test's status. */
internal fun trackingLines(status: TrackingStatus): List<String> = when (status) {
    TrackingStatus.Starting -> listOf("Tracking starting")
    is TrackingStatus.Running ->
        if (status.delegate == DELEGATE_NONE) {
            listOf("Tracking off", "Camera ${status.cameraFps.roundToInt()} fps")
        } else {
            listOf(
                "Tracking ${status.delegate}",
                "Inference ${String.format(Locale.US, "%.1f", status.inferenceMs)} ms",
                "Camera ${status.cameraFps.roundToInt()} fps",
            )
        }
    is TrackingStatus.CameraLost -> listOf("Camera lost: ${status.reason}")
    is TrackingStatus.Failed -> listOf("Tracking failed: ${status.reason}")
}
