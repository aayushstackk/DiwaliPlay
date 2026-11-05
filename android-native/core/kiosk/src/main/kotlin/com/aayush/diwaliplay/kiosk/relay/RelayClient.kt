package com.aayush.diwaliplay.kiosk.relay

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.aayush.diwaliplay.branding.ServerConfig
import com.aayush.diwaliplay.kiosk.AdminPin
import com.aayush.diwaliplay.kiosk.PinResult
import com.aayush.diwaliplay.kiosk.SecureStore
import com.aayush.diwaliplay.model.KioskDeviceStatus
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

private const val TAG = "RelayClient"
private const val HEARTBEAT_MS = 20_000L
private const val BACKOFF_START_MS = 2_000L
private const val BACKOFF_MAX_MS = 30_000L
private const val EXIT_DELAY_MS = 500L
private const val HANDSHAKE_MS = 30_000L

/** The server closes with this when the device or token is unknown (server/kioskRelay/kioskRelayManager.ts). */
private const val CLOSE_UNAUTHORIZED = 4401

/** What the relay needs of the kiosk lock; [com.aayush.diwaliplay.kiosk.KioskController] is the real one. Main thread. */
interface RelayKiosk {
    fun status(): KioskDeviceStatus
    fun enableLock(reason: String)
    fun disableLock(reason: String)
}

/** What a remote `test-exit` throws: an uncaught exception, so that [com.aayush.diwaliplay.kiosk.CrashRestarter] relaunches. */
class RemoteTestExit : RuntimeException("Remote test-exit")

/** Why the relay has stopped trying, for the admin screen. Cleared by a fresh start or a good connection. */
enum class RelayProblem(val text: String) {
    /** The server closed the socket with 4401: the device or its token is gone there. */
    Rejected("Pairing rejected: unpair and pair again."),

    /** The API address changed since pairing; the token belongs to the old server and is never sent to the new one. */
    OtherServer("Paired with a different server: unpair and pair again."),
}

/**
 * The cloud relay connection, spec §9: the same protocol as windows-kiosk/kiosk-cloud-agent.ps1. Runs on [scope], never
 * on the main thread but for the kiosk calls, and nothing a socket or the server sends can throw out of it.
 *
 * The token comes from [store] on each connect and is never logged. Unpaired, or a store that can't be read, means no
 * connection at all; so does a pairing made against another API address, or one the server has rejected (4401).
 * [connected] and the backoff reset wait for the server's first `heartbeat_ack`, because a server that upgrades and
 * then closes would otherwise look healthy and be retried every 2 s.
 */
