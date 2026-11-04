package com.aayush.diwaliplay.game.bomb

import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.BombGameSettings
import com.aayush.diwaliplay.model.Point2D
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

private const val MAX_BOMB_SLOTS = 8
private const val MAX_PARTICLES = 120
private const val MAX_SCORE_POPUPS = 8
private const val MAX_PENDING_SHOTS = 8
private const val BASE_GRAVITY = 2600.0

private const val COLOR_SPARK_FALLBACK = 0xFFFDE047.toInt()
private const val COLOR_WHITE = 0xFFFFFFFF.toInt()
private const val COLOR_MUZZLE = 0xFFF59E0B.toInt()
private const val COLOR_SMOKE = 0xFFE2E8F0.toInt()

/** Web `INITIAL_MORTARS.pctX`: the five launch tubes along the bottom edge. */
private val MORTAR_PCT_X = doubleArrayOf(0.16, 0.33, 0.5, 0.67, 0.84)

/**
 * Logic-only port of `src/components/BombGameOverlay.tsx`: spawner, pending burst shots, launch, flight physics,
 * swept collision against hand points and touches, bursting state, canvas effects and score popups. DOM and
 * canvas drawing stay in the renderer, which reads [bombs], [effects] and [popups]. Allocation-free in
 * [step] except at a burst (score popup text, hit record) and on [drainHits].
 *
 * Hand positions are tracked palm pixels (1920x1080); the web's smoothed flame position is visual only.
 * The web's low-end tweaks (fewer embers/smoke) are not ported: embers 14 and smoke 5 always.
 * `settings.bombLifetimeMs` is unused by the web simulation and so unused here.
 */
