package com.aayush.diwaliplay.app

import android.Manifest
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.branding.normalizedForBranding
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.DEFAULT_BOMB_SETTINGS
import com.aayush.diwaliplay.model.CompleteSessionResponse
import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.GameSession
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.RewardItem
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SpinWheelResponse
import com.aayush.diwaliplay.model.SystemSettings
import com.google.common.truth.Truth.assertThat
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Real activity, screens and controller from the round's end to the start screen; fake network and camera. */
@RunWith(AndroidJUnit4::class)
class EndOfRoundFlowTest {
    @get:Rule val compose: ComposeTestRule = createEmptyComposeRule()

    private val app get() = ApplicationProvider.getApplicationContext<DiwaliApplication>()
    private val api = FakeGameApi()
    private val tracking = FakeTrackingPipeline()
    private val results = FakeResultSink()
    private val audio = FakeGameAudio()
    private var scenario: ActivityScenario<MainActivity>? = null

    private val prizes = listOf(
        RewardItem(id = "r1", name = "20% OFF", couponCode = "DIWALI20"),
        RewardItem(id = "r2", name = "Free Mug", couponCode = "MUG"),
    )

    @Before
    fun grantCamera() {
        InstrumentationRegistry.getInstrumentation().uiAutomation
            .grantRuntimePermission(app.packageName, Manifest.permission.CAMERA)
    }

    @After
    fun tearDown() {
        scenario?.close()
        app.dependenciesOverride = null
    }

    /** A one-second touch round: no calibration, straight to the end of round. */
    private fun launch(rewardsEnabled: Boolean) {
        val state = BrandingState(
            settings = SystemSettings(gameplayMode = "touch", gameDurationSeconds = 1, rewardsEnabled = rewardsEnabled).normalizedForBranding(),
            bombs = ListBombsResponse(success = true, bombs = listOf(BombConfig(id = "b", name = "Red", points = 25, soundPreset = "pop")), settings = DEFAULT_BOMB_SETTINGS),
            rewards = RewardsInfo(success = true, enabled = rewardsEnabled, rewards = prizes),
            isLoading = false,
        )
        app.dependenciesOverride = AppDependencies(
            api, results, audio, tracking, FakeBrandingSource(state),
            MutableStateFlow(true), publicWebUrl = { "https://kiosk.example" },
        )
        compose.mainClock.autoAdvance = false
        scenario = ActivityScenario.launch(MainActivity::class.java)
        waitForTag(Tags.START_SCREEN)
    }

    private fun pump() {
        compose.mainClock.advanceTimeBy(64)
        Thread.sleep(16)
    }

