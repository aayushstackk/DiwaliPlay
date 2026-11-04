package com.aayush.diwaliplay.game.play

/** One-shot happenings the UI/audio layers react to. Drained via [PlayDirector.drainEvents]. */
sealed interface PlayEvent {
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

/** Web sound identifiers carried by [PlayEvent.PlaySound]; Task 16 resolves them. */
object PlaySoundKeys {
    /** Default combo sound id (soundEngine.playComboSound). */
    const val COMBO_DING = "combo_ding"

    /** Target-achieved celebration (App.tsx playSound('MEGA_BLAST')). */
    const val MEGA_BLAST = "MEGA_BLAST"
}
