package com.aayush.diwaliplay.tracking.camera

import android.Manifest
import android.graphics.BitmapFactory
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.tracking.HandTracker
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
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

    private fun awaitStatus(pipeline: TrackingPipeline, match: (TrackingStatus) -> Boolean): TrackingStatus = runBlocking {
        withTimeout(30_000) { pipeline.status.first { match(it) || it is TrackingStatus.Failed } }
    }

    /** Stills are cleared on the analysis thread, just after the status changes. */
    private fun awaitNoStill(pipeline: TrackingPipeline) {
        val deadline = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < deadline && pipeline.captureStill() != null) Thread.sleep(20)
        assertThat(pipeline.captureStill()).isNull()
    }

    private fun startedPipeline(owner: TestOwner): TrackingPipeline {
        val context = instrumentation.targetContext
        instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.CAMERA)
        lateinit var pipeline: TrackingPipeline
        instrumentation.runOnMainSync {
            owner.registry.currentState = Lifecycle.State.RESUMED
            pipeline = TrackingPipeline(context, owner, HandTracker())
            pipeline.start(null)
        }
        assertThat(awaitStatus(pipeline) { it is TrackingStatus.Running }).isInstanceOf(TrackingStatus.Running::class.java)
        return pipeline
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
        awaitNoStill(pipeline)

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

    @Test
    fun analysisFailureGivesFailedEmptyHandsAndNoStillWithoutCrashing() {
        val owner = TestOwner()
        val pipeline = startedPipeline(owner)
        pipeline.beforeDetect = { throw IllegalStateException("boom") }

        val failed = awaitStatus(pipeline) { false }
        assertThat(failed).isInstanceOf(TrackingStatus.Failed::class.java)
        assertThat((failed as TrackingStatus.Failed).reason).contains("boom")
        awaitNoHands(pipeline)
        awaitNoStill(pipeline)

        // Terminal until restarted; stop() then start() recovers.
        pipeline.beforeDetect = null
        instrumentation.runOnMainSync { pipeline.stop(); pipeline.start(null) }
        assertThat(awaitStatus(pipeline) { it is TrackingStatus.Running }).isInstanceOf(TrackingStatus.Running::class.java)
        instrumentation.runOnMainSync { pipeline.stop() }
    }

    @Test
    fun missingPermissionGivesFailedAndALaterStartWorks() {
        val context = instrumentation.targetContext
        instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.CAMERA)
        val owner = TestOwner()
        lateinit var pipeline: TrackingPipeline
        instrumentation.runOnMainSync {
            owner.registry.currentState = Lifecycle.State.RESUMED
            pipeline = TrackingPipeline(context, owner, HandTracker())
            pipeline.hasCameraPermission = { false }
            pipeline.start(null)
        }
        assertThat(pipeline.status.value).isEqualTo(TrackingStatus.Failed("camera permission denied"))

        instrumentation.runOnMainSync {
            pipeline.hasCameraPermission = { true }
            pipeline.start(null)
        }
        assertThat(awaitStatus(pipeline) { it is TrackingStatus.Running }).isInstanceOf(TrackingStatus.Running::class.java)
        instrumentation.runOnMainSync { pipeline.stop() }
    }

    @Test
    fun ownerDestroyedWithoutStopStopsThePipeline() {
        val owner = TestOwner()
        val pipeline = startedPipeline(owner)
        instrumentation.runOnMainSync { owner.registry.currentState = Lifecycle.State.DESTROYED }
        awaitNoHands(pipeline)
        awaitNoStill(pipeline)
        // No camera left behind: a new owner can open it straight away.
        val next = TestOwner()
        val nextPipeline = startedPipeline(next)
        instrumentation.runOnMainSync { nextPipeline.stop() }
    }

    @Test
    fun transientFrameFailuresAreDroppedAndOnlyAPersistentRunFails() {
        val owner = TestOwner()
        val pipeline = startedPipeline(owner)
        val limit = MAX_CONSECUTIVE_FRAME_FAILURES

        // limit-1 failures, one good frame, limit-1 more. Without the reset the total would trip it.
        val script = List(limit - 1) { true } + false + List(limit - 1) { true } + false
        val frame = AtomicInteger(0)
        val scriptDone = CountDownLatch(1)
        pipeline.beforeDetect = {
            val i = frame.getAndIncrement()
            if (i >= script.size) scriptDone.countDown()
            else if (script[i]) throw IllegalStateException("transient $i")
        }
        assertThat(scriptDone.await(30, TimeUnit.SECONDS)).isTrue()
        assertThat(pipeline.status.value).isNotInstanceOf(TrackingStatus.Failed::class.java)

        // Tracking really continues: new results keep being published.
        val before = pipeline.hands.get().hands.timestampMs
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline && pipeline.hands.get().hands.timestampMs <= before) Thread.sleep(20)
        assertThat(pipeline.hands.get().hands.timestampMs).isGreaterThan(before)
        assertThat(pipeline.status.value).isInstanceOf(TrackingStatus.Running::class.java)

        // A persistent failure trips on exactly the limit, then publishes empty hands.
        val thrown = AtomicInteger(0)
        pipeline.beforeDetect = {
            thrown.incrementAndGet()
            throw IllegalStateException("persistent")
        }
        val failed = awaitStatus(pipeline) { false }
        assertThat(failed).isInstanceOf(TrackingStatus.Failed::class.java)
        assertThat((failed as TrackingStatus.Failed).reason).contains("persistent")
        awaitNoHands(pipeline)
        awaitNoStill(pipeline)
        assertThat(thrown.get()).isEqualTo(limit)

        pipeline.beforeDetect = null
        instrumentation.runOnMainSync { pipeline.stop() }
    }

    @Test
    fun failedCpuRebuildIsFatalOnTheFirstFrame() {
        val owner = TestOwner()
        val pipeline = startedPipeline(owner)
        val thrown = AtomicInteger(0)
        pipeline.beforeDetect = {
            thrown.incrementAndGet()
            throw LandmarkerRebuildException(IllegalStateException("no cpu"))
        }
        val failed = awaitStatus(pipeline) { false }
        assertThat(failed).isInstanceOf(TrackingStatus.Failed::class.java)
        assertThat((failed as TrackingStatus.Failed).reason).contains("no cpu")
        awaitNoHands(pipeline)
        assertThat(thrown.get()).isEqualTo(1)

        pipeline.beforeDetect = null
        instrumentation.runOnMainSync { pipeline.stop() }
    }
}
