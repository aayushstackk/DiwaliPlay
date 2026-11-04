package com.aayush.diwaliplay.app.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import com.aayush.diwaliplay.game.PlayerAchievement
import com.aayush.diwaliplay.model.GameScoreState
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Real pixels: NATIVE graphics runs Android's own Skia here, which the default shadows don't. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], manifest = Config.NONE)
class CardRendererTest {
    private fun data(photo: ByteArray? = null, target: Int? = null, achieved: Boolean? = null) = CardData(
        playerName = "Asha",
        brandName = "ItsSpotlight",
        score = GameScoreState(score = 1234, bombsBurst = 12, combosAwarded = 3, penaltyDeductions = 50, comboBonusPoints = 75),
        achievement = PlayerAchievement("*", "Rocket Ace", "Sky Blasting Reflector"),
        wish = FormattedPersonalizedWish("HAPPY DIWALI, Asha!", listOf("A line.", "Another line."), "Warm wishes,\nItsSpotlight"),
        photoJpeg = photo,
        targetScore = target,
        targetAchieved = achieved,
    )

    private fun solidJpeg(color: Int): ByteArray {
        val b = Bitmap.createBitmap(64, 36, Bitmap.Config.ARGB_8888)
        Canvas(b).drawColor(color)
        return ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, 92, it) }.toByteArray()
    }

    private fun isClose(actual: Int, expected: Int, tolerance: Int = 12): Boolean =
        kotlin.math.abs(Color.red(actual) - Color.red(expected)) <= tolerance &&
            kotlin.math.abs(Color.green(actual) - Color.green(expected)) <= tolerance &&
            kotlin.math.abs(Color.blue(actual) - Color.blue(expected)) <= tolerance

    @Test
    fun cardIs900WideAndDrawsPhotoRect() {
        val card = renderCard(data(photo = solidJpeg(Color.RED)))
        assertThat(card.width).isEqualTo(900)
        assertThat(card.height).isEqualTo(1150)
        // Corners of GameOverModal's rect: photo at 135,150, size 630x354.
        for ((x, y) in listOf(136 to 151, 763 to 151, 136 to 502, 763 to 502, 450 to 327)) {
            assertThat(isClose(card.getPixel(x, y), Color.RED)).isTrue()
        }
        // Just outside it: the frame's fill, 4 px wide, then the card behind.
        assertThat(isClose(card.getPixel(133, 327), Color.RED)).isFalse()
        assertThat(isClose(card.getPixel(767, 327), Color.RED)).isFalse()
        assertThat(isClose(card.getPixel(450, 148), Color.RED)).isFalse()
        assertThat(isClose(card.getPixel(450, 507), Color.RED)).isFalse()
    }

    @Test
    fun cardWithoutPhotoDrawsHappyDiwaliPlaceholder() {
        val card = renderCard(data(photo = null))
        val placeholder = 0xFF261C3D.toInt()
        assertThat(isClose(card.getPixel(140, 155), placeholder, 2)).isTrue()
        assertThat(isClose(card.getPixel(760, 500), placeholder, 2)).isTrue()
        // "HAPPY DIWALI" in #FCD34D, baseline at photoY + photoHeight / 2.
        assertThat(countNear(card, 450 - 150..450 + 150, 327 - 22..327 + 4, 0xFFFCD34D.toInt())).isGreaterThan(50)
    }

    @Test
    fun undecodablePhotoFallsBackToThePlaceholder() {
        val card = renderCard(data(photo = byteArrayOf(1, 2, 3)))
        assertThat(isClose(card.getPixel(140, 155), 0xFF261C3D.toInt(), 2)).isTrue()
    }

    @Test
    fun aTargetAddsAFifthStatBox() {
        val four = renderCard(data())
        val five = renderCard(data(target = 1000, achieved = true))
        // Box fill #140D26: the four-box row starts at x=(900-680)/2=110, the five-box row at (900-680)/2 too, but
        // the gap differs: at x=280 the four-box layout is in its first gap (265..285), the five-box one in box 2.
        val fill = 0xFF140D26.toInt()
        assertThat(isClose(four.getPixel(275, 895), fill, 2)).isFalse()
        assertThat(isClose(five.getPixel(275, 895), fill, 2)).isTrue()
    }

    @Test
    fun fileNameMatchesWebPattern() {
        assertThat(cardFileName("Asha", 1234)).isEqualTo("Diwali_Fun_Play_Asha_1234.jpg")
        assertThat(cardFileName("Asha Rao", 0)).isEqualTo("Diwali_Fun_Play_Asha Rao_0.jpg")
    }

    @Test
    fun fileNameCantEscapeTheFolder() {
        assertThat(cardFileName("a/b\\c", 5)).isEqualTo("Diwali_Fun_Play_a_b_c_5.jpg")
    }

    private fun countNear(b: Bitmap, xs: IntRange, ys: IntRange, color: Int): Int {
        var n = 0
        for (y in ys) for (x in xs) if (isClose(b.getPixel(x, y), color, 40)) n++
        return n
    }
}
