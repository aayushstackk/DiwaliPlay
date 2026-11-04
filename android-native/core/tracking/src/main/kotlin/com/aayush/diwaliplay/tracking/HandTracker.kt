package com.aayush.diwaliplay.tracking

import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.HandRender
import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.model.Point2D
import com.aayush.diwaliplay.model.TargetAreaRect
import com.aayush.diwaliplay.model.TrackedHand
import com.aayush.diwaliplay.model.TrailPoint
import com.aayush.diwaliplay.tracking.math.LEFT_TARGET_AREA
import com.aayush.diwaliplay.tracking.math.RIGHT_TARGET_AREA
import com.aayush.diwaliplay.tracking.math.calculateMovementDirection
import com.aayush.diwaliplay.tracking.math.categorizeSpeed
import com.aayush.diwaliplay.tracking.math.extrapolateLandmarks
import com.aayush.diwaliplay.tracking.math.getPalmCenterScreen
import com.aayush.diwaliplay.tracking.math.isPointInsideRect
import com.aayush.diwaliplay.tracking.math.recognizeHandGesture
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot

private const val MAX_PREDICTION_GRACE_FRAMES = 2
private const val HOLD_MS = 1000.0
private const val TRAIL_WINDOW_MS = 350.0
private const val TRAIL_MAX_POINTS = 20

/** JS Math.round (half up). */
private fun jsRound(v: Double): Double = floor(v + 0.5)

/** Mirror of the web's per-side history object (useHandTracking.ts historyRef). */
class SideHistory internal constructor() {
    var prevPx: Double = 0.0; internal set
    var prevPy: Double = 0.0; internal set
    var prevTime: Double = 0.0; internal set
    var smoothedSpeed: Double = 0.0; internal set
    var prevSpeed: Double = 0.0; internal set
    /** Raw (unsmoothed) speed of the latest speed calculation, px/s. Test hook (Ruling P8). */
    var instantSpeed: Double = 0.0; internal set
    var vx: Double = 0.0; internal set
    var vy: Double = 0.0; internal set
    var acceleration: Double = 0.0; internal set
    var distanceMoved: Double = 0.0; internal set
    var consecutiveFrames: Int = 0; internal set
    var lostFrames: Int = 0; internal set
    var lastRealLandmarks: List<LandmarkPoint> = emptyList(); internal set
    var trackingLosses: Int = 0; internal set
    var activeMarks: List<LandmarkPoint>? = null; internal set
    var isDetected: Boolean = false; internal set
    var isPredicted: Boolean = false; internal set
    var gesture: HandGesture = HandGesture.UNKNOWN; internal set

    internal var trailSamples: List<TrailPoint> = emptyList()
    private var trailTimes: List<Double> = emptyList()

    val trail: List<TrailPoint> get() = trailSamples

    internal fun pushTrail(x: Double, y: Double, time: Double, speed: Double) {
        val times = (trailTimes + time)
        val pts = trailSamples + TrailPoint(x, y, time.toLong(), speed)
        // web: filter(currentTime - pt.time < 350).slice(-20)
        val keep = times.indices.filter { time - times[it] < TRAIL_WINDOW_MS }.takeLast(TRAIL_MAX_POINTS)
        trailTimes = keep.map { times[it] }
        trailSamples = keep.map { pts[it] }
    }

    internal fun shiftTrail() {
        if (trailSamples.isNotEmpty()) {
            trailSamples = trailSamples.drop(1)
            trailTimes = trailTimes.drop(1)
        }
    }
}

class HandHistory internal constructor() {
    val left = SideHistory()
    val right = SideHistory()
    var maxSpeed: Double = 0.0; internal set
}

class HandTracker(private val width: Double = 1920.0, private val height: Double = 1080.0) {
    var history: HandHistory = HandHistory(); private set

    private var latestLeft = defaultHand("left")
    private var latestRight = defaultHand("right")
    private var holdStartMs: Double? = null
    private var bothInTarget = false

    fun reset() {
        history = HandHistory()
        latestLeft = defaultHand("left")
        latestRight = defaultHand("right")
        holdStartMs = null
        bothInTarget = false
    }

    fun update(frame: HandFrame, timestampMs: Double): TrackedHands {
        val detected = frame.hands
        val avgConfidence = if (frame.handedness.isNotEmpty()) {
            frame.handedness.sumOf { it.toDouble() } / frame.handedness.size
        } else 0.0

        // Spatial & temporal hand association
        var rawLeft: List<LandmarkPoint>? = null
        var rawRight: List<LandmarkPoint>? = null
        if (detected.size == 1) {
            val marks = detected[0]
            val palm = getPalmCenterScreen(marks)
            val prevL = history.left
            val prevR = history.right
            val distL = if (prevL.prevPx > 0) abs(palm.x * width - prevL.prevPx) else 9999.0
            val distR = if (prevR.prevPx > 0) abs(palm.x * width - prevR.prevPx) else 9999.0
            if (distL < distR && distL < width * 0.4) {
                rawLeft = marks
            } else if (distR < distL && distR < width * 0.4) {
                rawRight = marks
            } else {
                if (palm.x < 0.5) rawLeft = marks else rawRight = marks
            }
        } else if (detected.size >= 2) {
            val handA = detected[0]
            val handB = detected[1]
            if (getPalmCenterScreen(handA).x < getPalmCenterScreen(handB).x) {
                rawLeft = handA; rawRight = handB
            } else {
                rawLeft = handB; rawRight = handA
            }
        }

        latestLeft = processSide("left", history.left, rawLeft, LEFT_TARGET_AREA, latestLeft, timestampMs)
        latestRight = processSide("right", history.right, rawRight, RIGHT_TARGET_AREA, latestRight, timestampMs)

        // Calibration hold (App.tsx: bothHandsInTarget, 1 s continuous)
        val both = latestLeft.detected && latestLeft.inTargetArea &&
            latestRight.detected && latestRight.inTargetArea
        if (both) {
            if (holdStartMs == null) holdStartMs = timestampMs
        } else {
            holdStartMs = null
        }
        bothInTarget = both

        return TrackedHands(latestLeft, latestRight, avgConfidence, timestampMs)
    }

