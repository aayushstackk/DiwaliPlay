package com.aayush.diwaliplay.game

import com.aayush.diwaliplay.model.HandGesture
import kotlin.math.ceil
import kotlin.math.max

/** Port of src/utils/scoreSystem.ts. */
const val GAME_DURATION_SECONDS = 35

/** Mirrors ScoreTierInfo in src/types/motion.ts; [color] is a Tailwind gradient string. */
data class ScoreTierInfo(
    val tier: String,
    val badgeTitle: String,
    val badgeSubtitle: String,
    val emoji: String,
    val color: String,
)

data class BurstPoints(val points: Int, val label: String)

/** "00:SS" style timer; seconds are rounded up and clamped at zero. */
fun formatGameTimer(secondsRemaining: Double): String {
    val rounded = max(0.0, ceil(secondsRemaining)).toInt()
    val mins = rounded / 60
    val secs = rounded % 60
    return "${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}"
}

fun calculateBurstPoints(speed: Double, gesture: HandGesture, isCombo: Boolean): BurstPoints {
    var basePoints: Int
    var label: String
    if (speed < 150) {
        basePoints = 10
        label = "+10 SPARK"
    } else if (speed < 300) {
        basePoints = 25
        label = "+25 BURST"
    } else {
        basePoints = 50
        label = "+50 FAST BLAST"
    }

    if (gesture == HandGesture.FIST && speed >= 280) {
        basePoints += 60
        label = "+110 PUNCH BLAST!"
    }
    if (gesture == HandGesture.OPEN_PALM && speed >= 200) {
        basePoints += 20
        label = "+45 PALM SHOWER"
    }

    val finalPoints = basePoints * (if (isCombo) 2 else 1)
    if (isCombo) label = "+$finalPoints 2X COMBO!"
    return BurstPoints(finalPoints, label)
}

fun getScoreTier(score: Int): ScoreTierInfo = when {
    score >= 5000 -> ScoreTierInfo(
        "DHAMAKA_MASTER", "DIWALI DHAMAKA MASTER", "Grand Fireworks Legend", "\uD83C\uDF1F",
        "from-amber-400 via-yellow-300 to-amber-500",
    )
    score >= 3000 -> ScoreTierInfo(
        "ROCKET", "ROCKET CHAMPION", "Sky-Blazing Firework Maestro", "\uD83D\uDE80",
        "from-orange-400 via-rose-400 to-amber-400",
    )
    score >= 1800 -> ScoreTierInfo(
        "CHAKRI", "CHAKRI VIRTUOSO", "High-Velocity Spark Spinner", "\uD83C\uDF00",
        "from-emerald-400 via-teal-300 to-cyan-400",
    )
    score >= 800 -> ScoreTierInfo(
        "SPARKLER", "SPARKLER ACE", "Festive Energy Dynamo", "\u2728",
        "from-amber-300 via-amber-400 to-yellow-500",
    )
    else -> ScoreTierInfo(
        "NOVICE", "DIYA INITIATE", "Warm-up Performer", "\uD83E\uDE94",
        "from-neutral-300 via-amber-200 to-amber-400",
    )
}
