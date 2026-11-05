package com.aayush.diwaliplay.app.ui.admin

import com.aayush.diwaliplay.tracking.camera.DELEGATE_CPU
import com.aayush.diwaliplay.tracking.camera.DELEGATE_GPU
import com.aayush.diwaliplay.tracking.camera.DELEGATE_NONE
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PerfOverlayLinesTest {
    @Test fun runningShowsEveryNumber() {
        val lines = perfOverlayLines(TrackingStatus.Running(DELEGATE_GPU, 12.34, 29.6), 58.7f, lowEnd = false)
        assertThat(lines).containsExactly("Render 59 fps", "Tracking GPU", "Inference 12.3 ms", "Camera 30 fps").inOrder()
    }

    @Test fun cpuDelegateIsNamed() {
        assertThat(perfOverlayLines(TrackingStatus.Running(DELEGATE_CPU, 40.0, 15.0), 30f, false)).contains("Tracking CPU")
    }

    @Test fun noneMeansNoHandTracking() {
        val lines = perfOverlayLines(TrackingStatus.Running(DELEGATE_NONE, 0.0, 30.0), 60f, false)
        assertThat(lines).containsExactly("Render 60 fps", "Tracking off", "Camera 30 fps").inOrder()
    }

    @Test fun lowEndIsFlagged() {
        assertThat(perfOverlayLines(TrackingStatus.Starting, 40f, lowEnd = true).first()).isEqualTo("Render 40 fps (low-end)")
    }

    @Test fun otherStatesSayWhatsWrong() {
        assertThat(perfOverlayLines(TrackingStatus.Starting, 0f, false)).containsExactly("Render 0 fps", "Tracking starting").inOrder()
        assertThat(perfOverlayLines(TrackingStatus.CameraLost("gone"), 0f, false)).contains("Camera lost: gone")
    }
}
