package com.aayush.diwaliplay.game.cracker

/** Mirrors `CrackerStyle` in src/utils/crackerEngine.ts. */
enum class CrackerStyle {
    SPARK_BURST, ANAR_FLOWERPOT, ROCKET_TRAIL, RADIAL_BOMB, GOLDEN_SHOWER,
    COLOR_FIREWORK, CHAKRI_SPIN, PUNCH_BLAST, LAD_POPPERS, MEGA_COMBO,
}

/** Side of the screen / hand a motion-sparkle trail belongs to (web: 'left' | 'right'). */
enum class HandSide { LEFT, RIGHT }

/** Read-only renderer view of a pooled spark. */
interface ParticleView {
    val active: Boolean
    val x: Double
    val y: Double
    val trailX: Double
    val trailY: Double
    val alpha: Double
    val size: Double
    /** Opaque ARGB. */
    val color: Int
    val flicker: Boolean
}

/** Read-only renderer view of a pooled shockwave ring. */
interface RingView {
    val active: Boolean
    val x: Double
    val y: Double
    val radius: Double
    val maxRadius: Double
    val alpha: Double
    val color: Int
    val speed: Double
}

/**
 * Pooled spark. Mutable by design (object pool, no per-frame allocation); the renderer must treat it
 * as read-only. `color` is opaque ARGB. The web `glowColor` is never read by the web renderer, so it
 * is not ported.
 */
internal class Particle : ParticleView {
    override var active = false
    override var x = 0.0
    override var y = 0.0
    @JvmField var vx = 0.0
    @JvmField var vy = 0.0
    override var alpha = 0.0
    @JvmField var decay = 0.02
    override var size = 2.0
    override var color: Int = Palettes.DEFAULT_PARTICLE_COLOR
    @JvmField var gravity = 0.12
    @JvmField var drag = 0.97
    override var flicker = false
    override var trailX = 0.0
    override var trailY = 0.0
}

/** Pooled expanding shockwave ring. `alpha` is derived each step as 1 - radius / maxRadius. */
internal class Ring : RingView {
    override var active = false
    override var x = 0.0
    override var y = 0.0
    override var radius = 0.0
    override var maxRadius = 80.0
    override var color: Int = Palettes.RING_DEFAULT_COLOR
    override var alpha = 1.0
    override var speed = 4.0
}
