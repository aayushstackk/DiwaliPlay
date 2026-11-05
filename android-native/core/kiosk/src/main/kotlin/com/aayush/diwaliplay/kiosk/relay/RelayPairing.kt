package com.aayush.diwaliplay.kiosk.relay

import android.util.Log
import com.aayush.diwaliplay.branding.ServerConfig
import com.aayush.diwaliplay.kiosk.SecureStore
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private const val TAG = "RelayPairing"
internal const val KEY_DEVICE_ID = "relay_device_id"
internal const val KEY_DEVICE_TOKEN = "relay_device_token"

/** The API address the pairing was made against: its token is only ever sent there. */
internal const val KEY_API_BASE = "relay_api_base"
private const val POLL_MS = 3_000L

/** The server gives the code 15 minutes; used only if its `expiresAt` can't be read. */
private const val DEFAULT_LIFETIME_MS = 15 * 60_000L

/** `POST /api/kiosk-relay/device-request-code`'s answer. [expiresAt] is the server's ISO-8601 text. */
data class PairingCode(val deviceId: String, val pairingCode: String, val expiresAt: String, val expiresAtMs: Long)

/**
 * Pairing, as windows-kiosk/kiosk-cloud-agent.ps1 does it: ask for a code, show it, and poll until an admin has claimed
 * it in the web panel. The token then lives only in [store], encrypted. All calls block on the network, so [io] is where
 * they run; the caller's context can be the main thread.
 */
class RelayPairing(
    private val api: OkHttpClient,
    private val config: ServerConfig,
    private val store: SecureStore,
    private val now: () -> Long = System::currentTimeMillis,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    private val expiries = HashMap<String, Long>()
    private val bases = HashMap<String, String>()

    /** Throws [IOException] if the server can't be reached or doesn't give a code. */
    suspend fun requestCode(name: String): PairingCode = withContext(io) {
        val body = buildJsonObject { put("suggestedName", name) }.toString()
        val json = post("device-request-code", body)
        if (json["success"]?.jsonPrimitive?.boolean != true) throw IOException("The server refused to give a code")
        val deviceId = json["deviceId"]?.jsonPrimitive?.contentOrNull
        val code = json["pairingCode"]?.jsonPrimitive?.contentOrNull
        if (deviceId.isNullOrEmpty() || code.isNullOrEmpty()) throw IOException("The server's answer had no code")
        val expiresAt = json["expiresAt"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val expiresAtMs = runCatching { Instant.parse(expiresAt).toEpochMilli() }.getOrElse { now() + DEFAULT_LIFETIME_MS }
        synchronized(expiries) {
            expiries[deviceId] = expiresAtMs
            bases[deviceId] = config.apiBaseUrl
        }
        PairingCode(deviceId, code, expiresAt, expiresAtMs)
    }

    /**
     * Polls every 3 s until the admin has claimed the code (the token is then stored, and this returns true), or the
     * code expires or vanishes (false). A failed poll is just a poll that found nothing.
     */
    suspend fun awaitPaired(deviceId: String): Boolean {
        val deadline = synchronized(expiries) { expiries[deviceId] } ?: (now() + DEFAULT_LIFETIME_MS)
        while (now() < deadline) {
            val answer = withContext(io) { check(deviceId) }
            when (answer) {
                is Check.Paired -> return savePairing(answer.deviceId, answer.token, synchronized(expiries) { bases[deviceId] } ?: config.apiBaseUrl)
                Check.Gone -> return false
                Check.NotYet -> Unit
            }
            delay(POLL_MS)
        }
        return false
    }

    /** Whether there are credentials. Reads the Keystore: off the main thread. */
    fun isPaired(): Boolean = store.get(KEY_DEVICE_ID) != null && store.get(KEY_DEVICE_TOKEN) != null

    /** Forgets this device locally. The server's record stays until an admin deletes it in the panel. */
    fun unpair() {
        store.remove(KEY_DEVICE_ID)
        store.remove(KEY_DEVICE_TOKEN)
        store.remove(KEY_API_BASE)
    }

    private suspend fun savePairing(deviceId: String, token: String, base: String): Boolean = withContext(io) {
        try {
            store.put(KEY_API_BASE, base)
            store.put(KEY_DEVICE_ID, deviceId)
            store.put(KEY_DEVICE_TOKEN, token)
            true
        } catch (e: Exception) {
            Log.w(TAG, "paired, but couldn't keep the credentials: ${e.javaClass.simpleName}") // never the token itself
            unpair()
            false
        }
    }

    private sealed interface Check {
        data class Paired(val deviceId: String, val token: String) : Check
        data object NotYet : Check
        data object Gone : Check
    }

    private fun check(deviceId: String): Check = try {
        val body = buildJsonObject { put("deviceId", deviceId) }.toString()
        val json = post("device-check-pairing", body)
        val token = json["deviceToken"]?.jsonPrimitive?.contentOrNull
        if (json["paired"]?.jsonPrimitive?.boolean == true && !token.isNullOrEmpty()) {
            Check.Paired(json["deviceId"]?.jsonPrimitive?.contentOrNull ?: deviceId, token)
        } else {
            Check.NotYet
        }
    } catch (e: NotFound) {
        Check.Gone
    } catch (e: Exception) {
        Log.w(TAG, "pairing check failed: ${e.javaClass.simpleName}")
        Check.NotYet
    }

    private class NotFound : IOException("device not found")

    private fun post(route: String, body: String): JsonObject {
        val request = Request.Builder()
            .url("${config.apiBaseUrl}/api/kiosk-relay/$route")
            .post(body.toRequestBody(JSON))
            .build()
        api.newCall(request).execute().use { response ->
            if (response.code == 404) throw NotFound()
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            return com.aayush.diwaliplay.model.DiwaliJson.parseToJsonElement(response.body?.string().orEmpty()).jsonObject
        }
    }

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
