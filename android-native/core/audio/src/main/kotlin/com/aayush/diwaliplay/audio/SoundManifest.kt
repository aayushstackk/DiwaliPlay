package com.aayush.diwaliplay.audio

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * `assets/sounds/manifest.json` (written by scripts/export-native-sounds): web sound ids and cracker types /
 * bomb presets / bgm tracks mapped to file names inside `assets/sounds/`.
 */
@Serializable
data class SoundManifest(
    val sounds: Map<String, String> = emptyMap(),
    val crackers: Map<String, String> = emptyMap(),
    val bombPresets: Map<String, String> = emptyMap(),
    val bgm: Map<String, BgmEntry> = emptyMap(),
    val spinTick: String = "",
    val spinVictory: String = "",
) {
    @Serializable
    data class BgmEntry(val file: String, val loop: Boolean = true)

    companion object {
        const val ASSET_DIR = "sounds"
        const val FILE_NAME = "$ASSET_DIR/manifest.json"

        private val json = Json { ignoreUnknownKeys = true }

        fun parse(text: String): SoundManifest = json.decodeFromString(serializer(), text)

        /** Path of a manifest file name relative to the APK assets root. */
        fun assetPath(file: String): String = "$ASSET_DIR/$file"
    }
}
