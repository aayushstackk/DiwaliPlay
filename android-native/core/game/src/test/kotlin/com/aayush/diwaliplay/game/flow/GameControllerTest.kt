package com.aayush.diwaliplay.game.flow

import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.model.DEFAULT_BOMB_CONFIGS
import com.aayush.diwaliplay.game.calculateAchievement
import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.GameScoreState
import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.TrackedHand
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * Expected values are derived by hand from src/App.tsx and src/components/PhotoCaptureModal.tsx:
 *  - READY flash: setTimeout(startCountdownSequence, 350) after the 1 s hold (hold itself = HandTracker).
 *  - Countdown: playCountdownStep(3) at t0, then setInterval 850 ms → 2 (850), 1 (1700), GO (2550),
 *    PLAYING + startSession at the 4th tick (3400).
 *  - Round timer: left = max(0, duration - elapsed); left <= 0 → PHOTO_COUNTDOWN.
 *  - Photo: tick (playCountdownStep(1)) at 5, then every 1000 ms 4,3,2,1; at 0 shutter + capture.
 *    Camera error: 2200 ms later onPhotoCaptured(null).
 *  - handlePhotoCaptured: playSfx('game_over'), completeSession(...), GAME_OVER.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GameControllerTest {

    private class FakeEffects : GameEffects {
        val calls = ArrayList<String>()
        val completes = ArrayList<com.aayush.diwaliplay.model.CompleteSessionRequest>()
        val sounds = ArrayList<String>()
        override fun startSession(code: String) { calls += "start:$code" }
        override fun completeSession(req: com.aayush.diwaliplay.model.CompleteSessionRequest) {
            calls += "complete:${req.sessionId}"; completes += req
        }
        override fun abandonSession(sessionId: String, reason: String) { calls += "abandon:$sessionId:$reason" }
        override fun playSound(key: String) { sounds += key }
        override fun requestPhoto() { calls += "photo" }
        override fun submitFeedback(sessionId: String, feedback: GameFeedback) { calls += "feedback:$sessionId:$feedback" }
        fun serverCalls() = calls.filter { !it.startsWith("photo") }
    }

    private var now = 1000.0
    private val fx = FakeEffects()
    private val c = GameController(clock = { now }, random = Mulberry32(11), effects = fx)

    private val session = SessionInfo(sessionId = "sess_1", code = "1234", userName = "Asha", isTrial = false, mobileNumber = "9876543210")
    private val trial = SessionInfo(sessionId = "trial_session_8536", code = "8536", userName = "Trial Player", isTrial = true)
    private val camera = RoundSettings(gameDurationSeconds = 35, gameplayMode = "camera", targetScore = null, rewardsEnabled = true, tiers = null)
    private val touch = camera.copy(gameplayMode = "touch")

    private val noHand = TrackedHand(side = "left", detected = false)
    private fun fastHand(side: String) = TrackedHand(
        side = side, detected = true, pixelX = 600.0, pixelY = 500.0, movementSpeed = 400.0, gesture = HandGesture.OPEN_PALM,
    )

    /** Advance the fake clock by [ms] in frames of at most [stepMs], calling onFrame each time. */
    private fun run(ms: Double, stepMs: Double = 100.0, calibrated: Boolean = false, l: TrackedHand = noHand, r: TrackedHand = noHand) {
        var left = ms
        while (left > 1e-9) {
            val d = minOf(stepMs, left)
            now += d
            left -= d
            c.onFrame(d / 1000.0, l, r, calibrated)
        }
    }

    /** Camera mode: calibrate, READY 350 ms, countdown 3400 ms → Playing. */
    private fun toPlaying(s: SessionInfo = session, settings: RoundSettings = camera) {
        c.onCodeAccepted(s, settings)
        if (settings.gameplayMode == "camera") {
            run(0.0); c.onFrame(0.016, noHand, noHand, calibrated = true)
            run(350.0)
        }
        run(3400.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.Playing)
    }

    /** Plays [s] through to the card. */
    private fun toCard(s: SessionInfo, settings: RoundSettings = camera) {
        toPlaying(s, settings)
        run(35_100.0)
        run(5_100.0)
        c.onPhotoCaptured(null)
        assertThat(c.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
    }

    @Test
    fun playAgainRestartsATrialRoundAtCalibrationWithNoCodeOrServerCalls() {
        toCard(trial)
        c.onCardDone()
        c.onSpinDone(null)
        c.onPlayAgain()
        assertThat(c.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
        assertThat(fx.serverCalls()).isEmpty()

        // A whole second round runs, with a fresh score, and is still a trial.
        run(0.0); c.onFrame(0.016, noHand, noHand, calibrated = true)
        run(350.0)
        run(3400.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.Playing)
        assertThat(c.hud.value.score).isEqualTo(0)
        run(35_100.0)
        run(5_100.0)
        c.onPhotoCaptured(null)
        assertThat(c.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
        assertThat(fx.serverCalls()).isEmpty()
    }

    @Test
    fun playAgainInTouchModeGoesStraightToTheCountdown() {
        toCard(trial, touch)
        c.onPlayAgain()
        assertThat(c.phase.value).isEqualTo(GamePhase.Countdown(3))
    }

    @Test
    fun playAgainOnARealRoundGoesHomeWithoutAbandoning() {
        toCard(session)
        c.onPlayAgain()
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(fx.calls.filter { it.startsWith("abandon") }).isEmpty()
    }

    @Test
    fun playAgainIsIgnoredMidRound() {
        toPlaying(trial)
        c.onPlayAgain()
        assertThat(c.phase.value).isEqualTo(GamePhase.Playing)
    }

    @Test
    fun fullCameraRoundReachesStartupWithOneCompleteCall() {
        c.onCodeAccepted(session, camera)
        assertThat(c.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
        run(500.0, calibrated = false)
        assertThat(c.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))

        // Hold complete (HandTracker.isCalibrated) → READY; countdown starts 350 ms later.
        c.onFrame(0.016, noHand, noHand, calibrated = true)
        assertThat(c.phase.value).isEqualTo(GamePhase.Calibrating(ready = true))
        run(349.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.Calibrating(ready = true))
        run(1.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.Countdown(3))
        run(850.0); assertThat(c.phase.value).isEqualTo(GamePhase.Countdown(2))
        run(850.0); assertThat(c.phase.value).isEqualTo(GamePhase.Countdown(1))
        run(850.0); assertThat(c.phase.value).isEqualTo(GamePhase.Countdown(0)) // GO!
        assertThat(fx.calls).isEmpty()
        run(849.0); assertThat(c.phase.value).isEqualTo(GamePhase.Countdown(0))
        run(1.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.Playing)
        assertThat(fx.calls).containsExactly("start:1234")
        assertThat(fx.sounds).containsExactly(
            FlowSoundKeys.COUNTDOWN_3, FlowSoundKeys.COUNTDOWN_2, FlowSoundKeys.COUNTDOWN_1, FlowSoundKeys.COUNTDOWN_GO,
        ).inOrder()

        run(35_000.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
        run(4000.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.PhotoCountdown(1))
        assertThat(fx.calls).doesNotContain("photo")
        run(1000.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.PhotoCountdown(0)) // CLICK!
        assertThat(fx.calls.count { it == "photo" }).isEqualTo(1)
        // 5 photo ticks use the countdown "1" beep (handlePlayTick), then the shutter.
        assertThat(fx.sounds.drop(4)).containsExactly(
            FlowSoundKeys.COUNTDOWN_1, FlowSoundKeys.COUNTDOWN_1, FlowSoundKeys.COUNTDOWN_1,
            FlowSoundKeys.COUNTDOWN_1, FlowSoundKeys.COUNTDOWN_1, FlowSoundKeys.PHOTO_SHUTTER,
        ).inOrder()

        val jpeg = byteArrayOf(1, 2, 3)
        c.onPhotoCaptured(jpeg)
        c.onPhotoCaptured(jpeg) // duplicate delivery is ignored
        assertThat(fx.sounds.last()).isEqualTo(FlowSoundKeys.GAME_OVER)
        val over = c.phase.value as GamePhase.GameOver
        assertThat(over.card.photoJpeg).isSameInstanceAs(jpeg)
        assertThat(over.card.playerName).isEqualTo("Asha")
        // score 0 → default "tier_sparkler" (0..999)
        assertThat(over.card.achievement).isEqualTo(calculateAchievement(0, null, 0, 0))
        assertThat(over.card.achievement.title).isEqualTo("Festive Sparkler")
        assertThat(fx.completes).hasSize(1)
        // "AQID" = base64(01 02 03)
        assertThat(fx.completes[0].photoData).isEqualTo("data:image/jpeg;base64,AQID")

        c.onCardDone()
        assertThat(c.phase.value).isEqualTo(GamePhase.Spin(sessionId = "sess_1", playerName = "Asha", mobileNumber = "9876543210"))
        c.onSpinDone(null)
        assertThat(c.phase.value).isEqualTo(GamePhase.Feedback(null))
        c.onFeedback(GameFeedback.Excellent)
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)

        assertThat(fx.serverCalls()).containsExactly(
            "start:1234", "complete:sess_1", "feedback:sess_1:Excellent",
        ).inOrder()
    }

    @Test
    fun touchModeSkipsCalibration() {
        val seen = ArrayList<GamePhase>()
        c.onCodeAccepted(session, touch)
        seen += c.phase.value
        assertThat(c.phase.value).isEqualTo(GamePhase.Countdown(3))
        assertThat(fx.sounds).containsExactly(FlowSoundKeys.COUNTDOWN_3)
        run(3400.0)
        seen += c.phase.value
        assertThat(c.phase.value).isEqualTo(GamePhase.Playing)
        assertThat(seen.none { it is GamePhase.Calibrating }).isTrue()
        assertThat(c.bombs!!.touchMode).isTrue()
    }

    @Test
    fun trialRoundNeverCallsServer() {
        toPlaying(trial)
        run(35_000.0)
        run(5000.0)
        c.onPhotoCaptured(null)
        assertThat(c.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
        c.onCardDone()
        // Trial/master sessions still get the (test-mode) wheel: GameOverModal isMasterSession, App.tsx isTestMode.
        // The spin request is the screen's job and is not one of the forbidden GameEffects calls.
        assertThat(c.phase.value).isEqualTo(GamePhase.Spin("trial_session_8536", "Trial Player", null))
        c.onSpinDone(null)
        assertThat(c.phase.value).isEqualTo(GamePhase.Feedback(null))
        c.onFeedback(GameFeedback.Good)
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)

        // An interrupted trial round doesn't abandon either.
        toPlaying(trial)
        c.onInterrupted()
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(fx.serverCalls()).isEmpty()
    }

    @Test
    fun timerUsesConfiguredDuration() {
        toPlaying(settings = camera.copy(gameDurationSeconds = 10))
        assertThat(c.hud.value.secondsLeftCeil).isEqualTo(10)
        run(9_000.0)
        // left = 10 - 9.0 = 1.0 → ceil 1
        assertThat(c.hud.value.secondsLeftCeil).isEqualTo(1)
        run(999.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.Playing)
        run(1.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
        assertThat(c.hud.value.secondsLeftCeil).isEqualTo(0)
    }

    @Test
    fun nonPositiveDurationFallsBackTo35() {
        // App.tsx: gameDurationSeconds > 0 ? it : GAME_DURATION_SECONDS (35)
        toPlaying(settings = camera.copy(gameDurationSeconds = 0))
        assertThat(c.hud.value.secondsLeftCeil).isEqualTo(35)
    }

    @Test
    fun hudEmitsOnlyOnChange() = runTest {
        val emitted = ArrayList<HudState>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { c.hud.toList(emitted) }
        toPlaying(settings = camera.copy(gameDurationSeconds = 3))
        // 3 s of 60 fps frames: only the integer second changes (3 → 2 → 1 → 0).
        run(3000.0, stepMs = 1000.0 / 60)
        assertThat(c.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
        assertThat(emitted.map { it.secondsLeftCeil }).containsExactly(0, 3, 2, 1, 0).inOrder()
        assertThat(emitted.map { it.score }.distinct()).containsExactly(0)
    }

    @Test
    fun rewardsDisabledSkipsSpin() {
        toPlaying(settings = camera.copy(rewardsEnabled = false))
        run(35_000.0)
        run(5000.0)
        c.onPhotoCaptured(null)
        c.onCardDone()
        assertThat(c.phase.value).isEqualTo(GamePhase.Feedback(null))
        c.onSpinDone(null) // stray call is ignored
        assertThat(c.phase.value).isEqualTo(GamePhase.Feedback(null))
        c.onFeedback(null) // skipped feedback: nothing submitted
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(fx.serverCalls()).containsExactly("start:1234", "complete:sess_1").inOrder()
    }

    @Test
    fun cameraLostMidRoundStillCompletesRound() {
        toPlaying()
        run(5_000.0)
        c.onCameraLost()
        val particlesBefore = c.crackers.activeCount
        // Stale "detected" hands after the loss are treated as not detected: no sparkles, no maxSpeed.
        run(30_000.0, l = fastHand("left"), r = fastHand("right"))
        assertThat(c.crackers.activeCount).isAtMost(particlesBefore)
        assertThat(c.phase.value).isEqualTo(GamePhase.PhotoCountdown(0, cameraError = true))
        run(2199.0)
        assertThat(fx.completes).isEmpty()
        run(1.0)
        // PhotoCaptureModal camera error: 2200 ms, then onPhotoCaptured(null).
        val over = c.phase.value as GamePhase.GameOver
        assertThat(over.card.photoJpeg).isNull()
        assertThat(fx.calls).doesNotContain("photo")
        assertThat(fx.completes).hasSize(1)
        assertThat(fx.completes[0].photoData).isNull()
        assertThat(fx.completes[0].maxSpeed).isEqualTo(0.0)
    }

    @Test
    fun interruptedMidRoundAbandonsAndResets() {
        toPlaying()
        run(2_000.0)
        c.onInterrupted()
        c.onInterrupted()
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(fx.serverCalls().count { it.startsWith("abandon") }).isEqualTo(1)
        assertThat(fx.serverCalls()).contains("abandon:sess_1:interrupted")
        assertThat(c.bombs).isNull()
        // Nothing advances afterwards, and a late photo is ignored.
        run(60_000.0)
        c.onPhotoCaptured(byteArrayOf(9))
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(fx.completes).isEmpty()
    }

    @Test
    fun interruptedBeforeSessionStartResetsWithoutAbandon() {
        // startSession only happens when the countdown ends; before that the server session is untouched.
        c.onCodeAccepted(session, camera)
        run(200.0)
        c.onInterrupted()
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(fx.serverCalls()).isEmpty()
    }

    @Test
    fun interruptedAfterCompletionDoesNotAbandon() {
        toPlaying()
        run(40_000.0)
        c.onPhotoCaptured(null)
        c.onInterrupted()
        assertThat(c.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(fx.serverCalls()).containsExactly("start:1234", "complete:sess_1").inOrder()
    }

    @Test
    fun sessionIdFromStartSessionIsUsedForCompletion() {
        // App.tsx: activeSessionIdRef = res.session.id after startSession resolves.
        toPlaying(session.copy(sessionId = ""))
        c.onSessionStarted("1234", "sess_new")
        run(40_000.0)
        c.onPhotoCaptured(null)
        assertThat(fx.completes.single().sessionId).isEqualTo("sess_new")
        c.onCardDone()
        // The wheel gets the server-updated id.
        assertThat((c.phase.value as GamePhase.Spin).sessionId).isEqualTo("sess_new")
    }

    @Test
    fun lateSessionStartFromPreviousRoundIsIgnored() {
        // Round 1 (code 1111) is interrupted while its startSession is still in flight (Render cold start).
        toPlaying(session.copy(sessionId = "sess_1", code = "1111"))
        c.onInterrupted()
        // Round 2: a late response for round 1 arrives before and after round 2's own startSession.
        c.onCodeAccepted(session.copy(sessionId = "sess_2", code = "2222"), camera)
        c.onSessionStarted("1111", "sess_old")
        c.onFrame(0.016, noHand, noHand, calibrated = true); run(350.0); run(3400.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.Playing)
        c.onSessionStarted("1111", "sess_old")
        run(40_000.0)
        c.onPhotoCaptured(null)
        assertThat(fx.completes.single().sessionId).isEqualTo("sess_2")
    }

    @Test
    fun earnedRewardFromCompletionIsMergedIntoTheCard() {
        toPlaying()
        run(40_000.0)
        c.onPhotoCaptured(null)
        val reward = EarnedReward(id = "r1", name = "Sweets", description = "", imageUrl = "", couponCode = "DIWALI")
        c.onRoundCompleted("other_session", reward) // not this round: ignored
        assertThat((c.phase.value as GamePhase.GameOver).card.earnedReward).isNull()
        c.onRoundCompleted("sess_1", reward)
        assertThat((c.phase.value as GamePhase.GameOver).card.earnedReward).isEqualTo(reward)
        c.onCardDone()
        c.onRoundCompleted("sess_1", reward) // card no longer shown: ignored, no crash
        assertThat(c.phase.value).isInstanceOf(GamePhase.Spin::class.java)
    }

    @Test
    fun penaltyBombBurstsLikeARewardBomb() {
        // App.tsx onTriggerParticles → triggerBombBurstParticles(x, y, color) → createBombBurst(x, y, color):
        // isPenalty is never passed, so a penalty bomb gets the normal burst: ring in the bomb's own colour
        // (not the penalty red) and 36 sparks + 10 embers = 46 particles (penalty path would be 32 + 10 = 42).
        val black = DEFAULT_BOMB_CONFIGS[3]
        assertThat(black.points).isLessThan(0)
        toPlaying(settings = touch.copy(bombConfigs = listOf(black)))
        val bomb = findTouchableBomb()
        assertThat(c.crackers.activeCount).isEqualTo(0) // touch mode: no hand sparkles
        c.onTouch(bomb.first, bomb.second)
        run(16.0)
        assertThat(fx.sounds.last()).isEqualTo(FlowSoundKeys.bombBurst(black))
        assertThat(c.crackers.activeCount).isEqualTo(46)
        val ringColors = c.crackers.rings.filter { it.active }.map { it.color }
        assertThat(ringColors).contains(0xFF1E293B.toInt())
        assertThat(ringColors).doesNotContain(0xFFEF4444.toInt())
        assertThat(c.hud.value.score).isEqualTo(0) // max(0, 0 - 150)
    }

    @Test
    fun photoWatchdogCompletesWithoutPhoto() {
        toPlaying()
        run(40_000.0)
        assertThat(c.phase.value).isEqualTo(GamePhase.PhotoCountdown(0))
        run(PHOTO_WATCHDOG_MS - 1.0)
        assertThat(fx.completes).isEmpty()
        run(1.0)
        assertThat(c.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
        assertThat(fx.completes.single().photoData).isNull()
    }

    @Test
    fun touchBombHitBurstsScoresPlaysSoundAndTargetBurst() {
        // Only the red bomb (100 pts) spawns; target 100 → first hit reaches it.
        val red = DEFAULT_BOMB_CONFIGS[0]
        toPlaying(settings = touch.copy(targetScore = 100, bombConfigs = listOf(red)))
        val bomb = findTouchableBomb()
        val burstsBefore = c.crackers.totalBursts
        c.onTouch(bomb.first, bomb.second) // queued; applied on the render thread's next frame
        assertThat(c.hud.value.score).isEqualTo(0)
        run(16.0)
        // web order: burst sound, recordBombTouch, particles; then the target edge (MEGA_BLAST + amber burst).
        assertThat(fx.sounds.takeLast(2)).containsExactly(
            FlowSoundKeys.bombBurst(red), "MEGA_BLAST",
        ).inOrder()
        assertThat(FlowSoundKeys.bombConfigId(FlowSoundKeys.bombBurst(red))).isEqualTo("bomb_red")
        // bomb burst + target-reached burst
        assertThat(c.crackers.totalBursts).isEqualTo(burstsBefore + 2)
        val hud = c.hud.value
        assertThat(hud.score).isEqualTo(100)
        assertThat(hud.targetProgress).isEqualTo(100) // min(100, round(100/100*100))
        assertThat(hud.targetAchieved).isTrue()
    }

    @Test
    fun handsCollideWithBombsOnlyInCameraMode() {
        // Touch input is ignored in camera mode (BombSim.touchMode false).
        toPlaying(settings = camera.copy(bombConfigs = listOf(DEFAULT_BOMB_CONFIGS[0])))
        assertThat(c.bombs!!.touchMode).isFalse()
    }

    @Test
    fun completePayloadMapsScoreFieldsLikeAppTsx() {
        val s = GameScoreState(
            score = 1234, crackersBurst = 17, maxSpeed = 812.5, comboCount = 3, punchCount = 2,
            combosAwarded = 3, penaltyDeductions = 150, comboBonusPoints = 150,
        )
        val withTarget = buildCompleteSessionRequest("sess_9", s, byteArrayOf(1, 2, 3), targetScore = 1000)
        assertThat(withTarget.sessionId).isEqualTo("sess_9")
        assertThat(withTarget.score).isEqualTo(1234)
        assertThat(withTarget.crackerCount).isEqualTo(17)
        assertThat(withTarget.maxSpeed).isEqualTo(812.5)
        assertThat(withTarget.comboCount).isEqualTo(3)
        assertThat(withTarget.combosCount).isEqualTo(3)
        assertThat(withTarget.punchCount).isEqualTo(2)
        assertThat(withTarget.penaltyDeductions).isEqualTo(150)
        assertThat(withTarget.comboBonusPoints).isEqualTo(150)
        assertThat(withTarget.photoData).isEqualTo("data:image/jpeg;base64,AQID")
        assertThat(withTarget.targetScore).isEqualTo(1000)
        assertThat(withTarget.targetAchieved).isTrue() // 1234 >= 1000
        val noTarget = buildCompleteSessionRequest("sess_9", s, null, targetScore = null)
        assertThat(noTarget.photoData).isNull()
        assertThat(noTarget.targetScore).isNull()
        assertThat(noTarget.targetAchieved).isNull()
        assertThat(noTarget.wishTitle).isNull()
    }

    /** Runs frames until a live bomb is touchable (scale >= 0.5, not bursting) and returns its position. */
    private fun findTouchableBomb(): Pair<Double, Double> {
        repeat(600) {
            val b = c.bombs!!.bombs.firstOrNull { it.active && !it.isBursting && it.scale >= 0.5 && it.y < 1000 }
            if (b != null) return b.x to b.y
            run(16.0)
        }
        error("no bomb spawned")
    }
}
