package com.aayush.diwaliplay.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.audio.AudioEngine
import com.aayush.diwaliplay.audio.SoundManifest
import com.aayush.diwaliplay.audio.SoundResolver
import com.aayush.diwaliplay.audio.SoundSource
import com.aayush.diwaliplay.audio.defaultAudioSettings
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Lives in :app because the sounds are packaged in the app's assets (app/src/main/assets/sounds); the instrumentation
 * target context is the real app, so `assets.openFd` sees exactly what ships (including the noCompress rule).
 */
@RunWith(AndroidJUnit4::class)
class AudioEngineSmokeTest {
    @Test
    fun soundPoolLoadsAndPlaysBuiltInFlac() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val manifest = SoundManifest.parse(ctx.assets.open(SoundManifest.FILE_NAME).bufferedReader().readText())
        val engine = AudioEngine(ctx, SoundResolver(manifest))
        try {
            val settings = defaultAudioSettings()
            engine.apply(settings, emptyMap())

            val countdown = SoundSource.Asset("sounds/beep_classic.flac") // countdown_3 under defaults
            val mega = SoundSource.Asset("sounds/explosion_mega.flac")   // largest: 7.8 s, 807 KB FLAC
            val deadline = System.currentTimeMillis() + 30_000
            while (System.currentTimeMillis() < deadline &&
                !(engine.isLoaded(countdown) && engine.isLoaded(mega) && engine.isReady())
            ) {
                assertThat(engine.hasFailed(countdown)).isFalse()
                assertThat(engine.hasFailed(mega)).isFalse()
                Thread.sleep(50)
            }
            assertThat(engine.hasFailed(countdown)).isFalse()
            assertThat(engine.hasFailed(mega)).isFalse()
            assertThat(engine.isLoaded(countdown)).isTrue()
            assertThat(engine.isLoaded(mega)).isTrue()
            assertThat(engine.isReady()).isTrue()

            assertThat(engine.play(countdown, 1f)).isNotEqualTo(0)
            assertThat(engine.play(mega, 1f)).isNotEqualTo(0)
            assertThat(engine.playGameKey("countdown_3")).isNotEqualTo(0)
            assertThat(engine.playGameKey("MEGA_BLAST")).isNotEqualTo(0)
            Thread.sleep(500)
        } finally {
            engine.release()
        }
    }
}
