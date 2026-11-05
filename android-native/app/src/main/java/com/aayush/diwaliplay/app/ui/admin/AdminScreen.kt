package com.aayush.diwaliplay.app.ui.admin

import android.content.pm.ApplicationInfo
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aayush.diwaliplay.app.AdminDependencies
import com.aayush.diwaliplay.app.GameViewModel
import com.aayush.diwaliplay.app.TrackingSource
import com.aayush.diwaliplay.app.ui.Centered
import com.aayush.diwaliplay.app.ui.Icon
import com.aayush.diwaliplay.app.ui.Icons
import com.aayush.diwaliplay.app.ui.Label
import com.aayush.diwaliplay.app.ui.LivePreview
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.app.ui.TrackingWider
import com.aayush.diwaliplay.app.ui.panel
import com.aayush.diwaliplay.app.ui.theme.Fonts
import com.aayush.diwaliplay.app.ui.theme.Palette
import com.aayush.diwaliplay.branding.ServerConfig
import com.aayush.diwaliplay.kiosk.AdminPin
import com.aayush.diwaliplay.kiosk.KioskController
import com.aayush.diwaliplay.kiosk.relay.RelayManager
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest

private const val LOCK_POLL_MS = 1_000L
internal const val ADMIN_IDLE_TIMEOUT_MS = 2 * 60_000L

/** MediaPipe's hand model: which of the 21 landmarks each bone joins. */
private val HAND_BONES = listOf(
    0 to 1, 1 to 2, 2 to 3, 3 to 4,
    0 to 5, 5 to 6, 6 to 7, 7 to 8,
    5 to 9, 9 to 10, 10 to 11, 11 to 12,
    9 to 13, 13 to 14, 14 to 15, 15 to 16,
    13 to 17, 17 to 18, 18 to 19, 19 to 20, 0 to 17,
)

/**
 * Spec §9's admin screen, reached only from the start screen. [relaySection] is where relay pairing goes.
 * [kiosk] is null only where there's no activity to lock (tests that compose this alone).
 */
@Composable
fun AdminScreen(
    vm: GameViewModel,
    admin: AdminDependencies,
    kiosk: KioskController?,
    onRetryCamera: () -> Unit,
    onClose: () -> Unit,
    onExit: () -> Unit,
    relaySection: @Composable ColumnScope.() -> Unit = { RelaySlot(admin.relay) },
) {
    var lockWanted by remember { mutableStateOf(kiosk?.lockWanted == true) }
    var isOwner by remember { mutableStateOf(kiosk?.isDeviceOwner == true) }
    var removingOwner by remember { mutableStateOf(false) }
    val activity = remember { MutableStateFlow(0L) }
    val latestOnClose by rememberUpdatedState(onClose)

    BackHandler(onBack = onClose)
    // Left open, this screen mustn't be open to the next visitor. A flow, so that touches recompose nothing.
    LaunchedEffect(activity) {
        activity.collectLatest {
            delay(ADMIN_IDLE_TIMEOUT_MS)
            latestOnClose()
        }
    }
    // However this screen goes away, the camera goes back to being the round's.
    DisposableEffect(Unit) { onDispose { vm.stopCameraTest() } }

    Box(
        Modifier
            .fillMaxSize()
            .testTag(Tags.ADMIN_SCREEN)
            // Watches on the way down, and consumes nothing.
            .pointerInput(activity) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent(PointerEventPass.Initial)
                        activity.value++
                    }
                }
            }
            .onPreviewKeyEvent {
                activity.value++
                false
            },
    ) {
    Column(Modifier.fillMaxSize().background(Palette.Background).padding(32.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Label(
                "KIOSK ADMIN", 32.sp, Palette.Amber100,
                family = Fonts.Display, weight = FontWeight.Black, tracking = TrackingWider,
            )
            Spacer(Modifier.weight(1f))
            CloseButton(onClose)
        }
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                KioskLockSection(kiosk, lockWanted, isOwner, { lockWanted = it }, { removingOwner = true })
                ServerSection(admin.serverConfig, onSaved = { admin.relay?.addressChanged() }) { activity.value++ }
                Section("Relay pairing", Modifier.testTag(Tags.ADMIN_RELAY), relaySection)
            }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                CameraTestSection(vm, onRetryCamera)
                PerfSection(vm)
                DeviceInfoSection(kiosk, lockWanted, isOwner)
                ExitSection(lockWanted, onExit)
            }
        }
    }
    if (removingOwner) {
        RemoveOwnerOverlay(
            pin = admin.pin,
            onRemove = {
                kiosk?.removeDeviceOwner()
                isOwner = kiosk?.isDeviceOwner == true
                lockWanted = kiosk?.lockWanted == true
                removingOwner = false
            },
            onCancel = { removingOwner = false },
        )
    }
    }
}

