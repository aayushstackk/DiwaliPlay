package com.aayush.diwaliplay.app

import android.security.NetworkSecurityPolicy
import androidx.compose.runtime.Composer
import androidx.compose.runtime.InternalComposeTracingApi
import androidx.compose.runtime.CompositionTracer
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aayush.diwaliplay.app.ui.CalibrationScreen
import com.aayush.diwaliplay.app.ui.CountdownOverlay
import com.aayush.diwaliplay.app.ui.HudOverlay
import com.aayush.diwaliplay.app.ui.RoundHeader
import com.aayush.diwaliplay.app.ui.StartScreen
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.game.flow.HudState
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CopyOnWriteArrayList
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Spec §5: Compose overlays aren't per-frame. Animations here must only touch layers and drawing, so while they run,
 * none of our composables may be composed again. The compiler's trace markers count each actual composition.
 */
@OptIn(InternalComposeTracingApi::class)
@RunWith(AndroidJUnit4::class)
class OverlayRecompositionTest {
    @get:Rule val compose = createComposeRule()

    private val composed = CopyOnWriteArrayList<String>()

    @Before
    fun trace() {
        Composer.setTracer(object : CompositionTracer {
            override fun isTraceInProgress() = true
            override fun traceEventStart(key: Int, dirty1: Int, dirty2: Int, info: String) {
                if (info.startsWith("com.aayush.diwaliplay")) composed += info
            }
            override fun traceEventEnd() = Unit
        })
    }

    @After
    fun stopTracing() {
        Composer.setTracer(object : CompositionTracer {
            override fun isTraceInProgress() = false
            override fun traceEventStart(key: Int, dirty1: Int, dirty2: Int, info: String) = Unit
            override fun traceEventEnd() = Unit
        })
    }

    private fun assertAnimatesWithoutRecomposing(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.mainClock.autoAdvance = false
        compose.setContent(content)
        compose.mainClock.advanceTimeBy(100)
        assertThat(composed).isNotEmpty() // the tracer does see our composables
        composed.clear()

        compose.mainClock.advanceTimeBy(2_000)
        assertThat(composed).isEmpty()
    }

    @Test
    fun urgentHudTimer() = assertAnimatesWithoutRecomposing { HudOverlay(HudState(secondsLeftCeil = 5, score = 10), null) }

    @Test
    fun calibration() = assertAnimatesWithoutRecomposing { CalibrationScreen(CalibrationUi(), isReady = false) }

    @Test
    fun calibrationReadyBanner() = assertAnimatesWithoutRecomposing { CalibrationScreen(CalibrationUi(true, true, 1.0), isReady = true) }

    @Test
    fun roundHeader() = assertAnimatesWithoutRecomposing { RoundHeader(BrandingState(), Modifier) }

    @Test
    fun countdownNumberScaling() = assertAnimatesWithoutRecomposing { CountdownOverlay(3) }

    @Test
    fun startScreen() = assertAnimatesWithoutRecomposing {
        StartScreen(StartUi(), BrandingState(isLoading = false), "https://kiosk.example/register", {}, {}, {}, {})
    }

    /** The debug override of network_security_config. Release's has no domain-config at all. */
    @Test
    fun debugCleartextOnlyToLocalTestServers() {
        val policy = NetworkSecurityPolicy.getInstance()
        assertThat(policy.isCleartextTrafficPermitted("10.0.2.2")).isTrue()
        assertThat(policy.isCleartextTrafficPermitted("localhost")).isTrue()
        assertThat(policy.isCleartextTrafficPermitted("diwaliplay.onrender.com")).isFalse()
        assertThat(policy.isCleartextTrafficPermitted("192.168.1.10")).isFalse()
    }
}
