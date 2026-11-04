package com.aayush.diwaliplay.app.ui

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
import com.aayush.diwaliplay.app.CalibrationUi
import com.aayush.diwaliplay.app.GameViewModel
import com.aayush.diwaliplay.app.ui.theme.DesignCanvas
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.branding.BrandingState
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import kotlinx.coroutines.delay

/**
 * The window, bottom to top: backdrop surface, game surface, then the Compose screen for the phase. Both surfaces sit
 * below the window and show through it (see [BackdropSurfaceView]).
 */
@Composable
fun GameApp(vm: GameViewModel, onRetryCamera: () -> Unit) {
    val phase by vm.phase.collectAsState()
    val branding by vm.branding.collectAsState()

    DesignCanvas {
        Box(Modifier.fillMaxSize()) {
            BackdropLayer(vm, branding)
            GameSurfaceLayer(vm, active = phase != GamePhase.Startup)
            PhaseContent(vm, phase, branding, onRetryCamera)
        }
    }
}

@Composable
private fun BackdropLayer(vm: GameViewModel, branding: BrandingState) {
    var view by remember { mutableStateOf<BackdropSurfaceView?>(null) }
    val kind by vm.backdrop.collectAsState()
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context -> BackdropSurfaceView(context, vm.tracking::latestFrame).also { view = it } },
    )
    val backdrop = view
    val round by vm.round.collectAsState()
    val active = round
    val content = BackdropContent(
        kind,
        branding.localFiles[active?.wallpaperUrl ?: branding.currentWallpaperUrl],
        active?.wallpaperOpacity ?: branding.settings.wallpaperOpacity,
    )
    LaunchedEffect(backdrop, content) { backdrop?.show(content) }
    DisposableEffect(backdrop) { onDispose { backdrop?.shutdown() } }
}

@Composable
private fun PhaseContent(vm: GameViewModel, phase: GamePhase, branding: BrandingState, onRetryCamera: () -> Unit) {
    when (phase) {
        GamePhase.Startup -> {
            val ui by vm.startUi.collectAsState()
            StartScreen(ui, branding, vm.registrationUrl, vm::onKeypad, vm::onClear, vm::onBackspace, vm::onPlay)
        }
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
                is TrackingStatus.Failed -> CameraErrorOverlay(s.reason, onRetryCamera, vm::onInterrupted)
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
        is GamePhase.PhotoCountdown -> PhotoPlaceholder(phase)
        is GamePhase.GameOver -> StepPlaceholder("Score: ${phase.card.score.score}", Tags.CARD_CONTINUE, vm::onCardDone)
        is GamePhase.Spin -> StepPlaceholder("Spin & Win", Tags.SPIN_CONTINUE) { vm.onSpinDone(null) }
        is GamePhase.Feedback -> StepPlaceholder("How was it?", Tags.FEEDBACK_CONTINUE) { vm.onFeedback(null) }
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
