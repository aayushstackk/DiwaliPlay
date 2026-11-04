package com.aayush.diwaliplay.tracking.camera

import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.tracking.HandFrame
import com.aayush.diwaliplay.tracking.HandTracker
import com.google.common.truth.Truth.assertThat
import java.util.ArrayDeque
import java.util.concurrent.Executor
import org.junit.Test

class TrackingPublisherTest {

    /** Runs queued work only when told to, so tests control the interleaving. */
    private class ManualExecutor : Executor {
        private val queue = ArrayDeque<Runnable>()
        val pending get() = queue.size
        override fun execute(command: Runnable) { queue.add(command) }
        fun runAll() { while (queue.isNotEmpty()) queue.poll()!!.run() }
    }

    private val executor = ManualExecutor()
    private var now = 1_000L
    private val publisher = TrackingPublisher(HandTracker(), executor, clock = { now })

    /** A plausible 21-point hand with its palm centred on the given raw coordinates. */
    private fun hand(x: Double, y: Double) = List(21) { LandmarkPoint(x, y, 0.0) }
    private val bothHands = HandFrame(listOf(hand(0.75, 0.5), hand(0.25, 0.5)), listOf(0.9f, 0.9f))

    private fun result(gen: Int, ts: Long, frame: HandFrame = bothHands) =
        publisher.onResult(gen, frame, ts, DELEGATE_CPU, 1280, 720, 30.0)

    private fun assertNoHands() {
        val snap = publisher.hands.get()
        assertThat(snap.hands.left.detected).isFalse()
        assertThat(snap.hands.right.detected).isFalse()
        assertThat(snap.render.any { it.detected }).isFalse()
        assertThat(snap.calibrated).isFalse()
    }

    private fun assertBothHands() {
        val snap = publisher.hands.get()
        assertThat(snap.hands.left.detected).isTrue()
        assertThat(snap.hands.right.detected).isTrue()
    }

    @Test
    fun resultsPublishHandsAndRunningStatus() {
        val gen = publisher.begin()
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Starting)
        result(gen, 1_000)
        executor.runAll()
        assertBothHands()
        assertThat(publisher.status.value).isInstanceOf(TrackingStatus.Running::class.java)
    }

    @Test
    fun midRunFailurePublishesEmptyHandsAndFailedStatus() {
        val gen = publisher.begin()
        result(gen, 1_000)
        executor.runAll()
        assertBothHands()

        publisher.fail(gen, "detect failed")
        executor.runAll()

        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Failed("detect failed"))
        assertNoHands()
    }

    @Test
    fun failureBeatsAResultQueuedBeforeIt() {
        val gen = publisher.begin()
        result(gen, 1_000)
        publisher.fail(gen, "detect failed")
        executor.runAll()
        assertNoHands()
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Failed("detect failed"))
    }

    @Test
    fun resultsAfterFailureAreDropped() {
        val gen = publisher.begin()
        publisher.fail(gen, "detect failed")
        executor.runAll()
        result(gen, 1_033)
        executor.runAll()
        assertNoHands()
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Failed("detect failed"))
        assertThat(publisher.acceptsFrames(gen)).isFalse()
    }

    @Test
    fun repeatedFailuresPublishOnceAndKeepTheFirstReason() {
        val gen = publisher.begin()
        publisher.fail(gen, "first")
        publisher.fail(gen, "second")
        assertThat(executor.pending).isEqualTo(1)
        executor.runAll()
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Failed("first"))
    }

    @Test
    fun failReportsWhetherItTookEffect() {
        val old = publisher.begin()
        publisher.end()
        val gen = publisher.begin()
        assertThat(publisher.fail(old, "stale")).isFalse()
        assertThat(publisher.fail(gen, "first")).isTrue()
        assertThat(publisher.fail(gen, "second")).isFalse()
    }

    @Test
    fun failureFromAnOlderRunIsIgnored() {
        val old = publisher.begin()
        publisher.end()
        val gen = publisher.begin()
        executor.runAll()
        publisher.fail(old, "stale")
        executor.runAll()
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Starting)
        assertThat(publisher.acceptsFrames(gen)).isTrue()
    }

    @Test
    fun restartAfterFailureRecovers() {
        val first = publisher.begin()
        publisher.fail(first, "detect failed")
        publisher.end()
        val gen = publisher.begin()
        executor.runAll()
        assertThat(publisher.acceptsFrames(gen)).isTrue()
        result(gen, 2_000)
        executor.runAll()
        assertBothHands()
        assertThat(publisher.status.value).isInstanceOf(TrackingStatus.Running::class.java)
    }

    @Test
    fun cameraLostBeatsAQueuedResultThenResumes() {
        val gen = publisher.begin()
        result(gen, 1_000)
        executor.runAll()
        result(gen, 1_033)
        publisher.onCameraLost("camera closed")
        executor.runAll()
        assertNoHands()
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.CameraLost("camera closed"))
        assertThat(publisher.acceptsFrames(gen)).isFalse()

        publisher.onCameraOpen()
        assertThat(publisher.acceptsFrames(gen)).isTrue()
        result(gen, 2_000)
        executor.runAll()
        assertBothHands()
        assertThat(publisher.status.value).isInstanceOf(TrackingStatus.Running::class.java)
    }

    @Test
    fun cameraLostDoesNotOverwriteFailed() {
        val gen = publisher.begin()
        publisher.fail(gen, "detect failed")
        publisher.onCameraLost("camera closed")
        executor.runAll()
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Failed("detect failed"))
    }

    @Test
    fun exceptionWhileProcessingAResultBecomesFailedInsteadOfEscaping() {
        val real = HandTracker()
        val throwing = TrackingPublisher(
            real,
            executor,
            update = { _, _ -> throw IllegalStateException("boom") },
            clock = { now },
        )
        val gen = throwing.begin()
        throwing.onResult(gen, bothHands, 1_000, DELEGATE_CPU, 1280, 720, 30.0)
        executor.runAll() // must not throw
        assertThat(throwing.status.value).isInstanceOf(TrackingStatus.Failed::class.java)
        assertThat(throwing.hands.get().hands.left.detected).isFalse()
    }

    @Test
    fun resultsAfterEndAreDroppedAndEndPublishesEmpty() {
        val gen = publisher.begin()
        result(gen, 1_000)
        executor.runAll()
        publisher.end()
        result(gen, 1_033)
        executor.runAll()
        assertNoHands()
    }

    @Test
    fun rejectSetsFailedWithoutARun() {
        publisher.reject("camera permission denied")
        assertThat(publisher.status.value).isEqualTo(TrackingStatus.Failed("camera permission denied"))
    }
}
