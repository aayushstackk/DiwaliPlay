package com.aayush.diwaliplay.app

import android.media.AudioManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.audio.AudioEngine
import com.aayush.diwaliplay.audio.SoundManifest
import com.aayush.diwaliplay.audio.SoundResolver
import com.aayush.diwaliplay.audio.defaultAudioSettings
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EngineGameAudioTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val manager = ctx.getSystemService(AudioManager::class.java)

    @Test
    fun theEngineIsOnlyBuiltByTheFirstApply() {
        var builds = 0
        val engine = lazy {
            builds++
            val manifest = SoundManifest.parse(ctx.assets.open(SoundManifest.FILE_NAME).bufferedReader().use { it.readText() })
            AudioEngine(ctx, SoundResolver(manifest))
        }
        val audio = EngineGameAudio(engine, manager)

        // What the main thread can call before the effects thread's first apply: none of it may read the manifest.
        assertThat(audio.isReady()).isFalse()
        audio.stopBgm()
        assertThat(builds).isEqualTo(0)

        audio.apply(defaultAudioSettings(), emptyMap(), emptyList())
        assertThat(builds).isEqualTo(1)
        val deadline = System.currentTimeMillis() + 30_000
        while (!audio.isReady() && System.currentTimeMillis() < deadline) Thread.sleep(50)
        assertThat(audio.isReady()).isTrue()
        audio.release()
    }

    @Test
    fun releaseWithoutAnEngineBuildsNone() {
        var builds = 0
        val audio = EngineGameAudio(lazy { builds++; error("not to be built") }, manager)
        audio.release()
        assertThat(builds).isEqualTo(0)
    }
}
