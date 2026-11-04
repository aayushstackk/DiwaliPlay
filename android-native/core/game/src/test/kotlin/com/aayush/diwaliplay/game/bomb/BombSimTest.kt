package com.aayush.diwaliplay.game.bomb

import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.BombGameSettings
import com.aayush.diwaliplay.model.Point2D
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import kotlin.math.sqrt

class BombSimTest {
    private val dt = 1.0 / 60.0
    private val dtMs = 1000.0 / 60.0
    private val noHands = emptyList<Point2D>()

    private class ConstRandom(private val v: Double) : GameRandom {
        override fun nextDouble() = v
    }

    private fun cfg(id: String, points: Int = 100) =
        BombConfig(id = id, color = "#EF4444", points = points, spawnWeight = 1.0, sizePercent = 100.0)

    private fun settings(
        minD: Double = 650.0, maxD: Double = 1400.0, conc: Int = 5, burst: Int = 3, grav: Double = 1.45,
    ) = BombGameSettings(
        minSpawnDelayMs = minD, maxSpawnDelayMs = maxD, maxConcurrentBombs = conc, bombRadius = 52.0,
        bombLifetimeMs = 5500.0, launchSpeedMultiplier = 1.45, gravityMultiplier = grav,
        maxBurstSize = burst, burstIntervalMs = 75.0,
    )

    private class Clock(var frame: Int = 0) {
        val nowMs get() = 1000.0 + frame * (1000.0 / 60.0)
    }

    private fun BombSim.tick(c: Clock, hands: List<Point2D> = emptyList()) {
        c.frame++
        step(dt, c.nowMs, hands)
    }

    private fun BombSim.firstActive(): BombSlotView? = bombs.firstOrNull { it.active && !it.isBursting }

    @Test
    fun neverExceedsMaxConcurrent() {
        for (conc in listOf(1, 3, 5, 8)) {
            val sim = BombSim(listOf(cfg("a"), cfg("b")), settings(minD = 100.0, maxD = 200.0, conc = conc), Mulberry32(7))
            val c = Clock()
            var peak = 0
            repeat(60 * 30) {
                sim.tick(c)
                peak = maxOf(peak, sim.bombs.count { it.active && !it.isBursting })
                assertThat(sim.bombs.count { it.active }).isAtMost(8)
            }
            assertThat(peak).isEqualTo(conc)
        }
    }

    @Test
    fun spawnDelayWithinConfiguredRange() {
        // One shot per burst (maxBurstSize 1) with 8 slots: a bomb is always in flight (flight > 1.6 s > maxDelay
        // 1.4 s) so the "nothing committed" 320 ms shortcut never applies and gaps equal the drawn delay.
        val sim = BombSim(listOf(cfg("a")), settings(conc = 8, burst = 1), Mulberry32(11))
        val c = Clock()
        val launches = ArrayList<Double>()
        var prevActive = BooleanArray(8)
        repeat(60 * 40) {
            sim.tick(c)
            sim.bombs.forEachIndexed { i, b ->
                if (b.active && !prevActive[i]) launches.add(c.nowMs)
                prevActive[i] = b.active
            }
        }
        assertThat(launches.size).isAtLeast(20)
        val gaps = launches.zipWithNext { a, b -> b - a }
        for (g in gaps) {
            assertThat(g).isAtLeast(650.0 - dtMs)
            assertThat(g).isAtMost(1400.0 + 2 * dtMs)
        }
        assertThat(gaps.min()).isLessThan(900.0)
        assertThat(gaps.max()).isGreaterThan(1150.0)
    }

    private fun apexCheck(gravMult: Double) {
        // ConstRandom(0.5): burst rand .5 -> desired 2 -> capped to 1 by maxBurstSize; mortar floor(.5*5)=2
        // (pctX .5, origin x 960, y 1080-72=1008); vxAngle (.5-.5)*40=0; mid mortar vx (.5-.5)*..=0.
        // targetApexY = max(130, 1080*.19 + .5*1080*.12 + 0) = 205.2 + 64.8 = 270; deltaH = 1008-270 = 738.
        // g = 2600 * gravMult/1.45; vy0 = -sqrt(2*g*738) (launchSpeedMultiplier 1.45 -> factor 1).
        // Apex time = -vy0 / g. At g=2600: sqrt(3837600)=1958.98 -> 0.7535 s.
        val sim = BombSim(listOf(cfg("a")), settings(conc = 1, burst = 1, grav = gravMult), ConstRandom(0.5))
        val g = 2600.0 * (gravMult / 1.45)
        val vy0 = -sqrt(2 * g * 738.0)
        val expectedApex = -vy0 / g
        val c = Clock()
        var launchStep = -1
        var steps = 0
        var prevY = 0.0
        var apexStep = -1
        repeat(400) {
            sim.tick(c)
            val b = sim.firstActive()
            if (b != null) {
                if (launchStep < 0) { launchStep = c.frame; steps = 0; prevY = b.y; assertThat(b.x).isWithin(1e-9).of(960.0) }
                else {
                    steps++
                    if (apexStep < 0 && b.y > prevY) apexStep = steps
                    prevY = b.y
                }
            }
        }
        // The launch frame already integrates once (web launches before the flight loop), so after k frames since
        // launch (k = steps + 1) the bomb has flown k*dt. y first increases on the frame after apex.
        val apexTime = (apexStep) * dt
        assertThat(apexTime).isWithin(dt * 1.0 + 1e-9).of(expectedApex)
    }

    @Test fun bombFollowsBallisticArc() = apexCheck(1.45)

