package com.aayush.diwaliplay.app

import android.content.Context
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.app.ui.StartVideoSurface
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class StartVideoSurfaceTest {
    @get:Rule val compose = createComposeRule()

    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    /** The fixtures ship in the test APK; the player gets them as ordinary cached files, as the app does. */
    private fun fixture(asset: String, name: String = asset): File {
        val file = File(context.cacheDir, "start_video_test_$name")
        InstrumentationRegistry.getInstrumentation().context.assets.open(asset).use { input ->
            file.outputStream().use { input.copyTo(it) }
        }
        return file
    }

    @Test
    fun aValidVideoReachesItsFirstFrame() {
        val file = fixture("bg_test.mp4")
        var firstFrames = 0
        val failures = mutableListOf<File>()

        compose.setContent {
            StartVideoSurface(file, onFailed = { failures += it }, Modifier.fillMaxSize(), onFirstFrame = { firstFrames++ })
        }

        compose.waitUntil(TIMEOUT_MS) { firstFrames > 0 }
        assertThat(failures).isEmpty()
    }

    @Test
    fun aCorruptVideoReportsFailureOnce() {
        val file = fixture("bg_corrupt.mp4")
        val failures = mutableListOf<File>()
        var releases = 0

        compose.setContent {
            StartVideoSurface(file, onFailed = { failures += it }, Modifier.fillMaxSize(), onReleased = { releases++ })
        }

        compose.waitUntil(TIMEOUT_MS) { failures.isNotEmpty() }
        // Long enough for a second report, were there one.
        compose.mainClock.advanceTimeBy(SETTLE_MS)
        Thread.sleep(SETTLE_MS)
        compose.waitForIdle()
        assertThat(failures).containsExactly(file)
        assertThat(releases).isEqualTo(1)
    }

    @Test
    fun leavingCompositionReleasesThePlayer() {
        val file = fixture("bg_test.mp4")
        var firstFrames = 0
        var releases = 0
        var show by mutableStateOf(true)

        compose.setContent {
            if (show) {
                StartVideoSurface(
                    file,
                    onFailed = {},
                    Modifier.fillMaxSize(),
                    onFirstFrame = { firstFrames++ },
                    onReleased = { releases++ },
                )
            }
        }
        compose.waitUntil(TIMEOUT_MS) { firstFrames > 0 }
        assertThat(releases).isEqualTo(0)

        show = false
        compose.waitForIdle()

        assertThat(releases).isEqualTo(1)
    }

    @Test
    fun changingTheFileSwapsThePlayer() {
        val first = fixture("bg_test.mp4", "first.mp4")
        val second = fixture("bg_test.mp4", "second.mp4")
        val events = mutableListOf<String>()
        var current by mutableStateOf(first)

        compose.setContent {
            StartVideoSurface(
                current,
                onFailed = { events += "failed" },
                Modifier.fillMaxSize(),
                onFirstFrame = { events += "frame" },
                onReleased = { events += "released" },
            )
        }
        compose.waitUntil(TIMEOUT_MS) { "frame" in events }
        events.clear()

        current = second

        compose.waitUntil(TIMEOUT_MS) { "frame" in events }
        assertThat(events).containsExactly("released", "frame").inOrder()
    }

    private companion object {
        const val TIMEOUT_MS = 15_000L
        const val SETTLE_MS = 500L
    }
}
