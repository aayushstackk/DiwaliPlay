package com.aayush.diwaliplay.model

import kotlinx.serialization.Serializable

/** Mirrors src/types/motion.ts. Normalized 0..1 mirrored screen-space point. */
@Serializable
data class Point2D(val x: Double = 0.0, val y: Double = 0.0)

@Serializable
data class LandmarkPoint(val x: Double = 0.0, val y: Double = 0.0, val z: Double = 0.0)

@Serializable
enum class HandGesture { OPEN_PALM, FIST, THUMBS_UP, POINTING, PEACE, UNKNOWN }

@Serializable
enum class MovementDirection {
    STATIONARY, LEFT, RIGHT, UP, DOWN, UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT,
}

@Serializable
enum class GameState { IDLE, READY, COUNTDOWN, PLAYING, PHOTO_COUNTDOWN, GAME_OVER }

/** Normalized 0..1 rectangle. */
@Serializable
data class TargetAreaRect(
    val xMin: Double = 0.0,
    val xMax: Double = 1.0,
    val yMin: Double = 0.0,
    val yMax: Double = 1.0,
)

/**
 * Mirror of TrackedHand. In the native app pixelX/pixelY are in the logical
 * 1920x1080 game space; movementSpeed / velocity are px per second.
 * [side] is "left" or "right"; [movementCategory] is "Idle" | "Slow" | "Moderate" | "Fast".
 */
@Serializable
data class TrackedHand(
    val side: String = "right",
    val detected: Boolean = false,
    val screenCenter: Point2D = Point2D(),
    val pixelX: Double = 0.0,
    val pixelY: Double = 0.0,
    val percentX: Double = 0.0,
    val percentY: Double = 0.0,
    val movementSpeed: Double = 0.0,
    val movementCategory: String = "Idle",
    val landmarks: List<LandmarkPoint> = emptyList(),
    val inTargetArea: Boolean = false,
    val consecutiveDetectedFrames: Int = 0,
    val lastSeenTimestamp: Long = 0L,
    val gesture: HandGesture = HandGesture.UNKNOWN,
    val direction: MovementDirection = MovementDirection.STATIONARY,
    val velocityX: Double = 0.0,
    val velocityY: Double = 0.0,
    val acceleration: Double = 0.0,
    val distanceMoved: Double = 0.0,
    val isPredicted: Boolean = false,
)

/** Defaults equal INITIAL_SCORE_STATE in src/utils/scoreSystem.ts. */
@Serializable
data class GameScoreState(
    val score: Int = 0,
    val multiplier: Double = 1.0,
    val crackersBurst: Int = 0,
    val maxSpeed: Double = 0.0,
    val comboCount: Int = 0,
    val punchCount: Int = 0,
    val comboDurationSec: Double = 0.0,
    val lastDeltaPoints: Int? = null,
    val lastDeltaLabel: String? = null,
    val bombsBurst: Int = 0,
    val combosAwarded: Int = 0,
    val penaltyDeductions: Int = 0,
    val comboBonusPoints: Int = 0,
    val targetScore: Int? = null,
    val targetAchieved: Boolean = false,
)

/** One sample of a hand trail, used only by the renderer. Times are milliseconds. */
data class TrailPoint(val x: Double, val y: Double, val timeMs: Long, val speed: Double)

/**
 * Drawing data for one hand, in logical 1920x1080 space. Lives in core:model so
 * core:render does not depend on core:tracking.
 */
data class HandRender(
    val side: String,
    val x: Double,
    val y: Double,
    val speed: Double,
    val vx: Double,
    val vy: Double,
    val detected: Boolean,
    val isPredicted: Boolean,
    val gesture: HandGesture,
    val marks: List<LandmarkPoint>?,
    val trail: List<TrailPoint>,
)
