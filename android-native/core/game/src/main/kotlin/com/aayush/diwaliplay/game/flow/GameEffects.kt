package com.aayush.diwaliplay.game.flow

import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.GameFeedback

/**
 * Side effects requested by [GameController]. Calls are made outside the controller's lock, on whichever
 * thread drove the transition (the render thread for timed ones, e.g. [playSound], [startSession],
 * [requestPhoto]), so implementations must not block: post network and audio work to their own executor.
 * Implementations may call back into the controller (e.g. [GameController.onSessionStarted]).
 *
 * Ordering: the caller (Task 18's implementation) must run every effect on one single-threaded executor, so
 * calls execute in the order the controller issued them (startSession before completeSession before
 * submitFeedback, countdown sounds in sequence), whichever thread issued them.
 */
interface GameEffects {
    /** `POST /api/session/start`; report the returned id with [GameController.onSessionStarted] (same code). */
    fun startSession(code: String)

    /**
     * Report the response's `session.earnedReward` with [GameController.onRoundCompleted] (req.sessionId), then, however it
     * went, [GameController.onCompletionAnswered] once it has an answer or the failure is safely queued.
     */
    fun completeSession(req: CompleteSessionRequest)

    fun abandonSession(sessionId: String, reason: String)

    /** [key] is one of [FlowSoundKeys] or a pass-through PlayDirector key (`PlaySoundKeys`). */
    fun playSound(key: String)

    /**
     * Capture a mirrored still. Say whether one was taken with [GameController.onStillTaken], then deliver it (or null)
     * with [GameController.onPhotoCaptured] once the UI's 450 ms flash is over (PhotoCaptureModal triggerCaptureSequence).
     */
    fun requestPhoto()

    fun submitFeedback(sessionId: String, feedback: GameFeedback)
}

/** Sound identifiers the controller passes to [GameEffects.playSound]; Task 16 resolves them. */
object FlowSoundKeys {
    /** soundEngine.playCountdownStep(3 | 2 | 1 | 'GO'). */
    const val COUNTDOWN_3 = "countdown_3"
    const val COUNTDOWN_2 = "countdown_2"
    const val COUNTDOWN_1 = "countdown_1"
    const val COUNTDOWN_GO = "countdown_go"

    /** SfxKey 'photo_shutter' (handlePlayCapture). */
    const val PHOTO_SHUTTER = "photo_shutter"

    /** SfxKey 'game_over' (handlePhotoCaptured). */
    const val GAME_OVER = "game_over"

    private const val BOMB_PREFIX = "bomb_burst:"

    /**
     * soundEngine.playBombBurstSound(bomb): the key names the bomb config; the effects side looks the config
     * up in the round's bomb list to get its `soundUrl` / `soundPreset`.
     */
    fun bombBurst(config: BombConfig): String = BOMB_PREFIX + config.id

    /** The bomb config id inside a [bombBurst] key, or null for any other key. */
    fun bombConfigId(key: String): String? = if (key.startsWith(BOMB_PREFIX)) key.substring(BOMB_PREFIX.length) else null
}
