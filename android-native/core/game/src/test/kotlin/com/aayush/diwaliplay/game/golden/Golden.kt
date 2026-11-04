package com.aayush.diwaliplay.game.golden

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** Loads `src/test/resources/golden/<name>.json` from the test classpath. */
fun loadGolden(name: String): JsonElement {
    val stream = checkNotNull(object {}.javaClass.getResourceAsStream("/golden/$name.json")) {
        "Missing golden fixture: golden/$name.json"
    }
    return Json.parseToJsonElement(stream.bufferedReader().use { it.readText() })
}
