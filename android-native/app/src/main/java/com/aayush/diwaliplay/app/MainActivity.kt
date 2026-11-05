package com.aayush.diwaliplay.app

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.aayush.diwaliplay.app.ui.GameApp
import com.aayush.diwaliplay.kiosk.KioskController

class MainActivity : ComponentActivity() {
    private val viewModel: GameViewModel by viewModels {
        viewModelFactory { initializer { GameViewModel((application as DiwaliApplication).newDependencies()) } }
    }

    /** The system's permission dialog pauses this activity; that pause mustn't end the round. */
    private var permissionDialogShowing = false

    private val kiosk by lazy { KioskController(this, getSystemService(DevicePolicyManager::class.java)) }

    private val requestCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        permissionDialogShowing = false
        viewModel.retryCamera()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        enterImmersive()
        kiosk.grantCameraIfOwner()
        (application as DiwaliApplication).attachKiosk(kiosk)
        setContent { GameApp(viewModel, onRetryCamera = ::retryCamera, kiosk = kiosk, onExit = ::exitApp) }
        // Asked for up front: a dialog on the start screen interrupts nobody, unlike one mid-calibration.
        if (savedInstanceState == null && !hasCameraPermission()) askForCamera()
    }

    override fun onResume() {
        super.onResume()
        kiosk.restoreLockIfNeeded()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersive()
            kiosk.restoreLockIfNeeded()
        }
    }

    override fun onDestroy() {
        (application as DiwaliApplication).detachKiosk(kiosk)
        super.onDestroy()
    }

    override fun onPause() {
        super.onPause()
        if (!permissionDialogShowing) viewModel.onInterrupted()
    }

    private fun exitApp() {
        kiosk.releaseForExit()
        finishAndRemoveTask()
    }

    private fun retryCamera() {
        if (hasCameraPermission()) viewModel.retryCamera() else askForCamera()
    }

    private fun askForCamera() {
        permissionDialogShowing = true
        requestCamera.launch(Manifest.permission.CAMERA)
    }

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun enterImmersive() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
