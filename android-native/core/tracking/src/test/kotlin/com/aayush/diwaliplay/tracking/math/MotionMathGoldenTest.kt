package com.aayush.diwaliplay.tracking.math

import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.model.MovementDirection
import com.aayush.diwaliplay.model.Point2D
import com.aayush.diwaliplay.model.TargetAreaRect
import com.aayush.diwaliplay.tracking.golden.loadGolden
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

private const val EPS = 1e-9

class MotionMathGoldenTest {
    private val root = loadGolden("motion_math").jsonObject
    private val width = root["width"]!!.jsonPrimitive.double
    private val height = root["height"]!!.jsonPrimitive.double

    private fun JsonElement.d() = jsonPrimitive.double
    private fun JsonElement.point() = Point2D(jsonObject["x"]!!.d(), jsonObject["y"]!!.d())
    private fun JsonElement.rect() = TargetAreaRect(
        jsonObject["xMin"]!!.d(), jsonObject["xMax"]!!.d(), jsonObject["yMin"]!!.d(), jsonObject["yMax"]!!.d(),
    )

    private fun assertPoint(actual: Point2D, expected: Point2D) {
        assertThat(actual.x).isWithin(EPS).of(expected.x)
        assertThat(actual.y).isWithin(EPS).of(expected.y)
    }

    @Test
    fun constantsMatch() {
        assertThat(LEFT_TARGET_AREA).isEqualTo(root["leftArea"]!!.rect())
        assertThat(RIGHT_TARGET_AREA).isEqualTo(root["rightArea"]!!.rect())
        val bones = root["bones"]!!.jsonObject
        fun pairs(k: String) = bones[k]!!.jsonArray.map { it.jsonArray[0].jsonPrimitive.int to it.jsonArray[1].jsonPrimitive.int }
        assertThat(HAND_BONES.palm).isEqualTo(pairs("palm"))
        assertThat(HAND_BONES.thumb).isEqualTo(pairs("thumb"))
        assertThat(HAND_BONES.index).isEqualTo(pairs("index"))
        assertThat(HAND_BONES.middle).isEqualTo(pairs("middle"))
        assertThat(HAND_BONES.ring).isEqualTo(pairs("ring"))
        assertThat(HAND_BONES.pinky).isEqualTo(pairs("pinky"))
    }

    @Test
    fun palmCenterAndExtrapolationMatch() {
        val hands = root["hands"]!!.jsonArray
        assertThat(hands).hasSize(200 + 4)
        for (h in hands.map { it.jsonObject }) {
            val lm = h["landmarks"]!!.toLandmarks()
            assertPoint(getPalmCenterScreen(lm), h["palmCenter"]!!.point())
            for (e in h["extrapolated"]!!.jsonArray.map { it.jsonObject }) {
                val damping = e["damping"]!!
                val out = if (damping is JsonNull) {
                    extrapolateLandmarks(lm, e["vx"]!!.d(), e["vy"]!!.d(), e["dt"]!!.d(), width, height)
                } else {
                    extrapolateLandmarks(lm, e["vx"]!!.d(), e["vy"]!!.d(), e["dt"]!!.d(), width, height, damping.d())
                }
                val expected = e["out"]!!.toLandmarks()
                assertThat(out).hasSize(expected.size)
                for ((a, b) in out.zip(expected)) {
                    assertThat(a.x).isWithin(EPS).of(b.x)
                    assertThat(a.y).isWithin(EPS).of(b.y)
                    assertThat(a.z).isWithin(EPS).of(b.z)
                }
            }
        }
    }

    @Test
    fun edgeCases() {
        assertPoint(getPalmCenterScreen(emptyList()), root["emptyPalm"]!!.point())
        // fewer than 4 points: missing indices fall back to landmark 0 (as in the web code)
        val short = listOf(LandmarkPoint(0.2, 0.4, 0.0))
        assertPoint(getPalmCenterScreen(short), root["shortPalm"]!!.point())
        assertThat(extrapolateLandmarks(emptyList(), 100.0, 100.0, 0.1, width, height)).isEmpty()
        assertThat(root["emptyExtrapolate"]!!.jsonArray).isEmpty()
        val lm = root["hands"]!!.jsonArray[4].jsonObject["landmarks"]!!.toLandmarks()
        val out = extrapolateLandmarks(lm, 100.0, 100.0, 0.1, 0.0, 0.0, 0.5)
        val expected = root["zeroSizeExtrapolate"]!!.toLandmarks()
        for ((a, b) in out.zip(expected)) {
            assertThat(a.x).isWithin(EPS).of(b.x)
            assertThat(a.y).isWithin(EPS).of(b.y)
        }
    }

    @Test
    fun rectChecksMatch() {
        val rows = root["rectChecks"]!!.jsonArray
        for (r in rows.map { it.jsonObject }) {
            val p = Point2D(r["x"]!!.d(), r["y"]!!.d())
            assertThat(isPointInsideRect(p, LEFT_TARGET_AREA)).isEqualTo(r["left"]!!.jsonPrimitive.boolean)
            assertThat(isPointInsideRect(p, RIGHT_TARGET_AREA)).isEqualTo(r["right"]!!.jsonPrimitive.boolean)
        }
    }

    @Test
    fun speedCategoriesMatch() {
        for (r in root["speeds"]!!.jsonArray.map { it.jsonObject }) {
            assertThat(categorizeSpeed(r["input"]!!.d())).isEqualTo(r["output"]!!.jsonPrimitive.content)
        }
    }

    @Test
    fun directionsMatch() {
        val rows = root["directions"]!!.jsonArray
        for (r in rows.map { it.jsonObject }) {
            assertThat(calculateMovementDirection(r["vx"]!!.d(), r["vy"]!!.d()))
                .isEqualTo(MovementDirection.valueOf(r["output"]!!.jsonPrimitive.content))
        }
    }

    @Test
    fun gameMappingsMatch() {
        val rows = root["mappings"]!!.jsonArray
        assertThat(rows.size).isGreaterThan(200)
        for (r in rows.map { it.jsonObject }) {
            val got = evaluateGameMapping(
                r["leftSpeed"]!!.d(),
                r["rightSpeed"]!!.d(),
                HandGesture.valueOf(r["leftGesture"]!!.jsonPrimitive.content),
                HandGesture.valueOf(r["rightGesture"]!!.jsonPrimitive.content),
            )
            assertThat(got.crackerSpawnRate).isEqualTo(r["crackerSpawnRate"]!!.jsonPrimitive.content)
            assertThat(got.crackerAction).isEqualTo(r["crackerAction"]!!.jsonPrimitive.content)
            assertThat(got.isComboActive).isEqualTo(r["isComboActive"]!!.jsonPrimitive.boolean)
            assertThat(got.intensityPercent).isEqualTo(r["intensityPercent"]!!.jsonPrimitive.int)
        }
    }
}
