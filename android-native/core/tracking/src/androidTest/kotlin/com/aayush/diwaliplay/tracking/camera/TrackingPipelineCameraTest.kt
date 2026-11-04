package com.aayush.diwaliplay.tracking.camera

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.tracking.HandTracker
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Smoke test against the device's real (on the emulator: emulated BACK) camera. */
@RunWith(AndroidJUnit4::class)
class TrackingPipelineCameraTest {

    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private class TestOwner : LifecycleOwner {
        val registry = LifecycleRegistry(this)
        override fun getLifecycle(): Lifecycle = registry
    }

    /** CameraX's CameraValidator aborts init if the device declares a lens facing it doesn't have. */
    private fun featuresMatchCameras(): Boolean {
        val context = instrumentation.targetContext
        val cm = context.getSystemService(CameraManager::class.java)
        val facings = cm.cameraIdList.map { cm.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) }
        val pm = context.packageManager
        val front = !pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_FRONT) ||
            CameraCharacteristics.LENS_FACING_FRONT in facings
        val back = !pm.hasSystemFeature(PackageManager.FEATURE_CAMERA) ||
            CameraCharacteristics.LENS_FACING_BACK in facings
        return facings.isNotEmpty() && front && back
    }

    private fun awaitStatus(pipeline: TrackingPipeline, match: (TrackingStatus) -> Boolean): TrackingStatus = runBlocking {
        withTimeout(30_000) { pipeline.status.first { match(it) || it is TrackingStatus.Failed } }
    }

    private fun awaitNoHands(pipeline: TrackingPipeline) {
        val deadline = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < deadline && pipeline.hands.get().hands.timestampMs != 0.0) Thread.sleep(20)
        val snap = pipeline.hands.get()
        assertThat(snap.hands.timestampMs).isEqualTo(0.0)
        assertThat(snap.hands.left.detected).isFalse()
        assertThat(snap.hands.right.detected).isFalse()
        assertThat(snap.render.any { it.detected }).isFalse()
    }

    @Test
    fun startRunsCaptureStillAndStopIsIdempotent() {
        val context = instrumentation.targetContext
        instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.CAMERA)
        assumeTrue("CameraX refuses to init: declared camera features don't match the cameras", featuresMatchCameras())
        val owner = TestOwner()
        lateinit var pipeline: TrackingPipeline
        instrumentation.runOnMainSync {
            owner.registry.currentState = Lifecycle.State.RESUMED
            pipeline = TrackingPipeline(context, owner, HandTracker())
            pipeline.start(null)
            pipeline.start(null) // idempotent
        }
        val running = awaitStatus(pipeline) { it is TrackingStatus.Running }
        Log.i("TrackingPipelineCameraTest", "status=$running")
        assertThat(running).isInstanceOf(TrackingStatus.Running::class.java)
        running as TrackingStatus.Running
        assertThat(running.delegate).isAnyOf(DELEGATE_GPU, DELEGATE_CPU)

        val jpeg = pipeline.captureStill()
        assertThat(jpeg).isNotNull()
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(jpeg, 0, jpeg!!.size, bounds)
        Log.i("TrackingPipelineCameraTest", "still ${bounds.outWidth}x${bounds.outHeight}")
        assertThat(bounds.outWidth).isGreaterThan(0)

        // Review Focus 1: camera closing mid-run gives CameraLost and empty hands.
        instrumentation.runOnMainSync { owner.registry.currentState = Lifecycle.State.CREATED }
        val lost = awaitStatus(pipeline) { it is TrackingStatus.CameraLost }
        Log.i("TrackingPipelineCameraTest", "lost=$lost")
        assertThat(lost).isInstanceOf(TrackingStatus.CameraLost::class.java)
        awaitNoHands(pipeline)

        // ...and tracking resumes when the camera comes back.
        instrumentation.runOnMainSync { owner.registry.currentState = Lifecycle.State.RESUMED }
        assertThat(awaitStatus(pipeline) { it is TrackingStatus.Running }).isInstanceOf(TrackingStatus.Running::class.java)

        instrumentation.runOnMainSync {
            pipeline.stop()
            pipeline.stop() // idempotent
        }
        assertThat(pipeline.captureStill()).isNull()
        awaitNoHands(pipeline)

        // Restart straight after stop works.
        instrumentation.runOnMainSync { pipeline.start(null) }
        assertThat(awaitStatus(pipeline) { it is TrackingStatus.Running }).isInstanceOf(TrackingStatus.Running::class.java)
        instrumentation.runOnMainSync {
            pipeline.stop()
            owner.registry.currentState = Lifecycle.State.DESTROYED
        }
    }
}
