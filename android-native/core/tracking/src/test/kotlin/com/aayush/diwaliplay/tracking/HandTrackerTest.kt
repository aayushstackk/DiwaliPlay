package com.aayush.diwaliplay.tracking

import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.LandmarkPoint
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Expected values are derived by hand from src/hooks/useHandTracking.ts (runInference).
 * Helper: a hand whose 21 landmarks all sit at raw (1 - palmX, palmY); getPalmCenterScreen
 * averages indices 0,5,9,17 and mirrors x, so the palm centre is exactly (palmX, palmY).
 */
class HandTrackerTest {
    private fun hand(palmX: Double, palmY: Double = 0.5): List<LandmarkPoint> =
        List(21) { LandmarkPoint(1 - palmX, palmY, 0.0) }

    private fun frame(vararg hands: List<LandmarkPoint>) =
        HandFrame(hands.toList(), hands.map { 0.9f })

    private val empty = HandFrame(emptyList(), emptyList())

    @Test
    fun singleHandAssignedToNearestPreviousSide() {
        val t = HandTracker()
        // Frame 1: two hands at 0.3 (left) and 0.8 (right) -> prevPx left = 576, right = 1536.
        t.update(frame(hand(0.3), hand(0.8)), 1000.0)
        // Frame 2: one hand at 0.52 -> 998.4 px. distL = |998.4-576| = 422.4, distR = |998.4-1536| = 537.6.
        // distL < distR and distL < 0.4*1920 = 768 -> left, although palm.x >= 0.5 (half rule would say right).
        val r = t.update(frame(hand(0.52)), 1033.0)
        assertThat(r.left.detected).isTrue()
        assertThat(r.left.isPredicted).isFalse()
        assertThat(r.right.detected).isTrue()
        assertThat(r.right.isPredicted).isTrue() // right lost -> dead reckoning
        assertThat(r.left.pixelX).isEqualTo(998.0) // round(998.4)
    }

    @Test
    fun secondHandBeyond40PercentWidthIsNotReassigned() {
        val t = HandTracker()
        t.update(frame(hand(0.3)), 1000.0) // no history: both 9999 -> half rule, 0.3 < 0.5 -> left; prevL = 576
        // Single hand at 0.9 -> 1728 px. distL = 1152 (> 768), distR = 9999 (prevR = 0).
        // Left branch fails (distL >= 768); right branch fails (distR !< distL) -> half rule: 0.9 >= 0.5 -> right.
        val r = t.update(frame(hand(0.9)), 1033.0)
        assertThat(r.right.detected).isTrue()
        assertThat(r.right.isPredicted).isFalse()
        assertThat(r.right.pixelX).isEqualTo(1728.0)
        assertThat(r.left.isPredicted).isTrue() // left was not reassigned the far hand
    }

    @Test
    fun lostHandPredictedForTwoFramesThenDropped() {
        val t = HandTracker()
        t.update(frame(hand(0.3)), 1000.0)
        // Loss frames 1,2: lostFrames 0->1, 1->2, both < 2 at check -> predicted & detected.
        val l1 = t.update(empty, 1033.0).left
        val l2 = t.update(empty, 1066.0).left
        assertThat(l1.detected).isTrue(); assertThat(l1.isPredicted).isTrue()
        assertThat(l2.detected).isTrue(); assertThat(l2.isPredicted).isTrue()
        assertThat(t.history.left.trackingLosses).isEqualTo(0)
        // Loss frame 3: lostFrames = 2 (not < 2) -> else branch: consecutive > 0 && lost >= 2 -> losses = 1.
        val r3 = t.update(empty, 1099.0)
        assertThat(r3.left.detected).isFalse()
        assertThat(r3.left.movementCategory).isEqualTo("Idle")
        assertThat(r3.left.landmarks).isEmpty()
        assertThat(r3.left.gesture).isEqualTo(HandGesture.UNKNOWN)
        assertThat(t.history.left.trackingLosses).isEqualTo(1)
        // Right never had a hand: lastRealLandmarks empty -> no loss counted.
        assertThat(t.history.right.trackingLosses).isEqualTo(0)
        // A further empty frame does not count another loss (consecutiveFrames already 0).
        t.update(empty, 1132.0)
        assertThat(t.history.left.trackingLosses).isEqualTo(1)
    }

    @Test
    fun speedIsPixelsPerSecondInLogicalSpace() {
        val t = HandTracker()
        t.update(frame(hand(0.25)), 1000.0) // px = 0.25*1920 = 480
        // 0.35*1920 = 672 -> 192 px in 100 ms. dt = 0.1 s; instant = 192/0.1 = 1920 px/s.
        val r = t.update(frame(hand(0.35)), 1100.0).left
        assertThat(t.history.left.instantSpeed).isWithin(1e-6).of(1920.0)
        // alpha = 0.65 (instant > 250); smoothed = 0.65*1920 + 0.35*0 = 1248.
        assertThat(t.history.left.smoothedSpeed).isWithin(1e-6).of(1248.0)
        assertThat(r.movementSpeed).isEqualTo(1248.0)
        assertThat(r.movementCategory).isEqualTo("Fast")
        assertThat(r.velocityX).isEqualTo(1920.0)
        assertThat(r.velocityY).isEqualTo(0.0)
        assertThat(r.distanceMoved).isEqualTo(192.0)
        assertThat(t.history.maxSpeed).isEqualTo(1248.0)
    }

