package com.aayush.diwaliplay.api

import com.aayush.diwaliplay.model.AbandonSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.SpinWheelRequest
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Before
import org.junit.Test

class HttpGameApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: HttpGameApi

    private fun fixture(name: String) =
        checkNotNull(javaClass.getResource("/api/$name")) { "missing $name" }.readText()

    @Before fun setUp() {
        server = MockWebServer().apply { start() }
        api = HttpGameApi({ server.url("/").toString().trimEnd('/') }, OkHttpClient())
    }

    @After fun tearDown() = server.shutdown()

    private fun enqueue(body: String, code: Int = 200) =
        server.enqueue(MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body))

    private fun bodyJson(): JsonObject = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject

    @Test fun verifyCodePostsCodeAndDecodes() = runBlocking<Unit> {
        enqueue(fixture("verify_code_trial.json"))
        val r = api.verifyCode("8536")
        val req = server.takeRequest()
        assertThat(req.method).isEqualTo("POST")
        assertThat(req.path).isEqualTo("/api/kiosk/verify-code")
        assertThat(Json.parseToJsonElement(req.body.readUtf8()).jsonObject["code"]!!.jsonPrimitive.content).isEqualTo("8536")
        assertThat(r).isInstanceOf(ApiResult.Success::class.java)
        assertThat((r as ApiResult.Success).value.isTrial).isTrue()
    }

    @Test fun startSessionBody() = runBlocking<Unit> {
        enqueue("""{"success":true,"session":{"id":"s1","userId":"u1"},"user":{"id":"u1"}}""")
        val r = api.startSession("1234", "kiosk-9")
        val req = server.takeRequest()
        assertThat(req.method).isEqualTo("POST")
        assertThat(req.path).isEqualTo("/api/session/start")
        val b = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
        assertThat(b["code"]!!.jsonPrimitive.content).isEqualTo("1234")
        assertThat(b["kioskId"]!!.jsonPrimitive.content).isEqualTo("kiosk-9")
        assertThat((r as ApiResult.Success).value.session.id).isEqualTo("s1")
    }

    @Test fun startSessionOmitsNullKioskId() = runBlocking<Unit> {
        enqueue("""{"success":true,"session":{"id":"s1","userId":"u1"},"user":{"id":"u1"}}""")
        api.startSession("1234", null)
        assertThat(bodyJson().keys).containsExactly("code")
    }

    @Test fun completeSessionBody() = runBlocking<Unit> {
        enqueue("""{"success":true,"session":{"id":"s1","userId":"u1"},"user":{"id":"u1"}}""")
        val r = api.completeSession(
            CompleteSessionRequest("s1", 120, 9, 3.5, 2, 1, photoData = "data:x", feedback = GameFeedback.Excellent),
        )
        val req = server.takeRequest()
        assertThat(req.method).isEqualTo("POST")
        assertThat(req.path).isEqualTo("/api/session/complete")
        val b = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
        assertThat(b["sessionId"]!!.jsonPrimitive.content).isEqualTo("s1")
        assertThat(b["score"]!!.jsonPrimitive.content).isEqualTo("120")
        assertThat(b["photoData"]!!.jsonPrimitive.content).isEqualTo("data:x")
        assertThat(b["feedback"]!!.jsonPrimitive.content).isEqualTo("Excellent")
        assertThat(r).isInstanceOf(ApiResult.Success::class.java)
    }

    @Test fun abandonSessionBody() = runBlocking<Unit> {
        enqueue("""{"success":true,"session":{"id":"s1"}}""")
        val r = api.abandonSession(AbandonSessionRequest("s1", "timeout"))
        val req = server.takeRequest()
        assertThat(req.path).isEqualTo("/api/session/abandon")
        assertThat(req.method).isEqualTo("POST")
        val b = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
        assertThat(b["reason"]!!.jsonPrimitive.content).isEqualTo("timeout")
        assertThat((r as ApiResult.Success).value.success).isTrue()
    }

    @Test fun submitFeedbackBody() = runBlocking<Unit> {
        enqueue("""{"success":true,"message":"ok","feedback":"Needs Improvement"}""")
        val r = api.submitFeedback("s1", GameFeedback.NeedsImprovement)
        val req = server.takeRequest()
        assertThat(req.path).isEqualTo("/api/session/feedback")
        val b = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
        assertThat(b["sessionId"]!!.jsonPrimitive.content).isEqualTo("s1")
        assertThat(b["feedback"]!!.jsonPrimitive.content).isEqualTo("Needs Improvement")
        assertThat((r as ApiResult.Success).value.feedback).isEqualTo(GameFeedback.NeedsImprovement)
    }

    @Test fun getSettingsFixture() = runBlocking<Unit> {
        enqueue(fixture("settings.json"))
        val r = api.getSettings()
        val req = server.takeRequest()
        assertThat(req.method).isEqualTo("GET")
        assertThat(req.path).isEqualTo("/api/settings")
        assertThat((r as ApiResult.Success).value.settings.brandName).isEqualTo("ItsSpotlight")
    }

    @Test fun getBombsFixture() = runBlocking<Unit> {
        enqueue(fixture("bombs.json"))
        val r = api.getBombs()
        val req = server.takeRequest()
        assertThat(req.method).isEqualTo("GET")
        assertThat(req.path).isEqualTo("/api/bombs")
        assertThat((r as ApiResult.Success).value.bombs).hasSize(4)
    }

    @Test fun getRewardsFixture() = runBlocking<Unit> {
        enqueue(fixture("rewards.json"))
        val r = api.getRewards()
        val req = server.takeRequest()
        assertThat(req.method).isEqualTo("GET")
        assertThat(req.path).isEqualTo("/api/rewards")
        assertThat((r as ApiResult.Success).value.enabled).isTrue()
    }

    @Test fun spinBody() = runBlocking<Unit> {
        enqueue("""{"success":true,"rewardIndex":2,"alreadySpun":false}""")
        val r = api.spin(SpinWheelRequest(sessionId = "s1", playerName = "A"))
        val req = server.takeRequest()
        assertThat(req.method).isEqualTo("POST")
        assertThat(req.path).isEqualTo("/api/rewards/spin")
        val b = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
        assertThat(b["sessionId"]!!.jsonPrimitive.content).isEqualTo("s1")
        assertThat((r as ApiResult.Success).value.rewardIndex).isEqualTo(2)
    }

    @Test fun httpErrorCarriesCodeAndBody() = runBlocking<Unit> {
        enqueue("""{"success":false,"message":"nope"}""", 404)
        val r = api.verifyCode("1")
        assertThat(r).isEqualTo(ApiResult.HttpError(404, """{"success":false,"message":"nope"}"""))
    }

    @Test fun networkErrorIsReturnedNotThrown() = runBlocking<Unit> {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertThat(api.getSettings()).isInstanceOf(ApiResult.NetworkError::class.java)
        server.shutdown()
        assertThat(api.getSettings()).isInstanceOf(ApiResult.NetworkError::class.java)
    }

    @Test fun undecodableSuccessBodyIsNetworkError() = runBlocking<Unit> {
        enqueue("<html>not json</html>")
        val r = api.getSettings()
        assertThat(r).isInstanceOf(ApiResult.NetworkError::class.java)
        assertThat((r as ApiResult.NetworkError).cause).isInstanceOf(UndecodableResponseException::class.java)
    }

    @Test fun slowVerifyReturnsAfterDelay() = runBlocking<Unit> {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json")
                .setBody(fixture("verify_code_trial.json")).setBodyDelay(20, TimeUnit.SECONDS),
        )
        val r = api.verifyCode("8536")
        assertThat(r).isInstanceOf(ApiResult.Success::class.java)
    }
}
