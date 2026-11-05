package com.aayush.diwaliplay.app.ui.admin

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PinMessagesTest {
    @Test fun wrongSaysHowManyAreLeft() {
        assertThat(wrongPinMessage(4)).isEqualTo("Wrong PIN. 4 tries left")
        assertThat(wrongPinMessage(1)).isEqualTo("Wrong PIN. 1 try left")
    }

    @Test fun lockedOutRoundsUpToTheNextMinute() {
        assertThat(lockedOutMessage(15 * 60_000L)).isEqualTo("Too many wrong PINs. Try again in 15 minutes")
        assertThat(lockedOutMessage(14 * 60_000L + 1)).isEqualTo("Too many wrong PINs. Try again in 15 minutes")
        assertThat(lockedOutMessage(1)).isEqualTo("Too many wrong PINs. Try again in 1 minute")
    }
}
