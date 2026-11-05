package com.aayush.diwaliplay.branding

import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.api.GameApi
import com.aayush.diwaliplay.model.DiwaliJson
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SettingsResponse
import java.io.File
import java.io.FileOutputStream
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

/**
 * Native `useBranding`: keeps [state] in sync with the admin panel (settings, bombs, rewards),
 * persists the last good copy to [store] and prefetches every referenced asset into [cache].
 * Polls every [pollIntervalMs] (8 s, like the web) unless paused; resuming refreshes immediately.
 */
class SettingsRepository(
    private val api: GameApi,
    private val cache: AssetCache,
    private val store: File,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val pollIntervalMs: Long = POLL_INTERVAL_MS,
    private val maxParallelDownloads: Int = 3,
    /** Monotonic milliseconds, for spacing out asset revalidation. */
    private val nowMs: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    @Serializable
    private data class Persisted(
        val settings: SettingsResponse? = null,
        val bombs: ListBombsResponse? = null,
        val rewards: RewardsInfo? = null,
    )

    private val _state = MutableStateFlow(BrandingState())
    val state: StateFlow<BrandingState> = _state.asStateFlow()

    private val flightLock = Mutex()
    private var inFlight: Deferred<Unit>? = null
    private var pollJob: Job? = null
    @Volatile private var paused = false
    // Only data that really came from the server (or the disk copy) is written back as "last good".
    @Volatile private var settingsLoaded = false
    @Volatile private var bombsLoaded = false
    @Volatile private var rewardsLoaded = false

    /** What [store] holds, to skip writing the same again. Touched by one refresh at a time. */
    @Volatile private var persistedJson: String? = null

    /** When each URL in use was last fetched or revalidated. Refreshes never overlap, but they do change threads. */
    private val lastChecked = ConcurrentHashMap<String, Long>()

    init {
        loadFromDisk()
    }

    /** Starts the poll loop (idempotent): refresh now, then every [pollIntervalMs] unless paused. */
    fun start() {
        synchronized(this) {
            if (pollJob?.isActive == true) return
            pollJob = scope.launch {
                while (true) {
                    if (!paused) runCatchingRefresh()
                    delay(pollIntervalMs)
                }
            }
        }
    }

    /** Mirror of `setBrandingPollingPaused`: resuming triggers an immediate refresh. */
    fun setPollingPaused(paused: Boolean) {
        val changed = synchronized(this) {
            val c = this.paused != paused
            this.paused = paused
            c
        }
        if (changed && !paused) scope.launch { runCatchingRefresh() }
    }

    /** Mirror of `advanceWallpaper`. */
    fun advanceWallpaper() {
        _state.update { s ->
            val r = advanceRotation(s.settings.wallpaperUrl.orEmpty(), s.playlist, s.rotationIndex)
            s.copy(rotationIndex = r.index, currentWallpaperUrl = r.url)
        }
    }

    /**
     * Fetches settings, bombs and rewards, publishes whatever succeeded, persists it, then caches all
     * assets. Concurrent calls share one in-flight refresh, so refreshes never overlap.
     */
    suspend fun refreshNow() {
        val flight = flightLock.withLock {
            inFlight?.takeIf { it.isActive } ?: scope.async { guardedRefresh() }.also { inFlight = it }
        }
        flight.await()
    }

    private suspend fun runCatchingRefresh() {
        try {
            refreshNow()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // A failed refresh must never stop the poll loop.
        }
    }

    /** A failing refresh (throwing api, disk error, ...) keeps the last good state and must never cancel [scope]. */
    private suspend fun guardedRefresh() {
        try {
            doRefresh()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            _state.update { it.copy(isLoading = false) }
        }
    }

    private suspend fun doRefresh() {
        val (settings, bombs, rewards) = coroutineScope {
            val s = async { api.getSettings() }
            val b = async { api.getBombs() }
            val r = async { api.getRewards() }
            Triple(s.await(), b.await(), r.await())
        }
        val okSettings = (settings as? ApiResult.Success)?.value?.takeIf { it.success }
        val okBombs = (bombs as? ApiResult.Success)?.value?.takeIf { it.success }
        val okRewards = (rewards as? ApiResult.Success)?.value?.takeIf { it.success }

        if (okSettings != null) settingsLoaded = true
        if (okBombs != null) bombsLoaded = true
        if (okRewards != null) rewardsLoaded = true
        _state.update { s ->
            var n = s.copy(isLoading = false)
            if (okSettings != null) {
                val new = okSettings.settings.normalizedForBranding()
                val activeChanged = new.wallpaperUrl != s.settings.wallpaperUrl
                // Like the web, audio settings and tiers are only overwritten when the response carries them.
                val merged = new.copy(
                    audioSettings = new.audioSettings ?: s.settings.audioSettings,
                    achievementTiers = new.achievementTiers ?: s.settings.achievementTiers,
                )
                n = n.copy(settings = merged, playlist = okSettings.wallpaperPlaylist)
                if (activeChanged || n.currentWallpaperUrl.isEmpty()) {
                    val r = initialRotation(new.wallpaperUrl.orEmpty(), n.playlist)
                    n = n.copy(rotationIndex = r.index, currentWallpaperUrl = r.url)
                }
            }
            if (okBombs != null) n = n.copy(bombs = okBombs)
            if (okRewards != null) n = n.copy(rewards = okRewards)
            n
        }
        if (okSettings != null || okBombs != null || okRewards != null) {
            withContext(ioDispatcher) { persist() }
        }
        prefetch()
    }

    /**
     * The settings poll every 8 s, and the server reads and hashes each asset on every request, even for a 304. So a
     * URL is fetched the first time it's seen, then revalidated at most every [ASSET_REVALIDATE_MS]. A URL with no file
     * yet (its fetch failed) doesn't wait: without it the screen would go without the image.
     */
    private suspend fun prefetch() {
        val urls = collectAssetUrls(_state.value)
        lastChecked.keys.retainAll(urls.toSet()) // a URL that comes back counts as new
        val gate = Semaphore(maxParallelDownloads)
        val files = coroutineScope {
            urls.map { u -> async { gate.withPermit { u to fileFor(u) } } }.awaitAll()
        }
        val resolved = files.mapNotNull { (u, f) -> f?.let { u to it } }.toMap()
        _state.update { it.copy(localFiles = resolved) }
    }

    private suspend fun fileFor(url: String): File? {
        val checked = lastChecked[url]
        if (checked != null && nowMs() - checked < ASSET_REVALIDATE_MS) {
            withContext(ioDispatcher) { cache.peek(url) }?.let { return it }
        }
        return cache.get(url).also { lastChecked[url] = nowMs() }
    }

    private fun persist() {
        val s = _state.value
        val snapshot = Persisted(
            settings = SettingsResponse(success = true, settings = s.settings, wallpaperPlaylist = s.playlist).takeIf { settingsLoaded },
            bombs = s.bombs.takeIf { bombsLoaded },
            rewards = s.rewards.takeIf { rewardsLoaded },
        )
        val json = DiwaliJson.encodeToString(Persisted.serializer(), snapshot)
        if (json == persistedJson) return
        try {
            store.absoluteFile.parentFile?.mkdirs()
            val tmp = File(store.absolutePath + ".tmp")
            // Synced before the rename, or a power cut can leave the new name pointing at nothing.
            FileOutputStream(tmp).use { out ->
                out.write(json.toByteArray(Charsets.UTF_8))
                out.flush()
                out.fd.sync()
            }
            try {
                Files.move(tmp.toPath(), store.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(tmp.toPath(), store.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            persistedJson = json
        } catch (_: Exception) {
            // Persistence is best effort; the in-memory state is still correct.
        }
    }

    private fun loadFromDisk() {
        val saved = try {
            if (!store.isFile) return
            val json = store.readText()
            DiwaliJson.decodeFromString(Persisted.serializer(), json).also { persistedJson = json }
        } catch (_: Exception) {
            return
        }
        var n = BrandingState()
        saved.settings?.takeIf { it.success }?.let {
            val settings = it.settings.normalizedForBranding()
            val r = initialRotation(settings.wallpaperUrl.orEmpty(), it.wallpaperPlaylist)
            n = n.copy(settings = settings, playlist = it.wallpaperPlaylist, currentWallpaperUrl = r.url, isLoading = false)
            settingsLoaded = true
        }
        saved.bombs?.let { n = n.copy(bombs = it); bombsLoaded = true }
        saved.rewards?.let { n = n.copy(rewards = it); rewardsLoaded = true }
        val local = collectAssetUrls(n).mapNotNull { u -> cache.peek(u)?.let { u to it } }.toMap()
        _state.value = n.copy(localFiles = local)
    }

    companion object {
        const val POLL_INTERVAL_MS = 8_000L

        /** How often an asset already on disk is checked with the server. */
        const val ASSET_REVALIDATE_MS = 30 * 60_000L
    }
}
