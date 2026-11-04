package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.CalibrationUi
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette

/** HandTargetBoxes: the guide banner and the two hand rings, over the live camera. */
@Composable
fun CalibrationScreen(ui: CalibrationUi, isReady: Boolean) {
    Box(Modifier.fillMaxSize().testTag(Tags.CALIBRATION).padding(24.dp)) {
        GuideBanner(ui, isReady, Modifier.align(Alignment.TopCenter).padding(top = 16.dp))
        Row(
            Modifier.align(Alignment.Center).fillMaxWidth().padding(horizontal = 144.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            HandIndicator(isLeft = true, ui.leftActive, ui.holdProgress, isReady)
            HandIndicator(isLeft = false, ui.rightActive, ui.holdProgress, isReady)
        }
    }
}

@Composable
private fun GuideBanner(ui: CalibrationUi, isReady: Boolean, modifier: Modifier) {
    val pulse by rememberPulse()
    Column(
        modifier
            .width(448.dp)
            .panel(
                if (isReady) Palette.Emerald950.copy(alpha = 0.9f) else Palette.Neutral950.copy(alpha = 0.8f),
                if (isReady) Palette.Emerald400 else Palette.Amber500.copy(alpha = 0.4f),
                RoundedCornerShape(16.dp),
            )
            .padding(horizontal = 32.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (isReady) {
            Label(
                "HANDS READY · GET READY!", 16.sp, Palette.Emerald300, Modifier.alpha(pulse),
                family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider,
            )
        } else {
            Label(
                if (ui.leftActive && ui.rightActive) "HOLD BOTH HANDS TO BEGIN" else "RAISE BOTH HANDS TO BEGIN",
                14.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWider,
            )
            Label(
                "Hold for 1 second to start Diwali Fun Play", 12.sp, Palette.Amber300.copy(alpha = 0.7f),
                Modifier.padding(top = 2.dp), family = Fonts.Mono,
            )
        }
        if (ui.holdProgress > 0 && ui.holdProgress < 1) {
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(CircleShape)
                    .panel(Palette.Neutral800, Palette.Amber500.copy(alpha = 0.3f), CircleShape),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(ui.holdProgress.toFloat())
                        .height(8.dp)
                        .background(Brush.horizontalGradient(listOf(Palette.Amber400, Palette.Yellow300, Palette.Emerald400))),
                )
            }
        }
    }
}

@Composable
private fun HandIndicator(isLeft: Boolean, isActive: Boolean, holdProgress: Double, isReady: Boolean) {
    val pulse by rememberPulse()
    val idle = !isActive && !isReady
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(240.dp), contentAlignment = Alignment.Center) {
            HandRing(isActive, holdProgress, isReady, idleAlpha = if (idle) pulse else 1f)
            Icon(
                Icons.Hand, 144.dp,
                when {
                    isReady -> Palette.Emerald300
                    isActive -> Palette.Yellow300
                    else -> Palette.Amber400
                },
                Modifier
                    .scale(
                        when {
                            isReady -> 1.1f
                            isActive -> 1.05f
                            else -> 1f
                        },
                    )
                    .alpha(if (idle) 0.6f * pulse else 1f),
                strokeWidth = if (isActive) 1.8f else 1.4f,
                fill = when {
                    isReady -> Palette.Emerald400.copy(alpha = 0.25f)
                    isActive -> Palette.Amber400.copy(alpha = 0.22f)
                    else -> Palette.Amber500.copy(alpha = 0.05f)
                },
                mirrored = isLeft,
            )
            if (isActive) {
                Centered(
                    Modifier
                        .align(if (isLeft) Alignment.BottomEnd else Alignment.BottomStart)
                        .padding(8.dp)
                        .size(36.dp)
                        .background(
                            Brush.linearGradient(
                                if (isReady) listOf(Palette.Emerald500, Palette.Emerald400) else listOf(Palette.Amber500, Palette.Yellow300),
                            ),
                            CircleShape,
                        ),
                ) { Icon(Icons.Check, 16.dp, Palette.Neutral950, strokeWidth = 3.5f) }
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(
            Modifier
                .panel(
                    when {
                        isReady -> Palette.Emerald950.copy(alpha = 0.9f)
                        isActive -> Palette.Amber950.copy(alpha = 0.8f)
                        else -> Palette.Neutral950.copy(alpha = 0.75f)
                    },
                    when {
                        isReady -> Palette.Emerald400
                        isActive -> Palette.Amber400.copy(alpha = 0.8f)
                        else -> Palette.Amber500.copy(alpha = 0.3f)
                    },
                    RoundedCornerShape(100.dp),
                )
                .padding(horizontal = 16.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(10.dp)
                    .alpha(if (idle) pulse else 1f)
                    .background(
                        when {
                            isReady -> Palette.Emerald400
                            isActive -> Palette.Yellow400
                            else -> Palette.Amber400.copy(alpha = 0.6f)
                        },
                        CircleShape,
                    ),
            )
            Label(
                if (isLeft) "LEFT HAND" else "RIGHT HAND", 14.sp,
                when {
                    isReady -> Palette.Emerald300
                    isActive -> Palette.Amber200
                    else -> Palette.Amber300.copy(alpha = 0.7f)
                },
                family = Fonts.Display, weight = FontWeight.Bold, tracking = TrackingWidest,
            )
        }
        Label(
            when {
                isReady -> "READY!"
                isActive -> "HOLD STEADY"
                else -> "RAISE HAND"
            },
            11.sp, Palette.Amber200.copy(alpha = 0.6f), Modifier.padding(top = 4.dp), family = Fonts.Mono, tracking = TrackingWider,
        )
    }
}

/** The 200-unit SVG ring with its aura: dashed when idle, an arc filling as the hands are held. */
@Composable
private fun HandRing(isActive: Boolean, holdProgress: Double, isReady: Boolean, idleAlpha: Float) {
    Canvas(Modifier.fillMaxSize()) {
        val k = size.width / 200f
        val auraInner = when {
            isReady -> Palette.Emerald400.copy(alpha = 0.35f)
            isActive -> Palette.Amber400.copy(alpha = 0.3f)
            else -> Palette.Amber500.copy(alpha = 0.1f * idleAlpha)
        }
        drawCircle(Brush.radialGradient(listOf(auraInner, Color.Transparent), radius = size.width * 0.5f * 1.05f))

        val ringColor = when {
            isReady -> Palette.Emerald400.copy(alpha = 0.6f)
            isActive -> Palette.Yellow400.copy(alpha = 0.4f)
            else -> Palette.Amber500.copy(alpha = 0.22f)
        }
        val radius = 80 * k
        drawCircle(
            ringColor, radius,
            style = Stroke(
                (if (isActive) 3.5f else 2.5f) * k,
                pathEffect = if (isActive) null else PathEffect.dashPathEffect(floatArrayOf(6 * k, 6 * k)),
            ),
        )
        if (isActive && holdProgress > 0) {
            rotate(-90f) {
                drawArc(
                    Brush.linearGradient(listOf(Palette.Amber500, Palette.Yellow300, Palette.Emerald400)),
                    startAngle = 0f,
                    sweepAngle = (holdProgress * 360).toFloat(),
                    useCenter = false,
                    topLeft = Offset(center.x - radius, center.y - radius),
                    size = Size(radius * 2, radius * 2),
                    style = Stroke(5 * k, cap = StrokeCap.Round),
                )
            }
        }
    }
}
