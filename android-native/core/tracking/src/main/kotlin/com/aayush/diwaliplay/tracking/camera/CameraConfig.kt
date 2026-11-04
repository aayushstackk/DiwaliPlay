package com.aayush.diwaliplay.tracking.camera

// Pure camera-configuration choices (unit-tested on the JVM). Sizes and ranges are (a, b) pairs so
// the logic needs no android.util.Size / Range.

/** Preferred analysis/preview resolution (spec §5). */
val PREFERRED_RESOLUTION = 1280 to 720

/** Fallback when the camera cannot deliver 1280×720; landmarks then go through [cropToSixteenNine]. */
val FALLBACK_RESOLUTION = 640 to 480

/** Puts 1280×720 first, then 640×480, then the camera's other sizes in their original order. */
fun orderResolutions(supported: List<Pair<Int, Int>>): List<Pair<Int, Int>> {
    val preferred = listOf(PREFERRED_RESOLUTION, FALLBACK_RESOLUTION).filter { it in supported }
    return preferred + supported.filter { it !in preferred }
}

/**
 * Picks the AE target fps range for a 30 fps target: exactly 30–30 if offered, else the range that
 * reaches 30 with the highest floor (the WAF reports 15–30), else the range with the highest ceiling
 * below 30 (highest floor on ties). Null when the camera reports none (leave the default).
 */
fun chooseFpsRange(available: List<Pair<Int, Int>>, target: Int = 30): Pair<Int, Int>? {
    if (available.isEmpty()) return null
    available.firstOrNull { it.first == target && it.second == target }?.let { return it }
    available.filter { it.second == target }.maxByOrNull { it.first }?.let { return it }
    val below = available.filter { it.second < target }
    if (below.isNotEmpty()) return below.maxWith(compareBy({ it.second }, { it.first }))
    return available.minWith(compareBy({ it.second }, { -it.first }))
}
