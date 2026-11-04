package com.aayush.diwaliplay.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette

/** CountdownOverlay: [step] 3, 2, 1, then 0 for "GO!". */
@Composable
fun CountdownOverlay(step: Int) {
    val isGo = step == 0
    val scale = remember(step) { Animatable(0.4f) }
    LaunchedEffect(step) { scale.animateTo(1f, tween(400, easing = CubicBezierEasing(0.175f, 0.885f, 0.32f, 1.275f))) }

    Column(
        Modifier
            .fillMaxSize()
            .testTag(Tags.COUNTDOWN)
            .background(Palette.Neutral950.copy(alpha = 0.4f)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        val glow = if (isGo) Palette.Emerald500 else Palette.Amber500
        Centered(
            Modifier
                .size(224.dp)
                .drawBehind {
                    drawCircle(
                        Brush.radialGradient(listOf(glow.copy(alpha = 0.3f), Color.Transparent), radius = size.minDimension),
                        radius = size.minDimension,
                    )
                }
                .background(Palette.Neutral950.copy(alpha = 0.8f), CircleShape)
                .border(4.dp, if (isGo) Palette.Emerald400 else Palette.Amber400.copy(alpha = 0.8f), CircleShape),
        ) {
            Label(
                if (isGo) "GO!" else step.toString(),
                if (isGo) 72.sp else 128.sp,
                if (isGo) Palette.Emerald300 else Palette.Amber300,
                Modifier.scale(scale.value),
                family = Fonts.Display, weight = FontWeight.Black,
            )
        }
        Spacer(Modifier.height(24.dp))
        Label(
            if (isGo) "BURST THE CRACKERS!" else "GET READY", 16.sp, Palette.Amber200,
            family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWidest,
        )
    }
}
