package com.aayush.diwaliplay.kiosk

import android.content.Context
import android.content.SharedPreferences
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

private const val FIFTEEN_MIN = 15 * 60_000L

@RunWith(RobolectricTestRunner::class)
class AdminPinTest {
    private val prefs: SharedPreferences
        get() = RuntimeEnvironment.getApplication().getSharedPreferences("pin", Context.MODE_PRIVATE)
    private var nowMs = 1_000_000_000L

    private fun pin() = AdminPin(prefs) { nowMs }

    private fun AdminPin.failTimes(n: Int) = repeat(n) { verify("9999") }

    @Test fun pinRejectsShortOrNonDigit() {
        val pin = pin()
        for (bad in listOf("", "123", "123456789", "12a4", "12 34", "١٢٣٤")) {
            assertThrows(IllegalArgumentException::class.java) { pin.set(bad) }
        }
        assertThat(pin.isSet).isFalse()
        pin.set("1234")
        pin.set("12345678")
        assertThat(pin.isSet).isTrue()
    }

    @Test fun pinVerifiesOnlyCorrect() {
        val pin = pin()
        assertThat(pin.verify("1234")).isEqualTo(PinResult.Wrong(5)) // nothing set yet, and nothing counted
        pin.set("1234")
        assertThat(pin.verify("1234")).isEqualTo(PinResult.Ok)
        assertThat(pin.verify("1235")).isEqualTo(PinResult.Wrong(4))
        assertThat(pin.verify("12345")).isEqualTo(PinResult.Wrong(3))
        assertThat(pin.verify("")).isEqualTo(PinResult.Wrong(2))
        assertThat(pin().verify("1234")).isEqualTo(PinResult.Ok) // survives a restart
    }

    @Test fun pinHashIsSalted() {
        val pin = pin()
        pin.set("1234")
        val first = prefs.all.values.single()
        pin.set("1234")
        val second = prefs.all.values.single()
        assertThat(second).isNotEqualTo(first)
        assertThat(first.toString()).doesNotContain("1234")
    }

    @Test fun corruptStoredValueVerifiesNothing() {
        prefs.edit().putString("pin_hash", "not a hash").commit()
        assertThat(pin().verify("1234")).isInstanceOf(PinResult.Wrong::class.java)
    }

    @Test fun fifthFailureLocks() {
        val pin = pin()
        pin.set("1234")
        pin.failTimes(4)
        assertThat(pin.verify("9999")).isEqualTo(PinResult.LockedOut(FIFTEEN_MIN))
    }

    @Test fun rightPinIsRefusedWhileLockedOut() {
        val pin = pin()
        pin.set("1234")
        pin.failTimes(5)
        nowMs += 60_000
        assertThat(pin.verify("1234")).isEqualTo(PinResult.LockedOut(FIFTEEN_MIN - 60_000))
    }

    @Test fun lockoutSurvivesANewInstance() {
        val first = pin()
        first.set("1234")
        first.failTimes(5)
        assertThat(pin().verify("1234")).isInstanceOf(PinResult.LockedOut::class.java)
    }

    @Test fun countSurvivesANewInstance() {
        val first = pin()
        first.set("1234")
        first.failTimes(4)
        assertThat(pin().verify("9999")).isInstanceOf(PinResult.LockedOut::class.java)
    }

    /** A power cut during the hash mustn't hand back the attempt: it's on disk before any hashing starts. */
    @Test fun failureIsOnDiskBeforeHashing() {
        val pin = AdminPin(prefs, { nowMs }) { _, _ ->
            assertThat(prefs.getInt("pin_failures", 0)).isEqualTo(1)
            throw Error("power cut")
        }
        prefs.edit().putString("pin_hash", "AAAA:AAAA").commit()
        assertThrows(Error::class.java) { pin.verify("1234") }
        assertThat(prefs.getInt("pin_failures", 0)).isEqualTo(1)
    }

    @Test fun noHashingWhileLockedOut() {
        val real = pin()
        real.set("1234")
        real.failTimes(5)
        var hashed = false
        val pin = AdminPin(prefs, { nowMs }) { _, _ ->
            hashed = true
            ByteArray(32)
        }
        assertThat(pin.verify("1234")).isInstanceOf(PinResult.LockedOut::class.java)
        assertThat(hashed).isFalse()
    }

    @Test fun lockoutExpiresWithAFullCount() {
        val pin = pin()
        pin.set("1234")
        pin.failTimes(5)
        nowMs += FIFTEEN_MIN
        assertThat(pin.verify("9999")).isEqualTo(PinResult.Wrong(4))
        assertThat(pin.verify("1234")).isEqualTo(PinResult.Ok)
    }

    @Test fun successClearsTheCount() {
        val pin = pin()
        pin.set("1234")
        pin.failTimes(4)
        assertThat(pin.verify("1234")).isEqualTo(PinResult.Ok)
        assertThat(pin.verify("9999")).isEqualTo(PinResult.Wrong(4))
    }

    @Test fun settingAPinClearsTheLockout() {
        val pin = pin()
        pin.set("1234")
        pin.failTimes(5)
        pin.set("5678")
        assertThat(pin.verify("5678")).isEqualTo(PinResult.Ok)
    }

    /** Otherwise an hour back would make it a 75 minute lockout, and a year back a permanent one. */
    @Test fun clockMovingBackwardsCapsTheLockout() {
        val pin = pin()
        pin.set("1234")
        pin.failTimes(5)
        nowMs -= 60 * 60_000
        assertThat(pin.verify("1234")).isEqualTo(PinResult.LockedOut(FIFTEEN_MIN))
        nowMs += FIFTEEN_MIN - 1
        assertThat(pin.verify("1234")).isEqualTo(PinResult.LockedOut(1))
        nowMs += 1
        assertThat(pin.verify("1234")).isEqualTo(PinResult.Ok)
    }

    @Test fun concurrentCallersCantGetExtraGuesses() {
        val pin = pin()
        pin.set("1234")
        val pool = Executors.newFixedThreadPool(4)
        val results = (1..12).map { pool.submit<PinResult> { pin.verify("9999") } }.map { it.get(60, TimeUnit.SECONDS) }
        pool.shutdown()
        assertThat(results.count { it is PinResult.Wrong }).isEqualTo(4)
        assertThat(results.count { it is PinResult.LockedOut }).isEqualTo(8)
    }
}
