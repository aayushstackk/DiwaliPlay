package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.game.spin.SpinConstants
import com.aayush.diwaliplay.game.spin.calculateTargetStopAngle
import com.aayush.diwaliplay.model.RewardItem
import com.google.common.truth.Truth.assertThat
import kotlin.math.pow
import org.junit.Test

class SpinDriverTest {
    private val rewards = listOf("a", "b", "c", "d").map { RewardItem(id = it, name = it) }
    private val minCruise = SpinConstants.ACCEL_DURATION_MS + SpinConstants.MIN_CRUISE_DURATION_MS

    private fun run(d: SpinDriver, from: Double, to: Double, step: Double = 16.0, each: (Double, Float) -> Unit = { _, _ -> }): Double {
        var t = from
        while (t < to) {
            t += step
            each(t, d.frame(t))
            if (d.settled != null) break
        }
        return t
    }

    @Test
    fun cruisesUntilAResultAndTheMinimumCruiseBothHappen() {
        val d = SpinDriver(rewards, 0.0, 0.0)
        d.onResult(SpinOutcome.Failed)
        d.frame(minCruise - 1)
        assertThat(d.decelerating).isFalse()
        d.frame(minCruise)
        assertThat(d.decelerating).isTrue()

        val late = SpinDriver(rewards, 0.0, 0.0)
        late.frame(5_000.0)
        assertThat(late.decelerating).isFalse()
        late.onResult(SpinOutcome.Failed)
        late.frame(5_016.0)
        assertThat(late.decelerating).isTrue()
    }

    @Test
    fun winStopsWithThatSliceUnderThePointer() {
        val d = SpinDriver(rewards, 33.0, 0.0)
        d.onResult(SpinOutcome.Won(rewards[2], rewardIndex = 0))
        run(d, 0.0, 20_000.0)
        assertThat(d.settled).isEqualTo(SpinOutcome.Won(rewards[2], rewardIndex = 0))
        val rest = ((d.angle % 360.0) + 360.0) % 360.0
        assertThat(rest).isWithin(1e-6).of(calculateTargetStopAngle(2, 4))
        assertThat(d.flapperDegrees).isEqualTo(0f)
    }

    @Test
    fun aRewardNotOnTheWheelUsesTheServersIndex() {
        val d = SpinDriver(rewards, 0.0, 0.0)
        d.onResult(SpinOutcome.Won(RewardItem(id = "gone"), rewardIndex = 3))
        run(d, 0.0, 20_000.0)
        assertThat(((d.angle % 360.0) + 360.0) % 360.0).isWithin(1e-6).of(calculateTargetStopAngle(3, 4))
    }

    @Test
    fun failureSpinsDown720DegreesIn1200Ms() {
        val d = SpinDriver(rewards, 0.0, 0.0)
        d.onResult(SpinOutcome.Failed)
        d.frame(minCruise)
        val startAngle = d.angle
        run(d, minCruise, minCruise + 1_100.0, step = 100.0)
        assertThat(d.settled).isNull()
        d.frame(minCruise + 1_200.0)
        assertThat(d.settled).isEqualTo(SpinOutcome.Failed)
        assertThat(d.angle).isWithin(1e-6).of(startAngle + 720.0)
    }

    @Test
    fun onlyEverTurnsClockwise() {
        val d = SpinDriver(rewards, 10.0, 0.0)
        d.onResult(SpinOutcome.Won(rewards[1], null))
        var last = 10.0
        run(d, 0.0, 20_000.0) { _, _ ->
            assertThat(d.angle).isAtLeast(last)
            last = d.angle
        }
    }

    @Test
    fun ticksAtFullRatioInCruiseAndLowerWhileDecelerating() {
        val d = SpinDriver(rewards, 0.0, 0.0)
        val cruise = ArrayList<Float>()
        run(d, 0.0, 500.0) { _, r -> if (r >= 0) cruise += r }
        assertThat(cruise).isNotEmpty()
        assertThat(cruise.toSet()).containsExactly(1f)

        d.onResult(SpinOutcome.Won(rewards[0], null))
        d.frame(minCruise)
        val start = minCruise
        val decel = ArrayList<Pair<Double, Float>>()
        run(d, start, 20_000.0) { t, r -> if (r >= 0) decel += t to r }
        assertThat(decel.map { it.second }.last()).isLessThan(0.5f)
        assertThat(decel.minOf { it.second }).isAtLeast(0.3f)
    }

