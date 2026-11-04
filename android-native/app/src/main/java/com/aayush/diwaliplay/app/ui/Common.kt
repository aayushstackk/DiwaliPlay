package com.aayush.diwaliplay.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.aayush.diwaliplay.app.ui.theme.Fonts

/** Tailwind letter spacing. */
val TrackingWide = 0.025.em
val TrackingWider = 0.05.em
val TrackingWidest = 0.1.em

/** Text sized in design pixels, with no ambient Material styling. */
@Composable
fun Label(
    text: String,
    size: TextUnit,
    color: Color,
    modifier: Modifier = Modifier,
    family: FontFamily = Fonts.Body,
    weight: FontWeight = FontWeight.Normal,
    tracking: TextUnit = TextUnit.Unspecified,
    style: FontStyle = FontStyle.Normal,
    align: TextAlign = TextAlign.Center,
    brush: Brush? = null,
) {
    val base = TextStyle(
        fontSize = size,
        fontFamily = family,
        fontWeight = weight,
        fontStyle = style,
        letterSpacing = tracking,
        textAlign = align,
    )
    Text(
        text = text,
        modifier = modifier,
        maxLines = 3,
        style = if (brush != null) base.copy(brush = brush) else base.copy(color = color),
    )
}

/** Tailwind's `animate-pulse`: a 1..0.5 alpha cycle. */
@Composable
fun rememberPulse(): State<Float> = rememberInfiniteTransition(label = "pulse").animateFloat(
    initialValue = 1f,
    targetValue = 0.5f,
    animationSpec = infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Reverse),
    label = "alpha",
)

/** The frosted panels of the web UI: a dark fill and a thin border. The blur is left out for speed, as the web's `round-active` does. */
fun Modifier.panel(fill: Color, border: Color, shape: Shape, borderWidth: Dp = 1.dp): Modifier =
    background(fill, shape).border(borderWidth, border, shape)

/** A soft circular glow standing in for a blurred disc, centred at a fraction of the size. */
fun Modifier.ambientGlow(color: Color, centerX: Float, centerY: Float, radius: Dp): Modifier = drawBehind {
    val c = Offset(size.width * centerX, size.height * centerY)
    val r = radius.toPx()
    drawCircle(Brush.radialGradient(listOf(color, Color.Transparent), center = c, radius = r), r, c)
}

/** Centres one child. */
@Composable
fun Centered(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier, contentAlignment = Alignment.Center) { content() }
}
