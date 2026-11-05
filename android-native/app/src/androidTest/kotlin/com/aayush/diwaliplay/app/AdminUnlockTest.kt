package com.aayush.diwaliplay.app

import android.Manifest
import android.content.Context
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.app.ui.admin.DEBUG_HTTP_MESSAGE
import com.aayush.diwaliplay.app.ui.admin.PIN_MISMATCH_MESSAGE
import com.aayush.diwaliplay.app.ui.admin.PIN_WRONG_MESSAGE
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.branding.ServerConfig
import com.aayush.diwaliplay.kiosk.AdminPin
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** The real activity and screens, with fakes for the network and the camera and throwaway prefs for the PIN. */
@RunWith(AndroidJUnit4::class)
class AdminUnlockTest {
    @get:Rule val compose: ComposeTestRule = createEmptyComposeRule()

    private val app get() = ApplicationProvider.getApplicationContext<DiwaliApplication>()
    private val tracking = FakeTrackingPipeline()
    private lateinit var pin: AdminPin
    private lateinit var servers: ServerConfig
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setUp() {
        InstrumentationRegistry.getInstrumentation().uiAutomation
            .grantRuntimePermission(app.packageName, Manifest.permission.CAMERA)
        val pinPrefs = app.getSharedPreferences("test_admin_pin", Context.MODE_PRIVATE)
        pinPrefs.edit().clear().commit()
        val serverPrefs = app.getSharedPreferences("test_servers", Context.MODE_PRIVATE)
        serverPrefs.edit().clear().commit()
        pin = AdminPin(pinPrefs)
        servers = ServerConfig(serverPrefs)
        app.dependenciesOverride = AppDependencies(
            FakeGameApi(), FakeResultSink(), FakeGameAudio(), tracking,
            FakeBrandingSource(BrandingState(isLoading = false)),
            MutableStateFlow(true), publicWebUrl = { "https://kiosk.example" },
            admin = AdminDependencies(pin, servers),
        )
        compose.mainClock.autoAdvance = false // infinite animations on the start screen
    }

    @After
    fun tearDown() {
        scenario?.close()
        app.dependenciesOverride = null
    }

    private fun launch(withPin: Boolean = true) {
        if (withPin) pin.set(PIN)
        scenario = ActivityScenario.launch(MainActivity::class.java)
        waitForTag(Tags.START_SCREEN)
    }

    private fun pump() {
        compose.mainClock.advanceTimeBy(64)
        Thread.sleep(16)
    }

    private fun waitForTag(tag: String, timeoutMs: Long = 20_000) = waitUntil(tag, timeoutMs) { hasTag(tag) }

