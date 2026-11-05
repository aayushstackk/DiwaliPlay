package com.aayush.diwaliplay.tracking.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.annotation.MainThread
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import com.aayush.diwaliplay.tracking.HandFrame
import com.aayush.diwaliplay.tracking.HandTracker
import com.google.mediapipe.tasks.vision.core.RunningMode
import java.io.ByteArrayOutputStream
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.flow.StateFlow

private const val TAG = "TrackingPipeline"

/** Same JPEG quality as the web's camera snapshot (src/App.tsx, toDataURL 0.92). */
private const val STILL_JPEG_QUALITY = 92

/**
 * Frames that may fail in a row before the run fails: about 0.5 s at 30 fps, which also caps how
 * long stale hands stay published. Single failures are dropped, as the web does.
 */
internal const val MAX_CONSECUTIVE_FRAME_FAILURES = 15

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
 * One camera frame as the analysis stream delivered it: unmirrored, needing [rotationDegrees] to be upright.
 * The bitmap is shared and must not be mutated or recycled.
 */
class CameraFrame(val bitmap: Bitmap, val rotationDegrees: Int)

/**
 * What happens to one analysis frame, apart from Android's types. The frame is kept for the live background and the
 * photo before anything to do with hands, so neither depends on the landmarker: not on its having started, and not on
 * its having failed. Only a dead camera stops frames.
 */
internal class FrameRoute<F>(
    private val trackHands: Boolean,
    private val cameraAlive: () -> Boolean,
    private val readyToDetect: () -> Boolean,
    private val store: (F) -> Unit,
    private val onCameraFrame: () -> Unit,
    private val detect: (F) -> Unit,
) {
    /** A run with no hand tracking never builds a landmarker. */
    val wantsLandmarker: Boolean get() = trackHands

    fun onFrame(decode: () -> F) {
        if (!cameraAlive()) return
        val frame = decode()
        store(frame)
        if (!trackHands) onCameraFrame() else if (readyToDetect()) detect(frame)
    }
}

/**
 * Camera → MediaPipe (LIVE_STREAM) → [HandTracker] → [hands]; or, for a run that doesn't track hands, camera frames only.
 *
 * Threading:
 * - [start] / [stop]: main thread (CameraX binding). Both are idempotent. The owner's ON_DESTROY
 *   also stops the pipeline.
 * - analysis thread ("tracking-analysis"): CameraX analyzer, landmarker create / detectAsync / close.
 * - MediaPipe result thread: only hands the converted [HandFrame] to the result thread.
 * - result thread ("tracking-result"): the ONLY thread that calls [tracker] after construction. See
 *   [TrackingPublisher].
 * - [captureStill]: any thread.
 *
 * Landmarks reach HandTracker raw (it mirrors x itself); only the preview and the still are
 * mirrored. Non-16:9 frames (the 640×480 fallback) go through [cropToSixteenNine]. Results that
 * arrive after [stop] (or from a previous start) are dropped. A frame that fails is dropped; after
 * [MAX_CONSECUTIVE_FRAME_FAILURES] in a row, or on an unrecoverable landmarker or tracker error,
 * hand tracking ends as [TrackingStatus.Failed] with empty hands, never an uncaught exception, while
 * the camera carries on supplying [latestFrame] and [captureStill] ([TrackingStatus.Failed.cameraAlive]).
 * Call stop() then start() to retry.
 */
