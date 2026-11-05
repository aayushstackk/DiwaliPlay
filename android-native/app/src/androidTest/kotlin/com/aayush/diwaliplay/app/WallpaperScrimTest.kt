package com.aayush.diwaliplay.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aayush.diwaliplay.app.ui.drawWallpaper
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WallpaperScrimTest {
    private val white = Bitmap.createBitmap(16, 9, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }

    private fun render(scrim: Boolean?): Bitmap {
        val target = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(target)
        if (scrim == null) drawWallpaper(canvas, white, 100.0) else drawWallpaper(canvas, white, 100.0, scrim)
        return target
    }

    /** At dim 0 the start background is the image itself, as on the web and in the admin preview. */
    @Test fun noScrimLeavesTheImageUntouched() {
        val out = render(scrim = false)
        for (y in listOf(1, 540, 1078)) assertThat(out.getPixel(960, y)).isEqualTo(Color.WHITE)
    }

    /** The in-game wallpaper keeps its gradient: 40% at the top, none in the middle, 60% at the bottom. */
    @Test fun theDefaultKeepsTheInGameGradient() {
        val out = render(scrim = null)
        assertThat(Color.red(out.getPixel(960, 1))).isIn(150..158)
        assertThat(Color.red(out.getPixel(960, 540))).isAtLeast(253)
        assertThat(Color.red(out.getPixel(960, 1078))).isIn(106..114)
    }
}
