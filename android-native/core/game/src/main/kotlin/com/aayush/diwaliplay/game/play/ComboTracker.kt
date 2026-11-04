package com.aayush.diwaliplay.game.play

/**
 * Sliding combo window from recordBombTouch in src/hooks/useHandTracking.ts
 * (COMBO_WINDOW_MS = 1000; 3 eligible hits inside it award COMBO_BONUS = 50).
 */
class ComboTracker {
    private val hits = ArrayList<Double>()

    /** Records a reward hit; returns true if it completed a combo (the streak is then cleared). */
    fun recordHit(nowMs: Double): Boolean {
        hits.removeAll { nowMs - it > COMBO_WINDOW_MS }
        hits.add(nowMs)
        if (hits.size >= COMBO_HITS) {
            hits.clear()
            return true
        }
        return false
    }

    /** Breaks the streak; returns true if there was one to break. */
    fun reset(): Boolean {
        val had = hits.isNotEmpty()
        hits.clear()
        return had
    }

    companion object {
        const val COMBO_WINDOW_MS = 1000.0
        const val COMBO_BONUS = 50
        const val COMBO_HITS = 3
    }
}
