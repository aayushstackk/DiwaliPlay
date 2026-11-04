package com.aayush.diwaliplay.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Port of `SfxKey` in src/types/backend.ts. [id] is the wire name, also the key of `GameAudioSettings.sfx`. */
@Serializable
enum class SfxKey(val id: String) {
    @SerialName("firework_launch") FIREWORK_LAUNCH("firework_launch"),
    @SerialName("explosion") EXPLOSION("explosion"),
    @SerialName("sparkler") SPARKLER("sparkler"),
    @SerialName("bomb_impact") BOMB_IMPACT("bomb_impact"),
    @SerialName("points_score") POINTS_SCORE("points_score"),
    @SerialName("game_over") GAME_OVER("game_over"),
    @SerialName("photo_shutter") PHOTO_SHUTTER("photo_shutter");

    companion object {
        fun fromId(id: String): SfxKey? = entries.firstOrNull { it.id == id }
    }
}
