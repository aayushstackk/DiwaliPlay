package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.api.GameApi
import com.aayush.diwaliplay.api.UndecodableResponseException
import com.aayush.diwaliplay.model.AbandonSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.SpinWheelRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Observes whether the backend is answering, from the traffic that is already there (the branding poll every 8 s
 * on the start screen), so the "connecting to server" state needs no requests of its own. Any HTTP answer counts
 * as reachable, even an error status or an undecodable body.
 */
class ReachabilityGameApi(private val delegate: GameApi) : GameApi {
    private val _reachable = MutableStateFlow(false)
    val reachable: StateFlow<Boolean> = _reachable.asStateFlow()

    private fun <T> ApiResult<T>.track(): ApiResult<T> = also {
        _reachable.value = it !is ApiResult.NetworkError || it.cause is UndecodableResponseException
    }

    override suspend fun verifyCode(code: String) = delegate.verifyCode(code).track()
    override suspend fun startSession(code: String, kioskId: String?) = delegate.startSession(code, kioskId).track()
    override suspend fun completeSession(req: CompleteSessionRequest) = delegate.completeSession(req).track()
    override suspend fun abandonSession(req: AbandonSessionRequest) = delegate.abandonSession(req).track()
    override suspend fun submitFeedback(sessionId: String, feedback: GameFeedback) = delegate.submitFeedback(sessionId, feedback).track()
    override suspend fun getSettings() = delegate.getSettings().track()
    override suspend fun getBombs() = delegate.getBombs().track()
    override suspend fun getRewards() = delegate.getRewards().track()
    override suspend fun spin(req: SpinWheelRequest) = delegate.spin(req).track()
}
