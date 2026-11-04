package com.aayush.diwaliplay.game

import com.aayush.diwaliplay.game.golden.loadGolden
import com.aayush.diwaliplay.model.AchievementTier
import com.aayush.diwaliplay.model.DiwaliJson
import com.aayush.diwaliplay.model.GameScoreState
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class AchievementsGoldenTest {
    private val root = loadGolden("achievements").jsonObject

    private fun tiers(e: JsonElement): List<AchievementTier> =
        e.jsonArray.map { DiwaliJson.decodeFromJsonElement(AchievementTier.serializer(), it) }

    private fun achievement(o: JsonObject) = PlayerAchievement(
        o["emoji"]!!.jsonPrimitive.content,
        o["title"]!!.jsonPrimitive.content,
        o["subtitle"]!!.jsonPrimitive.content,
        o["badgeColor"]!!.jsonPrimitive.content,
    )

    @Test
    fun defaultTiersMatchWeb() {
        assertThat(DEFAULT_ACHIEVEMENT_TIERS).isEqualTo(tiers(root["defaultTiers"]!!))
    }

    @Test
    fun achievementsMatch() {
        val custom = tiers(root["customTiers"]!!)
        val rows = root["achievements"]!!.jsonArray
        assertThat(rows).hasSize(241)
        for (r in rows.map { it.jsonObject }) {
            val score = r["score"]!!.jsonPrimitive.int
            assertThat(calculateAchievement(score, null)).isEqualTo(achievement(r["default"]!!.jsonObject))
            assertThat(calculateAchievement(score, emptyList())).isEqualTo(achievement(r["default"]!!.jsonObject))
            assertThat(calculateAchievement(score, custom)).isEqualTo(achievement(r["custom"]!!.jsonObject))
        }
    }

    @Test
    fun wishesMatch() {
        val custom = tiers(root["customTiers"]!!)
        val wishTiers = tiers(root["wishTiers"]!!)
        val rows = root["wishes"]!!.jsonArray
        assertThat(rows).hasSize(50)
        for (r in rows.map { it.jsonObject }) {
            val score = r["score"]!!.jsonPrimitive.int
            val tierSet = when (r["tiers"]!!.jsonPrimitive.content) {
                "wish" -> wishTiers
                "custom" -> custom
                else -> null
            }
            val stats = GameScoreState(score = score)
            val rank = r["rank"].let { if (it == null || it is JsonNull) null else it.jsonPrimitive.content }
            val got = getPersonalizedWish(
                stats,
                calculateAchievement(score, tierSet),
                r["playerName"]!!.jsonPrimitive.content,
                r["brandName"]!!.jsonPrimitive.content,
                tierSet,
                rank,
                Mulberry32(r["seed"]!!.jsonPrimitive.int),
            )
            val want = FormattedPersonalizedWish(
                r["heading"]!!.jsonPrimitive.content,
                r["lines"]!!.jsonArray.map { it.jsonPrimitive.content },
                r["signoff"]!!.jsonPrimitive.content,
            )
            assertThat(got).isEqualTo(want)
        }
    }
}
