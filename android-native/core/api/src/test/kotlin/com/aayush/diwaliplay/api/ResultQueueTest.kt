package com.aayush.diwaliplay.api

import com.aayush.diwaliplay.model.*
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class ResultQueueTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun req(id: String) = CompleteSessionRequest(id, 10, 1, 1.0, 0, 0)

    private val okResp = CompleteSessionResponse(true, GameSession("s", "u"), User("u"))

    private class FakeApi(var handler: suspend (CompleteSessionRequest) -> ApiResult<CompleteSessionResponse>) : GameApi {
        val calls = mutableListOf<Pair<String, Long>>()
        var now: () -> Long = { 0 }
        override suspend fun completeSession(req: CompleteSessionRequest): ApiResult<CompleteSessionResponse> {
            calls += req.sessionId to now()
            return handler(req)
        }
        private fun nope(): Nothing = error("unused")
        override suspend fun verifyCode(code: String) = nope()
        override suspend fun startSession(code: String, kioskId: String?) = nope()
        override suspend fun abandonSession(req: AbandonSessionRequest) = nope()
        override suspend fun submitFeedback(sessionId: String, feedback: GameFeedback) = nope()
        override suspend fun getSettings() = nope()
        override suspend fun getBombs() = nope()
        override suspend fun getRewards() = nope()
        override suspend fun spin(req: SpinWheelRequest) = nope()
    }

    private fun TestScope.fake(h: suspend (CompleteSessionRequest) -> ApiResult<CompleteSessionResponse>) =
        FakeApi(h).also { it.now = { currentTime } }

    private fun files(dir: File) = dir.listFiles().orEmpty().filter { it.isFile }

    @Test fun removesFileOnSuccess() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a"))
        assertThat(q.pending.value).isEqualTo(1)
        assertThat(files(dir)).hasSize(1)
        q.start()
        runCurrent()
        assertThat(api.calls.map { it.first }).containsExactly("a")
        assertThat(files(dir)).isEmpty()
        assertThat(q.pending.value).isEqualTo(0)
    }

    @Test fun persistsAcrossInstances() = runTest {
        val dir = tmp.newFolder()
        val q1 = ResultQueue(dir, fake { ApiResult.NetworkError(RuntimeException()) }, backgroundScope)
        q1.enqueue(req("a")); q1.enqueue(req("b"))
        assertThat(files(dir).none { it.name.endsWith(".tmp") }).isTrue()

        val api2 = fake { ApiResult.Success(okResp) }
        val q2 = ResultQueue(dir, api2, backgroundScope)
        assertThat(q2.pending.value).isEqualTo(2)
        q2.start()
        runCurrent()
        assertThat(api2.calls.map { it.first }).containsExactly("a", "b").inOrder()
        assertThat(q2.pending.value).isEqualTo(0)
    }

    @Test fun retriesOnNetworkErrorWithBackoff() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.NetworkError(RuntimeException("down")) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a"))
        q.start()
        runCurrent()
        // 5s, 10s, 20s, 40s, 80s, 160s, 300s (cap), 300s
        advanceTimeBy(5_000 + 10_000 + 20_000 + 40_000 + 80_000 + 160_000 + 300_000 + 300_000 + 1)
        runCurrent()
        assertThat(api.calls.map { it.second }).containsExactly(
            0L, 5_000L, 15_000L, 35_000L, 75_000L, 155_000L, 315_000L, 615_000L, 915_000L,
        ).inOrder()
        assertThat(files(dir)).hasSize(1)
        // recovers, then backoff resets for the next failure
        api.handler = { ApiResult.Success(okResp) }
        advanceTimeBy(300_000)
        runCurrent()
        assertThat(files(dir)).isEmpty()
    }

    @Test fun retriesOn5xx408And429() = runTest {
        for (code in listOf(500, 502, 503, 408, 429)) {
            val dir = tmp.newFolder()
            val api = fake { ApiResult.HttpError(code, "x") }
            val q = ResultQueue(dir, api, backgroundScope)
            q.enqueue(req("a"))
            q.start()
            runCurrent()
            advanceTimeBy(5_001)
            assertThat(api.calls).hasSize(2)
            assertThat(files(dir)).hasSize(1)
        }
    }

    @Test fun dropsPermanent4xx() = runTest {
        for ((code, body) in listOf(
            409 to """{"success":false,"message":"Session already completed."}""",
            400 to """{"success":false,"message":"already completed"}""",
            404 to """{"success":false,"message":"Game session s not found."}""",
            403 to "forbidden",
        )) {
            val dir = tmp.newFolder()
            val api = fake { ApiResult.HttpError(code, body) }
            val q = ResultQueue(dir, api, backgroundScope)
            q.enqueue(req("a"))
            q.start()
            runCurrent()
            assertThat(api.calls).hasSize(1)
            assertThat(files(dir)).isEmpty()
            assertThat(q.pending.value).isEqualTo(0)
            advanceTimeBy(600_000)
            assertThat(api.calls).hasSize(1)
        }
    }

    @Test fun droppedFileDoesNotBlockNext() = runTest {
        val dir = tmp.newFolder()
        val api = fake { if (it.sessionId == "a") ApiResult.HttpError(409, "already") else ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a")); q.enqueue(req("b"))
        q.start()
        runCurrent()
        assertThat(api.calls.map { it.first }).containsExactly("a", "b").inOrder()
        assertThat(files(dir)).isEmpty()
    }

    @Test fun corruptFileIsQuarantinedNotRetried() = runTest {
        val dir = tmp.newFolder()
        File(dir, "0000_bad.json").writeText("{not json")
        val api = fake { ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.start()
        runCurrent()
        advanceTimeBy(600_000)
        assertThat(api.calls).isEmpty()
        assertThat(File(dir, "0000_bad.json.corrupt").exists()).isTrue()
        assertThat(q.pending.value).isEqualTo(0)
    }

    @Test fun transientReadErrorIsRetried() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        var reads = 0
        val q = ResultQueue(dir, api, backgroundScope) { f ->
            if (reads++ == 0) throw java.io.IOException("disk hiccup") else f.readText()
        }
        q.enqueue(req("a"))
        q.start()
        runCurrent()
        assertThat(reads).isEqualTo(1)
        assertThat(api.calls).isEmpty()
        assertThat(files(dir)).hasSize(1) // kept, not deleted or quarantined
        advanceTimeBy(5_001)
        assertThat(api.calls.map { it.first }).containsExactly("a")
        assertThat(api.calls[0].second).isEqualTo(5_000L)
        assertThat(files(dir)).isEmpty()
    }

    @Test fun workerSurvivesThrowingApi() = runTest {
        val dir = tmp.newFolder()
        var first = true
        val api = fake { if (first) { first = false; throw IllegalStateException("boom") } else ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a"))
        q.start()
        runCurrent()
        assertThat(files(dir)).hasSize(1)
        advanceTimeBy(5_001)
        assertThat(api.calls).hasSize(2)
        assertThat(files(dir)).isEmpty()
    }

    @Test fun undecodable2xxCountsAsDelivered() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.NetworkError(UndecodableResponseException(200, "<html>", RuntimeException())) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a")); q.enqueue(req("b"))
        q.start()
        runCurrent()
        assertThat(api.calls.map { it.first }).containsExactly("a", "b").inOrder()
        assertThat(files(dir)).isEmpty()
    }

    @Test fun staleTmpFilesSweptOnInit() = runTest {
        val dir = tmp.newFolder()
        File(dir, "123_x.json.tmp").writeText("partial")
        val q = ResultQueue(dir, fake { ApiResult.Success(okResp) }, backgroundScope)
        assertThat(dir.listFiles().orEmpty().toList()).isEmpty()
        assertThat(q.pending.value).isEqualTo(0)
    }

    @Test fun neverSendsSameFileConcurrently() = runTest {
        val dir = tmp.newFolder()
        var inFlight = 0
        var maxInFlight = 0
        val api = fake {
            inFlight++; maxInFlight = maxOf(maxInFlight, inFlight)
            delay(10_000)
            inFlight--
            ApiResult.Success(okResp)
        }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a"))
        q.start(); q.start() // idempotent
        runCurrent()
        q.enqueue(req("b")) // wakes worker while "a" is in flight
        advanceTimeBy(5_000)
        q.enqueue(req("a2"))
        advanceTimeBy(60_000)
        runCurrent()
        assertThat(maxInFlight).isEqualTo(1)
        assertThat(api.calls.map { it.first }).containsExactly("a", "b", "a2").inOrder()
        assertThat(files(dir)).isEmpty()
    }

    @Test fun enqueueAfterIdleWakesWorker() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.start()
        runCurrent()
        q.enqueue(req("late"))
        runCurrent()
        assertThat(api.calls.map { it.first }).containsExactly("late")
    }

    @Test fun queuedFileRoundTripsRequest() = runTest {
        val dir = tmp.newFolder()
        val gate = CompletableDeferred<Unit>()
        val api = fake { gate.await(); ApiResult.Success(okResp) }
        var seen: CompleteSessionRequest? = null
        val api2 = object : GameApi by api {
            override suspend fun completeSession(req: CompleteSessionRequest): ApiResult<CompleteSessionResponse> {
                seen = req; return ApiResult.Success(okResp)
            }
        }
        val full = CompleteSessionRequest("s9", 500, 12, 4.5, 3, 2, photoData = "data:image/jpeg;base64,AAA",
            wishTitle = "t", feedback = GameFeedback.Good, targetAchieved = true)
        ResultQueue(dir, api, backgroundScope).enqueue(full)
        ResultQueue(dir, api2, backgroundScope).also { it.start() }
        runCurrent()
        assertThat(seen).isEqualTo(full)
    }

    // ---- a head that keeps failing doesn't block what's behind it ------------------------------------------

    @Test fun failingHeadDoesNotBlockLaterFiles() = runTest {
        val dir = tmp.newFolder()
        val api = fake { if (it.sessionId == "a") ApiResult.HttpError(500, "x") else ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a")); q.enqueue(req("b")); q.enqueue(req("c"))
        q.start()
        runCurrent()
        // One pass, no waiting: b and c go at once. a is kept for the next pass.
        assertThat(api.calls).containsExactly("a" to 0L, "b" to 0L, "c" to 0L).inOrder()
        assertThat(q.pending.value).isEqualTo(1)
    }

    @Test fun unreadableHeadDoesNotBlockLaterFiles() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        var unreadable: String? = null
        val q = ResultQueue(dir, api, backgroundScope) { f ->
            if (f.name == unreadable) throw java.io.IOException("bad sector") else f.readText()
        }
        q.enqueue(req("a")); q.enqueue(req("b"))
        unreadable = files(dir).minByOrNull { it.name }!!.name
        q.start()
        runCurrent()
        assertThat(api.calls.map { it.first }).containsExactly("b")
        assertThat(files(dir).map { it.name }).containsExactly(unreadable)
    }

    @Test fun backoffAppliesPerPassNotPerFile() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.NetworkError(RuntimeException("down")) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a")); q.enqueue(req("b"))
        q.start()
        runCurrent()
        advanceTimeBy(5_000 + 10_000 + 1)
        runCurrent()
        assertThat(api.calls).containsExactly(
            "a" to 0L, "b" to 0L,
            "a" to 5_000L, "b" to 5_000L,
            "a" to 15_000L, "b" to 15_000L,
        ).inOrder()
    }

    @Test fun aDeliveryResetsTheBackoff() = runTest {
        val dir = tmp.newFolder()
        var bGoesThrough = false
        val api = fake {
            if (it.sessionId == "b" && bGoesThrough) ApiResult.Success(okResp) else ApiResult.HttpError(503, "x")
        }
        val q = ResultQueue(dir, api, backgroundScope)
        q.enqueue(req("a")); q.enqueue(req("b"))
        q.start()
        runCurrent()
        advanceTimeBy(5_000 + 10_000 + 1) // two failed passes: the next wait would be 20 s
        bGoesThrough = true
        advanceTimeBy(20_000)
        runCurrent()
        assertThat(api.calls.takeLast(2)).containsExactly("a" to 35_000L, "b" to 35_000L).inOrder()
        api.calls.clear()
        advanceTimeBy(5_000)
        runCurrent()
        assertThat(api.calls).containsExactly("a" to 40_000L)
    }

    // ---- durable before the first send ----------------------------------------------------------------------

    @Test fun heldResultIsOnDiskButNotSent() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.start()
        runCurrent()
        q.hold(req("a"))
        assertThat(files(dir)).hasSize(1)
        assertThat(q.pending.value).isEqualTo(1)
        advanceTimeBy(600_000)
        runCurrent()
        assertThat(api.calls).isEmpty()
    }

    @Test fun deliveredHeldResultIsGoneAndNeverSent() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.start()
        val held = q.hold(req("a"))
        held.delivered()
        held.release() // too late: nothing to do
        runCurrent()
        assertThat(files(dir)).isEmpty()
        assertThat(q.pending.value).isEqualTo(0)
        assertThat(api.calls).isEmpty()
    }

    @Test fun releasedHeldResultGoesToTheWorker() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.start()
        runCurrent()
        val held = q.hold(req("a"))
        held.release()
        runCurrent()
        assertThat(api.calls.map { it.first }).containsExactly("a")
        assertThat(files(dir)).isEmpty()
    }

    /** The process died during the first send: nobody holds it in the next one. */
    @Test fun heldResultIsSentByTheNextProcess() = runTest {
        val dir = tmp.newFolder()
        ResultQueue(dir, fake { ApiResult.Success(okResp) }, backgroundScope).hold(req("a"))

        val next = fake { ApiResult.Success(okResp) }
        ResultQueue(dir, next, backgroundScope).start()
        runCurrent()
        assertThat(next.calls.map { it.first }).containsExactly("a")
        assertThat(files(dir)).isEmpty()
    }

    @Test fun heldResultDoesNotHoldUpOthers() = runTest {
        val dir = tmp.newFolder()
        val api = fake { ApiResult.Success(okResp) }
        val q = ResultQueue(dir, api, backgroundScope)
        q.hold(req("held"))
        q.enqueue(req("b"))
        q.start()
        runCurrent()
        assertThat(api.calls.map { it.first }).containsExactly("b")
    }
}
