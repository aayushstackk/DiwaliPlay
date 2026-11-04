package com.aayush.diwaliplay.render

import android.graphics.Canvas
import android.graphics.PorterDuff
import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.flow.GamePhase
import kotlin.random.Random

/**
 * Canvas implementation of [Renderer], layered like the web page:
 * 1. cracker canvas (z-10): flash, rings, sparks (crackerEngine.render), then hand visuals —
 *    flames during [GamePhase.Playing], skeleton guides + trails otherwise (useHandTracking processFrame);
 * 2. bomb overlay (z-20): bombs, effects canvas, mortar row.
 *
 * The frame is cleared to transparent first; the surface sits over the camera/wallpaper layer.
 * Not thread-safe: one instance per render thread.
 */
class CanvasRenderer(
    sprites: BombSprites = BombSprites(),
    random: Random = Random.Default,
) : Renderer {

    private val flickerRandom = object : GameRandom {
        override fun nextDouble(): Double = random.nextDouble()
    }
    private val cracker = CrackerRenderer(flickerRandom)
    private val flames = FlameRenderer(random)
    private val skeletons = SkeletonRenderer()
    private val bombs = BombRenderer(sprites)

    override fun draw(canvas: Canvas, frame: RenderFrame) {
        canvas.drawColor(0, PorterDuff.Mode.CLEAR)

        cracker.draw(canvas, frame.sim, frame.lowEnd)

        val hands = frame.hands
        if (frame.phase == GamePhase.Playing) {
            for (i in hands.indices) {
                val h = hands[i]
                if (h.detected && h.x > 0) {
                    flames.draw(canvas, h.x, h.y, h.side == "left", h.speed, h.vx, h.vy, frame.nowMs, frame.lowEnd)
                }
            }
        } else {
            flames.reset()
            for (i in hands.indices) skeletons.drawTrail(canvas, hands[i].trail, hands[i].side == "left")
            for (i in hands.indices) {
                val h = hands[i]
                val marks = h.marks
                if (h.detected && marks != null && marks.isNotEmpty()) {
                    skeletons.drawSkeleton(canvas, marks, h.side == "left", h.speed, h.isPredicted)
                }
            }
        }

        frame.bombs?.let { bombs.draw(canvas, it, frame.nowMs) }
    }
}
