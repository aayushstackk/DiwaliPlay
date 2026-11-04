package com.aayush.diwaliplay.game.play

import com.aayush.diwaliplay.game.cracker.CrackerStyle
import com.aayush.diwaliplay.game.cracker.HandSide

/** One-shot happenings the UI/audio layers react to. Drained via [PlayDirector.events]. */
sealed interface PlayEvent {
    /**
     * Part of the planned interface; the web never bursts a cracker from hand movement alone
     * (useHandTracking.ts: "Hand movement alone MUST NOT trigger any sound or award points"),
     * so [PlayDirector] does not currently emit it.
     */
    data class CrackerBurst(val side: HandSide, val style: CrackerStyle) : PlayEvent

    /** Three reward bombs inside the 1 s window (web setComboNotice; [bonus] is COMBO_BONUS = 50). */
    data class ComboAwarded(val count: Int, val bonus: Int) : PlayEvent

    /** A penalty bomb wiped a non-empty combo streak. */
    data object ComboBroken : PlayEvent

    data object TargetReached : PlayEvent

    /** [points] is the positive deduction requested (the score itself is clamped at 0). */
    data class PenaltyApplied(val points: Int) : PlayEvent

    /** [key] is a web sound identifier: "combo_ding" (combo sound id) or "MEGA_BLAST" (target). */
    data class PlaySound(val key: String) : PlayEvent
}
