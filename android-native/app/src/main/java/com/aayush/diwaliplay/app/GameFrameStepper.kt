package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.game.flow.GameController
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.BombGameSettings
import com.aayush.diwaliplay.render.RenderFrame
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.min

/**
 * The controller's time source. During a frame on the render thread it is the frame's `nowMs`, so the controller and
 * sims step on exactly the time the render loop passed. Everywhere else (a touch-mode countdown started from the UI
 * thread) it is the same clock read directly: the frame time is `Choreographer`'s, which is `System.nanoTime`.
 */
class RoundClock(private val systemNowMs: () -> Double = { System.nanoTime() / 1e6 }) {
    @Volatile private var frameThread: Thread? = null
    @Volatile private var frameNowMs = 0.0

    fun now(): Double = if (Thread.currentThread() === frameThread) frameNowMs else systemNowMs()

    fun beginFrame(nowMs: Double) {
        frameNowMs = nowMs
        frameThread = Thread.currentThread()
    }

    fun endFrame() {
        frameThread = null
    }
}

/** Builds a round's bomb sprites ahead of its first launch. Render thread only. */
fun interface SpriteWarmer {
    fun warm(configs: List<BombConfig>, settings: BombGameSettings)
}

/**
 * The render thread's one frame of game: read tracking, step the controller, say what to draw.
 *
 * Runs while RenderLoop holds its frame lock, and the main thread can wait on that lock (`GameSurfaceView.stop()`,
 * `surfaceDestroyed`), so nothing here may wait for the main thread. Effects only post to their executor.
 */
class GameFrameStepper(
    private val controller: GameController,
    private val tracking: TrackingSource,
    private val clock: RoundClock,
) {
    private class PendingRound(val configs: List<BombConfig>, val settings: BombGameSettings)

    private val pendingRound = AtomicReference<PendingRound?>(null)
    private var lowEndApplied = false

    /** Set by the surface's owner. */
    @Volatile var spriteWarmer: SpriteWarmer? = null

    /** `GameSurfaceView.lowEnd`, sticky for the session. */
    @Volatile var lowEndSource: () -> Boolean = { false }

    /** Lets go of the surface's [spriteWarmer] and [lowEndSource], which hold on to the view. */
    fun detachSurface() {
        spriteWarmer = null
        lowEndSource = { false }
    }

    /** Any thread; the sprites are built on the next frame. */
    fun prepareRound(configs: List<BombConfig>, settings: BombGameSettings) {
        pendingRound.set(PendingRound(configs, settings))
    }

    fun step(dtSeconds: Double, nowMs: Double): RenderFrame {
        clock.beginFrame(nowMs)
        try {
            pendingRound.getAndSet(null)?.let { spriteWarmer?.warm(it.configs, it.settings) }

            val lowEnd = lowEndSource()
            if (lowEnd && !lowEndApplied) {
                lowEndApplied = true
                controller.crackers.setLowEndMode(true)
            }

            val snap = tracking.snapshot()
            controller.onFrame(min(dtSeconds, MAX_DT_SECONDS), snap.hands.left, snap.hands.right, snap.calibrated)
            return RenderFrame(controller.crackers, controller.bombs, snap.render, controller.phase.value, lowEnd, nowMs)
        } finally {
            clock.endFrame()
        }
    }

    private companion object {
        /** Spec §5: dt clamped to 50 ms. */
        const val MAX_DT_SECONDS = 0.05
    }
}
