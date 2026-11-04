package com.aayush.diwaliplay.app.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-200, the web's gold headings. */
val GoldText = Brush.horizontalGradient(listOf(Palette.Amber100, Palette.Amber300, Palette.Yellow200))

/** A reward's image needs no more than this on any of these screens. */
private const val MAX_REWARD_IMAGE_PX = 512

/** The small L-shaped gold brackets in each corner of the web's panels. */
@Composable
fun BoxScope.CornerAccents(inset: Dp, length: Dp, color: Color, width: Dp = 2.dp) {
    Canvas(Modifier.matchParentSize().padding(inset)) {
        val l = length.toPx()
        val w = width.toPx()
        val r = size.width
        val b = size.height
        drawLine(color, Offset.Zero, Offset(l, 0f), w)
        drawLine(color, Offset.Zero, Offset(0f, l), w)
        drawLine(color, Offset(r, 0f), Offset(r - l, 0f), w)
        drawLine(color, Offset(r, 0f), Offset(r, l), w)
        drawLine(color, Offset(0f, b), Offset(l, b), w)
        drawLine(color, Offset(0f, b), Offset(0f, b - l), w)
        drawLine(color, Offset(r, b), Offset(r - l, b), w)
        drawLine(color, Offset(r, b), Offset(r, b - l), w)
    }
}

/**
 * GameOverModal's shell: the 1360-wide panel with its "GAME OVER" header, status pill and × button. On the web the
 * card, wheel and feedback bar share this one screen; here each is a step of its own in the same shell.
 */
@Composable
fun EndOfRoundFrame(
    screenTag: String,
    isTrial: Boolean,
    autoReturnSeconds: Int?,
    onClose: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(
        Modifier.fillMaxSize().testTag(screenTag).background(Palette.Neutral950.copy(alpha = 0.95f)),
        contentAlignment = Alignment.Center,
    ) {
        val shape = RoundedCornerShape(24.dp)
        Box(Modifier.width(1360.dp).height(1036.dp).panel(Palette.CardPanel, Palette.Amber500.copy(alpha = 0.5f), shape)) {
            CornerAccents(12.dp, 20.dp, Palette.Amber400.copy(alpha = 0.8f))
            Column(Modifier.fillMaxSize().padding(20.dp)) {
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Sparkles, 20.dp, Palette.Amber400)
                    Spacer(Modifier.width(8.dp))
                    Label("GAME OVER", 30.sp, Palette.Amber100, family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider)
                    Spacer(Modifier.width(8.dp))
                    Label("• Diwali Motion Spectacular", 12.sp, Palette.Amber200.copy(alpha = 0.6f), family = Fonts.Mono)
                    Spacer(Modifier.weight(1f))
                    StatusPill(isTrial, autoReturnSeconds)
                    Spacer(Modifier.width(12.dp))
                    Box(
                        Modifier
                            .testTag(Tags.CLOSE)
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Palette.Neutral900.copy(alpha = 0.9f), CircleShape)
                            .border(1.dp, Palette.Amber500.copy(alpha = 0.5f), CircleShape)
                            .clickable(onClick = onClose),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Close, 20.dp, Palette.Amber300, strokeWidth = 2.5f)
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.Amber500.copy(alpha = 0.2f)))
                Spacer(Modifier.height(10.dp))
                content()
            }
        }
    }
}

/** Master session badge, the auto-return count, or the pointer to the wheel. */
@Composable
private fun StatusPill(isTrial: Boolean, seconds: Int?) {
    val shape = RoundedCornerShape(999.dp)
    when {
        isTrial -> Row(
            Modifier.panel(Palette.Purple500.copy(alpha = 0.2f), Palette.Purple400.copy(alpha = 0.5f), shape).padding(horizontal = 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Sparkles, 14.dp, Palette.Purple400)
            Label("Master Testing Session", 12.sp, Palette.Purple200, family = Fonts.Mono, weight = FontWeight.SemiBold)
        }
        seconds != null -> Row(
            Modifier.testTag(Tags.RETURNING).panel(Palette.Amber500.copy(alpha = 0.2f), Palette.Amber400.copy(alpha = 0.5f), shape).padding(horizontal = 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Timer, 14.dp, Palette.Amber400, Modifier.pulsing())
            Label("Returning in ${seconds}s", 12.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.SemiBold)
        }
        else -> Row(
            Modifier.panel(Palette.Amber500.copy(alpha = 0.1f), Palette.Amber500.copy(alpha = 0.3f), shape).padding(horizontal = 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Sparkles, 14.dp, Palette.Amber400)
            Label("Spin & Win", 12.sp, Palette.Amber300.copy(alpha = 0.8f), family = Fonts.Mono, weight = FontWeight.Medium)
        }
    }
}

