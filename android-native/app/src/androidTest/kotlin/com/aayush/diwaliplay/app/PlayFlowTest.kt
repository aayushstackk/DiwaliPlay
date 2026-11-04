package com.aayush.diwaliplay.app

import android.Manifest
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.branding.normalizedForBranding
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.DEFAULT_BOMB_SETTINGS
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.SystemSettings
import com.aayush.diwaliplay.model.VerifyCodeResponse
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The real activity, Compose screens, render loop and controller, with [FakeGameApi] and [FakeTrackingPipeline]
 * instead of the network and the camera. Infinite animations run on the screens, so the compose clock is driven by
 * hand; game time is the real clock.
 */
@RunWith(AndroidJUnit4::class)
class PlayFlowTest {
    @get:Rule val compose: ComposeTestRule = createEmptyComposeRule()

    private val app get() = ApplicationProvider.getApplicationContext<DiwaliApplication>()
    private val api = FakeGameApi()
    private val tracking = FakeTrackingPipeline()
    private val results = FakeResultSink()
    private lateinit var branding: FakeBrandingSource
    private var scenario: ActivityScenario<MainActivity>? = null

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

    private fun launch(settings: SystemSettings) {
        // One kind of bomb, worth points: a penalty bomb could take the score back to 0 mid-assert.
        val bomb = BombConfig(id = "b", name = "Red", points = 25, soundPreset = "pop")
        val state = BrandingState(
            settings = settings.normalizedForBranding(),
            bombs = ListBombsResponse(success = true, bombs = listOf(bomb), settings = DEFAULT_BOMB_SETTINGS),
            isLoading = false,
        )
        branding = FakeBrandingSource(state)
        app.dependenciesOverride = AppDependencies(
            api, results, FakeGameAudio(), tracking, branding,
            MutableStateFlow(true), publicWebUrl = { "https://kiosk.example" },
        )
        compose.mainClock.autoAdvance = false
        scenario = ActivityScenario.launch(MainActivity::class.java)
        waitForTag(Tags.START_SCREEN)
    }

    private fun viewModel(): GameViewModel {
        lateinit var vm: GameViewModel
        scenario!!.onActivity { vm = ViewModelProvider(it)[GameViewModel::class.java] }
        return vm
    }

    private fun pump() {
        compose.mainClock.advanceTimeBy(64)
        Thread.sleep(16)
    }

