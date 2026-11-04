package com.aayush.diwaliplay.api

import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.DiwaliJson
import java.io.File
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/**
 * Durable, ordered, single-worker upload queue for finished sessions.
 *
 * Each request is one JSON file in [dir] (`<time>_<seq>_<uuid>.json`), written to a `.tmp` file
 * and atomically renamed, so a crash never leaves a half-written entry. A new instance picks up
 * whatever files are already there.
 *
 * Retry policy (the server's `/session/complete` is idempotent: re-completing an already
 * COMPLETED session returns 200 and overwrites, so duplicate delivery is harmless):
 *  - 2xx -> delete file.
 *  - 4xx other than 408/429 (bad request, session not found, an "already completed"-style 409,
 *    forbidden...) -> permanent: delete file, never retry.
 *  - network error, 5xx, 408, 429 -> keep file, retry with backoff 5 s doubling up to 5 min.
 *  - unreadable/corrupt file -> delete.
 */
class ResultQueue(
    private val dir: File,
    private val api: GameApi,
    private val scope: CoroutineScope,
) {
    private val seq = AtomicLong()
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private val lock = Any()
    private var worker: Job? = null
    private val _pending = MutableStateFlow(0)
    val pending: StateFlow<Int> = _pending.asStateFlow()

    init {
        dir.mkdirs()
        refreshPending()
    }

    fun enqueue(req: CompleteSessionRequest) {
        val name = "%013d_%06d_%s.json".format(System.currentTimeMillis(), seq.getAndIncrement(), UUID.randomUUID())
        val json = DiwaliJson.encodeToString(CompleteSessionRequest.serializer(), req)
        synchronized(lock) {
            dir.mkdirs()
            val tmp = File(dir, "$name.tmp")
            tmp.writeText(json)
            val target = File(dir, name)
            try {
                Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            refreshPending()
        }
        wake.trySend(Unit)
    }

    /** Starts the single worker. Idempotent. */
    fun start() {
        synchronized(lock) {
            if (worker?.isActive == true) return
            worker = scope.launch { runWorker() }
        }
    }

    private suspend fun runWorker() {
        var backoffMs = INITIAL_BACKOFF_MS
        while (true) {
            val file = nextFile()
            if (file == null) {
                wake.receive()
                continue
            }
            val req = try {
                DiwaliJson.decodeFromString(CompleteSessionRequest.serializer(), file.readText())
            } catch (e: CancellationException) {
                throw e
            } catch (_: SerializationException) {
                remove(file); continue
            } catch (_: IllegalArgumentException) {
                remove(file); continue
            } catch (_: IOException) {
                remove(file); continue
            }
            when (val r = api.completeSession(req)) {
                is ApiResult.Success -> { remove(file); backoffMs = INITIAL_BACKOFF_MS }
                is ApiResult.HttpError ->
                    if (isPermanent(r.code)) { remove(file); backoffMs = INITIAL_BACKOFF_MS }
                    else { delay(backoffMs); backoffMs = minOf(backoffMs * 2, MAX_BACKOFF_MS) }
                is ApiResult.NetworkError -> { delay(backoffMs); backoffMs = minOf(backoffMs * 2, MAX_BACKOFF_MS) }
            }
        }
    }

    private fun nextFile(): File? = synchronized(lock) {
        dir.listFiles { f -> f.isFile && f.name.endsWith(".json") }?.minByOrNull { it.name }
    }

    private fun remove(file: File) {
        synchronized(lock) {
            file.delete()
            refreshPending()
        }
    }

    private fun refreshPending() {
        _pending.value = dir.listFiles { f -> f.isFile && f.name.endsWith(".json") }?.size ?: 0
    }

    companion object {
        const val INITIAL_BACKOFF_MS = 5_000L
        const val MAX_BACKOFF_MS = 300_000L

        /** Client errors that retrying can never fix. 408 (timeout) and 429 (rate limit) are transient. */
        internal fun isPermanent(code: Int): Boolean = code in 400..499 && code != 408 && code != 429
    }
}
