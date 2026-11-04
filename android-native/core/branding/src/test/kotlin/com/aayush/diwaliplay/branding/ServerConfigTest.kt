package com.aayush.diwaliplay.branding

import android.content.Context
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class ServerConfigTest {
    private val prefs get() = RuntimeEnvironment.getApplication().getSharedPreferences("srv", Context.MODE_PRIVATE)

    @Test fun defaultsMatchGlobalConstraints() {
        val c = ServerConfig(prefs)
        assertThat(c.apiBaseUrl).isEqualTo("https://diwaliplay.onrender.com")
        assertThat(c.publicWebUrl).isEqualTo("https://diwali-game-six.vercel.app")
    }

    @Test fun persistsOverridesTrimsTrailingSlashAndResetsOnBlank() {
        val c = ServerConfig(prefs)
        c.apiBaseUrl = " http://10.0.0.5:3000/ "
        c.publicWebUrl = "http://10.0.0.5:3001"
        val again = ServerConfig(prefs)
        assertThat(again.apiBaseUrl).isEqualTo("http://10.0.0.5:3000")
        assertThat(again.publicWebUrl).isEqualTo("http://10.0.0.5:3001")
        again.apiBaseUrl = ""
        assertThat(ServerConfig(prefs).apiBaseUrl).isEqualTo("https://diwaliplay.onrender.com")
    }
}
