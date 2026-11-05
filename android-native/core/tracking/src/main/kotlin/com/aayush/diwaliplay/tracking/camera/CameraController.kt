package com.aayush.diwaliplay.tracking.camera

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import android.util.Log
import android.util.Range
import android.util.Size
import androidx.annotation.MainThread
import androidx.camera.camera2.Camera2Config
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.CameraXConfig
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "CameraController"

/**
 * CameraX binding for tracking (spec §5): the first available camera of any lens facing (the WAF's
 * built-in camera reports BACK; a USB camera reports EXTERNAL; front-facing is never required),
 * an RGBA_8888 [ImageAnalysis] with KEEP_ONLY_LATEST at 1280×720 (else 640×480) and a 30 fps
 * target range, plus a [Preview] only when a [PreviewView] is given.
 *
 * Main thread only. [onCameraLost] fires on camera errors, and on a closed / pending state after
 * the camera had opened; [onCameraOpen] fires each time it reaches OPEN.
 */
internal class CameraController(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val onCameraOpen: () -> Unit,
    private val onCameraLost: (String) -> Unit,
) {
    private var provider: ProcessCameraProvider? = null
    private var useCases: List<UseCase> = emptyList()
    private var camera: Camera? = null
    private var stateObserver: Observer<CameraState>? = null
    private var bindToken = 0

    @MainThread
    fun bind(
        previewView: PreviewView?,
        analysisExecutor: Executor,
        analyzer: ImageAnalysis.Analyzer,
        onFailure: (String) -> Unit,
    ) {
        val token = ++bindToken
        configureCameraXOnce()
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            if (token != bindToken) return@addListener // unbind() ran first
            try {
                val p = future.get()
                provider = p
                bindNow(p, previewView, analysisExecutor, analyzer)
            } catch (e: Exception) {
                Log.e(TAG, "camera bind failed", e)
                onFailure("camera bind failed: ${e.message ?: e.javaClass.simpleName}")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    @MainThread
    fun unbind() {
        bindToken++
        stateObserver?.let { obs -> camera?.cameraInfo?.cameraState?.removeObserver(obs) }
        stateObserver = null
        useCases.filterIsInstance<ImageAnalysis>().forEach { it.clearAnalyzer() }
        provider?.let { p -> if (useCases.isNotEmpty()) p.unbind(*useCases.toTypedArray()) }
        useCases = emptyList()
        camera = null
    }

    @androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
    private fun bindNow(
        p: ProcessCameraProvider,
        previewView: PreviewView?,
        analysisExecutor: Executor,
        analyzer: ImageAnalysis.Analyzer,
    ) {
        val info = p.availableCameraInfos.firstOrNull() ?: error("no camera available")
        val fps = availableFpsRanges(info).let(::chooseFpsRange)
        val resolution = resolutionSelector()

        val analysisBuilder = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .setResolutionSelector(resolution)
        fps?.let { setFpsRange(Camera2Interop.Extender(analysisBuilder), it) }
        val analysis = analysisBuilder.build().also { it.setAnalyzer(analysisExecutor, analyzer) }

        val cases = mutableListOf<UseCase>(analysis)
        if (previewView != null) {
            val previewBuilder = Preview.Builder().setResolutionSelector(resolution)
            fps?.let { setFpsRange(Camera2Interop.Extender(previewBuilder), it) }
            val preview = previewBuilder.build()
            // A SurfaceView ignores view transforms, so use the TextureView implementation for the mirror.
            previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            previewView.scaleX = -1f
            preview.surfaceProvider = previewView.surfaceProvider
            cases += preview
        }

        val cam = p.bindToLifecycle(lifecycleOwner, info.cameraSelector, *cases.toTypedArray())
        useCases = cases
        camera = cam
        observeState(cam)
        Log.i(TAG, "bound camera ${info.lensFacing} fps=$fps analysis=${analysis.resolutionInfo?.resolution}")
    }

    private fun observeState(cam: Camera) {
        var wasOpen = false
        val obs = Observer<CameraState> { state ->
            val err = state.error
            when {
                err != null -> onCameraLost("camera error ${err.code} (${state.type})")
                state.type == CameraState.Type.OPEN -> { wasOpen = true; onCameraOpen() }
                wasOpen && (state.type == CameraState.Type.CLOSED || state.type == CameraState.Type.PENDING_OPEN) ->
                    onCameraLost("camera ${state.type.name.lowercase()}")
            }
        }
        stateObserver = obs
        // observeForever, not observe(lifecycleOwner): a lifecycle-bound observer goes inactive when the
        // owner stops, which would hide the camera closing and leave stale hands published.
        cam.cameraInfo.cameraState.observeForever(obs)
    }

    private fun resolutionSelector(): ResolutionSelector = ResolutionSelector.Builder()
        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
        .setResolutionStrategy(
            ResolutionStrategy(
                Size(PREFERRED_RESOLUTION.first, PREFERRED_RESOLUTION.second),
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
            ),
        )
        .setResolutionFilter { sizes, _ ->
            orderResolutions(sizes.map { it.width to it.height }).map { Size(it.first, it.second) }
        }
        .build()

    @androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
    private fun availableFpsRanges(info: CameraInfo): List<Pair<Int, Int>> = try {
        Camera2CameraInfo.from(info)
            .getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
            ?.map { it.lower to it.upper }
            .orEmpty()
    } catch (e: IllegalArgumentException) {
        emptyList()
    }

    @androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
    private fun <T> setFpsRange(ext: Camera2Interop.Extender<T>, range: Pair<Int, Int>) {
        ext.setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, Range(range.first, range.second))
    }

    private companion object {
        private val cameraXConfigured = AtomicBoolean(false)

        /**
         * CameraX's CameraValidator aborts init when the device declares a camera feature it has no
         * camera for. The WAF's one player-facing camera reports BACK and may declare camera.front;
         * the TV AVD does exactly that, with no camera.back feature. A limiter with no lens facing
         * makes the validator skip that check and filters no cameras.
         *
         * configureInstance throws IllegalStateException on a second call, hence once per process.
         */
        @androidx.annotation.OptIn(androidx.camera.lifecycle.ExperimentalCameraProviderConfiguration::class)
        fun configureCameraXOnce() {
            if (!cameraXConfigured.compareAndSet(false, true)) return
            try {
                ProcessCameraProvider.configureInstance(
                    CameraXConfig.Builder.fromConfig(Camera2Config.defaultConfig())
                        .setAvailableCamerasLimiter(CameraSelector.Builder().build())
                        .build(),
                )
            } catch (e: IllegalStateException) {
                Log.w(TAG, "CameraX was already configured elsewhere; validator hardening not applied", e)
            }
        }
    }
}
