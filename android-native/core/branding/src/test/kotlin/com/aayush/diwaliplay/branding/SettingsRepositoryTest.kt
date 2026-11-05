package com.aayush.diwaliplay.branding

import com.aayush.diwaliplay.api.AbandonSessionResponse
import com.aayush.diwaliplay.api.ApiResult
import com.aayush.diwaliplay.api.GameApi
import com.aayush.diwaliplay.model.AbandonSessionRequest
import com.aayush.diwaliplay.model.BackgroundMusicConfig
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.CompleteSessionResponse
import com.aayush.diwaliplay.model.ComboAudioConfig
import com.aayush.diwaliplay.model.CountdownAudioConfig
import com.aayush.diwaliplay.model.CountdownCustomUrls
import com.aayush.diwaliplay.model.AchievementTier
import com.aayush.diwaliplay.model.DEFAULT_BOMB_CONFIGS
import com.aayush.diwaliplay.model.DEFAULT_BOMB_SETTINGS
import com.aayush.diwaliplay.model.DiwaliJson
import com.aayush.diwaliplay.model.GameAudioSettings
import com.aayush.diwaliplay.model.GameFeedback
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.RewardItem
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SettingsResponse
import com.aayush.diwaliplay.model.SoundEffectConfig
import com.aayush.diwaliplay.model.SpinWheelRequest
import com.aayush.diwaliplay.model.SpinWheelResponse
import com.aayush.diwaliplay.model.StartSessionResponse
import com.aayush.diwaliplay.model.SubmitFeedbackResponse
import com.aayush.diwaliplay.model.SystemSettings
import com.aayush.diwaliplay.model.VerifyCodeResponse
import com.aayush.diwaliplay.model.WallpaperItem
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.isActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

private fun fixture(name: String): String =
    SettingsRepositoryTest::class.java.classLoader!!.getResource("api/$name")!!.readText()

private class FakeApi : GameApi {
    var settings: ApiResult<SettingsResponse> =
        ApiResult.Success(DiwaliJson.decodeFromString(SettingsResponse.serializer(), fixture("settings.json")))
    var bombs: ApiResult<ListBombsResponse> =
        ApiResult.Success(DiwaliJson.decodeFromString(ListBombsResponse.serializer(), fixture("bombs.json")))
    var rewards: ApiResult<RewardsInfo> =
        ApiResult.Success(DiwaliJson.decodeFromString(RewardsInfo.serializer(), fixture("rewards.json")))
    var settingsCalls = 0
    var bombsCalls = 0
    var rewardsCalls = 0
    var settingsDelayMs = 0L
    var throwOnSettingsCalls = 0

    override suspend fun getSettings(): ApiResult<SettingsResponse> {
        settingsCalls++
        if (settingsCalls <= throwOnSettingsCalls) throw IllegalStateException("api blew up")
        if (settingsDelayMs > 0) delay(settingsDelayMs)
        return settings
    }
    override suspend fun getBombs(): ApiResult<ListBombsResponse> { bombsCalls++; return bombs }
    override suspend fun getRewards(): ApiResult<RewardsInfo> { rewardsCalls++; return rewards }
    override suspend fun verifyCode(code: String): ApiResult<VerifyCodeResponse> = TODO()
    override suspend fun startSession(code: String, kioskId: String?): ApiResult<StartSessionResponse> = TODO()
    override suspend fun completeSession(req: CompleteSessionRequest): ApiResult<CompleteSessionResponse> = TODO()
    override suspend fun abandonSession(req: AbandonSessionRequest): ApiResult<AbandonSessionResponse> = TODO()
    override suspend fun submitFeedback(sessionId: String, feedback: GameFeedback): ApiResult<SubmitFeedbackResponse> = TODO()
    override suspend fun spin(req: SpinWheelRequest): ApiResult<SpinWheelResponse> = TODO()
}

