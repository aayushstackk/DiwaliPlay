package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.game.flow.GamePhase

/** What sits behind the game surface. The two camera kinds differ in vignette strength (App.tsx). */
enum class BackdropKind { Dark, Wallpaper, CameraStrongVignette, CameraSoftVignette }

private fun GamePhase.isCalibratingOrCountdown() = this is GamePhase.Calibrating || this is GamePhase.Countdown

private fun GamePhase.isAfterPhoto() = this is GamePhase.GameOver || this is GamePhase.Spin || this is GamePhase.Feedback

/** App.tsx `isCameraPreviewVisible` / `isWallpaperVisible`; the wheel and feedback count as its GAME_OVER. */
fun backdropFor(phase: GamePhase, touch: Boolean, wallpaperEnabled: Boolean): BackdropKind {
    if (phase == GamePhase.Startup) return BackdropKind.Dark
    val camera = (!wallpaperEnabled && (phase == GamePhase.Playing || phase is GamePhase.Countdown || phase.isAfterPhoto())) ||
        (!touch && phase.isCalibratingOrCountdown())
    if (camera) {
        return if (phase.isCalibratingOrCountdown()) BackdropKind.CameraStrongVignette else BackdropKind.CameraSoftVignette
    }
    val wallpaper = wallpaperEnabled &&
        (phase == GamePhase.Playing || phase.isAfterPhoto() || phase is GamePhase.PhotoCountdown || (touch && phase is GamePhase.Countdown))
    return if (wallpaper) BackdropKind.Wallpaper else BackdropKind.Dark
}

/**
 * When the camera (and so MediaPipe) runs. It stays off until a code is accepted (spec §6). Camera mode tracks hands
 * up to the photo. Touch mode has no tracking, so with a wallpaper it starts only for the photo, whose countdown waits
 * for the camera's first frame (at most PHOTO_WATCHDOG_MS). A live-camera background keeps it on until reset.
 */
fun cameraWanted(phase: GamePhase, touch: Boolean, wallpaperEnabled: Boolean): Boolean {
    if (phase == GamePhase.Startup) return false
    if (!wallpaperEnabled && !phase.isCalibratingOrCountdown()) return true
    if (phase.isAfterPhoto()) return false
    return if (touch) !wallpaperEnabled || phase is GamePhase.PhotoCountdown else true
}

/** `setPollingPaused(true)` from the countdown until the round resets. */
fun pollingPausedIn(phase: GamePhase): Boolean = phase != GamePhase.Startup && phase !is GamePhase.Calibrating

/** The calibration screen's 1-second hold ring (App.tsx hold detection); the real trigger is HandTracker's. */
class CalibrationHold {
    private var startMs: Double? = null

    /** The progress in 0..1 at [nowMs]. */
    fun update(bothHandsInBoxes: Boolean, nowMs: Double): Double {
        if (!bothHandsInBoxes) {
            startMs = null
            return 0.0
        }
        val start = startMs ?: nowMs.also { startMs = it }
        return ((nowMs - start) / HOLD_MS).coerceAtMost(1.0)
    }

    private companion object {
        const val HOLD_MS = 1000.0
    }
}