    @Test fun bombFollowsBallisticArcWithDoubleGravity() = apexCheck(2.9)

    /** Runs ConstRandom sim until a bomb has flown >100ms (scale >= .8). */
    private fun armed(configs: List<BombConfig>): Triple<BombSim, Clock, BombSlotView> {
        val sim = BombSim(configs, settings(conc = 1, burst = 1), ConstRandom(0.5))
        val c = Clock()
        var b: BombSlotView? = null
        repeat(20) { sim.tick(c); b = sim.firstActive() }
        return Triple(sim, c, b!!)
    }

    @Test
    fun handInsideRadiusBurstsOnce() {
        val (sim, c, b) = armed(listOf(cfg("a", 100)))
        val hand = listOf(Point2D(b.x, b.y))
        repeat(30) { sim.tick(c, hand) }
        val hits = sim.drainHits()
        assertThat(hits).hasSize(1)
        assertThat(hits[0].config.id).isEqualTo("a")
        assertThat(hits[0].isPenalty).isFalse()
        assertThat(hits[0].points).isEqualTo(100)
        assertThat(sim.drainHits()).isEmpty()
        assertThat(sim.bombs.first { it.active }.isBursting).isTrue()
    }

    @Test
    fun handOutsideRadiusDoesNotBurst() {
        val (sim, c, b) = armed(listOf(cfg("a")))
        // pad = radius 52 + hand 42 = 94; bomb moves ~33px/frame so stay > 150 px away horizontally.
        repeat(5) { sim.tick(c, listOf(Point2D(b.x + 400.0, b.y))) }
        assertThat(sim.drainHits()).isEmpty()
    }

    @Test
    fun touchBurstsBomb() {
        val (sim, c, b) = armed(listOf(cfg("a", 100)))
        // touch hit radius = max(20, 52*1.25) = 65 px
        sim.touch(b.x + 60.0, b.y, c.nowMs)
        val hits = sim.drainHits()
        assertThat(hits).hasSize(1)
        assertThat(hits[0].x).isWithin(1e-9).of(b.x)
        assertThat(sim.popups.any { it.active && it.text == "+100" }).isTrue()
        sim.touch(b.x, b.y, c.nowMs)
        assertThat(sim.drainHits()).isEmpty()
    }

    @Test
    fun touchOutsideMisses() {
        val (sim, c, b) = armed(listOf(cfg("a")))
        sim.touch(b.x + 70.0, b.y, c.nowMs)
        assertThat(sim.drainHits()).isEmpty()
    }

    @Test
    fun penaltyBombReportsIsPenalty() {
        val (sim, c, b) = armed(listOf(cfg("bad", -150)))
        sim.touch(b.x, b.y, c.nowMs)
        val hits = sim.drainHits()
        assertThat(hits).hasSize(1)
        assertThat(hits[0].isPenalty).isTrue()
        assertThat(hits[0].points).isEqualTo(-150)
        assertThat(sim.popups.first { it.active }.text).isEqualTo("-150 OUCH!")
        assertThat(sim.popups.first { it.active }.isPenalty).isTrue()
    }

    @Test
    fun effectsExpireAfterLifetime() {
        val (sim, c, b) = armed(listOf(cfg("a")))
        sim.touch(b.x, b.y, c.nowMs)
        val burstAt = c.nowMs
        val types = sim.effects.filter { it.active }.map { it.type }.toSet()
        assertThat(types).containsAtLeast(BombParticleType.SHOCKWAVE, BombParticleType.FLASH, BombParticleType.EMBER)
        assertThat(sim.effects.count { it.active && it.type == BombParticleType.EMBER }).isEqualTo(14)
        // Longest lifetimes: ember <= 500 ms, smoke starts +60 and lives 600 (ends 660 ms), popup 850 ms,
        // bomb slot 700 ms. Everything (except fresh ascent sparks of newer bombs) is gone by 900 ms.
        // Single-bomb pool with no new spawns: conc=1 so no new launch until the burst bomb is released.
        repeat(((850.0 - 100.0) / dtMs).toInt()) { sim.tick(c) }
        assertThat(c.nowMs - burstAt).isLessThan(850.0)
        assertThat(sim.effects.none { it.active && (it.type == BombParticleType.SHOCKWAVE) }).isTrue()  // 500 ms
        assertThat(sim.effects.none { it.active && (it.type == BombParticleType.FLASH) }).isTrue()  // 150 ms
        assertThat(sim.effects.none { it.active && (it.type == BombParticleType.EMBER) }).isTrue()  // <= 500 ms
        assertThat(sim.effects.none { it.active && (it.type == BombParticleType.SMOKE) }).isTrue()  // 660 ms
        assertThat(sim.popups.any { it.active }).isTrue()  // popup 850 ms still alive at ~750 ms
        repeat((200.0 / dtMs).toInt() + 1) { sim.tick(c) }
        assertThat(sim.popups.none { it.active }).isTrue()
        assertThat(sim.bombs.none { it.active && it.isBursting }).isTrue()  // 700 ms
    }

    @Test
    fun badDtIsGuarded() {
        val sim = BombSim(listOf(cfg("a")), settings(), Mulberry32(3))
        sim.step(Double.NaN, 1000.0, noHands)
        sim.step(-1.0, 1016.0, noHands)
        sim.step(0.0, 1032.0, noHands)
        sim.step(5.0, 2000.0, noHands)  // clamped to 0.05
        for (b in sim.bombs) { assertThat(b.x.isNaN()).isFalse(); assertThat(b.y.isNaN()).isFalse() }
    }
}
