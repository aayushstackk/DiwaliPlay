package com.aayush.diwaliplay.kiosk.relay

import com.aayush.diwaliplay.model.DiwaliJson
import com.aayush.diwaliplay.model.KioskDeviceStatus
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** What the server sends: `KioskOutboundMessage` in server/kioskRelay/types.ts. Anything else is not one of these. */
internal sealed interface RelayInbound {
    data class Command(val requestId: String, val action: String, val passcode: String?) : RelayInbound
    data object HeartbeatAck : RelayInbound
    data object Ping : RelayInbound
}

/** The wire format, exactly as server/kioskRelay/types.ts (`KioskAgentHeartbeat`, `KioskAgentAck`, `KioskAgentPong`). */
internal object RelayMessages {
    /** Null for anything that isn't a well-formed message of a known type: the caller ignores those. */
    fun parse(text: String): RelayInbound? = try {
        val obj = DiwaliJson.parseToJsonElement(text).jsonObject
        when (obj.string("type")) {
            "ping" -> RelayInbound.Ping
            "heartbeat_ack" -> RelayInbound.HeartbeatAck
            "command" -> {
                val id = obj.string("requestId")
                val action = obj.string("action")
                if (id == null || action == null) {
                    null
                } else {
                    RelayInbound.Command(id, action, (obj["params"] as? JsonObject)?.string("passcode"))
                }
            }
            else -> null
        }
    } catch (_: Exception) {
        null // not JSON, or not an object
    }

    fun heartbeat(deviceId: String, now: Long, status: KioskDeviceStatus): String = buildJsonObject {
        put("type", "heartbeat")
        put("deviceId", deviceId)
        put("timestamp", now)
        put("status", DiwaliJson.encodeToJsonElement(KioskDeviceStatus.serializer(), status))
    }.toString()

    fun ack(
        requestId: String,
        action: String,
        success: Boolean,
        now: Long,
        status: KioskDeviceStatus? = null,
        message: String? = null,
        error: String? = null,
    ): String = buildJsonObject {
        put("type", "ack")
        put("requestId", requestId)
        put("action", action)
        put("success", success)
        if (status != null) put("status", DiwaliJson.encodeToJsonElement(KioskDeviceStatus.serializer(), status))
        if (message != null) put("message", message)
        if (error != null) put("error", error)
        put("timestamp", now)
    }.toString()

    fun pong(now: Long): String = buildJsonObject {
        put("type", "pong")
        put("timestamp", now)
    }.toString()

    private fun JsonObject.string(key: String): String? {
        val p = this[key] as? JsonPrimitive ?: return null
        return if (p === JsonNull || !p.isString) null else p.contentOrNull
    }
}