private fun settingsOf(s: SystemSettings, playlist: List<WallpaperItem> = emptyList()) =
    ApiResult.Success(SettingsResponse(success = true, settings = s, wallpaperPlaylist = playlist))

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsRepositoryTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun TestScope.repo(api: GameApi, store: File = File(tmp.root, "branding.json")): SettingsRepository {
        val io = StandardTestDispatcher(testScheduler) // keeps disk work on virtual time
        return SettingsRepository(
            api = api,
            cache = AssetCache(File(tmp.root, "assets").also { it.mkdirs() }, OkHttpClient(), ioDispatcher = io),
            store = store,
            scope = backgroundScope,
            ioDispatcher = io,
        )
    }

    @Test fun defaultsBeforeAnyLoad() = runTest {
        val s = repo(FakeApi()).state.value
        assertThat(s.settings.brandName).isEqualTo("ItsSpotlight")
        assertThat(s.settings.experienceTitle).isEqualTo("DIWALI FUN PLAY")
        assertThat(s.settings.gameDurationSeconds).isEqualTo(35)
        assertThat(s.isLoading).isTrue()
        assertThat(s.playlist).isEmpty()
        assertThat(s.localFiles).isEmpty()
    }

    @Test fun loadsLastGoodSettingsFromDiskWhenOffline() = runTest {
        val api = FakeApi()
        val fixtureSettings = (api.settings as ApiResult.Success).value.settings
        api.settings = settingsOf(fixtureSettings.copy(brandName = "Acme", gameDurationSeconds = 50), listOf(WallpaperItem("w1", "http://x/w1.png")))
        val store = File(tmp.root, "branding.json")
        repo(api, store).refreshNow()
        assertThat(store.exists()).isTrue()
        assertThat(tmp.root.list()!!.filter { it.endsWith(".tmp") }).isEmpty()

        val offline = FakeApi().apply {
            settings = ApiResult.NetworkError(java.io.IOException("offline"))
            bombs = ApiResult.NetworkError(java.io.IOException("offline"))
            rewards = ApiResult.NetworkError(java.io.IOException("offline"))
        }
        val cold = repo(offline, store)
        assertThat(cold.state.value.settings.brandName).isEqualTo("Acme")
        assertThat(cold.state.value.settings.gameDurationSeconds).isEqualTo(50)
        assertThat(cold.state.value.playlist.map { it.id }).containsExactly("w1")
        assertThat(cold.state.value.bombs.bombs).isNotEmpty()
        assertThat(cold.state.value.rewards.rewards).isNotEmpty()
        cold.refreshNow()
        assertThat(cold.state.value.settings.brandName).isEqualTo("Acme")
        assertThat(cold.state.value.isLoading).isFalse()
    }

    @Test fun corruptStoreFallsBackToDefaults() = runTest {
        val store = File(tmp.root, "branding.json").also { it.writeText("{not json") }
        assertThat(repo(FakeApi(), store).state.value.settings.brandName).isEqualTo("ItsSpotlight")
    }

    @Test fun failedRefreshKeepsLastGoodState() = runTest {
        val api = FakeApi()
        val r = repo(api)
        r.refreshNow()
        val before = r.state.value
        api.settings = ApiResult.HttpError(500, "x")
        api.bombs = ApiResult.NetworkError(java.io.IOException())
        api.rewards = ApiResult.HttpError(503, "")
        r.refreshNow()
        assertThat(r.state.value.settings).isEqualTo(before.settings)
        assertThat(r.state.value.bombs).isEqualTo(before.bombs)
        assertThat(r.state.value.rewards).isEqualTo(before.rewards)
    }

    @Test fun mapsSettingsWithWebFallbacks() = runTest {
        val api = FakeApi()
        api.settings = settingsOf(
            SystemSettings(
                brandName = "", experienceTitle = "", brandingDisplayMode = "weird", gameplayMode = "touch",
                logoWidth = 0.0, logoHeight = 0.0, targetScore = 0, gameDurationSeconds = 0, connectorText = "",
                brandLogoUrl = null, wallpaperUrl = null,
            ),
        )
        val r = repo(api)
        r.refreshNow()
        val s = r.state.value.settings
        assertThat(s.brandName).isEqualTo("ItsSpotlight")
        assertThat(s.experienceTitle).isEqualTo("DIWALI FUN PLAY")
        assertThat(s.brandingDisplayMode).isEqualTo("both")
        assertThat(s.gameplayMode).isEqualTo("touch")
        assertThat(s.logoWidth).isEqualTo(160.0)
        assertThat(s.logoHeight).isEqualTo(48.0)
        assertThat(s.targetScore).isEqualTo(5000)
        assertThat(s.gameDurationSeconds).isEqualTo(35)
        assertThat(s.connectorText).isEqualTo("")
        assertThat(s.brandLogoUrl).isEqualTo("")
        assertThat(s.wallpaperUrl).isEqualTo("")
    }

    @Test fun pausedPollingMakesNoRequests() = runTest {
        val api = FakeApi()
        val r = repo(api)
        r.setPollingPaused(true)
        r.start()
        advanceTimeBy(60_000)
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(0)
        assertThat(api.bombsCalls).isEqualTo(0)
        assertThat(api.rewardsCalls).isEqualTo(0)
    }

    @Test fun resumeTriggersImmediateRefresh() = runTest {
        val api = FakeApi()
        val r = repo(api)
        r.setPollingPaused(true)
        r.start()
        advanceTimeBy(20_000)
        assertThat(api.settingsCalls).isEqualTo(0)
        r.setPollingPaused(false)
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(1)
        // Setting the same value again is a no-op.
        r.setPollingPaused(false)
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(1)
    }

    @Test fun pollsEvery8Seconds() = runTest {
        val api = FakeApi()
        val r = repo(api)
        r.start()
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(1)
        advanceTimeBy(7_999)
        assertThat(api.settingsCalls).isEqualTo(1)
        advanceTimeBy(1)
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(2)
        advanceTimeBy(8_000)
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(3)
        assertThat(api.bombsCalls).isEqualTo(3)
        assertThat(api.rewardsCalls).isEqualTo(3)
        r.start() // idempotent
        advanceTimeBy(8_000)
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(4)
    }

    @Test fun refreshNowCallsDoNotOverlap() = runTest {
        val api = FakeApi().apply { settingsDelayMs = 1_000 }
        val r = repo(api)
        val a = async { r.refreshNow() }
        val b = async { r.refreshNow() }
        runCurrent()
        advanceTimeBy(500)
        val c = async { r.refreshNow() }
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(1)
        advanceTimeBy(1_000)
        a.await(); b.await(); c.await()
        assertThat(api.settingsCalls).isEqualTo(1)
        r.refreshNow() // sequential call after completion starts a new one
        assertThat(api.settingsCalls).isEqualTo(2)
    }

    @Test fun builtInWallpaperOverridesUploadsAndStopsRotation() = runTest {
        val api = FakeApi()
        val base = (api.settings as ApiResult.Success).value.settings
        val list = listOf(WallpaperItem("a", "http://x/a.png"), WallpaperItem("b", "http://x/b.png"))
        api.settings = settingsOf(base.copy(wallpaperUrl = "", useBuiltInWallpaper = false), list)
        val r = repo(api)
        r.refreshNow()
        // No choice saved yet: uploads rotate.
        assertThat(r.state.value.currentWallpaperUrl).isEqualTo("http://x/a.png")
        // Admin selects the built-in scene.
        api.settings = settingsOf(base.copy(wallpaperUrl = "", useBuiltInWallpaper = true), list)
        r.refreshNow()
        assertThat(r.state.value.currentWallpaperUrl).isEmpty()
        r.advanceWallpaper()
        assertThat(r.state.value.currentWallpaperUrl).isEmpty()
        // Admin selects an upload again.
        api.settings = settingsOf(base.copy(wallpaperUrl = "http://x/b.png", useBuiltInWallpaper = false), list)
        r.refreshNow()
        assertThat(r.state.value.currentWallpaperUrl).isEqualTo("http://x/b.png")
    }

    @Test fun wallpaperRotationFollowsActiveAndAdvances() = runTest {
        val api = FakeApi()
        val base = (api.settings as ApiResult.Success).value.settings
        val list = listOf(WallpaperItem("a", "http://x/a.png"), WallpaperItem("b", "http://x/b.png"))
        api.settings = settingsOf(base.copy(wallpaperUrl = "http://x/b.png"), list)
        val r = repo(api)
        r.refreshNow()
        assertThat(r.state.value.currentWallpaperUrl).isEqualTo("http://x/b.png")
        r.advanceWallpaper()
        assertThat(r.state.value.currentWallpaperUrl).isEqualTo("http://x/a.png")
        // Same active wallpaper on the next poll must not reset the rotation.
        r.refreshNow()
        assertThat(r.state.value.currentWallpaperUrl).isEqualTo("http://x/a.png")
        // Admin changes the active wallpaper: rotation restarts on it.
        api.settings = settingsOf(base.copy(wallpaperUrl = "http://x/a.png"), list)
        r.refreshNow()
        assertThat(r.state.value.currentWallpaperUrl).isEqualTo("http://x/a.png")
        r.advanceWallpaper()
        assertThat(r.state.value.currentWallpaperUrl).isEqualTo("http://x/b.png")
    }

    @Test fun throwingApiDoesNotKillPolling() = runTest {
        val api = FakeApi().apply { throwOnSettingsCalls = 1 }
        val r = repo(api)
        r.start()
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(1)
        assertThat(backgroundScope.isActive).isTrue()
        advanceTimeBy(8_000)
        runCurrent()
        assertThat(api.settingsCalls).isEqualTo(2)
        assertThat(r.state.value.rewards.rewards).isNotEmpty()
        assertThat(r.state.value.isLoading).isFalse()
        // refreshNow after a throwing flight also works and does not throw.
        api.throwOnSettingsCalls = api.settingsCalls + 1
        r.refreshNow()
    }

    @Test fun offlineFirstInstallHasDefaultBombs() = runTest {
        val api = FakeApi().apply {
            settings = ApiResult.NetworkError(java.io.IOException())
            bombs = ApiResult.NetworkError(java.io.IOException())
        }
        val r = repo(api)
        assertThat(r.state.value.bombs.bombs).isEqualTo(DEFAULT_BOMB_CONFIGS)
        assertThat(r.state.value.bombs.settings).isEqualTo(DEFAULT_BOMB_SETTINGS)
        r.refreshNow()
        assertThat(r.state.value.bombs.bombs).isEqualTo(DEFAULT_BOMB_CONFIGS)
    }

    @Test fun keepsAudioSettingsAndTiersWhenResponseOmitsThem() = runTest {
        val api = FakeApi()
        val base = (api.settings as ApiResult.Success).value.settings
        val tiers = listOf(AchievementTier(id = "t1", title = "Gold", minScore = 10))
        api.settings = settingsOf(base.copy(achievementTiers = tiers))
        val r = repo(api)
        r.refreshNow()
        val audio = r.state.value.settings.audioSettings
        assertThat(audio).isNotNull()
        assertThat(r.state.value.settings.achievementTiers).isEqualTo(tiers)
        api.settings = settingsOf(base.copy(audioSettings = null, achievementTiers = null, brandName = "Later"))
        r.refreshNow()
        assertThat(r.state.value.settings.brandName).isEqualTo("Later")
        assertThat(r.state.value.settings.audioSettings).isEqualTo(audio)
        assertThat(r.state.value.settings.achievementTiers).isEqualTo(tiers)
    }

    @Test fun bombsOnlySuccessDoesNotPersistDefaultSettingsAsLastGood() = runTest {
        val api = FakeApi().apply {
            settings = ApiResult.NetworkError(java.io.IOException())
            rewards = ApiResult.NetworkError(java.io.IOException())
        }
        val store = File(tmp.root, "branding.json")
        repo(api, store).refreshNow()
        val json = store.readText()
        assertThat(json).contains("bombs")
        assertThat(json).doesNotContain("\"settings\":{\"success\"")
        assertThat(json).doesNotContain("ItsSpotlight")
        assertThat(json).doesNotContain("rewards\":{")
        // A later cold start therefore still treats settings as not loaded.
        val cold = repo(FakeApi().apply { settings = ApiResult.NetworkError(java.io.IOException()) }, store)
        assertThat(cold.state.value.isLoading).isTrue()
        assertThat(cold.state.value.bombs.bombs).isNotEmpty()
    }

    @Test fun nothingFetchedWritesNoStoreFile() = runTest {
        val api = FakeApi().apply {
            settings = ApiResult.HttpError(500, "")
            bombs = ApiResult.HttpError(500, "")
            rewards = ApiResult.HttpError(500, "")
        }
        val store = File(tmp.root, "branding.json")
        repo(api, store).refreshNow()
        assertThat(store.exists()).isFalse()
    }

    @Test fun collectsLogoWallpapersBombImagesAndCustomSounds() {
        val audio = GameAudioSettings(
            bgm = BackgroundMusicConfig(activeTrackUrl = "/api/assets/bgm/content"),
            combo = ComboAudioConfig(customUrl = "/api/assets/combo/content"),
            countdown = CountdownAudioConfig(customUrls = CountdownCustomUrls(three = "http://c/3.mp3", go = "http://c/go.mp3")),
            sfx = mapOf(
                "explosion" to SoundEffectConfig(customUrl = "http://c/boom.mp3"),
                "game_over" to SoundEffectConfig(customUrl = null),
            ),
        )
        val state = BrandingState(
            settings = SystemSettings(brandLogoUrl = "http://c/logo.png", wallpaperUrl = "http://c/wp.jpg", audioSettings = audio),
            playlist = listOf(WallpaperItem("1", "http://c/wp.jpg"), WallpaperItem("2", "http://c/wp2.jpg")),
            bombs = ListBombsResponse(
                success = true,
                bombs = listOf(
                    BombConfig(id = "b1", imageUrl = "/api/assets/img/content", soundUrl = "http://c/pop.wav"),
                    BombConfig(id = "b2", imageUrl = "data:image/svg+xml;utf8,%3Csvg%2F%3E"),
                    BombConfig(id = "b3", imageUrl = ""),
                ),
                settings = DEFAULT_BOMB_SETTINGS,
            ),
            rewards = RewardsInfo(success = true, enabled = true, rewards = listOf(RewardItem(id = "r", imageUrl = "http://c/reward.png"))),
        )
        assertThat(collectAssetUrls(state)).containsExactly(
            "http://c/logo.png", "http://c/wp.jpg", "http://c/wp2.jpg",
            "/api/assets/img/content", "http://c/pop.wav", "data:image/svg+xml;utf8,%3Csvg%2F%3E",
            "http://c/reward.png",
            "/api/assets/bgm/content", "/api/assets/combo/content", "http://c/3.mp3", "http://c/go.mp3", "http://c/boom.mp3",
        )
    }

    @Test fun prefetchesEveryCollectedUrlIntoLocalFiles() {
        val server = MockWebServer()
        val hits = java.util.concurrent.ConcurrentHashMap<String, Int>()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                hits.merge(request.path!!, 1, Int::plus)
                return if (request.path == "/gone.png") MockResponse().setResponseCode(404) else MockResponse().setBody("body:" + request.path)
            }
        }
        server.start()
        val scope = CoroutineScope(Job() + Dispatchers.Default)
        try {
            val base = server.url("/").toString().trimEnd('/')
            val api = FakeApi()
            val s = (api.settings as ApiResult.Success).value.settings
            api.settings = settingsOf(
                s.copy(brandLogoUrl = "$base/logo.png", wallpaperUrl = "/api/assets/wp/content", audioSettings = GameAudioSettings(bgm = BackgroundMusicConfig(activeTrackUrl = "$base/bgm.mp3"))),
                listOf(WallpaperItem("x", "$base/gone.png")),
            )
            val cache = AssetCache(File(tmp.root, "assets").also { it.mkdirs() }, OkHttpClient(), baseUrl = { base })
            val repo = SettingsRepository(api, cache, File(tmp.root, "b.json"), scope)
            runBlocking { repo.refreshNow() }
            val files = repo.state.value.localFiles
            assertThat(files.keys).containsAtLeast("$base/logo.png", "/api/assets/wp/content", "$base/bgm.mp3")
            assertThat(files).doesNotContainKey("$base/gone.png")
            assertThat(files.getValue("/api/assets/wp/content").readText()).isEqualTo("body:/api/assets/wp/content")
            assertThat(files.getValue("$base/logo.png").name).endsWith(".png")
            // Reward image from the real fixture is a data: URL and is decoded locally.
            val reward = repo.state.value.rewards.rewards.first().imageUrl
            assertThat(files.getValue(reward).name).endsWith(".svg")
            assertThat(hits.keys.filter { it.startsWith("/data") }).isEmpty()
        } finally {
            scope.coroutineContext[Job]!!.cancel()
            server.shutdown()
        }
    }

    @Test fun coldStartReusesCachedFilesWithoutNetwork() = runBlocking {
        val server = MockWebServer().also { it.start() }
        try {
            val base = server.url("/").toString().trimEnd('/')
            server.enqueue(MockResponse().setBody("LOGO"))
            val api = FakeApi()
            val s = (api.settings as ApiResult.Success).value.settings
            api.settings = settingsOf(s.copy(brandLogoUrl = "$base/logo.png"))
            val assets = File(tmp.root, "assets").also { it.mkdirs() }
            val store = File(tmp.root, "b.json")
            val scope = CoroutineScope(Job() + Dispatchers.Default)
            SettingsRepository(api, AssetCache(assets, OkHttpClient(), baseUrl = { base }), store, scope).refreshNow()
            val cold = SettingsRepository(FakeApi(), AssetCache(assets, OkHttpClient(), baseUrl = { base }), store, scope)
            assertThat(cold.state.value.localFiles["$base/logo.png"]!!.readText()).isEqualTo("LOGO")
            scope.coroutineContext[Job]!!.cancel()
        } finally {
            server.shutdown()
        }
    }

    // ---- assets: not re-downloaded on every 8 s poll --------------------------------------------------------

    private class AssetRig(tmp: File) {
        val server = MockWebServer()
        val counts = java.util.concurrent.ConcurrentHashMap<String, Int>()
        var nowMs = 0L
        val api = FakeApi()
        val repo: SettingsRepository

        init {
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    counts.merge(request.path!!, 1, Int::plus)
                    return if (request.getHeader("If-None-Match") != null) MockResponse().setResponseCode(304)
                    else MockResponse().setHeader("ETag", "\"v1\"").setBody("IMG")
                }
            }
            server.start()
            api.settings = settingsOf(SystemSettings(brandLogoUrl = server.url("/logo.png").toString()))
            api.bombs = ApiResult.Success(ListBombsResponse(success = true, bombs = emptyList(), settings = DEFAULT_BOMB_SETTINGS))
            api.rewards = ApiResult.Success(RewardsInfo(success = true, enabled = false, rewards = emptyList()))
            repo = SettingsRepository(
                api = api,
                cache = AssetCache(File(tmp, "assets").also { it.mkdirs() }, OkHttpClient()),
                store = File(tmp, "branding.json"),
                scope = CoroutineScope(Job() + Dispatchers.IO),
                nowMs = { nowMs },
            )
        }

        fun logo(path: String = "/logo.png") { api.settings = settingsOf(SystemSettings(brandLogoUrl = server.url(path).toString())) }
    }

    @Test fun assetIsRevalidatedAtMostEvery30Minutes() = runBlocking {
        val rig = AssetRig(tmp.root)
        try {
            rig.repo.refreshNow()
            assertThat(rig.counts["/logo.png"]).isEqualTo(1)
            val url = rig.server.url("/logo.png").toString()
            assertThat(rig.repo.state.value.localFiles[url]).isNotNull()

            // 30 minutes of 8 s polls, less one poll: nothing goes to the server, and the file stays published.
            while (rig.nowMs + SettingsRepository.POLL_INTERVAL_MS < SettingsRepository.ASSET_REVALIDATE_MS) {
                rig.nowMs += SettingsRepository.POLL_INTERVAL_MS
                rig.repo.refreshNow()
            }
            assertThat(rig.counts["/logo.png"]).isEqualTo(1)
            assertThat(rig.repo.state.value.localFiles[url]).isNotNull()

            rig.nowMs = SettingsRepository.ASSET_REVALIDATE_MS
            rig.repo.refreshNow()
            assertThat(rig.counts["/logo.png"]).isEqualTo(2)
            rig.nowMs += SettingsRepository.POLL_INTERVAL_MS
            rig.repo.refreshNow()
            assertThat(rig.counts["/logo.png"]).isEqualTo(2)
        } finally {
            rig.server.shutdown()
        }
    }

    @Test fun aChangedUrlIsFetchedAtOnce() = runBlocking {
        val rig = AssetRig(tmp.root)
        try {
            rig.repo.refreshNow()
            rig.logo("/new.png")
            rig.nowMs += SettingsRepository.POLL_INTERVAL_MS
            rig.repo.refreshNow()
            assertThat(rig.counts["/new.png"]).isEqualTo(1)
            assertThat(rig.repo.state.value.localFiles[rig.server.url("/new.png").toString()]).isNotNull()
        } finally {
            rig.server.shutdown()
        }
    }

    /** Admin switches back to a logo from before: as far as anyone can tell that's a change. */
    @Test fun aUrlThatComesBackIsFetchedAtOnce() = runBlocking {
        val rig = AssetRig(tmp.root)
        try {
            rig.repo.refreshNow()
            rig.logo("/new.png")
            rig.repo.refreshNow()
            rig.logo("/logo.png")
            rig.repo.refreshNow()
            assertThat(rig.counts["/logo.png"]).isEqualTo(2)
        } finally {
            rig.server.shutdown()
        }
    }

    @Test fun anAssetThatNeverArrivedIsRetriedOnTheNextPoll() = runBlocking {
        val rig = AssetRig(tmp.root)
        try {
            rig.server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val n = rig.counts.merge(request.path!!, 1, Int::plus)!!
                    return if (n == 1) MockResponse().setResponseCode(503) else MockResponse().setBody("IMG")
                }
            }
            rig.repo.refreshNow()
            assertThat(rig.repo.state.value.localFiles).isEmpty()
            rig.nowMs += SettingsRepository.POLL_INTERVAL_MS
            rig.repo.refreshNow()
            assertThat(rig.repo.state.value.localFiles).hasSize(1)
        } finally {
            rig.server.shutdown()
        }
    }

    // ---- branding.json is written only when it changes ------------------------------------------------------

    /** Writing replaces the file, so an old timestamp survives only if nothing wrote. */
    @Test fun unchangedBrandingIsNotRewritten() = runTest {
        val store = File(tmp.root, "branding.json")
        val api = FakeApi()
        val r = repo(api, store)
        r.refreshNow()
        assertThat(store.isFile).isTrue()
        store.setLastModified(1_000_000L)
        r.refreshNow()
        assertThat(store.lastModified()).isEqualTo(1_000_000L)

        val changed = api.settings as ApiResult.Success
        api.settings = ApiResult.Success(changed.value.copy(settings = changed.value.settings.copy(brandName = "Other")))
        r.refreshNow()
        assertThat(store.lastModified()).isNotEqualTo(1_000_000L)
        assertThat(store.readText()).contains("Other")
    }

    /** The disk copy is what's being compared with after a restart too, not only this process's last write. */
    @Test fun aRestartDoesNotRewriteUnchangedBranding() = runTest {
        val store = File(tmp.root, "branding.json")
        val api = FakeApi()
        repo(api, store).refreshNow()
        val saved = store.readText()
        store.setLastModified(1_000_000L)
        val r = repo(api, store)
        r.refreshNow()
        assertThat(store.readText()).isEqualTo(saved)
        assertThat(store.lastModified()).isEqualTo(1_000_000L)
    }

    @Test fun aFailedWriteIsRetriedOnTheNextRefresh() = runTest {
        val dir = File(tmp.root, "blocked")
        val store = File(dir, "branding.json")
        dir.writeText("a file where the directory should be")
        val api = FakeApi()
        val r = repo(api, store)
        r.refreshNow()
        dir.delete()
        r.refreshNow()
        assertThat(store.isFile).isTrue()
    }

    // ---- the start background downloads on its own: up to 40 MB, and links can be slow ------------------------

    private class BackgroundRig(private val tmp: File, pollIntervalMs: Long = SettingsRepository.POLL_INTERVAL_MS) {
        val server = MockWebServer()
        val hits = java.util.concurrent.ConcurrentHashMap<String, Int>()
        val release = java.util.concurrent.CountDownLatch(1)
        /** What each path answers; a path not listed gets a small file. */
        val responses = java.util.concurrent.ConcurrentHashMap<String, () -> MockResponse>()
        var nowMs = 0L
        val api = FakeApi()
        val scope = CoroutineScope(Job() + Dispatchers.IO)
        val assets = File(tmp, "assets").also { it.mkdirs() }
        val repo: SettingsRepository

        init {
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    hits.merge(request.path!!, 1, Int::plus)
                    return responses[request.path!!]?.invoke() ?: MockResponse().setBody("body:" + request.path)
                }
            }
            server.start()
            api.bombs = ApiResult.Success(ListBombsResponse(success = true, bombs = emptyList(), settings = DEFAULT_BOMB_SETTINGS))
            api.rewards = ApiResult.Success(RewardsInfo(success = true, enabled = false, rewards = emptyList()))
            repo = SettingsRepository(
                api = api,
                cache = AssetCache(assets, OkHttpClient()),
                store = File(tmp, "branding.json"),
                scope = scope,
                pollIntervalMs = pollIntervalMs,
                nowMs = { nowMs },
            )
        }

        fun url(path: String) = server.url(path).toString()

        fun settings(background: String?, logo: String = "/logo.png") {
            api.settings = settingsOf(SystemSettings(brandLogoUrl = url(logo), startBackgroundUrl = background?.let(::url)))
        }

        /** Answers with headers, then holds the body back until [release]. */
        fun hanging(body: String = "HELD"): () -> MockResponse = {
            release.await(30, java.util.concurrent.TimeUnit.SECONDS)
            MockResponse().setBody(body)
        }

        /** Headers at once, then a body far too slow to finish during a test. */
        fun crawling(): () -> MockResponse = {
            MockResponse().setBody("x".repeat(100_000)).throttleBody(1_000, 1, java.util.concurrent.TimeUnit.SECONDS)
        }

        fun files() = repo.state.value.localFiles

        fun close() {
            release.countDown()
            scope.coroutineContext[Job]!!.cancel()
            server.shutdown()
        }
    }

    private suspend fun eventually(what: String, timeoutMs: Long = 10_000, condition: () -> Boolean) {
        val deadline = System.nanoTime() + timeoutMs * 1_000_000
        while (!condition()) {
            check(System.nanoTime() < deadline) { "Timed out waiting: $what" }
            delay(10)
        }
    }

    @Test fun otherAssetsPublishWhileTheBackgroundHangs() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.responses["/bg.mp4"] = rig.hanging()
            rig.settings("/bg.mp4")
            kotlinx.coroutines.withTimeout(10_000) { rig.repo.refreshNow() }
            assertThat(rig.files()).containsKey(rig.url("/logo.png"))
            assertThat(rig.files()).doesNotContainKey(rig.url("/bg.mp4"))

            rig.release.countDown()
            eventually("background published") { rig.files().containsKey(rig.url("/bg.mp4")) }
            assertThat(rig.files().getValue(rig.url("/bg.mp4")).readText()).isEqualTo("HELD")
            assertThat(rig.files()).containsKey(rig.url("/logo.png"))
        } finally {
            rig.close()
        }
    }

    @Test fun pollingContinuesWhileTheBackgroundHangsWithOneDownload() = runBlocking {
        val rig = BackgroundRig(tmp.root, pollIntervalMs = 20)
        try {
            rig.responses["/bg.mp4"] = rig.hanging()
            rig.settings("/bg.mp4")
            rig.repo.start()
            eventually("several polls") { rig.api.settingsCalls >= 5 }
            assertThat(rig.hits["/bg.mp4"]).isEqualTo(1)
        } finally {
            rig.close()
        }
    }

    @Test fun aRefreshDoesNotEraseThePublishedBackground() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.settings("/bg.mp4")
            rig.repo.refreshNow()
            eventually("background published") { rig.files().containsKey(rig.url("/bg.mp4")) }
            repeat(3) {
                rig.repo.refreshNow()
                assertThat(rig.files()).containsKey(rig.url("/bg.mp4"))
            }
            assertThat(rig.hits["/bg.mp4"]).isEqualTo(1)
        } finally {
            rig.close()
        }
    }

    @Test fun aFailedBackgroundBacksOff() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.responses["/bg.mp4"] = { MockResponse().setResponseCode(503) }
            rig.settings("/bg.mp4")
            suspend fun pollUntil(endMs: Long) {
                while (rig.nowMs < endMs) {
                    rig.nowMs = minOf(endMs, rig.nowMs + SettingsRepository.POLL_INTERVAL_MS)
                    rig.repo.refreshNow()
                    delay(20) // room for a wrongly started download to reach the server
                }
            }
            rig.repo.refreshNow()
            eventually("first attempt") { rig.hits["/bg.mp4"] == 1 }
            delay(100) // the attempt's failure is recorded just after the server answers

            pollUntil(SettingsRepository.START_BACKGROUND_RETRY_MS - 1)
            assertThat(rig.hits["/bg.mp4"]).isEqualTo(1)
            pollUntil(SettingsRepository.START_BACKGROUND_RETRY_MS)
            eventually("second attempt") { rig.hits["/bg.mp4"] == 2 }
            delay(100)

            // The wait doubles.
            pollUntil(SettingsRepository.START_BACKGROUND_RETRY_MS * 3 - 1)
            assertThat(rig.hits["/bg.mp4"]).isEqualTo(2)
            pollUntil(SettingsRepository.START_BACKGROUND_RETRY_MS * 3)
            eventually("third attempt") { rig.hits["/bg.mp4"] == 3 }
            assertThat(rig.files()).doesNotContainKey(rig.url("/bg.mp4"))
            assertThat(rig.files()).containsKey(rig.url("/logo.png"))
        } finally {
            rig.close()
        }
    }

    @Test fun aNewUrlDoesNotInheritTheBackoff() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.responses["/bad.mp4"] = { MockResponse().setResponseCode(503) }
            rig.settings("/bad.mp4")
            rig.repo.refreshNow()
            eventually("first attempt") { rig.hits["/bad.mp4"] == 1 }
            delay(100)
            rig.settings("/good.mp4")
            rig.repo.refreshNow()
            eventually("new background published") { rig.files().containsKey(rig.url("/good.mp4")) }
        } finally {
            rig.close()
        }
    }

    @Test fun pausedStartsNoDownload() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.settings("/bg.mp4")
            rig.repo.setPollingPaused(true)
            rig.repo.refreshNow() // a refresh that was already under way when the round began
            delay(200)
            assertThat(rig.hits["/bg.mp4"]).isNull()
        } finally {
            rig.close()
        }
    }

    @Test fun pausingStopsADownloadInProgressAndResumingStartsAgain() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.responses["/bg.mp4"] = rig.crawling()
            rig.settings("/bg.mp4")
            rig.repo.refreshNow()
            fun partial() = rig.assets.listFiles()!!.filter { it.name.endsWith(".tmp") }
            eventually("download under way") { partial().any { it.length() > 0 } }

            rig.repo.setPollingPaused(true)
            eventually("partial file removed", timeoutMs = 3_000) { partial().isEmpty() }
            assertThat(rig.files()).doesNotContainKey(rig.url("/bg.mp4"))

            rig.responses["/bg.mp4"] = { MockResponse().setBody("WHOLE") }
            rig.repo.setPollingPaused(false)
            eventually("published after resuming") { rig.files().containsKey(rig.url("/bg.mp4")) }
            assertThat(rig.files().getValue(rig.url("/bg.mp4")).readText()).isEqualTo("WHOLE")
        } finally {
            rig.close()
        }
    }

    @Test fun aReplacedUrlCancelsTheOldDownload() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.responses["/old.mp4"] = rig.crawling()
            rig.settings("/old.mp4")
            rig.repo.refreshNow()
            eventually("old download under way") { rig.assets.listFiles()!!.any { it.name.endsWith(".tmp") && it.length() > 0 } }

            rig.settings("/new.mp4")
            rig.repo.refreshNow()
            eventually("new background published") { rig.files().containsKey(rig.url("/new.mp4")) }
            eventually("old partial file removed", timeoutMs = 3_000) { rig.assets.listFiles()!!.none { it.name.endsWith(".tmp") } }
            assertThat(rig.files()).doesNotContainKey(rig.url("/old.mp4"))
        } finally {
            rig.close()
        }
    }

    @Test fun anOldDownloadFinishingLateIsIgnored() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            // Still waiting on the server's answer when it's replaced, and answers anyway afterwards.
            rig.responses["/old.mp4"] = rig.hanging()
            rig.settings("/old.mp4")
            rig.repo.refreshNow()
            eventually("old request sent") { rig.hits["/old.mp4"] == 1 }

            rig.settings("/new.mp4")
            rig.repo.refreshNow()
            eventually("new background published") { rig.files().containsKey(rig.url("/new.mp4")) }
            rig.release.countDown()
            delay(200)
            assertThat(rig.files()).doesNotContainKey(rig.url("/old.mp4"))
        } finally {
            rig.close()
        }
    }

    @Test fun removingTheBackgroundUnpublishesIt() = runBlocking {
        val rig = BackgroundRig(tmp.root)
        try {
            rig.settings("/bg.mp4")
            rig.repo.refreshNow()
            eventually("background published") { rig.files().containsKey(rig.url("/bg.mp4")) }
            rig.settings(null)
            rig.repo.refreshNow()
            assertThat(rig.files()).doesNotContainKey(rig.url("/bg.mp4"))
            assertThat(rig.files()).containsKey(rig.url("/logo.png"))
        } finally {
            rig.close()
        }
    }

    @Test fun startBackgroundIsCached() {
        val withBg = BrandingState(settings = SystemSettings(startBackgroundUrl = "http://x/bg.mp4").normalizedForBranding())
        assertThat(collectAssetUrls(withBg)).contains("http://x/bg.mp4")
        val empty = BrandingState(settings = SystemSettings(startBackgroundUrl = "").normalizedForBranding())
        assertThat(collectAssetUrls(empty)).isEmpty()
    }
}
