package com.aayush.diwaliplay.tracking.camera

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.tracking.HandFrame
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import java.io.Closeable

private const val TAG = "LandmarkerHost"

/** Delegate names as shown on the performance overlay. */
const val DELEGATE_GPU = "GPU"
const val DELEGATE_CPU = "CPU"

/** A run with no hand tracking, so no landmarker: see [TrackingPipeline.start]. */
const val DELEGATE_NONE = "NONE"

/** Callback for [RunningMode.LIVE_STREAM]. Runs on MediaPipe's own result thread. */
fun interface LiveResultListener {
    /** [timestampMs] is the timestamp passed to [LandmarkerHost.detectAsync] for that frame. */
    fun onResult(frame: HandFrame, timestampMs: Long)
}

/**
 * Owns one MediaPipe [HandLandmarker]: numHands 2, detection/presence/tracking confidence 0.35,
 * model loaded from assets ([MODEL_ASSET_PATH]).
 *
 * GPU first, CPU fallback. Some GPUs (the emulator's, for one) create the GPU delegate fine and
 * then fail on the first inference, so the GPU is accepted only after a probe inference succeeds;
 * the answer is remembered for the process ([GpuProbeMemo]). If the GPU still fails later (a detect
 * call throws, or LIVE_STREAM reports an error), the landmarker is recreated on the CPU: sync detect
 * calls retry the frame; LIVE_STREAM skips the failed frame. That rebuild is the one model load that
 * happens on the detect thread. [delegate] always names the active delegate.
 *
 * Not thread-safe: once built (on any thread), call detect / detectForVideo / detectAsync / close
 * from one thread. A host lives for many runs, so its timestamps must keep increasing across them.
 */
