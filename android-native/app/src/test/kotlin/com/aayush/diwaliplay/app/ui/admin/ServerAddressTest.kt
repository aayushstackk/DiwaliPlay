package com.aayush.diwaliplay.app.ui.admin

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ServerAddressTest {
    private fun release(input: String) = checkServerAddress(input, debuggable = false)
    private fun debug(input: String) = checkServerAddress(input, debuggable = true)

    @Test fun httpsIsFineInBothBuilds() {
        assertThat(release("https://kiosk.example.com")).isEqualTo(AddressCheck.Ok("https://kiosk.example.com"))
        assertThat(debug("https://kiosk.example.com:8443/base/")).isEqualTo(AddressCheck.Ok("https://kiosk.example.com:8443/base"))
        assertThat(release("  HTTPS://Kiosk.Example.com  ")).isEqualTo(AddressCheck.Ok("HTTPS://Kiosk.Example.com"))
    }

    @Test fun blankMeansBackToTheDefault() {
        assertThat(release("")).isEqualTo(AddressCheck.Ok(""))
        assertThat(release("   ")).isEqualTo(AddressCheck.Ok(""))
    }

    @Test fun releaseRefusesAllCleartext() {
        for (url in listOf("http://10.0.2.2:3001", "http://localhost:3001", "http://kiosk.example.com")) {
            assertThat(release(url)).isEqualTo(AddressCheck.Rejected(HTTPS_ONLY_MESSAGE))
        }
    }

    @Test fun debugAllowsCleartextOnlyToTheLocalTestHosts() {
        assertThat(debug("http://10.0.2.2:3001")).isEqualTo(AddressCheck.Ok("http://10.0.2.2:3001"))
        assertThat(debug("http://LOCALHOST:3001/")).isEqualTo(AddressCheck.Ok("http://LOCALHOST:3001"))
        for (url in listOf(
            "http://192.168.1.5:3001",
            "http://kiosk.example.com",
            "http://10.0.2.2.evil.example",
            "http://localhost@evil.example",
            "http://localhost.evil.example",
            "http://127.0.0.1:3001",
        )) {
            assertThat(debug(url)).isEqualTo(AddressCheck.Rejected(DEBUG_HTTP_MESSAGE))
        }
    }

    @Test fun malformedAddressesAreRefused() {
        for (url in listOf(
            "kiosk.example.com",
            "ftp://kiosk.example.com",
            "https://",
            "https:///path",
            "https://kiosk example.com",
            "https://user:pass@kiosk.example.com",
            "https://kiosk.example.com?x=1",
            "https://kiosk.example.com#top",
            "javascript:alert(1)",
        )) {
            assertThat(release(url)).isInstanceOf(AddressCheck.Rejected::class.java)
            assertThat(debug(url)).isInstanceOf(AddressCheck.Rejected::class.java)
        }
    }
}