/** Device owner can't be got back without adb, so this asks twice: are you sure, then the PIN again. */
@Composable
internal fun RemoveOwnerOverlay(pin: AdminPin, onRemove: () -> Unit, onCancel: () -> Unit) {
    var confirmed by remember { mutableStateOf(false) }
    if (confirmed) {
        AdminPinDialog(pin, creating = false, onDone = onRemove, onCancel = onCancel, title = "PIN TO REMOVE OWNER")
        return
    }
    Box(
        Modifier
            .fillMaxSize()
            .testTag(Tags.ADMIN_OWNER_CONFIRM)
            .background(Palette.Background.copy(alpha = 0.92f))
            .pointerInput(Unit) { detectTapGestures {} },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .width(640.dp)
                .panel(Palette.Neutral900, Palette.Rose500.copy(alpha = 0.5f), RoundedCornerShape(24.dp))
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Label("Remove device owner?", 24.sp, Palette.Rose200, family = Fonts.Display, weight = FontWeight.Bold, align = TextAlign.Start)
            Hint(
                "This turns the kiosk lock off and gives up full lock, start on boot and crash restart. " +
                    "Getting them back means provisioning this device again over adb, with no accounts on it.",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AdminButton("Cancel", Tags.ADMIN_OWNER_CANCEL, Palette.Neutral800, Palette.Neutral300, onCancel)
                AdminButton("Continue", Tags.ADMIN_OWNER_CONTINUE, Palette.Rose500, Palette.Neutral950) { confirmed = true }
            }
        }
    }
}

@Composable
private fun ColumnScope.RelaySlot(relay: RelayManager?) {
    if (relay == null) Hint("Not available.") else RelaySection(relay)
}

@Composable
private fun CloseButton(onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        Modifier
            .testTag(Tags.ADMIN_CLOSE)
            .clip(shape)
            .panel(Palette.Neutral900, Palette.Neutral700, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Close, 20.dp, Palette.Neutral300)
        Label("Back to game", 18.sp, Palette.Neutral200, weight = FontWeight.Bold)
    }
}

@Composable
private fun Section(title: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .panel(Palette.Neutral900.copy(alpha = 0.9f), Palette.Amber500.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Label(title, 22.sp, Palette.Amber200, family = Fonts.Display, weight = FontWeight.Bold, align = TextAlign.Start)
        content()
    }
}

@Composable
internal fun Hint(text: String, modifier: Modifier = Modifier, color: Color = Palette.Neutral400) {
    Label(text, 17.sp, color, modifier, align = TextAlign.Start)
}

/** A label, some explanation, and the switch on the right. */
@Composable
private fun SwitchRow(label: String, checked: Boolean, tag: String, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .testTag(tag)
            .toggleable(checked, enabled = enabled, role = Role.Switch, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Label(label, 19.sp, Palette.Neutral100, Modifier.weight(1f), weight = FontWeight.Bold, align = TextAlign.Start)
        Box(
            Modifier
                .size(64.dp, 34.dp)
                .background(if (checked) Palette.Amber500 else Palette.Neutral700, RoundedCornerShape(17.dp)),
        ) {
            Box(
                Modifier
                    .offset(x = if (checked) 33.dp else 3.dp, y = 3.dp)
                    .size(28.dp)
                    .background(if (enabled) Color.White else Palette.Neutral500, CircleShape),
            )
        }
    }
}