class BombSim(
    configs: List<BombConfig>,
    private val settings: BombGameSettings,
    private val random: GameRandom,
    private val width: Double = 1920.0,
    private val height: Double = 1080.0,
) {
    private val slots = Array(MAX_BOMB_SLOTS) { BombSlot(DEFAULT_BOMB_CONFIGS[0]) }
    private val particles = Array(MAX_PARTICLES) { BombParticle() }
    private val scorePopups = Array(MAX_SCORE_POPUPS) { ScorePopup() }
    private val pending = Array(MAX_PENDING_SHOTS) { PendingShot() }
    private val mortarLastFired = DoubleArray(MORTAR_PCT_X.size)

    val bombs: Array<out BombSlotView> get() = slots
    val effects: Array<out BombParticleView> get() = particles
    val popups: Array<out ScorePopupView> get() = scorePopups

    /** Web `isTouchMode`: hand collision is off, only [touch] bursts bombs. */
    var touchMode = false

    private val pool: List<BombConfig>
    private val cumulativeWeights: DoubleArray
    private val totalWeight: Double

    private val hits = ArrayList<BombHit>()
    private val touchX = DoubleArray(2)
    private val touchY = DoubleArray(2)
    private val touchR = DoubleArray(2)

    private var started = false
    private var lastSpawnMs = 0.0
    private var nextSpawnDelayMs = 800.0
    private var lastMortarIdx = -1

    init {
        val list = if (configs.isNotEmpty()) configs else DEFAULT_BOMB_CONFIGS
        val active = list.filter { it.isActive }
        pool = if (active.isNotEmpty()) active else DEFAULT_BOMB_CONFIGS
        var running = 0.0
        cumulativeWeights = DoubleArray(pool.size) {
            running += max(1.0, orDefault(pool[it].spawnWeight, 5.0))  // web: Math.max(1, spawnWeight || 5)
            running
        }
        totalWeight = running
    }

    val mortarCount: Int get() = MORTAR_PCT_X.size
    fun mortarPctX(index: Int): Double = MORTAR_PCT_X[index]
    /** Time of the mortar's last shot (0 = never); drives the renderer's recoil animation. */
    fun mortarLastFiredMs(index: Int): Double = mortarLastFired[index]

    /** Returns bursts since the last call, oldest first, and clears the queue. */
    fun drainHits(): List<BombHit> {
        if (hits.isEmpty()) return emptyList()
        val out = ArrayList(hits)
        hits.clear()
        return out
    }

    /** Clears all bombs/effects/popups/queued hits (web `isActive=false` cleanup); spawner re-arms on next [step]. */
    fun reset() {
        for (b in slots) { b.active = false; b.isBursting = false }
        for (p in pending) p.active = false
        for (p in particles) p.active = false
        for (p in scorePopups) p.active = false
        hits.clear()
        mortarLastFired.fill(0.0)
        lastMortarIdx = -1
        started = false
    }

    /** Direct touch/mouse hit test (web `tryBurstBombAt`): first live bomb within max(20, 1.25*radius). */
    fun touch(x: Double, y: Double, nowMs: Double) {
        for (i in slots.indices) {
            val b = slots[i]
            if (!b.active || b.isBursting || b.scale < 0.5) continue
            val hitRadius = max(20.0, b.radius * 1.25)
            val dx = x - b.x
            val dy = y - b.y
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                burst(b, nowMs)
                break
            }
        }
    }

    /**
     * One animation frame. [hands] are palm pixel positions (at most the first two are used); positions with
     * x or y <= 0 are ignored like the web's `pixelX > 0 && pixelY > 0` check.
     */
    fun step(dtSeconds: Double, nowMs: Double, hands: List<Point2D>) {
        // Web: Math.max(0.001, Math.min(rawDt, 0.05)); NaN would poison the physics, so treat it as the minimum.
        val dt = if (dtSeconds.isNaN()) 0.001 else dtSeconds.coerceIn(0.001, 0.05)

        if (!started) {
            started = true
            nextSpawnDelayMs = drawSpawnDelay()
            lastSpawnMs = nowMs - nextSpawnDelayMs + 150.0
        }

        val maxConcurrent = min(MAX_BOMB_SLOTS, orDefault(settings.maxConcurrentBombs, 5))
        val effectiveGravity = effectiveGravity()

        // 1. Pending burst shots.
        for (shot in pending) {
            if (shot.active && nowMs >= shot.scheduledMs) {
                shot.active = false
                if (countInFlight() < maxConcurrent) launchSingle(nowMs, shot)
            }
        }

        // 2. Spawner.
        var committed = countInFlight()
        for (s in pending) if (s.active) committed++
        if (committed < maxConcurrent) {
            val effectiveDelay = if (committed == 0) min(nextSpawnDelayMs, 320.0) else nextSpawnDelayMs
            if (nowMs - lastSpawnMs >= effectiveDelay) scheduleBurst(nowMs)
        }

        // 3. Collision points: hand palms (radius 42), none in touch mode.
        var touchCount = 0
        if (!touchMode) {
            for (i in 0 until min(2, hands.size)) {
                val h = hands[i]
                if (h.x > 0 && h.y > 0) {
                    touchX[touchCount] = h.x; touchY[touchCount] = h.y; touchR[touchCount] = 42.0
                    touchCount++
                }
            }
        }

        // 4. Kinematics, swept collision.
        val friction = 0.94.pow(dt * 60)
        for (bomb in slots) {
            if (!bomb.active) continue
            if (bomb.isBursting) {
                if (nowMs - bomb.burstStartMs >= 700) {
                    bomb.active = false
                    bomb.isBursting = false
                    continue
                }
                bomb.vx *= friction
                bomb.vy *= friction
                bomb.x += bomb.vx * dt
                bomb.y += bomb.vy * dt
                continue
            }
            bomb.prevX = bomb.x
            bomb.prevY = bomb.y
            bomb.vy += effectiveGravity * dt
            bomb.x += bomb.vx * dt
            bomb.y += bomb.vy * dt
            bomb.rot += bomb.vRot * dt
            bomb.scale = min(1.0, 0.65 + ((nowMs - bomb.launchMs) / 140.0) * 0.35)

            if (bomb.vy < 0 && (bomb.lastTrailMs == 0.0 || nowMs - bomb.lastTrailMs >= 35)) {
                bomb.lastTrailMs = nowMs
                spawnAscentSpark(bomb.x, bomb.y + bomb.radius * 0.7, parseColor(bomb.config.color), nowMs)
            }

            if (bomb.x < bomb.radius + 15) {
                bomb.x = bomb.radius + 15
                bomb.vx = kotlin.math.abs(bomb.vx) * 0.7
            } else if (bomb.x > width - bomb.radius - 15) {
                bomb.x = width - bomb.radius - 15
                bomb.vx = -kotlin.math.abs(bomb.vx) * 0.7
            }

            if (bomb.y > height + 80 && bomb.vy > 0) {
                bomb.active = false
                continue
            }

            if (!touchMode && bomb.scale >= 0.8 && touchCount > 0) {
                for (p in 0 until touchCount) {
                    val pad = bomb.radius + touchR[p]
                    val minX = min(bomb.prevX, bomb.x) - pad
                    val maxX = max(bomb.prevX, bomb.x) + pad
                    if (touchX[p] < minX || touchX[p] > maxX) continue
                    val minY = min(bomb.prevY, bomb.y) - pad
                    val maxY = max(bomb.prevY, bomb.y) + pad
                    if (touchY[p] < minY || touchY[p] > maxY) continue
                    if (distToSegmentSq(touchX[p], touchY[p], bomb.prevX, bomb.prevY, bomb.x, bomb.y) <= pad * pad) {
                        burst(bomb, nowMs)
                        break
                    }
                }
            }
        }

        // 5. Effects and popups (web does this inside the canvas draw pass).
        for (p in particles) {
            if (!p.active) continue
            val elapsed = nowMs - p.startMs
            if (elapsed >= p.lifetimeMs) { p.active = false; continue }
            when (p.type) {
                BombParticleType.EMBER -> {
                    p.x += p.vx * dt
                    p.y += p.vy * dt
                    p.vy += 800 * dt
                }
                BombParticleType.SMOKE, BombParticleType.SPARK -> {
                    p.x += p.vx * dt
                    p.y += p.vy * dt
                }
                else -> Unit
            }
        }
        for (p in scorePopups) {
            if (p.active && nowMs - p.startMs >= p.durationMs) p.active = false
        }
    }

    // ---- spawner ---------------------------------------------------------------------------------------

    private fun effectiveGravity(): Double = BASE_GRAVITY * (orDefault(settings.gravityMultiplier, 1.45) / 1.45)

    private fun drawSpawnDelay(): Double {
        val minD = orDefault(settings.minSpawnDelayMs, 650.0)
        val maxD = orDefault(settings.maxSpawnDelayMs, 1400.0)
        return minD + random.nextDouble() * (maxD - minD)
    }

    private fun countInFlight(): Int {
        var n = 0
        for (b in slots) if (b.active && !b.isBursting) n++
        return n
    }

    private fun pickConfig(): BombConfig {
        val r = random.nextDouble() * totalWeight
        for (i in pool.indices) if (r < cumulativeWeights[i]) return pool[i]
        return pool[0]
    }

    private fun scheduleBurst(now: Double) {
        val maxConcurrent = min(MAX_BOMB_SLOTS, orDefault(settings.maxConcurrentBombs, 5))
        var pendingCount = 0
        for (s in pending) if (s.active) pendingCount++
        val available = maxConcurrent - (countInFlight() + pendingCount)
        if (available <= 0) return

        val maxBurstConfig = min(3, max(1, settings.maxBurstSize ?: 3))
        val r = random.nextDouble()
        var desired = if (r < 0.2) 1 else if (r < 0.65) 2 else 3
        desired = min(desired, maxBurstConfig)
        val burstSize = min(desired, available)
        if (burstSize <= 0) return

        // Web: candidates = all mortars except the last one used; pick floor(rand * count) among them.
        val candidates = MORTAR_PCT_X.size - (if (lastMortarIdx in MORTAR_PCT_X.indices) 1 else 0)
        var k = floor(random.nextDouble() * candidates).toInt()
        if (lastMortarIdx in MORTAR_PCT_X.indices && k >= lastMortarIdx) k++  // skip the excluded index
        val mortarIdx = k
        lastMortarIdx = mortarIdx

        val baseInterval = max(50.0, min(100.0, orDefault(settings.burstIntervalMs, 75.0)))
        for (i in 0 until burstSize) {
            val stagger = if (i == 0) 0.0 else i * baseInterval + (random.nextDouble() - 0.5) * 15
            val apexOffsetY: Double
            val vxOffset: Double
            when (burstSize) {
                1 -> { apexOffsetY = 0.0; vxOffset = (random.nextDouble() - 0.5) * 40 }
                2 -> {
                    apexOffsetY = if (i == 0) -32.0 else 32.0
                    vxOffset = (if (i == 0) -90 else 90) + (random.nextDouble() - 0.5) * 20
                }
                else -> {
                    apexOffsetY = if (i == 0) -40.0 else if (i == 1) 0.0 else 40.0
                    vxOffset = if (i == 0) -110 + (random.nextDouble() - 0.5) * 20
                    else if (i == 1) (random.nextDouble() - 0.5) * 25
                    else 110 + (random.nextDouble() - 0.5) * 20
                }
            }
            for (slot in pending) {
                if (!slot.active) {
                    slot.active = true
                    slot.mortarIdx = mortarIdx
                    slot.scheduledMs = now + max(0.0, stagger)
                    slot.apexOffsetY = apexOffsetY
                    slot.vxAngleOffset = vxOffset
                    break
                }
            }
        }
        lastSpawnMs = now
        nextSpawnDelayMs = drawSpawnDelay()
    }

    private fun launchSingle(now: Double, shot: PendingShot) {
        var bomb: BombSlot? = null
        for (b in slots) if (!b.active) { bomb = b; break }
        if (bomb == null) return

        val config = pickConfig()
        val pctX = MORTAR_PCT_X[shot.mortarIdx]
        mortarLastFired[shot.mortarIdx] = now
        val originX = pctX * width
        val originY = height - 72
        spawnMuzzleFlash(originX, originY, now)

        val speedMult = orDefault(settings.launchSpeedMultiplier, 1.45)
        val g = effectiveGravity()
        val targetApexY = max(130.0, height * 0.19 + random.nextDouble() * (height * 0.12) + shot.apexOffsetY)
        val deltaH = originY - targetApexY
        val vy0 = -sqrt(2 * g * max(80.0, deltaH)) * (speedMult / 1.45)

        val baseVx = if (pctX < 0.35) width * 0.08 + random.nextDouble() * (width * 0.08)
        else if (pctX > 0.65) -(width * 0.08 + random.nextDouble() * (width * 0.08))
        else (random.nextDouble() - 0.5) * (width * 0.12)
        val vRot = (random.nextDouble() - 0.5) * 85
        val rot0 = (random.nextDouble() - 0.5) * 25

        val baseRadius = orDefault(settings.bombRadius, 52.0)
        val sizeMult = max(0.4, min(1.8, (config.sizePercent ?: 100.0) / 100.0))

        bomb.active = true
        bomb.config = config
        bomb.x = originX; bomb.y = originY; bomb.prevX = originX; bomb.prevY = originY
        bomb.vx = baseVx + shot.vxAngleOffset
        bomb.vy = vy0
        bomb.rot = rot0
        bomb.vRot = vRot
        bomb.radius = floor(baseRadius * sizeMult + 0.5)  // JS Math.round
        bomb.scale = 0.65
        bomb.launchMs = now
        bomb.isBursting = false
        bomb.burstStartMs = 0.0
        bomb.lastTrailMs = 0.0
    }

    // ---- burst + effects -------------------------------------------------------------------------------

    private fun burst(bomb: BombSlot, now: Double) {
        if (!bomb.active || bomb.isBursting) return
        bomb.isBursting = true
        bomb.burstStartMs = now
        val cfg = bomb.config
        val isPenalty = cfg.points < 0
        hits.add(BombHit(cfg, bomb.x, bomb.y, isPenalty, cfg.points))
        spawnExplosion(bomb.x, bomb.y, parseColor(cfg.color), now)

        // Web: points > 0 ? `+${points}` : `${points} ${isPenalty ? 'OUCH!' : ''}` (trailing space when 0 kept).
        val text = if (cfg.points > 0) "+${cfg.points}" else "${cfg.points} ${if (isPenalty) "OUCH!" else ""}"
        for (p in scorePopups) {
            if (!p.active) {
                p.active = true; p.x = bomb.x; p.startY = bomb.y; p.text = text; p.isPenalty = isPenalty
                p.startMs = now; p.durationMs = 850.0
                break
            }
        }
    }

    private fun acquire(): BombParticle? {
        for (p in particles) if (!p.active) return p
        return null
    }

    private fun BombParticle.init(
        t: BombParticleType, x: Double, y: Double, vx: Double, vy: Double, size: Double, maxSize: Double,
        color: Int, alpha: Double, start: Double, life: Double,
    ) {
        active = true; type = t; this.x = x; this.y = y; this.vx = vx; this.vy = vy
        this.size = size; this.maxSize = maxSize; this.color = color; this.alpha = alpha
        startMs = start; lifetimeMs = life
    }

    private fun spawnAscentSpark(x: Double, y: Double, color: Int, now: Double) {
        val p = acquire() ?: return
        val px = x + (random.nextDouble() - 0.5) * 8
        val vx = (random.nextDouble() - 0.5) * 20
        val vy = 20 + random.nextDouble() * 40
        val size = 5 + random.nextDouble() * 4
        p.init(BombParticleType.SPARK, px, y, vx, vy, size, size, color, 0.85, now, 140.0)
    }

    private fun spawnMuzzleFlash(x: Double, y: Double, now: Double) {
        acquire()?.init(BombParticleType.MUZZLE, x, y, 0.0, 0.0, 14.0, 36.0, COLOR_MUZZLE, 0.95, now, 65.0)
    }

    private fun spawnExplosion(x: Double, y: Double, color: Int, now: Double) {
        acquire()?.init(BombParticleType.SHOCKWAVE, x, y, 0.0, 0.0, 35.0, 110.0, color, 0.95, now, 500.0)
        acquire()?.init(BombParticleType.FLASH, x, y, 0.0, 0.0, 40.0, 65.0, COLOR_WHITE, 0.95, now, 150.0)

        val emberCount = 14
        var spawned = 0
        for (p in particles) {
            if (spawned >= emberCount) break
            if (!p.active) {
                val angle = (spawned.toDouble() / emberCount) * PI * 2 + (random.nextDouble() - 0.5) * 0.4
                val speed = 120 + random.nextDouble() * 180
                val size = 6 + random.nextDouble() * 6
                val life = 350 + random.nextDouble() * 150
                p.init(
                    BombParticleType.EMBER, x, y, cos(angle) * speed, sin(angle) * speed, size, size,
                    if (spawned % 2 == 0) color else COLOR_SPARK_FALLBACK, 0.9, now, life,
                )
                spawned++
            }
        }

        val smokeCount = 5
        spawned = 0
        for (p in particles) {
            if (spawned >= smokeCount) break
            if (!p.active) {
                val px = x + (random.nextDouble() - 0.5) * 24
                val py = y + (random.nextDouble() - 0.5) * 20
                val vx = (random.nextDouble() - 0.5) * 25
                val vy = -35 - random.nextDouble() * 30
                val maxSize = 48 + random.nextDouble() * 15
                p.init(BombParticleType.SMOKE, px, py, vx, vy, 18.0, maxSize, COLOR_SMOKE, 0.35, now + 60, 600.0)
                spawned++
            }
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------

    /** JS `value || fallback` for numbers (0 and NaN are falsy). */
    private fun orDefault(v: Double, fallback: Double) = if (v == 0.0 || v.isNaN()) fallback else v
    private fun orDefault(v: Int, fallback: Int) = if (v == 0) fallback else v
    private fun orDefault(v: Double?, fallback: Double) = if (v == null) fallback else orDefault(v, fallback)

    /** `#RRGGBB` / `#RGB` to opaque ARGB; anything else falls back to the spark yellow. */
    private fun parseColor(hex: String): Int {
        val h = hex.removePrefix("#")
        val full = if (h.length == 3) "" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2] else h
        if (full.length != 6) return COLOR_SPARK_FALLBACK
        val v = full.toLongOrNull(16) ?: return COLOR_SPARK_FALLBACK
        return (0xFF000000L or v).toInt()
    }

    private fun distToSegmentSq(px: Double, py: Double, x1: Double, y1: Double, x2: Double, y2: Double): Double {
        val dx = x2 - x1
        val dy = y2 - y1
        val l2 = dx * dx + dy * dy
        if (l2 < 0.0001) {
            val ax = px - x1; val ay = py - y1
            return ax * ax + ay * ay
        }
        val t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
        val ex = px - (x1 + t * dx)
        val ey = py - (y1 + t * dy)
        return ex * ex + ey * ey
    }
}
