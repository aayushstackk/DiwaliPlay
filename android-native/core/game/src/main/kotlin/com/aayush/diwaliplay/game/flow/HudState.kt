package com.aayush.diwaliplay.game.flow

import com.aayush.diwaliplay.model.GameScoreState
import kotlin.math.floor
import kotlin.math.min

/**
 * In-game overlay values (App.tsx header HUD). Every field is coarse so [GameController.hud] (a StateFlow,
 * which drops equal values) only emits when something visible changes.
 *
 * - [secondsLeftCeil]: `Math.ceil(remaining)`; the web re-renders only when this integer changes.
 * - [comboActive]: both-hands-fast 2x multiplier is on (`multiplier > 1`).
 * - [comboCount]: `combosAwarded`; the UI shows the 1400 ms combo notice when it increases.
 * - [targetProgress]: `min(100, round(score / target * 100))` percent, null when no target score is set.
 * - [targetAchieved]: live `score >= target` (web `showTargetAchievedPopup`).
 */
data class HudState(
    val secondsLeftCeil: Int = 0,
    val score: Int = 0,
    val comboActive: Boolean = false,
    val comboCount: Int = 0,
    val targetProgress: Int? = null,
    val targetAchieved: Boolean = false,
)

/** HUD values for [score]; the target fields follow App.tsx (`targetScoreEnabled && targetScore > 0`). */
internal fun hudStateOf(score: GameScoreState, secondsLeftCeil: Int, targetScore: Int?): HudState {
    val target = targetScore?.takeIf { it > 0 }
    return HudState(
        secondsLeftCeil = secondsLeftCeil,
        score = score.score,
        comboActive = score.multiplier > 1.0,
        comboCount = score.combosAwarded,
        // Math.min(100, Math.round((score / target) * 100)); Math.round(x) = floor(x + 0.5)
        targetProgress = target?.let { min(100, floor(score.score.toDouble() / it * 100.0 + 0.5).toInt()) },
        targetAchieved = target != null && score.score >= target,
    )
}
