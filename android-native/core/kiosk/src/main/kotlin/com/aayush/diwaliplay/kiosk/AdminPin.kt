package com.aayush.diwaliplay.kiosk

import android.content.SharedPreferences
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

private const val KEY_HASH = "pin_hash"
private const val KEY_FAILURES = "pin_failures"
private const val KEY_LOCKED_UNTIL = "pin_locked_until"
private const val ALGORITHM = "PBKDF2WithHmacSHA256"
private const val ITERATIONS = 120_000
private const val SALT_BYTES = 16
private const val HASH_BITS = 256

/** server/auth/middleware.ts MAX_FAILURES and LOCKOUT_WINDOW_MS. */
private const val MAX_FAILURES = 5
private const val LOCKOUT_MS = 15 * 60_000L

sealed interface PinResult {
    data object Ok : PinResult

    /** [attemptsLeft] more failures, counting down to a lockout. */
    data class Wrong(val attemptsLeft: Int) : PinResult

    /** Refused without looking at the PIN. Also what the failure that starts a lockout returns. */
    data class LockedOut(val remainingMs: Long) : PinResult
}

/** Serialises attempts across instances: the admin dialog and the relay call from different threads. */
private val attemptLock = Any()

/**
 * The local admin PIN, kept only as a salted PBKDF2 hash in [prefs], with its own attempt limit so that no caller can
 * get around it. [set] and [verify] take a noticeable time by design, so call them off the main thread.
 */
class AdminPin internal constructor(
    private val prefs: SharedPreferences,
    private val now: () -> Long,
    private val hasher: (pin: String, salt: ByteArray) -> ByteArray,
) {
    constructor(prefs: SharedPreferences, now: () -> Long = System::currentTimeMillis) : this(prefs, now, ::pbkdf2)

    val isSet: Boolean get() = prefs.contains(KEY_HASH)

    /** Throws [IllegalArgumentException] unless [pin] is 4 to 8 digits. Clears any lockout. */
    fun set(pin: String) {
        require(isValid(pin)) { "The PIN must be 4 to 8 digits" }
        val salt = ByteArray(SALT_BYTES).also { SecureRandom().nextBytes(it) }
        val encoder = Base64.getEncoder()
        val stored = encoder.encodeToString(salt) + SEPARATOR + encoder.encodeToString(hasher(pin, salt))
        synchronized(attemptLock) {
            // Not apply(): a crash right after creating the PIN mustn't lose it.
            prefs.edit().putString(KEY_HASH, stored).remove(KEY_FAILURES).remove(KEY_LOCKED_UNTIL).commit()
        }
    }

    /**
     * The comparison is constant-time. Anything but the right PIN counts as a failure, except that with no PIN set
     * there's nothing to guess, so nothing is counted. While locked out, nothing is hashed.
     */
    fun verify(pin: String): PinResult = synchronized(attemptLock) {
        val time = now()
        lockout(time)?.let { return it }
        val stored = prefs.getString(KEY_HASH, null) ?: return PinResult.Wrong(MAX_FAILURES)

        // Recorded before hashing, and committed: a power cut during the hash can't give the attempt back.
        val failures = prefs.getInt(KEY_FAILURES, 0) + 1
        val locks = failures >= MAX_FAILURES
        prefs.edit().putInt(KEY_FAILURES, failures).apply { if (locks) putLong(KEY_LOCKED_UNTIL, time + LOCKOUT_MS) }.commit()

        if (matches(pin, stored)) {
            clearFailures()
            PinResult.Ok
        } else if (locks) {
            PinResult.LockedOut(LOCKOUT_MS)
        } else {
            PinResult.Wrong(MAX_FAILURES - failures)
        }
    }

    /** The lockout in force, if any. A lockout that has run out takes the count with it. */
    private fun lockout(time: Long): PinResult.LockedOut? {
        var until = prefs.getLong(KEY_LOCKED_UNTIL, 0)
        if (until == 0L) return null
        if (time >= until) {
            clearFailures()
            return null
        }
        // Only a clock that went backwards can get here: without this, the lockout would grow by however far it went.
        if (until - time > LOCKOUT_MS) {
            until = time + LOCKOUT_MS
            prefs.edit().putLong(KEY_LOCKED_UNTIL, until).commit()
        }
        return PinResult.LockedOut(until - time)
    }

    private fun clearFailures() {
        prefs.edit().remove(KEY_FAILURES).remove(KEY_LOCKED_UNTIL).commit()
    }

    private fun matches(pin: String, stored: String): Boolean {
        val parts = stored.split(SEPARATOR)
        if (parts.size != 2 || !isValid(pin)) return false
        val decoder = Base64.getDecoder()
        return try {
            MessageDigest.isEqual(decoder.decode(parts[1]), hasher(pin, decoder.decode(parts[0])))
        } catch (_: IllegalArgumentException) {
            false
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

private fun pbkdf2(pin: String, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, HASH_BITS)
    return try {
        SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).encoded
    } finally {
        spec.clearPassword()
    }
}
