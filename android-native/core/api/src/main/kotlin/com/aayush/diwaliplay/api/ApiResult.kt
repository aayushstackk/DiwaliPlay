package com.aayush.diwaliplay.api

import kotlinx.serialization.Serializable

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>

    /** Server answered with a non-2xx status (or a 2xx whose body could not be decoded is a [NetworkError]). */
    data class HttpError(val code: Int, val body: String) : ApiResult<Nothing>

    /** No usable response: connect/read/timeout failure, or an undecodable 2xx body. */
    data class NetworkError(val cause: Throwable) : ApiResult<Nothing>
}

/** `POST /api/session/abandon` response; only [success] matters to the kiosk. */
@Serializable
data class AbandonSessionResponse(val success: Boolean = false, val message: String? = null)