class LandmarkerHost private constructor(
    private val context: Context,
    val runningMode: RunningMode,
    private val modelAssetPath: String,
    private val listener: LiveResultListener?,
    private val onError: ((RuntimeException) -> Unit)?,
) : Closeable {

    private var landmarker: HandLandmarker? = null

    /** [DELEGATE_GPU] or [DELEGATE_CPU]. */
    var delegate: String = DELEGATE_CPU
        private set

    /** Set from MediaPipe's error thread in LIVE_STREAM mode. */
    @Volatile private var liveGpuError = false

    /** IMAGE mode. */
    fun detect(bitmap: Bitmap, rotationDegrees: Int = 0): HandFrame = withGpuFallback {
        it.detect(BitmapImageBuilder(bitmap).build(), options(rotationDegrees)).toHandFrame()
    }

    /** VIDEO mode; [timestampMs] must strictly increase. */
    fun detectForVideo(bitmap: Bitmap, timestampMs: Long, rotationDegrees: Int = 0): HandFrame = withGpuFallback {
        it.detectForVideo(BitmapImageBuilder(bitmap).build(), options(rotationDegrees), timestampMs).toHandFrame()
    }

    /** LIVE_STREAM mode; [timestampMs] must strictly increase. The result arrives on the listener. */
    fun detectAsync(bitmap: Bitmap, timestampMs: Long, rotationDegrees: Int = 0) {
        if (liveGpuError && delegate == DELEGATE_GPU) fallBackToCpu(null)
        val lm = checkNotNull(landmarker) { "closed" }
        try {
            lm.detectAsync(BitmapImageBuilder(bitmap).build(), options(rotationDegrees), timestampMs)
        } catch (e: RuntimeException) {
            if (delegate != DELEGATE_GPU) throw e
            fallBackToCpu(e) // this frame is dropped; the next one goes to the CPU landmarker
        }
    }

    override fun close() {
        closeLandmarker()
    }

    private inline fun <T> withGpuFallback(block: (HandLandmarker) -> T): T {
        val lm = checkNotNull(landmarker) { "closed" }
        return try {
            block(lm)
        } catch (e: RuntimeException) {
            if (delegate != DELEGATE_GPU) throw e
            fallBackToCpu(e)
            block(checkNotNull(landmarker))
        }
    }

    private fun fallBackToCpu(cause: Exception?) {
        Log.w(TAG, "GPU delegate failed at runtime, recreating on CPU", cause)
        gpuProbe.markUnusable()
        closeLandmarker()
        liveGpuError = false
        landmarker = try {
            build(Delegate.CPU)
        } catch (t: Throwable) {
            throw LandmarkerRebuildException(t)
        }
        delegate = DELEGATE_CPU
    }

    private fun closeLandmarker() {
        val lm = landmarker ?: return
        landmarker = null
        try {
            lm.close()
        } catch (e: RuntimeException) {
            Log.w(TAG, "close failed", e)
        }
    }

    private fun init(preferGpu: Boolean) {
        if (preferGpu && gpuProbe.usable(::probeGpu)) {
            try {
                landmarker = build(Delegate.GPU)
                delegate = DELEGATE_GPU
                return
            } catch (e: Throwable) {
                if (e is VirtualMachineError) throw e
                Log.w(TAG, "GPU delegate failed, falling back to CPU", e)
                gpuProbe.markUnusable()
                closeLandmarker()
            }
        }
        landmarker = build(Delegate.CPU)
        delegate = DELEGATE_CPU
    }

    /** One IMAGE-mode GPU inference on a blank frame; false/throws when the GPU can't run the model. */
    private fun probeGpu(): Boolean {
        val probe = buildRaw(Delegate.GPU, RunningMode.IMAGE, null, null)
        val blank = Bitmap.createBitmap(PROBE_SIZE, PROBE_SIZE, Bitmap.Config.ARGB_8888)
        try {
            probe.detect(BitmapImageBuilder(blank).build())
            return true
        } catch (e: RuntimeException) {
            Log.w(TAG, "GPU probe inference failed", e)
            return false
        } finally {
            try {
                probe.close()
            } catch (e: RuntimeException) {
                Log.w(TAG, "GPU probe close failed", e)
            }
            blank.recycle()
        }
    }

    private fun build(delegate: Delegate): HandLandmarker = buildRaw(
        delegate,
        runningMode,
        listener,
        onError = { e ->
            // A GPU error is recovered on the next detectAsync; only unrecoverable ones go to the caller.
            if (delegate == Delegate.GPU) {
                Log.w(TAG, "GPU delegate reported an error", e)
                liveGpuError = true
            } else {
                onError?.invoke(e) ?: Log.e(TAG, "landmarker error", e)
            }
        },
    )

    private fun buildRaw(
        delegate: Delegate,
        mode: RunningMode,
        listener: LiveResultListener?,
        onError: ((RuntimeException) -> Unit)?,
    ): HandLandmarker {
        val base = BaseOptions.builder()
            .setModelAssetPath(modelAssetPath)
            .setDelegate(delegate)
            .build()
        val builder = HandLandmarker.HandLandmarkerOptions.builder()
            .setBaseOptions(base)
            .setRunningMode(mode)
            .setNumHands(NUM_HANDS)
            .setMinHandDetectionConfidence(CONFIDENCE)
            .setMinHandPresenceConfidence(CONFIDENCE)
            .setMinTrackingConfidence(CONFIDENCE)
        if (mode == RunningMode.LIVE_STREAM) {
            builder.setResultListener { result: HandLandmarkerResult, _ ->
                try {
                    listener!!.onResult(result.toHandFrame(), result.timestampMs())
                } catch (e: RuntimeException) {
                    onError?.invoke(e)
                }
            }
            builder.setErrorListener { e -> onError?.invoke(e) }
        }
        return HandLandmarker.createFromOptions(context, builder.build())
    }

    private fun options(rotationDegrees: Int) =
        ImageProcessingOptions.builder().setRotationDegrees(rotationDegrees).build()

    companion object {
        const val MODEL_ASSET_PATH = "models/hand_landmarker.task"
        const val NUM_HANDS = 2
        const val CONFIDENCE = 0.35f
        private const val PROBE_SIZE = 64

        /** For the process, not the host: the probe loads the whole model. */
        private val gpuProbe = GpuProbeMemo()

        /**
         * Creates the landmarker, GPU first unless [preferGpu] is false, then CPU.
         * [listener] is required for LIVE_STREAM; [onError] receives LIVE_STREAM runtime errors that
         * the host can't recover from (GPU ones trigger the CPU fallback instead). Throws if the CPU
         * delegate fails too.
         */
        fun create(
            context: Context,
            runningMode: RunningMode,
            preferGpu: Boolean = true,
            modelAssetPath: String = MODEL_ASSET_PATH,
            listener: LiveResultListener? = null,
            onError: ((RuntimeException) -> Unit)? = null,
        ): LandmarkerHost {
            require(runningMode != RunningMode.LIVE_STREAM || listener != null) {
                "LIVE_STREAM needs a result listener"
            }
            return LandmarkerHost(context.applicationContext ?: context, runningMode, modelAssetPath, listener, onError)
                .also { it.init(preferGpu) }
        }
    }
}

/** The GPU failed and its CPU replacement could not be built, so this host can no longer detect. */
internal class LandmarkerRebuildException(cause: Throwable) :
    RuntimeException("CPU landmarker rebuild failed: ${cause.message ?: cause.javaClass.simpleName}", cause)

/** Raw MediaPipe landmarks (no mirroring) and the top handedness score per hand. */
internal fun HandLandmarkerResult.toHandFrame(): HandFrame = HandFrame(
    hands = landmarks().map { hand -> hand.map { LandmarkPoint(it.x().toDouble(), it.y().toDouble(), it.z().toDouble()) } },
    handedness = handedness().map { it.firstOrNull()?.score() ?: 0f },
)
