package com.aayush.diwaliplay.model

import kotlinx.serialization.json.Json

/**
 * Shared JSON configuration for all API and relay payloads.
 * Tolerant on input (unknown keys ignored, nulls coerced to Kotlin defaults) and
 * explicit on output (defaults encoded, nulls omitted) to match the web server contract.
 */
val DiwaliJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
    encodeDefaults = true
}
