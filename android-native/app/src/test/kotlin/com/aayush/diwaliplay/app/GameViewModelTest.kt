package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.api.UndecodableResponseException
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.branding.normalizedForBranding
import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.model.CompleteSessionResponse
import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.GameSession
import com.aayush.diwaliplay.model.RewardItem
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SpinWheelResponse
import com.aayush.diwaliplay.model.SystemSettings
import com.aayush.diwaliplay.model.VerifyCodeResponse
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import com.google.common.truth.Truth.assertThat
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** The view model runs in backgroundScope, which advanceUntilIdle doesn't wait for. */
@OptIn(ExperimentalCoroutinesApi::class)
private fun TestScope.settle() {
    advanceTimeBy(120_000)
    runCurrent()
}

@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelTest {

    private inner class Rig(
        private val test: TestScope,
        settings: SystemSettings = SystemSettings(rewardsEnabled = false),
    ) {
        val api = FakeGameApi()
        val results = FakeResultSink()
        val audio = FakeGameAudio()
        val tracking = FakeTrackingPipeline()
        val branding = FakeBrandingSource(BrandingState(settings = settings.normalizedForBranding(), isLoading = false))
        val reachable = MutableStateFlow(false)
        var nowMs = 1_000.0
        val vm = GameViewModel(
            AppDependencies(api, results, audio, tracking, branding, reachable, publicWebUrl = { "https://kiosk.example" }),
            scopeOverride = test.backgroundScope,
            effectsDispatcher = StandardTestDispatcher(test.testScheduler),
            clock = RoundClock { nowMs },
            random = Mulberry32(7),
        )

        fun enter(code: String) = code.forEach(vm::onKeypad)

        /** Steps the render loop for [ms] of game time at 60 fps, running queued coroutines between frames. */
        fun frames(ms: Int) {
            repeat(ms / 16) {
                nowMs += 16.0
                vm.frameStepper.step(0.016, nowMs)
                test.runCurrent()
            }
        }

        fun acceptCode(code: String = "1234") {
            enter(code)
            vm.onPlay()
            test.settle()
        }

        /** From an accepted code in camera mode to [GamePhase.Playing]. */
        fun playThroughCountdown() {
            tracking.holdHandsInBoxes()
            frames(400)   // READY flash
            frames(3_600) // 3-2-1-GO
            assertThat(vm.phase.value).isEqualTo(GamePhase.Playing)
        }

        fun playToPhotoCountdown() {
            playThroughCountdown()
            frames(35_100)
            assertThat(vm.phase.value).isInstanceOf(GamePhase.PhotoCountdown::class.java)
        }

        fun playToCard() {
            playToPhotoCountdown()
            frames(5_100)
            test.advanceTimeBy(500)
            test.runCurrent()
            frames(50)
            assertThat(vm.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
        }
    }

    // ---- end of round ---------------------------------------------------------------------------------------

    private val rewardsOn = SystemSettings(rewardsEnabled = true)
    private val prize = RewardItem(id = "r1", name = "20% OFF", couponCode = "DIWALI20")

    private fun TestScope.toSpin(r: Rig): GamePhase.Spin {
        r.acceptCode()
        r.playToCard()
        r.vm.onCardDone()
        runCurrent()
        return r.vm.phase.value as GamePhase.Spin
    }

    @Test
    fun spinSendsTheServerSessionAndPlayerWithNoUserId() = runTest {
        val r = Rig(this, rewardsOn)
        r.api.onSpin = { ApiResult.Success(SpinWheelResponse(success = true, reward = prize, rewardIndex = 2)) }
        val spin = toSpin(r)
        assertThat(r.vm.requestSpin(spin)).isEqualTo(SpinOutcome.Won(prize, 2))
        val req = r.api.spins.single()
        assertThat(req.sessionId).isEqualTo("server_session")
        assertThat(req.playerName).isEqualTo("Asha")
        assertThat(req.mobileNumber).isEqualTo("9990001111")
        assertThat(req.userId).isNull()
    }

    @Test
    fun trialSpinNamesTheTrialUserAndSession() = runTest {
        val r = Rig(this, rewardsOn)
        r.api.onSpin = { ApiResult.Success(SpinWheelResponse(success = true, reward = prize)) }
        r.acceptCode("8536")
        r.playToCard()
        r.vm.onCardDone()
        runCurrent()
        r.vm.requestSpin(r.vm.phase.value as GamePhase.Spin)
        val req = r.api.spins.single()
        assertThat(req.userId).isEqualTo("trial_user_8536")
        assertThat(req.sessionId).isEqualTo("trial_session_8536")
    }

    @Test
    fun aGuestIdNeverReachesTheServer() = runTest {
        val r = Rig(this, rewardsOn)
        r.api.onStart = { ApiResult.NetworkError(IOException("down")) }
        val spin = toSpin(r)
        assertThat(spin.sessionId).startsWith("guest_")
        assertThat(r.vm.requestSpin(spin)).isEqualTo(SpinOutcome.Failed)
        assertThat(r.api.spins).isEmpty()
    }

    @Test
    fun anySpinFailureIsFailed() = runTest {
        val r = Rig(this, rewardsOn)
        val spin = toSpin(r)
        r.api.onSpin = { ApiResult.NetworkError(IOException("down")) }
        assertThat(r.vm.requestSpin(spin)).isEqualTo(SpinOutcome.Failed)
        r.api.onSpin = { ApiResult.HttpError(409, "{}") }
        assertThat(r.vm.requestSpin(spin)).isEqualTo(SpinOutcome.Failed)
        r.api.onSpin = { ApiResult.Success(SpinWheelResponse(success = false, message = "paused")) }
        assertThat(r.vm.requestSpin(spin)).isEqualTo(SpinOutcome.Failed)
    }

    @Test
    fun aServerFlaggedTrialNeverGetsThePreviousPlayersSession() = runTest {
        val r = Rig(this, rewardsOn)
        r.api.serverSessionId = "previous_player"
        r.acceptCode()
        r.playThroughCountdown()
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("previous_player")
        r.vm.onInterrupted()
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("guest_1_2") // gone with the round

        // Flagged a trial by the server, with no session: it never calls startSession, so its id stays a guest's.
        r.api.onVerify = { ApiResult.Success(VerifyCodeResponse(success = true, valid = true, isTrial = true, user = TEST_USER)) }
        r.api.onSpin = { ApiResult.Success(SpinWheelResponse(success = true, reward = prize)) }
        val spin = toSpin(r)
        assertThat(r.vm.requestSpin(spin)).isEqualTo(SpinOutcome.Failed)
        assertThat(r.api.spins).isEmpty()
    }

    @Test
    fun aStartSessionStillRunningWhenTheRoundEndsCantPublishItsId() = runTest {
        val r = Rig(this, rewardsOn)
        val slow = CompletableDeferred<Unit>()
        r.api.onStart = {
            slow.await()
            ApiResult.Success(
                com.aayush.diwaliplay.model.StartSessionResponse(success = true, session = GameSession(id = "late", userId = "u1"), user = TEST_USER),
            )
        }
        r.acceptCode()
        r.playThroughCountdown()
        r.vm.onInterrupted()
        runCurrent()
        slow.complete(Unit)
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("guest_1_2")
    }

    @Test
    fun touchRoundsDontTrackHandsAndCameraRoundsDo() = runTest {
        val touch = Rig(this, SystemSettings(gameplayMode = "touch", wallpaperEnabled = false, rewardsEnabled = false))
        touch.acceptCode()
        assertThat(touch.tracking.lastTrackHands).isFalse()

        val camera = Rig(this)
        camera.acceptCode()
        assertThat(camera.tracking.lastTrackHands).isTrue()
    }

    @Test
    fun aHandTrackingFailureInACameraRoundStillTakesThePhoto() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playThroughCountdown()
        r.tracking.emit(TrackingStatus.Failed("landmarker failed", cameraAlive = true))
        runCurrent()
        r.frames(35_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
        r.frames(5_100)
        advanceTimeBy(500)
        runCurrent()
        r.frames(50)
        assertThat((r.vm.phase.value as GamePhase.GameOver).card.photoJpeg).isNotNull()
    }

    @Test
    fun aDeadCameraInACameraRoundStillGoesToTheErrorPath() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playThroughCountdown()
        r.tracking.emit(TrackingStatus.Failed("bind failed"))
        runCurrent()
        r.frames(35_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(0, cameraError = true))
    }

    /** A trial touch round with its camera on throughout, played to the card with a camera that has then failed. */
    private fun TestScope.trialCardWithAFailedCamera(r: Rig) {
        r.acceptCode("8536")
        r.frames(3_600)
        r.frames(35_100)
        r.frames(5_100)
        advanceTimeBy(500)
        runCurrent()
        r.frames(50)
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
        r.tracking.emit(TrackingStatus.Failed("bind failed"))
        runCurrent()
    }

    private val liveCameraTouch = SystemSettings(gameplayMode = "touch", wallpaperEnabled = false, rewardsEnabled = false)

    @Test
    fun aTrialReplayRestartsAFailedCamera() = runTest {
        val r = Rig(this, liveCameraTouch)
        trialCardWithAFailedCamera(r)
        val starts = r.tracking.starts
        r.vm.onPlayAgain()
        runCurrent()
        assertThat(r.tracking.starts).isEqualTo(starts + 1)
        r.frames(3_600)
        r.frames(35_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
    }

    @Test
    fun aTrialReplayWhoseCameraWontRestartSkipsTheWatchdog() = runTest {
        val r = Rig(this, liveCameraTouch)
        trialCardWithAFailedCamera(r)
        r.tracking.refuseStartWith = TrackingStatus.Failed("camera permission denied")
        r.vm.onPlayAgain()
        runCurrent()
        r.frames(3_600)
        r.frames(35_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(0, cameraError = true))
    }

    @Test
    fun aSpinAlreadyTakenFailsLikeAnyOther() = runTest {
        val r = Rig(this, rewardsOn)
        val spin = toSpin(r)
        // What server/routes/rewards.ts really answers: a 409, with the old prize in the body.
        r.api.onSpin = { ApiResult.HttpError(409, """{"success":false,"alreadySpun":true,"reward":{"id":"r1"}}""") }
        assertThat(r.vm.requestSpin(spin)).isEqualTo(SpinOutcome.Failed)
    }

    @Test
    fun wheelRewardsComeFreshFromTheServer() = runTest {
        val r = Rig(this, rewardsOn)
        r.api.onGetRewards = {
            ApiResult.Success(RewardsInfo(success = true, enabled = true, rewards = listOf(prize, RewardItem(id = "s", mode = "score"))))
        }
        assertThat(r.vm.loadWheelRewards()).containsExactly(prize)
    }

    @Test
    fun wheelRewardsThatCantBeHadLeaveTheCachedOnes() = runTest {
        val r = Rig(this, rewardsOn)
        assertThat(r.vm.loadWheelRewards()).isNull() // offline
        r.api.onGetRewards = { ApiResult.Success(RewardsInfo(success = true, enabled = true, rewards = emptyList())) }
        assertThat(r.vm.loadWheelRewards()).isNull()
    }

    @Test
    fun aSlowRewardsFetchGivesUpAtTheTimeout() = runTest {
        val r = Rig(this, rewardsOn)
        r.api.onGetRewards = {
            delay(60_000)
            ApiResult.Success(RewardsInfo(success = true, enabled = true, rewards = listOf(prize)))
        }
        val start = testScheduler.currentTime
        assertThat(r.vm.loadWheelRewards()).isNull()
        assertThat(testScheduler.currentTime - start).isEqualTo(WHEEL_REWARDS_TIMEOUT_MS)
    }

    @Test
    fun aPreviousRoundsIdIsNeverGivenToTheNextRound() = runTest {
        val r = Rig(this, rewardsOn)
        r.api.serverSessionId = "first_round"
        r.acceptCode()
        r.playThroughCountdown()
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("first_round")
        r.vm.onInterrupted()
        runCurrent()

        val second = CompletableDeferred<Unit>()
        r.api.onStart = {
            second.await()
            ApiResult.Success(
                com.aayush.diwaliplay.model.StartSessionResponse(success = true, session = GameSession(id = "second_round", userId = "u1"), user = TEST_USER),
            )
        }
        r.acceptCode()
        r.playThroughCountdown()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("guest_1_2") // cleared as soon as it was issued
        second.complete(Unit)
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("second_round")
    }

    @Test
    fun aSlowStartFromThePreviousRoundCantPublishItsIdIntoTheNextRound() = runTest {
        val r = Rig(this, rewardsOn)
        val first = CompletableDeferred<Unit>()
        val second = CompletableDeferred<Unit>()
        var starts = 0
        r.api.onStart = {
            val mine = ++starts
            (if (mine == 1) first else second).await()
            ApiResult.Success(
                com.aayush.diwaliplay.model.StartSessionResponse(success = true, session = GameSession(id = "round_$mine", userId = "u1"), user = TEST_USER),
            )
        }
        r.acceptCode()
        r.playThroughCountdown()
        r.vm.onInterrupted()
        runCurrent()
        r.acceptCode()
        r.playThroughCountdown()

        first.complete(Unit) // round 1's job finishes while round 2's is queued behind it
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("guest_1_2")
        second.complete(Unit)
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("round_2")
    }

    @Test
    fun anAbandonStillNamesItsOwnRoundsSession() = runTest {
        val r = Rig(this, rewardsOn)
        val first = CompletableDeferred<Unit>()
        var starts = 0
        r.api.onStart = {
            val mine = ++starts
            if (mine == 1) first.await()
            ApiResult.Success(
                com.aayush.diwaliplay.model.StartSessionResponse(success = true, session = GameSession(id = "round_$mine", userId = "u1"), user = TEST_USER),
            )
        }
        r.acceptCode()
        r.playThroughCountdown()
        r.vm.onInterrupted() // queued behind the start, under the guest id
        runCurrent()
        r.acceptCode()
        r.playThroughCountdown()
        first.complete(Unit)
        runCurrent()
        assertThat(r.api.abandoned.first().sessionId).isEqualTo("round_1")
    }

    @Test
    fun aTouchRoundWithAWallpaperWaitsForItsCamera() = runTest {
        val r = Rig(this, SystemSettings(gameplayMode = "touch", rewardsEnabled = false))
        r.tracking.startsReady = false
        r.acceptCode()
        r.frames(3_600)
        r.frames(35_100)
        assertThat(r.tracking.running).isTrue() // it opens for the photo
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(5, waitingForCamera = true))
        r.frames(3_000)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(5, waitingForCamera = true))

        r.tracking.becomeReady()
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
    }

    @Test
    fun aTouchRoundWhoseCameraNeverComesGoesOnWithoutAPhoto() = runTest {
        val r = Rig(this, SystemSettings(gameplayMode = "touch", rewardsEnabled = false))
        r.tracking.startsReady = false
        r.acceptCode()
        r.frames(3_600)
        r.frames(35_100)
        r.frames(8_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(0, cameraError = true))
        r.frames(2_300)
        assertThat((r.vm.phase.value as GamePhase.GameOver).card.photoJpeg).isNull()
    }

    @Test
    fun aTrialReplayWithItsCameraAlreadyOnDoesNotWait() = runTest {
        val r = Rig(this, SystemSettings(gameplayMode = "touch", wallpaperEnabled = false, rewardsEnabled = false))
        r.acceptCode("8536")
        r.frames(3_600)
        r.frames(35_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
        r.frames(5_100)
        advanceTimeBy(500)
        runCurrent()
        r.frames(50)
        r.vm.onPlayAgain()
        runCurrent()
        r.frames(3_600)
        r.frames(35_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(5))
    }

    @Test
    fun aNullStillIsNotAnnouncedAsCaptured() = runTest {
        val r = Rig(this)
        r.tracking.still = null
        r.acceptCode()
        r.playToPhotoCountdown()
        r.frames(5_020)
        runCurrent()
        val p = r.vm.phase.value as GamePhase.PhotoCountdown
        assertThat(p.step).isEqualTo(0)
        assertThat(p.captured).isFalse()
    }

    @Test
    fun aRealStillIsAnnouncedAsCaptured() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToPhotoCountdown()
        r.frames(5_020)
        runCurrent()
        assertThat((r.vm.phase.value as GamePhase.PhotoCountdown).captured).isTrue()
    }

    @Test
    fun feedbackWithAWonCouponSendsAtOnceAndLeavesItUpForTheCountdown() = runTest {
        val r = Rig(this, rewardsOn)
        toSpin(r)
        r.vm.onSpinSettled()
        runCurrent()
        advanceTimeBy(5_000)
        r.vm.onSpinDone(prize)
        runCurrent()
        r.vm.submitFeedback(GameFeedback.Good)
        runCurrent()
        assertThat(r.api.feedback.single().second).isEqualTo(GameFeedback.Good)

        advanceTimeBy(FEEDBACK_THANKS_MS + 1_000)
        runCurrent()
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.Feedback::class.java) // no 1.5 s exit
        assertThat(r.vm.feedbackRecorded.value).isEqualTo(GameFeedback.Good)
        assertThat(r.vm.autoReturnSeconds.value).isNotNull()

        advanceTimeBy(15_000)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.api.feedback).hasSize(1)
    }

    @Test
    fun feedbackWithAScorePrizeAlsoLeavesItUp() = runTest {
        val r = Rig(this)
        val mug = EarnedReward(id = "r", name = "Mug", description = "", imageUrl = "", couponCode = "C")
        r.api.onComplete = { req ->
            ApiResult.Success(CompleteSessionResponse(success = true, session = GameSession(id = req.sessionId, userId = "u1", earnedReward = mug), user = TEST_USER))
        }
        r.acceptCode()
        r.playToCard()
        runCurrent()
        r.vm.onCardDone()
        runCurrent()
        r.vm.submitFeedback(GameFeedback.Good)
        advanceTimeBy(FEEDBACK_THANKS_MS + 1_000)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Feedback(null, mug))
    }

    @Test
    fun interruptingDuringTheCountdownLeavesNothingForTheNextRound() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        runCurrent()
        advanceTimeBy(5_000)
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isEqualTo(15)

        r.vm.onInterrupted()
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isNull()

        // The next round is well under way when the old countdown would have run out.
        r.acceptCode()
        val phaseNow = r.vm.phase.value
        assertThat(phaseNow).isEqualTo(GamePhase.Calibrating(ready = false))
        advanceTimeBy(60_000)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(phaseNow)
        assertThat(r.vm.autoReturnSeconds.value).isNull()

        // Its own card gets its own full 20 s.
        r.playToCard()
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isEqualTo(20)
    }

    @Test
    fun rewardsOffStartsTheTwentySecondsWithTheCardAndGoesHome() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isEqualTo(20)
        advanceTimeBy(19_000)
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isEqualTo(1)
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
        advanceTimeBy(1_100)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.vm.autoReturnSeconds.value).isNull()
        assertThat(r.api.feedback).isEmpty()
    }

    @Test
    fun theTimerRunsOnAcrossCardAndFeedback() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        runCurrent()
        advanceTimeBy(5_000)
        r.vm.onCardDone()
        runCurrent()
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.Feedback::class.java)
        assertThat(r.vm.autoReturnSeconds.value).isEqualTo(15)
    }

    @Test
    fun rewardsOnWaitsForTheWheelBeforeCounting() = runTest {
        val r = Rig(this, rewardsOn)
        toSpin(r)
        advanceTimeBy(60_000)
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isNull()
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.Spin::class.java)
        r.vm.onSpinSettled()
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isEqualTo(20)
        advanceTimeBy(20_100)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
    }

    @Test
    fun aTrialRoundNeverAutoReturns() = runTest {
        val r = Rig(this)
        r.acceptCode("8536")
        r.playToCard()
        r.vm.onCardDone()
        r.vm.onSpinSettled()
        advanceTimeBy(60_000)
        runCurrent()
        assertThat(r.vm.autoReturnSeconds.value).isNull()
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.Feedback::class.java)
    }

    @Test
    fun submittedFeedbackThanksThenSendsAndGoesHome() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        r.vm.onCardDone()
        runCurrent()
        r.vm.submitFeedback(GameFeedback.Excellent)
        runCurrent()
        assertThat(r.vm.feedbackRecorded.value).isEqualTo(GameFeedback.Excellent)
        assertThat(r.vm.autoReturnSeconds.value).isNull()
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.Feedback::class.java)
        advanceTimeBy(FEEDBACK_THANKS_MS + 1)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.vm.feedbackRecorded.value).isNull()
        assertThat(r.api.feedback.single()).isEqualTo("server_session" to GameFeedback.Excellent)
    }

    @Test
    fun feedbackSubmittedJustBeforeAPauseStillGoes() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        r.vm.onCardDone()
        runCurrent()
        r.vm.submitFeedback(GameFeedback.Good)
        r.vm.onInterrupted()
        runCurrent()
        assertThat(r.api.feedback.single().second).isEqualTo(GameFeedback.Good)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
    }

    @Test
    fun exitSkipsTheRemainingStepsAndSendsNoFeedback() = runTest {
        val r = Rig(this, rewardsOn)
        r.acceptCode()
        r.playToCard()
        r.vm.exitToStart()
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.api.feedback).isEmpty()
        assertThat(r.api.abandoned).isEmpty()
        assertThat(r.tracking.running).isFalse()
    }

    @Test
    fun playAgainOnATrialRestartsWithoutTheCode() = runTest {
        val r = Rig(this)
        r.acceptCode("8536")
        r.playToCard()
        r.vm.onPlayAgain()
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
        assertThat(r.vm.round.value).isNotNull()
        assertThat(r.tracking.running).isTrue()
        assertThat(r.branding.advances).isEqualTo(1)
        assertThat(r.api.totalCalls).isEqualTo(0)
    }

    @Test
    fun playAgainOnARealRoundGoesHome() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        r.vm.onPlayAgain()
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.vm.round.value).isNull()
    }

    @Test
    fun envelopeAndWheelSoundsReachTheAudio() = runTest {
        val r = Rig(this)
        r.vm.playEnvelopeChime()
        r.vm.playSpinTick(0.5f)
        r.vm.playVictoryChime()
        runCurrent()
        assertThat(r.audio.crackers).contains("FLOWER_POT")
        assertThat(r.audio.ticks).containsExactly(0.5f)
        assertThat(r.audio.victories).isEqualTo(1)
    }

    // ---- brief's tests ------------------------------------------------------------------------------------

    @Test
    fun doublePlayTapSendsOneVerify() = runTest {
        val r = Rig(this)
        val gate = CompletableDeferred<Unit>()
        r.api.onVerify = {
            gate.await()
            ApiResult.Success(VerifyCodeResponse(success = true, valid = true, user = TEST_USER))
        }
        r.enter("1234")
        r.vm.onPlay()
        r.vm.onPlay()
        runCurrent()
        r.vm.onPlay()
        runCurrent()

        assertThat(r.api.verified).containsExactly("1234")
        assertThat(r.vm.startUi.value.busy).isTrue()
        gate.complete(Unit)
        settle()
        assertThat(r.api.verified).hasSize(1)
    }

    @Test
    fun slowVerifySuccessStillStartsRound() = runTest {
        val r = Rig(this)
        r.api.onVerify = {
            delay(40_000)
            ApiResult.Success(VerifyCodeResponse(success = true, valid = true, user = TEST_USER))
        }
        r.enter("1234")
        r.vm.onPlay()
        advanceTimeBy(39_000)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.vm.startUi.value.busy).isTrue()

        settle()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
        assertThat(r.tracking.running).isTrue()
    }

    @Test
    fun trialCodeNeedsNoNetwork() = runTest {
        val r = Rig(this)
        r.acceptCode("8536")
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
        r.playToCard()

        val card = (r.vm.phase.value as GamePhase.GameOver).card
        assertThat(card.playerName).isEqualTo("Trial Player")
        assertThat(r.api.totalCalls).isEqualTo(0)
        assertThat(r.results.queued).isEmpty()
    }

    @Test
    fun invalidCodeShowsServerMessage() = runTest {
        val r = Rig(this)
        r.api.onVerify = { ApiResult.Success(VerifyCodeResponse(success = true, valid = false, message = "This code has expired")) }
        r.acceptCode("1234")

        val ui = r.vm.startUi.value
        assertThat(ui.error).isEqualTo("This code has expired")
        assertThat(ui.code).isEmpty()
        assertThat(ui.busy).isFalse()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.tracking.starts).isEqualTo(0)
    }

    @Test
    fun pollingPausedDuringRound() = runTest {
        val r = Rig(this)
        r.acceptCode()
        runCurrent()
        assertThat(r.branding.paused).isFalse() // calibration still polls

        r.tracking.holdHandsInBoxes()
        r.frames(400)
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.Countdown::class.java)
        assertThat(r.branding.paused).isTrue()
        r.frames(3_600)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Playing)
        assertThat(r.branding.paused).isTrue()

        r.vm.onInterrupted()
        runCurrent()
        assertThat(r.branding.paused).isFalse()
    }

    @Test
    fun pauseMidRoundAbandonsAndReturnsToStart() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playThroughCountdown()
        runCurrent()
        assertThat(r.api.started).containsExactly("1234")
        assertThat(r.audio.bgmOn).isTrue()

        r.vm.onInterrupted()
        settle()

        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.api.abandoned.map { it.sessionId to it.reason }).containsExactly("server_session" to "interrupted")
        assertThat(r.tracking.running).isFalse()
        assertThat(r.audio.bgmOn).isFalse()
        assertThat(r.vm.startUi.value.code).isEmpty()
        assertThat(r.vm.startUi.value.busy).isFalse()
        assertThat(r.branding.advances).isEqualTo(1)
    }

    // ---- start screen -------------------------------------------------------------------------------------

    @Test
    fun keypadEditsTheCodeAndCapsItAtFourDigits() = runTest {
        val r = Rig(this)
        r.enter("12345")
        assertThat(r.vm.startUi.value.code).isEqualTo("1234")
        r.vm.onBackspace()
        assertThat(r.vm.startUi.value.code).isEqualTo("123")
        r.vm.onClear()
        assertThat(r.vm.startUi.value.code).isEmpty()
    }

    @Test
    fun playNeedsFourDigits() = runTest {
        val r = Rig(this)
        r.enter("123")
        r.vm.onPlay()
        settle()
        assertThat(r.api.verified).isEmpty()
        assertThat(r.vm.startUi.value.busy).isFalse()
    }

    @Test
    fun networkErrorSaysCantReachServerAndKeepsTheCode() = runTest {
        val r = Rig(this)
        r.api.onVerify = { ApiResult.NetworkError(IOException("no route")) }
        r.acceptCode("1234")
        assertThat(r.vm.startUi.value.error).isEqualTo("Can't reach the server — try again")
        assertThat(r.vm.startUi.value.code).isEqualTo("1234")
        assertThat(r.vm.startUi.value.busy).isFalse()
    }

    @Test
    fun undecodableResponseIsAServerErrorNotAConnectionError() = runTest {
        val r = Rig(this)
        r.api.onVerify = { ApiResult.NetworkError(UndecodableResponseException(200, "<html>", IOException("bad"))) }
        r.acceptCode("1234")
        assertThat(r.vm.startUi.value.error).isEqualTo(SERVER_ERROR_MESSAGE)
        assertThat(r.vm.startUi.value.error).isNotEqualTo(CANT_REACH_SERVER_MESSAGE)
    }

    @Test
    fun httpErrorUsesMessageFromTheBody() = runTest {
        val r = Rig(this)
        r.api.onVerify = { ApiResult.HttpError(404, """{"success":false,"valid":false,"message":"Code not found"}""") }
        r.acceptCode("1234")
        assertThat(r.vm.startUi.value.error).isEqualTo("Code not found")
        assertThat(r.vm.startUi.value.code).isEmpty()
    }

    @Test
    fun http5xxWithoutMessageIsAServerError() = runTest {
        val r = Rig(this)
        r.api.onVerify = { ApiResult.HttpError(503, "Service Unavailable") }
        r.acceptCode("1234")
        assertThat(r.vm.startUi.value.error).isEqualTo(SERVER_ERROR_MESSAGE)
    }

    @Test
    fun acceptedCodeShowsWelcomeForEightHundredMsWithChime() = runTest {
        val r = Rig(this)
        r.enter("1234")
        r.vm.onPlay()
        runCurrent()
        assertThat(r.vm.startUi.value.welcomeName).isEqualTo("Asha")
        assertThat(r.audio.crackers).containsExactly("CHAKRI")
        advanceTimeBy(799)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        settle()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
    }

    @Test
    fun keypadIsLockedWhileBusy() = runTest {
        val r = Rig(this)
        r.api.onVerify = { delay(1000); ApiResult.NetworkError(IOException()) }
        r.enter("1234")
        r.vm.onPlay()
        r.vm.onBackspace()
        r.vm.onClear()
        assertThat(r.vm.startUi.value.code).isEqualTo("1234")
    }

    @Test
    fun serverReachabilityFlowsIntoStartUi() = runTest {
        val r = Rig(this)
        runCurrent()
        assertThat(r.vm.startUi.value.serverReachable).isFalse()
        r.reachable.value = true
        runCurrent()
        assertThat(r.vm.startUi.value.serverReachable).isTrue()
    }

    @Test
    fun qrContentIsRegisterPageOfPublicWebUrl() = runTest {
        assertThat(Rig(this).vm.registrationUrl).isEqualTo("https://kiosk.example/register")
    }

    @Test
    fun pauseDuringVerifyCancelsItAndNoRoundStarts() = runTest {
        val r = Rig(this)
        r.api.onVerify = {
            delay(5_000)
            ApiResult.Success(VerifyCodeResponse(success = true, valid = true, user = TEST_USER))
        }
        r.enter("1234")
        r.vm.onPlay()
        runCurrent()
        r.vm.onInterrupted()
        settle()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.vm.startUi.value.busy).isFalse()
        assertThat(r.tracking.starts).isEqualTo(0)
    }

    @Test
    fun playIgnoredAfterWelcomeWhileRoundStarting() = runTest {
        val r = Rig(this)
        r.enter("1234")
        r.vm.onPlay()
        runCurrent()
        r.vm.onPlay()
        settle()
        assertThat(r.api.verified).hasSize(1)
    }

    // ---- round start gate ---------------------------------------------------------------------------------

    @Test
    fun roundStartWaitsForAudioButNotForever() = runTest {
        val r = Rig(this)
        r.audio.ready = false
        r.enter("1234")
        r.vm.onPlay()
        advanceTimeBy(1_500)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)

        settle() // a sound that never loads must not block play
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
    }

    @Test
    fun roundStartProceedsOnceAudioIsReady() = runTest {
        val r = Rig(this)
        r.audio.ready = false
        r.enter("1234")
        r.vm.onPlay()
        advanceTimeBy(1_000)
        r.audio.ready = true
        advanceTimeBy(100)
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Calibrating(ready = false))
    }

    // ---- effects ------------------------------------------------------------------------------------------

    @Test
    fun soundsRouteThroughPlayGameKey() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.tracking.holdHandsInBoxes()
        r.frames(400)
        runCurrent()
        assertThat(r.audio.played).contains("countdown_3")
    }

    @Test
    fun slowStartSessionDoesNotHoldUpSounds() = runTest {
        val r = Rig(this)
        r.api.onStart = { delay(60_000); ApiResult.NetworkError(IOException()) }
        r.acceptCode()
        r.playThroughCountdown()
        val before = r.audio.played.size
        r.frames(36_000) // into the photo countdown, with startSession still in flight
        assertThat(r.audio.played.size).isGreaterThan(before)
    }

    @Test
    fun completeIsSentWithServerSessionIdAndPhotoAfterStart() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        settle()

        assertThat(r.api.completed).hasSize(1)
        assertThat(r.api.completed[0].sessionId).isEqualTo("server_session")
        assertThat(r.api.completed[0].photoData).startsWith("data:image/jpeg;base64,")
        assertThat(r.results.queued).isEmpty()
    }

    @Test
    fun startThatReturnsAfterRoundEndStillNamesTheCompletedSession() = runTest {
        val r = Rig(this)
        r.api.onStart = {
            delay(60_000)
            ApiResult.Success(
                com.aayush.diwaliplay.model.StartSessionResponse(
                    success = true, session = GameSession(id = "late_id", userId = "u1"), user = TEST_USER,
                ),
            )
        }
        r.acceptCode()
        r.playToCard()
        settle()

        // Network effects run strictly in order: start, then complete with the id start returned.
        assertThat(r.api.started).hasSize(1)
        assertThat(r.api.completed.single().sessionId).isEqualTo("late_id")
    }

    @Test
    fun earnedRewardReachesTheCard() = runTest {
        val r = Rig(this, rewardsOn) // with rewards off, the long settle below would outlast the card's auto-return
        val reward = EarnedReward(id = "r1", name = "Mug", description = "", imageUrl = "", couponCode = "C")
        r.api.onComplete = { req ->
            ApiResult.Success(
                CompleteSessionResponse(
                    success = true, session = GameSession(id = req.sessionId, userId = "u1", earnedReward = reward), user = TEST_USER,
                ),
            )
        }
        r.acceptCode()
        r.playToCard()
        settle()
        assertThat((r.vm.phase.value as GamePhase.GameOver).card.earnedReward).isEqualTo(reward)
    }

    @Test
    fun failedCompleteGoesToTheQueue() = runTest {
        val r = Rig(this)
        r.api.onComplete = { ApiResult.NetworkError(IOException("offline")) }
        r.acceptCode()
        r.playToCard()
        settle()
        assertThat(r.results.queued.single().sessionId).isEqualTo("server_session")
    }

    @Test
    fun undecodableCompleteCountsAsDelivered() = runTest {
        val r = Rig(this)
        r.api.onComplete = { ApiResult.NetworkError(UndecodableResponseException(200, "x", IOException())) }
        r.acceptCode()
        r.playToCard()
        settle()
        assertThat(r.results.queued).isEmpty()
    }

    @Test
    fun feedbackIsSubmittedAndRoundResets() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToCard()
        r.vm.onCardDone()
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Feedback(null))
        r.vm.onFeedback(GameFeedback.entries.first())
        settle()
        assertThat(r.api.feedback.single().first).isEqualTo("server_session")
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.tracking.running).isFalse()
    }

    @Test
    fun spinCarriesTheVerifiedMobileNumber() = runTest {
        val r = Rig(this, SystemSettings(rewardsEnabled = true))
        r.acceptCode()
        r.playToCard()
        r.vm.onCardDone()
        val spin = r.vm.phase.value as GamePhase.Spin
        assertThat(spin.mobileNumber).isEqualTo("9990001111")
        assertThat(spin.playerName).isEqualTo("Asha")
    }

    @Test
    fun interruptBeforePlayAbandonsNothing() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.vm.onInterrupted()
        settle()
        assertThat(r.api.abandoned).isEmpty()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Startup)
        assertThat(r.tracking.running).isFalse()
    }

    // ---- camera lifecycle ---------------------------------------------------------------------------------

    @Test
    fun cameraOffUntilCodeAccepted() = runTest {
        val r = Rig(this)
        r.enter("1234")
        runCurrent()
        assertThat(r.tracking.starts).isEqualTo(0)
        r.vm.onPlay()
        settle()
        assertThat(r.tracking.starts).isEqualTo(1)
    }

    @Test
    fun cameraKeepsRunningThroughPhotoThenStopsAtCardWhenWallpaperIsOn() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playToPhotoCountdown()
        assertThat(r.tracking.running).isTrue()
        r.frames(5_100)
        advanceTimeBy(500)
        runCurrent()
        r.frames(50)
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.GameOver::class.java)
        assertThat(r.tracking.running).isFalse()
    }

    @Test
    fun touchModeSkipsCalibrationAndStartsCameraOnlyForThePhoto() = runTest {
        val r = Rig(this, SystemSettings(gameplayMode = "touch", rewardsEnabled = false))
        r.acceptCode()
        runCurrent()
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Countdown(3))
        assertThat(r.tracking.starts).isEqualTo(0)
        r.frames(3_600)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.Playing)
        assertThat(r.tracking.starts).isEqualTo(0)
        r.frames(35_100)
        assertThat(r.vm.phase.value).isInstanceOf(GamePhase.PhotoCountdown::class.java)
        assertThat(r.tracking.running).isTrue()
    }

    @Test
    fun cameraFailureMidRoundTakesTheNoPhotoPath() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.playThroughCountdown()
        r.tracking.emit(TrackingStatus.Failed("boom"))
        runCurrent()
        r.frames(35_100)
        assertThat(r.vm.phase.value).isEqualTo(GamePhase.PhotoCountdown(0, cameraError = true))
    }

    @Test
    fun cameraRetryRestartsThePipelineAfterFailure() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.tracking.emit(TrackingStatus.Failed("boom"))
        runCurrent()
        assertThat(r.vm.cameraStatus.value).isEqualTo(TrackingStatus.Failed("boom"))

        r.vm.retryCamera()
        runCurrent()
        assertThat(r.tracking.stops).isEqualTo(1)
        assertThat(r.tracking.starts).isEqualTo(2)
    }

    // ---- audio apply --------------------------------------------------------------------------------------

    @Test
    fun audioIsAppliedInTheLobbyNeverDuringARound() = runTest {
        val r = Rig(this)
        runCurrent()
        assertThat(r.audio.applied).hasSize(1)

        r.acceptCode()
        r.playThroughCountdown()
        val during = r.audio.applied.size
        r.branding.update { it.copy(localFiles = mapOf("u" to java.io.File("x"))) }
        runCurrent()
        assertThat(r.audio.applied).hasSize(during)

        r.vm.onInterrupted()
        runCurrent()
        assertThat(r.audio.applied.size).isGreaterThan(during)
    }

    @Test
    fun bgmPlaysOnlyWhilePlaying() = runTest {
        val r = Rig(this)
        r.acceptCode()
        runCurrent()
        assertThat(r.audio.bgmOn).isFalse()
        r.playThroughCountdown()
        runCurrent()
        assertThat(r.audio.bgmOn).isTrue()
        r.frames(35_100)
        assertThat(r.audio.bgmOn).isFalse()
    }

    @Test
    fun clearedViewModelReleasesAudioAndCamera() = runTest {
        val r = Rig(this)
        r.acceptCode()
        r.vm.release()
        settle()
        assertThat(r.tracking.running).isFalse()
        assertThat(r.audio.released).isTrue()
    }

    // ---- round snapshot -----------------------------------------------------------------------------------

    @Test
    fun settingsChangedAfterAcceptanceWaitForTheNextRound() = runTest {
        val r = Rig(this, SystemSettings(gameplayMode = "camera", targetScoreEnabled = false, wallpaperEnabled = true, rewardsEnabled = false))
        r.acceptCode()
        val snapshot = r.vm.round.value!!
        assertThat(snapshot.settings.isTouchMode).isFalse()
        assertThat(r.vm.backdrop.value).isEqualTo(BackdropKind.CameraStrongVignette)

        r.branding.update {
            it.copy(
                settings = it.settings.copy(gameplayMode = "touch", wallpaperEnabled = false, targetScoreEnabled = true, wallpaperOpacity = 10.0),
                currentWallpaperUrl = "other",
            )
        }
        runCurrent()
        assertThat(r.vm.round.value).isEqualTo(snapshot)
        assertThat(r.vm.backdrop.value).isEqualTo(BackdropKind.CameraStrongVignette)
        assertThat(r.tracking.running).isTrue()

        r.playThroughCountdown()
        runCurrent()
        assertThat(r.vm.backdrop.value).isEqualTo(BackdropKind.Wallpaper) // the live setting would say camera
    }

    @Test
    fun roundSnapshotClearsAtResetAndTheNextRoundTakesCurrentSettings() = runTest {
        val r = Rig(this)
        assertThat(r.vm.round.value).isNull()
        r.acceptCode()
        assertThat(r.vm.round.value).isNotNull()
        r.vm.onInterrupted()
        runCurrent()
        assertThat(r.vm.round.value).isNull()

        r.branding.update { it.copy(settings = it.settings.copy(gameplayMode = "touch")) }
        r.acceptCode()
        assertThat(r.vm.round.value!!.settings.isTouchMode).isTrue()
    }

    // ---- server session id --------------------------------------------------------------------------------

    @Test
    fun guestIdResolvesOnceStartSessionHasReturned() = runTest {
        val r = Rig(this)
        r.api.onStart = {
            delay(60_000)
            ApiResult.Success(
                com.aayush.diwaliplay.model.StartSessionResponse(
                    success = true, session = GameSession(id = "real_id", userId = "u1"), user = TEST_USER,
                ),
            )
        }
        r.acceptCode()
        r.playThroughCountdown()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("guest_1_2") // still in flight

        advanceTimeBy(60_001)
        runCurrent()
        assertThat(r.vm.resolvedSessionId("guest_1_2")).isEqualTo("real_id")
        assertThat(r.vm.resolvedSessionId("trial_session_8536")).isEqualTo("trial_session_8536")
    }

    // ---- http client --------------------------------------------------------------------------------------

    @Test
    fun httpClientWontFollowHttpsRedirectsToHttp() {
        assertThat(kioskHttpClient().followSslRedirects).isFalse()
    }
}
