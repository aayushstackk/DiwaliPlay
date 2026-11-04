package com.aayush.diwaliplay.game.cracker

import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.game.golden.loadGolden
import com.aayush.diwaliplay.model.HandGesture
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max

class CrackerSimGoldenTest {
    private val root = loadGolden("cracker_engine").jsonObject
    private val scenarios = root["scenarios"]!!.jsonArray.map { it.jsonObject }
    private val dt60 = 1.0 / 60.0

    private fun argb(hex: String): Int = (0xFF000000L or hex.removePrefix("#").toLong(16)).toInt()

    private fun JsonElement.d() = jsonPrimitive.double

    private fun near(label: String, expected: Double, actual: Double) {
        val tol = max(1e-9, 1e-12 * abs(expected))
        assertThat(abs(expected - actual)).isAtMost(tol)
            .also { if (abs(expected - actual) > tol) println("MISMATCH $label expected=$expected actual=$actual") }
    }

    private fun CrackerSim.run(name: String) {
        when (name) {
            "sparkBurst" -> createSparkBurst(960.0, 540.0, 1.0)
            "sparkBurst_big" -> createSparkBurst(300.0, 400.0, 3.5)
            "anarFlowerpot" -> createAnarFlowerpot(500.0, 900.0, 1.0)
            "radialBomb" -> createRadialBomb(1200.0, 500.0, 1.4)
            "bombBurst" -> createBombBurst(800.0, 300.0, argb("#38BDF8"), false)
            "bombBurst_default" -> createBombBurst(820.0, 320.0)
            "bombBurst_penalty" -> createBombBurst(900.0, 600.0, argb("#F59E0B"), true)
            "punchBlast" -> createPunchBlast(1500.0, 700.0, 1.2)
            "punchBlast_big" -> createPunchBlast(1500.0, 700.0, 3.7)
            "chakriSpin" -> createChakriSpin(400.0, 300.0, 1.1)
            "rocketBurst" -> createRocketBurst(1000.0, 200.0, 0.9)
            "goldenShower" -> createGoldenShower(700.0, 100.0, 1.3)
            "colorfulFirework" -> createColorfulFirework(1300.0, 400.0, 1.0)
            "ladPoppers" -> createLadPoppers(200.0, 800.0, 1.5)
            "megaComboBlast" -> createMegaComboBlast(600.0, 500.0, 1400.0, 620.0)
            "motionSparkles_left_fast" -> addMotionSparkles(300.0, 300.0, HandSide.LEFT, 300.0)
            "motionSparkles_right_slow" -> addMotionSparkles(1600.0, 300.0, HandSide.RIGHT, 100.0)
            "motionSparkles_idle" -> addMotionSparkles(900.0, 300.0, HandSide.LEFT, 20.0)
            else -> {
                // "trigger_<GESTURE>_<speed>_<combo>"; GESTURE may itself contain an underscore.
                val t = name.removePrefix("trigger_")
                val last = t.lastIndexOf('_')
                val mid = t.lastIndexOf('_', last - 1)
                val g = t.substring(0, mid)
                val speedStr = t.substring(mid + 1, last)
                val combo = t.substring(last + 1)
                val speed = speedStr.toDouble()
                triggerCracker(960.0 + speed / 3, 540.0 - speed / 5, speed, HandGesture.valueOf(g), combo == "true")
            }
        }
    }

