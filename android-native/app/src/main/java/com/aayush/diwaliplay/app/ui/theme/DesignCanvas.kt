package com.aayush.diwaliplay.app.ui.theme

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

const val DESIGN_WIDTH = 1920f

/**
 * Lays out in the 1920x1080 design canvas: inside, 1.dp and 1.sp are one design pixel, the web's CSS pixel at 1920
 * wide, whatever the panel's real size or density (the WAF is 4K). So screens state plain design sizes, and everything
 * scales by screenWidthPx / 1920. Font scale is pinned to 1: a kiosk's layout mustn't follow a system font setting.
 */
@Composable
fun DesignCanvas(content: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val density = Density(density = constraints.maxWidth / DESIGN_WIDTH, fontScale = 1f)
        CompositionLocalProvider(LocalDensity provides density) { content() }
    }
}
