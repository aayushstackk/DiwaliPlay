package com.aayush.diwaliplay.kiosk

import android.content.SharedPreferences
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

private const val KEY_HASH = "pin_hash"
private const val ALGORITHM = "PBKDF2WithHmacSHA256"
private const val ITERATIONS = 120_000
private const val SALT_BYTES = 16
private const val HASH_BITS = 256

/**
 * The local admin PIN, kept only as a salted PBKDF2 hash in [prefs]. [set] and [verify] take a noticeable time by
 * design, so call them off the main thread.
 */
class AdminPin(private val prefs: SharedPreferences) {
    val isSet: Boolean get() = prefs.contains(KEY_HASH)

    /** Throws [IllegalArgumentException] unless [pin] is 4 to 8 digits. */
    fun set(pin: String) {
        require(isValid(pin)) { "The PIN must be 4 to 8 digits" }
        val salt = ByteArray(SALT_BYTES).also { SecureRandom().nextBytes(it) }
        val encoder = Base64.getEncoder()
        val stored = encoder.encodeToString(salt) + SEPARATOR + encoder.encodeToString(hash(pin, salt))
        // Not apply(): a crash right after creating the PIN mustn't lose it.
        prefs.edit().putString(KEY_HASH, stored).commit()
    }

    /** False when no PIN is set, or the stored value can't be read. The comparison is constant-time. */
    fun verify(pin: String): Boolean {
        val parts = prefs.getString(KEY_HASH, null)?.split(SEPARATOR) ?: return false
        if (parts.size != 2 || !isValid(pin)) return false
        val decoder = Base64.getDecoder()
        return try {
            MessageDigest.isEqual(decoder.decode(parts[1]), hash(pin, decoder.decode(parts[0])))
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    private fun hash(pin: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, HASH_BITS)
        return try {
            SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    companion object {
        const val MIN_LENGTH = 4
        const val MAX_LENGTH = 8
        private const val SEPARATOR = ":"

        /** ASCII digits only: `Char.isDigit` also accepts other scripts' digits. */
        fun isValid(pin: String): Boolean = pin.length in MIN_LENGTH..MAX_LENGTH && pin.all { it in '0'..'9' }
    }
}