    private fun assertSnapshot(label: String, sim: CrackerSim, s: JsonObject) {
        assertThat(sim.activeCount).isEqualTo(s["activeCount"]!!.jsonPrimitive.int)
        assertThat(sim.totalBursts).isEqualTo(s["totalBursts"]!!.jsonPrimitive.int)
        assertThat(sim.lastStyle.name).isEqualTo(s["lastStyle"]!!.jsonPrimitive.content)
        near("$label flash", s["flash"]!!.d(), sim.flashIntensity)

        val act = sim.particles.indices.filter { sim.particles[it].active }
        assertThat(act.size).isEqualTo(s["nActive"]!!.jsonPrimitive.int)
        assertThat(act.sum()).isEqualTo(s["idxSum"]!!.jsonPrimitive.int)
        near("$label sumX", s["sumX"]!!.d(), act.fold(0.0) { a, i -> a + sim.particles[i].x })
        near("$label sumY", s["sumY"]!!.d(), act.fold(0.0) { a, i -> a + sim.particles[i].y })
        near("$label sumTX", s["sumTX"]!!.d(), act.fold(0.0) { a, i -> a + sim.particles[i].trailX })
        near("$label sumTY", s["sumTY"]!!.d(), act.fold(0.0) { a, i -> a + sim.particles[i].trailY })
        near("$label sumAlpha", s["sumAlpha"]!!.d(), act.fold(0.0) { a, i -> a + sim.particles[i].alpha })
        near("$label sumSize", s["sumSize"]!!.d(), act.fold(0.0) { a, i -> a + sim.particles[i].size })
        for (sm in s["samples"]!!.jsonArray.map { it.jsonObject }) {
            val i = sm["i"]!!.jsonPrimitive.int
            val p = sim.particles[i]
            assertThat(p.active).isTrue()
            near("$label[$i].x", sm["x"]!!.d(), p.x)
            near("$label[$i].y", sm["y"]!!.d(), p.y)
            near("$label[$i].tx", sm["tx"]!!.d(), p.trailX)
            near("$label[$i].ty", sm["ty"]!!.d(), p.trailY)
            near("$label[$i].vx", sm["vx"]!!.d(), p.vx)
            near("$label[$i].vy", sm["vy"]!!.d(), p.vy)
            near("$label[$i].a", sm["a"]!!.d(), p.alpha)
            near("$label[$i].s", sm["s"]!!.d(), p.size)
            assertThat(p.color).isEqualTo(argb(sm["c"]!!.jsonPrimitive.content))
            assertThat(p.flicker).isEqualTo(sm["f"]!!.jsonPrimitive.boolean)
        }

        val ringAct = sim.rings.filter { it.active }
        assertThat(ringAct.size).isEqualTo(s["nRings"]!!.jsonPrimitive.int)
        near("$label ringR", s["ringRadiusSum"]!!.d(), ringAct.fold(0.0) { a, r -> a + r.radius })
        near("$label ringA", s["ringAlphaSum"]!!.d(), ringAct.fold(0.0) { a, r -> a + r.alpha })
        val ring = s["ring"]
        if (ring is JsonObject) {
            val r = sim.rings[ring["i"]!!.jsonPrimitive.int]
            assertThat(r.active).isTrue()
            near("$label ring.x", ring["x"]!!.d(), r.x)
            near("$label ring.y", ring["y"]!!.d(), r.y)
            near("$label ring.radius", ring["radius"]!!.d(), r.radius)
            near("$label ring.max", ring["maxRadius"]!!.d(), r.maxRadius)
            near("$label ring.alpha", ring["alpha"]!!.d(), r.alpha)
            near("$label ring.speed", ring["speed"]!!.d(), r.speed)
            assertThat(r.color).isEqualTo(argb(ring["color"]!!.jsonPrimitive.content))
        } else {
            assertThat(ringAct).isEmpty()
        }
    }

    /** Plays snapshots (sorted by frame) against a sim already advanced to frame 0. */
    private fun replay(label: String, sim: CrackerSim, snaps: List<JsonObject>) {
        var frame = 0
        for (s in snaps) {
            val f = s["frame"]!!.jsonPrimitive.int
            while (frame < f) { sim.step(dt60); frame++ }
            assertSnapshot("$label@$f", sim, s)
        }
        while (frame < 90) { sim.step(dt60); frame++ }
    }

