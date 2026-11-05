package com.aayush.diwaliplay.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aayush.diwaliplay.kiosk.SecureStore
import com.google.common.truth.Truth.assertThat
import java.security.KeyStore
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith

/** The real Android Keystore, which Robolectric doesn't have. */
@RunWith(AndroidJUnit4::class)
class SecureStoreKeystoreTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @After
    fun forget() {
        SecureStore(context).remove(NAME)
    }

    @Test
    fun roundTripsUnderTheRelayKeyAndAcrossInstances() {
        SecureStore(context).put(NAME, "device-token")

        assertThat(SecureStore(context).get(NAME)).isEqualTo("device-token")
        val raw = context.getSharedPreferences("secure_store", Context.MODE_PRIVATE).getString(NAME, null)
        assertThat(raw).isNotNull()
        assertThat(raw).doesNotContain("device-token")
        val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        assertThat(keys.containsAlias("diwaliplay_relay")).isTrue()
    }

    @Test
    fun removeForgets() {
        val store = SecureStore(context)
        store.put(NAME, "x")
        store.remove(NAME)
        assertThat(store.get(NAME)).isNull()
    }

    private companion object {
        const val NAME = "instrumented_test_value"
    }
}
