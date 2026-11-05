package com.aayush.diwaliplay.tracking.camera

import com.google.common.truth.Truth.assertThat
import java.util.ArrayDeque
import java.util.concurrent.Executor
import org.junit.Test

class LandmarkerKeeperTest {
    private class QueueExecutor : Executor {
        val tasks = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { tasks.add(command) }
        fun drain() { while (tasks.isNotEmpty()) tasks.poll()!!.run() }
    }

    private class Host(val id: Int)

    private val buildThread = QueueExecutor()
    private val detectThread = QueueExecutor()
    private var builds = 0
    private var buildFails = false
    private val closed = ArrayList<Int>()
    private val ready = ArrayList<Int>()
    private val failures = ArrayList<Throwable>()

    private val keeper = LandmarkerKeeper<Host>(
        buildThread,
        detectThread,
        build = {
            builds++
            if (buildFails) throw IllegalStateException("no model")
            Host(builds)
        },
        close = { closed += it.id },
    )

    private fun ensure() {
        keeper.ensure({ ready += it.id }, { failures += it })
        buildThread.drain()
        detectThread.drain()
    }

    @Test fun laterRunsReuseTheSameLandmarker() {
        repeat(5) { ensure() }
        assertThat(builds).isEqualTo(1)
        assertThat(ready).containsExactly(1, 1, 1, 1, 1)
        assertThat(closed).isEmpty()
    }

    @Test fun buildingDoesNotHappenOnTheDetectThread() {
        keeper.ensure({ ready += it.id }, { failures += it })
        detectThread.drain() // the detect thread is free to deliver frames all this time
        assertThat(builds).isEqualTo(0)
        assertThat(keeper.host).isNull()
        buildThread.drain()
        assertThat(builds).isEqualTo(1)
        assertThat(keeper.host!!.id).isEqualTo(1)
    }

    @Test fun aBrokenLandmarkerIsNotUsedAndIsReplacedAtTheNextEnsure() {
        ensure()
        keeper.markBroken()
        assertThat(keeper.host).isNull()
        assertThat(closed).isEmpty() // not until the next run wants one
        ensure()
        assertThat(builds).isEqualTo(2)
        assertThat(keeper.host!!.id).isEqualTo(2)
        assertThat(closed).containsExactly(1)
    }

    @Test fun aFailedBuildIsReportedAndTriedAgainNextTime() {
        buildFails = true
        ensure()
        assertThat(failures).hasSize(1)
        assertThat(keeper.host).isNull()
        buildFails = false
        ensure()
        assertThat(keeper.host).isNotNull()
    }

    @Test fun releaseClosesOnTheDetectThreadAndTheNextEnsureRebuilds() {
        ensure()
        keeper.release()
        buildThread.drain()
        assertThat(keeper.host).isNull()
        assertThat(closed).isEmpty()
        detectThread.drain()
        assertThat(closed).containsExactly(1)
        ensure()
        assertThat(builds).isEqualTo(2)
    }

    @Test fun releaseWithNothingKeptDoesNothing() {
        keeper.release()
        buildThread.drain()
        detectThread.drain()
        assertThat(closed).isEmpty()
    }
}

class RunStampsTest {
    @Test fun nothingBelongsBeforeAnyFrame() {
        assertThat(RunStamps().generationOf(10)).isNull()
    }

    @Test fun resultsBelongToTheRunThatSentThem() {
        val runs = RunStamps()
        assertThat(runs.onFrame(1, 100)).isTrue()
        assertThat(runs.onFrame(1, 133)).isTrue()
        assertThat(runs.generationOf(100)).isEqualTo(1)
        assertThat(runs.generationOf(133)).isEqualTo(1)
    }

    @Test fun aLateResultFromAnEarlierRunBelongsToNoOne() {
        val runs = RunStamps()
        runs.onFrame(1, 100)
        runs.onFrame(1, 133)
        runs.onFrame(2, 5_000)
        assertThat(runs.generationOf(133)).isNull()
        assertThat(runs.generationOf(5_000)).isEqualTo(2)
        assertThat(runs.generationOf(5_033)).isEqualTo(2)
    }

    /** Stale, but the publisher drops what isn't the current generation. */
    @Test fun beforeTheNewRunsFirstFrameALateResultKeepsItsOldRun() {
        val runs = RunStamps()
        runs.onFrame(1, 100)
        assertThat(runs.generationOf(100)).isEqualTo(1)
    }

    @Test fun aFrameFromAnOlderRunIsRefused() {
        val runs = RunStamps()
        runs.onFrame(2, 100)
        assertThat(runs.onFrame(1, 133)).isFalse()
        assertThat(runs.generationOf(133)).isEqualTo(2)
    }
}

class GpuProbeMemoTest {
    @Test fun probesOnceAndRemembersYes() {
        val memo = GpuProbeMemo()
        var probes = 0
        repeat(3) { assertThat(memo.usable { probes++; true }).isTrue() }
        assertThat(probes).isEqualTo(1)
    }

    @Test fun remembersNoAndAThrowingProbeIsNo() {
        val memo = GpuProbeMemo()
        var probes = 0
        repeat(3) { assertThat(memo.usable { probes++; throw IllegalStateException("no gpu") }).isFalse() }
        assertThat(probes).isEqualTo(1)
    }

    @Test fun runtimeTroubleOverridesAGoodProbe() {
        val memo = GpuProbeMemo()
        assertThat(memo.usable { true }).isTrue()
        memo.markUnusable()
        assertThat(memo.usable { true }).isFalse()
    }
}
