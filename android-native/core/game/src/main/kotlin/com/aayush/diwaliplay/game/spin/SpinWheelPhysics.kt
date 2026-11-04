package com.aayush.diwaliplay.game.spin

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Port of `SPIN_CONSTANTS` in src/utils/spinWheelPhysics.ts. Angles are degrees, clockwise. */
object SpinConstants {
    const val CRUISE_SPEED: Double = 1600.0 // degrees/sec
    const val ACCEL_DURATION_MS: Double = 280.0
    const val MIN_CRUISE_DURATION_MS: Double = 520.0
    const val DECEL_FULL_TURNS: Int = 2
    const val DECEL_EASING_POWER: Double = 2.8
    const val MIN_TICK_INTERVAL_MS: Double = 20.0
}

/** Stop angle that centres slice [targetIdx] under the 12 o'clock pointer; slices run clockwise from 12 o'clock. */
fun calculateTargetStopAngle(targetIdx: Int, numSlices: Int): Double {
    val safeNumSlices = max(1, numSlices)
    val sliceAngle = 360.0 / safeNumSlices
    val sliceCenter = (targetIdx + 0.5) * sliceAngle
    return ((360.0 - (sliceCenter % 360.0)) % 360.0 + 360.0) % 360.0
}

data class DecelTrajectory(
    val decelStartAngle: Double,
    val totalDecelDegrees: Double,
    val decelDurationMs: Double,
)

/** Strictly clockwise deceleration from [currentAngle] to [targetStopAngle]. */
fun calculateDecelTrajectory(currentAngle: Double, targetStopAngle: Double): DecelTrajectory {
    val currentMod = ((currentAngle % 360.0) + 360.0) % 360.0
    var forwardDelta = ((targetStopAngle - currentMod) % 360.0 + 360.0) % 360.0
    if (forwardDelta < 15.0) forwardDelta += 360.0
    val totalDecelDegrees = SpinConstants.DECEL_FULL_TURNS * 360.0 + forwardDelta
    val decelDurationMs =
        (SpinConstants.DECEL_EASING_POWER * totalDecelDegrees / SpinConstants.CRUISE_SPEED) * 1000.0
    return DecelTrajectory(currentAngle, totalDecelDegrees, decelDurationMs)
}

/**
 * Wheel angle [elapsedMs] after deceleration began (SpinWheelModal phase 2); clamps at the final angle.
 * Same formula the web modal evaluates every frame.
 */
fun angleAt(trajectory: DecelTrajectory, elapsedMs: Double): Double {
    val progress = min(1.0, elapsedMs / trajectory.decelDurationMs)
    val eased = 1.0 - (1.0 - progress).pow(SpinConstants.DECEL_EASING_POWER)
    return trajectory.decelStartAngle + trajectory.totalDecelDegrees * eased
}

/** Wheel angle [elapsedMs] after the spin started, during accel + cruise (SpinWheelModal phase 1). */
fun cruiseAngleAt(initialAngle: Double, elapsedMs: Double): Double {
    val cruiseSpeed = SpinConstants.CRUISE_SPEED
    val accelDuration = SpinConstants.ACCEL_DURATION_MS
    if (elapsedMs < accelDuration) {
        val p = elapsedMs / accelDuration
        return initialAngle + 0.5 * cruiseSpeed * (accelDuration / 1000.0) * (p * p)
    }
    val accelDistance = 0.5 * cruiseSpeed * (accelDuration / 1000.0)
    return initialAngle + accelDistance + cruiseSpeed * ((elapsedMs - accelDuration) / 1000.0)
}
