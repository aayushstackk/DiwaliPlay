package com.aayush.diwaliplay.tracking.math

import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.model.MovementDirection
import com.aayush.diwaliplay.model.Point2D
import com.aayush.diwaliplay.model.TargetAreaRect
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** Port of the maths in src/utils/motionMath.ts. No Android imports. */

/** Standard MediaPipe anatomical hand skeleton connections. */
object HAND_BONES {
    val palm: List<Pair<Int, Int>> = listOf(
        0 to 1, 0 to 5, 0 to 9, 0 to 13, 0 to 17, 5 to 9, 9 to 13, 13 to 17,
    )
    val thumb: List<Pair<Int, Int>> = listOf(1 to 2, 2 to 3, 3 to 4)
    val index: List<Pair<Int, Int>> = listOf(5 to 6, 6 to 7, 7 to 8)
    val middle: List<Pair<Int, Int>> = listOf(9 to 10, 10 to 11, 11 to 12)
    val ring: List<Pair<Int, Int>> = listOf(13 to 14, 14 to 15, 15 to 16)
    val pinky: List<Pair<Int, Int>> = listOf(17 to 18, 18 to 19, 19 to 20)
}

/** Target area boundaries on mirrored screen space (0..1) for the alignment phase. */
val LEFT_TARGET_AREA = TargetAreaRect(xMin = 0.0, xMax = 0.52, yMin = 0.02, yMax = 0.98)
val RIGHT_TARGET_AREA = TargetAreaRect(xMin = 0.48, xMax = 1.0, yMin = 0.02, yMax = 0.98)

private val PALM_INDICES = intArrayOf(0, 5, 9, 17)

/** Stable palm centre from landmarks 0, 5, 9, 17, flipped horizontally for the mirrored selfie camera. */
fun getPalmCenterScreen(landmarks: List<LandmarkPoint>): Point2D {
    if (landmarks.isEmpty()) return Point2D(0.5, 0.5)
    var sumX = 0.0
    var sumY = 0.0
    for (idx in PALM_INDICES) {
        val pt = landmarks.getOrNull(idx) ?: landmarks[0]
        sumX += pt.x
        sumY += pt.y
    }
    return Point2D(x = 1 - sumX / PALM_INDICES.size, y = sumY / PALM_INDICES.size)
}

fun isPointInsideRect(pt: Point2D, rect: TargetAreaRect): Boolean =
    pt.x >= rect.xMin && pt.x <= rect.xMax && pt.y >= rect.yMin && pt.y <= rect.yMax

/** Speed (px/sec) to "Idle" | "Slow" | "Moderate" | "Fast". */
fun categorizeSpeed(speedPxPerSec: Double): String = when {
    speedPxPerSec < 40 -> "Idle"
    speedPxPerSec < 180 -> "Slow"
    speedPxPerSec < 450 -> "Moderate"
    else -> "Fast"
}

/** 8-direction movement from pixel velocities (screen space: +y down). */
fun calculateMovementDirection(vx: Double, vy: Double): MovementDirection {
    val speed = hypot(vx, vy)
    if (speed < 45) return MovementDirection.STATIONARY

    val angle = atan2(vy, vx) * (180 / Math.PI)

    return when {
        angle >= -22.5 && angle < 22.5 -> MovementDirection.RIGHT
        angle >= 22.5 && angle < 67.5 -> MovementDirection.DOWN_RIGHT
        angle >= 67.5 && angle < 112.5 -> MovementDirection.DOWN
        angle >= 112.5 && angle < 157.5 -> MovementDirection.DOWN_LEFT
        angle >= 157.5 || angle < -157.5 -> MovementDirection.LEFT
        angle >= -157.5 && angle < -112.5 -> MovementDirection.UP_LEFT
        angle >= -112.5 && angle < -67.5 -> MovementDirection.UP
        angle >= -67.5 && angle < -22.5 -> MovementDirection.UP_RIGHT
        else -> MovementDirection.STATIONARY
    }
}

/**
 * Dead-reckoning extrapolation for brief motion blur / occlusion. Shifts landmarks forward by the
 * velocity (px/s, screen space) in raw coordinate space, clamped to 0..1.
 */
fun extrapolateLandmarks(
    landmarks: List<LandmarkPoint>,
    vx: Double,
    vy: Double,
    dt: Double,
    width: Double,
    height: Double,
    damping: Double = 0.55,
): List<LandmarkPoint> {
    if (landmarks.isEmpty()) return emptyList()

    // Mirrored view: screenX = 1 - rawX => rawDx = -(vx * dt) / width
    val rawDx = (-(vx * dt) / max(width, 1.0)) * damping
    val rawDy = ((vy * dt) / max(height, 1.0)) * damping

    return landmarks.map { pt ->
        LandmarkPoint(
            x = max(0.0, min(1.0, pt.x + rawDx)),
            y = max(0.0, min(1.0, pt.y + rawDy)),
            z = pt.z,
        )
    }
}

/** Mirror of GameMappingPreview in src/types/motion.ts (enum-like strings kept verbatim). */
data class GameMappingPreview(
    /** "IDLE" | "LOW" | "MEDIUM" | "HIGH" | "OVERDRIVE" */
    val crackerSpawnRate: String,
    /** "SPARK_SHOWER" | "BURST_BOMB" | "DOUBLE_ROCKET" | "LASER_FIREWORK" | "READY" */
    val crackerAction: String,
    val isComboActive: Boolean,
    val intensityPercent: Int,
)

/** Maps current motion metrics to cracker action states. */
fun evaluateGameMapping(
    leftSpeed: Double,
    rightSpeed: Double,
    leftGesture: HandGesture,
    rightGesture: HandGesture,
): GameMappingPreview {
    val maxSpeed = max(leftSpeed, rightSpeed)
    val avgSpeed = (leftSpeed + rightSpeed) / 2

    val spawnRate = when {
        maxSpeed >= 500 -> "OVERDRIVE"
        maxSpeed >= 320 -> "HIGH"
        maxSpeed >= 140 -> "MEDIUM"
        maxSpeed >= 40 -> "LOW"
        else -> "IDLE"
    }

    fun either(g: HandGesture) = leftGesture == g || rightGesture == g
    val action = when {
        either(HandGesture.FIST) -> "BURST_BOMB"
        either(HandGesture.PEACE) -> "DOUBLE_ROCKET"
        either(HandGesture.POINTING) -> "LASER_FIREWORK"
        either(HandGesture.OPEN_PALM) -> "SPARK_SHOWER"
        else -> "READY"
    }

    val isCombo = leftSpeed > 280 && rightSpeed > 280
    // JS Math.round rounds half up (towards +infinity)
    val rounded = Math.floor((avgSpeed / 600) * 100 + 0.5)
    val intensity = min(rounded, 100.0).toInt()

    return GameMappingPreview(spawnRate, action, isCombo, intensity)
}
