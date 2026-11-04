package com.aayush.diwaliplay.app.ui

import android.graphics.Matrix
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Pins the live background's maths. Real-hand mirroring needs a camera to see, so this is what guards it until then. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
class MapFrameTest {
    private fun map(w: Int, h: Int, rotation: Int, x: Float, y: Float): Pair<Float, Float> {
        val m = Matrix()
        mapFrame(w, h, rotation, m)
        val p = floatArrayOf(x, y)
        m.mapPoints(p)
        return p[0] to p[1]
    }

    private fun assertMaps(actual: Pair<Float, Float>, x: Float, y: Float) {
        assertThat(actual.first).isWithin(0.01f).of(x)
        assertThat(actual.second).isWithin(0.01f).of(y)
    }

    @Test
    fun frameLeftEdgeGoesToSurfaceRightEdge() {
        assertMaps(map(1280, 720, 0, 0f, 360f), 1920f, 540f)
        assertMaps(map(1280, 720, 0, 1280f, 360f), 0f, 540f)
    }

    @Test
    fun verticalIsNotFlipped() {
        assertMaps(map(1280, 720, 0, 640f, 0f), 960f, 0f)
        assertMaps(map(1280, 720, 0, 640f, 720f), 960f, 1080f)
    }

    /** HandTracker mirrors raw landmark x to `1 - x`: the picture must put that hand under its flame. */
    @Test
    fun aHandInTheFrameLandsWhereTheTrackerPutsIt() {
        val rawX = 0.1f
        val rawY = 0.25f
        assertMaps(map(1280, 720, 0, rawX * 1280, rawY * 720), (1 - rawX) * 1920, rawY * 1080)
    }

    @Test
    fun fourByThreeFrameIsCenterCroppedVertically() {
        // 640x480 scales by 3 to fill the width: 1440 tall, 180 cut off top and bottom.
        assertMaps(map(640, 480, 0, 320f, 0f), 960f, -180f)
        assertMaps(map(640, 480, 0, 320f, 480f), 960f, 1260f)
        assertMaps(map(640, 480, 0, 0f, 240f), 1920f, 540f)
    }

    @Test
    fun rotatedFrameIsMadeUprightThenMirrored() {
        // Rotating 90 degrees clockwise sends the bitmap's top edge to the right; the mirror then sends it left.
        assertMaps(map(720, 1280, 90, 360f, 0f), 0f, 540f)
        assertMaps(map(720, 1280, 90, 360f, 1280f), 1920f, 540f)
    }
}
