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

/** A sound with its final linear gain (0..1) and playback rate (SoundPool 0.5..2.0). */
data class ResolvedSound(val source: SoundSource, val volume: Float, val rate: Float = 1f) {
    companion object {
        val SILENCE = ResolvedSound(SoundSource.None, 0f)
    }
}

enum class CountdownStep { THREE, TWO, ONE, GO }

/** Resolved background track. [volume] already includes master and the web's double music gain. */
data class BgmChoice(val source: SoundSource, val volume: Float, val loop: Boolean) {
    companion object {
        val NONE = BgmChoice(SoundSource.None, 0f, false)
    }
}