class RelayClient(
    client: OkHttpClient,
    private val config: ServerConfig,
    private val store: SecureStore,
    private val kiosk: RelayKiosk,
    private val pin: AdminPin,
    private val scope: CoroutineScope,
    private val onTestExit: () -> Unit = ::crashOnMainThread,
    private val main: CoroutineDispatcher = Dispatchers.Main,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val clock: () -> Long = System::currentTimeMillis,
    private val connector: ((Request, WebSocketListener) -> WebSocket)? = null,
) {
    // The read timeout is off because a web socket sits idle; HANDSHAKE_MS bounds the upgrade instead.
    private val socketClient: OkHttpClient by lazy {
        client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).pingInterval(30, TimeUnit.SECONDS).build()
    }

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    private val _problem = MutableStateFlow<RelayProblem?>(null)
    val problem: StateFlow<RelayProblem?> = _problem.asStateFlow()

    private var job: Job? = null

    /** Connects, and keeps connecting, while paired. Does nothing if already running. */
    @Synchronized
    fun start() {
        if (job?.isActive == true) return
        _problem.value = null
        job = scope.launch { runLoop() }
    }

    /** Closes the connection and stops reconnecting. */
    @Synchronized
    fun stop() {
        job?.cancel()
        job = null
        _connected.value = false
        _problem.value = null
    }

    private class Credentials(val deviceId: String, val token: String)

    private sealed interface Paired {
        data class Yes(val creds: Credentials) : Paired
        data object No : Paired
        data object OtherServer : Paired
    }

    /** What one connection came to. */
    private class Outcome(val acked: Boolean, val closeCode: Int?)

    /** One connection's own flags: callbacks that arrive after it ended must change nothing. */
    private class Link {
        val live = AtomicBoolean(true)
        val acked = AtomicBoolean(false)
        @Volatile var closeCode: Int? = null
    }

    private suspend fun runLoop() {
        var backoff = BACKOFF_START_MS
        while (currentCoroutineContext().isActive) {
            try {
                when (val paired = withContext(io) { credentials() }) {
                    Paired.No -> return // unpaired: start() again after pairing
                    Paired.OtherServer -> {
                        _problem.value = RelayProblem.OtherServer
                        return
                    }
                    is Paired.Yes -> {
                        val outcome = connectOnce(paired.creds)
                        if (outcome.closeCode == CLOSE_UNAUTHORIZED) {
                            _problem.value = RelayProblem.Rejected
                            return
                        }
                        if (outcome.acked) backoff = BACKOFF_START_MS
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "relay loop error: ${e.javaClass.simpleName}")
            }
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(BACKOFF_MAX_MS)
        }
    }

    private fun credentials(): Paired {
        val id = store.get(KEY_DEVICE_ID) ?: return Paired.No
        val token = store.get(KEY_DEVICE_TOKEN) ?: return Paired.No
        if (store.get(KEY_API_BASE) != config.apiBaseUrl) return Paired.OtherServer
        return Paired.Yes(Credentials(id, token))
    }

    /** One connection, from opening to its end. */
    private suspend fun connectOnce(creds: Credentials): Outcome {
        val url = socketUrl(config.apiBaseUrl, creds.deviceId, creds.token)
        if (url == null) {
            Log.w(TAG, "the server address can't be used for a socket")
            return Outcome(acked = false, closeCode = null)
        }
        val link = Link()
        val inbox = Channel<String>(Channel.UNLIMITED)
        val opened = CompletableDeferred<Unit>()
        val ended = CompletableDeferred<Unit>()
        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (link.live.get()) opened.complete(Unit)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (link.live.get()) inbox.trySend(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) = Unit // the protocol is text

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                link.closeCode = code
                runCatching { webSocket.close(code, null) }
                ended.complete(Unit)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (link.closeCode == null) link.closeCode = code
                ended.complete(Unit)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "socket failed: ${t.javaClass.simpleName}${response?.let { " (HTTP ${it.code})" }.orEmpty()}")
                ended.complete(Unit)
            }
        }
        val request = Request.Builder().url(url).build()
        val ws = (connector ?: socketClient::newWebSocket)(request, listener)
        try {
            coroutineScope {
                launch { for (text in inbox) handle(ws, link, creds, text) }
                launch {
                    opened.await()
                    while (true) {
                        sendHeartbeat(ws, creds)
                        delay(HEARTBEAT_MS)
                    }
                }
                launch {
                    delay(HANDSHAKE_MS)
                    if (!opened.isCompleted) {
                        Log.w(TAG, "no answer to the upgrade: giving up on this attempt")
                        runCatching { ws.cancel() }
                        ended.complete(Unit)
                    }
                }
                ended.await()
                coroutineContext.cancelChildren()
            }
        } finally {
            link.live.set(false)
            _connected.value = false
            inbox.close()
            runCatching { ws.close(1000, null) }
        }
        return Outcome(link.acked.get(), link.closeCode)
    }

    private suspend fun currentStatus(): KioskDeviceStatus = withContext(main) { kiosk.status() }.copy(connected = true)

    private suspend fun sendHeartbeat(ws: WebSocket, creds: Credentials) {
        try {
            ws.send(RelayMessages.heartbeat(creds.deviceId, clock(), currentStatus()))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "heartbeat skipped: ${e.javaClass.simpleName}")
        }
    }

    /** One message; whatever goes wrong with it stays with it, but a command still gets its answer. */
    private suspend fun handle(ws: WebSocket, link: Link, @Suppress("UNUSED_PARAMETER") creds: Credentials, text: String) {
        var command: RelayInbound.Command? = null
        try {
            when (val msg = RelayMessages.parse(text)) {
                null -> Unit
                RelayInbound.HeartbeatAck -> if (link.live.get()) {
                    link.acked.set(true)
                    _connected.value = true
                    _problem.value = null
                }
                RelayInbound.Ping -> ws.send(RelayMessages.pong(clock()))
                is RelayInbound.Command -> {
                    command = msg
                    execute(ws, msg)
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "message not handled: ${e.javaClass.simpleName}")
            command?.let { c ->
                runCatching { ws.send(RelayMessages.ack(c.requestId, c.action, false, clock(), error = "Command failed on the device")) }
            }
        }
    }

    private suspend fun execute(ws: WebSocket, cmd: RelayInbound.Command) {
        fun ack(success: Boolean, status: KioskDeviceStatus? = null, message: String? = null, error: String? = null) =
            ws.send(RelayMessages.ack(cmd.requestId, cmd.action, success, clock(), status, message, error))

        when (cmd.action) {
            "status" -> ack(true, currentStatus())
            "enable", "disable" -> {
                // Only a passcode that was sent is checked: the admin panel has signed in already, and a forgotten PIN is
                // recovered by a passcode-less disable. A guess counts against the same five as the local dialog, so a
                // command without one must never cost an attempt.
                val passcode = cmd.passcode
                if (!passcode.isNullOrBlank()) {
                    when (val result = withContext(io) { pin.verify(passcode) }) {
                        PinResult.Ok -> Unit
                        is PinResult.Wrong -> {
                            ack(false, error = "Invalid passcode", message = "${result.attemptsLeft} attempts left")
                            return
                        }
                        is PinResult.LockedOut -> {
                            ack(false, error = "PIN locked", message = "Try again in ${minutes(result.remainingMs)} min")
                            return
                        }
                    }
                }
                try {
                    withContext(main) {
                        if (cmd.action == "enable") kiosk.enableLock(REASON_RELAY) else kiosk.disableLock(REASON_RELAY)
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "lock change failed: ${e.javaClass.simpleName}")
                    ack(false, error = "Couldn't change the lock", message = e.message)
                    return
                }
                val status = currentStatus()
                val message = when {
                    cmd.action == "disable" -> "Kiosk lock disabled"
                    status.backProtection -> "Kiosk lock enabled"
                    // Asked for, but the system hasn't taken it: the app is in the background, or the pinning prompt is up.
                    else -> "Lock requested but not active yet: the app may be in the background or waiting for the system prompt"
                }
                ack(true, status, message = message)
            }
            "test-exit" -> {
                ack(true, currentStatus(), message = "Exiting in ${EXIT_DELAY_MS} ms")
                delay(EXIT_DELAY_MS)
                onTestExit()
            }
            else -> ack(false, error = "Unsupported action")
        }
    }

    private fun minutes(ms: Long): Long = (ms + 59_999) / 60_000

    companion object {
        const val REASON_RELAY = "Remote relay"

        /** `wss://` for an https base, `ws://` for http; null for anything else. */
        fun socketUrl(base: String, deviceId: String, token: String): String? {
            val http = base.toHttpUrlOrNull() ?: return null
            val scheme = when (http.scheme) {
                "https" -> "wss"
                "http" -> "ws"
                else -> return null
            }
            val url = http.newBuilder()
                .addPathSegments("ws/kiosk-relay")
                .addQueryParameter("deviceId", deviceId)
                .addQueryParameter("token", token)
                .build()
            return scheme + url.toString().removePrefix(http.scheme)
        }
    }
}

private fun crashOnMainThread() {
    Handler(Looper.getMainLooper()).post { throw RemoteTestExit() }
}
