package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.game.spin.DecelTrajectory
import com.aayush.diwaliplay.game.spin.SpinConstants
import com.aayush.diwaliplay.game.spin.angleAt
import com.aayush.diwaliplay.game.spin.calculateDecelTrajectory
import com.aayush.diwaliplay.game.spin.calculateTargetStopAngle
import com.aayush.diwaliplay.game.spin.cruiseAngleAt
import com.aayush.diwaliplay.model.RewardItem
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** What the server said to a spin. Every kind of failure is the same to the player: "rewards unavailable". */
sealed interface SpinOutcome {
    data class Won(val reward: RewardItem, val rewardIndex: Int?) : SpinOutcome
    data object Failed : SpinOutcome
}

/** SpinWheelModal's failure spin-down: two more turns over 1200 ms. */
private const val FAILURE_DEGREES = 720.0
private const val FAILURE_DURATION_MS = 1200.0
private const val MAX_FLAPPER_DEGREES = 13f

/**
 * One spin of the wheel, frame by frame: SpinWheelModal's `animate`, apart from the drawing.
 *
 * Accelerates and cruises from the moment it's built, whatever the server is doing, until the result has arrived and
 * the minimum cruise is over; then decelerates onto the winning slice, or spins down on failure. Single thread, no
 * allocation per frame.
 */
class SpinDriver(private val rewards: List<RewardItem>, private val initialAngle: Double, private val startMs: Double) {
    private val pegStep = 360.0 / spinPegCount(max(1, rewards.size))
    private var lastPeg = floor(initialAngle / pegStep)
    private var lastTickMs = Double.NEGATIVE_INFINITY

    private var result: SpinOutcome? = null
    private var trajectory: DecelTrajectory? = null
    private var decelStartMs = 0.0

    var angle = initialAngle
        private set

    /** Needle rotation, degrees. */
    var flapperDegrees = 0f
        private set

    /** Non-null once the wheel has come to rest. */
    var settled: SpinOutcome? = null
        private set

    val decelerating: Boolean get() = trajectory != null

    /** May come at any time; the wheel keeps cruising until it has. */
    fun onResult(outcome: SpinOutcome) {
        if (result == null) result = outcome
    }

    /** Moves to [nowMs]. Returns the speed ratio if a peg's tick is due now, else a negative number. */
    fun frame(nowMs: Double): Float {
        if (settled != null) return -1f
        val ratio: Double
        val current = trajectory
        if (current == null) {
            val elapsed = nowMs - startMs
            angle = cruiseAngleAt(initialAngle, elapsed)
            ratio = 1.0
            val r = result
            if (r != null && elapsed >= SpinConstants.ACCEL_DURATION_MS + SpinConstants.MIN_CRUISE_DURATION_MS) {
                trajectory = trajectoryFor(r)
                decelStartMs = nowMs
            }
        } else {
            val elapsed = nowMs - decelStartMs
            val progress = min(1.0, elapsed / current.decelDurationMs)
            angle = angleAt(current, elapsed)
            ratio = max(0.3, (1.0 - progress).pow(SpinConstants.DECEL_EASING_POWER - 1.0))
            if (progress >= 1.0) {
                angle = current.decelStartAngle + current.totalDecelDegrees
                settled = result
            }
        }
        flapperDegrees = if (settled != null) 0f else flapperDeflection(angle, pegStep)

        val peg = floor(angle / pegStep)
        if (peg <= lastPeg) return -1f
        lastPeg = peg
        // playPreRenderedTick's rate limiter.
        if (nowMs - lastTickMs < SpinConstants.MIN_TICK_INTERVAL_MS) return -1f
        lastTickMs = nowMs
        return ratio.toFloat()
    }

    private fun trajectoryFor(r: SpinOutcome): DecelTrajectory = when (r) {
        is SpinOutcome.Won -> {
            val onWheel = rewards.indexOfFirst { it.id == r.reward.id }
            val index = if (onWheel >= 0) onWheel else r.rewardIndex ?: 0
            calculateDecelTrajectory(angle, calculateTargetStopAngle(index, max(1, rewards.size)))
        }
        SpinOutcome.Failed -> DecelTrajectory(angle, FAILURE_DEGREES, FAILURE_DURATION_MS)
    }
}

