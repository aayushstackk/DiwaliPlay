package com.aayush.diwaliplay.tracking.camera

import com.aayush.diwaliplay.model.LandmarkPoint
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FrameMirroringTest {

    @Test
    fun cropMaps4by3To16by9Centre() {
        // 640x480 centre-cropped to 16:9 keeps rows 60..420 (640 x 360).
        val out = cropToSixteenNine(
            listOf(
                LandmarkPoint(0.5, 0.5, 0.1),
                LandmarkPoint(0.25, 60.0 / 480, 0.0),
                LandmarkPoint(0.75, 420.0 / 480, 0.0),
            ),
            srcW = 640,
            srcH = 480,
        )
        assertThat(out[0].x).isWithin(1e-9).of(0.5)
        assertThat(out[0].y).isWithin(1e-9).of(0.5)
        assertThat(out[0].z).isWithin(1e-9).of(0.1)
        assertThat(out[1].x).isWithin(1e-9).of(0.25)
        assertThat(out[1].y).isWithin(1e-9).of(0.0)
        assertThat(out[2].x).isWithin(1e-9).of(0.75)
        assertThat(out[2].y).isWithin(1e-9).of(1.0)
    }

    @Test
    fun cropKeepsInsidePointsInRange() {
        val inside = (0..20).map { i ->
            LandmarkPoint(i / 20.0, (60.0 + i * 18.0) / 480, 0.0) // y from row 60 to row 420
        }
        val out = cropToSixteenNine(inside, srcW = 640, srcH = 480)
        out.forEach {
            assertThat(it.x).isIn(com.google.common.collect.Range.closed(0.0, 1.0))
            assertThat(it.y).isIn(com.google.common.collect.Range.closed(-1e-9, 1.0 + 1e-9))
        }
    }

    @Test
    fun cropLeavesSixteenNineFramesUnchanged() {
        val pts = listOf(LandmarkPoint(0.1, 0.2, 0.3), LandmarkPoint(0.9, 0.8, -0.1))
        assertThat(cropToSixteenNine(pts, srcW = 1280, srcH = 720)).isEqualTo(pts)
    }

    @Test
    fun cropTrimsSidesOfWiderFrames() {
        // 2560x1080 (~21:9) keeps columns 320..2240 (1920 x 1080).
        val out = cropToSixteenNine(listOf(LandmarkPoint(320.0 / 2560, 0.5, 0.0)), srcW = 2560, srcH = 1080)
        assertThat(out[0].x).isWithin(1e-9).of(0.0)
        assertThat(out[0].y).isWithin(1e-9).of(0.5)
    }
}
