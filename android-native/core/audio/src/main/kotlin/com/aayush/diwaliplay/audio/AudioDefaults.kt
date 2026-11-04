package com.aayush.diwaliplay.audio

import com.aayush.diwaliplay.model.BackgroundMusicConfig
import com.aayush.diwaliplay.model.ComboAudioConfig
import com.aayush.diwaliplay.model.CountdownAudioConfig
import com.aayush.diwaliplay.model.GameAudioSettings
import com.aayush.diwaliplay.model.SoundEffectConfig
import com.aayush.diwaliplay.model.SoundPreset

/** Port of `DEFAULT_AUDIO_PRESETS` in src/utils/audioDefaults.ts (only what resolution needs). */
val DEFAULT_AUDIO_PRESETS: List<SoundPreset> = listOf(
    SoundPreset(
        id = "festive_diwali",
        name = "Festive Diwali",
        isDefault = true,
        countdown = CountdownAudioConfig("beep_classic", "beep_classic", "beep_classic", "chime_celebration", 90.0),
        bgm = BackgroundMusicConfig("bgm_festive_rhythm", volume = 75.0, isMuted = false, loop = true),
        sfx = mapOf(
            "firework_launch" to SoundEffectConfig("launch_whoosh", 90.0),
            "explosion" to SoundEffectConfig("explosion_bomb", 95.0),
            "sparkler" to SoundEffectConfig("sparkler_hiss", 85.0),
            "bomb_impact" to SoundEffectConfig("bomb_blast", 90.0),
            "points_score" to SoundEffectConfig("coin_ping", 85.0),
            "game_over" to SoundEffectConfig("fanfare_triumph", 100.0),
            "photo_shutter" to SoundEffectConfig("shutter_modern", 95.0),
        ),
    ),
    SoundPreset(
        id = "classic_arcade",
        name = "Classic Arcade",
        countdown = CountdownAudioConfig("beep_digital", "beep_digital", "beep_digital", "airhorn_power", 85.0),
        bgm = BackgroundMusicConfig("bgm_arcade_groove", volume = 70.0, isMuted = false, loop = true),
        sfx = mapOf(
            "firework_launch" to SoundEffectConfig("launch_screamer", 85.0),
            "explosion" to SoundEffectConfig("explosion_ladi", 90.0),
            "sparkler" to SoundEffectConfig("sparkler_crackle", 80.0),
            "bomb_impact" to SoundEffectConfig("bomb_pop", 85.0),
            "points_score" to SoundEffectConfig("combo_ding", 85.0),
            "game_over" to SoundEffectConfig("fanfare_festive", 95.0),
            "photo_shutter" to SoundEffectConfig("shutter_vintage", 90.0),
        ),
    ),
    SoundPreset(
        id = "premium_celebration",
        name = "Premium Celebration",
        countdown = CountdownAudioConfig("bell_chime", "bell_chime", "bell_chime", "gong_impact", 95.0),
        bgm = BackgroundMusicConfig("bgm_ambient_diya", volume = 65.0, isMuted = false, loop = true),
        sfx = mapOf(
            "firework_launch" to SoundEffectConfig("launch_whoosh", 95.0),
            "explosion" to SoundEffectConfig("explosion_mega", 100.0),
            "sparkler" to SoundEffectConfig("sparkler_hiss", 90.0),
            "bomb_impact" to SoundEffectConfig("bomb_chime", 95.0),
            "points_score" to SoundEffectConfig("score_whoosh", 90.0),
            "game_over" to SoundEffectConfig("fanfare_grand", 100.0),
            "photo_shutter" to SoundEffectConfig("shutter_sparkle", 95.0),
        ),
    ),
)

/** Web `DEFAULT_AUDIO_SETTINGS.combo`. */
val DEFAULT_COMBO = ComboAudioConfig(soundId = "combo_ding", volume = 90.0)

/** Port of `DEFAULT_AUDIO_SETTINGS`. */
fun defaultAudioSettings(): GameAudioSettings {
    val p = DEFAULT_AUDIO_PRESETS[0]
    return GameAudioSettings(
        activePresetId = "festive_diwali", masterVolume = 90.0, isMuted = false,
        bgm = p.bgm, combo = DEFAULT_COMBO, countdown = p.countdown, sfx = p.sfx, presets = DEFAULT_AUDIO_PRESETS,
    )
}