/** `totalPegs`: the pegs round the rim, each a tick as it passes the pointer. */
fun spinPegCount(numSlices: Int): Int {
    val perSlice = when {
        numSlices <= 4 -> 4
        numSlices <= 6 -> 3
        numSlices <= 10 -> 2
        else -> 1
    }
    return max(16, numSlices * perSlice)
}

/** The needle is pushed aside over the quarter of a peg step either side of each peg. */
fun flapperDeflection(angle: Double, pegStep: Double): Float {
    val phase = (((angle % pegStep) + pegStep) % pegStep) / pegStep
    return when {
        phase > 0.75 -> -MAX_FLAPPER_DEGREES * ((phase - 0.75) / 0.25).toFloat()
        phase < 0.25 -> -MAX_FLAPPER_DEGREES * (1.0 - phase / 0.25).toFloat()
        else -> 0f
    }
}

/** playPreRenderedTick's playback rate. */
fun spinTickPitch(speedRatio: Float): Float = min(1.35f, max(0.7f, 0.8f + speedRatio * 0.35f))

/** playPreRenderedTick's gain. */
fun spinTickGain(speedRatio: Float): Float = min(0.5f, max(0.2f, 0.25f + speedRatio * 0.25f))

/** GameOverModal: the active chance rewards, or everything if there are none. */
fun wheelRewards(all: List<RewardItem>): List<RewardItem> {
    val chance = all.filter { it.isActive != false && it.mode.orEmpty().ifEmpty { "chance" } == "chance" }
    return chance.ifEmpty { all }
}

data class VoucherTitle(val line1: String, val line2: String)

private val EMOJI = Regex("[\\x{1F300}-\\x{1F9FF}]|[\\u2600-\\u26FF]")
private val AMOUNT = Regex("^([₹$€£]?\\s*\\d+(?:/-|/)?%?)\\s*(.*)$", RegexOption.IGNORE_CASE)
private val FLAT = Regex("^(flat|get|win|save|upto)\\s+([₹$€£]?\\s*\\d+(?:/-|/)?%?)\\s*(.*)$", RegexOption.IGNORE_CASE)
private val BARE_AMOUNT = Regex("^[₹$€£]\\d+$")
private val SPACES = Regex("\\s+")

/** parseVoucherTitle: a voucher's name as two lines of wheel text. */
fun parseVoucherTitle(name: String): VoucherTitle {
    val clean = name.trim()
    if (clean.isEmpty()) return VoucherTitle("DIWALI", "GIFT")
    val text = clean.replace(EMOJI, "").trim()

    fun tidy(amount: String) = amount.trim().let { if (BARE_AMOUNT.matches(it)) "$it/-" else it }

    AMOUNT.find(text)?.let { m ->
        val rest = m.groupValues[2].trim()
        return VoucherTitle(tidy(m.groupValues[1]).uppercase(), if (rest.isNotEmpty()) rest.uppercase() else "OFF")
    }
    FLAT.find(text)?.let { m ->
        val rest = listOf(m.groupValues[1], m.groupValues[3]).filter { it.isNotEmpty() }.joinToString(" ").trim()
        return VoucherTitle(tidy(m.groupValues[2]).uppercase(), if (rest.isNotEmpty()) rest.uppercase() else "OFF")
    }
    val words = text.split(SPACES).filter { it.isNotEmpty() }
    return when (words.size) {
        0 -> VoucherTitle("DIWALI", "GIFT")
        1 -> VoucherTitle(words[0].uppercase(), "")
        2 -> VoucherTitle(words[0].uppercase(), words[1].uppercase())
        else -> {
            val mid = (words.size + 1) / 2
            VoucherTitle(words.take(mid).joinToString(" ").uppercase(), words.drop(mid).joinToString(" ").uppercase())
        }
    }
}
