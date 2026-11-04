package com.aayush.diwaliplay.api

import com.aayush.diwaliplay.model.AbandonSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionResponse
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SettingsResponse
import com.aayush.diwaliplay.model.SpinWheelRequest
import com.aayush.diwaliplay.model.SpinWheelResponse
import com.aayush.diwaliplay.model.StartSessionResponse
import com.aayush.diwaliplay.model.SubmitFeedbackResponse
import com.aayush.diwaliplay.model.VerifyCodeResponse

/** Kiosk-facing backend API. Methods never throw (except coroutine cancellation). */
interface GameApi {
    suspend fun verifyCode(code: String): ApiResult<VerifyCodeResponse>
    suspend fun startSession(code: String, kioskId: String?): ApiResult<StartSessionResponse>
    suspend fun completeSession(req: CompleteSessionRequest): ApiResult<CompleteSessionResponse>
    suspend fun abandonSession(req: AbandonSessionRequest): ApiResult<AbandonSessionResponse>
    suspend fun submitFeedback(sessionId: String, feedback: GameFeedback): ApiResult<SubmitFeedbackResponse>
    suspend fun getSettings(): ApiResult<SettingsResponse>
    suspend fun getBombs(): ApiResult<ListBombsResponse>
    suspend fun getRewards(): ApiResult<RewardsInfo>
    suspend fun spin(req: SpinWheelRequest): ApiResult<SpinWheelResponse>
}
