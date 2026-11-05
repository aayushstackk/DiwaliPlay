package com.aayush.diwaliplay.kiosk

import android.content.Context
import android.content.SharedPreferences
import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class AdminPinTest {
    private val prefs: SharedPreferences
        get() = RuntimeEnvironment.getApplication().getSharedPreferences("pin", Context.MODE_PRIVATE)

    @Test fun pinRejectsShortOrNonDigit() {
        val pin = AdminPin(prefs)
        for (bad in listOf("", "123", "123456789", "12a4", "12 34", "١٢٣٤")) {
            assertThrows(IllegalArgumentException::class.java) { pin.set(bad) }
        }
        assertThat(pin.isSet).isFalse()
        pin.set("1234")
        pin.set("12345678")
        assertThat(pin.isSet).isTrue()
    }

    @Test fun pinVerifiesOnlyCorrect() {
        val pin = AdminPin(prefs)
        assertThat(pin.verify("1234")).isFalse() // nothing set yet
        pin.set("1234")
        assertThat(pin.verify("1234")).isTrue()
        assertThat(pin.verify("1235")).isFalse()
        assertThat(pin.verify("12345")).isFalse()
        assertThat(pin.verify("")).isFalse()
        assertThat(AdminPin(prefs).verify("1234")).isTrue() // survives a restart
    }

    @Test fun pinHashIsSalted() {
        val pin = AdminPin(prefs)
        pin.set("1234")
        val first = prefs.all.values.single()
        pin.set("1234")
        val second = prefs.all.values.single()
        assertThat(second).isNotEqualTo(first)
        assertThat(first.toString()).doesNotContain("1234")
    }

    @Test fun corruptStoredValueVerifiesNothing() {
        prefs.edit().putString("pin_hash", "not a hash").commit()
        assertThat(AdminPin(prefs).verify("1234")).isFalse()
    }
}
