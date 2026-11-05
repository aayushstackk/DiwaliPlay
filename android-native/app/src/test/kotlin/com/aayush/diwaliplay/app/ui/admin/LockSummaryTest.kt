package com.aayush.diwaliplay.app.ui.admin

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LockSummaryTest {
    @Test fun saysWhichTierAndWhetherItsHolding() {
        assertThat(lockSummary(deviceOwner = true, wanted = true, active = true)).isEqualTo("Full lock (device owner). Active now.")
        assertThat(lockSummary(deviceOwner = true, wanted = false, active = false)).isEqualTo("Full lock (device owner). Off.")
        assertThat(lockSummary(deviceOwner = false, wanted = true, active = false))
            .isEqualTo("Screen pinning: this app isn't the device owner. Not active: accept the system's prompt.")
    }
}