    /** True once both hands have been detected inside their target areas for 1000 ms without a break. */
    fun isCalibrated(nowMs: Double): Boolean {
        val start = holdStartMs ?: return false
        return bothInTarget && nowMs - start >= HOLD_MS
    }

    fun renderHands(): List<HandRender> = listOf(
        renderSide("left", history.left),
        renderSide("right", history.right),
    )

    private fun renderSide(side: String, h: SideHistory) = HandRender(
        side = side,
        x = h.prevPx,
        y = h.prevPy,
        speed = h.smoothedSpeed,
        vx = h.vx,
        vy = h.vy,
        detected = h.isDetected,
        isPredicted = h.isPredicted,
        gesture = h.gesture,
        marks = h.activeMarks,
        trail = h.trail,
    )

    private fun processSide(
        side: String,
        h: SideHistory,
        raw: List<LandmarkPoint>?,
        area: TargetAreaRect,
        latest: TrackedHand,
        currentTime: Double,
    ): TrackedHand {
        var active: List<LandmarkPoint>? = null
        var predicted = false
        var isDetected = false
        val dt = if (h.prevTime > 0) (currentTime - h.prevTime) / 1000 else 0.016

        if (raw != null) {
            h.consecutiveFrames++
            h.lostFrames = 0
            h.lastRealLandmarks = raw
            active = raw
            isDetected = true
        } else if (h.lastRealLandmarks.isNotEmpty() && h.lostFrames < MAX_PREDICTION_GRACE_FRAMES) {
            h.lostFrames++
            predicted = true
            isDetected = true
            active = extrapolateLandmarks(h.lastRealLandmarks, h.vx, h.vy, dt, width, height, 0.82)
            h.lastRealLandmarks = active
        } else {
            if (h.consecutiveFrames > 0 && h.lostFrames >= MAX_PREDICTION_GRACE_FRAMES) {
                h.trackingLosses++
            }
            h.consecutiveFrames = 0
            h.lostFrames++
        }

        if (active != null && isDetected) {
            val palm = getPalmCenterScreen(active)
            val px = jsRound(palm.x * width)
            val py = jsRound(palm.y * height)

            if (dt > 0.003 && h.prevPx > 0) {
                val dX = px - h.prevPx
                val dY = py - h.prevPy
                val instant = hypot(dX, dY) / dt
                h.instantSpeed = instant
                h.distanceMoved += hypot(dX, dY)
                h.vx = dX / dt
                h.vy = dY / dt
                val alpha = if (instant > 250) 0.65 else 0.35
                val newSpeed = alpha * instant + (1 - alpha) * h.smoothedSpeed
                h.acceleration = (newSpeed - h.prevSpeed) / dt
                h.prevSpeed = h.smoothedSpeed
                h.smoothedSpeed = newSpeed
                if (newSpeed > history.maxSpeed) history.maxSpeed = jsRound(newSpeed)
            }
            h.prevPx = px
            h.prevPy = py
            h.prevTime = currentTime
            h.pushTrail(px, py, currentTime, h.smoothedSpeed)

            val gesture = recognizeHandGesture(active)
            h.activeMarks = active
            h.isDetected = true
            h.isPredicted = predicted
            h.gesture = gesture
            return TrackedHand(
                side = side,
                detected = true,
                screenCenter = Point2D(palm.x, palm.y),
                pixelX = px,
                pixelY = py,
                percentX = jsRound(palm.x * 100),
                percentY = jsRound(palm.y * 100),
                movementSpeed = jsRound(h.smoothedSpeed),
                movementCategory = categorizeSpeed(h.smoothedSpeed),
                landmarks = active,
                inTargetArea = isPointInsideRect(palm, area),
                consecutiveDetectedFrames = h.consecutiveFrames,
                lastSeenTimestamp = currentTime.toLong(),
                gesture = gesture,
                direction = calculateMovementDirection(h.vx, h.vy),
                velocityX = jsRound(h.vx),
                velocityY = jsRound(h.vy),
                acceleration = jsRound(h.acceleration),
                distanceMoved = jsRound(h.distanceMoved),
                isPredicted = predicted,
            )
        }

        h.smoothedSpeed = 0.0
        h.vx = 0.0
        h.vy = 0.0
        h.shiftTrail()
        h.activeMarks = null
        h.isDetected = false
        h.isPredicted = false
        h.gesture = HandGesture.UNKNOWN
        return latest.copy(
            detected = false,
            inTargetArea = false,
            movementSpeed = 0.0,
            movementCategory = "Idle",
            landmarks = emptyList(),
            gesture = HandGesture.UNKNOWN,
            direction = com.aayush.diwaliplay.model.MovementDirection.STATIONARY,
            isPredicted = false,
        )
    }

    private fun defaultHand(side: String): TrackedHand {
        val left = side == "left"
        return TrackedHand(
            side = side,
            screenCenter = Point2D(if (left) 0.25 else 0.75, 0.5),
            percentX = if (left) 25.0 else 75.0,
            percentY = 50.0,
        )
    }
}
