package com.aayush.diwaliplay.tracking.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.annotation.MainThread
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.aayush.diwaliplay.model.HandRender
import com.aayush.diwaliplay.tracking.HandFrame
import com.aayush.diwaliplay.tracking.HandTracker
import com.aayush.diwaliplay.tracking.TrackedHands
import com.google.mediapipe.tasks.vision.core.RunningMode
import java.io.ByteArrayOutputStream
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val TAG = "TrackingPipeline"
private const val STATUS_INTERVAL_MS = 500L
private const val STILL_JPEG_QUALITY = 90

sealed interface TrackingStatus {
    data object Starting : TrackingStatus

    /** [delegate] is [DELEGATE_GPU] or [DELEGATE_CPU]; values are averages over the last ~0.5 s / 1 s. */
    data class Running(val delegate: String, val inferenceMs: Double, val cameraFps: Double) : TrackingStatus

    data class CameraLost(val reason: String) : TrackingStatus
    data class Failed(val reason: String) : TrackingStatus
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

/** Strictly increasing timestamps: a value that doesn't increase becomes last + 1 (as the web does). */
class MonotonicTimestamp {
    private var last = Long.MIN_VALUE

    fun next(nowMs: Long): Long {
        val ts = if (last != Long.MIN_VALUE && nowMs <= last) last + 1 else nowMs
        last = ts
        return ts
    }
}

/**
 * Camera → MediaPipe (LIVE_STREAM) → [HandTracker] → [hands].
 *
 * Threading:
 * - [start] / [stop]: main thread (CameraX binding). Both are idempotent.
 * - analysis thread ("tracking-analysis"): CameraX analyzer, landmarker create / detectAsync / close.
 * - MediaPipe result thread: only hands the converted [HandFrame] to the result thread.
 * - result thread ("tracking-result"): the ONLY thread that calls [tracker] after construction. It
 *   runs HandTracker.update + renderHands + isCalibrated and publishes one [TrackingSnapshot].
 * - [captureStill]: any thread.
 *
 * Landmarks reach HandTracker raw (it mirrors x itself); only the preview and the still are
 * mirrored. Non-16:9 frames (the 640×480 fallback) go through [cropToSixteenNine]. Results that
 * arrive after [stop] (or from a previous start) are dropped.
 */
class TrackingPipeline(
    context: Context,
    lifecycleOwner: LifecycleOwner,
    private val tracker: HandTracker,
    private val preferGpu: Boolean = true,
) {
    private val appContext = context.applicationContext

    /** Latest snapshot. Renamed from the brief's AtomicReference<TrackedHands> (ruling 3). */
    val hands: AtomicReference<TrackingSnapshot> = AtomicReference(emptySnapshot())

    private val _status = MutableStateFlow<TrackingStatus>(TrackingStatus.Starting)

    /** Stays at its last value after [stop]; the next [start] emits Starting. */
    val status: StateFlow<TrackingStatus> = _status.asStateFlow()

    private val camera = CameraController(appContext, lifecycleOwner, ::onCameraOpen, ::onCameraLost)

    // Main-thread state.
    private var running = false

    // One serial executor each for the pipeline's lifetime, so a stop() followed at once by start()
    // can't overlap old and new work on the landmarker or tracker. Idle threads exit on their own.
    private val analysisExecutor = serialExecutor("tracking-analysis")
    private val resultExecutor = serialExecutor("tracking-result")

    /** Bumped on every start/stop; work tagged with an older value is ignored. */
    @Volatile private var generation = 0
    @Volatile private var cameraLost = false
    @Volatile private var frameW = 0
    @Volatile private var frameH = 0
    @Volatile private var cameraFps = 0.0

    /** Delegate of the live landmarker, mirrored from the analysis thread for the result path. */
    @Volatile private var activeDelegate: String? = null

    private class Still(val bitmap: Bitmap, val rotationDegrees: Int)
    private val latestFrame = AtomicReference<Still?>(null)

    // Analysis-thread state.
    private var landmarker: LandmarkerHost? = null
    private val timestamps = MonotonicTimestamp()
    private var fpsWindowStart = 0L
    private var fpsWindowFrames = 0

    // Result-thread state.
    private var lastStatusAt = 0L
    private var inferenceSum = 0.0
    private var inferenceCount = 0

    @MainThread
    fun start(showPreview: PreviewView?) {
        checkMain()
        if (running) return
        running = true
        cameraLost = false
        val gen = ++generation
        _status.value = TrackingStatus.Starting

        cameraFps = 0.0
        analysisExecutor.execute {
            fpsWindowStart = 0L
            fpsWindowFrames = 0
            createLandmarker(gen)
        }
        camera.bind(showPreview, analysisExecutor, { image -> analyze(gen, image) }) { reason ->
            if (gen == generation) _status.value = TrackingStatus.Failed(reason)
        }
    }

    @MainThread
    fun stop() {
        checkMain()
        if (!running) return
        running = false
        generation++
        camera.unbind()
        latestFrame.set(null)
        analysisExecutor.execute { closeLandmarker() }
        resultExecutor.execute { publishEmpty() }
    }

    /** Mirrored JPEG (quality 90) of the latest analysis frame, upright; null before the first frame. */
    fun captureStill(): ByteArray? {
        val still = latestFrame.get() ?: return null
        val src = still.bitmap
        val m = Matrix().apply {
            postRotate(still.rotationDegrees.toFloat())
            postScale(-1f, 1f)
        }
        val out = Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
        return ByteArrayOutputStream().use { bos ->
            out.compress(Bitmap.CompressFormat.JPEG, STILL_JPEG_QUALITY, bos)
            if (out !== src) out.recycle()
            bos.toByteArray()
        }
    }

    // ---- analysis thread ----

    private fun createLandmarker(gen: Int) {
        if (gen != generation) return
        closeLandmarker()
        try {
            landmarker = LandmarkerHost.create(
                appContext,
                RunningMode.LIVE_STREAM,
                preferGpu = preferGpu,
                listener = { frame, ts -> onLandmarkerResult(gen, frame, ts) },
                onError = { e -> Log.e(TAG, "landmarker runtime error", e) },
            )
            activeDelegate = landmarker?.delegate
            Log.i(TAG, "landmarker ready on $activeDelegate")
        } catch (e: Exception) {
            Log.e(TAG, "landmarker init failed", e)
            if (gen == generation) _status.value = TrackingStatus.Failed("landmarker init failed: ${e.message}")
        }
    }

    private fun closeLandmarker() {
        activeDelegate = null
        landmarker?.close()
        landmarker = null
    }

    private fun analyze(gen: Int, image: ImageProxy) {
        try {
            if (gen != generation) return
            countFrame()
            val host = landmarker ?: return
            val rotation = image.imageInfo.rotationDegrees
            val bitmap = image.toBitmap()
            latestFrame.set(Still(bitmap, rotation))
            if (rotation % 180 == 0) {
                frameW = bitmap.width; frameH = bitmap.height
            } else {
                frameW = bitmap.height; frameH = bitmap.width
            }
            val ts = timestamps.next(SystemClock.uptimeMillis())
            try {
                host.detectAsync(bitmap, ts, rotation) // falls back to CPU internally on GPU failure
                activeDelegate = host.delegate
            } catch (e: RuntimeException) {
                Log.e(TAG, "detect failed", e)
                if (gen == generation) _status.value = TrackingStatus.Failed("detect failed: ${e.message}")
            }
        } finally {
            image.close()
        }
    }

    private fun countFrame() {
        val now = SystemClock.uptimeMillis()
        if (fpsWindowStart == 0L) fpsWindowStart = now
        fpsWindowFrames++
        val elapsed = now - fpsWindowStart
        if (elapsed >= 1000) {
            cameraFps = fpsWindowFrames * 1000.0 / elapsed
            fpsWindowStart = now
            fpsWindowFrames = 0
        }
    }

    // ---- MediaPipe result thread → result thread ----

    private fun onLandmarkerResult(gen: Int, frame: HandFrame, timestampMs: Long) {
        if (gen != generation) return
        val delegate = activeDelegate ?: return
        val w = frameW
        val h = frameH
        val inferenceMs = (SystemClock.uptimeMillis() - timestampMs).coerceAtLeast(0L).toDouble()
        resultExecutor.execute {
            if (gen != generation || cameraLost) return@execute
            val cropped = if (w > 0 && h > 0) {
                HandFrame(frame.hands.map { cropToSixteenNine(it, w, h) }, frame.handedness)
            } else frame
            val tracked = tracker.update(cropped, timestampMs.toDouble())
            hands.set(TrackingSnapshot(tracked, tracker.renderHands(), tracker.isCalibrated(timestampMs.toDouble())))
            reportRunning(gen, delegate, inferenceMs)
        }
    }

    // ---- result thread ----

    private fun reportRunning(gen: Int, delegate: String, inferenceMs: Double) {
        inferenceSum += inferenceMs
        inferenceCount++
        val now = SystemClock.uptimeMillis()
        if (lastStatusAt == 0L || now - lastStatusAt >= STATUS_INTERVAL_MS) {
            val avg = inferenceSum / inferenceCount
            inferenceSum = 0.0
            inferenceCount = 0
            lastStatusAt = now
            if (gen == generation && !cameraLost) _status.value = TrackingStatus.Running(delegate, avg, cameraFps)
        }
    }

    private fun publishEmpty() {
        tracker.reset()
        val tracked = tracker.update(HandFrame(emptyList(), emptyList()), 0.0)
        hands.set(TrackingSnapshot(tracked, tracker.renderHands()))
        lastStatusAt = 0L
        inferenceSum = 0.0
        inferenceCount = 0
    }

    // ---- camera callbacks (main thread) ----

    private fun onCameraOpen() {
        if (!running) return
        cameraLost = false
    }

    private fun onCameraLost(reason: String) {
        if (!running || cameraLost) return
        Log.w(TAG, "camera lost: $reason")
        cameraLost = true
        _status.value = TrackingStatus.CameraLost(reason)
        resultExecutor.execute { publishEmpty() }
    }

    private fun checkMain() =
        check(Looper.myLooper() == Looper.getMainLooper()) { "TrackingPipeline.start/stop must run on the main thread" }

    private companion object {
        fun serialExecutor(name: String) = ThreadPoolExecutor(
            1, 1, 5L, TimeUnit.SECONDS, LinkedBlockingQueue(),
        ) { Thread(it, name) }.apply { allowCoreThreadTimeOut(true) }

        /** All-not-detected snapshot from a throwaway tracker (the real one is result-thread only). */
        fun emptySnapshot(): TrackingSnapshot {
            val t = HandTracker()
            val tracked = t.update(HandFrame(emptyList(), emptyList()), 0.0)
            return TrackingSnapshot(tracked, t.renderHands())
        }
    }
}
