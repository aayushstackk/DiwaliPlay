package com.aayush.diwaliplay.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.parseVoucherTitle
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.model.RewardItem
import java.io.File

/** Web: `animate-voucher-zoom`'s length, and the wait before the auto-return starts. */
internal const val VOUCHER_ZOOM_MS = 450

/** The zoomed winning voucher, in the wheel's place. Image beside the details, so it fits however tall the column is left. */
@Composable
internal fun SpinVoucher(reward: RewardItem, isTrial: Boolean, localFiles: Map<String, File>, onSpinAgain: () -> Unit) {
    val zoom = remember { Animatable(0f) }
    LaunchedEffect(Unit) { zoom.animateTo(1f, tween(VOUCHER_ZOOM_MS, easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f))) }
    Column(
        Modifier
            .testTag(Tags.SPIN_VOUCHER)
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            .graphicsLayer {
                // voucherZoom: 0.6 to 1.03 and opaque at 75%, then 1.
                val t = zoom.value
                val s = if (t < 0.75f) 0.6f + (1.03f - 0.6f) * (t / 0.75f) else 1.03f - 0.03f * ((t - 0.75f) / 0.25f)
                scaleX = s
                scaleY = s
                alpha = (t / 0.75f).coerceAtMost(1f)
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Label("🎉 YOU WON A FESTIVE PRIZE! 🎉", 28.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider, brush = GoldText)
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            VoucherImage(reward, localFiles)
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Label(reward.name, 28.sp, Palette.Amber100, family = Fonts.Display, weight = FontWeight.Black)
                Spacer(Modifier.height(12.dp))
                val box = RoundedCornerShape(12.dp)
                Column(
                    Modifier.fillMaxWidth().background(Color(0xFF140803), box).border(1.dp, Palette.Amber400.copy(alpha = 0.6f), box).padding(vertical = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Label("COUPON CODE", 12.sp, Palette.Amber300.copy(alpha = 0.7f), family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWidest)
                    Spacer(Modifier.height(4.dp))
                    Label(reward.couponCode, 32.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Black, tracking = TrackingWidest)
                }
                Spacer(Modifier.height(12.dp))
                Label(
                    reward.termsAndConditions.ifEmpty { reward.description.ifEmpty { "Present this code to claim your reward." } },
                    15.sp, Palette.Amber200.copy(alpha = 0.75f),
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val pill = RoundedCornerShape(999.dp)
            Row(
                Modifier.panel(Palette.Emerald500.copy(alpha = 0.2f), Palette.Emerald400.copy(alpha = 0.4f), pill).padding(horizontal = 14.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Check, 14.dp, Palette.Emerald300)
                Label("VOUCHER UNLOCKED", 13.sp, Palette.Emerald300, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
            }
            if (isTrial) {
                Row(
                    Modifier
                        .testTag(Tags.SPIN_AGAIN)
                        .clip(pill)
                        .background(Palette.Amber500, pill)
                        .clickable(onClick = onSpinAgain)
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(Icons.RotateCw, 14.dp, Palette.Neutral950)
                    Label("SPIN AGAIN", 13.sp, Palette.Neutral950, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
                }
            }
        }
    }
}

@Composable
private fun VoucherImage(reward: RewardItem, localFiles: Map<String, File>) {
    val outer = RoundedCornerShape(24.dp)
    Box(
        Modifier
            .size(240.dp)
            .background(Brush.verticalGradient(listOf(Palette.Amber300, Palette.Yellow500, Color(0xFFB45309))), outer)
            .padding(5.dp),
    ) {
        val inner = RoundedCornerShape(20.dp)
        Box(Modifier.fillMaxSize().clip(inner).background(Color(0xFF1C1226), inner).padding(12.dp), contentAlignment = Alignment.Center) {
            val image = rememberRewardImage(reward.imageUrl.ifEmpty { null }, localFiles)
            if (image != null) {
                Image(image, reward.name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            } else {
                val title = parseVoucherTitle(reward.name)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Gift, 80.dp, Palette.Amber400, Modifier.pulsing())
                    Spacer(Modifier.height(6.dp))
                    Label(title.line1, 24.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Black)
                    if (title.line2.isNotEmpty()) Label(title.line2, 16.sp, Palette.Amber300.copy(alpha = 0.8f), weight = FontWeight.Bold, tracking = TrackingWider)
                }
            }
        }
    }
}
