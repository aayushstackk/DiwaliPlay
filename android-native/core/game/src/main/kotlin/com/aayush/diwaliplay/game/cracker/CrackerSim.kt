package com.aayush.diwaliplay.game.cracker

import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.model.HandGesture
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

private const val LOW_END_PARTICLE_LIMIT = 260
private const val MAX_RINGS = 40
private const val MAX_STEP_SECONDS = 0.1
private const val TWO_PI_FACTOR = 2.0

/**
 * Frame-rate scale factor: how many 60 Hz frames `dtSeconds` spans (`k = dt * 60`).
 *
 * `1.0 / 60.0 * 60.0` happens to round to exactly 1.0 in IEEE double arithmetic, but the float
 * error of a caller-computed dt (e.g. from nanosecond timestamps) is not guaranteed to, so any
 * k within 1e-12 of 1.0 is snapped to exactly 1.0. With k == 1.0 every term below
 * (`pow(drag, 1.0)`, `gravity * 1.0`, `v * 1.0`, ...) is bit-identical to the TS per-frame update.
 */
internal fun frameScale(dtSeconds: Double): Double {
    val k = dtSeconds * 60.0
    return if (abs(k - 1.0) < 1e-12) 1.0 else k
}

/**
 * Port of the simulation half of `CrackerEngine` (src/utils/crackerEngine.ts): object-pooled spark
 * particles and shockwave rings. `render()` is not ported; its flicker randomness belongs to the
 * renderer. The order of `random.nextDouble()` calls is identical to the TS `Math.random()` calls so
 * seeded runs line up with the golden fixture.
 */
