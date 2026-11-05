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
import java.util.concurrent.atomic.AtomicInteger
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

    /** The id the last `startSession` to run returned, in FIFO order: what later network effects of that round mean. */
    @Volatile private var startedSessionId: String? = null

    /**
     * The current round's id, for callers outside the FIFO. Cleared as soon as a round issues `startSession`, and only
     * that round's job may set it, so a previous round's id can't be read while this one's is still on its way.
     */
    @Volatile private var currentRoundSessionId: String? = null
    private val startGeneration = AtomicInteger(0)

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

    /** [id] with a stand-in replaced by the server's id. For network effects: the FIFO guarantees `startSession` has finished. */
    private fun serverId(id: String) = if (id.startsWith(GUEST_SESSION_PREFIX)) startedSessionId ?: id else id

    /** [id] with a stand-in replaced by this round's server id, if it has one yet; else [id] unchanged. Any thread. */
    fun currentServerId(id: String) = if (id.startsWith(GUEST_SESSION_PREFIX)) currentRoundSessionId ?: id else id

    override fun startSession(code: String) {
        val generation = startGeneration.incrementAndGet()
        currentRoundSessionId = null
        network.trySend {
            startedSessionId = null
            val r = api.startSession(code, KIOSK_ID)
            if (r is ApiResult.Success && r.value.success) {
                startedSessionId = r.value.session.id
                if (generation == startGeneration.get()) currentRoundSessionId = r.value.session.id
                controller().onSessionStarted(code, r.value.session.id)
            } else {
                Log.w(TAG, "startSession failed: $r")
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
            controller().onStillTaken(jpeg != null)
            delay(PHOTO_FLASH_MS)
            controller().onPhotoCaptured(jpeg)
        }
    }
}
