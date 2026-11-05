package com.aayush.diwaliplay.kiosk.relay

import android.content.Context
import com.aayush.diwaliplay.branding.ServerConfig
import com.aayush.diwaliplay.kiosk.AdminPin
import com.aayush.diwaliplay.kiosk.SecureStore
import com.aayush.diwaliplay.model.KioskDeviceStatus
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import javax.crypto.KeyGenerator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.ByteString
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

private class FakeKiosk : RelayKiosk {
    var locked = false
    var foreground = true
    var statusFails = false
    val calls = mutableListOf<String>()
    override fun status(): KioskDeviceStatus {
        if (statusFails) throw IllegalStateException("no activity")
        return KioskDeviceStatus(backProtection = locked, appRunning = true, platform = "android")
    }
    override fun enableLock(reason: String) { if (foreground) locked = true; calls += "enable:$reason" }
    override fun disableLock(reason: String) { locked = false; calls += "disable:$reason" }
}

private class FakeSocket(private val req: Request) : WebSocket {
    val sent = mutableListOf<JsonObject>()
    var closed = false
    override fun request() = req
    override fun queueSize() = 0L
    override fun send(text: String): Boolean { sent += Json.parseToJsonElement(text).jsonObject; return true }
    override fun send(bytes: ByteString) = false
    override fun close(code: Int, reason: String?): Boolean { closed = true; return true }
    override fun cancel() { closed = true }
    fun types() = sent.map { it["type"]!!.jsonPrimitive.content }
}

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class RelayClientTest {
    private val app get() = RuntimeEnvironment.getApplication()
    private val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private val store by lazy { SecureStore(app.getSharedPreferences("relay_secure", Context.MODE_PRIVATE)) { key } }
    private val config by lazy { ServerConfig(app.getSharedPreferences("relay_cfg", Context.MODE_PRIVATE)).also { it.apiBaseUrl = "https://example.test" } }
    private val pin by lazy { AdminPin(app.getSharedPreferences("relay_pin", Context.MODE_PRIVATE)).also { it.set("2468") } }
    private val kiosk = FakeKiosk()
    private val servers = mutableListOf<MockWebServer>()

    @After fun down() = servers.forEach { runCatching { it.shutdown() } }

    private fun paired() {
        store.put("relay_device_id", "kiosk_dev_1")
        store.put("relay_device_token", "tok-1")
        store.put("relay_api_base", config.apiBaseUrl)
    }

    /** Virtual time, sockets that never touch a network. [attempts] gets the virtual time of every connect. */
    private inner class Rig(val test: TestScope, failFirst: Int = 0) {
        val sockets = mutableListOf<FakeSocket>()
        val listeners = mutableListOf<WebSocketListener>()
        val attempts = mutableListOf<Long>()
        var failuresLeft = failFirst
        var dropAfterOpen = false
        var stall = false
        val exits = mutableListOf<Long>()
        val dispatcher = StandardTestDispatcher(test.testScheduler)
        val client = RelayClient(
            client = OkHttpClient(), config = config, store = store, kiosk = kiosk, pin = pin,
            scope = test.backgroundScope,
            onTestExit = { exits += test.testScheduler.currentTime },
            main = dispatcher, io = dispatcher,
            clock = { 1_000L + test.testScheduler.currentTime },
            connector = { req, l ->
                attempts += test.testScheduler.currentTime
                val ws = FakeSocket(req)
                sockets += ws; listeners += l
                if (stall) return@RelayClient ws
                if (failuresLeft > 0) {
                    failuresLeft--; l.onFailure(ws, java.io.IOException("down"), null)
                } else {
                    l.onOpen(ws, response(req))
                    if (dropAfterOpen) l.onClosed(ws, 1000, "bye")
                }
                ws
            },
        )
        fun response(req: Request): Response = Response.Builder().request(req).protocol(okhttp3.Protocol.HTTP_1_1).code(101).message("Switching").build()
        fun command(action: String, passcode: String? = null, id: String = "r1") {
            val params = if (passcode != null) ""","params":{"passcode":"$passcode"}""" else ""
            listeners.last().onMessage(sockets.last(), """{"type":"command","requestId":"$id","action":"$action"$params,"timestamp":1}""")
            test.testScheduler.runCurrent()
        }
        /** The server's answer to the first heartbeat: the connection is good from here. */
        fun heartbeatAck() {
            listeners.last().onMessage(sockets.last(), """{"type":"heartbeat_ack","timestamp":1}""")
            test.testScheduler.runCurrent()
        }
        fun ack(): JsonObject = sockets.last().sent.last { it["type"]!!.jsonPrimitive.content == "ack" }
    }

    @Test fun connectsWithIdAndTokenQuery() {
        val server = MockWebServer().also { servers += it }
        val opened = LinkedBlockingQueue<okhttp3.mockwebserver.RecordedRequest?>()
        val messages = LinkedBlockingQueue<String>()
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) { messages += text }
            }),
        )
        server.start()
        config.apiBaseUrl = server.url("/").toString().trimEnd('/')
        paired()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val client = RelayClient(OkHttpClient(), config, store, kiosk, pin, scope, main = Dispatchers.IO)
        try {
            client.start()
            val req = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertThat(req.path).isEqualTo("/ws/kiosk-relay?deviceId=kiosk_dev_1&token=tok-1")
            val first = Json.parseToJsonElement(messages.poll(5, TimeUnit.SECONDS)!!).jsonObject
            assertThat(first["type"]!!.jsonPrimitive.content).isEqualTo("heartbeat")
            assertThat(first["deviceId"]!!.jsonPrimitive.content).isEqualTo("kiosk_dev_1")
        } finally { scope.cancel() }
    }

    @Test fun answersPingWithPong() {
        val server = MockWebServer().also { servers += it }
        val messages = LinkedBlockingQueue<String>()
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) { webSocket.send("""{"type":"ping","timestamp":5}""") }
                override fun onMessage(webSocket: WebSocket, text: String) { messages += text }
            }),
        )
        server.start()
        config.apiBaseUrl = server.url("/").toString().trimEnd('/')
        paired()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            RelayClient(OkHttpClient(), config, store, kiosk, pin, scope, main = Dispatchers.IO).start()
            val seen = generateSequence { messages.poll(5, TimeUnit.SECONDS) }.take(2).map { Json.parseToJsonElement(it).jsonObject["type"]!!.jsonPrimitive.content }.toList()
            assertThat(seen).contains("pong")
        } finally { scope.cancel() }
    }

    @Test fun statusCommandAcksWithAndroidPlatform() {
        val server = MockWebServer().also { servers += it }
        val messages = LinkedBlockingQueue<String>()
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    webSocket.send("""{"type":"command","requestId":"init_status_1","action":"status","timestamp":1}""")
                }
                override fun onMessage(webSocket: WebSocket, text: String) { messages += text }
            }),
        )
        server.start()
        config.apiBaseUrl = server.url("/").toString().trimEnd('/')
        paired()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            RelayClient(OkHttpClient(), config, store, kiosk, pin, scope, main = Dispatchers.IO).start()
            val ack = generateSequence { messages.poll(5, TimeUnit.SECONDS) }.take(3)
                .map { Json.parseToJsonElement(it).jsonObject }.first { it["type"]!!.jsonPrimitive.content == "ack" }
            assertThat(ack["requestId"]!!.jsonPrimitive.content).isEqualTo("init_status_1")
            assertThat(ack["action"]!!.jsonPrimitive.content).isEqualTo("status")
            assertThat(ack["success"]!!.jsonPrimitive.boolean).isTrue()
            val status = ack["status"]!!.jsonObject
            assertThat(status["platform"]!!.jsonPrimitive.content).isEqualTo("android")
            assertThat(status["connected"]!!.jsonPrimitive.boolean).isTrue()
            assertThat(status["appRunning"]!!.jsonPrimitive.boolean).isTrue()
        } finally { scope.cancel() }
    }

    @Test fun heartbeatOnConnectAndEvery20s() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start()
        runCurrent()
        assertThat(rig.sockets.single().types()).containsExactly("heartbeat")
        val hb = rig.sockets.single().sent.single()
        assertThat(hb["status"]!!.jsonObject["platform"]!!.jsonPrimitive.content).isEqualTo("android")
        advanceTimeBy(19_999); runCurrent()
        assertThat(rig.sockets.single().types()).hasSize(1)
        advanceTimeBy(2); runCurrent()
        assertThat(rig.sockets.single().types()).hasSize(2)
        advanceTimeBy(20_000); runCurrent()
        assertThat(rig.sockets.single().types()).hasSize(3)
        assertThat(rig.client.connected.value).isFalse() // not until the server answers
        rig.heartbeatAck()
        assertThat(rig.client.connected.value).isTrue()
    }

    @Test fun reconnectBackoffDoublesToThirty() = runTest {
        paired()
        val rig = Rig(this, failFirst = 7)
        rig.client.start()
        advanceTimeBy(200_000); runCurrent()
        // 0, +2, +4, +8, +16, +30, +30, +30: the eighth attempt succeeds
        assertThat(rig.attempts.take(8)).containsExactly(0L, 2_000L, 6_000L, 14_000L, 30_000L, 60_000L, 90_000L, 120_000L).inOrder()
        rig.heartbeatAck()
        assertThat(rig.client.connected.value).isTrue()
        // a good connection resets the backoff
        rig.listeners.last().onClosed(rig.sockets.last(), 1000, "bye")
        runCurrent()
        assertThat(rig.client.connected.value).isFalse()
        val closedAt = testScheduler.currentTime
        advanceTimeBy(2_001); runCurrent()
        assertThat(rig.attempts.last()).isEqualTo(closedAt + 2_000)
    }

    @Test fun connectionsThatDropBeforeAnAckKeepBackingOff() = runTest {
        paired()
        val rig = Rig(this)
        rig.dropAfterOpen = true
        rig.client.start()
        advanceTimeBy(200_000); runCurrent()
        assertThat(rig.attempts.take(6)).containsExactly(0L, 2_000L, 6_000L, 14_000L, 30_000L, 60_000L).inOrder()
        assertThat(rig.client.connected.value).isFalse()
    }

    @Test fun revokedPairingStopsReconnectingAndSaysSo() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.listeners.last().onClosing(rig.sockets.last(), 4401, "Unauthorized: Invalid device token")
        runCurrent()
        advanceTimeBy(200_000); runCurrent()
        assertThat(rig.sockets).hasSize(1)
        assertThat(rig.client.problem.value).isEqualTo(RelayProblem.Rejected)
        assertThat(rig.client.connected.value).isFalse()
        rig.client.start(); runCurrent() // pairing again (or a restart) clears it and tries afresh
        assertThat(rig.sockets).hasSize(2)
    }

    /** The server never answers an upgrade this way: it's a portal or proxy, which can go away by itself. */
    @Test fun http401Or403OnTheUpgradeBacksOffRatherThanStopping() = runTest {
        for (code in listOf(401, 403)) {
            paired()
            val rig = Rig(this)
            rig.client.start(); runCurrent()
            val response = okhttp3.Response.Builder()
                .request(okhttp3.Request.Builder().url("https://portal.example/").build())
                .protocol(okhttp3.Protocol.HTTP_1_1)
                .code(code)
                .message("no")
                .build()
            rig.listeners.last().onFailure(rig.sockets.last(), java.net.ProtocolException("expected 101"), response)
            runCurrent()
            assertThat(rig.client.problem.value).isNotEqualTo(RelayProblem.Rejected)
            advanceTimeBy(2_001); runCurrent()
            assertThat(rig.sockets).hasSize(2)
            rig.client.stop(); runCurrent()
        }
    }

    @Test fun stalledHandshakeIsCancelledAndRetried() = runTest {
        paired()
        val rig = Rig(this)
        rig.stall = true
        rig.client.start(); runCurrent()
        advanceTimeBy(29_999); runCurrent()
        assertThat(rig.sockets.single().closed).isFalse()
        advanceTimeBy(2); runCurrent()
        assertThat(rig.sockets.first().closed).isTrue()
        rig.stall = false
        advanceTimeBy(2_001); runCurrent()
        assertThat(rig.attempts).containsExactly(0L, 32_000L).inOrder()
    }

    @Test fun anOpenThatArrivesAfterStopCantStickConnected() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        val l = rig.listeners.last(); val s = rig.sockets.last()
        rig.client.stop(); runCurrent()
        l.onOpen(s, rig.response(s.request()))
        l.onMessage(s, """{"type":"heartbeat_ack","timestamp":1}""")
        runCurrent()
        assertThat(rig.client.connected.value).isFalse()
    }

    @Test fun aPairingFromAnotherServerIsNeverUsed() = runTest {
        paired()
        config.apiBaseUrl = "https://other.example"
        val rig = Rig(this)
        rig.client.start()
        advanceTimeBy(60_000); runCurrent()
        assertThat(rig.attempts).isEmpty()
        assertThat(rig.client.problem.value).isEqualTo(RelayProblem.OtherServer)
    }

    @Test fun aStatusThatThrowsStillGetsAnAck() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        kiosk.statusFails = true
        rig.command("status")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isFalse()
        assertThat(rig.ack()["error"]!!.jsonPrimitive.content).isNotEmpty()
    }

    @Test fun enableSaysWhenTheLockIsntActiveYet() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        kiosk.foreground = false
        rig.command("enable")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isTrue()
        assertThat(rig.ack()["message"]!!.jsonPrimitive.content).contains("not active yet")
    }

    @Test fun answersPingWithPongOnAnySocket() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.listeners.last().onMessage(rig.sockets.last(), """{"type":"ping","timestamp":9}""")
        runCurrent()
        assertThat(rig.sockets.last().types()).containsExactly("heartbeat", "pong").inOrder()
    }

    @Test fun statusCommandOverTheWireCarriesRequestId() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.command("status", id = "abc")
        assertThat(rig.ack()["requestId"]!!.jsonPrimitive.content).isEqualTo("abc")
        assertThat(rig.ack()["status"]!!.jsonObject["connected"]!!.jsonPrimitive.boolean).isTrue()
    }

    @Test fun disableWithWrongPasscodeIsRejected() = runTest {
        paired(); kiosk.locked = true
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.command("disable", passcode = "0000")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isFalse()
        assertThat(rig.ack()["error"]!!.jsonPrimitive.content).isEqualTo("Invalid passcode")
        assertThat(kiosk.locked).isTrue()
        assertThat(kiosk.calls).isEmpty()
    }

    @Test fun disableWithRightPasscodeUnlocks() = runTest {
        paired(); kiosk.locked = true
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.command("disable", passcode = "2468")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isTrue()
        assertThat(kiosk.locked).isFalse()
        assertThat(kiosk.calls).containsExactly("disable:Remote relay")
    }

    @Test fun lockedOutPinRefusesEvenTheRightPasscode() = runTest {
        paired(); kiosk.locked = true
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        repeat(5) { rig.command("disable", passcode = "1111", id = "w$it") }
        rig.command("disable", passcode = "2468")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isFalse()
        assertThat(rig.ack()["error"]!!.jsonPrimitive.content).isEqualTo("PIN locked")
        assertThat(rig.ack()["message"]!!.jsonPrimitive.content).contains("15 min")
        assertThat(kiosk.locked).isTrue()
    }

    /** The panel is already signed in; and passcode-less disable is the way out of a forgotten PIN. */
    @Test fun commandWithoutPasscodeIsHonouredAndCostsNoAttempt() = runTest {
        paired(); kiosk.locked = true
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        repeat(5) { rig.command("disable", id = "n$it"); rig.command("enable", passcode = "", id = "e$it") }
        assertThat(kiosk.calls).hasSize(10)
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isTrue()
        // still five tries left: the right PIN works
        rig.command("disable", passcode = "2468")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isTrue()
    }

    @Test fun enableTogglesLock() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.command("enable")
        assertThat(kiosk.locked).isTrue()
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isTrue()
        assertThat(rig.ack()["status"]!!.jsonObject["backProtection"]!!.jsonPrimitive.boolean).isTrue()
        assertThat(rig.ack()["action"]!!.jsonPrimitive.content).isEqualTo("enable")
    }

    @Test fun aLockThatCantBeChangedIsAnsweredNotDropped() = runTest {
        paired()
        val rig = Rig(this)
        val failing = object : RelayKiosk by kiosk {
            override fun enableLock(reason: String) = throw IllegalStateException("No screen to lock")
        }
        val client = RelayClient(OkHttpClient(), config, store, failing, pin, backgroundScope, main = rig.dispatcher, io = rig.dispatcher,
            connector = { req, l -> val ws = FakeSocket(req); rig.sockets += ws; rig.listeners += l; l.onOpen(ws, rig.response(req)); ws })
        client.start(); runCurrent()
        rig.command("enable")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isFalse()
    }

    @Test fun testExitAcksFirstThenExitsAfter500ms() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        val at = testScheduler.currentTime
        rig.command("test-exit")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isTrue()
        assertThat(rig.exits).isEmpty()
        advanceTimeBy(499); runCurrent()
        assertThat(rig.exits).isEmpty()
        advanceTimeBy(2); runCurrent()
        assertThat(rig.exits).containsExactly(at + 500)
    }

    @Test fun garbageAndUnknownMessagesAreIgnored() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        val l = rig.listeners.last(); val s = rig.sockets.last()
        for (junk in listOf("not json", "[]", "null", "{}", """{"type":"zebra"}""", """{"type":7}""", """{"type":"command"}""", """{"type":"command","requestId":5,"action":[]}""", "")) {
            l.onMessage(s, junk)
        }
        l.onMessage(s, okio.ByteString.of(1, 2, 3))
        runCurrent()
        assertThat(s.types()).containsExactly("heartbeat")
        rig.command("status") // still alive
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isTrue()
    }

    @Test fun unknownActionIsRefusedNotIgnored() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.command("self-destruct")
        assertThat(rig.ack()["success"]!!.jsonPrimitive.boolean).isFalse()
    }

    @Test fun unpairedDeviceNeverConnects() = runTest {
        val rig = Rig(this)
        rig.client.start()
        advanceTimeBy(60_000); runCurrent()
        assertThat(rig.attempts).isEmpty()
        assertThat(rig.client.connected.value).isFalse()
    }

    @Test fun unreadableStoreCountsAsUnpaired() = runTest {
        paired()
        val lost = SecureStore(app.getSharedPreferences("relay_secure", Context.MODE_PRIVATE)) { throw java.security.ProviderException("tee") }
        val rig = Rig(this)
        val client = RelayClient(OkHttpClient(), config, lost, kiosk, pin, backgroundScope, main = rig.dispatcher, io = rig.dispatcher, connector = { _, _ -> error("must not connect") })
        client.start()
        advanceTimeBy(10_000); runCurrent()
        assertThat(client.connected.value).isFalse()
    }

    @Test fun stopClosesTheSocketAndStopsReconnecting() = runTest {
        paired()
        val rig = Rig(this)
        rig.client.start(); runCurrent()
        rig.client.stop(); runCurrent()
        assertThat(rig.sockets.single().closed).isTrue()
        assertThat(rig.client.connected.value).isFalse()
        advanceTimeBy(120_000); runCurrent()
        assertThat(rig.sockets).hasSize(1)
    }

    @Test fun socketUrlFollowsTheBaseScheme() {
        assertThat(RelayClient.socketUrl("https://h.example", "d", "t")).isEqualTo("wss://h.example/ws/kiosk-relay?deviceId=d&token=t")
        assertThat(RelayClient.socketUrl("http://10.0.2.2:3001", "d", "t")).isEqualTo("ws://10.0.2.2:3001/ws/kiosk-relay?deviceId=d&token=t")
        assertThat(RelayClient.socketUrl("ftp://h", "d", "t")).isNull()
        assertThat(RelayClient.socketUrl("garbage", "d", "t")).isNull()
        assertThat(RelayClient.socketUrl("https://h", "a b", "t&x")).contains("deviceId=a%20b&token=t%26x")
    }
}
