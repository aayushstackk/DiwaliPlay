package com.aayush.diwaliplay.kiosk.relay

import android.util.Log
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "RelayManager"

/** What the admin screen shows and does about the relay: pairing, and the connection once paired. */
class RelayManager(
    private val pairing: RelayPairing,
    private val client: RelayClient,
    private val scope: CoroutineScope,
    private val deviceName: String,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    data class State(
        val paired: Boolean = false,
        val connected: Boolean = false,
        val busy: Boolean = false,
        val code: String? = null,
        val expiresAtMs: Long? = null,
        val error: String? = null,
        val problem: RelayProblem? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var pairJob: Job? = null

    init {
        scope.launch { client.connected.collect { c -> _state.update { it.copy(connected = c) } } }
        scope.launch { client.problem.collect { p -> _state.update { it.copy(problem = p) } } }
    }

    /** At app start: connects if this device is already paired. */
    fun start() {
        scope.launch {
            val paired = withContext(io) { pairing.isPaired() }
            _state.update { it.copy(paired = paired) }
            if (paired) client.start()
        }
    }

    /** Asks for a code and waits for the admin to claim it. */
    @Synchronized
    fun pair() {
        if (pairJob?.isActive == true || _state.value.paired) return
        _state.update { it.copy(busy = true, error = null, code = null, expiresAtMs = null) }
        pairJob = scope.launch {
            try {
                val code = pairing.requestCode(deviceName)
                _state.update { it.copy(code = code.pairingCode, expiresAtMs = code.expiresAtMs) }
                if (pairing.awaitPaired(code.deviceId)) {
                    _state.update { it.copy(paired = true, busy = false, code = null, expiresAtMs = null) }
                    client.start()
                } else {
                    _state.update { it.copy(busy = false, code = null, expiresAtMs = null, error = "The code expired. Try again.") }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                _state.update { it.copy(busy = false, code = null, expiresAtMs = null, error = "Can't reach the server.") }
            } catch (e: Exception) {
                Log.w(TAG, "pairing failed: ${e.javaClass.simpleName}")
                _state.update { it.copy(busy = false, code = null, expiresAtMs = null, error = "Pairing failed.") }
            }
        }
    }

    /** After the API address was saved: reconnects, so that a pairing made against the old one is noticed. */
    fun addressChanged() {
        if (!_state.value.paired) return
        client.stop()
        client.start()
    }

    @Synchronized
    fun cancelPairing() {
        pairJob?.cancel()
        pairJob = null
        _state.update { it.copy(busy = false, code = null, expiresAtMs = null, error = null) }
    }

    fun unpair() {
        cancelPairing()
        client.stop()
        scope.launch {
            withContext(io) { pairing.unpair() }
            _state.update { it.copy(paired = false, connected = false) }
        }
    }
}
