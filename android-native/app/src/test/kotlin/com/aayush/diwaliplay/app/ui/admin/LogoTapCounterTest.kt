package com.aayush.diwaliplay.app.ui.admin

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LogoTapCounterTest {
    private fun LogoTapCounter.tapAt(vararg times: Long) = times.map { onTap(it) }

    @Test fun fourTapsDoNothing() {
        assertThat(LogoTapCounter().tapAt(0, 100, 200, 300)).containsExactly(false, false, false, false)
    }

    @Test fun fifthTapWithinTheWindowOpens() {
        assertThat(LogoTapCounter().tapAt(0, 750, 1500, 2250, 3000).last()).isTrue()
    }

    @Test fun fifthTapJustOutsideTheWindowDoesnt() {
        assertThat(LogoTapCounter().tapAt(0, 750, 1500, 2250, 3001).last()).isFalse()
    }

    @Test fun anOldTapDropsOutOfTheWindow() {
        // The first is too old, but the next five are close enough.
        assertThat(LogoTapCounter().tapAt(0, 3000, 3100, 3200, 3300, 3400)).containsExactly(false, false, false, false, false, true).inOrder()
    }

    @Test fun opensOnceThenStartsCounting() {
        val c = LogoTapCounter()
        assertThat(c.tapAt(0, 1, 2, 3, 4).last()).isTrue()
        assertThat(c.tapAt(5, 6, 7, 8)).containsExactly(false, false, false, false)
        assertThat(c.onTap(9)).isTrue()
    }
}
