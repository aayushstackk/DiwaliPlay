package com.aayush.diwaliplay.app.ui

import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PhotoErrorMessageTest {
    @Test
    fun aHandTrackingFailureDoesNotBlameTheCamera() {
        val m = photoErrorMessage(TrackingStatus.Failed("landmarker init failed", cameraAlive = true))
        assertThat(m).doesNotContain("camera")
        assertThat(m).doesNotContain("Camera")
    }

    @Test
    fun aDeadCameraSaysSo() {
        assertThat(photoErrorMessage(TrackingStatus.Failed("bind failed"))).startsWith("Front camera unavailable")
        assertThat(photoErrorMessage(TrackingStatus.CameraLost("gone"))).startsWith("Front camera unavailable")
    }

    @Test
    fun aDeniedPermissionSaysSo() {
        assertThat(photoErrorMessage(TrackingStatus.Failed("camera permission denied"))).startsWith("Camera permission was denied")
    }

    @Test
    fun theWatchdogSaysTheFeedNeverStarted() {
        assertThat(photoErrorMessage(TrackingStatus.Starting)).startsWith("Camera failed to start video feed")
    }
}
