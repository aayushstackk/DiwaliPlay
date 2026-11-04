package com.aayush.diwaliplay.game.play

import com.aayush.diwaliplay.game.cracker.CrackerSim
import com.aayush.diwaliplay.game.cracker.HandSide
import com.aayush.diwaliplay.model.GameScoreState
import com.aayush.diwaliplay.model.TrackedHand
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Play rules ported from src/hooks/useHandTracking.ts (cracker section of runInference and
 * recordBombTouch) plus the target-score popup edge from src/App.tsx.
 *
 * Web fidelity notes:
 *  - Hand movement alone never bursts crackers or scores (the web has no spawn-timer trigger);
 *    per frame it only adds motion sparkles, updates maxSpeed and the 2x combo multiplier/duration.
 *  - Points come only from bomb hits ([recordBombHit]).
 */
class PlayDirector(
    private val sim: CrackerSim,
    private val targetScore: Int?,
) {
    private val combo = ComboTracker()
    private var state = GameScoreState(targetScore = targetScore)
    private val pending = ArrayList<PlayEvent>()
    private var targetWasAchieved = false

    val score: GameScoreState get() = state

    /** Returns and clears the events raised since the last call. */
    fun drainEvents(): List<PlayEvent> {
        val out = ArrayList(pending)
        pending.clear()
        return out
    }

    /**
     * Per-frame update. Motion sparkles always spawn for detected hands; maxSpeed and the combo
     * multiplier/duration only update while [crackerModeActive] (web `isCrackerModeActive` gate).
     */
    fun step(dtSeconds: Double, crackerModeActive: Boolean, left: TrackedHand, right: TrackedHand) {
        if (crackerModeActive) updateCombo(dtSeconds, left, right)
        if (left.detected) sim.addMotionSparkles(left.pixelX, left.pixelY, HandSide.LEFT, left.movementSpeed)
        if (right.detected) sim.addMotionSparkles(right.pixelX, right.pixelY, HandSide.RIGHT, right.movementSpeed)
    }

    private fun updateCombo(dtSeconds: Double, left: TrackedHand, right: TrackedHand) {
        val isComboActive = left.detected && right.detected &&
            left.movementSpeed > COMBO_SPEED && right.movementSpeed > COMBO_SPEED

        var s = state.copy(maxSpeed = max(state.maxSpeed, max(left.movementSpeed, right.movementSpeed)))
        s = if (isComboActive) {
            s.copy(multiplier = 2.0, comboDurationSec = s.comboDurationSec + min(max(dtSeconds, 0.0), 0.1))
        } else {
            s.copy(multiplier = 1.0)
        }
        state = s
    }

    fun recordBombHit(points: Int, isPenalty: Boolean, nowMs: Double) {
        val penalty = isPenalty || points < 0
        var s = state.copy(crackersBurst = state.crackersBurst + 1, bombsBurst = state.bombsBurst + 1)

        if (penalty) {
            val amount = abs(points)
            s = s.copy(
                score = max(0, s.score - amount),
                penaltyDeductions = s.penaltyDeductions + amount,
                lastDeltaPoints = -amount,
                lastDeltaLabel = "-$amount",
            )
            pending.add(PlayEvent.PenaltyApplied(amount))
            if (combo.reset()) pending.add(PlayEvent.ComboBroken)
        } else {
            s = s.copy(
                score = max(0, s.score + points),
                lastDeltaPoints = points,
                lastDeltaLabel = "+$points",
            )
            if (combo.recordHit(nowMs)) {
                val awarded = s.combosAwarded + 1
                s = s.copy(
                    score = s.score + ComboTracker.COMBO_BONUS,
                    comboBonusPoints = s.comboBonusPoints + ComboTracker.COMBO_BONUS,
                    combosAwarded = awarded,
                    comboCount = awarded,
                    lastDeltaPoints = points + ComboTracker.COMBO_BONUS,
                    lastDeltaLabel = "+$points (+${ComboTracker.COMBO_BONUS} COMBO!)",
                )
                pending.add(PlayEvent.ComboAwarded(awarded, ComboTracker.COMBO_BONUS))
                pending.add(PlayEvent.PlaySound(PlaySoundKeys.COMBO_DING))
            }
        }

        // App.tsx showTargetAchievedPopup: live score >= target; celebration on the rising edge,
        // re-armed whenever the score falls back below the target.
        val reached = targetScore != null && targetScore > 0 && s.score >= targetScore
        if (reached && !targetWasAchieved) {
            pending.add(PlayEvent.TargetReached)
            pending.add(PlayEvent.PlaySound(PlaySoundKeys.MEGA_BLAST))
        }
        targetWasAchieved = reached
        state = s.copy(targetAchieved = reached)
    }

    private companion object {
        const val COMBO_SPEED = 260.0
    }
}
