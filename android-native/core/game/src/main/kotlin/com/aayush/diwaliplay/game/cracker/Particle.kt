package com.aayush.diwaliplay.game.cracker

/** Mirrors `CrackerStyle` in src/utils/crackerEngine.ts. */
enum class CrackerStyle {
    SPARK_BURST, ANAR_FLOWERPOT, ROCKET_TRAIL, RADIAL_BOMB, GOLDEN_SHOWER,
    COLOR_FIREWORK, CHAKRI_SPIN, PUNCH_BLAST, LAD_POPPERS, MEGA_COMBO,
}

/** Side of the screen / hand a motion-sparkle trail belongs to (web: 'left' | 'right'). */
enum class HandSide { LEFT, RIGHT }

/**
 * Pooled spark. Mutable by design (object pool, no per-frame allocation); the renderer must treat it
 * as read-only. `color` is opaque ARGB. The web `glowColor` is never read by the web renderer, so it
 * is not ported.
 */
class Particle {
    @JvmField var active = false
    @JvmField var x = 0.0
    @JvmField var y = 0.0
    @JvmField var vx = 0.0
    @JvmField var vy = 0.0
    @JvmField var alpha = 0.0
    @JvmField var decay = 0.02
    @JvmField var size = 2.0
    @JvmField var color: Int = Palettes.DEFAULT_PARTICLE_COLOR
    @JvmField var gravity = 0.12
    @JvmField var drag = 0.97
    @JvmField var flicker = false
    @JvmField var trailX = 0.0
    @JvmField var trailY = 0.0
}

/** Pooled expanding shockwave ring. `alpha` is derived each step as 1 - radius / maxRadius. */
class Ring {
    @JvmField var active = false
    @JvmField var x = 0.0
    @JvmField var y = 0.0
    @JvmField var radius = 0.0
    @JvmField var maxRadius = 80.0
    @JvmField var color: Int = Palettes.RING_DEFAULT_COLOR
    @JvmField var alpha = 1.0
    @JvmField var speed = 4.0
}
