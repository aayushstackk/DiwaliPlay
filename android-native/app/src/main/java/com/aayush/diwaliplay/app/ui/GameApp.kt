package com.aayush.diwaliplay.app.ui

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.aayush.diwaliplay.app.BackdropKind
import com.aayush.diwaliplay.app.CalibrationUi
import com.aayush.diwaliplay.app.GameViewModel
import com.aayush.diwaliplay.app.StartBackgroundChoice
import com.aayush.diwaliplay.app.chooseStartBackground
import com.aayush.diwaliplay.app.startDimAlpha
import com.aayush.diwaliplay.app.ui.admin.AdminPinDialog
import com.aayush.diwaliplay.app.ui.admin.AdminScreen
import com.aayush.diwaliplay.app.ui.admin.AdminStage
import com.aayush.diwaliplay.app.ui.admin.LogoTapCounter
import com.aayush.diwaliplay.app.ui.admin.PerfOverlay
import com.aayush.diwaliplay.app.ui.theme.DesignCanvas
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.kiosk.KioskController
import com.aayush.diwaliplay.render.GameSurfaceView
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import kotlinx.coroutines.delay
import java.io.File

/**
 * The window, bottom to top: backdrop surface, the start video's surface if there is one, game surface, then the Compose
 * screen for the phase. The surfaces sit below the window and show through it (see [BackdropSurfaceView]).
 */
@Composable
fun GameApp(vm: GameViewModel, onRetryCamera: () -> Unit, kiosk: KioskController? = null, onExit: () -> Unit = {}) {
    val phase by vm.phase.collectAsState()
    val branding by vm.branding.collectAsState()
    val perfOverlay by vm.perfOverlay.collectAsState()
    var surface by remember { mutableStateOf<GameSurfaceView?>(null) }
    // Stays failed across settings polls, until the background is a different file.
    var failedVideo by remember { mutableStateOf<File?>(null) }
    val startBackground = chooseStartBackground(branding.settings, branding.localFiles, failedVideo)
    // Gone from the moment a code is accepted, not when the phase changes: the phase change starts the camera before
    // Compose gets a frame to release the player, and a second round's camera opens within that frame.
    val startUi = vm.startUi.collectAsState()
    val roundStarting by remember { derivedStateOf { startUi.value.welcomeName != null } }
    val startVideo = (startBackground as? StartBackgroundChoice.Video)?.takeIf { phase == GamePhase.Startup && !roundStarting }

    // Spec §9: Back is consumed, so a visitor can't back out of the kiosk.
    BackHandler {}

    DesignCanvas {
        Box(Modifier.fillMaxSize()) {
            BackdropLayer(vm, branding, startBackground)
            if (startVideo != null) {
                StartVideoSurface(startVideo.file, onFailed = { failedVideo = it }, Modifier.fillMaxSize())
            }
            GameSurfaceLayer(vm, active = phase != GamePhase.Startup, onSurface = { surface = it })
            val videoDimAlpha = if (startVideo != null) startDimAlpha(startVideo.dimPercent) else 0
            PhaseContent(vm, phase, branding, videoDimAlpha, onRetryCamera, kiosk, onExit)
            if (perfOverlay) {
                PerfOverlay(
                    status = { vm.cameraStatus.value },
                    renderFps = { surface?.fps?.value ?: 0f },
                    lowEnd = { surface?.lowEnd?.value ?: false },
                    modifier = Modifier.align(Alignment.BottomStart),
                )
            }
        }
    }
}

@Composable
private fun BackdropLayer(vm: GameViewModel, branding: BrandingState, startBackground: StartBackgroundChoice) {
    var view by remember { mutableStateOf<BackdropSurfaceView?>(null) }
    val kind by vm.backdrop.collectAsState()
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context -> BackdropSurfaceView(context, vm.tracking::latestFrame).also { view = it } },
    )
    val backdrop = view
    val round by vm.round.collectAsState()
    val active = round
    val content = if (kind == BackdropKind.StartBackground) {
        // A Video draws the built-in beneath it, undimmed: that's what shows until its first frame, or if it fails.
        if (startBackground is StartBackgroundChoice.Image) {
            BackdropContent(kind, startBackground.file, 100.0, startDimAlpha(startBackground.dimPercent))
        } else {
            BackdropContent(kind, null, 100.0)
        }
    } else {
        BackdropContent(
            kind,
            branding.localFiles[active?.wallpaperUrl ?: branding.currentWallpaperUrl],
            active?.wallpaperOpacity ?: branding.settings.wallpaperOpacity,
        )
    }
    LaunchedEffect(backdrop, content) { backdrop?.show(content) }
    DisposableEffect(backdrop) { onDispose { backdrop?.shutdown() } }
}