class CrackerSim(
    private val maxParticles: Int = 700,
    private val random: GameRandom,
) {
    internal val pool: Array<Particle> = Array(maxParticles) { Particle() }
    internal val ringPool: Array<Ring> = Array(MAX_RINGS) { Ring() }

    /** Read-only covariant view of the pool (same array, no allocation). */
    val particles: Array<out ParticleView> get() = pool
    val rings: Array<out RingView> get() = ringPool

    var totalBursts = 0
        private set
    var activeCount = 0
        private set
    var lastStyle: CrackerStyle = CrackerStyle.SPARK_BURST
        private set

    /** Screen-flash vignette strength (decays 0.04 per 60 Hz frame). */
    var flashIntensity = 0.0
        private set

    /** False in low-end mode: the renderer should skip the full-screen flash fill. */
    var flashEnabled = true
        private set

    private var activeLimit = maxParticles
    private var nextFreeIndex = 0

    private val bombAccents = IntArray(5)

    /** Low-end mode caps live particles at 260 and disables the flash fill. Safe mid-session. */
    fun setLowEndMode(isLowEnd: Boolean) {
        activeLimit = if (isLowEnd) min(LOW_END_PARTICLE_LIMIT, maxParticles) else maxParticles
        flashEnabled = !isLowEnd
    }

    // ---- random helpers (call order mirrors the TS source) ----

    private fun randomRange(min: Double, max: Double): Double = min + random.nextDouble() * (max - min)

    private fun pick(arr: IntArray): Int = arr[floor(random.nextDouble() * arr.size).toInt()]

    private fun pickPalette(list: List<IntArray>): IntArray = list[floor(random.nextDouble() * list.size).toInt()]

    /** JS Math.round for non-negative inputs. */
    private fun jsRound(v: Double): Int = floor(v + 0.5).toInt()

    // ---- pools ----

    private fun spawnParticle(
        x: Double, y: Double, vx: Double, vy: Double,
        color: Int, size: Double, decay: Double,
        gravity: Double = 0.12, drag: Double = 0.97, flicker: Boolean = true,
    ) {
        if (activeCount >= activeLimit) return
        for (n in 0 until maxParticles) {
            val i = (nextFreeIndex + n) % maxParticles
            val p = pool[i]
            if (!p.active) {
                nextFreeIndex = (i + 1) % maxParticles
                activeCount++
                p.active = true
                p.x = x
                p.y = y
                p.trailX = x
                p.trailY = y
                p.vx = vx
                p.vy = vy
                p.color = color
                p.size = size
                p.alpha = 1.0
                p.decay = decay
                p.gravity = gravity
                p.drag = drag
                p.flicker = flicker
                return
            }
        }
    }

    private fun spawnRing(x: Double, y: Double, maxRadius: Double, color: Int, speed: Double = 4.0) {
        for (i in 0 until MAX_RINGS) {
            val r = ringPool[i]
            if (!r.active) {
                r.active = true
                r.x = x
                r.y = y
                r.radius = 4.0
                r.maxRadius = maxRadius
                r.color = color
                r.alpha = 0.9
                r.speed = speed
                return
            }
        }
    }

    // ---- effects ----

    fun triggerCracker(x: Double, y: Double, speed: Double, gesture: HandGesture, isCombo: Boolean = false) {
        totalBursts++

        val speedFactor = min(max((speed - 40) / 450, 0.2), 2.2)
        val comboMult = if (isCombo) 1.7 else 1.0
        val intensity = speedFactor * comboMult

        when (gesture) {
            HandGesture.FIST -> {
                if (speed > 420) {
                    createPunchBlast(x, y, intensity)
                    lastStyle = CrackerStyle.PUNCH_BLAST
                } else {
                    createRadialBomb(x, y, intensity)
                    lastStyle = CrackerStyle.RADIAL_BOMB
                }
            }
            HandGesture.OPEN_PALM -> {
                if (random.nextDouble() > 0.4) {
                    createAnarFlowerpot(x, y, intensity)
                    lastStyle = CrackerStyle.ANAR_FLOWERPOT
                } else {
                    createGoldenShower(x, y, intensity)
                    lastStyle = CrackerStyle.GOLDEN_SHOWER
                }
            }
            HandGesture.PEACE -> {
                createRocketBurst(x, y, intensity)
                lastStyle = CrackerStyle.ROCKET_TRAIL
            }
            HandGesture.POINTING -> {
                createLadPoppers(x, y, intensity)
                lastStyle = CrackerStyle.LAD_POPPERS
            }
            else -> {
                // Random procedural selection (THUMBS_UP / UNKNOWN): one draw over 5 styles.
                when (floor(random.nextDouble() * 5).toInt()) {
                    0 -> createSparkBurst(x, y, intensity)
                    1 -> createAnarFlowerpot(x, y, intensity)
                    2 -> createChakriSpin(x, y, intensity)
                    3 -> createColorfulFirework(x, y, intensity)
                    else -> createGoldenShower(x, y, intensity)
                }
            }
        }
    }

    fun addMotionSparkles(x: Double, y: Double, side: HandSide, speed: Double) {
        if (speed < 40) return
        val count = if (speed > 240) 2 else 1
        val pal = if (side == HandSide.LEFT) Palettes.gold else Palettes.ruby
        for (i in 0 until count) {
            val angle = random.nextDouble() * Math.PI * TWO_PI_FACTOR
            val vel = randomRange(0.4, 1.8)
            val color = pick(pal)
            spawnParticle(
                x + randomRange(-6.0, 6.0),
                y + randomRange(-6.0, 6.0),
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(1.2, 2.2),
                randomRange(0.045, 0.08),
                0.05, 0.96, true,
            )
        }
    }

    /** 1. Phuljhadi / spark burst. */
    fun createSparkBurst(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(14.0, 22.0) * intensity)
        val pal = pickPalette(Palettes.all)
        for (i in 0 until count) {
            val angle = random.nextDouble() * Math.PI * TWO_PI_FACTOR
            val vel = randomRange(2.0, 6.0) * intensity
            val color = pick(pal)
            spawnParticle(
                x + randomRange(-6.0, 6.0),
                y + randomRange(-6.0, 6.0),
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(1.4, 2.8),
                randomRange(0.025, 0.055),
                0.08, 0.96, true,
            )
        }
    }

    /** 2. Anar / flowerpot fountain. */
    fun createAnarFlowerpot(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(18.0, 30.0) * intensity)
        val pal = if (random.nextDouble() > 0.5) Palettes.gold else Palettes.saffron
        for (i in 0 until count) {
            val angle = randomRange(-Math.PI * 0.75, -Math.PI * 0.25)
            val vel = randomRange(3.5, 9.5) * intensity
            val color = pick(pal)
            spawnParticle(
                x + randomRange(-10.0, 10.0),
                y + randomRange(-3.0, 3.0),
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(1.4, 2.6),
                randomRange(0.022, 0.045),
                0.18, 0.98, true,
            )
        }
        spawnRing(x, y, 32 * intensity, Palettes.FLOWER_RING, 3.0)
    }

    /** 3. Radial atom bomb. */
    fun createRadialBomb(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(24.0, 40.0) * intensity)
        val pal = pickPalette(Palettes.bomb)

        spawnRing(x, y, 65 * intensity, Palettes.AMBER, 5.0)

        for (i in 0 until count) {
            val angle = random.nextDouble() * Math.PI * TWO_PI_FACTOR
            val vel = randomRange(2.8, 8.5) * intensity
            val color = pick(pal)
            spawnParticle(
                x, y,
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(2.0, 3.4),
                randomRange(0.02, 0.045),
                0.09, 0.965, true,
            )
        }
    }

    /**
     * Bomb explosion: concentric rings, sparks in the bomb's colour, and drifting embers.
     * `color` is opaque ARGB (web default `#F59E0B`).
     */
    fun createBombBurst(x: Double, y: Double, color: Int = Palettes.BOMB_DEFAULT_COLOR, isPenalty: Boolean = false) {
        totalBursts++
        lastStyle = CrackerStyle.RADIAL_BOMB

        flashIntensity = min(flashIntensity + 0.18, 0.4)

        val ringColor = if (isPenalty) Palettes.RED else color
        spawnRing(x, y, 95.0, ringColor, 5.2)
        spawnRing(x, y, 135.0, Palettes.WHITE, 4.0)

        val sparkCount = if (isPenalty) 32 else 36
        val accents: IntArray = if (isPenalty) {
            Palettes.penaltyAccents
        } else {
            bombAccents[0] = color
            for (j in 0 until 4) bombAccents[j + 1] = Palettes.bombSparkTail[j]
            bombAccents
        }

        for (i in 0 until sparkCount) {
            val angle = (i.toDouble() / sparkCount) * Math.PI * 2 + randomRange(-0.15, 0.15)
            val vel = randomRange(3.5, 9.8)
            val c = pick(accents)
            spawnParticle(
                x + randomRange(-4.0, 4.0),
                y + randomRange(-4.0, 4.0),
                cos(angle) * vel,
                sin(angle) * vel,
                c,
                randomRange(1.8, 3.2),
                randomRange(0.016, 0.024),
                0.11, 0.955, true,
            )
        }

        val emberCount = 10
        val embers = if (isPenalty) Palettes.penaltyEmbers else Palettes.emberColors
        for (i in 0 until emberCount) {
            val angle = randomRange(-Math.PI * 0.85, -Math.PI * 0.15)
            val vel = randomRange(1.2, 3.5)
            val c = pick(embers)
            spawnParticle(
                x + randomRange(-10.0, 10.0),
                y + randomRange(-6.0, 6.0),
                cos(angle) * vel,
                sin(angle) * vel,
                c,
                randomRange(2.8, 4.4),
                randomRange(0.014, 0.022),
                -0.02, 0.965, false,
            )
        }
    }

    /** 4. Punch blast / fast-fist overdrive. */
    fun createPunchBlast(x: Double, y: Double, intensity: Double = 1.2) {
        val count = jsRound(randomRange(36.0, 60.0) * intensity)
        flashIntensity = min(flashIntensity + 0.3, 0.6)

        spawnRing(x, y, 95 * intensity, Palettes.WHITE, 6.5)
        spawnRing(x, y, 55 * intensity, Palettes.ROSE, 4.0)

        for (i in 0 until count) {
            val angle = random.nextDouble() * Math.PI * TWO_PI_FACTOR
            val vel = randomRange(4.5, 12.0) * intensity
            val color = if (random.nextDouble() > 0.3) pick(Palettes.ruby) else Palettes.WHITE
            spawnParticle(
                x, y,
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(2.2, 3.8),
                randomRange(0.016, 0.036),
                0.10, 0.97, true,
            )
        }
    }

    /** 5. Chakri wheel spin. */
    fun createChakriSpin(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(20.0, 34.0) * intensity)
        val pal = Palettes.electric
        val baseAngle = random.nextDouble() * Math.PI * TWO_PI_FACTOR

        for (i in 0 until count) {
            val arm = (i % 4) * (Math.PI / 2)
            val angle = baseAngle + arm + randomRange(-0.25, 0.25)
            val vel = randomRange(2.5, 6.8) * intensity
            val color = pick(pal)
            spawnParticle(
                x, y,
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(1.6, 3.0),
                randomRange(0.025, 0.048),
                0.04, 0.975, true,
            )
        }
    }

    /** 6. Rocket firework bloom. */
    fun createRocketBurst(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(26.0, 42.0) * intensity)
        val pal = Palettes.royal

        spawnRing(x, y, 70 * intensity, Palettes.VIOLET, 4.5)

        for (i in 0 until count) {
            val angle = (i.toDouble() / count) * Math.PI * 2
            val vel = randomRange(3.5, 7.5) * intensity
            val color = pick(pal)
            spawnParticle(
                x, y,
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(1.8, 3.2),
                randomRange(0.022, 0.042),
                0.07, 0.98, true,
            )
        }
    }

    /** 7. Golden spark shower. */
    fun createGoldenShower(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(14.0, 26.0) * intensity)
        for (i in 0 until count) {
            val vx = randomRange(-3.5, 3.5) * intensity
            val vy = randomRange(-1.0, 4.5) * intensity
            val color = pick(Palettes.gold)
            spawnParticle(
                x + randomRange(-12.0, 12.0),
                y + randomRange(-12.0, 12.0),
                vx, vy,
                color,
                randomRange(1.4, 2.4),
                randomRange(0.025, 0.048),
                0.16, 0.97, true,
            )
        }
    }

    /** 8. Colourful multi-star firework. */
    fun createColorfulFirework(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(20.0, 34.0) * intensity)
        for (i in 0 until count) {
            val pal = pickPalette(Palettes.all)
            val color = pick(pal)
            val angle = random.nextDouble() * Math.PI * TWO_PI_FACTOR
            val vel = randomRange(2.5, 6.8) * intensity
            spawnParticle(
                x, y,
                cos(angle) * vel,
                sin(angle) * vel,
                color,
                randomRange(1.8, 3.0),
                randomRange(0.024, 0.046),
                0.08, 0.97, true,
            )
        }
    }

    /** 9. Popping lad crackers. */
    fun createLadPoppers(x: Double, y: Double, intensity: Double = 1.0) {
        val count = jsRound(randomRange(10.0, 18.0) * intensity)
        for (i in 0 until count) {
            val offsetX = randomRange(-20.0, 20.0)
            val offsetY = randomRange(-20.0, 20.0)
            val angle = random.nextDouble() * Math.PI * TWO_PI_FACTOR
            val vel = randomRange(1.2, 3.8)
            spawnParticle(
                x + offsetX,
                y + offsetY,
                cos(angle) * vel,
                sin(angle) * vel,
                pick(Palettes.ruby),
                randomRange(1.4, 2.4),
                randomRange(0.05, 0.09),
                0.06, 0.95, true,
            )
        }
    }

    /** 10. Mega combo blast (both hands moving fast). */
    fun createMegaComboBlast(x1: Double, y1: Double, x2: Double, y2: Double) {
        lastStyle = CrackerStyle.MEGA_COMBO
        totalBursts += 2
        flashIntensity = 0.65

        val midX = (x1 + x2) / 2
        val midY = (y1 + y2) / 2

        spawnRing(midX, midY, 140.0, Palettes.AMBER, 7.0)
        spawnRing(x1, y1, 85.0, Palettes.ROSE, 5.5)
        spawnRing(x2, y2, 85.0, Palettes.SKY, 5.5)

        createPunchBlast(x1, y1, 1.2)
        createPunchBlast(x2, y2, 1.2)
        createAnarFlowerpot(midX, midY, 1.2)
    }

    // ---- simulation ----

    /**
     * Advances the simulation by `dtSeconds`. At dt = 1/60 (k == 1.0 exactly, see [frameScale]) this is
     * the TS per-frame `update()` bit for bit.
     *
     * Frame-rate independence (k = dt * 60): velocity decays by `drag^k` with gravity accumulated
     * over the k frames and position integrated over them (see [advanceVariableStep]; the naive
     * `x += vx * k` is up to ~7 px off at 30 Hz); `alpha -= decay * k`; ring `radius += speed * k`;
     * `flash -= 0.04 * k`.
     */
    fun step(dtSeconds: Double) {
        // Ignore zero/negative/NaN dt (would revive or freeze particles); cap huge pauses at 0.1 s.
        if (!(dtSeconds > 0.0)) return
        val k = frameScale(min(dtSeconds, MAX_STEP_SECONDS))
        var active = 0

        if (flashIntensity > 0) {
            flashIntensity = max(0.0, flashIntensity - 0.04 * k)
        }

        for (i in 0 until maxParticles) {
            val p = pool[i]
            if (!p.active) continue

            active++
            p.trailX = p.x
            p.trailY = p.y

            if (k == 1.0) {
                // Exactly the TS per-frame arithmetic.
                p.vx *= p.drag
                p.vy = p.vy * p.drag + p.gravity
                p.x += p.vx
                p.y += p.vy
            } else {
                advanceVariableStep(p, k)
            }

            p.alpha -= p.decay * k

            if (p.alpha <= 0) {
                p.active = false
            }
        }

        for (i in 0 until MAX_RINGS) {
            val r = ringPool[i]
            if (!r.active) continue

            r.radius += r.speed * k
            r.alpha = 1 - r.radius / r.maxRadius

            if (r.radius >= r.maxRadius || r.alpha <= 0) {
                r.active = false
            }
        }

        activeCount = active
    }


    /**
     * Advances one particle by k (!= 1) 60 Hz frames using the closed form of the TS per-frame
     * recurrence, so a 30 Hz step lands where two 60 Hz frames would: with drag d, per-frame
     * `vx' = vx*d`, `x += vx'`, so after k frames `vx' = vx*d^k` and `x += vx * d(1-d^k)/(1-d)`;
     * likewise `vy' = vy*d^k + g(1-d^k)/(1-d)` with the matching displacement sum. (A naive
     * `x += vx*k` after the drag step is ~v/2 px off per 30 Hz step, i.e. up to ~7 px.)
     */
    private fun advanceVariableStep(p: Particle, k: Double) {
        val d = p.drag
        val dk = d.pow(k)
        val oneMinusD = 1 - d // drag is always in [0.95, 0.98], so never 0
        val s = d * (1 - dk) / oneMinusD // sum_{i=1..k} d^i
        val g = p.gravity / oneMinusD // terminal-velocity term of vy
        p.x += p.vx * s
        p.y += p.vy * s + g * (k - s)
        p.vx *= dk
        p.vy = p.vy * dk + g * (1 - dk)
    }

    /**
     * Clears all particles and rings and resets stats. Like the web engine, [lastStyle] is not reset.
     */
    fun reset() {
        for (i in 0 until maxParticles) pool[i].active = false
        for (i in 0 until MAX_RINGS) ringPool[i].active = false
        totalBursts = 0
        activeCount = 0
        nextFreeIndex = 0
        flashIntensity = 0.0
    }
}