/** The big gold button (GameOverModal's PLAY AGAIN). */
@Composable
fun GoldButton(text: String, tag: String, icon: LineIcon?, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .testTag(tag)
            .height(52.dp)
            .clip(shape)
            .background(Brush.horizontalGradient(listOf(Palette.Amber500, Palette.Amber400, Palette.Yellow500)), shape)
            .border(1.dp, Palette.Amber300.copy(alpha = 0.4f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        if (icon != null) Icon(icon, 20.dp, Palette.Neutral950, strokeWidth = 2.5f)
        Label(text, 16.sp, Palette.Neutral950, weight = FontWeight.Black, tracking = TrackingWidest)
    }
}

/** A cached reward image, decoded off the main thread at a bounded size. Null until then, or if there's no file. */
@Composable
fun rememberRewardImage(imageUrl: String?, localFiles: Map<String, File>): ImageBitmap? {
    val file = imageUrl?.let { localFiles[it] }
    val image by produceState<ImageBitmap?>(null, file) {
        value = file?.let { f -> withContext(Dispatchers.IO) { decodeBounded(f, MAX_REWARD_IMAGE_PX)?.asRewardImage() } }
    }
    return image
}

private fun Bitmap.asRewardImage(): ImageBitmap = asImageBitmap()

/** A won voucher's name and code in one row: GameOverModal's "SCORE PRIZE UNLOCKED!" strip. */
@Composable
fun VoucherStrip(
    heading: String,
    name: String,
    code: String,
    imageUrl: String?,
    localFiles: Map<String, File>,
    tag: String,
    modifier: Modifier = Modifier,
    trailing: @Composable () -> Unit = {},
) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .testTag(tag)
            .fillMaxWidth()
            .background(Brush.horizontalGradient(listOf(Palette.Amber950.copy(alpha = 0.8f), Color(0xFF221308), Color(0xCC422006))), shape)
            .border(1.dp, Palette.Amber400.copy(alpha = 0.8f), shape)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val imageShape = RoundedCornerShape(8.dp)
        Box(
            Modifier.size(44.dp).background(Color.White.copy(alpha = 0.95f), imageShape).border(1.dp, Palette.Amber400.copy(alpha = 0.6f), imageShape).padding(4.dp),
            contentAlignment = Alignment.Center,
        ) {
            val image = rememberRewardImage(imageUrl, localFiles)
            if (image != null) {
                Image(image, name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            } else {
                Icon(Icons.Gift, 22.dp, Palette.Orange600)
            }
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Trophy, 12.dp, Palette.Amber400)
                Label(heading, 11.sp, Palette.Amber300, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
            }
            Label(name, 15.sp, Palette.Amber100, weight = FontWeight.Bold)
        }
        Column(
            Modifier.background(Color(0xFF140803), imageShape).border(1.dp, Palette.Amber400.copy(alpha = 0.5f), imageShape).padding(horizontal = 10.dp, vertical = 4.dp),
            horizontalAlignment = Alignment.End,
        ) {
            Label("CODE", 9.sp, Palette.Amber300.copy(alpha = 0.7f), family = Fonts.Mono)
            Label(code, 15.sp, Palette.Amber200, family = Fonts.Mono, weight = FontWeight.Black, tracking = TrackingWider)
        }
        trailing()
    }
}

/** Tailwind's `animate-spin`, in the layer block so it doesn't recompose. */
@Composable
fun Modifier.spinning(): Modifier {
    val angle by rememberInfiniteTransition(label = "spin").animateFloat(
        0f, 360f, infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Restart), label = "angle",
    )
    return graphicsLayer { rotationZ = angle }
}

/** Tailwind's `animate-ping`, in the layer block. */
@Composable
fun Modifier.pinging(): Modifier {
    val t by rememberInfiniteTransition(label = "ping").animateFloat(
        0f, 1f, infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Restart), label = "t",
    )
    return graphicsLayer {
        val s = 1f + t
        scaleX = s
        scaleY = s
        alpha = 1f - t
    }
}
