package com.aayush.diwaliplay.api

import kotlinx.serialization.Serializable

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>

    /** The server answered with a non-2xx status. */
    data class HttpError(val code: Int, val body: String) : ApiResult<Nothing>

    /** No usable response: connect/read/timeout failure, or a 2xx whose body could not be decoded ([cause] is then [UndecodableResponseException]). */
    data class NetworkError(val cause: Throwable) : ApiResult<Nothing>
}

/** `POST /api/session/abandon` response; only [success] matters to the kiosk. */
@Serializable
data class AbandonSessionResponse(val success: Boolean = false, val message: String? = null)

/** A 2xx response whose body did not decode: the server accepted the request, only the reply is unusable. */
class UndecodableResponseException(val code: Int, val body: String, cause: Throwable) :
    Exception("Undecodable $code response", cause)
