package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.branding.BrandingState
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** BrandingBlock (kiosk size): title, connector, then the logo line. */
@Composable
fun BrandingBlock(branding: BrandingState, modifier: Modifier = Modifier, onLogoTap: (() -> Unit)? = null) {
    val s = branding.settings
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Label(
            s.experienceTitle.ifEmpty { "DIWALI FUN PLAY" }, 36.sp, Palette.Amber100,
            family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider,
        )
        if (s.connectorText.isNotEmpty()) {
            Label(
                s.connectorText.lowercase(), 14.sp, Palette.Amber300.copy(alpha = 0.8f),
                modifier = Modifier.padding(vertical = 4.dp),
                family = Fonts.Display, style = FontStyle.Italic, tracking = TrackingWidest,
            )
        } else {
            Spacer(Modifier.height(4.dp))
        }
        if (branding.isLoading) {
            Spacer(Modifier.size(s.logoWidth.dp, s.logoHeight.dp))
        } else {
            BrandLogo(branding, Modifier.padding(top = 4.dp), onLogoTap)
        }
    }
}

/** Plain gesture detection: no focus, ripple or click semantics, so nothing about the logo gives the admin entry away. */
@Composable
private fun Modifier.logoTaps(onTap: (() -> Unit)?): Modifier {
    if (onTap == null) return this
    val latest by rememberUpdatedState(onTap)
    return testTag(Tags.BRAND_LOGO).pointerInput(Unit) { detectTapGestures { latest() } }
}

/** BrandLogo (kiosk size), for the three `brandingDisplayMode`s. */
@Composable
private fun BrandLogo(branding: BrandingState, modifier: Modifier = Modifier, onTap: (() -> Unit)? = null) {
    val s = branding.settings
    val logo by rememberDecodedImage(s.brandLogoUrl?.let { branding.localFiles[it] })
    // After the offset, so the tap area moves with the logo.
    val moved = modifier.offset(s.logoPosition.x.dp, s.logoPosition.y.dp).logoTaps(onTap)
    val name = s.brandName.ifEmpty { "ItsSpotlight" }
    val image = logo

    when {
        s.brandingDisplayMode == "name" -> BrandBadge(moved) { BrandName(name) }
        s.brandingDisplayMode == "logo" ->
            if (image != null) LogoImage(image, moved, s.logoWidth, s.logoHeight) else BrandBadge(moved) { SpotlightEmblem() }
        image != null -> Row(moved, horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            LogoImage(image, Modifier, s.logoWidth, s.logoHeight)
            BrandName(name)
        }
        else -> BrandBadge(moved) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SpotlightEmblem()
                BrandName(name)
            }
        }
    }
}

@Composable
private fun LogoImage(image: ImageBitmap, modifier: Modifier, width: Double, height: Double) {
    Image(image, contentDescription = "Brand Logo", modifier.size(width.dp, height.dp), contentScale = ContentScale.Fit)
}

@Composable
private fun BrandBadge(modifier: Modifier, content: @Composable () -> Unit) {
    Centered(
        modifier
            .panel(Palette.Amber400.copy(alpha = 0.13f), Palette.Amber400.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 6.dp),
    ) { content() }
}

@Composable
private fun BrandName(name: String) {
    Label(
        name.uppercase(), 16.sp, Palette.Amber100,
        family = Fonts.Display, weight = FontWeight.Black, tracking = 0.2.em,
        brush = Brush.horizontalGradient(listOf(Palette.Amber200, Palette.Amber100, Palette.Yellow300)),
    )
}

/** BrandLogo's fallback sun emblem. */
@Composable
private fun SpotlightEmblem() {
    Canvas(Modifier.size(20.dp)) {
        val k = size.width / 24f
        drawCircle(Palette.Amber500.copy(alpha = 0.4f), 3 * k, Offset(12 * k, 12 * k))
        drawCircle(Palette.Amber400, 3 * k, Offset(12 * k, 12 * k), style = Stroke(2 * k))
        val rays = listOf(
            12f to 2f, 12f to 5f, 12f to 19f, 12f to 22f, 2f to 12f, 5f to 12f, 19f to 12f, 22f to 12f,
            4.93f to 4.93f, 7.05f to 7.05f, 16.95f to 16.95f, 19.07f to 19.07f,
            4.93f to 19.07f, 7.05f to 16.95f, 16.95f to 7.05f, 19.07f to 4.93f,
        )
        for (i in rays.indices step 2) {
            drawLine(
                Palette.Amber400,
                Offset(rays[i].first * k, rays[i].second * k),
                Offset(rays[i + 1].first * k, rays[i + 1].second * k),
                strokeWidth = 2 * k, cap = StrokeCap.Round,
            )
        }
    }
}

/** Big enough for a logo the width of the design canvas on a 4K panel; admin uploads can be far larger. */
private const val MAX_LOGO_PX = 1024

/** Decodes a cached image off the main thread; null while loading, when absent, or when it won't decode (web's onError). */
@Composable
private fun rememberDecodedImage(file: File?) = produceState<ImageBitmap?>(null, file) {
    value = null
    if (file != null) value = withContext(Dispatchers.IO) { decodeBounded(file, MAX_LOGO_PX)?.asImageBitmap() }
}