    @Test
    fun trailKeepsAtMost20PointsWithin350ms() {
        // 10 ms frames, t = 1000 + 10 i, i = 0..39. At t = 1390, kept points need 1390 - time < 350
        // -> time > 1040 -> i = 5..39 (35 points); slice(-20) -> i = 20..39.
        val t = HandTracker()
        for (i in 0..39) t.update(frame(hand(0.3)), 1000.0 + 10 * i)
        val trail = t.history.left.trail
        assertThat(trail).hasSize(20)
        assertThat(trail.first().timeMs).isEqualTo(1200L)
        assertThat(trail.last().timeMs).isEqualTo(1390L)

        // 50 ms frames, i = 0..10 (t = 1000..1500). At 1500: time > 1150 -> t = 1200..1500 = 7 points.
        val t2 = HandTracker()
        for (i in 0..10) t2.update(frame(hand(0.3)), 1000.0 + 50 * i)
        assertThat(t2.history.left.trail).hasSize(7)
        assertThat(t2.history.left.trail.first().timeMs).isEqualTo(1200L)
    }

    @Test
    fun calibrationRequiresOneSecondContinuousHold() {
        val t = HandTracker()
        // Left 0.3 is inside LEFT area (x <= 0.52), right 0.8 inside RIGHT area (x >= 0.48).
        t.update(frame(hand(0.3), hand(0.8)), 1000.0) // hold starts at 1000
        t.update(frame(hand(0.3), hand(0.8)), 1900.0)
        assertThat(t.isCalibrated(1900.0)).isFalse() // 900 ms
        // Break at 1900+: palms 0.2 / 0.3 -> right hand at 0.3 is outside RIGHT area (< 0.48) -> reset.
        t.update(frame(hand(0.2), hand(0.3)), 1950.0)
        assertThat(t.isCalibrated(2100.0)).isFalse()
        t.update(frame(hand(0.3), hand(0.8)), 2000.0) // hold restarts at 2000
        assertThat(t.isCalibrated(2999.0)).isFalse() // only 999 ms since restart
        t.update(frame(hand(0.3), hand(0.8)), 2990.0)
        assertThat(t.isCalibrated(3000.0)).isTrue() // 1000 ms continuous

        // One hand missing for a frame beyond the grace period -> no longer calibrated.
        val t2 = HandTracker()
        t2.update(frame(hand(0.3), hand(0.8)), 1000.0)
        assertThat(t2.isCalibrated(2000.0)).isTrue()
        repeat(3) { t2.update(HandFrame(listOf(hand(0.3)), listOf(0.9f)), 1100.0 + it) }
        assertThat(t2.isCalibrated(2000.0)).isFalse()
    }

    @Test
    fun resetClearsHistory() {
        val t = HandTracker()
        t.update(frame(hand(0.3), hand(0.8)), 1000.0)
        t.update(frame(hand(0.4), hand(0.7)), 1100.0)
        t.reset()
        assertThat(t.history.left.prevPx).isEqualTo(0.0)
        assertThat(t.history.right.prevPx).isEqualTo(0.0)
        assertThat(t.history.left.trail).isEmpty()
        assertThat(t.history.left.smoothedSpeed).isEqualTo(0.0)
        assertThat(t.history.maxSpeed).isEqualTo(0.0)
        assertThat(t.history.left.trackingLosses).isEqualTo(0)
        assertThat(t.isCalibrated(5000.0)).isFalse()
        // After reset an empty frame has nothing to predict from.
        val r = t.update(empty, 2000.0)
        assertThat(r.left.detected).isFalse()
        assertThat(r.left.screenCenter.x).isEqualTo(0.25)
        assertThat(r.right.percentX).isEqualTo(75.0)
        assertThat(t.renderHands().map { it.detected }).containsExactly(false, false)
    }

    @Test
    fun renderHandsReturnsLeftThenRightInPixels() {
        val t = HandTracker()
        t.update(frame(hand(0.25, 0.5), hand(0.75, 0.5)), 1000.0)
        val (l, r) = t.renderHands()
        assertThat(l.side).isEqualTo("left"); assertThat(l.x).isEqualTo(480.0); assertThat(l.y).isEqualTo(540.0)
        assertThat(r.side).isEqualTo("right"); assertThat(r.x).isEqualTo(1440.0)
        assertThat(l.marks).isNotNull()
        assertThat(l.trail).hasSize(1)
    }
}