    private fun waitUntil(what: String, timeoutMs: Long = 20_000, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            pump()
            if (condition()) return
        }
        throw AssertionError("timed out waiting for $what")
    }

    private fun hasTag(tag: String) = compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    private fun waitForTag(tag: String, timeoutMs: Long = 20_000) = waitUntil(tag, timeoutMs) { hasTag(tag) }

    private fun textOf(tag: String): String =
        compose.onNodeWithTag(tag).fetchSemanticsNode().config[SemanticsProperties.Text].joinToString { it.text }

    private fun tap(tag: String) {
        compose.onNodeWithTag(tag).performClick()
        pump()
    }

    private fun enterCodeAndPlay(code: String) {
        code.forEach { tap(Tags.key(it)) }
        tap(Tags.PLAY)
    }

    /** Where a bomb in flight is now, if one is. */
    private fun flyingBomb(vm: GameViewModel): Pair<Double, Double>? =
        vm.bombs?.bombs?.firstOrNull { it.active && !it.isBursting && it.y in 120.0..1000.0 }?.let { it.x to it.y }

    @Test
    fun codeToCalibrationToCountdownToPlayingWithRunningTimer() {
        launch(SystemSettings(gameDurationSeconds = 8, rewardsEnabled = false))
        enterCodeAndPlay("1234")
        waitForTag(Tags.CALIBRATION)
        assertThat(api.verified).containsExactly("1234")
        assertThat(tracking.running).isTrue()

        tracking.holdHandsInBoxes()
        waitForTag(Tags.COUNTDOWN)
        waitForTag(Tags.HUD_TIMER)
        assertThat(api.started).containsExactly("1234")

        val first = textOf(Tags.HUD_TIMER)
        assertThat(first).matches("00:0[5-8]")
        waitUntil("the timer to count down", 4_000) { textOf(Tags.HUD_TIMER) != first }

        // Moving hands onto a bomb bursts it.
        val vm = viewModel()
        waitUntil("a hand to burst a bomb", 5_000) {
            flyingBomb(vm)?.let { (x, y) -> tracking.moveFast(x, y) }
            hasTag(Tags.HUD_SCORE) && textOf(Tags.HUD_SCORE) != "0"
        }

        // Round end: the camera keeps running through the photo, then the Task 19 placeholders lead back to the start.
        waitForTag(Tags.PHOTO_PLACEHOLDER)
        assertThat(tracking.running).isTrue()
        waitForTag(Tags.CARD_CONTINUE, 15_000)
        assertThat(api.completed.single().sessionId).isEqualTo("server_session")
        assertThat(api.completed.single().score).isGreaterThan(0)

        tap(Tags.CARD_CONTINUE)
        waitForTag(Tags.FEEDBACK_CONTINUE)
        tap(Tags.FEEDBACK_CONTINUE)
        waitForTag(Tags.START_SCREEN)
        assertThat(tracking.running).isFalse()
    }

    @Test
    fun touchModeTappingABombRaisesTheScore() {
        launch(SystemSettings(gameplayMode = "touch", gameDurationSeconds = 25, rewardsEnabled = false))
        enterCodeAndPlay("8536")
        waitForTag(Tags.COUNTDOWN) // straight past calibration
        assertThat(tracking.running).isFalse()
        waitForTag(Tags.TOUCH_LAYER)
        assertThat(textOf(Tags.HUD_SCORE)).isEqualTo("0")

        val vm = viewModel()
        waitUntil("a tap to burst a bomb") {
            flyingBomb(vm)?.let { (x, y) ->
                compose.onNodeWithTag(Tags.TOUCH_LAYER).performTouchInput {
                    down(Offset((x / 1920.0 * width).toFloat(), (y / 1080.0 * height).toFloat()))
                    up()
                }
            }
            textOf(Tags.HUD_SCORE) != "0"
        }
        assertThat(api.totalCalls).isEqualTo(0) // the trial code stays off the network
        assertThat(viewModel().phase.value).isEqualTo(GamePhase.Playing)
    }

    @Test
    fun settingsChangedMidRoundDontReachTheScreens() {
        launch(SystemSettings(gameplayMode = "camera", rewardsEnabled = false))
        enterCodeAndPlay("1234")
        waitForTag(Tags.CALIBRATION)
        branding.update { it.copy(settings = it.settings.copy(gameplayMode = "touch")) }
        tracking.holdHandsInBoxes()
        waitForTag(Tags.HUD_TIMER)
        pump()
        assertThat(hasTag(Tags.TOUCH_LAYER)).isFalse()
    }

    @Test
    fun rejectedCodeShowsTheServersMessage() {
        launch(SystemSettings())
        api.onVerify = { ApiResult.Success(VerifyCodeResponse(success = true, valid = false, message = "This code has expired")) }
        enterCodeAndPlay("1234")
        waitForTag(Tags.ERROR)
        assertThat(hasTag(Tags.CALIBRATION)).isFalse()
        assertThat(tracking.running).isFalse()
    }

    @Test
    fun pausingMidRoundAbandonsAndReturnsToStart() {
        launch(SystemSettings(rewardsEnabled = false))
        enterCodeAndPlay("1234")
        waitForTag(Tags.CALIBRATION)
        tracking.holdHandsInBoxes()
        waitForTag(Tags.HUD_TIMER)
        waitUntil("startSession") { api.started.isNotEmpty() }

        // CREATED pauses and stops the activity, as leaving the app would.
        scenario!!.moveToState(androidx.lifecycle.Lifecycle.State.CREATED)
        scenario!!.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED)
        waitForTag(Tags.START_SCREEN)
        waitUntil("the abandon") { api.abandoned.isNotEmpty() }
        assertThat(api.abandoned.single().reason).isEqualTo("interrupted")
        assertThat(tracking.running).isFalse()
    }
}
