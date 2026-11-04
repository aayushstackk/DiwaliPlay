package com.aayush.diwaliplay.game

/** Source of randomness for game logic; injectable so golden tests are deterministic. */
interface GameRandom {
    /** Uniform double in [0, 1), like JS Math.random(). */
    fun nextDouble(): Double
}

/** Bit-identical port of scripts/native-golden/mulberry32.ts. */
class Mulberry32(seed: Int) : GameRandom {
    private var a: Int = seed

    override fun nextDouble(): Double {
        a += 0x6D2B79F5
        var t = a
        t = (t xor (t ushr 15)) * (t or 1)
        t = t xor (t + (t xor (t ushr 7)) * (t or 61))
        return (t xor (t ushr 14)).toUInt().toDouble() / 4294967296.0
    }
}

object SystemRandom : GameRandom {
    override fun nextDouble(): Double = Math.random()
}
