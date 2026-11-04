package com.aayush.diwaliplay.tracking.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CameraConfigTest {

    @Test
    fun prefers1280x720ThenFallback640x480() {
        val sizes = listOf(1920 to 1080, 640 to 480, 1280 to 720, 320 to 240)
        assertThat(orderResolutions(sizes).take(2)).containsExactly(1280 to 720, 640 to 480).inOrder()
        assertThat(orderResolutions(sizes)).containsExactlyElementsIn(sizes)
    }

    @Test
    fun fallsBackTo640x480WhenNo720p() {
        val sizes = listOf(1920 to 1080, 320 to 240, 640 to 480)
        assertThat(orderResolutions(sizes).first()).isEqualTo(640 to 480)
    }

    @Test
    fun keepsCameraOrderWhenNeitherPreferredSizeExists() {
        val sizes = listOf(1920 to 1080, 320 to 240)
        assertThat(orderResolutions(sizes)).containsExactlyElementsIn(sizes).inOrder()
    }

    @Test
    fun fpsRangePrefersFixed30() {
        assertThat(chooseFpsRange(listOf(15 to 15, 15 to 30, 30 to 30, 7 to 30))).isEqualTo(30 to 30)
    }

    @Test
    fun fpsRangeFallsBackToHighestFloorReaching30() {
        // The WAF reports 15-30 fps.
        assertThat(chooseFpsRange(listOf(15 to 15, 7 to 30, 15 to 30))).isEqualTo(15 to 30)
    }

    @Test
    fun fpsRangeWithout30UsesClosestBelowOrNull() {
        assertThat(chooseFpsRange(listOf(10 to 15, 15 to 24))).isEqualTo(15 to 24)
        assertThat(chooseFpsRange(emptyList())).isNull()
    }
}
