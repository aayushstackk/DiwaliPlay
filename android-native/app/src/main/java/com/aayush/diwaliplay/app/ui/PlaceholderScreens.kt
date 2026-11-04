package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.flow.GamePhase

// Task 19 replaces these with the photo, card, wheel and feedback screens.

@Composable
fun PhotoPlaceholder(phase: GamePhase.PhotoCountdown) {
    Column(
        Modifier.fillMaxSize().testTag(Tags.PHOTO_PLACEHOLDER).background(Palette.Neutral950.copy(alpha = 0.6f)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Label(
            when {
                phase.cameraError -> "Camera unavailable"
                phase.step == 0 -> "CLICK!"
                else -> phase.step.toString()
            },
            96.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black,
        )
    }
}

@Composable
fun StepPlaceholder(title: String, buttonTag: String, onContinue: () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(Palette.Neutral950.copy(alpha = 0.8f)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Label(title, 36.sp, Palette.Amber100, family = Fonts.Display, weight = FontWeight.Black)
        Spacer(Modifier.height(24.dp))
        val shape = RoundedCornerShape(12.dp)
        Label(
            "Continue", 18.sp, Palette.Neutral950,
            Modifier
                .testTag(buttonTag)
                .clip(shape)
                .background(Palette.Amber400, shape)
                .clickable(onClick = onContinue)
                .padding(horizontal = 32.dp, vertical = 12.dp),
            weight = FontWeight.Bold,
        )
    }
}
