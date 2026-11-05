package com.aayush.diwaliplay.app

import android.content.Context
import android.content.SharedPreferences
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class ActiveSessionStoreTest {
    private val prefs: SharedPreferences
        get() = RuntimeEnvironment.getApplication().getSharedPreferences("active", Context.MODE_PRIVATE)

    /** Each store stands for one process. */
    private fun nextProcess() = PrefsActiveSessionStore(prefs)

    @Test fun whatARunLeavesBehindIsTakenOnceByTheNext() {
        nextProcess().set("s1")

        val second = nextProcess()
        assertThat(second.takeLeftover()).isEqualTo("s1")
        assertThat(second.takeLeftover()).isNull()
        assertThat(nextProcess().takeLeftover()).isNull()
    }

    @Test fun clearedMeansNothingLeftOver() {
        val first = nextProcess()
        first.set("s1")
        first.clear()
        assertThat(nextProcess().takeLeftover()).isNull()
    }

    /** A second view model in the same process mustn't mistake the current round for a leftover one. */
    @Test fun aLaterTakeInTheSameProcessFindsNothing() {
        val store = nextProcess()
        assertThat(store.takeLeftover()).isNull()
        store.set("current")
        assertThat(store.takeLeftover()).isNull()
        assertThat(nextProcess().takeLeftover()).isEqualTo("current")
    }
}
