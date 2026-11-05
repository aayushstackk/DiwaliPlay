package com.aayush.diwaliplay.app

import android.app.Application
import android.content.Context
import android.os.Build
import android.media.AudioManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.aayush.diwaliplay.api.HttpGameApi
import com.aayush.diwaliplay.api.ResultQueue
import com.aayush.diwaliplay.audio.AudioEngine
import com.aayush.diwaliplay.audio.SoundManifest
import com.aayush.diwaliplay.audio.SoundResolver
import com.aayush.diwaliplay.branding.AssetCache
import com.aayush.diwaliplay.branding.ServerConfig
import com.aayush.diwaliplay.branding.SettingsRepository
import com.aayush.diwaliplay.kiosk.AdminPin
import com.aayush.diwaliplay.kiosk.KioskController
import com.aayush.diwaliplay.kiosk.SecureStore
import com.aayush.diwaliplay.kiosk.relay.RelayClient
import com.aayush.diwaliplay.kiosk.relay.RelayKiosk
import com.aayush.diwaliplay.kiosk.relay.RelayManager
import com.aayush.diwaliplay.kiosk.relay.RelayPairing
import com.aayush.diwaliplay.model.KioskDeviceStatus
import com.aayush.diwaliplay.tracking.HandTracker
import com.aayush.diwaliplay.tracking.camera.TrackingPipeline
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient

/** Wires the core modules together. One per process; construct on the main thread. */
class AppContainer(private val app: Application) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val http = kioskHttpClient()
    val serverConfig = ServerConfig(app.getSharedPreferences("server_config", Context.MODE_PRIVATE))

    private val adminPin = AdminPin(app.getSharedPreferences("admin_pin", Context.MODE_PRIVATE))

    /** The relay outlives any one activity; this is the activity's lock controller while there is one. */
    private val kiosk = CurrentKiosk()
    private val secureStore = SecureStore(app)
    private val relay = RelayManager(
        RelayPairing(http, serverConfig, secureStore),
        RelayClient(http, serverConfig, secureStore, kiosk, adminPin, scope),
        scope,
        deviceName = "Android display (${Build.MODEL})",
    ).also { it.start() }

    private val admin = AdminDependencies(adminPin, serverConfig, relay)
    private val activeSession = PrefsActiveSessionStore(app.getSharedPreferences("active_session", Context.MODE_PRIVATE))

    private val api = ReachabilityGameApi(HttpGameApi({ serverConfig.apiBaseUrl }, http))

    private val pipeline = TrackingPipeline(app, AlwaysResumedLifecycleOwner(), HandTracker())

    private val results = QueueResultSink(lazy { ResultQueue(File(app.filesDir, "result_queue"), api, scope) })
    private val tracking = PipelineTrackingSource(pipeline)
    private val branding = LazyBrandingSource(scope, Dispatchers.IO) {
        SettingsRepository(
            api = api,
            cache = AssetCache(File(app.filesDir, "asset_cache"), http, { serverConfig.apiBaseUrl }),
            store = File(app.filesDir, "branding.json"),
            scope = scope,
        )
    }

    fun attachKiosk(controller: KioskController) = kiosk.attach(controller)

    fun detachKiosk(controller: KioskController) = kiosk.detach(controller)

    /** For one view model. Only the audio is its own: the view model releases it, and an engine can't restart. */
    fun newDependencies() = AppDependencies(
        api = api,
        results = results,
        // Lazy: the manifest read is first touched on the effects thread, not here on main.
        audio = EngineGameAudio(
            lazy { AudioEngine(app, SoundResolver(readManifest())) },
            app.getSystemService(AudioManager::class.java),
        ),
        tracking = tracking,
        branding = branding,
        serverReachable = api.reachable,
        publicWebUrl = { serverConfig.publicWebUrl },
        activeSession = activeSession,
        admin = admin,
    )

    private fun readManifest(): SoundManifest =
        app.assets.open(SoundManifest.FILE_NAME).bufferedReader().use { SoundManifest.parse(it.readText()) }
}

/** No following an https URL's redirect to http: it would resend player data in the clear. */
internal fun kioskHttpClient(): OkHttpClient = OkHttpClient.Builder().followSslRedirects(false).build()

/**
 * Lifecycle for the camera binding. Always resumed, because the view model decides when the camera runs and stops it
 * on pause; binding to the activity instead would have the view model holding on to it.
 */
private class AlwaysResumedLifecycleOwner : LifecycleOwner {
    override val lifecycle = LifecycleRegistry(this).apply { currentState = Lifecycle.State.RESUMED }
}

/**
 * The activity's [KioskController], for the relay, which lives as long as the process. Between activities the relay can
 * still report that the app is up, but can't change the lock, and says so.
 */
internal class CurrentKiosk : RelayKiosk {
    @Volatile private var controller: KioskController? = null

    fun attach(c: KioskController) { controller = c }

    fun detach(c: KioskController) { if (controller === c) controller = null }

    override fun status(): KioskDeviceStatus =
        controller?.status() ?: KioskDeviceStatus(appRunning = true, platform = "android")

    override fun enableLock(reason: String) = (controller ?: throw IllegalStateException("No screen to lock")).enableLock(reason)

    override fun disableLock(reason: String) = (controller ?: throw IllegalStateException("No screen to unlock")).disableLock(reason)
}
