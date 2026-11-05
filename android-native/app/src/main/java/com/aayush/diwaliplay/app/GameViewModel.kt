package com.aayush.diwaliplay.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.api.UndecodableResponseException
import com.aayush.diwaliplay.audio.defaultAudioSettings
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.SystemRandom
import com.aayush.diwaliplay.game.bomb.BombSim
import com.aayush.diwaliplay.game.flow.GameController
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.game.flow.HudState
import com.aayush.diwaliplay.game.flow.RoundSettings
import com.aayush.diwaliplay.game.flow.SessionInfo
import com.aayush.diwaliplay.model.DiwaliJson
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.RewardItem
import com.aayush.diwaliplay.model.SpinWheelRequest
import com.aayush.diwaliplay.model.User
import com.aayush.diwaliplay.model.VerifyCodeResponse
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** The code the web treats as a trial (`TRIAL_CODE`): handled here with no network and nothing persisted. */
internal const val TRIAL_CODE = "8536"
internal const val TRIAL_SESSION_ID = "trial_session_8536"
private const val TRIAL_USER_ID = "trial_user_8536"
private val TRIAL_USER = User(id = TRIAL_USER_ID, name = "Trial Player", mobileNumber = "0000000000")

internal const val CANT_REACH_SERVER_MESSAGE = "Can't reach the server — try again"
internal const val SERVER_ERROR_MESSAGE = "The server had a problem — try again"
private const val INVALID_CODE_MESSAGE = "Invalid 4-digit code"

private const val CODE_LENGTH = 4

/** KioskStartupScreen: "Welcome, name! Starting..." stays up this long. */
private const val WELCOME_MS = 800L
private const val AUDIO_READY_TIMEOUT_MS = 2_000L
private const val AUDIO_READY_POLL_MS = 50L

/** GameOverModal AUTO_RETURN_SECONDS. */
internal const val AUTO_RETURN_SECONDS = 20

/**
 * How long "Feedback recorded — Thank you!" shows. The web's bar sits on a screen that stays up anyway, so it has no
 * such value; here the feedback step ends the round, and without this the thanks would never be seen.
 */
internal const val FEEDBACK_THANKS_MS = 1_500L

/**
 * How long the wheel waits for today's rewards before using the copy it has. The web shows "Loading wheel..." for as long
 * as its fetch takes; a kiosk's cold server can take most of a minute, so this one gives up.
 */
internal const val WHEEL_REWARDS_TIMEOUT_MS = 2_500L

/** Opening the wish envelope: App.tsx onPlayChime, playSound('FLOWER_POT'). */
private const val ENVELOPE_CHIME = "FLOWER_POT"

data class StartUi(
    val code: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val serverReachable: Boolean = false,
    /** Set once a code is accepted, while the welcome shows. */
    val welcomeName: String? = null,
)

/**
 * What a round runs with, fixed at code acceptance until reset: admin changes that arrive meanwhile wait for the next
 * round, so the screens can't disagree with the controller.
 */
data class ActiveRound(
    val settings: RoundSettings,
    val wallpaperEnabled: Boolean,
    val wallpaperUrl: String,
    val wallpaperOpacity: Double,
    val isTrial: Boolean = false,
)

/** What the calibration screen shows, from [GameViewModel.sampleCalibration]. */
data class CalibrationUi(val leftActive: Boolean = false, val rightActive: Boolean = false, val holdProgress: Double = 0.0)

/**
 * Owns the round: [GameController], its [GameEffects], and the resources that follow the phase (camera, music,
 * branding polling, audio loading).
 *
 * Threads:
 * - main: the keypad, [onInterrupted], the phase/status collectors and the pipeline's start/stop.
 * - render thread: [frameStepper] only.
 * - effects thread: every [com.aayush.diwaliplay.game.flow.GameEffects] call, and `AudioEngine.apply`, so a `play`
 *   never waits on a load. The render thread never touches audio.
 */
