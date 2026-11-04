package com.aayush.diwaliplay.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.GameAudioSettings
import com.aayush.diwaliplay.model.SfxKey
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Plays resolved sounds: effects through one [SoundPool] (max 16 streams, USAGE_GAME), background music through
 * Media3 [ExoPlayer]. All selection and gain logic lives in the pure [SoundResolver]; this class only does I/O.
 *
 * ## Threads
 * - [apply], [play] and the `play*` helpers are non-blocking and may be called from any thread (the game's
 *   effects executor, the render thread, the UI thread). [SoundPool] is thread-safe; the settings snapshot is
 *   `@Volatile` and replaced atomically.
 * - ExoPlayer may only be touched from its application looper. It is created with, and every access is posted to,
 *   the **main looper**; [startBgm], [stopBgm] and [release] are therefore callable from any thread (they run inline
 *   when already on main, otherwise they are posted, so their effect is asynchronous).
 *
 * ## Play before the sample is loaded
 * [apply] starts decoding every resolved effect on SoundPool's own thread. A [play] that arrives before its sample
 * finished loading is **dropped** (logged at debug level), never queued: a late, stale crack/countdown tick is worse
 * than a missing one. A source that was not preloaded (e.g. a custom file cached after [apply]) is started loading
 * by that first [play] call, so the next one plays.
 *
 * Failed loads are remembered and not retried by [play]; they are retried on the next [apply]. [isReady] turns true
 * once the [SoundResolver.criticalSources] (countdown, shutter, combo, game over) are loaded (or definitively failed),
 * so the app can gate the round start on it. The engine does not watch `BrandingState.localFiles`: **the caller must
 * call [apply] again whenever the cached custom files (or the audio settings) change.**
 *
 * Loops: ExoPlayer `REPEAT_MODE_ONE` over the baked FLAC; the loops end in digital silence (Task 15), so any
 * re-prepare gap on the seam falls into that silence.
 */