    @Test
    fun matchesWebEngineAt60Hz() {
        assertThat(scenarios).hasSize(10)
        for (sc in scenarios) {
            val seed = sc["seed"]!!.jsonPrimitive.int
            val lowEnd = sc["lowEnd"]!!.jsonPrimitive.boolean
            val rnd = Mulberry32(seed)
            val sim = CrackerSim(random = rnd)
            sim.setLowEndMode(lowEnd)
            for (a in sc["actions"]!!.jsonArray.map { it.jsonObject }) {
                val name = a["name"]!!.jsonPrimitive.content
                sim.run(name)
                replay("seed$seed/low=$lowEnd/$name", sim, a["snapshots"]!!.jsonArray.map { it.jsonObject })
            }
            // Stress: all actions fired with no update in between.
            for (a in sc["actions"]!!.jsonArray.map { it.jsonObject }) sim.run(a["name"]!!.jsonPrimitive.content)
            replay("seed$seed/low=$lowEnd/stress", sim, sc["stress"]!!.jsonArray.map { it.jsonObject })
            sim.reset()
            assertSnapshot("seed$seed/low=$lowEnd/afterReset", sim, sc["afterReset"]!!.jsonObject)
            // Same Math.random consumption as the TS engine.
            near("seed$seed nextRandom", sc["nextRandom"]!!.d(), rnd.nextDouble())
        }
    }

    @Test
    fun lowEndCapsAt260() {
        val sim = CrackerSim(random = Mulberry32(9))
        sim.setLowEndMode(true)
        repeat(20) { sim.createPunchBlast(900.0, 500.0, 3.0) }
        assertThat(sim.activeCount).isEqualTo(260)
        assertThat(sim.particles.count { it.active }).isEqualTo(260)
        sim.setLowEndMode(false)
        repeat(20) { sim.createPunchBlast(900.0, 500.0, 3.0) }
        assertThat(sim.activeCount).isEqualTo(700)
        assertThat(sim.flashEnabled).isTrue()
    }

    @Test
    fun thirtyHzTwoStepsApproximatesSixtyHz() {
        for (seed in 1..5) {
            val a = CrackerSim(random = Mulberry32(seed))
            val b = CrackerSim(random = Mulberry32(seed))
            for (s in listOf(a, b)) {
                s.createBombBurst(900.0, 500.0, 0xFFF59E0B.toInt(), false)
                s.createAnarFlowerpot(500.0, 900.0, 1.0)
                s.createGoldenShower(700.0, 100.0, 1.0)
            }
            var maxErr = 0.0
            var compared = 0
            for (frame in 1..60) {
                a.step(1.0 / 60.0)
                if (frame % 2 == 0) {
                    b.step(1.0 / 30.0)
                    for (i in a.particles.indices) {
                        val pa = a.particles[i]
                        val pb = b.particles[i]
                        if (pa.active && pb.active) {
                            compared++
                            maxErr = max(maxErr, hypot(pa.x - pb.x, pa.y - pb.y))
                        }
                    }
                }
            }
            assertThat(compared).isGreaterThan(100)
            assertThat(maxErr).isLessThan(2.0)
        }
    }

    @Test
    fun resetClearsEverything() {
        val sim = CrackerSim(random = Mulberry32(3))
        sim.createMegaComboBlast(500.0, 500.0, 1200.0, 500.0)
        sim.step(dt60)
        assertThat(sim.activeCount).isGreaterThan(0)
        assertThat(sim.totalBursts).isGreaterThan(0)
        assertThat(sim.flashIntensity).isGreaterThan(0.0)
        sim.reset()
        assertThat(sim.activeCount).isEqualTo(0)
        assertThat(sim.totalBursts).isEqualTo(0)
        assertThat(sim.flashIntensity).isEqualTo(0.0)
        assertThat(sim.particles.none { it.active }).isTrue()
        assertThat(sim.rings.none { it.active }).isTrue()
    }

    @Test
    fun dtOfExactlyOneSixtiethBehavesAsOneFrame() {
        // k must be exactly 1.0 for dt = 1/60 so arithmetic reduces to the TS per-frame update.
        assertThat(frameScale(1.0 / 60.0)).isEqualTo(1.0)
        assertThat(frameScale(1.0 / 30.0)).isEqualTo(2.0)
    }
}
