package com.aayush.diwaliplay.audio

import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.GameAudioSettings
import com.aayush.diwaliplay.model.SfxKey
import com.aayush.diwaliplay.model.SoundPreset
import java.io.File
import kotlin.random.Random

/**
 * Pure mapping from web sound ids + [GameAudioSettings] to (source, gain). Mirrors soundEngine.ts selection and
 * volume rules; no Android dependencies.
 *
 * ## Volume normalisation (what the baked files already contain)
 * The Task 15 renders were made with the web engine's real graph at master 1.0, effect bus at its default
 * (effectVolume 0.95, x1.3 gain), per-sound vol 1.0, music bus 1.0 and BGM volume 100. So the baked effect files already
 * carry `1.35 (master stage) x 0.95 x 1.3 (effect bus) x limiter`. The live web level is
 * `masterVolume x perSound` on top of that, hence for built-in effects:
 *
 *     gain = master(0..1) x perSound(0..1) x [effectChannel]        // effectChannel = 1.0 relative to baked 0.95
 *
 * [effectChannel] is the *relative* channel factor (1.0 reproduces the default web level). Combo multiplies master
 * twice, BGM volume twice (see [bgm]), exactly as the web does.
 *
 * Custom (downloaded) files were not baked, so they receive the web's own bus gain, clamped to 1.0 (SoundPool's
 * limit; the web's limiter does the equivalent): `master x perSound x 1.25 (playExternalBuffer) x 0.95 x 1.3 x 1.35`.
 *
 * @param random unit-interval source for cracker pitch/volume jitter; injectable for tests.
 */
