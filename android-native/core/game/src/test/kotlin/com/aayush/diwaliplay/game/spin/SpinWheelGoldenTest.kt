package com.aayush.diwaliplay.game.spin

import com.aayush.diwaliplay.game.golden.loadGolden
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class SpinWheelGoldenTest {
    private val root = loadGolden("spin_wheel").jsonObject
    private val stepMs = root["stepMs"]!!.jsonPrimitive.int

    private fun JsonElement.d() = jsonPrimitive.double
    private fun JsonElement.doubles() = jsonArray.map { it.d() }

    @Test
    fun constantsMatchWeb() {
        val c = root["constants"]!!.jsonObject
        assertThat(SpinConstants.CRUISE_SPEED).isEqualTo(c["CRUISE_SPEED"]!!.d())
        assertThat(SpinConstants.ACCEL_DURATION_MS).isEqualTo(c["ACCEL_DURATION_MS"]!!.d())
        assertThat(SpinConstants.MIN_CRUISE_DURATION_MS).isEqualTo(c["MIN_CRUISE_DURATION_MS"]!!.d())
        assertThat(SpinConstants.DECEL_FULL_TURNS).isEqualTo(c["DECEL_FULL_TURNS"]!!.jsonPrimitive.int)
        assertThat(SpinConstants.DECEL_EASING_POWER).isEqualTo(c["DECEL_EASING_POWER"]!!.d())
        assertThat(SpinConstants.MIN_TICK_INTERVAL_MS).isEqualTo(c["MIN_TICK_INTERVAL_MS"]!!.d())
    }

    @Test
    fun targetStopAnglesMatchWeb() {
        var checked = 0
        for (entry in root["targetAngles"]!!.jsonArray) {
            val n = entry.jsonObject["numSlices"]!!.jsonPrimitive.int
            entry.jsonObject["angles"]!!.doubles().forEachIndexed { i, expected ->
                assertThat(calculateTargetStopAngle(i, n)).isWithin(1e-9).of(expected)
                checked++
            }
        }
        assertThat(checked).isEqualTo((4..12).sum())
        for (e in root["edgeTargetAngles"]!!.jsonArray) {
            val o = e.jsonObject
            assertThat(calculateTargetStopAngle(o["targetIdx"]!!.jsonPrimitive.int, o["numSlices"]!!.jsonPrimitive.int))
                .isWithin(1e-9).of(o["angle"]!!.d())
        }
    }

    @Test
    fun trajectoriesAndPerFrameAnglesMatchWeb() {
        val list = root["trajectories"]!!.jsonArray
        assertThat(list.size).isAtLeast(72)
        for (e in list) {
            val o = e.jsonObject
            val t = calculateDecelTrajectory(o["startAngle"]!!.d(), o["target"]!!.d())
            assertThat(t.decelStartAngle).isWithin(1e-9).of(o["decelStartAngle"]!!.d())
            assertThat(t.totalDecelDegrees).isWithin(1e-9).of(o["totalDecelDegrees"]!!.d())
            assertThat(t.decelDurationMs).isWithin(1e-9).of(o["decelDurationMs"]!!.d())
            val angles = o["angles"]!!.doubles()
            angles.forEachIndexed { k, expected ->
                assertThat(angleAt(t, (k * stepMs).toDouble())).isWithin(1e-6).of(expected)
            }
            // Ends exactly on the target slice centre, and is clamped past the end.
            val end = angleAt(t, t.decelDurationMs + 5000)
            assertThat(end).isWithin(1e-9).of(t.decelStartAngle + t.totalDecelDegrees)
            val mod = ((end % 360) + 360) % 360
            assertThat(mod).isWithin(1e-6).of(o["target"]!!.d() % 360)
        }
    }

    @Test
    fun cruiseAnglesMatchWeb() {
        for (e in root["cruise"]!!.jsonArray) {
            val o = e.jsonObject
            val initial = o["initialAngle"]!!.d()
            val times = o["elapsedMs"]!!.doubles()
            o["angles"]!!.doubles().forEachIndexed { k, expected ->
                assertThat(cruiseAngleAt(initial, times[k])).isWithin(1e-6).of(expected)
            }
        }
    }

    @Test
    fun trajectoryIsMonotonicClockwise() {
        val t = calculateDecelTrajectory(1056.0, calculateTargetStopAngle(3, 8))
        var prev = angleAt(t, 0.0)
        var ms = 0.0
        while (ms <= t.decelDurationMs + 50) {
            val a = angleAt(t, ms)
            assertThat(a).isAtLeast(prev)
            prev = a
            ms += 1.0
        }
    }
}