class GameViewModel(
    private val deps: AppDependencies,
    scopeOverride: CoroutineScope? = null,
    effectsDispatcher: CoroutineDispatcher? = null,
    private val clock: RoundClock = RoundClock(),
    random: GameRandom = SystemRandom,
) : ViewModel() {
    private val scope: CoroutineScope = scopeOverride ?: viewModelScope

    // One thread, which exits when idle: nothing to shut down, so effects issued during teardown still finish.
    private val effectsScope = CoroutineScope(
        SupervisorJob() + (
            effectsDispatcher ?: ThreadPoolExecutor(1, 1, 5L, TimeUnit.SECONDS, LinkedBlockingQueue()) { Thread(it, "game-effects") }
                .apply { allowCoreThreadTimeOut(true) }
                .asCoroutineDispatcher()
            ),
    )
    private val background: CoroutineDispatcher = effectsDispatcher ?: Dispatchers.Default

    private val effects: RoundEffects =
        RoundEffects(deps.api, deps.results, deps.audio, deps.tracking, effectsScope, background, { controller }, deps.activeSession)
    private val controller: GameController = GameController(clock::now, random, effects)

    /** Render thread's entry point. */
    val frameStepper = GameFrameStepper(controller, deps.tracking, clock)

    val phase: StateFlow<GamePhase> get() = controller.phase
    val hud: StateFlow<HudState> get() = controller.hud
    val branding: StateFlow<BrandingState> get() = deps.branding.state
    val cameraStatus: StateFlow<TrackingStatus> get() = deps.tracking.status
    val tracking: TrackingSource get() = deps.tracking

    /** Null when this build of the dependencies has no admin access (most tests). */
    val admin: AdminDependencies? get() = deps.admin

    private val _cameraTestOn = MutableStateFlow(false)

    /** The admin screen's camera test is running. The round owns the camera the rest of the time. */
    val cameraTestOn: StateFlow<Boolean> = _cameraTestOn.asStateFlow()

    private val _perfOverlay = MutableStateFlow(false)

    /** Diagnostics, so deliberately not kept across restarts. */
    val perfOverlay: StateFlow<Boolean> = _perfOverlay.asStateFlow()

    /** The round's bombs, for tests to aim at. Written on the render thread. */
    internal val bombs: BombSim? get() = controller.bombs

    /** QR code content. */
    val registrationUrl: String get() = "${deps.publicWebUrl()}/register"

    private val _startUi = MutableStateFlow(StartUi())
    val startUi: StateFlow<StartUi> = _startUi.asStateFlow()

    private val _round = MutableStateFlow<ActiveRound?>(null)

    /** The current round's snapshot, from code acceptance until reset. */
    val round: StateFlow<ActiveRound?> = _round.asStateFlow()

    val backdrop: StateFlow<BackdropKind> = combine(controller.phase, _round) { p, r ->
        if (r == null) BackdropKind.Dark else backdropFor(p, r.settings.isTouchMode, r.wallpaperEnabled)
    }.stateIn(scope, SharingStarted.Eagerly, BackdropKind.Dark)

    private val _autoReturnSeconds = MutableStateFlow<Int?>(null)

    /** The "Returning in Ns" count while the end-of-round auto-return runs. */
    val autoReturnSeconds: StateFlow<Int?> = _autoReturnSeconds.asStateFlow()

    private val _feedbackRecorded = MutableStateFlow<GameFeedback?>(null)

    /** What the player just submitted, while the thanks shows. */
    val feedbackRecorded: StateFlow<GameFeedback?> = _feedbackRecorded.asStateFlow()

    @Volatile private var activePlayerName = "Player"
    private var autoReturnJob: Job? = null
    private var feedbackJob: Job? = null
    private var startJob: Job? = null
    private var previousPhase: GamePhase = GamePhase.Startup
    private var cameraOn = false
    private var lastAudioInput: AudioInput? = null
    private val calibrationHold = CalibrationHold()

    private class AudioInput(val state: BrandingState) {
        // Only what AudioEngine.apply reads; rotation and other settings must not reload sounds.
        val key = Triple(state.settings.audioSettings, state.localFiles, state.bombs.bombs)
        override fun equals(other: Any?) = other is AudioInput && other.key == key
        override fun hashCode() = key.hashCode()
    }

    init {
        effects.reportLeftoverSession()
        effects.startResults()
        deps.branding.start()
        scope.launch { controller.phase.collect(::syncToPhase) }
        scope.launch { deps.tracking.status.collect(::onTrackingStatus) }
        scope.launch { deps.serverReachable.collect { r -> _startUi.update { it.copy(serverReachable = r) } } }
        scope.launch {
            combine(deps.branding.state.map(::AudioInput), controller.phase) { input, p -> input to p }
                .collect { (input, p) -> applyAudio(input, p) }
        }
    }

    // ---- keypad ------------------------------------------------------------------------------------------

    private val keypadLocked: Boolean get() = _startUi.value.busy

    fun onKeypad(digit: Char) {
        if (keypadLocked || !digit.isDigit()) return
        _startUi.update { if (it.code.length >= CODE_LENGTH) it else it.copy(code = it.code + digit, error = null) }
    }

    fun onBackspace() {
        if (keypadLocked) return
        _startUi.update { if (it.code.isEmpty()) it else it.copy(code = it.code.dropLast(1), error = null) }
    }

    fun onClear() {
        if (keypadLocked) return
        _startUi.update { it.copy(code = "", error = null) }
    }

    /** Ignored without four digits, or while a code is being checked or a round is starting. Main thread. */
    fun onPlay() {
        val ui = _startUi.value
        if (ui.busy || ui.code.length != CODE_LENGTH || controller.phase.value != GamePhase.Startup) return
        stopCameraTest()
        _startUi.value = ui.copy(busy = true, error = null)
        val code = ui.code
        startJob = scope.launch {
            if (code == TRIAL_CODE) {
                beginRound(TRIAL_USER, SessionInfo(TRIAL_SESSION_ID, code, TRIAL_USER.name, isTrial = true, TRIAL_USER.mobileNumber))
            } else {
                verify(code)
            }
        }
    }

    private suspend fun verify(code: String) {
        when (val r = deps.api.verifyCode(code)) {
            is ApiResult.Success -> {
                val v = r.value
                val user = v.user
                if (v.success && v.valid && user != null) {
                    // App.tsx: without a session from verify, a guest id until startSession returns the real one.
                    val id = v.session?.id ?: "$GUEST_SESSION_PREFIX${System.currentTimeMillis()}_${Random.nextInt(0, Int.MAX_VALUE)}"
                    beginRound(user, SessionInfo(id, code, user.name, v.isTrial == true, user.mobileNumber.ifBlank { null }))
                } else {
                    failVerify(v.message.ifBlank { INVALID_CODE_MESSAGE }, keepCode = false)
                }
            }
            is ApiResult.HttpError -> {
                val message = messageIn(r.body)
                when {
                    r.code >= 500 -> failVerify(message ?: SERVER_ERROR_MESSAGE, keepCode = true)
                    else -> failVerify(message ?: INVALID_CODE_MESSAGE, keepCode = false)
                }
            }
            is ApiResult.NetworkError -> failVerify(
                if (r.cause is UndecodableResponseException) SERVER_ERROR_MESSAGE else CANT_REACH_SERVER_MESSAGE,
                keepCode = true,
            )
        }
    }

    private fun messageIn(body: String): String? = try {
        DiwaliJson.decodeFromString(VerifyCodeResponse.serializer(), body).message.ifBlank { null }
    } catch (_: IllegalArgumentException) {
        null
    }

    /** A rejected code is cleared, like the web; after a failure to get an answer, the same code can be retried. */
    private fun failVerify(message: String, keepCode: Boolean) {
        _startUi.update { it.copy(busy = false, error = message, code = if (keepCode) it.code else "") }
    }

    private suspend fun beginRound(user: User, session: SessionInfo) {
        _startUi.update { it.copy(welcomeName = user.name) }
        effectsScope.launch { deps.audio.playCracker(CHIME) }
        delay(WELCOME_MS)
        withTimeoutOrNull(AUDIO_READY_TIMEOUT_MS) {
            while (!deps.audio.isReady()) delay(AUDIO_READY_POLL_MS)
        }
        activePlayerName = user.name.ifBlank { "Player" }
        val branding = deps.branding.state.value
        val settings = roundSettings(branding)
        _round.value = ActiveRound(
            settings,
            branding.settings.wallpaperEnabled,
            branding.currentWallpaperUrl,
            branding.settings.wallpaperOpacity,
            session.isTrial,
        )
        frameStepper.prepareRound(settings.bombConfigs, settings.bombSettings)
        controller.onCodeAccepted(session, settings)
        syncToPhase(controller.phase.value)
        _startUi.update { StartUi(serverReachable = it.serverReachable) }
    }

    private fun roundSettings(b: BrandingState): RoundSettings {
        val s = b.settings
        return RoundSettings(
            gameDurationSeconds = s.gameDurationSeconds,
            gameplayMode = s.gameplayMode,
            targetScore = s.targetScore.takeIf { s.targetScoreEnabled && it > 0 },
            // App.tsx reads this from GET /api/rewards; the setting stands in until that has answered.
            rewardsEnabled = if (b.rewards.success) b.rewards.enabled else s.rewardsEnabled,
            tiers = s.achievementTiers,
            brandName = s.brandName,
            bombConfigs = b.bombs.bombs,
            bombSettings = b.bombs.settings,
        )
    }

    // ---- round -------------------------------------------------------------------------------------------

    /** Who the photo screen addresses. */
    fun playerName(): String = activePlayerName

    /** Touch-mode tap in 1920x1080 space. */
    fun onTouch(x: Double, y: Double) = controller.onTouch(x, y)

    fun onCardDone() = controller.onCardDone()

    fun onSpinDone(reward: RewardItem?) = controller.onSpinDone(reward)

    fun onFeedback(feedback: GameFeedback?) = controller.onFeedback(feedback)

    /**
     * Submit on the feedback bar: sends it and thanks the player. With a coupon showing, the existing countdown then runs
     * out, so the code stays up as long as it does on the web. With none, the round ends after the thanks. Main thread.
     */
    fun submitFeedback(feedback: GameFeedback) {
        val p = controller.phase.value as? GamePhase.Feedback ?: return
        if (_feedbackRecorded.value != null) return
        controller.onFeedbackSubmitted(feedback)
        _feedbackRecorded.value = feedback
        if (p.reward != null || p.earnedReward != null) return
        autoReturnJob?.cancel()
        _autoReturnSeconds.value = null
        feedbackJob = scope.launch {
            delay(FEEDBACK_THANKS_MS)
            controller.onFeedback(null)
        }
    }

    /**
     * The × button and the auto-return (GameOverModal triggerExit), from any end-of-round screen. Whatever steps are
     * left are skipped.
     */
    fun exitToStart() {
        controller.onCardDone()
        controller.onSpinDone(null)
        controller.onFeedback(null)
    }

    /** PLAY AGAIN: a trial round starts over (App.tsx handlePlayAgain); any other goes home. Main thread. */
    fun onPlayAgain() {
        val round = _round.value
        if (round?.isTrial != true) {
            exitToStart()
            return
        }
        cancelEndOfRound()
        // A run that has failed stays failed until restarted, and the replay deserves a working camera. If it still
        // won't start, syncToPhase finds that out straight away, so the photo doesn't sit out the 8 s watchdog.
        val status = deps.tracking.status.value
        if (cameraOn && (status is TrackingStatus.Failed || status is TrackingStatus.CameraLost)) {
            deps.tracking.stop()
            cameraOn = false
        }
        deps.branding.advanceWallpaper()
        _round.value = round.copy(wallpaperUrl = deps.branding.state.value.currentWallpaperUrl)
        controller.onPlayAgain()
        syncToPhase(controller.phase.value)
    }

    /** Asks the server for the wheel's result. Every failure, including no usable session id, is [SpinOutcome.Failed]. */
    suspend fun requestSpin(spin: GamePhase.Spin): SpinOutcome {
        val trial = _round.value?.isTrial == true
        val id = resolvedSessionId(spin.sessionId)
        // No server session for this round, so no reward can be recorded against it. Never send a guest id.
        if (id.startsWith(GUEST_SESSION_PREFIX)) return SpinOutcome.Failed
        val request = SpinWheelRequest(
            userId = if (trial) TRIAL_USER_ID else null,
            playerName = spin.playerName.ifBlank { if (trial) "Master Tester" else "Player" },
            mobileNumber = spin.mobileNumber?.ifBlank { null },
            sessionId = id,
        )
        val r = deps.api.spin(request) as? ApiResult.Success ?: return SpinOutcome.Failed
        val reward = r.value.reward ?: return SpinOutcome.Failed
        // A session that has already spun gets a 409 from the server, so it fails here with everything else.
        return if (r.value.success) SpinOutcome.Won(reward, r.value.rewardIndex) else SpinOutcome.Failed
    }

    /** Today's slices, as the web fetches them at game over. Null if they can't be had in time: use the cached ones. */
    suspend fun loadWheelRewards(): List<RewardItem>? = withTimeoutOrNull(WHEEL_REWARDS_TIMEOUT_MS) {
        val info = (deps.api.getRewards() as? ApiResult.Success)?.value
        if (info != null && info.success && info.rewards.isNotEmpty()) wheelRewards(info.rewards) else null
    }

    /**
     * The wheel has given its answer and the voucher's zoom is over, or there's nothing left to do on it: the 20 s
     * auto-return starts, as GameOverModal's does. Not for trial rounds.
     */
    fun onSpinSettled() = startAutoReturn()

    fun playEnvelopeChime() {
        effectsScope.launch { deps.audio.playCracker(ENVELOPE_CHIME) }
    }

    fun playSpinTick(speedRatio: Float) {
        effectsScope.launch { deps.audio.playSpinTick(speedRatio) }
    }

    fun playVictoryChime() {
        effectsScope.launch { deps.audio.playVictoryChime() }
    }

    /** One 20 s from its first trigger to the end of the round: on the web these steps are all one screen. */
    private fun startAutoReturn() {
        if (autoReturnJob?.isActive == true || _feedbackRecorded.value != null) return
        if (_round.value?.isTrial != false) return // the master session never kicks the tester out
        autoReturnJob = scope.launch {
            for (left in AUTO_RETURN_SECONDS downTo 1) {
                _autoReturnSeconds.value = left
                delay(1_000)
            }
            _autoReturnSeconds.value = null
            exitToStart()
        }
    }

    private fun cancelEndOfRound() {
        autoReturnJob?.cancel()
        autoReturnJob = null
        feedbackJob?.cancel()
        feedbackJob = null
        _autoReturnSeconds.value = null
        _feedbackRecorded.value = null
    }

    /**
     * The activity paused, the game surface went away, or the player backed out. Abandons a started round and returns
     * to the start screen. Surface loss counts too because the round clock is wall time: anything else would hand the
     * sims a jump when frames resumed. Main thread.
     */
    fun onInterrupted() {
        stopCameraTest()
        startJob?.cancel()
        startJob = null
        controller.onInterrupted()
        syncToPhase(controller.phase.value)
        _startUi.update { StartUi(serverReachable = it.serverReachable) }
    }

    /** The game surface went away. Harmless on the start screen, where the keypad state must survive. */
    fun onSurfaceLost() {
        if (controller.phase.value != GamePhase.Startup) onInterrupted()
    }

    /** "Grant & Start Camera". After a failure only stop-then-start restarts the pipeline. Main thread. */
    fun retryCamera() {
        deps.tracking.stop()
        if (_cameraTestOn.value) {
            deps.tracking.start(trackHands = true)
            return
        }
        cameraOn = false
        syncToPhase(controller.phase.value)
    }

    // ---- admin -------------------------------------------------------------------------------------------

    /**
     * Admin camera test, only from the start screen with no round starting, so it can't take the camera from one. It
     * never sets [cameraOn], which keeps its failures away from the controller. Main thread.
     */
    fun startCameraTest() {
        if (_cameraTestOn.value || cameraOn || _startUi.value.busy || controller.phase.value != GamePhase.Startup) return
        _cameraTestOn.value = true
        deps.tracking.start(trackHands = true)
    }

    /** Stops only the test's own camera. Main thread. */
    fun stopCameraTest() {
        if (!_cameraTestOn.value) return
        _cameraTestOn.value = false
        deps.tracking.stop()
    }

    fun setPerfOverlay(on: Boolean) {
        _perfOverlay.value = on
    }

    /**
     * [sessionId] (say `GamePhase.Spin.sessionId`) with the server's id if `startSession` has returned one. It stays
     * `guest_…` while that is still in flight, or if it failed. Any thread.
     */
    fun resolvedSessionId(sessionId: String): String = effects.currentServerId(sessionId)

    /** For the calibration screen's ring, polled at the web's 50 ms. */
    fun sampleCalibration(nowMs: Double = System.nanoTime() / 1e6): CalibrationUi {
        val hands = deps.tracking.snapshot().hands
        val left = hands.left.detected && hands.left.inTargetArea
        val right = hands.right.detected && hands.right.inTargetArea
        return CalibrationUi(left, right, calibrationHold.update(left && right, nowMs))
    }

    /** Idempotent, so [onInterrupted] can bring everything in line at once rather than on the collector's next turn. */
    private fun syncToPhase(p: GamePhase) {
        deps.branding.setPollingPaused(pollingPausedIn(p))
        if (p == GamePhase.Playing) deps.audio.startBgm() else deps.audio.stopBgm()

        val round = _round.value
        val wanted = round != null && cameraWanted(p, round.settings.isTouchMode, round.wallpaperEnabled)
        if (wanted && !cameraOn) {
            cameraOn = true
            deps.tracking.start(trackHands = round?.settings?.isTouchMode != true)
            onTrackingStatus(deps.tracking.status.value) // a refused start may repeat the last status, which emits nothing
        } else if (!wanted && cameraOn) {
            cameraOn = false
            deps.tracking.stop()
        }

        // A camera that was already running sends no new status (a trial replay of a live-camera touch round).
        if (cameraOn && deps.tracking.status.value is TrackingStatus.Running) controller.onPhotoCameraReady()

        when {
            p == GamePhase.Startup -> {
                cancelEndOfRound()
                effects.clearRoundSession()
            }
            // GameOverModal: with rewards off the countdown starts with the card.
            p is GamePhase.GameOver && round?.settings?.rewardsEnabled == false -> startAutoReturn()
            // Every way to feedback leaves the kiosk on its way home.
            p is GamePhase.Feedback -> startAutoReturn()
        }

        if (p == GamePhase.Startup && previousPhase != GamePhase.Startup) {
            _round.value = null
            deps.branding.advanceWallpaper()
        }
        previousPhase = p
    }

    private fun onTrackingStatus(status: TrackingStatus) {
        if (!cameraOn) return
        when (status) {
            // Only hand tracking failed: hands are already empty, and the photo can still be taken.
            is TrackingStatus.Failed -> if (!status.cameraAlive) controller.onCameraLost()
            is TrackingStatus.CameraLost -> controller.onCameraLost()
            is TrackingStatus.Running -> controller.onPhotoCameraReady()
            TrackingStatus.Starting -> Unit
        }
    }

    /** Only in the lobby: mid-round, a `play` could block on the loading lock. Catches up on the return to Startup. */
    private fun applyAudio(input: AudioInput, p: GamePhase) {
        if (p != GamePhase.Startup || input == lastAudioInput) return
        lastAudioInput = input
        val s = input.state
        effectsScope.launch {
            deps.audio.apply(s.settings.audioSettings ?: defaultAudioSettings(), s.localFiles, s.bombs.bombs)
        }
    }

    // ---- teardown ----------------------------------------------------------------------------------------

    /** Main thread. */
    internal fun release() {
        stopCameraTest()
        startJob?.cancel()
        deps.tracking.stop()
        cameraOn = false
        deps.audio.stopBgm()
        effectsScope.launch { deps.audio.release() }
        effects.close()
    }

    override fun onCleared() {
        // Report an unfinished round before the effects thread goes away.
        controller.onInterrupted()
        release()
        scope.cancel()
    }

    private companion object {
        /** KioskStartupScreen onPlayChime: playSound('CHAKRI'). */
        const val CHIME = "CHAKRI"
    }
}
