package com.aayush.diwaliplay.game.flow

import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.bomb.BombSim
import com.aayush.diwaliplay.game.bomb.parseBombColor
import com.aayush.diwaliplay.game.cracker.CrackerSim
import com.aayush.diwaliplay.game.cracker.Palettes
import com.aayush.diwaliplay.game.play.PlayDirector
import com.aayush.diwaliplay.game.play.PlayEvent
import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.Point2D
import com.aayush.diwaliplay.model.TrackedHand
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

/**
 * Round state machine ported from src/App.tsx (phase flow, countdown, round timer, completeSession, reset)
 * plus the PhotoCaptureModal countdown. See [GamePhase].
 *
 * Time: [clock] returns milliseconds (like `performance.now()`); timed transitions (READY flash, countdown,
 * round timer, photo countdown, camera-error and watchdog delays) advance only in [onFrame], so the render loop
 * must keep calling it from code acceptance until the card is shown.
 *
 * Threading: [onFrame] runs on the render thread; every other entry point may come from the UI thread. All
 * state sits behind one lock. The simulations ([crackers], [bombs]) are mutated only inside [onFrame]: touches
 * are queued by [onTouch] and applied at the start of the next frame, and resets requested from the UI thread
 * are deferred to the next frame, so the renderer can read the sims' views on the render thread without races.
 * [GameEffects] calls are collected under the lock and made after it is released.
 */
