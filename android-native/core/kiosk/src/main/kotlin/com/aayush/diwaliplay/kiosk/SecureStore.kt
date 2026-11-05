package com.aayush.diwaliplay.kiosk

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val TAG = "SecureStore"
private const val PREFS_NAME = "secure_store"
private const val ANDROID_KEYSTORE = "AndroidKeyStore"
private const val KEY_ALIAS = "diwaliplay_relay"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val IV_BYTES = 12
private const val TAG_BITS = 128

/**
 * Small secrets (the relay's device id and token), AES-GCM encrypted under an Android Keystore key. Each value is bound
 * to its name, so one can't be swapped for another. Keystore calls can block: stay off the main thread.
 */
class SecureStore internal constructor(private val prefs: SharedPreferences, private val key: () -> SecretKey) {
    constructor(context: Context) : this(
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE),
        ::keystoreKey,
    )

    fun put(key: String, value: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(key.toByteArray())
        val sealed = cipher.iv + cipher.doFinal(value.toByteArray())
        prefs.edit().putString(key, Base64.getEncoder().encodeToString(sealed)).commit()
    }

    /** Null if there's no such value, or it can no longer be read (tampered with, or the Keystore key is gone). */
    fun get(key: String): String? {
        val stored = prefs.getString(key, null) ?: return null
        return try {
            val sealed = Base64.getDecoder().decode(stored)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES))
            cipher.updateAAD(key.toByteArray())
            String(cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES))
        } catch (e: GeneralSecurityException) {
            Log.w(TAG, "can't read '$key': ${e.javaClass.simpleName}")
            null
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "can't read '$key': ${e.javaClass.simpleName}")
            null
        }
    }

    fun remove(key: String) {
        prefs.edit().remove(key).commit()
    }
}

private fun keystoreKey(): SecretKey {
    val keys = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (keys.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val spec = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
        init(spec)
        generateKey()
    }
}