class AudioEngine(context: Context, private val resolver: SoundResolver) {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())

    private val soundPool: SoundPool = SoundPool.Builder()
        .setMaxStreams(MAX_STREAMS)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()

    /** Guards every mutation of [sampleIds] / [failed] together with the matching SoundPool load/unload. */
    private val loadLock = Any()
    private val sampleIds = ConcurrentHashMap<SoundSource, Int>()
    private val loadedSamples: MutableSet<Int> = ConcurrentHashMap.newKeySet()
    private val failed: MutableSet<SoundSource> = ConcurrentHashMap.newKeySet()
    private val loggedDrops: MutableSet<SoundSource> = ConcurrentHashMap.newKeySet()

    /** Immutable settings snapshot, swapped atomically by [apply]. */
    private class Snapshot(
        val settings: GameAudioSettings,
        val files: Map<String, File>,
        val bombs: List<BombConfig>,
        val critical: Set<SoundSource>,
    )

    @Volatile private var snapshot = Snapshot(defaultAudioSettings(), emptyMap(), emptyList(), emptySet())
    @Volatile private var released = false

    // Main-looper-only state.
    private var player: ExoPlayer? = null
    private var bgmWanted = false
    private var bgmSource: SoundSource = SoundSource.None

    init {
        soundPool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0) {
                loadedSamples += sampleId
            } else {
                synchronized(loadLock) {
                    Log.w(TAG, "sample $sampleId failed to load (status $status)")
                    sampleIds.entries.filter { it.value == sampleId }.forEach {
                        failed += it.key
                        sampleIds.remove(it.key)
                    }
                    soundPool.unload(sampleId)
                }
            }
        }
    }

    /**
     * Adopts new settings / cached custom files / the round's bomb configs, preloads every effect they can resolve to
     * and unloads samples no longer referenced. A running BGM follows the change (volume, or a new track).
     */
    fun apply(settings: GameAudioSettings, files: Map<String, File>, bombs: List<BombConfig> = emptyList()) {
        if (released) return
        val wanted = resolver.preloadSources(settings, files, bombs)
        snapshot = Snapshot(settings, files, bombs, resolver.criticalSources(settings, files))
        synchronized(loadLock) {
            failed.clear() // a new apply retries everything that failed before
            loggedDrops.clear()
            wanted.forEach { loadLocked(it) } // criticality order
            sampleIds.keys.filter { it !in wanted }.forEach { stale ->
                sampleIds.remove(stale)?.let { loadedSamples.remove(it); soundPool.unload(it) }
            }
        }
        onMain { if (bgmWanted) refreshBgm() }
    }

    /** True once every critical effect (countdown, shutter, combo, game over) is loaded or has definitively failed. */
    fun isReady(): Boolean = snapshot.critical.all { isLoaded(it) || it in failed }

    fun isLoaded(source: SoundSource): Boolean = sampleIds[source]?.let { it in loadedSamples } == true

    fun hasFailed(source: SoundSource): Boolean = source in failed

    /**
     * Non-blocking; see the class doc for the not-yet-loaded rule. [rate] is SoundPool's 0.5..2.0 playback rate,
     * [priority] its stream priority. Returns the SoundPool stream id, or 0 when nothing was started.
     */
    fun play(source: SoundSource, volume: Float, pan: Float = 0f, rate: Float = 1f, priority: Int = ResolvedSound.PRIORITY_NORMAL): Int {
        if (released || source == SoundSource.None || volume <= 0f || source in failed) return 0
        val id = sampleIds[source]
        if (id == null) {
            synchronized(loadLock) { loadLocked(source) } // lazily, once; failures are remembered until the next apply
            logDrop(source, "not loaded yet")
            return 0
        }
        if (id !in loadedSamples) {
            logDrop(source, "still loading")
            return 0
        }
        val p = pan.coerceIn(-1f, 1f)
        val left = volume * (1f - maxOf(0f, p))
        val right = volume * (1f + minOf(0f, p))
        return soundPool.play(id, left, right, priority, 0, rate.coerceIn(0.5f, 2f))
    }

    fun play(sound: ResolvedSound, pan: Float = 0f): Int = play(sound.source, sound.volume, pan, sound.rate, sound.priority)

    /** Plays a key emitted by core:game's `GameEffects.playSound`. */
    fun playGameKey(key: String): Int {
        val s = snapshot
        return play(resolver.forGameKey(key, s.settings, s.files, s.bombs))
    }

    fun playSfx(key: SfxKey, pan: Float = 0f): Int {
        val s = snapshot
        val (source, volume) = resolver.sfx(key, s.settings, s.files)
        val priority = if (key == SfxKey.GAME_OVER) ResolvedSound.PRIORITY_HIGH else ResolvedSound.PRIORITY_NORMAL
        return play(source, volume, pan, 1f, priority)
    }

    /** Cracker sound with the web's random pitch/volume jitter. [pan] -1..1. Low priority (MEGA_BLAST high). */
    fun playCracker(type: String, pan: Float = 0f): Int = play(resolver.cracker(type, snapshot.settings), pan)

    fun playSpinTick(liveGain: Float = 0.5f): Int {
        val (source, volume) = resolver.spinTick(liveGain)
        return play(source, volume, 0f, 1f, ResolvedSound.PRIORITY_LOW)
    }

    fun startBgm() = onMain {
        if (released) return@onMain
        bgmWanted = true
        startBgmNow()
    }

    fun stopBgm() = onMain {
        bgmWanted = false
        stopBgmNow()
    }

    /** Frees the SoundPool and the player. The engine is unusable afterwards. */
    fun release() {
        released = true
        synchronized(loadLock) {
            soundPool.release()
            sampleIds.clear()
            loadedSamples.clear()
        }
        onMain {
            bgmWanted = false
            player?.release()
            player = null
        }
    }

    // ---- internals -----------------------------------------------------------------------------------------

    /** Must hold [loadLock]. Starts one load per source; a failure is recorded in [failed]. */
    private fun loadLocked(source: SoundSource) {
        if (released || source in failed || sampleIds.containsKey(source)) return
        val id = try {
            when (source) {
                is SoundSource.Asset -> appContext.assets.openFd(source.path).use { soundPool.load(it, 1) }
                is SoundSource.File -> soundPool.load(source.file.absolutePath, 1)
                SoundSource.None -> return
            }
        } catch (e: Exception) {
            Log.w(TAG, "cannot load $source", e)
            failed += source
            return
        }
        if (id != 0) sampleIds[source] = id else failed += source
    }

    private fun logDrop(source: SoundSource, why: String) {
        if (loggedDrops.add(source)) Log.d(TAG, "dropped $source: $why")
    }

    private fun refreshBgm() {
        val choice = snapshot.let { resolver.bgm(it.settings, it.files) }
        if (choice.source == bgmSource && choice.source != SoundSource.None) {
            player?.volume = choice.volume
            player?.repeatMode = repeatMode(choice)
        } else {
            startBgmNow()
        }
    }

    private fun startBgmNow() {
        val choice = snapshot.let { resolver.bgm(it.settings, it.files) }
        if (choice.source == SoundSource.None) {
            stopBgmNow()
            return
        }
        val p = player ?: ExoPlayer.Builder(appContext)
            .setLooper(Looper.getMainLooper())
            .build()
            .also {
                it.setAudioAttributes(
                    androidx.media3.common.AudioAttributes.Builder()
                        .setUsage(C.USAGE_GAME)
                        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                        .build(),
                    /* handleAudioFocus = */ false,
                )
                player = it
            }
        val uri = when (val s = choice.source) {
            is SoundSource.Asset -> Uri.parse("asset:///${s.path}")
            is SoundSource.File -> Uri.fromFile(s.file)
            SoundSource.None -> return
        }
        p.volume = choice.volume
        p.repeatMode = repeatMode(choice)
        p.setMediaItem(MediaItem.fromUri(uri))
        p.prepare()
        p.playWhenReady = true
        bgmSource = choice.source
    }

    private fun stopBgmNow() {
        bgmSource = SoundSource.None
        player?.let {
            it.stop()
            it.clearMediaItems()
        }
    }

    private fun repeatMode(c: BgmChoice) = if (c.loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF

    private inline fun onMain(crossinline block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post { block() }
    }

    private companion object {
        const val TAG = "AudioEngine"
        const val MAX_STREAMS = 16
    }
}