class TrackingPipeline(
    context: Context,
    private val lifecycleOwner: LifecycleOwner,
    tracker: HandTracker,
    private val preferGpu: Boolean = true,
) {
    private val appContext = context.applicationContext

    // One serial executor each for the pipeline's lifetime, so a stop() followed at once by start()
    // can't overlap old and new work on the landmarker or tracker. Idle threads exit on their own.
    private val analysisExecutor = serialExecutor("tracking-analysis")
    private val resultExecutor = serialExecutor("tracking-result")

    private val publisher = TrackingPublisher(
        tracker,
        resultExecutor,
        log = { message, t -> Log.e(TAG, message, t) },
        clock = SystemClock::uptimeMillis,
    )

    /** Latest snapshot. Renamed from the brief's AtomicReference<TrackedHands> (ruling 3). */
    val hands: AtomicReference<TrackingSnapshot> get() = publisher.hands

    /** Stays at its last value after [stop]; the next [start] emits Starting. */
    val status: StateFlow<TrackingStatus> get() = publisher.status

    private val camera = CameraController(appContext, lifecycleOwner, publisher::onCameraOpen, ::onCameraLost)

    // Main-thread state.
    private var running = false
    private val destroyObserver = LifecycleEventObserver { _, event ->
        if (event == Lifecycle.Event.ON_DESTROY) stop()
    }

    @Volatile private var frameW = 0
    @Volatile private var frameH = 0
    @Volatile private var cameraFps = 0.0

    /** This run's camera failed outright, as opposed to being lost for a while or hand tracking failing. */
    @Volatile private var cameraDead = false
    @Volatile private var trackHands = true

    /** Delegate of the live landmarker, mirrored from the analysis thread for the result path. */
    @Volatile private var activeDelegate: String? = null

    private val latestFrame = AtomicReference<CameraFrame?>(null)

    // Analysis-thread state.
    private var landmarker: LandmarkerHost? = null
    private val timestamps = MonotonicTimestamp()
    private var fpsWindowStart = 0L
    private var fpsWindowFrames = 0
    private var consecutiveFrameFailures = 0

    /** Test seam: can't revoke a permission from an instrumented test without killing its process. */
    internal var hasCameraPermission: () -> Boolean = {
        ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }

    /** Test seam: runs on the analysis thread just before each detect, to inject a failure. */
    @Volatile internal var beforeDetect: (() -> Unit)? = null

    /**
     * Does nothing while a run is in progress, and that includes a run that has reached
     * [TrackingStatus.Failed]: to retry after Failed, call [stop] then start.
     *
     * Emits Failed("camera permission denied") and does not begin a run when CAMERA isn't granted,
     * so that case alone can be retried with start.
     *
     * [trackHands] false is for rounds that don't use hands (touch mode): no landmarker is built, frames still reach
     * [latestFrame] and [captureStill], [hands] stays empty, and [status] goes to Running with [DELEGATE_NONE] on the
     * first camera frame. The mode lasts for the run: it's ignored if one is already in progress.
     */
    @MainThread
    fun start(showPreview: PreviewView?, trackHands: Boolean = true) {
        checkMain()
        if (running) return
        if (!hasCameraPermission()) {
            publisher.reject("camera permission denied")
            return
        }
        running = true
        this.trackHands = trackHands
        cameraDead = false
        val gen = publisher.begin()
        cameraFps = 0.0
        val route = routeFor(gen, trackHands)
        lifecycleOwner.lifecycle.addObserver(destroyObserver)
        analysisExecutor.execute {
            fpsWindowStart = 0L
            fpsWindowFrames = 0
            consecutiveFrameFailures = 0
            if (route.wantsLandmarker) createLandmarker(gen)
        }
        camera.bind(showPreview, analysisExecutor, { image -> analyze(gen, route, image) }) { reason ->
            failCamera(gen, reason, null)
        }
    }

    @MainThread
    fun stop() {
        checkMain()
        if (!running) return
        running = false
        lifecycleOwner.lifecycle.removeObserver(destroyObserver)
        camera.unbind()
        publisher.end()
        clearStill()
        analysisExecutor.execute { closeLandmarker() }
    }

    /**
     * Latest analysis frame for drawing a live background, or null when there is none. A new instance per frame,
     * so comparing references tells whether it changed. Any thread.
     */
    fun latestFrame(): CameraFrame? = latestFrame.get()

    /** Mirrored JPEG (quality 92) of the latest analysis frame, upright; null if there is none or it fails. */
    fun captureStill(): ByteArray? {
        val still = latestFrame.get() ?: return null
        return try {
            val src = still.bitmap
            val m = Matrix().apply {
                postRotate(still.rotationDegrees.toFloat())
                postScale(-1f, 1f)
            }
            val out = Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
            ByteArrayOutputStream().use { bos ->
                out.compress(Bitmap.CompressFormat.JPEG, STILL_JPEG_QUALITY, bos)
                if (out !== src) out.recycle()
                bos.toByteArray()
            }
        } catch (t: Throwable) {
            Log.e(TAG, "captureStill failed", t)
            null
        }
    }

    /** Hand tracking is over, but the camera isn't: the photo and live background carry on. A run without hands has only the camera to fail. */
    private fun fail(gen: Int, reason: String, cause: Throwable?) {
        if (!trackHands) {
            failCamera(gen, reason, cause)
            return
        }
        Log.e(TAG, reason, cause)
        publisher.fail(gen, reason, cameraAlive = true)
    }

    private fun failCamera(gen: Int, reason: String, cause: Throwable?) {
        Log.e(TAG, reason, cause)
        if (!publisher.isCurrent(gen)) return
        cameraDead = true
        publisher.fail(gen, reason)
        clearStill()
    }

    /** Now, and again after any frame already on the analysis thread (the frame gate then stops new ones). */
    private fun clearStill() {
        latestFrame.set(null)
        analysisExecutor.execute { latestFrame.set(null) }
    }

    // ---- analysis thread ----

    private fun createLandmarker(gen: Int) {
        if (!publisher.isCurrent(gen)) return
        closeLandmarker()
        try {
            val host = LandmarkerHost.create(
                appContext,
                RunningMode.LIVE_STREAM,
                preferGpu = preferGpu,
                listener = { frame, ts -> onLandmarkerResult(gen, frame, ts) },
                onError = { e -> fail(gen, "landmarker failed: ${e.message}", e) },
            )
            landmarker = host
            activeDelegate = host.delegate
            Log.i(TAG, "landmarker ready on ${host.delegate}")
        } catch (t: Throwable) {
            fail(gen, "landmarker init failed: ${t.message ?: t.javaClass.simpleName}", t)
        }
    }

    private fun closeLandmarker() {
        activeDelegate = null
        landmarker?.close()
        landmarker = null
    }

    private fun routeFor(gen: Int, trackHands: Boolean) = FrameRoute<CameraFrame>(
        trackHands = trackHands,
        cameraAlive = { !cameraDead && publisher.cameraAlive(gen) },
        readyToDetect = { publisher.acceptsFrames(gen) && landmarker != null },
        store = latestFrame::set,
        onCameraFrame = {
            consecutiveFrameFailures = 0
            publisher.onCameraFrame(gen, cameraFps)
        },
        detect = ::detect,
    )

    private fun analyze(gen: Int, route: FrameRoute<CameraFrame>, image: ImageProxy) {
        try {
            route.onFrame {
                countFrame()
                CameraFrame(image.toBitmap(), image.imageInfo.rotationDegrees)
            }
        } catch (e: LandmarkerRebuildException) {
            fail(gen, e.message ?: "landmarker rebuild failed", e)
        } catch (t: Throwable) {
            onFrameFailed(gen, t)
        } finally {
            image.close()
        }
    }

    private fun detect(frame: CameraFrame) {
        val host = landmarker ?: return
        beforeDetect?.invoke()
        val bitmap = frame.bitmap
        val rotation = frame.rotationDegrees
        if (rotation % 180 == 0) {
            frameW = bitmap.width; frameH = bitmap.height
        } else {
            frameW = bitmap.height; frameH = bitmap.width
        }
        host.detectAsync(bitmap, timestamps.next(SystemClock.uptimeMillis()), rotation)
        activeDelegate = host.delegate // detectAsync may have fallen back to CPU
        consecutiveFrameFailures = 0
    }

    /** Drops the frame, like the web's "Inference frame dropped"; only a persistent run of these fails. */
    private fun onFrameFailed(gen: Int, t: Throwable) {
        val failures = ++consecutiveFrameFailures
        val message = t.message ?: t.javaClass.simpleName
        if (failures >= MAX_CONSECUTIVE_FRAME_FAILURES) {
            fail(gen, "detect failed on $failures frames in a row: $message", t)
        } else {
            Log.w(TAG, "frame dropped ($failures/$MAX_CONSECUTIVE_FRAME_FAILURES)", t)
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

    // ---- MediaPipe result thread ----

    private fun onLandmarkerResult(gen: Int, frame: HandFrame, timestampMs: Long) {
        val delegate = activeDelegate ?: return
        publisher.onResult(gen, frame, timestampMs, delegate, frameW, frameH, cameraFps)
    }

    // ---- camera callbacks (main thread) ----

    private fun onCameraLost(reason: String) {
        if (!running) return
        Log.w(TAG, "camera lost: $reason")
        publisher.onCameraLost(reason)
        clearStill()
    }

    private fun checkMain() =
        check(Looper.myLooper() == Looper.getMainLooper()) { "TrackingPipeline.start/stop must run on the main thread" }

    private companion object {
        fun serialExecutor(name: String) = ThreadPoolExecutor(
            1, 1, 5L, TimeUnit.SECONDS, LinkedBlockingQueue(),
        ) { Thread(it, name) }.apply { allowCoreThreadTimeOut(true) }
    }
}
