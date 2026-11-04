package com.aayush.diwaliplay.api

import com.aayush.diwaliplay.model.AbandonSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionResponse
import com.aayush.diwaliplay.model.DiwaliJson
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SettingsResponse
import com.aayush.diwaliplay.model.SpinWheelRequest
import com.aayush.diwaliplay.model.SpinWheelResponse
import com.aayush.diwaliplay.model.StartSessionRequest
import com.aayush.diwaliplay.model.StartSessionResponse
import com.aayush.diwaliplay.model.SubmitFeedbackRequest
import com.aayush.diwaliplay.model.SubmitFeedbackResponse
import com.aayush.diwaliplay.model.VerifyCodeResponse
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume

/**
 * OkHttp implementation. [baseUrl] is evaluated per request (e.g. `https://host`, no trailing `/api`);
 * paths are `${baseUrl}/api/...` as in src/services/api.ts.
 */
class HttpGameApi(
    private val baseUrl: () -> String,
    client: OkHttpClient,
) : GameApi {
    private val http: OkHttpClient = client.newBuilder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .build()

    override suspend fun verifyCode(code: String) = call(
        "/api/kiosk/verify-code", "POST",
        buildJsonObject { put("code", code) }.toString(), VerifyCodeResponse.serializer(),
    )

    override suspend fun startSession(code: String, kioskId: String?) = call(
        "/api/session/start", "POST",
        DiwaliJson.encodeToString(StartSessionRequest.serializer(), StartSessionRequest(code, kioskId)),
        StartSessionResponse.serializer(),
    )

    override suspend fun completeSession(req: CompleteSessionRequest): ApiResult<CompleteSessionResponse> = call(
        "/api/session/complete", "POST",
        DiwaliJson.encodeToString(CompleteSessionRequest.serializer(), req), CompleteSessionResponse.serializer(),
    )

    override suspend fun abandonSession(req: AbandonSessionRequest) = call(
        "/api/session/abandon", "POST",
        DiwaliJson.encodeToString(AbandonSessionRequest.serializer(), req), AbandonSessionResponse.serializer(),
    )

    override suspend fun submitFeedback(sessionId: String, feedback: GameFeedback) = call(
        "/api/session/feedback", "POST",
        DiwaliJson.encodeToString(SubmitFeedbackRequest.serializer(), SubmitFeedbackRequest(sessionId, feedback)),
        SubmitFeedbackResponse.serializer(),
    )

    override suspend fun getSettings() = call("/api/settings", "GET", null, SettingsResponse.serializer())

    override suspend fun getBombs() = call("/api/bombs", "GET", null, ListBombsResponse.serializer())

    override suspend fun getRewards() = call("/api/rewards", "GET", null, RewardsInfo.serializer())

    override suspend fun spin(req: SpinWheelRequest) = call(
        "/api/rewards/spin", "POST",
        DiwaliJson.encodeToString(SpinWheelRequest.serializer(), req), SpinWheelResponse.serializer(),
    )

    private suspend fun <T> call(path: String, method: String, json: String?, ser: KSerializer<T>): ApiResult<T> {
        val request = try {
            Request.Builder()
                .url(baseUrl().trimEnd('/') + path)
                .header("Accept", "application/json")
                .method(method, json?.toRequestBody(JSON_MEDIA))
                .build()
        } catch (e: IllegalArgumentException) {
            return ApiResult.NetworkError(e)
        }
        val (code, body) = try {
            execute(request)
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            return ApiResult.NetworkError(e)
        } catch (e: RuntimeException) {
            return ApiResult.NetworkError(e)
        }
        if (code !in 200..299) return ApiResult.HttpError(code, body)
        return try {
            ApiResult.Success(DiwaliJson.decodeFromString(ser, body))
        } catch (e: kotlinx.serialization.SerializationException) {
            ApiResult.NetworkError(e)
        } catch (e: IllegalArgumentException) {
            ApiResult.NetworkError(e)
        }
    }

    private suspend fun execute(request: Request): Pair<Int, String> =
        suspendCancellableCoroutine { cont ->
            val call = http.newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resumeWith(Result.failure(e))
                }

                override fun onResponse(call: Call, response: Response) {
                    val r = try {
                        response.use { it.code to (it.body?.string() ?: "") }
                    } catch (e: IOException) {
                        if (cont.isActive) cont.resumeWith(Result.failure(e))
                        return
                    }
                    if (cont.isActive) cont.resume(r)
                }
            })
        }

    private companion object {
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
