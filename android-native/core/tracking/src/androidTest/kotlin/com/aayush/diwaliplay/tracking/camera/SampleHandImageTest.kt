package com.aayush.diwaliplay.tracking.camera

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.tracking.HandTracker
import com.google.common.truth.Truth.assertThat
import com.google.mediapipe.tasks.vision.core.RunningMode
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Feeds MediaPipe's official hand-landmarker sample image (woman_hands.jpg, from
 * storage.googleapis.com/mediapipe-tasks/hand_landmarker/, the same bucket family as the bundled
 * model) through LandmarkerHost and HandTracker. Replaces the brief's recorded clip (ruling P6).
 *
 * The photo shows two hands: one raised across the forehead (upper, centre-right of the raw image)
 * and one held out low on the left of the raw image. HandTracker mirrors x like the web, so the
 * upper hand is the player's LEFT and the lower one their RIGHT.
 */
@RunWith(AndroidJUnit4::class)
class SampleHandImageTest {

    private val context = InstrumentationRegistry.getInstrumentation().context

    private fun loadImage(): Bitmap = context.assets.open("woman_hands.jpg").use {
        BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
        })!!
    }

    @Test
    fun imageModeDetectsBothHands() {
        LandmarkerHost.create(context, RunningMode.IMAGE).use { host ->
            Log.i("SampleHandImageTest", "IMAGE mode delegate=${host.delegate}")
            assertThat(host.delegate).isAnyOf(DELEGATE_GPU, DELEGATE_CPU)
            val frame = host.detect(loadImage())
            assertThat(frame.hands).hasSize(2)
            assertThat(frame.handedness).hasSize(2)
            frame.hands.forEach { assertThat(it).hasSize(21) }
        }
    }

    @Test
    fun videoModeLabelsLeftAndRightStablyAcrossFrames() {
        val image = loadImage()
        val tracker = HandTracker()
        val frames = 30
        var bothDetected = 0
        val leftIsUpper = mutableListOf<Boolean>()
        LandmarkerHost.create(context, RunningMode.VIDEO).use { host ->
            Log.i("SampleHandImageTest", "VIDEO mode delegate=${host.delegate}")
            val ts = MonotonicTimestamp()
            for (i in 0 until frames) {
                val t = ts.next(i * 33L)
                val frame = host.detectForVideo(image, t)
                // Raw landmarks straight in: HandTracker mirrors x itself (no mirrorLandmarks).
                val hands = tracker.update(frame, t.toDouble())
                if (hands.left.detected && hands.right.detected) {
                    bothDetected++
                    leftIsUpper += hands.left.pixelY < hands.right.pixelY
                }
            }
        }
        assertThat(bothDetected.toDouble() / frames).isGreaterThan(0.7)
        // Same physical hand on the same side every frame, and it's the mirrored-left (upper) one.
        assertThat(leftIsUpper.toSet()).containsExactly(true)
        // Render data comes from the same tracker state.
        val render = tracker.renderHands()
        assertThat(render.map { it.side }).containsExactly("left", "right").inOrder()
        assertThat(render.all { it.detected }).isTrue()
    }

    @Test
    fun liveStreamModeDeliversBothHandsWithMonotonicTimestamps() {
        val image = loadImage()
        val results = java.util.Collections.synchronizedList(mutableListOf<Pair<Long, Int>>())
        val done = CountDownLatch(5)
        LandmarkerHost.create(context, RunningMode.LIVE_STREAM, listener = { frame, ts ->
            results += ts to frame.hands.size
            done.countDown()
        }).use { host ->
            val ts = MonotonicTimestamp()
            // Repeated wall-clock values must be bumped (MediaPipe rejects non-increasing timestamps).
            for (i in 0 until 40) {
                host.detectAsync(image, ts.next((i / 2) * 33L))
                Thread.sleep(30)
                if (done.count == 0L) break
            }
            assertThat(done.await(10, TimeUnit.SECONDS)).isTrue()
            Log.i("SampleHandImageTest", "LIVE_STREAM delegate=${host.delegate}")
        }
        val snapshot = synchronized(results) { results.toList() }
        assertThat(snapshot.map { it.first }).isInStrictOrder()
        assertThat(snapshot.count { it.second == 2 }.toDouble() / snapshot.size).isGreaterThan(0.7)
    }
}
