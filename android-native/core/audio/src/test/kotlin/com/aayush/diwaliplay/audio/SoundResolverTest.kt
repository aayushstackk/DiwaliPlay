package com.aayush.diwaliplay.audio

import com.aayush.diwaliplay.game.flow.FlowSoundKeys
import com.aayush.diwaliplay.game.play.PlaySoundKeys
import com.aayush.diwaliplay.model.BackgroundMusicConfig
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.ComboAudioConfig
import com.aayush.diwaliplay.model.CountdownAudioConfig
import com.aayush.diwaliplay.model.CountdownCustomUrls
import com.aayush.diwaliplay.model.GameAudioSettings
import com.aayush.diwaliplay.model.SfxKey
import com.aayush.diwaliplay.model.SoundEffectConfig
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class SoundResolverTest {
    private val manifest = SoundManifest.parse(
        javaClass.classLoader!!.getResourceAsStream("sounds/manifest.json")!!.bufferedReader().readText(),
    )
    private val resolver = SoundResolver(manifest)
    private val none = emptyMap<String, File>()

    private fun asset(name: String) = SoundSource.Asset("sounds/$name.flac")

    private fun settings(
        master: Double? = 100.0,
        muted: Boolean? = false,
        sfx: Map<String, SoundEffectConfig>? = null,
        countdown: CountdownAudioConfig? = null,
        combo: ComboAudioConfig? = null,
        bgm: BackgroundMusicConfig = BackgroundMusicConfig(activeTrackId = "bgm_festive_rhythm", volume = 100.0),
        activePresetId: String? = null,
    ) = GameAudioSettings(
        activePresetId = activePresetId, masterVolume = master, isMuted = muted,
        bgm = bgm, combo = combo, countdown = countdown, sfx = sfx,
    )

    // ---- brief tests -------------------------------------------------------------------------------------

    @Test fun customUrlWinsOverBuiltIn() {
        val f = File("/cache/boom.mp3")
        val s = settings(sfx = mapOf("explosion" to SoundEffectConfig("explosion_bomb", 100.0, customUrl = "https://x/boom.mp3")))
        val (src, _) = resolver.sfx(SfxKey.EXPLOSION, s, mapOf("https://x/boom.mp3" to f))
        assertThat(src).isEqualTo(SoundSource.File(f))
    }

    @Test fun customUrlNotYetCachedFallsBackToBuiltIn() {
        val s = settings(sfx = mapOf("explosion" to SoundEffectConfig("explosion_ladi", 100.0, customUrl = "https://x/boom.mp3")))
        assertThat(resolver.sfx(SfxKey.EXPLOSION, s, none).first).isEqualTo(asset("explosion_ladi"))
    }

    @Test fun builtInIdResolvesToAsset() {
        val s = settings(sfx = mapOf("sparkler" to SoundEffectConfig("sparkler_crackle", 100.0)))
        assertThat(resolver.sfx(SfxKey.SPARKLER, s, none).first).isEqualTo(asset("sparkler_crackle"))
        // alias ids share a file in the manifest
        val s2 = settings(sfx = mapOf("photo_shutter" to SoundEffectConfig("shutter_vintage", 100.0)))
        assertThat(resolver.sfx(SfxKey.PHOTO_SHUTTER, s2, none).first).isEqualTo(asset("camera_click"))
    }

    @Test fun presetSelectionApplies() {
        // No top-level sfx/countdown/combo: the active preset supplies them.
        val s = settings(activePresetId = "classic_arcade")
        assertThat(resolver.sfx(SfxKey.BOMB_IMPACT, s, none)).isEqualTo(asset("bomb_pop") to 1.0f * 0.85f)
        assertThat(resolver.countdown(CountdownStep.GO, s, none).first).isEqualTo(asset("airhorn_power"))
        // a preset carried inside the settings wins over the built-in one with the same id
        val custom = com.aayush.diwaliplay.model.SoundPreset(
            id = "mine",
            sfx = mapOf("bomb_impact" to SoundEffectConfig("bomb_chime", 50.0)),
        )
        val s2 = settings(activePresetId = "mine").copy(presets = listOf(custom))
        assertThat(resolver.sfx(SfxKey.BOMB_IMPACT, s2, none)).isEqualTo(asset("bomb_chime") to 0.5f)
        // unknown / null preset id: festive_diwali (web default)
        assertThat(resolver.sfx(SfxKey.BOMB_IMPACT, settings(activePresetId = "nope"), none).first).isEqualTo(asset("bomb_blast"))
        assertThat(resolver.sfx(SfxKey.BOMB_IMPACT, settings(), none).first).isEqualTo(asset("bomb_blast"))
    }

    @Test fun mutedResolvesZeroVolume() {
        val s = settings(muted = true)
        assertThat(resolver.sfx(SfxKey.EXPLOSION, s, none)).isEqualTo(SoundSource.None to 0f)
        assertThat(resolver.countdown(CountdownStep.THREE, s, none)).isEqualTo(SoundSource.None to 0f)
        assertThat(resolver.combo(s, none)).isEqualTo(SoundSource.None to 0f)
        assertThat(resolver.bombBurst("pop", null, s, none)).isEqualTo(SoundSource.None to 0f)
        assertThat(resolver.cracker("BOMB", s).volume).isEqualTo(0f)
        assertThat(resolver.cracker("BOMB", s).source).isEqualTo(SoundSource.None)
        assertThat(resolver.bgm(s, none).source).isEqualTo(SoundSource.None)
        assertThat(resolver.bgm(s, none).volume).isEqualTo(0f)
    }

    @Test fun volumeMultipliesMasterChannelAndSound() {
        val r = SoundResolver(manifest, effectChannel = 0.5f)
        val s = settings(master = 80.0, sfx = mapOf("explosion" to SoundEffectConfig("explosion_bomb", 50.0)))
        val (_, v) = r.sfx(SfxKey.EXPLOSION, s, none)
        assertThat(v).isWithin(1e-6f).of(0.8f * 0.5f * 0.5f)
    }

    @Test fun unknownIdFallsBackToPresetDefault() {
        // Web playBuiltIn default branch: beep_classic. Missing config / empty id: playSfx's 'explosion_bomb'.
        val s = settings(sfx = mapOf("explosion" to SoundEffectConfig("no_such_sound", 100.0)))
        assertThat(resolver.sfx(SfxKey.EXPLOSION, s, none).first).isEqualTo(asset("beep_classic"))
        val s2 = settings(sfx = mapOf("explosion" to SoundEffectConfig("", 100.0)))
        assertThat(resolver.sfx(SfxKey.EXPLOSION, s2, none).first).isEqualTo(asset("explosion_bomb"))
    }

    // ---- web volume semantics ------------------------------------------------------------------------------

    @Test fun defaultsReproduceWebLoudness() {
        // DEFAULT_AUDIO_SETTINGS: master 90, explosion 95 -> baked at master 1 / sound 1: 0.9 * 0.95
        val s = defaultAudioSettings()
        val (src, v) = resolver.sfx(SfxKey.EXPLOSION, s, none)
        assertThat(src).isEqualTo(asset("explosion_bomb"))
        assertThat(v).isWithin(1e-6f).of(0.9f * 0.95f)
        assertThat(resolver.countdown(CountdownStep.THREE, s, none).second).isWithin(1e-6f).of(0.9f * 0.9f)
        assertThat(resolver.countdown(CountdownStep.GO, s, none).first).isEqualTo(asset("chime_celebration"))
    }

    @Test fun missingSfxEntryUsesPlaySfxDefaults() {
        val s = settings(master = 100.0, sfx = emptyMap())
        val (src, v) = resolver.sfx(SfxKey.POINTS_SCORE, s, none)
        // item undefined in web: soundId 'explosion_bomb', volume 90
        assertThat(src).isEqualTo(asset("explosion_bomb"))
        assertThat(v).isWithin(1e-6f).of(0.9f)
    }

    @Test fun soundsThatIgnorePerSoundVolumeUseMasterOnly() {
        for (id in listOf("bomb_buzz", "fanfare_triumph", "fanfare_grand", "game_over_fanfare")) {
            val s = settings(master = 70.0, sfx = mapOf("game_over" to SoundEffectConfig(id, 20.0)))
            assertThat(resolver.sfx(SfxKey.GAME_OVER, s, none).second).isWithin(1e-6f).of(0.7f)
        }
        val s = settings(master = 70.0, sfx = mapOf("game_over" to SoundEffectConfig("fanfare_festive", 20.0)))
        assertThat(resolver.sfx(SfxKey.GAME_OVER, s, none).second).isWithin(1e-6f).of(0.7f * 0.2f)
    }

    @Test fun countdownUsesStepSoundVolumeAndCustomUrl() {
        val f = File("/cache/go.mp3")
        val cd = CountdownAudioConfig("beep_digital", "bell_chime", "drum_tick", "gong_impact", 50.0, CountdownCustomUrls(go = "u/go"))
        val s = settings(master = 100.0, countdown = cd)
        assertThat(resolver.countdown(CountdownStep.THREE, s, none)).isEqualTo(asset("beep_digital") to 0.5f)
        assertThat(resolver.countdown(CountdownStep.TWO, s, none).first).isEqualTo(asset("bell_chime"))
        assertThat(resolver.countdown(CountdownStep.ONE, s, none).first).isEqualTo(asset("drum_tick"))
        assertThat(resolver.countdown(CountdownStep.GO, s, mapOf("u/go" to f)).first).isEqualTo(SoundSource.File(f))
        assertThat(resolver.countdown(CountdownStep.GO, s, none).first).isEqualTo(asset("gong_impact"))
        // empty ids: web defaults beep_classic / chime_celebration
        val empty = settings(countdown = CountdownAudioConfig())
        assertThat(resolver.countdown(CountdownStep.THREE, empty, none).first).isEqualTo(asset("beep_classic"))
        assertThat(resolver.countdown(CountdownStep.GO, empty, none).first).isEqualTo(asset("chime_celebration"))
    }

    @Test fun comboAppliesMasterTwice() {
        val s = settings(master = 50.0, combo = ComboAudioConfig("combo_energy_burst", 80.0))
        val (src, v) = resolver.combo(s, none)
        assertThat(src).isEqualTo(asset("combo_energy_burst"))
        assertThat(v).isWithin(1e-6f).of(0.8f * 0.5f * 0.5f)
        // no combo config: web default combo_ding @ 90
        val d = resolver.combo(settings(master = 100.0), none)
        assertThat(d.first).isEqualTo(asset("combo_ding"))
        assertThat(d.second).isWithin(1e-6f).of(0.9f)
    }

    @Test fun customFilesAreBoostedLikeTheWebBufferPathAndClamped() {
        val f = File("/c/a.mp3")
        val s = settings(master = 10.0, sfx = mapOf("explosion" to SoundEffectConfig("", 100.0, customUrl = "u")))
        val (_, low) = resolver.sfx(SfxKey.EXPLOSION, s, mapOf("u" to f))
        assertThat(low).isWithin(1e-5f).of(0.1f * (1.25f * 0.95f * 1.3f * 1.35f))
        val loud = settings(master = 100.0, sfx = mapOf("explosion" to SoundEffectConfig("", 100.0, customUrl = "u")))
        assertThat(resolver.sfx(SfxKey.EXPLOSION, loud, mapOf("u" to f)).second).isEqualTo(1f)
    }

    @Test fun bgmVolumeIsSquaredForBuiltInAndSingleForCustom() {
        val s = settings(master = 50.0, bgm = BackgroundMusicConfig(activeTrackId = "bgm_ambient_diya", volume = 60.0))
        val b = resolver.bgm(s, none)
        assertThat(b.source).isEqualTo(asset("bgm_ambient_diya").let { SoundSource.Asset("sounds/bgm_ambient_diya.flac") })
        assertThat(b.loop).isTrue()
        assertThat(b.volume).isWithin(1e-6f).of(0.5f * 0.6f * 0.6f)

        val f = File("/c/music.mp3")
        val c = settings(master = 50.0, bgm = BackgroundMusicConfig(activeTrackId = "x", activeTrackUrl = "u/m", volume = 60.0, loop = false))
        val cb = resolver.bgm(c, mapOf("u/m" to f))
        assertThat(cb.source).isEqualTo(SoundSource.File(f))
        assertThat(cb.loop).isFalse()
        assertThat(cb.volume).isWithin(1e-6f).of(0.5f * 0.6f)
    }

    @Test fun bgmNoneMutedAndUnknownTrack() {
        assertThat(resolver.bgm(settings(bgm = BackgroundMusicConfig(activeTrackId = "none")), none).source).isEqualTo(SoundSource.None)
        assertThat(resolver.bgm(settings(bgm = BackgroundMusicConfig(activeTrackId = "bgm_arcade_groove", isMuted = true)), none).source)
            .isEqualTo(SoundSource.None)
        // web procedural switch: unknown theme plays the festive rhythm
        val u = resolver.bgm(settings(bgm = BackgroundMusicConfig(activeTrackId = "weird")), none)
        assertThat(u.source).isEqualTo(SoundSource.Asset("sounds/bgm_festive_rhythm.flac"))
    }

    @Test fun bombBurstPresetsFallbackAndCustomUrl() {
        val s = settings(master = 100.0)
        assertThat(resolver.bombBurst("blast", null, s, none).first).isEqualTo(asset("bomb_blast"))
        assertThat(resolver.bombBurst("penalty_buzz", null, s, none).first).isEqualTo(asset("bomb_buzz"))
        assertThat(resolver.bombBurst("rocket", null, s, none).first).isEqualTo(asset("cracker_rocket"))
        assertThat(resolver.bombBurst("sparkle", null, s, none).first).isEqualTo(asset("sparkler_hiss"))
        assertThat(resolver.bombBurst("nonsense", null, s, none).first).isEqualTo(asset("bomb_pop"))
        assertThat(resolver.bombBurst(null, null, s, none).first).isEqualTo(asset("bomb_pop"))
        assertThat(resolver.bombBurst("", null, s, none).first).isEqualTo(asset("bomb_pop"))
        // preset sound = master * effect channel only (baked at sound vol 1)
        assertThat(resolver.bombBurst("chime", null, settings(master = 80.0), none).second).isWithin(1e-6f).of(0.8f)
        val f = File("/c/b.mp3")
        val (src, v) = resolver.bombBurst("pop", "u/b", settings(master = 80.0), mapOf("u/b" to f))
        assertThat(src).isEqualTo(SoundSource.File(f))
        assertThat(v).isWithin(1e-6f).of(0.8f * 0.95f) // HTMLAudio: master * effectVolume
        // url not cached -> preset
        assertThat(resolver.bombBurst("chime", "u/b", s, none).first).isEqualTo(asset("bomb_chime"))
    }

    @Test fun crackerAppliesWebPitchAndVolumeJitter() {
        val lo = SoundResolver(manifest, random = { 0f }).cracker("BOMB", settings(master = 100.0))
        assertThat(lo.source).isEqualTo(asset("explosion_bomb"))
        assertThat(lo.rate).isWithin(1e-6f).of(0.92f)
        assertThat(lo.volume).isWithin(1e-6f).of(0.9f)
        val seq = ArrayDeque(listOf(1f, 0.5f))
        val hi = SoundResolver(manifest, random = { seq.removeFirst() }).cracker("LADI", settings(master = 80.0))
        assertThat(hi.rate).isWithin(1e-6f).of(1.08f)               // first draw = pitch
        assertThat(hi.volume).isWithin(1e-6f).of(0.8f * 1.0f)       // second draw = volume (0.9 + 0.5*0.2)
        assertThat(resolver.cracker("NOT_A_TYPE", settings()).source).isEqualTo(SoundSource.None)
        for (t in listOf("SMALL_CRACKER", "BOMB", "ROCKET", "LADI", "FLOWER_POT", "CHAKRI", "BIG_FIREWORK", "MEGA_BLAST")) {
            assertThat(resolver.cracker(t, settings()).source).isInstanceOf(SoundSource.Asset::class.java)
        }
    }

    @Test fun spinTickScalesLiveGainAgainstBakedHalf() {
        assertThat(resolver.spinTick(0.5f)).isEqualTo(SoundSource.Asset("sounds/spin_tick.flac") to 1f)
        assertThat(resolver.spinTick(0.2f).second).isWithin(1e-6f).of(0.4f)
        assertThat(resolver.spinTick().second).isEqualTo(1f)
    }

    // ---- game key routing ----------------------------------------------------------------------------------

    @Test fun everyGameKeyIsRouted() {
        val bombs = listOf(
            BombConfig(id = "b1", soundPreset = "blast"),
            BombConfig(id = "b2", soundPreset = "pop", soundUrl = "u/b2"),
        )
        val s = defaultAudioSettings()
        fun r(key: String, files: Map<String, File> = none) = resolver.forGameKey(key, s, files, bombs)

        assertThat(r(FlowSoundKeys.COUNTDOWN_3).source).isEqualTo(asset("beep_classic"))
        assertThat(r(FlowSoundKeys.COUNTDOWN_2).source).isEqualTo(asset("beep_classic"))
        assertThat(r(FlowSoundKeys.COUNTDOWN_1).source).isEqualTo(asset("beep_classic"))
        assertThat(r(FlowSoundKeys.COUNTDOWN_GO).source).isEqualTo(asset("chime_celebration"))
        assertThat(r(FlowSoundKeys.PHOTO_SHUTTER).source).isEqualTo(asset("camera_click"))
        assertThat(r(FlowSoundKeys.GAME_OVER).source).isEqualTo(asset("fanfare_triumph"))
        assertThat(r(PlaySoundKeys.COMBO_DING).source).isEqualTo(asset("combo_ding"))
        assertThat(r(PlaySoundKeys.MEGA_BLAST).source).isEqualTo(asset("explosion_mega"))
        assertThat(r(FlowSoundKeys.bombBurst(bombs[0])).source).isEqualTo(asset("bomb_blast"))
        val f = File("/c/b2.mp3")
        assertThat(r(FlowSoundKeys.bombBurst(bombs[1]), mapOf("u/b2" to f)).source).isEqualTo(SoundSource.File(f))
        // unknown bomb id -> default pop; unknown key -> silence
        assertThat(r("bomb_burst:gone").source).isEqualTo(asset("bomb_pop"))
        assertThat(r("mystery").source).isEqualTo(SoundSource.None)
        assertThat(r(FlowSoundKeys.GAME_OVER).volume).isGreaterThan(0f)
    }

    // ---- manifest & defaults sanity -----------------------------------------------------------------------

    @Test fun everyManifestFileExistsAndDefaultsResolve() {
        val files = buildList {
            addAll(manifest.sounds.values); addAll(manifest.crackers.values); addAll(manifest.bombPresets.values)
            addAll(manifest.bgm.values.map { it.file }); add(manifest.spinTick)
        }
        for (f in files) {
            assertThat(javaClass.classLoader!!.getResource("sounds/$f")).isNotNull()
        }
        val ids = DEFAULT_AUDIO_PRESETS.flatMap { p ->
            listOf(p.countdown.soundThree, p.countdown.soundTwo, p.countdown.soundOne, p.countdown.soundGo) +
                p.sfx.values.map { it.soundId }
        } + "combo_ding"
        for (id in ids) assertThat(manifest.sounds).containsKey(id)
        for (p in DEFAULT_AUDIO_PRESETS) assertThat(manifest.bgm).containsKey(p.bgm.activeTrackId)
        assertThat(SfxKey.entries.map { it.id }).containsExactly(
            "firework_launch", "explosion", "sparkler", "bomb_impact", "points_score", "game_over", "photo_shutter",
        )
    }

    @Test fun preloadCoversEveryPathEvenWhenMuted() {
        val f = File("/c/b.mp3")
        val bombs = listOf(BombConfig(id = "x", soundPreset = "pop", soundUrl = "u/b"))
        val src = resolver.preloadSources(defaultAudioSettings().copy(isMuted = true), mapOf("u/b" to f), bombs)
        assertThat(src).doesNotContain(SoundSource.None)
        assertThat(src).contains(SoundSource.File(f))
        assertThat(src).containsAtLeast(
            SoundSource.Asset("sounds/explosion_mega.flac"), SoundSource.Asset("sounds/bomb_buzz.flac"),
            SoundSource.Asset("sounds/spin_tick.flac"), SoundSource.Asset("sounds/chime_celebration.flac"),
        )
    }

    @Test fun preloadOrdersCriticalFirstAndLargeFilesLast() {
        val s = defaultAudioSettings()
        val order = resolver.preloadSources(s, none, emptyList()).toList()
        val critical = resolver.criticalSources(s, none)
        assertThat(critical).containsAtLeast(
            asset("beep_classic"), asset("chime_celebration"), asset("camera_click"), asset("combo_ding"), asset("fanfare_triumph"),
        )
        assertThat(order.take(critical.size).toSet()).isEqualTo(critical)
        val large = setOf("launch_whoosh", "explosion_mega", "cracker_rocket").map { asset(it).path.let(SoundSource::Asset) }
        assertThat(order.takeLast(large.size).toSet()).isEqualTo(large.toSet())
    }

    @Test fun prioritiesHighForCountdownGameOverMegaBlastLowForCrackers() {
        val s = defaultAudioSettings()
        fun p(k: String) = resolver.forGameKey(k, s, none, emptyList()).priority
        assertThat(p("countdown_3")).isEqualTo(ResolvedSound.PRIORITY_HIGH)
        assertThat(p("countdown_go")).isEqualTo(ResolvedSound.PRIORITY_HIGH)
        assertThat(p("game_over")).isEqualTo(ResolvedSound.PRIORITY_HIGH)
        assertThat(p("MEGA_BLAST")).isEqualTo(ResolvedSound.PRIORITY_HIGH)
        assertThat(p("bomb_burst:x")).isEqualTo(ResolvedSound.PRIORITY_NORMAL)
        assertThat(p("combo_ding")).isEqualTo(ResolvedSound.PRIORITY_NORMAL)
        assertThat(resolver.cracker("BOMB", s).priority).isEqualTo(ResolvedSound.PRIORITY_LOW)
    }
}
