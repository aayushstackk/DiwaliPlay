package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.model.TrackedHand
import com.aayush.diwaliplay.tracking.TrackedHands
import com.aayush.diwaliplay.tracking.camera.CameraFrame
import com.aayush.diwaliplay.tracking.camera.TrackingSnapshot
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Scripted [TrackingSource]: [holdHandsInBoxes] reports both hands in their target boxes (and calibrated, as
 * HandTracker would after 1 s); [moveFast] sweeps them at speed. No camera or MediaPipe involved.
 */
class FakeTrackingPipeline : TrackingSource {
    private val _status = MutableStateFlow<TrackingStatus>(TrackingStatus.Starting)
    override val status: StateFlow<TrackingStatus> = _status

    @Volatile var snapshotValue = snapshot(detected = false, inBoxes = false, calibrated = false)
    @Volatile var running = false
    @Volatile var starts = 0
    @Volatile var stops = 0
    @Volatile var still: ByteArray? = byteArrayOf(1, 2, 3)

    /** False: [start] stays at Starting until [becomeReady], as a real camera does while it opens. */
    @Volatile var startsReady = true

    override fun snapshot(): TrackingSnapshot = snapshotValue
    override fun latestFrame(): CameraFrame? = null
    override fun captureStill(): ByteArray? = still

    override fun start() {
        if (running) return
        running = true
        starts++
        _status.value = if (startsReady) RUNNING else TrackingStatus.Starting
    }

    override fun stop() {
        if (!running) return
        running = false
        stops++
    }

    fun emit(status: TrackingStatus) { _status.value = status }

    fun becomeReady() = emit(RUNNING)

    fun holdHandsInBoxes() { snapshotValue = snapshot(detected = true, inBoxes = true, calibrated = true) }

    /** Hands moving at speed, the left one at ([x], [y]) and the right on the far side of the screen. */
    fun moveFast(x: Double, y: Double = 500.0) {
        snapshotValue = TrackingSnapshot(
            TrackedHands(
                TrackedHand(side = "left", detected = true, pixelX = x, pixelY = y, movementSpeed = 2600.0),
                TrackedHand(side = "right", detected = true, pixelX = 1920.0 - x, pixelY = y, movementSpeed = 2600.0),
                1.0, 0.0,
            ),
            emptyList(),
        )
    }

    private companion object {
        val RUNNING = TrackingStatus.Running("CPU", 5.0, 30.0)
    }

    private fun snapshot(detected: Boolean, inBoxes: Boolean, calibrated: Boolean) = TrackingSnapshot(
        TrackedHands(
            TrackedHand(side = "left", detected = detected, pixelX = 480.0, pixelY = 540.0, inTargetArea = inBoxes),
            TrackedHand(side = "right", detected = detected, pixelX = 1440.0, pixelY = 540.0, inTargetArea = inBoxes),
            1.0, 0.0,
        ),
        emptyList(),
        calibrated,
    )
}
