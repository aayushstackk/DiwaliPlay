package com.aayush.diwaliplay.app

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.app.ui.decodeBounded
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AssetImagesInstrumentedTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun file(bytes: ByteArray) = tmp.newFile().also { it.writeBytes(bytes) } // no extension, as a relative asset URL gives

    private fun Bitmap.alpha(x: Int, y: Int) = Color.alpha(getPixel(x, y))

    /** What the server really sends for a reward: a gradient gift box 160 across, with text and an unsupported filter. */
    @Test fun rewardSvgFromTheServerFixtureDraws() {
        val svg = InstrumentationRegistry.getInstrumentation().context.assets
            .open("reward_from_server_fixture.svg").use { it.readBytes() }
        val bitmap = decodeBounded(file(svg), 512)!!
        assertThat(bitmap.width).isEqualTo(512)
        assertThat(bitmap.height).isEqualTo(512)
        // In the box, well past where a drawing stuck at 160 px would end, and the corner is outside it.
        val inBox = bitmap.getPixel(512 * 100 / 160, 512 * 120 / 160)
        assertThat(Color.alpha(inBox)).isEqualTo(255)
        assertThat(bitmap.alpha(2, 2)).isEqualTo(0)
    }

    @Test fun smallSvgIsScaledToFillAndKeepsItsShape() {
        val svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="20" height="10"><rect width="20" height="10" fill="#FF0000"/></svg>"""
        val bitmap = decodeBounded(file(svg.toByteArray()), 400)!!
        assertThat(bitmap.width).isEqualTo(400)
        assertThat(bitmap.height).isEqualTo(200)
        assertThat(bitmap.getPixel(390, 190)).isEqualTo(Color.RED)
    }

    @Test fun tallSvgStaysWithinTheBound() {
        val svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 40"><rect width="10" height="40" fill="#00FF00"/></svg>"""
        val bitmap = decodeBounded(file(svg.toByteArray()), 400)!!
        assertThat(bitmap.height).isEqualTo(400)
        assertThat(bitmap.width).isEqualTo(100)
    }

    @Test fun hugeClaimedSizeIsStillBounded() {
        val svg = """<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"><rect width="20000" height="20000" fill="#0000FF"/></svg>"""
        val bitmap = decodeBounded(file(svg.toByteArray()), 512)!!
        assertThat(bitmap.width).isEqualTo(512)
        assertThat(bitmap.getPixel(500, 500)).isEqualTo(Color.BLUE)
    }

    @Test fun rasterStillDecodesAndIsScaledDown() {
        val source = Bitmap.createBitmap(1000, 500, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
        val png = ByteArrayOutputStream().use { source.compress(Bitmap.CompressFormat.PNG, 100, it); it.toByteArray() }
        val bitmap = decodeBounded(file(png), 256)!!
        assertThat(bitmap.width).isEqualTo(500)
    }

    @Test fun anythingElseIsNull() {
        assertThat(decodeBounded(file("<html>portal login</html>".toByteArray()), 256)).isNull()
        assertThat(decodeBounded(File(tmp.root, "missing"), 256)).isNull()
    }
}
