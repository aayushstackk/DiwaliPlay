package com.aayush.diwaliplay.branding

import java.io.File
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/**
 * Disk cache for admin-uploaded assets in [dir] (app-private). Files are named
 * `<sha256(resolved url)><original extension>` with a `.meta` sidecar holding ETag/Last-Modified.
 * [get] revalidates with conditional requests and always falls back to the last good copy.
 * `data:` URLs are decoded to a file instead of fetched. URLs starting with `/` resolve against [baseUrl].
 */
class AssetCache(
    private val dir: File,
    client: OkHttpClient,
    private val baseUrl: () -> String = { "" },
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val http: OkHttpClient = client.newBuilder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(120, TimeUnit.SECONDS)
        .build()
    private val locks = ConcurrentHashMap<String, Mutex>()

    @Serializable
    private data class Meta(val etag: String? = null, val lastModified: String? = null)

    /** Cached file for [url] without touching the network, or null when never cached. */
    fun peek(url: String): File? {
        val resolved = resolve(url) ?: return null
        return fileFor(resolved).takeIf { it.isFile }
    }

    /**
     * Local file for [url] (downloaded or revalidated), the last good copy if that fails, else null.
     * [callTimeoutMs] replaces the usual limit on the whole transfer, for a file too big to arrive within it on a slow link.
     */
    suspend fun get(url: String, callTimeoutMs: Long? = null): File? {
        val resolved = resolve(url) ?: return null
        val target = fileFor(resolved)
        return locks.getOrPut(target.name) { Mutex() }.withLock {
            withContext(ioDispatcher) {
                try {
                    if (isData(resolved)) target.takeIf { it.isFile } ?: writeDataUrl(resolved, target)
                    else fetch(resolved, target, callTimeoutMs)
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    target.takeIf { it.isFile }
                }
            }
        }
    }

    private fun isData(url: String) = url.startsWith("data:", ignoreCase = true)

    private fun resolve(url: String): String? {
        val u = url.trim()
        return when {
            u.isEmpty() -> null
            isData(u) || u.startsWith("http://", true) || u.startsWith("https://", true) -> u
            u.startsWith("/") -> baseUrl().trimEnd('/') + u
            else -> null
        }
    }

    private fun fileFor(resolved: String): File {
        val ext = if (isData(resolved)) dataExtension(resolved) else urlExtension(resolved)
        return File(dir, sha256(resolved) + ext)
    }

    private fun metaFor(target: File) = File(dir, target.name + ".meta")

    private suspend fun fetch(resolved: String, target: File, callTimeoutMs: Long?): File? {
        dir.mkdirs()
        val existing = target.takeIf { it.isFile }
        val meta = if (existing != null) readMeta(target) else Meta()
        val req = Request.Builder().url(resolved).apply {
            meta.etag?.let { header("If-None-Match", it) }
            meta.lastModified?.let { header("If-Modified-Since", it) }
        }.build()
        val call = http.newCall(req)
        callTimeoutMs?.let { call.timeout().timeout(it, TimeUnit.MILLISECONDS) }
        return coroutineScope {
            // Reading the body blocks, so cancelling the coroutine alone wouldn't stop it. This closes the socket under it.
            val canceller = launch(start = CoroutineStart.UNDISPATCHED) {
                try {
                    awaitCancellation()
                } finally {
                    call.cancel()
                }
            }
            try {
                store(call.await(), target, existing)
            } finally {
                canceller.cancel()
            }
        }
    }

    private fun store(response: Response, target: File, existing: File?): File? {
        response.use { r ->
            return when {
                r.code == 304 && existing != null -> existing
                r.isSuccessful -> {
                    val body = r.body ?: return existing
                    val tmp = File(dir, target.name + ".tmp")
                    try {
                        tmp.outputStream().use { out -> body.byteStream().copyTo(out) }
                        if (tmp.length() == 0L) return existing // an empty asset is never valid; keep the good copy
                        moveAtomically(tmp, target)
                    } finally {
                        tmp.delete()
                    }
                    writeMeta(target, Meta(r.header("ETag"), r.header("Last-Modified")))
                    target
                }
                else -> existing
            }
        }
    }

    private fun writeDataUrl(dataUrl: String, target: File): File? {
        val bytes = decodeDataUrl(dataUrl) ?: return null
        dir.mkdirs()
        val tmp = File(dir, target.name + ".tmp")
        try {
            tmp.writeBytes(bytes)
            moveAtomically(tmp, target)
        } finally {
            tmp.delete()
        }
        return target
    }

    private fun readMeta(target: File): Meta = try {
        Json.decodeFromString(Meta.serializer(), metaFor(target).readText())
    } catch (_: Exception) {
        Meta()
    }

    private fun writeMeta(target: File, meta: Meta) {
        val m = metaFor(target)
        if (meta.etag == null && meta.lastModified == null) { m.delete(); return }
        val tmp = File(dir, m.name + ".tmp")
        try {
            tmp.writeText(Json.encodeToString(Meta.serializer(), meta))
            moveAtomically(tmp, m)
        } finally {
            tmp.delete()
        }
    }

    private companion object {
        fun sha256(s: String): String =
            MessageDigest.getInstance("SHA-256").digest(s.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { "%02x".format(it) }

        fun urlExtension(url: String): String {
            val path = url.substringBefore('#').substringBefore('?').substringAfter("://").substringAfter('/', "")
            val name = path.substringAfterLast('/')
            val ext = name.substringAfterLast('.', "")
            return if (ext.isNotEmpty() && ext.length <= 5 && ext.all { it.isLetterOrDigit() }) "." + ext.lowercase() else ""
        }

        fun dataExtension(dataUrl: String): String {
            val mime = dataUrl.substring(5, dataUrl.indexOf(',').let { if (it < 0) dataUrl.length else it })
                .substringBefore(';').trim().lowercase()
            return when (mime) {
                "image/svg+xml" -> ".svg"
                "image/png" -> ".png"
                "image/jpeg", "image/jpg" -> ".jpg"
                "image/gif" -> ".gif"
                "image/webp" -> ".webp"
                "audio/mpeg", "audio/mp3" -> ".mp3"
                "audio/wav", "audio/x-wav", "audio/wave" -> ".wav"
                "audio/ogg" -> ".ogg"
                "audio/mp4", "audio/aac", "audio/x-m4a" -> ".m4a"
                "audio/webm" -> ".webm"
                else -> ".bin"
            }
        }

        /** Handles `;base64` and RFC 3986 percent-encoded payloads (a literal `+` stays `+`). */
        fun decodeDataUrl(dataUrl: String): ByteArray? {
            val comma = dataUrl.indexOf(',')
            if (comma < 0) return null
            val header = dataUrl.substring(5, comma)
            val payload = dataUrl.substring(comma + 1)
            val isBase64 = header.split(';').any { it.trim().equals("base64", ignoreCase = true) }
            return try {
                if (isBase64) Base64.getMimeDecoder().decode(percentDecode(payload))
                else percentDecode(payload)
            } catch (_: IllegalArgumentException) {
                null
            }
        }

        fun percentDecode(s: String): ByteArray {
            val src = s.toByteArray(StandardCharsets.UTF_8)
            val out = java.io.ByteArrayOutputStream(src.size)
            var i = 0
            while (i < src.size) {
                val b = src[i].toInt()
                if (b == '%'.code && i + 2 < src.size && hex(src[i + 1]) >= 0 && hex(src[i + 2]) >= 0) {
                    out.write(hex(src[i + 1]) * 16 + hex(src[i + 2])); i += 3
                } else {
                    out.write(b); i++
                }
            }
            return out.toByteArray()
        }

        fun hex(b: Byte): Int = Character.digit(b.toInt().toChar(), 16)

        fun moveAtomically(from: File, to: File) {
            try {
                Files.move(from.toPath(), to.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                Files.move(from.toPath(), to.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        }
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) { if (cont.isActive) cont.resumeWithException(e) }
        override fun onResponse(call: Call, response: Response) {
            if (cont.isActive) cont.resume(response) else response.close()
        }
    })
}
