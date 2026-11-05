package com.aayush.diwaliplay.app.ui

import android.util.Log
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.CardSaver
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.game.flow.RoundCard
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val MAX_PHOTO_PX = 1280

/** The photo's frame on the game-over screen: the camera's 16:9. */
private val PHOTO_WIDTH = 640.dp
private val PHOTO_HEIGHT = 360.dp

@Composable
fun rememberCardSaver(): CardSaver {
    val context = LocalContext.current
    return remember(context) { CardSaver(context) }
}

/** Renders off the main thread, saves on IO, and frees the bitmap. True if the card was saved. */
suspend fun saveCard(saver: CardSaver, card: RoundCard, brandName: String): Boolean = withContext(Dispatchers.Default) {
    try {
        val bitmap = renderCard(card.toCardData(brandName))
        try {
            withContext(Dispatchers.IO) { saver.save(bitmap, card.playerName, card.score.score) } != null
        } finally {
            bitmap.recycle()
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: RuntimeException) {
        // In a screen's coroutine this would take the kiosk down; the player gets "Couldn't save" instead.
        Log.e("GreetingCard", "could not render the card", e)
        false
    }
}

@Composable
internal fun PhotoFrame(card: RoundCard) {
    val photo by produceState<ImageBitmap?>(null, card.photoJpeg) {
        val jpeg = card.photoJpeg
        value = jpeg?.let { withContext(Dispatchers.Default) { decodeBoundedJpeg(it, MAX_PHOTO_PX)?.asImageBitmap() } }
    }
    val outer = RoundedCornerShape(16.dp)
    val inner = RoundedCornerShape(14.dp)
    Box(
        Modifier
            .width(PHOTO_WIDTH)
            .height(PHOTO_HEIGHT)
            .background(Brush.verticalGradient(listOf(Palette.Amber400, Palette.Amber500.copy(alpha = 0.6f), Color(0xFFCA8A04))), outer)
            .padding(4.dp),
    ) {
        Box(
            Modifier.fillMaxSize().clip(inner).background(Palette.Neutral900, inner).border(1.dp, Palette.Amber400.copy(alpha = 0.5f), inner),
            contentAlignment = Alignment.Center,
        ) {
            val image = photo
            if (image != null) {
                Image(image, card.playerName, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else if (card.photoJpeg == null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(48.dp).panel(Palette.Amber500.copy(alpha = 0.2f), Palette.Amber400.copy(alpha = 0.4f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Camera, 24.dp, Palette.Amber400)
                    }
                    Spacer(Modifier.height(8.dp))
                    Label(card.playerName.uppercase(Locale.ROOT), 12.sp, Palette.Amber300, family = Fonts.Mono, weight = FontWeight.Bold, tracking = TrackingWider)
                }
            }
            CornerAccents(8.dp, 14.dp, Palette.Amber300.copy(alpha = 0.8f))
        }
    }
}
