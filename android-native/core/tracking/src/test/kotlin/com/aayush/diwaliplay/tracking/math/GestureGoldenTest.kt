package com.aayush.diwaliplay.tracking.math

import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.tracking.golden.loadGolden
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

internal fun JsonElement.toLandmarks(): List<LandmarkPoint> = jsonArray.map {
    val o = it.jsonObject
    LandmarkPoint(o["x"]!!.jsonPrimitive.double, o["y"]!!.jsonPrimitive.double, o["z"]!!.jsonPrimitive.double)
}

class GestureGoldenTest {
    private val root = loadGolden("gestures").jsonObject

    @Test
    fun allCasesMatch() {
        val cases = root["cases"]!!.jsonArray
        assertThat(cases).hasSize(200 + 4)
        for (c in cases.map { it.jsonObject }) {
            assertThat(recognizeHandGesture(c["landmarks"]!!.toLandmarks()))
                .isEqualTo(HandGesture.valueOf(c["gesture"]!!.jsonPrimitive.content))
        }
    }

    @Test
    fun canonicalPosesRecognised() {
        val byName = root["cases"]!!.jsonArray.map { it.jsonObject }.associateBy { it["name"]!!.jsonPrimitive.content }
        fun g(n: String) = recognizeHandGesture(byName.getValue(n)["landmarks"]!!.toLandmarks())
        assertThat(g("canonical_fist")).isEqualTo(HandGesture.FIST)
        assertThat(g("canonical_open_palm")).isEqualTo(HandGesture.OPEN_PALM)
        assertThat(g("canonical_peace")).isEqualTo(HandGesture.PEACE)
        assertThat(g("canonical_pointing")).isEqualTo(HandGesture.POINTING)
    }

    @Test
    fun allGesturesAppearInGolden() {
        val seen = root["cases"]!!.jsonArray.map { it.jsonObject["gesture"]!!.jsonPrimitive.content }.toSet()
        assertThat(seen).containsAtLeast("FIST", "OPEN_PALM", "PEACE", "POINTING", "THUMBS_UP", "UNKNOWN")
    }

    @Test
    fun shortOrEmptyIsUnknown() {
        assertThat(recognizeHandGesture(emptyList())).isEqualTo(HandGesture.UNKNOWN)
        val first = root["cases"]!!.jsonArray[0].jsonObject["landmarks"]!!.toLandmarks()
        assertThat(recognizeHandGesture(first.take(20))).isEqualTo(HandGesture.UNKNOWN)
        assertThat(root["short"]!!.jsonPrimitive.content).isEqualTo("UNKNOWN")
        assertThat(root["empty"]!!.jsonPrimitive.content).isEqualTo("UNKNOWN")
    }

    @Test
    fun thumbsUpPosesMatch() {
        for (t in root["thumbsUpPoses"]!!.jsonArray.map { it.jsonObject }) {
            assertThat(recognizeHandGesture(t["landmarks"]!!.toLandmarks()))
                .isEqualTo(HandGesture.valueOf(t["gesture"]!!.jsonPrimitive.content))
        }
    }
}
