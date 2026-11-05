package com.aayush.diwaliplay.tracking.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FrameRouteTest {
    private val stored = ArrayList<String>()
    private val detected = ArrayList<String>()
    private var signals = 0
    private var alive = true
    private var ready = true

    private fun route(trackHands: Boolean) = FrameRoute<String>(
        trackHands = trackHands,
        cameraAlive = { alive },
        readyToDetect = { ready },
        store = { stored += it },
        onCameraFrame = { signals++ },
        detect = { detected += it },
    )

    @Test
    fun noLandmarkerIsWantedWithoutHandTracking() {
        assertThat(route(trackHands = false).wantsLandmarker).isFalse()
        assertThat(route(trackHands = true).wantsLandmarker).isTrue()
    }

    @Test
    fun withoutHandTrackingAFrameIsStoredAndSignalledAndNeverDetected() {
        route(trackHands = false).onFrame { "f" }
        assertThat(stored).containsExactly("f")
        assertThat(signals).isEqualTo(1)
        assertThat(detected).isEmpty()
    }

    @Test
    fun aFrameIsStoredBeforeTheLandmarkerExists() {
        ready = false // still building, or failed
        route(trackHands = true).onFrame { "f" }
        assertThat(stored).containsExactly("f")
        assertThat(detected).isEmpty()
    }

    @Test
    fun aFrameIsStoredEvenIfDetectingItThrows() {
        val r = FrameRoute<String>(true, { true }, { true }, { stored += it }, { signals++ }, { throw IllegalStateException("boom") })
        runCatching { r.onFrame { "f" } }
        assertThat(stored).containsExactly("f")
    }

    @Test
    fun aHandTrackingRunDetectsAndDoesNotSignal() {
        route(trackHands = true).onFrame { "f" }
        assertThat(detected).containsExactly("f")
        assertThat(signals).isEqualTo(0)
    }

    @Test
    fun aDeadCameraStoresNothingAndDecodesNothing() {
        alive = false
        var decoded = false
        route(trackHands = false).onFrame {
            decoded = true
            "f"
        }
        assertThat(decoded).isFalse()
        assertThat(stored).isEmpty()
        assertThat(signals).isEqualTo(0)
    }
}
