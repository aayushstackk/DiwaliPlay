package com.aayush.diwaliplay.game.play

import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.game.cracker.CrackerSim
import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.TrackedHand
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Expected values derive from src/hooks/useHandTracking.ts (runInference cracker section and
 * recordBombTouch). Note: the web NEVER spawns crackers from hand speed alone ("Hand movement
 * alone MUST NOT trigger any sound or award points"), so there is no spawn timer to port.
 */
class PlayDirectorTest {
    private fun sim() = CrackerSim(random = Mulberry32(7))
    private fun director(target: Int? = null, sim: CrackerSim = sim()) =
        PlayDirector(sim, Mulberry32(11), target)

    private fun hand(side: String, speed: Double, detected: Boolean = true) = TrackedHand(
        side = side, detected = detected, pixelX = 500.0, pixelY = 400.0,
        movementSpeed = speed, gesture = HandGesture.OPEN_PALM,
    )

    private val idleL = hand("left", 0.0, false)
    private val idleR = hand("right", 0.0, false)

    @Test
    fun idleHandsTriggerNothing() {
        val s = sim()
        val d = director(sim = s)
        repeat(60) { d.step(1.0 / 60, it * 16.0, idleL, idleR) }
        assertThat(s.totalBursts).isEqualTo(0)
        assertThat(s.activeCount).isEqualTo(0)
        assertThat(d.score.score).isEqualTo(0)
        assertThat(d.score.multiplier).isEqualTo(1.0)
        assertThat(d.events).isEmpty()
    }

    @Test
    fun fastHandOnlySpawnsMotionSparklesAndNeverCrackerOrPoints() {
        // Web: addMotionSparkles each frame for a detected hand; speed 300 > 240 -> 2 sparkles.
        val s = sim()
        val d = director(sim = s)
        d.step(1.0 / 60, 0.0, hand("left", 300.0), idleR)
        s.step(1.0 / 60)
        assertThat(s.activeCount).isEqualTo(2)
        assertThat(s.totalBursts).isEqualTo(0)
        assertThat(d.score.score).isEqualTo(0)
        assertThat(d.score.maxSpeed).isEqualTo(300.0)
        assertThat(d.events).isEmpty()
        // single fast hand is not a combo
        assertThat(d.score.multiplier).isEqualTo(1.0)
    }

    @Test
    fun bothHandsFastActivateComboMultiplierAndDuration() {
        // Both detected, both > 260 -> multiplier 2; each frame adds min(max(dt,0),0.1).
        val d = director()
        d.step(1.0 / 60, 0.0, hand("left", 300.0), hand("right", 400.0))
        d.step(0.5, 16.0, hand("left", 300.0), hand("right", 400.0)) // clamped to 0.1
        d.step(-1.0, 32.0, hand("left", 300.0), hand("right", 400.0)) // clamped to 0
        assertThat(d.score.multiplier).isEqualTo(2.0)
        assertThat(d.score.comboDurationSec).isWithin(1e-12).of(1.0 / 60 + 0.1)
        assertThat(d.score.maxSpeed).isEqualTo(400.0)
        // exactly 260 is NOT combo (strict >)
        d.step(1.0 / 60, 48.0, hand("left", 260.0), hand("right", 400.0))
        assertThat(d.score.multiplier).isEqualTo(1.0)
    }

    private fun hit(d: PlayDirector, points: Int, t: Double, penalty: Boolean = false) =
        d.recordBombHit(points, penalty, t)

    @Test
    fun threeHitsWithinOneSecondAwardFiftyBonus() {
        // 3 x 25 = 75, +50 combo bonus = 125; combosAwarded = comboCount = 1.
        val d = director()
        hit(d, 25, 0.0); hit(d, 25, 300.0); hit(d, 25, 900.0)
        val s = d.score
        assertThat(s.score).isEqualTo(125)
        assertThat(s.comboBonusPoints).isEqualTo(50)
        assertThat(s.combosAwarded).isEqualTo(1)
        assertThat(s.comboCount).isEqualTo(1)
        assertThat(s.crackersBurst).isEqualTo(3)
        assertThat(s.bombsBurst).isEqualTo(3)
        assertThat(s.lastDeltaPoints).isEqualTo(75) // 25 + 50
        assertThat(s.lastDeltaLabel).isEqualTo("+25 (+50 COMBO!)")
        assertThat(d.events).containsExactly(
            PlayEvent.ComboAwarded(1, 50), PlayEvent.PlaySound("combo_ding"),
        ).inOrder()
        assertThat(d.events).isEmpty() // drained
    }

    @Test
    fun hitAfterWindowStartsNewStreak() {
        // hits at 0, 500, 1200: 1200-0 > 1000 drops first -> [500,1200] only 2 -> no bonus.
        val d = director()
        hit(d, 10, 0.0); hit(d, 10, 500.0); hit(d, 10, 1200.0)
        assertThat(d.score.score).isEqualTo(30)
        assertThat(d.score.combosAwarded).isEqualTo(0)
        assertThat(d.events).isEmpty()
        // a 4th hit at 1300 -> [500,1200,1300] all within 1000 of 1300 -> bonus
        hit(d, 10, 1300.0)
        assertThat(d.score.score).isEqualTo(30 + 10 + 50)
        assertThat(d.score.combosAwarded).isEqualTo(1)
    }

    @Test
    fun penaltyBreaksComboAndDeducts() {
        val d = director()
        hit(d, 50, 0.0); hit(d, 50, 100.0)        // score 100, streak of 2
        hit(d, -30, 200.0, penalty = true)         // 100 - 30 = 70, streak cleared
        assertThat(d.score.score).isEqualTo(70)
        assertThat(d.score.penaltyDeductions).isEqualTo(30)
        assertThat(d.score.lastDeltaPoints).isEqualTo(-30)
        assertThat(d.score.lastDeltaLabel).isEqualTo("-30")
        assertThat(d.score.crackersBurst).isEqualTo(3)
        assertThat(d.events).containsExactly(
            PlayEvent.PenaltyApplied(30), PlayEvent.ComboBroken,
        ).inOrder()
        // streak was cleared: hit at 300 is only the 1st of a new streak
        hit(d, 50, 300.0)
        assertThat(d.score.combosAwarded).isEqualTo(0)
    }

    @Test
    fun negativePointsAreTreatedAsPenaltyEvenWithoutFlag() {
        val d = director()
        hit(d, -20, 0.0)
        assertThat(d.score.penaltyDeductions).isEqualTo(20)
        assertThat(d.events).containsExactly(PlayEvent.PenaltyApplied(20))
    }

    @Test
    fun scoreNeverNegative() {
        // Web: Math.max(0, score - penalty).
        val d = director()
        hit(d, 10, 0.0)
        hit(d, -100, 10.0, penalty = true)
        assertThat(d.score.score).isEqualTo(0)
        assertThat(d.score.penaltyDeductions).isEqualTo(100) // full requested amount tracked
    }

    @Test
    fun targetReachedEmittedOnce() {
        val d = director(target = 100)
        hit(d, 60, 0.0)
        assertThat(d.events).isEmpty()
        hit(d, 60, 2000.0) // 120 >= 100
        assertThat(d.events).containsExactly(
            PlayEvent.TargetReached, PlayEvent.PlaySound("MEGA_BLAST"),
        ).inOrder()
        assertThat(d.score.targetAchieved).isTrue()
        assertThat(d.score.targetScore).isEqualTo(100)
        hit(d, 60, 4000.0) // still above: no repeat
        assertThat(d.events).isEmpty()
    }

    @Test
    fun targetRearmsIfScoreDropsBelowThenReaches() {
        // Web App.tsx: wasTargetAchievedRef resets when score < target, so it fires again.
        val d = director(target = 100)
        hit(d, 100, 0.0)
        d.events
        hit(d, -50, 2000.0, penalty = true)
        assertThat(d.score.targetAchieved).isFalse()
        d.events
        hit(d, 60, 4000.0)
        assertThat(d.events).contains(PlayEvent.TargetReached)
    }

    @Test
    fun noTargetWhenNullOrNonPositive() {
        for (t in listOf<Int?>(null, 0)) {
            val d = director(target = t)
            hit(d, 500, 0.0)
            assertThat(d.events).doesNotContain(PlayEvent.TargetReached)
            assertThat(d.score.targetAchieved).isFalse()
        }
    }
}
