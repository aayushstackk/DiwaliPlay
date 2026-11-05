package com.aayush.diwaliplay.game.flow

/**
 * Round phases, mirroring the web `GameState` (src/App.tsx):
 *
 * | Native            | Web                                          |
 * |-------------------|----------------------------------------------|
 * | [Startup]         | KioskStartupScreen (no active code)          |
 * | [Calibrating]     | IDLE (`ready = false`) / READY (`ready = true`, 350 ms flash) |
 * | [Countdown]       | COUNTDOWN                                    |
 * | [Playing]         | PLAYING                                      |
 * | [PhotoCountdown]  | PHOTO_COUNTDOWN (PhotoCaptureModal)          |
 * | [GameOver]        | GAME_OVER (card, wheel and feedback together) |
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

    /**
     * The one end-of-round screen: card, wish, wheel (rewards enabled; trial sessions included, as the web's test-mode
     * wheel) and feedback together. [sessionId] and [mobileNumber] are what SpinWheelRequest needs; the id follows the
     * server's (a slow `startSession` can answer with this screen up), and the score prize joins [card] when it arrives.
     * Leave with [GameController.onPlayAgain] or [GameController.onExit].
     */
    data class GameOver(val card: RoundCard, val sessionId: String, val mobileNumber: String?) : GamePhase
}
