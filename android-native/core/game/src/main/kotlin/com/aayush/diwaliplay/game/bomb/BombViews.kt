package com.aayush.diwaliplay.game.bomb

import com.aayush.diwaliplay.model.BombConfig

/** Kinds of canvas effect in the web's `CanvasParticle.type`. `SPARK` = ascent trail, `SMOKE` = burst puff. */
enum class BombParticleType { SPARK, EMBER, SMOKE, SHOCKWAVE, FLASH, MUZZLE }

/** What a bomb burst reports to the caller (web: onPlayBurstSound + onBombTouch + onTriggerParticles). */
data class BombHit(val config: BombConfig, val x: Double, val y: Double, val isPenalty: Boolean, val points: Int)

/** Read-only renderer view of a pooled bomb slot. Positions are logical pixels; `rot` is degrees. */
interface BombSlotView {
    val active: Boolean
    val isBursting: Boolean
    val x: Double
    val y: Double
    val vy: Double
    val radius: Double
    val rot: Double
    /** 0.65 -> 1.0 over the first 140 ms of flight (web `bomb.scale`). */
    val scale: Double
    val configId: String
    val config: BombConfig
    val launchMs: Double
    val burstStartMs: Double
}

/**
 * Read-only renderer view of a pooled effect. Progress is `t = min(1, (nowMs - startMs) / lifetimeMs)`;
 * draw formulas stay in the renderer (web canvas code). `color` is opaque ARGB.
 */
interface BombParticleView {
    val active: Boolean
    val type: BombParticleType
    val x: Double
    val y: Double
    val size: Double
    val maxSize: Double
    val color: Int
    val alpha: Double
    val startMs: Double
    val lifetimeMs: Double
}

/** Read-only renderer view of a floating score popup (y rises by `sin(t*pi/2)*42` from `startY`). */
interface ScorePopupView {
    val active: Boolean
    val x: Double
    val startY: Double
    val text: String
    val isPenalty: Boolean
    val startMs: Double
    val durationMs: Double
}

internal class BombSlot(defaultConfig: BombConfig) : BombSlotView {
    override var active = false
    override var isBursting = false
    override var x = 0.0
    override var y = 0.0
    @JvmField var prevX = 0.0
    @JvmField var prevY = 0.0
    @JvmField var vx = 0.0
    override var vy = 0.0
    override var rot = 0.0
    @JvmField var vRot = 0.0
    override var radius = 52.0
    override var scale = 0.65
    override var config: BombConfig = defaultConfig
    override val configId: String get() = config.id
    override var launchMs = 0.0
    override var burstStartMs = 0.0
    @JvmField var lastTrailMs = 0.0
    /** Opaque ARGB of `config.color`, parsed once per launch. */
    @JvmField var colorArgb = 0
}

internal class BombParticle : BombParticleView {
    override var active = false
    override var type = BombParticleType.SPARK
    override var x = 0.0
    override var y = 0.0
    @JvmField var vx = 0.0
    @JvmField var vy = 0.0
    override var size = 0.0
    override var maxSize = 0.0
    override var color = 0
    override var alpha = 1.0
    override var startMs = 0.0
    override var lifetimeMs = 0.0
}

internal class ScorePopup : ScorePopupView {
    override var active = false
    override var x = 0.0
    override var startY = 0.0
    override var text = ""
    override var isPenalty = false
    override var startMs = 0.0
    override var durationMs = 850.0
}

internal class PendingShot {
    @JvmField var active = false
    @JvmField var mortarIdx = 0
    @JvmField var scheduledMs = 0.0
    @JvmField var apexOffsetY = 0.0
    @JvmField var vxAngleOffset = 0.0
}