    @Test
    fun tickRatioIsTheWebsFormula() {
        val total = decelDurationForTest()
        val d = SpinDriver(rewards, 0.0, 0.0)
        d.onResult(SpinOutcome.Failed) // 1200 ms: progress is easy to state
        d.frame(minCruise)
        var seen = false
        run(d, minCruise, minCruise + total, step = 16.0) { t, r ->
            if (r >= 0 && d.settled == null) {
                val progress = ((t - minCruise) / total).coerceAtMost(1.0)
                val expected = maxOf(0.3, (1 - progress).pow(SpinConstants.DECEL_EASING_POWER - 1))
                assertThat(r.toDouble()).isWithin(1e-3).of(expected)
                seen = true
            }
        }
        assertThat(seen).isTrue()
    }

    private fun decelDurationForTest() = 1200.0

    @Test
    fun ticksAreRateLimited() {
        val d = SpinDriver(rewards, 0.0, 0.0)
        val times = ArrayList<Double>()
        run(d, 0.0, 700.0, step = 4.0) { t, r -> if (r >= 0) times += t }
        for (i in 1 until times.size) {
            assertThat(times[i] - times[i - 1]).isAtLeast(SpinConstants.MIN_TICK_INTERVAL_MS)
        }
    }

    @Test
    fun pegCountsMatchTheWeb() {
        assertThat(spinPegCount(1)).isEqualTo(16)
        assertThat(spinPegCount(4)).isEqualTo(16)
        assertThat(spinPegCount(6)).isEqualTo(18)
        assertThat(spinPegCount(8)).isEqualTo(16)
        assertThat(spinPegCount(10)).isEqualTo(20)
        assertThat(spinPegCount(12)).isEqualTo(16)
        assertThat(spinPegCount(20)).isEqualTo(20)
    }

    @Test
    fun flapperDeflectsAroundEachPeg() {
        val step = 22.5 // 16 pegs
        assertThat(flapperDeflection(step * 0.5, step)).isEqualTo(0f)
        assertThat(flapperDeflection(0.0, step)).isWithin(1e-4f).of(-13f)
        assertThat(flapperDeflection(step * 0.125, step)).isWithin(1e-4f).of(-6.5f)
        assertThat(flapperDeflection(step * 0.875, step)).isWithin(1e-4f).of(-6.5f)
    }

    @Test
    fun tickSoundMappingMatchesPlayPreRenderedTick() {
        assertThat(spinTickPitch(1f)).isWithin(1e-5f).of(1.15f)
        assertThat(spinTickPitch(0.3f)).isWithin(1e-5f).of(0.905f)
        assertThat(spinTickGain(1f)).isWithin(1e-5f).of(0.5f)
        assertThat(spinTickGain(0.3f)).isWithin(1e-5f).of(0.325f)
    }

    @Test
    fun wheelShowsActiveChanceRewardsElseAll() {
        val chance = RewardItem(id = "c")
        val explicit = RewardItem(id = "e", mode = "chance", isActive = true)
        val score = RewardItem(id = "s", mode = "score")
        val off = RewardItem(id = "o", isActive = false)
        assertThat(wheelRewards(listOf(chance, score, explicit, off)).map { it.id }).containsExactly("c", "e").inOrder()
        assertThat(wheelRewards(listOf(score, off)).map { it.id }).containsExactly("s", "o").inOrder()
    }

    // parseVoucherTitle, with GameOverModal's expected splits.
    @Test
    fun voucherTitles() {
        assertThat(parseVoucherTitle("")).isEqualTo(VoucherTitle("DIWALI", "GIFT"))
        assertThat(parseVoucherTitle("₹1000/- OFF")).isEqualTo(VoucherTitle("₹1000/-", "OFF"))
        assertThat(parseVoucherTitle("₹500")).isEqualTo(VoucherTitle("₹500/-", "OFF"))
        assertThat(parseVoucherTitle("20% off")).isEqualTo(VoucherTitle("20%", "OFF"))
        assertThat(parseVoucherTitle("Flat ₹500 OFF")).isEqualTo(VoucherTitle("₹500/-", "FLAT OFF"))
        assertThat(parseVoucherTitle("Mug")).isEqualTo(VoucherTitle("MUG", ""))
        assertThat(parseVoucherTitle("Free Mug")).isEqualTo(VoucherTitle("FREE", "MUG"))
        assertThat(parseVoucherTitle("A Big Free Mug Today")).isEqualTo(VoucherTitle("A BIG FREE", "MUG TODAY"))
        assertThat(parseVoucherTitle("🎁 Free Mug")).isEqualTo(VoucherTitle("FREE", "MUG"))
    }
}