class SoundResolver(
    private val manifest: SoundManifest,
    private val effectChannel: Float = 1f,
    private val random: () -> Float = { Random.nextFloat() },
) {
    private val silent = SoundSource.None to 0f

    /** One of the seven web [SfxKey]s (`playSfx`). */
    fun sfx(key: SfxKey, settings: GameAudioSettings, files: Map<String, File>): Pair<SoundSource, Float> {
        if (muted(settings)) return silent
        val item = if (settings.sfx != null) settings.sfx!![key.id] else activePreset(settings).sfx[key.id]
        // playSfx: missing item -> volume 90, 'explosion_bomb'; empty soundId -> 'explosion_bomb'.
        val perSound = (item?.volume ?: 90.0) / 100.0
        return effect(item?.soundId?.ifEmpty { null } ?: DEFAULT_SFX_ID, item?.customUrl, perSound, master(settings), files)
    }

    /** `playCountdownStep`. */
    fun countdown(step: CountdownStep, settings: GameAudioSettings, files: Map<String, File>): Pair<SoundSource, Float> {
        if (muted(settings)) return silent
        val cfg = settings.countdown ?: activePreset(settings).countdown
        val (id, url) = when (step) {
            CountdownStep.THREE -> (cfg.soundThree.ifEmpty { DEFAULT_STEP_ID }) to cfg.customUrls?.three
            CountdownStep.TWO -> (cfg.soundTwo.ifEmpty { DEFAULT_STEP_ID }) to cfg.customUrls?.two
            CountdownStep.ONE -> (cfg.soundOne.ifEmpty { DEFAULT_STEP_ID }) to cfg.customUrls?.one
            CountdownStep.GO -> (cfg.soundGo.ifEmpty { DEFAULT_GO_ID }) to cfg.customUrls?.go
        }
        return effect(id, url, cfg.volume / 100.0, master(settings), files)
    }

    /** `playComboSound`: the web multiplies by masterVolume in the volume and again in the master stage. */
    fun combo(settings: GameAudioSettings, files: Map<String, File>): Pair<SoundSource, Float> {
        if (muted(settings)) return silent
        val cfg = settings.combo ?: DEFAULT_COMBO
        val m = master(settings)
        return effect(cfg.soundId.ifEmpty { DEFAULT_COMBO.soundId }, cfg.customUrl, cfg.volume / 100.0 * m, m, files)
    }

    /**
     * `startBgm` / music bus. Built-in loops: the bar scales by bgm.volume and the music bus scales by it again
     * (baked at 100), so gain = master x v^2. Custom track: HTMLAudio volume = master x v. Loop: the custom
     * track's `loop !== false`; built-ins loop per the manifest.
     */
    fun bgm(settings: GameAudioSettings, files: Map<String, File>): BgmChoice {
        val bgm = settings.bgm
        if (muted(settings) || bgm.isMuted || bgm.activeTrackId == "none") return BgmChoice.NONE
        val v = (bgm.volume / 100.0).coerceIn(0.0, 1.0)
        val m = master(settings)
        val custom = customFile(bgm.activeTrackUrl, files)
        if (custom != null) return BgmChoice(SoundSource.File(custom), gain(m * v), bgm.loop)
        val entry = manifest.bgm[bgm.activeTrackId.ifEmpty { DEFAULT_BGM_ID }] ?: manifest.bgm[DEFAULT_BGM_ID]
            ?: return BgmChoice.NONE
        return BgmChoice(SoundSource.Asset(SoundManifest.assetPath(entry.file)), gain(m * v * v), entry.loop)
    }

    /**
     * `playSound(type)`: effect bus at nominal 1 with random pitch 0.92..1.08 (first draw) and volume 0.9..1.1
     * (second draw). The pitch is returned as SoundPool [ResolvedSound.rate].
     */
    fun cracker(type: String, settings: GameAudioSettings): ResolvedSound {
        if (muted(settings)) return ResolvedSound.SILENCE
        val file = manifest.crackers[type] ?: return ResolvedSound.SILENCE
        val pitch = 0.92f + random() * 0.16f
        val vol = 0.9f + random() * 0.2f
        return ResolvedSound(
            SoundSource.Asset(SoundManifest.assetPath(file)),
            gain(master(settings) * vol * effectChannel),
            pitch,
            if (type == "MEGA_BLAST") ResolvedSound.PRIORITY_HIGH else ResolvedSound.PRIORITY_LOW,
        )
    }

    /** `playBombBurstSound`: custom URL (HTMLAudio: master x effectVolume) beats the preset; unknown preset -> pop. */
    fun bombBurst(
        soundPreset: String?,
        soundUrl: String?,
        settings: GameAudioSettings,
        files: Map<String, File>,
    ): Pair<SoundSource, Float> {
        if (muted(settings)) return silent
        val m = master(settings)
        customFile(soundUrl, files)?.let { return SoundSource.File(it) to gain(m * WEB_EFFECT_VOLUME * effectChannel) }
        val file = manifest.bombPresets[soundPreset.orEmpty().ifEmpty { DEFAULT_BOMB_PRESET }]
            ?: manifest.bombPresets[DEFAULT_BOMB_PRESET] ?: return silent
        // Synth presets are called with their default vol (1.0): master only.
        return SoundSource.Asset(SoundManifest.assetPath(file)) to gain(m * effectChannel)
    }

    /**
     * Spin-wheel tick (spinWheelPhysics.ts): plays straight to the destination at [liveGain] 0.2..0.5, no master.
     * The file is baked at 0.5, so gain = liveGain / 0.5.
     */
    fun spinTick(liveGain: Float = SPIN_TICK_BAKED_GAIN): Pair<SoundSource, Float> {
        if (manifest.spinTick.isEmpty()) return silent
        return SoundSource.Asset(SoundManifest.assetPath(manifest.spinTick)) to gain(liveGain / SPIN_TICK_BAKED_GAIN.toDouble())
    }

    /**
     * Router for every key core:game's `GameEffects.playSound` can emit:
     * `countdown_3|2|1|go`, `photo_shutter`, `game_over`, `combo_ding`, `MEGA_BLAST`, `bomb_burst:<configId>`.
     * Unknown keys are silent.
     */
    fun forGameKey(key: String, settings: GameAudioSettings, files: Map<String, File>, bombs: List<BombConfig>): ResolvedSound {
        fun pair(p: Pair<SoundSource, Float>, priority: Int = ResolvedSound.PRIORITY_NORMAL) =
            ResolvedSound(p.first, p.second, priority = priority)
        val high = ResolvedSound.PRIORITY_HIGH
        return when {
            key == "countdown_3" -> pair(countdown(CountdownStep.THREE, settings, files), high)
            key == "countdown_2" -> pair(countdown(CountdownStep.TWO, settings, files), high)
            key == "countdown_1" -> pair(countdown(CountdownStep.ONE, settings, files), high)
            key == "countdown_go" -> pair(countdown(CountdownStep.GO, settings, files), high)
            key == "photo_shutter" -> pair(sfx(SfxKey.PHOTO_SHUTTER, settings, files))
            key == "game_over" -> pair(sfx(SfxKey.GAME_OVER, settings, files), high)
            key == "combo_ding" -> pair(combo(settings, files))
            key == "MEGA_BLAST" -> cracker("MEGA_BLAST", settings)
            key.startsWith("bomb_burst:") -> {
                val bomb = bombs.firstOrNull { it.id == key.removePrefix("bomb_burst:") }
                pair(bombBurst(bomb?.soundPreset, bomb?.soundUrl, settings, files))
            }
            else -> ResolvedSound.SILENCE
        }
    }

    /**
     * Sources whose absence would make the round start audibly broken: the four countdown sounds, the shutter, the
     * combo sound and the game-over sound. [AudioEngine.isReady] is true once all of these have loaded.
     */
    fun criticalSources(settings: GameAudioSettings, files: Map<String, File>): Set<SoundSource> {
        val s = settings.copy(isMuted = false)
        val out = LinkedHashSet<SoundSource>()
        CountdownStep.entries.forEach { out += countdown(it, s, files).first }
        out += sfx(SfxKey.PHOTO_SHUTTER, s, files).first
        out += combo(s, files).first
        out += sfx(SfxKey.GAME_OVER, s, files).first
        out.remove(SoundSource.None)
        return out
    }

    /**
     * Every source [forGameKey], [sfx], [countdown], [combo], [cracker], [bombBurst] and [spinTick] can produce for
     * these settings (computed as if unmuted), in load order: [criticalSources] first, then the remaining effects,
     * crackers and bombs, and the large launch / mega-explosion / rocket files last.
     */
    fun preloadSources(settings: GameAudioSettings, files: Map<String, File>, bombs: List<BombConfig>): Set<SoundSource> {
        val s = settings.copy(isMuted = false)
        val rest = LinkedHashSet<SoundSource>()
        SfxKey.entries.forEach { rest += sfx(it, s, files).first }
        manifest.crackers.keys.forEach { rest += cracker(it, s).source }
        manifest.bombPresets.keys.forEach { rest += bombBurst(it, null, s, files).first }
        bombs.forEach { rest += bombBurst(it.soundPreset, it.soundUrl, s, files).first }
        rest += spinTick().first
        val critical = criticalSources(settings, files)
        val (large, normal) = (rest - critical - SoundSource.None).partition { isLarge(it) }
        return LinkedHashSet<SoundSource>().apply { addAll(critical); addAll(normal); addAll(large) }
    }

    private fun isLarge(source: SoundSource): Boolean {
        val name = (source as? SoundSource.Asset)?.path?.substringAfterLast('/') ?: return false
        return LARGE_FILE_PREFIXES.any { name.startsWith(it) }
    }

    // ------------------------------------------------------------------------------------------------------

    /** Built-in or custom effect; [perSound] already includes any extra web multiplier (combo). */
    private fun effect(id: String, url: String?, perSound: Double, master: Double, files: Map<String, File>): Pair<SoundSource, Float> {
        val custom = customFile(url, files)
        if (custom != null) {
            return SoundSource.File(custom) to gain(master * perSound * CUSTOM_BUS_GAIN * effectChannel)
        }
        files[id]?.let { // soundId may itself be a custom asset URL
            return SoundSource.File(it) to gain(master * perSound * CUSTOM_BUS_GAIN * effectChannel)
        }
        val file = manifest.sounds[id] ?: manifest.sounds[FALLBACK_ID] ?: return silent
        val scale = if (id in IDS_IGNORING_VOLUME) 1.0 else perSound
        return SoundSource.Asset(SoundManifest.assetPath(file)) to gain(master * scale * effectChannel)
    }

    private fun customFile(url: String?, files: Map<String, File>): File? = if (url.isNullOrBlank()) null else files[url]

    private fun muted(s: GameAudioSettings) = s.isMuted == true

    private fun master(s: GameAudioSettings) = ((s.masterVolume ?: 90.0) / 100.0).coerceIn(0.0, 1.0)

    private fun gain(v: Double) = v.toFloat().coerceIn(0f, 1f)

    private fun activePreset(s: GameAudioSettings): SoundPreset {
        val id = s.activePresetId
        return s.presets?.firstOrNull { it.id == id }
            ?: DEFAULT_AUDIO_PRESETS.firstOrNull { it.id == id }
            ?: DEFAULT_AUDIO_PRESETS[0]
    }

    companion object {
        const val FALLBACK_ID = "beep_classic"
        private const val DEFAULT_SFX_ID = "explosion_bomb"
        private const val DEFAULT_STEP_ID = "beep_classic"
        private const val DEFAULT_GO_ID = "chime_celebration"
        private const val DEFAULT_BGM_ID = "bgm_festive_rhythm"
        private const val DEFAULT_BOMB_PRESET = "pop"
        private const val SPIN_TICK_BAKED_GAIN = 0.5f

        /** SoundEngine.effectVolume default; HTMLAudio custom bomb sounds use master x this. */
        private const val WEB_EFFECT_VOLUME = 0.95

        /** playExternalBuffer 1.25 x effect bus (0.95 x 1.3) x master stage 1.35, per unit of master x perSound. */
        private const val CUSTOM_BUS_GAIN = 1.25 * 0.95 * 1.3 * 1.35

        /** The 7.7 s launch / rocket / mega-explosion renders (Task 15): loaded last. */
        private val LARGE_FILE_PREFIXES = listOf("launch_", "explosion_mega", "cracker_rocket")

        /** playBuiltIn cases that never forward `vol` to the synth (they call it with defaults). */
        private val IDS_IGNORING_VOLUME = setOf("bomb_buzz", "fanfare_triumph", "fanfare_grand", "game_over_fanfare")
    }
}
