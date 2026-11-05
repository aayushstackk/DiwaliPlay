package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.model.SystemSettings
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class StartBackgroundTest {
    private val url = "http://x/bg"
    private val file = File("/tmp/bg")
    private fun settings(u: String? = url, type: String = "image", dim: Double = 40.0) =
        SystemSettings(startBackgroundUrl = u, startBackgroundType = type, startBackgroundDim = dim)

    @Test fun nullOrBlankUrlIsBuiltIn() {
        assertThat(chooseStartBackground(settings(null), mapOf(url to file), null)).isEqualTo(StartBackgroundChoice.BuiltIn)
        assertThat(chooseStartBackground(settings(" "), mapOf(url to file), null)).isEqualTo(StartBackgroundChoice.BuiltIn)
    }

    @Test fun uncachedUrlIsBuiltIn() {
        assertThat(chooseStartBackground(settings(), emptyMap(), null)).isEqualTo(StartBackgroundChoice.BuiltIn)
    }

    @Test fun cachedVideoIsVideo() {
        assertThat(chooseStartBackground(settings(type = "video"), mapOf(url to file), null))
            .isEqualTo(StartBackgroundChoice.Video(file, 40.0))
    }

    @Test fun otherTypesAreImage() {
        assertThat(chooseStartBackground(settings(type = "gif"), mapOf(url to file), null))
            .isEqualTo(StartBackgroundChoice.Image(file, 40.0))
    }

    @Test fun failedVideoIsBuiltIn() {
        assertThat(chooseStartBackground(settings(type = "video"), mapOf(url to file), file)).isEqualTo(StartBackgroundChoice.BuiltIn)
    }

    @Test fun differentFailedVideoStillPlays() {
        assertThat(chooseStartBackground(settings(type = "video"), mapOf(url to file), File("/tmp/other")))
            .isEqualTo(StartBackgroundChoice.Video(file, 40.0))
    }

    @Test fun dimAlpha() {
        assertThat(startDimAlpha(50.0)).isEqualTo(127)
        assertThat(startDimAlpha(95.0)).isEqualTo(204)
        assertThat(startDimAlpha(-5.0)).isEqualTo(0)
    }
}
