package com.aayush.diwaliplay.kiosk

import android.content.Context
import android.content.SharedPreferences
import com.google.common.truth.Truth.assertThat
import java.io.IOException
import java.security.KeyStoreException
import java.security.ProviderException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** Robolectric has no AndroidKeyStore: a plain AES key here; the real key is covered by SecureStoreKeystoreTest. */
@RunWith(RobolectricTestRunner::class)
class SecureStoreTest {
    private val prefs: SharedPreferences
        get() = RuntimeEnvironment.getApplication().getSharedPreferences("secure", Context.MODE_PRIVATE)
    private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private fun store(k: SecretKey = key) = SecureStore(prefs) { k }

    @Test fun roundTripsWithoutKeepingPlaintext() {
        val s = store()
        s.put("deviceToken", "secret-token")
        assertThat(s.get("deviceToken")).isEqualTo("secret-token")
        assertThat(prefs.all.toString()).doesNotContain("secret-token")
    }

    @Test fun missingKeyIsNull() {
        assertThat(store().get("nope")).isNull()
    }

    @Test fun eachPutUsesAFreshIv() {
        val s = store()
        s.put("a", "same")
        val first = prefs.getString("a", null)
        s.put("a", "same")
        assertThat(prefs.getString("a", null)).isNotEqualTo(first)
    }

    @Test fun removeForgets() {
        val s = store()
        s.put("a", "1")
        s.remove("a")
        assertThat(s.get("a")).isNull()
    }

    @Test fun tamperedOrUndecodableOrMovedValuesAreNull() {
        val s = store()
        s.put("a", "1")
        val stored = prefs.getString("a", null)!!
        prefs.edit().putString("b", stored).commit()
        assertThat(s.get("b")).isNull() // bound to its own name
        prefs.edit().putString("a", "!!not base64!!").commit()
        assertThat(s.get("a")).isNull()
        prefs.edit().putString("a", "AAAA").commit()
        assertThat(s.get("a")).isNull()
    }

    /** A TEE fault at startup mustn't become a crash loop: every failure is just "can't read it". */
    @Test fun keystoreFaultsAreNull() {
        store().put("a", "1")
        for (fault in listOf(ProviderException("tee"), IOException("load"), IllegalStateException("x"), KeyStoreException("ks"))) {
            assertThat(SecureStore(prefs) { throw fault }.get("a")).isNull()
        }
    }

    /** A wiped Keystore (restored backup, say): unreadable, so the device just pairs again. */
    @Test fun lostKeyIsNull() {
        store().put("a", "1")
        val other = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        assertThat(store(other).get("a")).isNull()
    }
}
