package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.game.flow.GameController
import com.aayush.diwaliplay.game.flow.GameEffects
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.game.flow.RoundSettings
import com.aayush.diwaliplay.game.flow.SessionInfo
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.BombGameSettings
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.GameFeedback
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameFrameStepperTest {
    private object NoEffects : GameEffects {
        override fun startSession(code: String) = Unit
        override fun completeSession(req: CompleteSessionRequest) = Unit
        override fun abandonSession(sessionId: String, reason: String) = Unit
        override fun playSound(key: String) = Unit
        override fun requestPhoto() = Unit
        override fun submitFeedback(sessionId: String, feedback: GameFeedback) = Unit
    }

    private val clock = RoundClock { 500.0 }
    private val controller = GameController(clock::now, Mulberry32(1), NoEffects)
    private val tracking = FakeTrackingPipeline()
    private val stepper = GameFrameStepper(controller, tracking, clock)

    private fun accept() = controller.onCodeAccepted(
        SessionInfo("s", "8536", "T", isTrial = true),
        RoundSettings(rewardsEnabled = false),
    )

    @Test
    fun framesUseTheRenderLoopTimeOutsideItTheSystemClock() {
        var seen = -1.0
        val c = GameController({ clock.now().also { seen = it } }, Mulberry32(1), NoEffects)
        GameFrameStepper(c, tracking, clock).step(0.016, 9_000.0)
        assertThat(seen).isEqualTo(9_000.0)
        assertThat(clock.now()).isEqualTo(500.0)
    }

    @Test
    fun frameCarriesPhaseAndNowMs() {
        accept()
        val f = stepper.step(0.016, 1_000.0)
        assertThat(f.nowMs).isEqualTo(1_000.0)
        assertThat(f.phase).isEqualTo(GamePhase.Calibrating(false))
        assertThat(f.sim).isSameInstanceAs(controller.crackers)
    }

    @Test
    fun calibratedSnapshotDrivesTheController() {
        accept()
        tracking.holdHandsInBoxes()
        stepper.step(0.016, 1_000.0)
        assertThat(controller.phase.value).isEqualTo(GamePhase.Calibrating(true))
    }

    @Test
    fun lowEndTripSwitchesSimAndFrameOnce() {
        var low = false
        stepper.lowEndSource = { low }
        accept()
        assertThat(stepper.step(0.016, 1_000.0).lowEnd).isFalse()
        assertThat(controller.crackers.flashEnabled).isTrue()
        low = true
        assertThat(stepper.step(0.016, 1_016.0).lowEnd).isTrue()
        assertThat(controller.crackers.flashEnabled).isFalse()
    }

    @Test
    fun preparedRoundIsWarmedOnTheRenderThreadOnce() {
        val warmed = mutableListOf<Pair<List<BombConfig>, BombGameSettings>>()
        stepper.spriteWarmer = SpriteWarmer { c, s -> warmed += c to s }
        val cfg = RoundSettings()
        stepper.prepareRound(cfg.bombConfigs, cfg.bombSettings)
        assertThat(warmed).isEmpty()
        stepper.step(0.016, 1_000.0)
        stepper.step(0.016, 1_016.0)
        assertThat(warmed).hasSize(1)
    }

    @Test
    fun detachingTheSurfaceLetsGoOfItsCallbacks() {
        var warmed = 0
        stepper.spriteWarmer = SpriteWarmer { _, _ -> warmed++ }
        stepper.lowEndSource = { true }
        stepper.detachSurface()

        val cfg = RoundSettings()
        stepper.prepareRound(cfg.bombConfigs, cfg.bombSettings)
        assertThat(stepper.step(0.016, 1_000.0).lowEnd).isFalse()
        assertThat(warmed).isEqualTo(0)
    }
}
