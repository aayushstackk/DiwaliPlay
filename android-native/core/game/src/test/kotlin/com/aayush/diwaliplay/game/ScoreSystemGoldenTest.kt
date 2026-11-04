package com.aayush.diwaliplay.game

import com.aayush.diwaliplay.game.golden.loadGolden
import com.aayush.diwaliplay.model.HandGesture
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class ScoreSystemGoldenTest {
    private val root = loadGolden("score_system").jsonObject

    @Test
    fun durationIs35() {
        assertThat(GAME_DURATION_SECONDS).isEqualTo(35)
    }

    @Test
    fun timerMatches() {
        val rows = root["timer"]!!.jsonArray
        assertThat(rows).hasSize(7)
        for (r in rows.map { it.jsonObject }) {
            assertThat(formatGameTimer(r["input"]!!.jsonPrimitive.double))
                .isEqualTo(r["output"]!!.jsonPrimitive.content)
        }
    }

    @Test
    fun burstPointsMatch() {
        val rows = root["burst"]!!.jsonArray
        assertThat(rows).hasSize(31 * 6 * 2)
        for (r in rows.map { it.jsonObject }) {
            val got = calculateBurstPoints(
                r["speed"]!!.jsonPrimitive.double,
                HandGesture.valueOf(r["gesture"]!!.jsonPrimitive.content),
                r["isCombo"]!!.jsonPrimitive.boolean,
            )
            assertThat(got).isEqualTo(BurstPoints(r["points"]!!.jsonPrimitive.int, r["label"]!!.jsonPrimitive.content))
        }
    }

    @Test
    fun scoreTiersMatch() {
        val rows = root["tiers"]!!.jsonArray
        assertThat(rows).hasSize(241)
        for (r in rows.map { it.jsonObject }) {
            val got = getScoreTier(r["score"]!!.jsonPrimitive.int)
            assertThat(got).isEqualTo(
                ScoreTierInfo(
                    r["tier"]!!.jsonPrimitive.content,
                    r["badgeTitle"]!!.jsonPrimitive.content,
                    r["badgeSubtitle"]!!.jsonPrimitive.content,
                    r["emoji"]!!.jsonPrimitive.content,
                    r["color"]!!.jsonPrimitive.content,
                ),
            )
        }
    }
}
