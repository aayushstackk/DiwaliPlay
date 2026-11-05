package com.aayush.diwaliplay.app.ui.admin

import java.net.URI
import java.net.URISyntaxException

internal const val HTTPS_ONLY_MESSAGE = "This build only allows https:// addresses"
internal const val DEBUG_HTTP_MESSAGE = "http:// only works with 10.0.2.2 or localhost in a debug build. Use https://"
internal const val BAD_ADDRESS_MESSAGE = "Enter a full address, like https://example.com"

/** What res/xml/network_security_config.xml lets a debug build reach without TLS. */
private val DEBUG_CLEARTEXT_HOSTS = setOf("10.0.2.2", "localhost")

internal sealed interface AddressCheck {
    /** [address] is trimmed, and empty when the input was blank, which resets to the default. */
    data class Ok(val address: String) : AddressCheck
    data class Rejected(val message: String) : AddressCheck
}

/**
 * For a server address typed on the admin screen. It says no here to what the network security config would refuse
 * later, when all the operator would see is a kiosk that can't reach its server. [debuggable] is the build's flag.
 */
internal fun checkServerAddress(input: String, debuggable: Boolean): AddressCheck {
    val address = input.trim().trimEnd('/')
    if (address.isEmpty()) return AddressCheck.Ok("")
    val uri = try {
        URI(address)
    } catch (_: URISyntaxException) {
        return AddressCheck.Rejected(BAD_ADDRESS_MESSAGE)
    }
    when (uri.scheme?.lowercase()) {
        "https" -> Unit
        "http" -> {
            if (!debuggable) return AddressCheck.Rejected(HTTPS_ONLY_MESSAGE)
            // Userinfo: in http://localhost@evil.example, localhost isn't the host.
            if (uri.rawUserInfo != null || uri.host?.lowercase() !in DEBUG_CLEARTEXT_HOSTS) {
                return AddressCheck.Rejected(DEBUG_HTTP_MESSAGE)
            }
        }
        else -> return AddressCheck.Rejected(BAD_ADDRESS_MESSAGE)
    }
    if (uri.host == null || uri.rawUserInfo != null || uri.rawQuery != null || uri.rawFragment != null) {
        return AddressCheck.Rejected(BAD_ADDRESS_MESSAGE)
    }
    return AddressCheck.Ok(address)
}