@Composable
private fun PhaseContent(
    vm: GameViewModel,
    phase: GamePhase,
    branding: BrandingState,
    videoDimAlpha: Int,
    onRetryCamera: () -> Unit,
    kiosk: KioskController?,
    onExit: () -> Unit,
) {
    when (phase) {
        GamePhase.Startup -> StartupContent(vm, branding, videoDimAlpha, onRetryCamera, kiosk, onExit)
        is GamePhase.Calibrating -> Box(Modifier.fillMaxSize()) {
            val status by vm.cameraStatus.collectAsState()
            val ui by produceState(CalibrationUi(), phase.ready) {
                if (phase.ready) {
                    value = value.copy(holdProgress = 1.0)
                } else {
                    while (true) {
                        value = vm.sampleCalibration()
                        delay(50)
                    }
                }
            }
            CalibrationScreen(ui, phase.ready)
            RoundHeader(branding, Modifier.align(Alignment.TopStart))
            ChangeCodeButton(vm::onInterrupted, Modifier.align(Alignment.TopEnd))
            when (val s = status) {
                TrackingStatus.Starting -> VisionLoadingOverlay()
                is TrackingStatus.Failed -> CameraErrorOverlay(s.reason, onRetryCamera, vm::onInterrupted, s.cameraAlive)
                is TrackingStatus.CameraLost -> CameraErrorOverlay(s.reason, onRetryCamera, vm::onInterrupted)
                is TrackingStatus.Running -> Unit
            }
        }
        is GamePhase.Countdown -> Box(Modifier.fillMaxSize()) {
            CountdownOverlay(phase.step)
            RoundHeader(branding, Modifier.align(Alignment.TopStart), pulsing = false)
        }
        GamePhase.Playing -> Box(Modifier.fillMaxSize()) {
            val hud by vm.hud.collectAsState()
            val round by vm.round.collectAsState()
            val settings = round?.settings
            if (settings?.isTouchMode == true) TouchLayer(vm::onTouch)
            RoundHeader(branding, Modifier.align(Alignment.TopStart), pulsing = false)
            HudOverlay(hud, settings?.targetScore)
        }
        is GamePhase.PhotoCountdown -> {
            val status by vm.cameraStatus.collectAsState()
            PhotoCountdownScreen(phase, vm.playerName(), status, vm.tracking::latestFrame)
        }
        is GamePhase.GameOver -> {
            val round by vm.round.collectAsState()
            val seconds by vm.autoReturnSeconds.collectAsState()
            val recorded by vm.feedbackRecorded.collectAsState()
            val brand = round?.settings?.brandName ?: branding.settings.brandName
            val saver = rememberCardSaver()
            GameOverScreen(
                card = phase.card,
                brandName = brand,
                isTrial = round?.isTrial == true,
                autoReturnSeconds = seconds,
                recordedFeedback = recorded,
                localFiles = branding.localFiles,
                wheel = if (round?.settings?.rewardsEnabled == true) {
                    WheelInputs(
                        rewards = branding.rewards.rewards,
                        requestSpin = { vm.requestSpin(phase) },
                        held = phase.spinHeld,
                        onTick = vm::playSpinTick,
                        onVictory = vm::playVictoryChime,
                        onSettled = vm::onSpinSettled,
                        loadRewards = vm::loadWheelRewards,
                    )
                } else {
                    null
                },
                onSave = { saveCard(saver, phase.card, brand) },
                onFeedback = vm::submitFeedback,
                onPlayAgain = vm::onPlayAgain,
                onClose = vm::exitToStart,
            )
        }
    }
}

/** The start screen, and the only way in to the admin screen: it isn't reachable from anywhere else. */
@Composable
private fun StartupContent(
    vm: GameViewModel,
    branding: BrandingState,
    videoDimAlpha: Int,
    onRetryCamera: () -> Unit,
    kiosk: KioskController?,
    onExit: () -> Unit,
) {
    val ui by vm.startUi.collectAsState()
    val admin = vm.admin
    var stage by remember { mutableStateOf(if (admin != null && !admin.pin.isSet) AdminStage.CreatePin else AdminStage.Closed) }
    val taps = remember { LogoTapCounter() }

    if (admin != null && stage == AdminStage.Open) {
        AdminScreen(vm, admin, kiosk, onRetryCamera, onClose = { stage = AdminStage.Closed }, onExit = onExit)
        return
    }
    val canTap = admin != null && stage == AdminStage.Closed && !ui.busy
    StartScreen(
        ui, branding, vm.registrationUrl, vm::onKeypad, vm::onClear, vm::onBackspace, vm::onPlay,
        onLogoTap = if (canTap) ({ if (taps.onTap(SystemClock.uptimeMillis())) stage = AdminStage.EnterPin }) else null,
        refocusKey = stage,
        videoDimAlpha = videoDimAlpha,
    )
    if (admin != null && stage != AdminStage.Closed) {
        AdminPinDialog(
            pin = admin.pin,
            creating = stage == AdminStage.CreatePin,
            onDone = { stage = if (stage == AdminStage.CreatePin) AdminStage.Closed else AdminStage.Open },
            onCancel = { stage = AdminStage.Closed },
        )
    }
}

/**
 * App.tsx's header pill: title, connector and the brand name. Its sparkle pulses only outside the countdown and play,
 * in the spirit of the web's `round-active`, which drops such effects for those phases.
 */
@Composable
internal fun RoundHeader(branding: BrandingState, modifier: Modifier, pulsing: Boolean = true) {
    val s = branding.settings
    Row(
        modifier
            .padding(horizontal = 32.dp, vertical = 20.dp)
            .panel(Palette.Neutral950.copy(alpha = 0.7f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Sparkles, 20.dp, Palette.Amber400, Modifier.pulsing(pulsing))
        Label(
            s.experienceTitle.ifEmpty { "DIWALI FUN PLAY" }, 20.sp, Palette.Amber200,
            family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider,
        )
        Label(
            buildString {
                if (s.connectorText.isNotEmpty()) append(s.connectorText).append(' ')
                append(s.brandName.ifEmpty { "ItsSpotlight" })
            }.uppercase(),
            12.sp, Palette.Amber400.copy(alpha = 0.9f), weight = FontWeight.Bold, tracking = TrackingWide,
        )
    }
}

/** App.tsx: "Change Code", shown during calibration. */
@Composable
private fun ChangeCodeButton(onClick: () -> Unit, modifier: Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .padding(horizontal = 32.dp, vertical = 20.dp)
            .clip(shape)
            .background(Palette.Neutral950.copy(alpha = 0.7f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.RotateCcw, 14.dp, Palette.Neutral300)
        Label("Change Code", 12.sp, Palette.Neutral300, family = Fonts.Mono)
    }
}