    private fun waitUntil(what: String, timeoutMs: Long = 30_000, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            pump()
            if (condition()) return
        }
        throw AssertionError("timed out waiting for $what")
    }

    private fun hasTag(tag: String) = compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    private fun waitForTag(tag: String) = waitUntil(tag) { hasTag(tag) }

    private fun tap(tag: String) {
        compose.onNodeWithTag(tag).performClick()
        pump()
    }

    private fun playToCard(code: String = "1234") {
        code.forEach { tap(Tags.key(it)) }
        tap(Tags.PLAY)
        waitForTag(Tags.PHOTO_SCREEN)
        waitForTag(Tags.CARD_SCREEN)
    }

    @Test
    fun fullFlowToFeedbackAndBackToStart() {
        launch(rewardsEnabled = true)
        api.onSpin = { ApiResult.Success(SpinWheelResponse(success = true, reward = prizes[1], rewardIndex = 1)) }
        playToCard()
        waitUntil("completeSession") { api.completed.isNotEmpty() }
        assertThat(api.completed.single().sessionId).isEqualTo("server_session")

        tap(Tags.ENVELOPE)
        waitForTag(Tags.WISH)
        assertThat(audio.crackers).contains("FLOWER_POT")

        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.SPIN_SCREEN)
        tap(Tags.SPIN_BUTTON)
        waitForTag(Tags.SPIN_VOUCHER)
        assertThat(api.spins.single().sessionId).isEqualTo("server_session")
        assertThat(api.spins.single().userId).isNull()
        assertThat(audio.ticks).isNotEmpty()
        assertThat(audio.victories).isEqualTo(1)
        waitForTag(Tags.RETURNING)

        tap(Tags.SPIN_CONTINUE)
        waitForTag(Tags.FEEDBACK_SCREEN)
        assertThat(hasTag(Tags.FEEDBACK_REWARD)).isTrue()

        tap(Tags.feedback(GameFeedback.Excellent.name))
        tap(Tags.FEEDBACK_SUBMIT)
        waitForTag(Tags.FEEDBACK_THANKS)
        waitForTag(Tags.START_SCREEN)
        waitUntil("the feedback") { api.feedback.isNotEmpty() }
        assertThat(api.feedback.single()).isEqualTo("server_session" to GameFeedback.Excellent)
        assertThat(tracking.running).isFalse()
    }

    @Test
    fun spinFailureShowsTheMessageAndContinues() {
        launch(rewardsEnabled = true)
        api.onSpin = { ApiResult.NetworkError(IOException("down")) }
        playToCard()
        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.SPIN_SCREEN)
        tap(Tags.SPIN_BUTTON)
        waitForTag(Tags.SPIN_ERROR)
        waitForTag(Tags.RETURNING)
        tap(Tags.SPIN_CONTINUE)
        waitForTag(Tags.FEEDBACK_SCREEN)
        assertThat(hasTag(Tags.FEEDBACK_REWARD)).isFalse()
    }

    @Test
    fun aGuestSessionNeverSpinsOnTheServer() {
        launch(rewardsEnabled = true)
        api.onStart = { ApiResult.NetworkError(IOException("down")) }
        playToCard()
        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.SPIN_SCREEN)
        tap(Tags.SPIN_BUTTON)
        waitForTag(Tags.SPIN_ERROR)
        assertThat(api.spins).isEmpty()
    }

    @Test
    fun rewardsDisabledSkipsTheWheel() {
        launch(rewardsEnabled = false)
        playToCard()
        waitForTag(Tags.RETURNING) // the 20 s starts with the card
        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.FEEDBACK_SCREEN)
        assertThat(hasTag(Tags.SPIN_SCREEN)).isFalse()
        tap(Tags.PLAY_AGAIN)
        waitForTag(Tags.START_SCREEN)
    }

    @Test
    fun offlineCompletionQueuesTheResultAndStillShowsTheCard() {
        launch(rewardsEnabled = false)
        api.onComplete = { ApiResult.NetworkError(IOException("down")) }
        playToCard()
        waitUntil("the queue") { results.queued.isNotEmpty() }
        assertThat(results.queued.single().sessionId).isEqualTo("server_session")
        assertThat(hasTag(Tags.CARD_SCORE)).isTrue()
    }

    @Test
    fun trialPlaysAgainWithoutTheCodeAndNeverTouchesTheServer() {
        launch(rewardsEnabled = false)
        playToCard("8536")
        assertThat(hasTag(Tags.RETURNING)).isFalse() // the master session never auto-returns
        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.FEEDBACK_SCREEN)
        assertThat(hasTag(Tags.FEEDBACK_SUBMIT)).isFalse() // no feedback for trials
        tap(Tags.PLAY_AGAIN)
        waitForTag(Tags.HUD_TIMER)
        waitForTag(Tags.CARD_SCREEN)
        assertThat(api.totalCalls).isEqualTo(0)
    }

    @Test
    fun aLateCameraHoldsTheCountdownThenThePhotoHappens() {
        launch(rewardsEnabled = false)
        tracking.startsReady = false
        "1234".forEach { tap(Tags.key(it)) }
        tap(Tags.PLAY)
        waitForTag(Tags.PHOTO_SCREEN)
        val waitUntil = System.currentTimeMillis() + 2_000
        while (System.currentTimeMillis() < waitUntil) {
            pump()
            assertThat(hasTag(Tags.PHOTO_COUNT)).isFalse()
        }
        tracking.becomeReady()
        waitForTag(Tags.PHOTO_COUNT)
        waitForTag(Tags.CARD_SCREEN)
    }

    @Test
    fun aFailedCaptureGoesToTheCardWithNoStamp() {
        launch(rewardsEnabled = false)
        tracking.still = null
        "1234".forEach { tap(Tags.key(it)) }
        tap(Tags.PLAY)
        waitForTag(Tags.PHOTO_SCREEN)
        waitUntil("the card") {
            assertThat(hasTag(Tags.PHOTO_CAPTURED)).isFalse()
            hasTag(Tags.CARD_SCREEN)
        }
    }

    @Test
    fun aLateScorePrizeShowsOnTheWheelAndOnFeedback() {
        launch(rewardsEnabled = true)
        val answer = CompletableDeferred<Unit>()
        val mug = EarnedReward("m", "Free Mug", "", "", "MUG50")
        api.onComplete = { req ->
            answer.await()
            ApiResult.Success(CompleteSessionResponse(success = true, session = GameSession(id = req.sessionId, userId = "u1", earnedReward = mug), user = TEST_USER))
        }
        playToCard()
        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.SPIN_SCREEN)
        assertThat(hasTag(Tags.CARD_REWARD)).isFalse()
        answer.complete(Unit)
        waitForTag(Tags.CARD_REWARD)

        api.onSpin = { ApiResult.NetworkError(IOException("down")) }
        tap(Tags.SPIN_BUTTON)
        waitForTag(Tags.SPIN_ERROR)
        tap(Tags.SPIN_CONTINUE)
        waitForTag(Tags.FEEDBACK_SCREEN)
        assertThat(hasTag(Tags.CARD_REWARD)).isTrue()

        // A coupon on show: submitting doesn't take it away.
        tap(Tags.feedback(GameFeedback.Good.name))
        tap(Tags.FEEDBACK_SUBMIT)
        waitForTag(Tags.FEEDBACK_THANKS)
        waitUntil("the feedback") { api.feedback.isNotEmpty() }
        val until = System.currentTimeMillis() + FEEDBACK_THANKS_MS + 1_000
        while (System.currentTimeMillis() < until) pump()
        assertThat(hasTag(Tags.CARD_REWARD)).isTrue()
        assertThat(hasTag(Tags.START_SCREEN)).isFalse()
    }

    @Test
    fun theWheelSpinsOnTodaysRewards() {
        launch(rewardsEnabled = true)
        val fresh = RewardItem(id = "new", name = "Brand New", couponCode = "NEW")
        api.onGetRewards = { ApiResult.Success(RewardsInfo(success = true, enabled = true, rewards = listOf(fresh))) }
        api.onSpin = { ApiResult.Success(SpinWheelResponse(success = true, reward = fresh)) }
        playToCard()
        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.SPIN_SCREEN)
        waitUntil("today's slices") {
            compose.onAllNodes(hasTestTag(Tags.WHEEL) and hasContentDescription("Brand New")).fetchSemanticsNodes().isNotEmpty()
        }
        tap(Tags.SPIN_BUTTON)
        waitForTag(Tags.SPIN_VOUCHER)
        assertThat(api.spins).hasSize(1)
    }

    @Test
    fun theCloseButtonGoesHomeFromTheCard() {
        launch(rewardsEnabled = true)
        playToCard()
        tap(Tags.CLOSE)
        waitForTag(Tags.START_SCREEN)
        assertThat(api.abandoned).isEmpty()
    }
}
