package com.aayush.diwaliplay.app

import android.util.Log
import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.api.GameApi
import com.aayush.diwaliplay.api.UndecodableResponseException
import com.aayush.diwaliplay.game.flow.GameController
import com.aayush.diwaliplay.game.flow.GameEffects
import com.aayush.diwaliplay.model.AbandonSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.GameFeedback
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "RoundEffects"

/** PhotoCaptureModal: the shutter flash and "CLICK!" stay up 450 ms before the photo moves on. */
internal const val PHOTO_FLASH_MS = 450L

/** The kiosk id the web kiosk sends with `startSession`. */
internal const val KIOSK_ID = "kiosk_main_65"

/** Stands in for the server's id until `startSession` returns (App.tsx `guest_…`). */
internal const val GUEST_SESSION_PREFIX = "guest_"

/**
 * [GameEffects] on one single-threaded [scope], whichever thread the controller called from.
 *
 * Network effects go through one FIFO worker on that same thread. The API suspends rather than blocks, so a slow
 * server (a cold start can take most of a minute) delays later network effects, keeping start → complete → feedback
 * in order, but never the sounds in between.
 */
internal class RoundEffects(
    private val api: GameApi,
    private val results: ResultSink,
    private val audio: GameAudio,
    private val tracking: TrackingSource,
    private val scope: CoroutineScope,
    private val background: CoroutineDispatcher,
    private val controller: () -> GameController,
) : GameEffects {
    private val network = Channel<suspend () -> Unit>(Channel.UNLIMITED)

    /** The id the last `startSession` returned. Only touched by the network worker. */
    private var startedSessionId: String? = null

    init {
        scope.launch {
            for (job in network) {
                try {
                    job()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.e(TAG, "network effect failed", e)
                }
            }
        }
    }

    /** Network effects already issued still run; the worker then ends. */
    fun close() {
        network.close()
    }

    /** An id issued before `startSession` returned can only be replaced once it has; the FIFO guarantees that. */
    private fun serverId(id: String) = if (id.startsWith(GUEST_SESSION_PREFIX)) startedSessionId ?: id else id

    override fun startSession(code: String) {
        network.trySend {
            startedSessionId = null
            when (val r = api.startSession(code, KIOSK_ID)) {
                is ApiResult.Success -> if (r.value.success) {
                    startedSessionId = r.value.session.id
                    controller().onSessionStarted(code, r.value.session.id)
                }
                else -> Log.w(TAG, "startSession failed: $r")
            }
        }
    }

    override fun completeSession(req: CompleteSessionRequest) {
        network.trySend {
            val sent = req.copy(sessionId = serverId(req.sessionId))
            when (val r = api.completeSession(sent)) {
                is ApiResult.Success -> controller().onRoundCompleted(req.sessionId, r.value.session.earnedReward)
                // The queue applies the retry policy: it drops what can never succeed.
                is ApiResult.HttpError -> enqueue(sent)
                is ApiResult.NetworkError ->
                    // A 2xx with an undecodable body: the idempotent endpoint took it.
                    if (r.cause !is UndecodableResponseException) enqueue(sent)
            }
        }
    }

    private suspend fun enqueue(req: CompleteSessionRequest) {
        withContext(background) {
            try {
                results.enqueue(req)
            } catch (e: Exception) {
                Log.e(TAG, "could not queue result for ${req.sessionId}", e)
            }
        }
    }

    override fun abandonSession(sessionId: String, reason: String) {
        network.trySend {
            val r = api.abandonSession(AbandonSessionRequest(serverId(sessionId), reason))
            if (r !is ApiResult.Success) Log.w(TAG, "abandonSession failed: $r")
        }
    }

    override fun submitFeedback(sessionId: String, feedback: GameFeedback) {
        network.trySend {
            val r = api.submitFeedback(serverId(sessionId), feedback)
            if (r !is ApiResult.Success) Log.w(TAG, "submitFeedback failed: $r")
        }
    }

    override fun playSound(key: String) {
        scope.launch { audio.playGameKey(key) }
    }

    override fun requestPhoto() {
        scope.launch {
            val jpeg = withContext(background) { tracking.captureStill() }
            delay(PHOTO_FLASH_MS)
            controller().onPhotoCaptured(jpeg)
        }
    }
}
