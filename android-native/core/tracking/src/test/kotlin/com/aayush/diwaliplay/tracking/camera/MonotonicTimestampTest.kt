package com.aayush.diwaliplay.tracking.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MonotonicTimestampTest {

    @Test
    fun passesIncreasingTimestampsThrough() {
        val ts = MonotonicTimestamp()
        assertThat(ts.next(100)).isEqualTo(100)
        assertThat(ts.next(133)).isEqualTo(133)
    }

    @Test
    fun bumpsRepeatedOrBackwardsTimestampsByOne() {
        val ts = MonotonicTimestamp()
        assertThat(ts.next(100)).isEqualTo(100)
        assertThat(ts.next(100)).isEqualTo(101)
        assertThat(ts.next(90)).isEqualTo(102)
        assertThat(ts.next(200)).isEqualTo(200)
    }
}
