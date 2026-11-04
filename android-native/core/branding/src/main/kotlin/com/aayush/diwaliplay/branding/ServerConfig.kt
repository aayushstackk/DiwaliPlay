package com.aayush.diwaliplay.branding

import android.content.SharedPreferences

const val DEFAULT_API_BASE_URL = "https://diwaliplay.onrender.com"
const val DEFAULT_PUBLIC_WEB_URL = "https://diwali-game-six.vercel.app"

/** Operator-editable server addresses, persisted in [prefs]. Blank resets to the default. */
class ServerConfig(private val prefs: SharedPreferences) {
    var apiBaseUrl: String
        get() = read(KEY_API, DEFAULT_API_BASE_URL)
        set(value) = write(KEY_API, value)

    var publicWebUrl: String
        get() = read(KEY_WEB, DEFAULT_PUBLIC_WEB_URL)
        set(value) = write(KEY_WEB, value)

    private fun read(key: String, default: String): String =
        prefs.getString(key, null)?.trim()?.trimEnd('/')?.takeIf { it.isNotEmpty() } ?: default

    private fun write(key: String, value: String) {
        val v = value.trim().trimEnd('/')
        prefs.edit().apply { if (v.isEmpty()) remove(key) else putString(key, v) }.apply()
    }

    private companion object {
        const val KEY_API = "api_base_url"
        const val KEY_WEB = "public_web_url"
    }
}
