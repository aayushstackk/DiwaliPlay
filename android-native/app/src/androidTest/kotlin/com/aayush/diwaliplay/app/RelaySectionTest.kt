package com.aayush.diwaliplay.app

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.app.ui.admin.RelaySectionContent
import com.aayush.diwaliplay.kiosk.relay.RelayManager.State
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RelaySectionTest {
    @get:Rule val compose = createComposeRule()

    private val calls = mutableListOf<String>()
    private var state by mutableStateOf(State())

    private fun show() = compose.setContent {
        Column { RelaySectionContent(state, { calls += "pair" }, { calls += "cancel" }, { calls += "unpair" }) }
    }

    @Test fun pairingShowsTheCodeThenPairedOffersUnpair() {
        show()
        compose.onNodeWithTag(Tags.ADMIN_RELAY_PAIR).performClick()
        state = State(busy = true, code = "654321", expiresAtMs = System.currentTimeMillis() + 120_000)
        compose.onNodeWithTag(Tags.ADMIN_RELAY_CODE).assertIsDisplayed()
        compose.onNodeWithTag(Tags.ADMIN_RELAY_EXPIRY).assertIsDisplayed()
        compose.onNodeWithTag(Tags.ADMIN_RELAY_CANCEL).performClick()
        state = State(paired = true, connected = true)
        compose.onNodeWithTag(Tags.ADMIN_RELAY_STATE).assertIsDisplayed()
        compose.onNodeWithTag(Tags.ADMIN_RELAY_UNPAIR).performClick()
        assertThat(calls).containsExactly("pair", "cancel").inOrder() // asked first
        compose.onNodeWithTag(Tags.ADMIN_RELAY_UNPAIR_CANCEL).performClick()
        compose.onNodeWithTag(Tags.ADMIN_RELAY_UNPAIR).performClick()
        compose.onNodeWithTag(Tags.ADMIN_RELAY_UNPAIR_CONFIRM).performClick()
        assertThat(calls).containsExactly("pair", "cancel", "unpair").inOrder()
    }
}
