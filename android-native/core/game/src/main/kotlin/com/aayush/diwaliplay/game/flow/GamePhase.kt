package com.aayush.diwaliplay.game.flow

import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.RewardItem

/**
 * Round phases, mirroring the web `GameState` (src/App.tsx) plus the GameOverModal / SpinWheelModal steps
 * the web shows inside GAME_OVER:
 *
 * | Native            | Web                                          |
 * |-------------------|----------------------------------------------|
 * | [Startup]         | KioskStartupScreen (no active code)          |
 * | [Calibrating]     | IDLE (`ready = false`) / READY (`ready = true`, 350 ms flash) |
 * | [Countdown]       | COUNTDOWN                                    |
 * | [Playing]         | PLAYING                                      |
 * | [PhotoCountdown]  | PHOTO_COUNTDOWN (PhotoCaptureModal)          |
 * | [GameOver]        | GAME_OVER card                               |
 * | [Spin]            | the card's Spin & Win wheel                  |
 * | [Feedback]        | the card's feedback buttons                  |
 */
sealed interface GamePhase {
    data object Startup : GamePhase

    /** Camera mode only. [ready] is the web READY flash after the 1 s two-hand hold (`isReady` on HandTargetBoxes). */
    data class Calibrating(val ready: Boolean) : GamePhase

    /** [step] is 3, 2, 1, then 0 for "GO!". */
    data class Countdown(val step: Int) : GamePhase

    data object Playing : GamePhase

    /**
     * [step] is 5..1, then 0 for "CLICK!" (photo requested). With [cameraError] the countdown is skipped:
     * step is 0 and the card follows after [PHOTO_CAMERA_ERROR_MS] with no photo, like PhotoCaptureModal.
     *
     * [waitingForCamera]: the countdown hasn't started, because the camera isn't ready yet (a touch round whose camera
     * only opens for the photo). See [GameController.onPhotoCameraReady]. [captured]: a still was actually taken, which
     * is what the flash and "PHOTO CAPTURED!" announce. See [GameController.onStillTaken].
     */
    data class PhotoCountdown(
        val step: Int,
        val cameraError: Boolean = false,
        val waitingForCamera: Boolean = false,
        val captured: Boolean = false,
    ) : GamePhase

    /** Greeting card. Leave with [GameController.onCardDone]. */
    data class GameOver(val card: RoundCard) : GamePhase

    /**
     * Spin wheel (rewards enabled; trial sessions included, as the web's test-mode wheel). Carries what
     * SpinWheelRequest needs: the current (server-updated) [sessionId], [playerName] and [mobileNumber].
     * [earnedReward] is the score prize, which on the web's single screen stays in view, and may arrive late.
     * Leave with [GameController.onSpinDone].
     */
    data class Spin(
        val sessionId: String,
        val playerName: String,
        val mobileNumber: String?,
        val earnedReward: EarnedReward? = null,
    ) : GamePhase

    /**
     * Feedback step; [reward] is what the wheel gave, if anything, and [earnedReward] the score prize.
     * Leave with [GameController.onFeedback].
     */
    data class Feedback(val reward: RewardItem?, val earnedReward: EarnedReward? = null) : GamePhase
}
