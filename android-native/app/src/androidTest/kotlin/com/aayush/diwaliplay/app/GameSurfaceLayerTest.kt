package com.aayush.diwaliplay.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aayush.diwaliplay.app.ui.GameSurfaceLayer
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GameSurfaceLayerTest {
    @get:Rule val compose = createComposeRule()

    /** The layer recomposes as soon as its factory publishes the view; the hooks must survive that. */
    @Test
    fun stepperKeepsItsSurfaceHooksUntilTheLayerLeavesComposition() {
        val vm = GameViewModel(
            AppDependencies(
                FakeGameApi(), FakeResultSink(), FakeGameAudio(), FakeTrackingPipeline(), FakeBrandingSource(),
                MutableStateFlow(true), publicWebUrl = { "https://kiosk.example" },
            ),
        )
        val stepper = vm.frameStepper
        val unattachedLowEnd = stepper.lowEndSource
        var show by mutableStateOf(true)

        compose.setContent { if (show) GameSurfaceLayer(vm, active = false) }
        compose.waitForIdle()
        assertThat(stepper.spriteWarmer).isNotNull()
        assertThat(stepper.lowEndSource).isNotSameInstanceAs(unattachedLowEnd)

        show = false
        compose.waitForIdle()
        assertThat(stepper.spriteWarmer).isNull()
        assertThat(stepper.lowEndSource).isSameInstanceAs(unattachedLowEnd)
    }
}
