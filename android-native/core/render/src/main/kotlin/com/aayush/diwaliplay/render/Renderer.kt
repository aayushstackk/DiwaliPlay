package com.aayush.diwaliplay.render

import android.graphics.Canvas
import com.aayush.diwaliplay.game.bomb.BombSim
import com.aayush.diwaliplay.game.cracker.CrackerSim
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.model.HandRender

/** Draws one frame of gameplay effects onto a 1920x1080 logical canvas. Called on the render thread only. */
interface Renderer {
    fun draw(canvas: Canvas, frame: RenderFrame)
}

/**
 * Everything the renderer reads for one frame. The sims are read-only here.
 *
 * @param bombs null when the bomb mode is off (no bombs, effects, popups or mortar row are drawn).
 * @param hands hands from `HandTracker.renderHands()`, in 1920x1080 logical pixels.
 * @param phase [GamePhase.Playing] draws hand flames; any other phase draws skeleton guides and trails.
 * @param lowEnd low-end mode: no full-screen flash, 6 flame embers instead of 16.
 * @param nowMs the same clock the sims were stepped with (bomb effects, recoil and popups compare against it).
 */
data class RenderFrame(
    val sim: CrackerSim,
    val bombs: BombSim?,
    val hands: List<HandRender>,
    val phase: GamePhase,
    val lowEnd: Boolean,
    val nowMs: Double,
)

/** Logical render size (spec: 1920x1080 everywhere). */
const val LOGICAL_WIDTH = 1920
const val LOGICAL_HEIGHT = 1080
