package com.aayush.diwaliplay.tracking.camera

import com.aayush.diwaliplay.model.HandRender
import com.aayush.diwaliplay.tracking.HandFrame
import com.aayush.diwaliplay.tracking.HandTracker
import com.aayush.diwaliplay.tracking.TrackedHands
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val STATUS_INTERVAL_MS = 500L

sealed interface TrackingStatus {
    data object Starting : TrackingStatus

    /**
     * [delegate] is [DELEGATE_GPU] or [DELEGATE_CPU]; values are averages over the last ~0.5 s / 1 s. With no hand
     * tracking it's [DELEGATE_NONE], and Running means the camera has delivered a frame.
     */
    data class Running(val delegate: String, val inferenceMs: Double, val cameraFps: Double) : TrackingStatus

    data class CameraLost(val reason: String) : TrackingStatus

    /**
     * Hands are published empty. After a failure during a run, frames are ignored and start() does
     * nothing, so retrying requires stop() then start(). Only a start() refused for a missing camera
     * permission never began a run; that one can be retried with start() alone.
     *
     * [cameraAlive]: only hand tracking failed. Frames keep coming, for the live background and the photo.
     */
    data class Failed(val reason: String, val cameraAlive: Boolean = false) : TrackingStatus
}

/**
 * One immutable tracking result: the HandTracker output plus its renderHands() drawing data,
 * computed together on the result thread. The render/game threads read this and never touch
 * HandTracker.
 */
data class TrackingSnapshot(
    val hands: TrackedHands,
    val render: List<HandRender>,
    /** HandTracker.isCalibrated at this frame's timestamp. */
    val calibrated: Boolean = false,
)

/**
 * The pipeline's run state and everything that touches [tracker], with no Android dependency.
 * All tracker work and every Running / CameraLost / Failed status change happen on the serial
 * [executor], so a failure or camera loss can't be overwritten by a result queued before it, and
 * empty hands are always the last thing published for that failure. Flags are set synchronously
 * before posting: any result that runs after them is dropped.
 *
 * [begin] and [end] are called from one thread (the main thread); the rest are thread-safe.
 */
internal class TrackingPublisher(
    private val tracker: HandTracker,
    private val executor: Executor,
    private val update: (HandFrame, Double) -> TrackedHands = tracker::update,
    private val log: (String, Throwable?) -> Unit = { _, _ -> },
    private val clock: () -> Long,
) {
    val hands: AtomicReference<TrackingSnapshot> = AtomicReference(emptySnapshot())

    private val _status = MutableStateFlow<TrackingStatus>(TrackingStatus.Starting)
    val status: StateFlow<TrackingStatus> = _status.asStateFlow()

    /** Bumped on every begin/end; work tagged with an older value is ignored. */
    @Volatile private var generation = 0

    /** Highest generation that has failed. Generations only grow, so this needs no reset. */
    private val failedGeneration = AtomicInteger(-1)
    @Volatile private var cameraLost = false
    @Volatile private var frameReportedGeneration = -1

    // Executor-only state.
    private var lastStatusAt = 0L
    private var inferenceSum = 0.0
    private var inferenceCount = 0

    fun begin(): Int {
        val gen = ++generation
        cameraLost = false
        _status.value = TrackingStatus.Starting
        return gen
    }

    fun end() {
        generation++
        executor.execute { publishEmpty() }
    }

    fun isCurrent(gen: Int): Boolean = gen == generation

    fun acceptsFrames(gen: Int): Boolean = gen == generation && !isFailed(gen) && !cameraLost

    /** The camera is delivering, whatever has become of hand tracking. A camera failure is the pipeline's to add. */
    fun cameraAlive(gen: Int): Boolean = gen == generation && !cameraLost

    private fun isFailed(gen: Int) = failedGeneration.get() >= gen

    /** A run with no hand tracking got a frame: it's ready. Once per run, and again if the camera comes back. */
    fun onCameraFrame(gen: Int, cameraFps: Double) {
        if (frameReportedGeneration == gen || !acceptsFrames(gen)) return
        frameReportedGeneration = gen
        executor.execute {
            if (acceptsFrames(gen)) _status.value = TrackingStatus.Running(DELEGATE_NONE, 0.0, cameraFps)
        }
    }

    fun onResult(gen: Int, frame: HandFrame, timestampMs: Long, delegate: String, frameW: Int, frameH: Int, cameraFps: Double) {
        if (gen != generation) return
        val inferenceMs = (clock() - timestampMs).coerceAtLeast(0L).toDouble()
        executor.execute {
            if (!acceptsFrames(gen)) return@execute
            try {
                val cropped = if (frameW > 0 && frameH > 0) {
                    HandFrame(frame.hands.map { cropToSixteenNine(it, frameW, frameH) }, frame.handedness)
                } else frame
                val tracked = update(cropped, timestampMs.toDouble())
                hands.set(TrackingSnapshot(tracked, tracker.renderHands(), tracker.isCalibrated(timestampMs.toDouble())))
                reportRunning(delegate, inferenceMs, cameraFps)
            } catch (t: Throwable) {
                log("tracking update failed", t)
                fail(gen, "tracking failed: ${t.message ?: t.javaClass.simpleName}", cameraAlive = true)
            }
        }
    }

    /**
     * Failed plus one publish of empty hands, for the first failure of [gen] only. Returns true if
     * this call took effect, false if [gen] is stale or has already failed.
     */
    fun fail(gen: Int, reason: String, cameraAlive: Boolean = false): Boolean {
        if (gen != generation) return false
        if (failedGeneration.getAndUpdate { max(it, gen) } >= gen) return false
        executor.execute {
            if (gen != generation) return@execute // end() publishes for itself
            _status.value = TrackingStatus.Failed(reason, cameraAlive)
            publishEmpty()
        }
        return true
    }

    /** start() refused before a run began; hands are already empty. */
    fun reject(reason: String) {
        _status.value = TrackingStatus.Failed(reason)
    }

    fun onCameraLost(reason: String) {
        val gen = generation
        if (cameraLost || isFailed(gen)) return
        cameraLost = true
        frameReportedGeneration = -1
        executor.execute {
            if (gen != generation || isFailed(gen)) return@execute
            _status.value = TrackingStatus.CameraLost(reason)
            publishEmpty()
        }
    }

    fun onCameraOpen() {
        cameraLost = false
    }

    private fun reportRunning(delegate: String, inferenceMs: Double, cameraFps: Double) {
        inferenceSum += inferenceMs
        inferenceCount++
        val now = clock()
        if (lastStatusAt == 0L || now - lastStatusAt >= STATUS_INTERVAL_MS) {
            _status.value = TrackingStatus.Running(delegate, inferenceSum / inferenceCount, cameraFps)
            inferenceSum = 0.0
            inferenceCount = 0
            lastStatusAt = now
        }
    }

    private fun publishEmpty() {
        lastStatusAt = 0L
        inferenceSum = 0.0
        inferenceCount = 0
        try {
            tracker.reset()
            val tracked = tracker.update(HandFrame(emptyList(), emptyList()), 0.0)
            hands.set(TrackingSnapshot(tracked, tracker.renderHands()))
        } catch (t: Throwable) {
            log("tracker reset failed", t)
            hands.set(emptySnapshot())
        }
    }

    private companion object {
        /** All-not-detected snapshot from a throwaway tracker (the real one is executor-only). */
        fun emptySnapshot(): TrackingSnapshot {
            val t = HandTracker()
            return TrackingSnapshot(t.update(HandFrame(emptyList(), emptyList()), 0.0), t.renderHands())
        }
    }
}