@Composable
private fun KioskLockSection(
    kiosk: KioskController?,
    wanted: Boolean,
    isOwner: Boolean,
    onWantedChange: (Boolean) -> Unit,
    onRemoveOwner: () -> Unit,
) {
    Section("Kiosk lock") {
        if (kiosk == null) {
            Hint("Not available here.")
            return@Section
        }
        // Pinning starts only when the system's prompt is accepted, and anything can end it, so this has to look.
        val active by produceState(kiosk.isLockActive) {
            while (true) {
                value = kiosk.isLockActive
                delay(LOCK_POLL_MS)
            }
        }
        SwitchRow("Lock this kiosk", wanted, Tags.ADMIN_LOCK) { on ->
            onWantedChange(on)
            if (on) kiosk.enableLock() else kiosk.disableLock()
        }
        Hint(lockSummary(isOwner, wanted, active), Modifier.testTag(Tags.ADMIN_LOCK_STATUS))
        if (isOwner) AdminButton("Remove device owner", Tags.ADMIN_REMOVE_OWNER, Palette.Rose500.copy(alpha = 0.25f), Palette.Rose200, onRemoveOwner)
    }
}

internal fun lockSummary(deviceOwner: Boolean, wanted: Boolean, active: Boolean): String {
    val tier = if (deviceOwner) "Full lock (device owner)." else "Screen pinning: this app isn't the device owner."
    val state = when {
        active -> "Active now."
        wanted -> if (deviceOwner) "Not active." else "Not active: accept the system's prompt."
        else -> "Off."
    }
    return "$tier $state"
}

@Composable
private fun ServerSection(config: ServerConfig, onSaved: () -> Unit, onTyped: () -> Unit) {
    val context = LocalContext.current
    val debuggable = remember { context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0 }
    var api by remember { mutableStateOf(config.apiBaseUrl) }
    var web by remember { mutableStateOf(config.publicWebUrl) }
    var apiError by remember { mutableStateOf<String?>(null) }
    var webError by remember { mutableStateOf<String?>(null) }
    var saved by remember { mutableStateOf(false) }

    Section("Server addresses") {
        AddressField("API server", api, Tags.ADMIN_API_URL, apiError, Tags.ADMIN_API_ERROR) {
            onTyped() // an on-screen keyboard's typing never reaches this window as key events
            api = it
            apiError = null
            saved = false
        }
        AddressField("Public web address (the QR code)", web, Tags.ADMIN_WEB_URL, webError, Tags.ADMIN_WEB_ERROR) {
            onTyped()
            web = it
            webError = null
            saved = false
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            AdminButton("Save", Tags.ADMIN_SERVERS_SAVE) {
                val apiCheck = checkServerAddress(api, debuggable)
                val webCheck = checkServerAddress(web, debuggable)
                apiError = (apiCheck as? AddressCheck.Rejected)?.message
                webError = (webCheck as? AddressCheck.Rejected)?.message
                if (apiCheck is AddressCheck.Ok && webCheck is AddressCheck.Ok) {
                    config.apiBaseUrl = apiCheck.address
                    config.publicWebUrl = webCheck.address
                    // Blank went back to the default: show which address is now in use.
                    api = config.apiBaseUrl
                    web = config.publicWebUrl
                    saved = true
                    onSaved()
                }
            }
            if (saved) Hint("Saved", Modifier.testTag(Tags.ADMIN_SERVERS_SAVED), Palette.Emerald300)
            Hint("Leave one blank for its default.")
        }
    }
}

@Composable
private fun AddressField(
    label: String,
    value: String,
    tag: String,
    error: String?,
    errorTag: String,
    onChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Hint(label)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = TextStyle(color = Palette.Neutral100, fontSize = 19.sp, fontFamily = Fonts.Mono),
            cursorBrush = SolidColor(Palette.Amber400),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier
                .fillMaxWidth()
                .testTag(tag)
                .panel(
                    Palette.Neutral950,
                    if (error != null) Palette.Rose500 else Palette.Neutral700,
                    RoundedCornerShape(10.dp),
                )
                .padding(horizontal = 14.dp, vertical = 12.dp),
        )
        if (error != null) Hint(error, Modifier.testTag(errorTag), Palette.Rose300)
    }
}

@Composable
internal fun AdminButton(text: String, tag: String, fill: Color = Palette.Amber500, color: Color = Palette.Neutral950, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Centered(
        Modifier
            .testTag(tag)
            .clip(shape)
            .background(fill, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 12.dp),
    ) { Label(text, 18.sp, color, weight = FontWeight.Bold) }
}

