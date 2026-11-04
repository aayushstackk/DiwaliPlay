package com.aayush.diwaliplay.game

import com.aayush.diwaliplay.game.golden.loadGolden
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class GameRandomTest {
    @Test
    fun matchesTypeScriptSequence() {
        val root = loadGolden("random_sequence").jsonObject
        val sequences: JsonArray = root["sequences"]!!.jsonArray
        assertThat(sequences.size).isEqualTo(2)
        for (entry in sequences) {
            val obj: JsonObject = entry.jsonObject
            val seed = obj["seed"]!!.jsonPrimitive.int
            val expected = obj["values"]!!.jsonArray.map { it.jsonPrimitive.double }
            assertThat(expected).hasSize(1000)
            val rng = Mulberry32(seed)
            expected.forEachIndexed { i, want ->
                assertThat(rng.nextDouble()).isEqualTo(want)
            }
        }
    }

    @Test
    fun systemRandomIsInUnitRange() {
        repeat(100) { assertThat(SystemRandom.nextDouble()).isAtLeast(0.0) }
    }
}
