package com.aayush.diwaliplay.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Environment
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aayush.diwaliplay.game.Mulberry32
import com.aayush.diwaliplay.game.bomb.BombSim
import com.aayush.diwaliplay.game.cracker.CrackerSim
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.model.DEFAULT_BOMB_CONFIGS
import com.aayush.diwaliplay.model.DEFAULT_BOMB_SETTINGS
import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.HandRender
import com.aayush.diwaliplay.model.LandmarkPoint
import com.aayush.diwaliplay.model.Point2D
import com.aayush.diwaliplay.model.TrailPoint
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.random.Random

/**
 * Draws real frames into an offscreen 1920x1080 bitmap and saves PNGs for visual review:
 * - render_smoke.png: mega combo + bombs in flight and bursting + hand flames (Playing);
 * - render_smoke_calibration.png: skeleton guides and trails (Calibrating).
 * Files go to the AGP additional test output dir (pulled into build/outputs) and app external files.
 */
@RunWith(AndroidJUnit4::class)
class RenderSmokeTest {

    private val dt = 1.0 / 60.0

    @Test
    fun megaComboFrameDrawsVisibleEffects() {
        val crackers = CrackerSim(random = Mulberry32(14))
        val bombs = BombSim(DEFAULT_BOMB_CONFIGS, DEFAULT_BOMB_SETTINGS, Mulberry32(41)).apply { touchMode = true }

        // Let the spawner launch a few bombs (~1.6 s), then burst one so all effect types are live.
        var now = 10_000.0
        repeat(100) { now += dt * 1000; bombs.step(dt, now, emptyList()) }
        val target = bombs.bombs.first { it.active && !it.isBursting }
        bombs.touch(target.x, target.y, now)
        repeat(4) { now += dt * 1000; bombs.step(dt, now, emptyList<Point2D>()) }

        crackers.createMegaComboBlast(620.0, 520.0, 1300.0, 500.0)
        repeat(6) { crackers.step(dt) }

        val hands = listOf(hand("left", 620.0, 640.0, speed = 900.0), hand("right", 1300.0, 620.0, speed = 1200.0))
        val renderer = CanvasRenderer(random = Random(5))
        val bitmap = Bitmap.createBitmap(LOGICAL_WIDTH, LOGICAL_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        // A few frames so the flame smoothing fades in and embers spawn.
        repeat(8) {
            now += dt * 1000
            renderer.draw(canvas, RenderFrame(crackers, bombs, hands, GamePhase.Playing, lowEnd = false, nowMs = now))
        }

        val stats = pixelStats(bitmap)
        save(bitmap, "render_smoke.png")
        assertThat(stats.nonTransparent).isGreaterThan(0.01)
        assertThat(stats.bright).isGreaterThan(0.0005) // sparks/flames, not just the faint flash wash
    }

    @Test
    fun calibrationFrameDrawsSkeletonsAndTrails() {
        val crackers = CrackerSim(random = Mulberry32(1))
        val hands = listOf(
            hand("left", 520.0, 540.0, speed = 300.0, marks = handMarks(1 - 520.0 / 1920, 0.5)),
            hand("right", 1400.0, 540.0, speed = 0.0, marks = handMarks(1 - 1400.0 / 1920, 0.5)),
        )
        val bitmap = Bitmap.createBitmap(LOGICAL_WIDTH, LOGICAL_HEIGHT, Bitmap.Config.ARGB_8888)
        CanvasRenderer(random = Random(5)).draw(
            Canvas(bitmap),
            RenderFrame(crackers, null, hands, GamePhase.Calibrating(ready = false), lowEnd = true, nowMs = 1000.0),
        )
        val stats = pixelStats(bitmap)
        save(bitmap, "render_smoke_calibration.png")
        assertThat(stats.nonTransparent).isGreaterThan(0.001)
    }

    @Test
    fun bombSpritesRenderEveryDefaultPreset() {
        val sprites = BombSprites()
        val bitmap = Bitmap.createBitmap(1000, 300, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        DEFAULT_BOMB_CONFIGS.forEachIndexed { i, config ->
            val sprite = sprites.get(config, 52.0)
            assertThat(sprites.get(config.copy(), 52.0)).isSameInstanceAs(sprite) // cached by value
            canvas.drawBitmap(sprite.bitmap, 20f + i * 245f, 20f, null)
        }
        canvas.drawBitmap(sprites.mortar(), 20f, 150f, null)
        save(bitmap, "render_smoke_bombs.png")
        assertThat(pixelStats(bitmap).nonTransparent).isGreaterThan(0.1)
    }

    private fun hand(side: String, x: Double, y: Double, speed: Double, marks: List<LandmarkPoint>? = null) = HandRender(
        side = side, x = x, y = y, speed = speed, vx = if (side == "left") 400.0 else -500.0, vy = -200.0,
        detected = true, isPredicted = false, gesture = HandGesture.OPEN_PALM, marks = marks,
        trail = List(12) { i -> TrailPoint(x - (12 - i) * 18.0, y + (12 - i) * 6.0, 1000L - (12 - i) * 16L, speed) },
    )

    /** A plausible open hand (raw, un-mirrored MediaPipe space) with the wrist below (cx, cy). */
    private fun handMarks(cx: Double, cy: Double): List<LandmarkPoint> {
        val pts = ArrayList<LandmarkPoint>(21)
        pts.add(LandmarkPoint(cx, cy + 0.14))
        val fingerBaseX = doubleArrayOf(-0.05, -0.025, 0.0, 0.025, 0.045)
        val fingerDx = doubleArrayOf(-0.03, -0.008, 0.0, 0.008, 0.02)
        for (f in 0 until 5) {
            val bx = cx + fingerBaseX[f]
            val by = if (f == 0) cy + 0.1 else cy + 0.02
            for (j in 0 until 4) {
                val step = if (f == 0) 0.035 else 0.045
                pts.add(LandmarkPoint(bx + fingerDx[f] * j, by - step * j))
            }
        }
        return pts
    }

    private class Stats(val nonTransparent: Double, val bright: Double)

    private fun pixelStats(bitmap: Bitmap): Stats {
        val px = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(px, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        var visible = 0
        var bright = 0
        for (c in px) {
            val a = c ushr 24
            if (a > 8) visible++
            if (a > 128 && ((c shr 16 and 0xFF) + (c shr 8 and 0xFF) + (c and 0xFF)) > 600) bright++
        }
        return Stats(visible.toDouble() / px.size, bright.toDouble() / px.size)
    }

    private fun save(bitmap: Bitmap, name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val dirs = listOfNotNull(
            InstrumentationRegistry.getArguments().getString("additionalTestOutputDir")?.let(::File),
            instrumentation.targetContext.getExternalFilesDir(Environment.DIRECTORY_PICTURES),
        )
        for (dir in dirs) {
            runCatching {
                dir.mkdirs()
                File(dir, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                Log.i("RenderSmokeTest", "saved ${File(dir, name).absolutePath}")
            }.onFailure { Log.w("RenderSmokeTest", "could not save to $dir", it) }
        }
    }
}
