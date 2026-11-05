package com.aayush.diwaliplay.tracking.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DetectionSizeTest {
    @Test fun halves720pForDetection() {
        assertThat(detectionSize(1280, 720)).isEqualTo(640 to 360)
    }

    @Test fun neverEnlargesOrShrinksTheSmallFallbackFeed() {
        assertThat(detectionSize(640, 480)).isEqualTo(640 to 480)
        assertThat(detectionSize(320, 240)).isEqualTo(320 to 240)
    }

    @Test fun keepsAspectForLargerFeeds() {
        assertThat(detectionSize(1920, 1080)).isEqualTo(640 to 360)
    }
}
