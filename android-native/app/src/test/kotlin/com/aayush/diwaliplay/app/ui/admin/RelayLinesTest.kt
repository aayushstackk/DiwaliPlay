package com.aayush.diwaliplay.app.ui.admin

import com.aayush.diwaliplay.kiosk.relay.RelayManager.State
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RelayLinesTest {
    @Test fun unpaired() {
        val l = relayLines(State(), 0)
        assertThat(l.status).isEqualTo("Not paired.")
        assertThat(l.code).isNull()
    }

    @Test fun waitingShowsTheCodeAndWhatsLeftOfIt() {
        val l = relayLines(State(busy = true, code = "123456", expiresAtMs = 90_000), 30_500)
        assertThat(l.code).isEqualTo("123456")
        assertThat(l.expiry).isEqualTo("Expires in 1:00")
    }

    @Test fun anExpiredCountdownStopsAtZero() {
        assertThat(countdown(-5_000)).isEqualTo("0:00")
        assertThat(countdown(900_000)).isEqualTo("15:00")
        assertThat(countdown(59_001)).isEqualTo("1:00")
    }

    @Test fun pairedSaysWhetherItsConnected() {
        assertThat(relayLines(State(paired = true, connected = true), 0).status).isEqualTo("Paired. Connected.")
        assertThat(relayLines(State(paired = true), 0).status).startsWith("Paired. Not connected")
    }

    @Test fun askingForACode() {
        assertThat(relayLines(State(busy = true), 0).status).isEqualTo("Asking the server for a code.")
    }
}
