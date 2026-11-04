package com.aayush.diwaliplay.model


/** Port of `DEFAULT_BOMB_SETTINGS` in src/utils/bombDefaults.ts (verified by the bomb_defaults golden). */
val DEFAULT_BOMB_SETTINGS = BombGameSettings(
    minSpawnDelayMs = 650.0,
    maxSpawnDelayMs = 1400.0,
    maxConcurrentBombs = 5,
    bombRadius = 52.0,
    bombLifetimeMs = 5500.0,
    launchSpeedMultiplier = 1.45,
    gravityMultiplier = 1.45,
    maxBurstSize = 3,
    burstIntervalMs = 75.0,
)

private const val EPOCH = "2026-01-01T00:00:00.000Z"

private fun default(
    id: String, name: String, color: String, points: Int, weight: Double, sound: String, image: String,
) = BombConfig(
    id = id, name = name, color = color, points = points, spawnWeight = weight,
    soundPreset = sound, soundAssetId = null, soundUrl = null,
    imagePreset = image, imageAssetId = null, imageUrl = null,
    sizePercent = 100.0, isActive = true, isDefault = true, createdAt = EPOCH, updatedAt = EPOCH,
)

/** Port of `DEFAULT_BOMB_CONFIGS` in src/utils/bombDefaults.ts. */
val DEFAULT_BOMB_CONFIGS: List<BombConfig> = listOf(
    default("bomb_red", "Red Bomb", "#EF4444", 100, 10.0, "pop", "red_classic"),
    default("bomb_blue", "Blue Bomb", "#3B82F6", 150, 8.0, "blast", "blue_happy"),
    default("bomb_green", "Green Bomb", "#10B981", 300, 4.0, "chime", "green_super"),
    default("bomb_black", "Black Bomb", "#1E293B", -150, 6.0, "penalty_buzz", "black_penalty"),
)
