package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import com.aayush.diwaliplay.game.PlayerAchievement
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.game.flow.RoundCard
import com.aayush.diwaliplay.model.GameScoreState
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RoundPolicyTest {
    private val countdown = GamePhase.Countdown(3)
    private val calibrating = GamePhase.Calibrating(false)
    private val photo = GamePhase.PhotoCountdown(5)
    private val gameOver = GamePhase.GameOver(
        RoundCard(
            "Asha", GameScoreState(), PlayerAchievement("*", "T", "S"), FormattedPersonalizedWish("H", listOf("L"), "S"), null, null, null,
        ),
        "s", null,
    )

    @Test
    fun cameraModeWithWallpaperShowsCameraThenWallpaper() {
        assertThat(backdropFor(GamePhase.Startup, touch = false, wallpaperEnabled = true)).isEqualTo(BackdropKind.StartBackground)
        assertThat(backdropFor(calibrating, false, true)).isEqualTo(BackdropKind.CameraStrongVignette)
        assertThat(backdropFor(countdown, false, true)).isEqualTo(BackdropKind.CameraStrongVignette)
        assertThat(backdropFor(GamePhase.Playing, false, true)).isEqualTo(BackdropKind.Wallpaper)
        assertThat(backdropFor(photo, false, true)).isEqualTo(BackdropKind.Wallpaper)
        assertThat(backdropFor(gameOver, false, true)).isEqualTo(BackdropKind.Wallpaper)
    }

    @Test
    fun liveCameraBackgroundWhenWallpaperIsOff() {
        assertThat(backdropFor(GamePhase.Playing, false, false)).isEqualTo(BackdropKind.CameraSoftVignette)
        assertThat(backdropFor(GamePhase.Playing, true, false)).isEqualTo(BackdropKind.CameraSoftVignette)
        assertThat(backdropFor(countdown, true, false)).isEqualTo(BackdropKind.CameraStrongVignette)
        assertThat(backdropFor(gameOver, false, false)).isEqualTo(BackdropKind.CameraSoftVignette)
    }

    @Test
    fun touchModeWithWallpaperNeverShowsCamera() {
        assertThat(backdropFor(countdown, true, true)).isEqualTo(BackdropKind.Wallpaper)
        assertThat(backdropFor(GamePhase.Playing, true, true)).isEqualTo(BackdropKind.Wallpaper)
    }

    @Test
    fun cameraRuns() {
        assertThat(cameraWanted(GamePhase.Startup, touch = false, wallpaperEnabled = true)).isFalse()
        assertThat(cameraWanted(calibrating, false, true)).isTrue()
        assertThat(cameraWanted(GamePhase.Playing, false, true)).isTrue()
        assertThat(cameraWanted(photo, false, true)).isTrue()
        assertThat(cameraWanted(gameOver, false, true)).isFalse()
        assertThat(cameraWanted(gameOver, false, false)).isTrue()
        assertThat(cameraWanted(countdown, true, true)).isFalse()
        assertThat(cameraWanted(GamePhase.Playing, true, true)).isFalse()
        assertThat(cameraWanted(photo, true, true)).isTrue()
        assertThat(cameraWanted(GamePhase.Playing, true, false)).isTrue()
    }

    @Test
    fun pollingPausesFromCountdownUntilReset() {
        assertThat(pollingPausedIn(GamePhase.Startup)).isFalse()
        assertThat(pollingPausedIn(calibrating)).isFalse()
        assertThat(pollingPausedIn(countdown)).isTrue()
        assertThat(pollingPausedIn(GamePhase.Playing)).isTrue()
        assertThat(pollingPausedIn(photo)).isTrue()
        assertThat(pollingPausedIn(gameOver)).isTrue()
    }

    @Test
    fun calibrationHoldFillsOverOneSecondAndResetsWhenHandsLeave() {
        val hold = CalibrationHold()
        assertThat(hold.update(false, 0.0)).isEqualTo(0.0)
        assertThat(hold.update(true, 100.0)).isEqualTo(0.0)
        assertThat(hold.update(true, 600.0)).isWithin(1e-9).of(0.5)
        assertThat(hold.update(true, 1_500.0)).isEqualTo(1.0)
        assertThat(hold.update(false, 1_550.0)).isEqualTo(0.0)
    }
}
