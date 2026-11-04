package com.aayush.diwaliplay.app

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import androidx.annotation.MainThread
import com.aayush.diwaliplay.api.ResultQueue
import com.aayush.diwaliplay.audio.AudioEngine
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.branding.SettingsRepository
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.GameAudioSettings
import com.aayush.diwaliplay.tracking.camera.CameraFrame
import com.aayush.diwaliplay.tracking.camera.TrackingPipeline
import com.aayush.diwaliplay.tracking.camera.TrackingSnapshot
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Everything the view model talks to, so tests can swap in fakes. */
class AppDependencies(
    val api: com.aayush.diwaliplay.api.GameApi,
    val results: ResultSink,
    val audio: GameAudio,
    val tracking: TrackingSource,
    val branding: BrandingSource,
    /** Whether the backend answered its last request. False until it first does. */
    val serverReachable: StateFlow<Boolean>,
    val publicWebUrl: () -> String,
)

/** The hand-tracking pipeline, as the game sees it. [start] / [stop] are main-thread only. */
interface TrackingSource {
    val status: StateFlow<TrackingStatus>
    fun snapshot(): TrackingSnapshot
    fun latestFrame(): CameraFrame?
    fun captureStill(): ByteArray?
    @MainThread fun start()
    @MainThread fun stop()
}

class PipelineTrackingSource(private val pipeline: TrackingPipeline) : TrackingSource {
    override val status: StateFlow<TrackingStatus> get() = pipeline.status
    override fun snapshot(): TrackingSnapshot = pipeline.hands.get()
    override fun latestFrame(): CameraFrame? = pipeline.latestFrame()
    override fun captureStill(): ByteArray? = pipeline.captureStill()
    // No Preview use case: BackdropSurfaceView draws the analysis frames (see its KDoc).
    override fun start() = pipeline.start(null)
    override fun stop() = pipeline.stop()
}

interface GameAudio {
    fun apply(settings: GameAudioSettings, files: Map<String, File>, bombs: List<BombConfig>)
    fun isReady(): Boolean
    fun playGameKey(key: String)
    fun playCracker(type: String)
    fun startBgm()
    fun stopBgm()
    fun release()
}

/** [AudioEngine] plus audio focus, held only while the music plays. Losing focus stops the music. */
class EngineGameAudio(private val engine: AudioEngine, private val audioManager: AudioManager) : GameAudio {
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
        )
        .setOnAudioFocusChangeListener { change ->
            when (change) {
                AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> engine.stopBgm()
                AudioManager.AUDIOFOCUS_GAIN -> if (bgmWanted) engine.startBgm()
            }
        }
        .build()

    @Volatile private var bgmWanted = false

    override fun apply(settings: GameAudioSettings, files: Map<String, File>, bombs: List<BombConfig>) =
        engine.apply(settings, files, bombs)

    override fun isReady(): Boolean = engine.isReady()

    override fun playGameKey(key: String) { engine.playGameKey(key) }

    override fun playCracker(type: String) { engine.playCracker(type) }

    override fun startBgm() {
        if (bgmWanted) return
        bgmWanted = true
        if (audioManager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_FAILED) engine.startBgm()
    }

    override fun stopBgm() {
        if (!bgmWanted) return
        bgmWanted = false
        engine.stopBgm()
        audioManager.abandonAudioFocusRequest(focus)
    }

    override fun release() {
        stopBgm()
        engine.release()
    }
}

/** Admin-panel settings; see [SettingsRepository]. */
interface BrandingSource {
    val state: StateFlow<BrandingState>
    fun start()
    fun setPollingPaused(paused: Boolean)
    fun advanceWallpaper()
}

/**
 * Builds the [SettingsRepository] off the main thread (it reads its disk copy in `init`) and mirrors its state.
 * Until then [state] holds the defaults, and pause requests wait for it.
 */
class LazyBrandingSource(
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher,
    private val create: () -> SettingsRepository,
) : BrandingSource {
    private val _state = MutableStateFlow(BrandingState())
    override val state: StateFlow<BrandingState> = _state

    private val lock = Any()
    private var started = false
    private var repository: SettingsRepository? = null
    private var paused = false

    override fun start() {
        synchronized(lock) {
            if (started) return
            started = true
        }
        scope.launch(io) {
            val repo = create()
            synchronized(lock) {
                repository = repo
                repo.setPollingPaused(paused)
            }
            repo.start()
            repo.state.collect { _state.value = it }
        }
    }

    override fun setPollingPaused(paused: Boolean) {
        synchronized(lock) {
            this.paused = paused
            repository?.setPollingPaused(paused)
        }
    }

    override fun advanceWallpaper() {
        synchronized(lock) { repository }?.advanceWallpaper()
    }
}

/** Where a finished round goes when the server can't take it right now. */
interface ResultSink {
    fun start()
    fun enqueue(req: CompleteSessionRequest)
}

class QueueResultSink(private val queue: Lazy<ResultQueue>) : ResultSink {
    override fun start() = queue.value.start()
    override fun enqueue(req: CompleteSessionRequest) = queue.value.enqueue(req)
}