    private fun waitUntil(what: String, timeoutMs: Long = 20_000, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            pump()
            if (condition()) return
        }
        throw AssertionError("timed out waiting for $what")
    }

    private fun hasTag(tag: String) = compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    private fun textOf(tag: String): String =
        compose.onNodeWithTag(tag).fetchSemanticsNode().config[SemanticsProperties.Text].joinToString { it.text }

    private fun tap(tag: String) {
        compose.onNodeWithTag(tag).performClick()
        pump()
    }

    private fun tapLogo(times: Int) = repeat(times) {
        compose.onNodeWithTag(Tags.BRAND_LOGO).performTouchInput { click() }
        pump()
    }

    private fun enterPin(value: String) {
        value.forEach { tap(Tags.pinKey(it)) }
        tap(Tags.PIN_OK)
    }

    private fun openAdmin() {
        tapLogo(5)
        waitForTag(Tags.PIN_DIALOG)
        enterPin(PIN)
        waitForTag(Tags.ADMIN_SCREEN)
    }

    private fun viewModel(): GameViewModel {
        lateinit var vm: GameViewModel
        scenario!!.onActivity { vm = ViewModelProvider(it)[GameViewModel::class.java] }
        return vm
    }

    @Test
    fun fourTapsDoNothing() {
        launch()
        tapLogo(4)
        repeat(5) { pump() }
        assertThat(hasTag(Tags.PIN_DIALOG)).isFalse()
    }

    @Test
    fun fiveTapsOpenThePinPrompt() {
        launch()
        tapLogo(5)
        waitForTag(Tags.PIN_DIALOG)
        assertThat(textOf(Tags.PIN_TITLE)).isEqualTo("ADMIN PIN")
    }

    @Test
    fun wrongPinIsRejected() {
        launch()
        tapLogo(5)
        waitForTag(Tags.PIN_DIALOG)

        enterPin("9999")

        waitForTag(Tags.PIN_ERROR)
        assertThat(textOf(Tags.PIN_ERROR)).isEqualTo(PIN_WRONG_MESSAGE)
        assertThat(hasTag(Tags.ADMIN_SCREEN)).isFalse()
        assertThat(hasTag(Tags.PIN_DIALOG)).isTrue()
    }

    @Test
    fun cancelGoesBackToTheStartScreen() {
        launch()
        tapLogo(5)
        waitForTag(Tags.PIN_DIALOG)
        tap(Tags.PIN_CANCEL)
        waitUntil("dialog gone") { !hasTag(Tags.PIN_DIALOG) }
        assertThat(hasTag(Tags.ADMIN_SCREEN)).isFalse()
    }

    @Test
    fun rightPinOpensTheAdminScreenWithEverySection() {
        launch()
        openAdmin()
        for (tag in listOf(Tags.ADMIN_LOCK, Tags.ADMIN_API_URL, Tags.ADMIN_WEB_URL, Tags.ADMIN_RELAY, Tags.ADMIN_CAMERA_TEST, Tags.ADMIN_PERF, Tags.ADMIN_DEVICE_INFO, Tags.ADMIN_EXIT)) {
            assertThat(hasTag(tag)).isTrue()
        }
        assertThat(hasTag(Tags.START_SCREEN)).isFalse()

        tap(Tags.ADMIN_CLOSE)
        waitForTag(Tags.START_SCREEN)
    }

    @Test
    fun firstLaunchForcesPinCreation() {
        launch(withPin = false)
        waitForTag(Tags.PIN_DIALOG)
        assertThat(textOf(Tags.PIN_TITLE)).isEqualTo("CREATE ADMIN PIN")
        assertThat(hasTag(Tags.PIN_CANCEL)).isFalse()

        // Too short: still here.
        enterPin("12")
        waitForTag(Tags.PIN_ERROR)
        assertThat(pin.isSet).isFalse()

        // A confirmation that doesn't match starts over.
        enterPin("1234")
        waitUntil("confirm") { textOf(Tags.PIN_TITLE) == "CONFIRM ADMIN PIN" }
        enterPin("4321")
        waitForTag(Tags.PIN_ERROR)
        assertThat(textOf(Tags.PIN_ERROR)).isEqualTo(PIN_MISMATCH_MESSAGE)
        assertThat(textOf(Tags.PIN_TITLE)).isEqualTo("CREATE ADMIN PIN")
        assertThat(pin.isSet).isFalse()

        enterPin("1234")
        waitUntil("confirm") { textOf(Tags.PIN_TITLE) == "CONFIRM ADMIN PIN" }
        enterPin("1234")
        waitUntil("dialog gone") { !hasTag(Tags.PIN_DIALOG) }
        assertThat(pin.verify("1234")).isTrue()
        assertThat(hasTag(Tags.ADMIN_SCREEN)).isFalse() // it's the 5 taps that open it, from now on
        assertThat(hasTag(Tags.START_SCREEN)).isTrue()
    }

    @Test
    fun logoTapsLeaveTheKeypadAlone() {
        launch()
        tap(Tags.key('1'))
        tapLogo(3)
        tap(Tags.key('2'))
        assertThat(viewModel().startUi.value.code).isEqualTo("12")
    }

    @Test
    fun keypadBelowThePinDialogCantBeReached() {
        launch()
        tapLogo(5)
        waitForTag(Tags.PIN_DIALOG)
        enterPin("9999")
        waitForTag(Tags.PIN_ERROR)
        assertThat(viewModel().startUi.value.code).isEmpty()
    }

    @Test
    fun logoIsOnlyTappableOnTheStartScreen() {
        launch()
        "8536".forEach { tap(Tags.key(it)) }
        tap(Tags.PLAY)
        waitForTag(Tags.CALIBRATION)
        assertThat(hasTag(Tags.BRAND_LOGO)).isFalse()
    }

    @Test
    fun cleartextAddressRefusedAndNothingSaved() {
        launch()
        openAdmin()

        compose.onNodeWithTag(Tags.ADMIN_API_URL).performTextReplacement("http://192.168.1.5:3001")
        pump()
        tap(Tags.ADMIN_SERVERS_SAVE)

        assertThat(textOf(Tags.ADMIN_API_ERROR)).isEqualTo(DEBUG_HTTP_MESSAGE)
        assertThat(servers.apiBaseUrl).isEqualTo("https://diwaliplay.onrender.com")
        assertThat(hasTag(Tags.ADMIN_SERVERS_SAVED)).isFalse()
    }

    @Test
    fun validAddressesAreSaved() {
        launch()
        openAdmin()

        compose.onNodeWithTag(Tags.ADMIN_API_URL).performTextReplacement("https://api.example.com/")
        compose.onNodeWithTag(Tags.ADMIN_WEB_URL).performTextReplacement("http://10.0.2.2:3001")
        pump()
        tap(Tags.ADMIN_SERVERS_SAVE)

        waitForTag(Tags.ADMIN_SERVERS_SAVED)
        assertThat(servers.apiBaseUrl).isEqualTo("https://api.example.com")
        assertThat(servers.publicWebUrl).isEqualTo("http://10.0.2.2:3001")
    }

    @Test
    fun cameraTestStopsOnLeavingTheAdminScreen() {
        launch()
        openAdmin()
        tap(Tags.ADMIN_CAMERA_TEST)
        waitForTag(Tags.ADMIN_CAMERA_VIEW)
        assertThat(tracking.running).isTrue()

        tap(Tags.ADMIN_CLOSE)
        waitForTag(Tags.START_SCREEN)
        waitUntil("camera stopped") { !tracking.running }
    }

    @Test
    fun cameraTestStopsWhenTheActivityPauses() {
        launch()
        openAdmin()
        tap(Tags.ADMIN_CAMERA_TEST)
        waitForTag(Tags.ADMIN_CAMERA_VIEW)

        scenario!!.moveToState(Lifecycle.State.STARTED)
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()

        assertThat(tracking.running).isFalse()
    }

    @Test
    fun perfOverlayToggleShowsItAboveTheStartScreen() {
        launch()
        assertThat(hasTag(Tags.PERF_OVERLAY)).isFalse()
        openAdmin()
        tap(Tags.ADMIN_PERF)
        waitForTag(Tags.PERF_OVERLAY)
        tap(Tags.ADMIN_CLOSE)
        waitForTag(Tags.START_SCREEN)
        assertThat(hasTag(Tags.PERF_OVERLAY)).isTrue()
    }

    @Test
    fun backIsConsumedOnTheStartScreenAndClosesTheAdminScreen() {
        launch()
        scenario!!.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        pump()
        scenario!!.onActivity { assertThat(it.isFinishing).isFalse() }

        openAdmin()
        scenario!!.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        waitForTag(Tags.START_SCREEN)
        assertThat(hasTag(Tags.ADMIN_SCREEN)).isFalse()
        scenario!!.onActivity { assertThat(it.isFinishing).isFalse() }
    }

    @Test
    fun exitFinishesTheActivity() {
        launch()
        openAdmin()
        compose.onNodeWithTag(Tags.ADMIN_EXIT).performScrollTo()
        tap(Tags.ADMIN_EXIT)
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        val deadline = System.currentTimeMillis() + 10_000
        while (scenario!!.state != Lifecycle.State.DESTROYED && System.currentTimeMillis() < deadline) Thread.sleep(100)
        assertThat(scenario!!.state).isEqualTo(Lifecycle.State.DESTROYED)
    }

    private companion object {
        const val PIN = "2468"
    }
}
