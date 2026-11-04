package com.aayush.diwaliplay.api

import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.DiwaliJson
import java.io.File
import java.io.FileOutputStream
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
 *  - 2xx with an undecodable body counts as delivered (idempotent endpoint) -> delete file.
 *  - IOException reading a file or any unexpected exception -> keep, retry with backoff.
 *  - undecodable (corrupt) file -> renamed to `<name>.corrupt`, skipped.
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
        dir.listFiles { f -> f.isFile && f.name.endsWith(".tmp") }?.forEach { it.delete() }
        refreshPending()
    }

    fun enqueue(req: CompleteSessionRequest) {
        val name = "%013d_%06d_%s.json".format(System.currentTimeMillis(), seq.getAndIncrement(), UUID.randomUUID())
        val json = DiwaliJson.encodeToString(CompleteSessionRequest.serializer(), req)
        synchronized(lock) {
            dir.mkdirs()
            val tmp = File(dir, "$name.tmp")
            try {
                FileOutputStream(tmp).use { out ->
                    out.write(json.toByteArray(Charsets.UTF_8))
                    out.flush()
                    out.fd.sync()
                }
            } catch (e: Throwable) {
                tmp.delete()
                throw e
            }
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
            val outcome = try {
                processNext()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                Outcome.RETRY // unexpected failure (throwing api, storage error...): never kill the worker
            }
            when (outcome) {
                Outcome.PROGRESS -> backoffMs = INITIAL_BACKOFF_MS
                Outcome.IDLE -> wake.receive()
                Outcome.RETRY -> { delay(backoffMs); backoffMs = minOf(backoffMs * 2, MAX_BACKOFF_MS) }
            }
        }
    }

    private enum class Outcome { PROGRESS, IDLE, RETRY }

    private suspend fun processNext(): Outcome {
        val file = nextFile() ?: return Outcome.IDLE
        val req = try {
            DiwaliJson.decodeFromString(CompleteSessionRequest.serializer(), file.readText())
        } catch (_: SerializationException) {
            quarantine(file); return Outcome.PROGRESS
        } catch (_: IllegalArgumentException) {
            quarantine(file); return Outcome.PROGRESS
        } catch (_: IOException) {
            return Outcome.RETRY // transient storage error: keep the file
        }
        return when (val r = api.completeSession(req)) {
            is ApiResult.Success -> { remove(file); Outcome.PROGRESS }
            is ApiResult.HttpError ->
                if (isPermanent(r.code)) { remove(file); Outcome.PROGRESS } else Outcome.RETRY
            is ApiResult.NetworkError ->
                // 2xx with an undecodable body: the idempotent endpoint accepted it, so it is delivered.
                if (r.cause is UndecodableResponseException) { remove(file); Outcome.PROGRESS } else Outcome.RETRY
        }
    }

    /** Keeps an unreadable entry for inspection (`<name>.corrupt`) but out of the queue. */
    private fun quarantine(file: File) {
        synchronized(lock) {
            if (!file.renameTo(File(file.parentFile, file.name + ".corrupt"))) file.delete()
            refreshPending()
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