class GameController(
    private val clock: () -> Double,
    private val random: GameRandom,
    private val effects: GameEffects,
) {
    private val lock = Any()
    private val outbox = ArrayList<() -> Unit>()

    private val _phase = MutableStateFlow<GamePhase>(GamePhase.Startup)
    val phase: StateFlow<GamePhase> = _phase.asStateFlow()

    private val _hud = MutableStateFlow(HudState())
    val hud: StateFlow<HudState> = _hud.asStateFlow()

    /** Cracker/sparkle particles. Render thread only (read its views after [onFrame]). */
    val crackers = CrackerSim(random = random)

    /** This round's bombs while [GamePhase.Playing], else null (the web unmounts BombGameOverlay). Render thread only. */
    @Volatile
    var bombs: BombSim? = null
        private set

    private var session: SessionInfo? = null
    private var settings = RoundSettings()
    private var sessionId = ""
    private var director = PlayDirector(crackers, null)

    private var phaseStartMs = 0.0
    private var countdownIndex = 0
    private var photoStep = 0
    private var photoRequestedAtMs = 0.0
    private var photoRequested = false

    private var sessionStarted = false
    private var completed = false
    private var completedSessionId = ""
    private var cameraLost = false
    private var photoCameraReady = false
    private var feedbackSent = false
    private var simResetPending = false

    private val touchQueue = DoubleArray(MAX_QUEUED_TOUCHES * 2)
    private var touchCount = 0
    private val handPoints = ArrayList<Point2D>(2)

    // ---------------------------------------------------------------------------------------------
    // UI-thread entry points
    // ---------------------------------------------------------------------------------------------

    /** A verified code starts a round (KioskStartupScreen onCodeVerified). Ignored unless in [GamePhase.Startup]. */
    fun onCodeAccepted(session: SessionInfo, settings: RoundSettings) = locked {
        if (_phase.value != GamePhase.Startup) return@locked
        beginRound(session, settings)
    }

    private fun beginRound(session: SessionInfo, settings: RoundSettings) {
        this.session = session
        this.settings = settings
        sessionId = session.sessionId
        director = PlayDirector(crackers, settings.targetScore)
        simResetPending = true
        _hud.value = hudFor(director, settings.effectiveDurationSeconds)
        // Touch mode: "Skip calibration, go directly to countdown!"
        if (settings.isTouchMode) startCountdown(clock()) else _phase.value = GamePhase.Calibrating(ready = false)
    }

    /**
     * "PLAY AGAIN" on the game-over screen, at any time (App.tsx handlePlayAgain). A trial round starts over with the same
     * session and settings, without re-entering the code; any other round goes back to [GamePhase.Startup]. Its result
     * is already in, so there's nothing to abandon. Ignored off that screen.
     */
    fun onPlayAgain() = locked {
        if (_phase.value !is GamePhase.GameOver) return@locked
        val s = session
        val round = settings
        if (s != null && s.isTrial) {
            clearRound()
            beginRound(s, round)
        } else {
            resetToStartup()
        }
    }

    /**
     * The server's id from `startSession(code)` (App.tsx sets activeSessionIdRef from the response). Keyed by
     * [code]: ignored unless this round has issued startSession for the same code, so a late response from an
     * interrupted earlier round can't overwrite the current round's id.
     */
    fun onSessionStarted(code: String, sessionId: String) = locked {
        val s = session ?: return@locked
        if (s.isTrial || !sessionStarted || code != s.code || sessionId.isBlank()) return@locked
        this.sessionId = sessionId
        (_phase.value as? GamePhase.GameOver)?.let { _phase.value = it.copy(sessionId = sessionId) }
    }

    /**
     * The completeSession response's `session.earnedReward` (App.tsx setEarnedReward). Keyed by [sessionId] (the
     * id the request was sent with). A slow server can answer after the player has gone: then it's dropped.
     */
    fun onRoundCompleted(sessionId: String, earnedReward: EarnedReward?) = locked {
        if (!completed || sessionId != completedSessionId || earnedReward == null) return@locked
        val p = _phase.value as? GamePhase.GameOver ?: return@locked
        _phase.value = p.copy(card = p.card.withEarnedReward(earnedReward))
    }

    /**
     * `completeSession` is over: the server took it, or the failure is with the queue. The wheel can be spun now: the server
     * files a spin's prize where completion looks for the score prize, so the spin mustn't arrive first. Keyed like
     * [onRoundCompleted].
     */
    fun onCompletionAnswered(sessionId: String) = locked {
        if (completed && sessionId == completedSessionId) releaseSpinHold()
    }

    /** The server is taking too long: the player has waited enough, and the wheel goes ahead anyway. */
    fun onSpinHoldExpired() = locked { releaseSpinHold() }

    private fun releaseSpinHold() {
        val p = _phase.value as? GamePhase.GameOver ?: return
        if (p.spinHeld) _phase.value = p.copy(spinHeld = false)
    }

    /** Touch-mode tap in 1920x1080 space; applied to the bombs on the next [onFrame]. */
    fun onTouch(x: Double, y: Double) = locked {
        if (_phase.value != GamePhase.Playing || !settings.isTouchMode || touchCount >= MAX_QUEUED_TOUCHES) return@locked
        touchQueue[touchCount * 2] = x
        touchQueue[touchCount * 2 + 1] = y
        touchCount++
    }

    /**
     * Camera error. From the countdown on, the round keeps running with hands "not detected" and the photo step
     * becomes PhotoCaptureModal's camera-error path (no photo, card after 2.2 s). During calibration nothing
     * changes here: the UI shows the camera error (Retry / exit via [onInterrupted]).
     */
    fun onCameraLost() = locked {
        when (val p = _phase.value) {
            is GamePhase.Countdown, GamePhase.Playing -> cameraLost = true
            is GamePhase.PhotoCountdown -> {
                cameraLost = true
                if (!p.cameraError) enterPhotoCameraError(clock())
            }
            else -> Unit
        }
    }

    /**
     * The camera is delivering frames. Camera rounds have been tracking all along and never wait for this; a touch round
     * does, because its camera may only open for the photo. PhotoCaptureModal: the countdown starts "strictly once camera
     * is verified ready". May come at any time; it holds for the rest of the round.
     */
    fun onPhotoCameraReady() = locked {
        photoCameraReady = true
        val p = _phase.value
        if (p is GamePhase.PhotoCountdown && p.waitingForCamera) startPhotoCountdown(clock())
    }

    /** The capture has run, ahead of [onPhotoCaptured]. Only a real still gets the flash and the stamp. */
    fun onStillTaken(success: Boolean) = locked {
        val p = _phase.value
        if (success && photoRequested && p is GamePhase.PhotoCountdown && !p.cameraError) _phase.value = p.copy(captured = true)
    }

    /** The still requested via [GameEffects.requestPhoto] (null when capture failed). */
    fun onPhotoCaptured(jpeg: ByteArray?) = locked {
        if (_phase.value is GamePhase.PhotoCountdown) finishRound(jpeg)
    }

    /** The player tapped a feedback option: sent now, once per round, and the screen stays up. Trial rounds send nothing. */
    fun onFeedbackSubmitted(feedback: GameFeedback) = locked {
        if (_phase.value !is GamePhase.GameOver) return@locked
        val s = session
        if (feedbackSent || s == null || s.isTrial || sessionId.isBlank()) return@locked
        feedbackSent = true
        val id = sessionId
        outbox += { effects.submitFeedback(id, feedback) }
    }

    /** The × button or the auto-return: home from the game-over screen, a trial round included. Ignored off that screen. */
    fun onExit() = locked {
        if (_phase.value is GamePhase.GameOver) resetToStartup()
    }

    /**
     * Activity paused or recreated. A started, not yet completed, non-trial round is abandoned with reason
     * "interrupted"; then everything resets to [GamePhase.Startup]. Before the countdown ends the server session
     * has not been started, so there is nothing to abandon.
     */
    fun onInterrupted() = locked {
        if (_phase.value == GamePhase.Startup) return@locked
        val s = session
        if (s != null && !s.isTrial && sessionStarted && !completed && sessionId.isNotBlank()) {
            val id = sessionId
            outbox += { effects.abandonSession(id, ABANDON_INTERRUPTED) }
        }
        resetToStartup()
    }

    // ---------------------------------------------------------------------------------------------
    // Render thread
    // ---------------------------------------------------------------------------------------------

    /**
     * One render frame. [left]/[right] are this frame's tracked hands; [calibrated] is HandTracker.isCalibrated
     * (both hands held in their boxes for 1 s). Sparkles follow tracked hands in every round phase; scoring and
     * bombs run only while [GamePhase.Playing].
     */
    fun onFrame(dtSeconds: Double, left: TrackedHand, right: TrackedHand, calibrated: Boolean) = locked {
        val now = clock()
        if (simResetPending) {
            simResetPending = false
            crackers.reset()
        }
        val start = _phase.value
        if (start == GamePhase.Startup) return@locked
        val handsOff = cameraLost || settings.isTouchMode  // touch mode runs no hand tracking on the web
        val l = if (handsOff || !left.detected) NO_LEFT else left
        val r = if (handsOff || !right.detected) NO_RIGHT else right

        when (start) {
            is GamePhase.Calibrating -> frameCalibrating(start, now, calibrated)
            is GamePhase.Countdown -> advanceCountdown(now)
            GamePhase.Playing -> framePlaying(dtSeconds, now, l, r)
            is GamePhase.PhotoCountdown -> advancePhoto(start, now)
            else -> Unit
        }
        if (start != GamePhase.Playing) director.step(dtSeconds, false, l, r)
        crackers.step(dtSeconds)
    }

    // ---------------------------------------------------------------------------------------------
    // Transitions (called under the lock)
    // ---------------------------------------------------------------------------------------------

    private fun frameCalibrating(p: GamePhase.Calibrating, now: Double, calibrated: Boolean) {
        if (!p.ready) {
            if (calibrated && !cameraLost) {
                phaseStartMs = now
                _phase.value = GamePhase.Calibrating(ready = true)
            }
        } else if (now - phaseStartMs >= READY_FLASH_MS) {
            startCountdown(now)
        }
    }

    private fun startCountdown(now: Double) {
        phaseStartMs = now
        countdownIndex = 0
        _phase.value = GamePhase.Countdown(3)
        sound(FlowSoundKeys.COUNTDOWN_3)
    }

    /** Index 0..3 shows 3, 2, 1, GO (850 ms apart); index 4 starts the round. */
    private fun advanceCountdown(now: Double) {
        val due = floor((now - phaseStartMs) / COUNTDOWN_STEP_MS).toInt()
        while (countdownIndex < due && _phase.value is GamePhase.Countdown) {
            countdownIndex++
            when (countdownIndex) {
                1 -> { _phase.value = GamePhase.Countdown(2); sound(FlowSoundKeys.COUNTDOWN_2) }
                2 -> { _phase.value = GamePhase.Countdown(1); sound(FlowSoundKeys.COUNTDOWN_1) }
                3 -> { _phase.value = GamePhase.Countdown(0); sound(FlowSoundKeys.COUNTDOWN_GO) }
                else -> startPlaying(now)
            }
        }
    }

    private fun startPlaying(now: Double) {
        // resetGameScore(): fresh score state and a cleared cracker engine.
        director = PlayDirector(crackers, settings.targetScore)
        crackers.reset()
        bombs = BombSim(settings.bombConfigs, settings.bombSettings, random).also { it.touchMode = settings.isTouchMode }
        touchCount = 0
        phaseStartMs = now
        _phase.value = GamePhase.Playing
        _hud.value = hudFor(director, settings.effectiveDurationSeconds)
        val s = session ?: return
        if (!s.isTrial) {
            sessionStarted = true
            outbox += { effects.startSession(s.code) }
        }
    }

    private fun framePlaying(dt: Double, now: Double, l: TrackedHand, r: TrackedHand) {
        val leftSec = max(0.0, settings.effectiveDurationSeconds - (now - phaseStartMs) / 1000.0)
        if (leftSec <= 0.0) {
            endRound(now)
            return
        }
        val sim = bombs ?: return
        for (i in 0 until touchCount) sim.touch(touchQueue[i * 2], touchQueue[i * 2 + 1], now)
        touchCount = 0

        director.step(dt, true, l, r)

        handPoints.clear()
        if (l.detected) handPoints += Point2D(l.pixelX, l.pixelY)
        if (r.detected) handPoints += Point2D(r.pixelX, r.pixelY)
        sim.step(dt, now, handPoints)

        // BombGameOverlay burst order: burst sound, recordBombTouch, particles; then the score's side effects.
        for (hit in sim.drainHits()) {
            sound(FlowSoundKeys.bombBurst(hit.config))
            director.recordBombHit(hit.points, hit.isPenalty, now)
            // web triggerBombBurstParticles(x, y, color) never passes isPenalty: penalty bombs burst the same way
            crackers.createBombBurst(hit.x, hit.y, parseBombColor(hit.config.color))
            handlePlayEvents()
        }
        _hud.value = hudFor(director, ceil(leftSec).toInt())
    }

    private fun handlePlayEvents() {
        for (e in director.drainEvents()) {
            when (e) {
                is PlayEvent.PlaySound -> sound(e.key)
                // App.tsx target popup: triggerBombBurstParticles(innerWidth / 2, innerHeight * 0.35, '#F59E0B')
                PlayEvent.TargetReached -> crackers.createBombBurst(TARGET_BURST_X, TARGET_BURST_Y, Palettes.AMBER)
                else -> Unit  // combo notice / penalty: the UI reads HudState
            }
        }
    }

    private fun endRound(now: Double) {
        bombs = null
        touchCount = 0
        _hud.value = hudFor(director, 0)
        phaseStartMs = now
        photoRequested = false
        if (cameraLost) {
            enterPhotoCameraError(now)
        } else if (!settings.isTouchMode || photoCameraReady) {
            startPhotoCountdown(now)
        } else {
            _phase.value = GamePhase.PhotoCountdown(PHOTO_COUNTDOWN_START, waitingForCamera = true)
        }
    }

    private fun startPhotoCountdown(now: Double) {
        phaseStartMs = now
        photoStep = PHOTO_COUNTDOWN_START
        _phase.value = GamePhase.PhotoCountdown(PHOTO_COUNTDOWN_START)
        sound(FlowSoundKeys.COUNTDOWN_1)  // handlePlayTick = playCountdownStep(1)
    }

    private fun enterPhotoCameraError(now: Double) {
        phaseStartMs = now
        _phase.value = GamePhase.PhotoCountdown(0, cameraError = true)
    }

    private fun advancePhoto(p: GamePhase.PhotoCountdown, now: Double) {
        if (p.cameraError) {
            if (now - phaseStartMs >= PHOTO_CAMERA_ERROR_MS) finishRound(null)
            return
        }
        if (p.waitingForCamera) {
            if (now - phaseStartMs >= PHOTO_WATCHDOG_MS) enterPhotoCameraError(now)
            return
        }
        if (photoRequested) {
            if (now - photoRequestedAtMs >= PHOTO_WATCHDOG_MS) finishRound(null)
            return
        }
        val target = max(0, PHOTO_COUNTDOWN_START - floor((now - phaseStartMs) / PHOTO_STEP_MS).toInt())
        while (photoStep > target) {
            photoStep--
            _phase.value = GamePhase.PhotoCountdown(photoStep)
            if (photoStep > 0) {
                sound(FlowSoundKeys.COUNTDOWN_1)
            } else {
                sound(FlowSoundKeys.PHOTO_SHUTTER)
                photoRequested = true
                photoRequestedAtMs = now
                outbox += { effects.requestPhoto() }
            }
        }
    }

    /** handlePhotoCaptured: game-over sound, completeSession, then the card. */
    private fun finishRound(jpeg: ByteArray?) {
        if (completed) return
        completed = true
        completedSessionId = sessionId
        val s = session ?: return
        val score = director.score
        sound(FlowSoundKeys.GAME_OVER)
        val completing = !s.isTrial && sessionId.isNotBlank()
        if (completing) {
            val req = buildCompleteSessionRequest(sessionId, score, jpeg, settings.targetScore)
            outbox += { effects.completeSession(req) }
        }
        _phase.value = GamePhase.GameOver(buildRoundCard(s.userName, score, jpeg, settings, random), sessionId, s.mobileNumber, spinHeld = completing)
    }

    private fun resetToStartup() {
        clearRound()
        _hud.value = HudState()
        _phase.value = GamePhase.Startup
    }

    private fun clearRound() {
        session = null
        settings = RoundSettings()
        sessionId = ""
        director = PlayDirector(crackers, null)
        bombs = null
        touchCount = 0
        sessionStarted = false
        completed = false
        completedSessionId = ""
        cameraLost = false
        photoCameraReady = false
        feedbackSent = false
        photoRequested = false
        simResetPending = true
    }

    // ---------------------------------------------------------------------------------------------

    private fun sound(key: String) {
        outbox += { effects.playSound(key) }
    }

    private fun hudFor(d: PlayDirector, secondsLeft: Int) = hudStateOf(d.score, secondsLeft, settings.targetScore)

    private inline fun locked(block: () -> Unit) {
        val pending: List<() -> Unit> = synchronized(lock) {
            block()
            if (outbox.isEmpty()) emptyList() else ArrayList(outbox).also { outbox.clear() }
        }
        for (action in pending) action()
    }

    private companion object {
        const val ABANDON_INTERRUPTED = "interrupted"
        const val MAX_QUEUED_TOUCHES = 16
        val NO_LEFT = TrackedHand(side = "left", detected = false)
        val NO_RIGHT = TrackedHand(side = "right", detected = false)
    }
}
