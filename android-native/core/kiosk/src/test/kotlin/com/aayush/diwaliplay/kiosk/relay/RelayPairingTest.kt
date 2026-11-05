package com.aayush.diwaliplay.kiosk.relay

import android.content.Context
import com.aayush.diwaliplay.branding.ServerConfig
import com.aayush.diwaliplay.kiosk.SecureStore
import com.google.common.truth.Truth.assertThat
import java.time.Instant
import javax.crypto.KeyGenerator
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class RelayPairingTest {
    private val server = MockWebServer()
    private val app get() = RuntimeEnvironment.getApplication()
    private val prefs get() = app.getSharedPreferences("pairing_secure", Context.MODE_PRIVATE)
    private val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private val store get() = SecureStore(prefs) { key }
    private val config get() = ServerConfig(app.getSharedPreferences("pairing_cfg", Context.MODE_PRIVATE))
    private val checks = mutableListOf<String>()
    @Volatile private var paired = false

    @Before fun up() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/api/kiosk-relay/device-request-code" -> MockResponse().setBody(
                    """{"success":true,"deviceId":"kiosk_dev_abc","pairingCode":"123456","expiresAt":"${Instant.ofEpochMilli(BASE + 10_000)}"}""",
                )
                "/api/kiosk-relay/device-check-pairing" -> {
                    checks += request.body.readUtf8()
                    MockResponse().setBody(
                        if (paired) """{"success":true,"paired":true,"deviceId":"kiosk_dev_abc","deviceToken":"tok-secret","name":"Lobby"}"""
                        else """{"success":true,"paired":false}""",
                    )
                }
                else -> MockResponse().setResponseCode(404)
            }
        }
        server.start()
        config.apiBaseUrl = server.url("/").toString()
    }

    @After fun down() = server.shutdown()


    @Test fun pairingStoresTokenEncrypted() = runTest {
        val pairing = RelayPairing(OkHttpClient(), config, store, now = { BASE + testScheduler.currentTime }, io = StandardTestDispatcher(testScheduler))
        val code = pairing.requestCode("Lobby TV")
        assertThat(code.deviceId).isEqualTo("kiosk_dev_abc")
        assertThat(code.pairingCode).isEqualTo("123456")
        assertThat(code.expiresAtMs).isEqualTo(BASE + 10_000)
        val body = server.takeRequest().body.readUtf8()
        assertThat(body).contains("\"suggestedName\":\"Lobby TV\"")

        paired = true
        assertThat(pairing.awaitPaired(code.deviceId)).isTrue()
        assertThat(checks.single()).isEqualTo("""{"deviceId":"kiosk_dev_abc"}""")

        assertThat(store.get("relay_device_id")).isEqualTo("kiosk_dev_abc")
        assertThat(store.get("relay_device_token")).isEqualTo("tok-secret")
        assertThat(prefs.all.toString()).doesNotContain("tok-secret")
        assertThat(store.get("relay_api_base")).isEqualTo(config.apiBaseUrl) // the token belongs to this server only
        assertThat(pairing.isPaired()).isTrue()
    }

    @Test fun pairingStopsAtExpiry() = runTest {
        val pairing = RelayPairing(OkHttpClient(), config, store, now = { BASE + testScheduler.currentTime }, io = StandardTestDispatcher(testScheduler))
        val code = pairing.requestCode("Lobby TV")
        assertThat(pairing.awaitPaired(code.deviceId)).isFalse()
        assertThat(testScheduler.currentTime).isAtMost(12_000)
        assertThat(checks).hasSize(4) // at 0, 3, 6 and 9 s; at 12 s the code is dead
        assertThat(store.get("relay_device_token")).isNull()
        assertThat(pairing.isPaired()).isFalse()
    }

    @Test fun unpairForgetsEverything() = runTest {
        val s = store
        s.put("relay_device_id", "x")
        s.put("relay_device_token", "y")
        s.put("relay_api_base", "z")
        val pairing = RelayPairing(OkHttpClient(), config, s, now = { BASE })
        pairing.unpair()
        assertThat(s.get("relay_device_id")).isNull()
        assertThat(s.get("relay_device_token")).isNull()
        assertThat(s.get("relay_api_base")).isNull()
    }

    private companion object { const val BASE = 1_800_000_000_000L }
}