@Composable
private fun CameraTestSection(vm: GameViewModel, onRetryCamera: () -> Unit) {
    val on by vm.cameraTestOn.collectAsState()
    Section("Camera test") {
        SwitchRow("Live camera and hand landmarks", on, Tags.ADMIN_CAMERA_TEST) { want ->
            if (want) vm.startCameraTest() else vm.stopCameraTest()
        }
        if (on) {
            val status by vm.cameraStatus.collectAsState()
            CameraTestView(vm.tracking, Modifier.fillMaxWidth().aspectRatio(16f / 9f).testTag(Tags.ADMIN_CAMERA_VIEW))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Hint(trackingLines(status).joinToString("  ·  "), Modifier.weight(1f))
                if (status is TrackingStatus.CameraLost || status is TrackingStatus.Failed) {
                    AdminButton("Retry", "admin_camera_retry", onClick = onRetryCamera)
                }
            }
        }
    }
}

/** The mirrored analysis frames with the landmarks on top, flipped like the game's own skeleton. Only drawing runs per frame. */
@Composable
private fun CameraTestView(tracking: TrackingSource, modifier: Modifier) {
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(tracking) {
        while (true) {
            withFrameMillis { tick++ }
        }
    }
    Box(modifier.clip(RoundedCornerShape(10.dp)).background(Color.Black)) {
        LivePreview(tracking::latestFrame, Modifier.fillMaxSize())
        Canvas(Modifier.fillMaxSize()) {
            @Suppress("UNUSED_EXPRESSION") tick // read here so that only this draw follows it
            for (hand in tracking.snapshot().render) {
                val marks = hand.marks?.takeIf { hand.detected } ?: continue
                fun at(i: Int) = Offset((1f - marks[i].x.toFloat()) * size.width, marks[i].y.toFloat() * size.height)
                for ((a, b) in HAND_BONES) {
                    if (a < marks.size && b < marks.size) drawLine(Palette.Amber400, at(a), at(b), strokeWidth = 3.dp.toPx())
                }
                for (i in marks.indices) drawCircle(Palette.Rose400, 4.dp.toPx(), at(i))
            }
        }
    }
}

@Composable
private fun PerfSection(vm: GameViewModel) {
    val on by vm.perfOverlay.collectAsState()
    Section("Performance overlay") {
        SwitchRow("Render fps, inference ms, delegate and camera fps", on, Tags.ADMIN_PERF, onChange = vm::setPerfOverlay)
    }
}

@Composable
private fun DeviceInfoSection(kiosk: KioskController?, lockWanted: Boolean, isOwner: Boolean) {
    val context = LocalContext.current
    val metrics = context.resources.displayMetrics
    val version = remember {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
    }
    val lines = remember(kiosk, lockWanted, isOwner) {
        val status = kiosk?.status()
        listOf(
            "Device" to "${Build.MANUFACTURER} ${Build.MODEL}",
            "Android" to "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            "Screen" to "${metrics.widthPixels} x ${metrics.heightPixels}",
            "App" to "$version (${context.packageName})",
            "Device owner" to yesNo(kiosk?.let { isOwner }),
            "Starts on boot" to yesNo(status?.autoLaunch),
            "Crash restart" to yesNo(status?.watchdogRunning),
        )
    }
    Section("Device info", Modifier.testTag(Tags.ADMIN_DEVICE_INFO)) {
        for ((name, value) in lines) {
            Row {
                Label(name, 17.sp, Palette.Neutral400, Modifier.weight(0.35f), align = TextAlign.Start)
                Label(value, 17.sp, Palette.Neutral100, Modifier.weight(0.65f), family = Fonts.Mono, align = TextAlign.Start)
            }
        }
    }
}

private fun yesNo(value: Boolean?) = when (value) {
    true -> "Yes"
    false -> "No"
    null -> "Unknown"
}

@Composable
private fun ExitSection(lockWanted: Boolean, onExit: () -> Unit) {
    Section("Exit") {
        if (lockWanted) Hint("The lock is on, so the app comes back: straight away where it's the home app, otherwise at its next start. Turn the lock off above to leave the kiosk.")
        AdminButton("Exit app", Tags.ADMIN_EXIT, Palette.Rose500.copy(alpha = 0.25f), Palette.Rose200, onExit)
    }
}
