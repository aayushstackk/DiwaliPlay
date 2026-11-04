package com.aayush.diwaliplay.game.bomb

import com.aayush.diwaliplay.game.golden.loadGolden
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.BombGameSettings
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class BombDefaultsGoldenTest {
    private val root = loadGolden("bomb_defaults").jsonObject

    @Test
    fun defaultsMatchWeb() {
        val settings = Json.decodeFromJsonElement(BombGameSettings.serializer(), root["settings"]!!)
        assertThat(DEFAULT_BOMB_SETTINGS).isEqualTo(settings)
        val configs = root["configs"]!!.jsonArray.map { Json.decodeFromJsonElement(BombConfig.serializer(), it) }
        assertThat(configs).hasSize(4)
        assertThat(DEFAULT_BOMB_CONFIGS).isEqualTo(configs)
    }
}
