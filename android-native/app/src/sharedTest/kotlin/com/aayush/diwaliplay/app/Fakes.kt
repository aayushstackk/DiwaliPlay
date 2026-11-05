package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.api.AbandonSessionResponse
import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.api.GameApi
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.model.AbandonSessionRequest
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionResponse
import com.aayush.diwaliplay.model.GameAudioSettings
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.GameSession
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SettingsResponse
import com.aayush.diwaliplay.model.SpinWheelRequest
import com.aayush.diwaliplay.model.SpinWheelResponse
import com.aayush.diwaliplay.model.StartSessionResponse
import com.aayush.diwaliplay.model.SubmitFeedbackResponse
import com.aayush.diwaliplay.model.User
import com.aayush.diwaliplay.model.VerifyCodeResponse
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

val TEST_USER = User(id = "u1", name = "Asha", mobileNumber = "9990001111")

/** Scriptable [GameApi]; a valid code by default, and records every call. */
class FakeGameApi : GameApi {
    val verified = CopyOnWriteArrayList<String>()
    val started = CopyOnWriteArrayList<String>()
    val completed = CopyOnWriteArrayList<CompleteSessionRequest>()
    val abandoned = CopyOnWriteArrayList<AbandonSessionRequest>()
    val feedback = CopyOnWriteArrayList<Pair<String, GameFeedback>>()

    var serverSessionId = "server_session"
    var onVerify: suspend (String) -> ApiResult<VerifyCodeResponse> = {
        ApiResult.Success(VerifyCodeResponse(success = true, valid = true, user = TEST_USER))
    }
    var onStart: suspend (String) -> ApiResult<StartSessionResponse> = {
        ApiResult.Success(
            StartSessionResponse(success = true, session = GameSession(id = serverSessionId, userId = "u1"), user = TEST_USER),
        )
    }
    var onComplete: suspend (CompleteSessionRequest) -> ApiResult<CompleteSessionResponse> = { req ->
        ApiResult.Success(
            CompleteSessionResponse(success = true, session = GameSession(id = req.sessionId, userId = "u1"), user = TEST_USER),
        )
    }

    val spins = CopyOnWriteArrayList<SpinWheelRequest>()
    var onGetRewards: suspend () -> ApiResult<RewardsInfo> = { offline() }
    var onSpin: suspend (SpinWheelRequest) -> ApiResult<SpinWheelResponse> = { offline() }

    val totalCalls: Int get() = verified.size + started.size + completed.size + abandoned.size + feedback.size + spins.size

    override suspend fun verifyCode(code: String): ApiResult<VerifyCodeResponse> {
        verified += code
        return onVerify(code)
    }

    override suspend fun startSession(code: String, kioskId: String?): ApiResult<StartSessionResponse> {
        started += code
        return onStart(code)
    }

    override suspend fun completeSession(req: CompleteSessionRequest): ApiResult<CompleteSessionResponse> {
        completed += req
        return onComplete(req)
    }

    override suspend fun abandonSession(req: AbandonSessionRequest): ApiResult<AbandonSessionResponse> {
        abandoned += req
        return ApiResult.Success(AbandonSessionResponse(success = true))
    }

    override suspend fun submitFeedback(sessionId: String, feedback: GameFeedback): ApiResult<SubmitFeedbackResponse> {
        this.feedback += sessionId to feedback
        return ApiResult.NetworkError(UnsupportedOperationException("not scripted"))
    }

    private fun <T> offline(): ApiResult<T> = ApiResult.NetworkError(UnsupportedOperationException("not scripted"))
    override suspend fun getSettings(): ApiResult<SettingsResponse> = offline()
    override suspend fun getBombs(): ApiResult<ListBombsResponse> = offline()
    override suspend fun getRewards(): ApiResult<RewardsInfo> = onGetRewards()
    override suspend fun spin(req: SpinWheelRequest): ApiResult<SpinWheelResponse> {
        spins += req
        return onSpin(req)
    }
}

class FakeResultSink : ResultSink {
    val queued = CopyOnWriteArrayList<CompleteSessionRequest>()
    override fun start() = Unit
    override fun enqueue(req: CompleteSessionRequest) { queued += req }
}

class FakeGameAudio : GameAudio {
    val played = CopyOnWriteArrayList<String>()
    val crackers = CopyOnWriteArrayList<String>()
    val applied = CopyOnWriteArrayList<GameAudioSettings>()
    val ticks = CopyOnWriteArrayList<Float>()
    @Volatile var victories = 0
    @Volatile var ready = true
    @Volatile var bgmOn = false
    @Volatile var released = false

    override fun apply(settings: GameAudioSettings, files: Map<String, File>, bombs: List<BombConfig>) { applied += settings }
    override fun isReady(): Boolean = ready
    override fun playGameKey(key: String) { played += key }
    override fun playCracker(type: String) { crackers += type }
    override fun playSpinTick(speedRatio: Float) { ticks += speedRatio }
    override fun playVictoryChime() { victories++ }
    override fun startBgm() { bgmOn = true }
    override fun stopBgm() { bgmOn = false }
    override fun release() { released = true }
}

class FakeBrandingSource(initial: BrandingState = BrandingState(isLoading = false)) : BrandingSource {
    private val _state = MutableStateFlow(initial)
    override val state: StateFlow<BrandingState> = _state
    val pauses = CopyOnWriteArrayList<Boolean>()
    @Volatile var advances = 0

    val paused: Boolean get() = pauses.lastOrNull() ?: false

    fun update(block: (BrandingState) -> BrandingState) { _state.value = block(_state.value) }
    override fun start() = Unit
    override fun setPollingPaused(paused: Boolean) { pauses += paused }
    override fun advanceWallpaper() { advances++ }
}
