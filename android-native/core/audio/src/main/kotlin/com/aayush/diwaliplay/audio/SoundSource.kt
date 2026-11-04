package com.aayush.diwaliplay.audio

/** Where the bytes of a resolved sound live. */
sealed interface SoundSource {
    /** A bundled file; [path] is relative to the APK assets root (e.g. `sounds/explosion_bomb.flac`). */
    data class Asset(val path: String) : SoundSource

    /** A custom sound cached on disk by core:branding. */
    data class File(val file: java.io.File) : SoundSource

    /** Silence (muted, or nothing configured). */
    data object None : SoundSource
}

/**
 * A sound with its final linear gain (0..1), playback rate (SoundPool 0.5..2.0) and SoundPool stream [priority]
 * (higher survives stream exhaustion: [PRIORITY_HIGH] countdown / game over / mega blast, [PRIORITY_NORMAL] sfx and
 * bomb bursts, [PRIORITY_LOW] cracker / hand-motion sounds and the spin tick).
 */
data class ResolvedSound(
    val source: SoundSource,
    val volume: Float,
    val rate: Float = 1f,
    val priority: Int = PRIORITY_NORMAL,
) {
    companion object {
        val SILENCE = ResolvedSound(SoundSource.None, 0f)
        const val PRIORITY_LOW = 1
        const val PRIORITY_NORMAL = 2
        const val PRIORITY_HIGH = 3
    }
}

enum class CountdownStep { THREE, TWO, ONE, GO }

/** Resolved background track. [volume] already includes master and the web's double music gain. */
data class BgmChoice(val source: SoundSource, val volume: Float, val loop: Boolean) {
    companion object {
        val NONE = BgmChoice(SoundSource.None, 0f, false)
    }
}
