package com.aayush.diwaliplay.kiosk

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.util.Log
import com.aayush.diwaliplay.model.KioskDeviceStatus
import java.time.Instant

private const val TAG = "KioskController"
private const val PREFS_NAME = "kiosk_lock"
private const val KEY_WANTED = "lock_wanted"
private const val KEY_CHANGED_AT = "last_change"
private const val KEY_CHANGE_REASON = "last_change_reason"
private const val PLATFORM = "android"

internal fun isLockWanted(context: Context, deviceOwner: Boolean): Boolean =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_WANTED, deviceOwner)

/** Spec §9's lock tiers. Lock calls are main-thread, like the [Activity] methods they make. */
class KioskController(private val activity: Activity, private val dpm: DevicePolicyManager) {
    private val prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val admin = ComponentName(activity, KioskDeviceAdminReceiver::class.java)
    private val pkg: String = activity.packageName

    val isDeviceOwner: Boolean get() = dpm.isDeviceOwnerApp(pkg)

    /**
     * What the operator last chose, kept across restarts: lock task ends with the process, so [restoreLock] applies it
     * again. A device owner that nobody has told otherwise wants the lock; that's what it was provisioned for.
     */
    val lockWanted: Boolean get() = isLockWanted(activity, isDeviceOwner)

    /** Locked or pinned right now. Pinning can lag behind [enableLock], until the user accepts the system's prompt. */
    val isLockActive: Boolean
        get() = activity.getSystemService(ActivityManager::class.java).lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE

    /**
     * Device owner: full lock, home and camera. Otherwise screen pinning, which shows the system's prompt.
     * [reason] is reported in [status], as `lastStateChangeReason`.
     */
    fun enableLock(reason: String = REASON_ADMIN_SCREEN) {
        remember(wanted = true, reason)
        applyLock()
    }

    /** Puts back what the last launch had. Call once the activity is resumed: it has to be in the foreground. */
    fun restoreLock() {
        if (lockWanted && !isLockActive) applyLock()
    }

    private fun applyLock() {
        if (isDeviceOwner) {
            dpm.setLockTaskPackages(admin, arrayOf(pkg))
            if (!dpm.setKeyguardDisabled(admin, true)) Log.w(TAG, "keyguard not disabled: a secure lock screen is set")
            val home = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, home, ComponentName(activity, activity.javaClass))
            grantCameraIfOwner()
        }
        try {
            activity.startLockTask()
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "startLockTask refused: not in the foreground", e) // the status reports it as not locked
        }
    }

    /** Back to a normal app, including no longer being forced as home: otherwise Home couldn't leave the kiosk. */
    fun disableLock(reason: String = REASON_ADMIN_SCREEN) {
        remember(wanted = false, reason)
        stopLockTask()
        if (isDeviceOwner) {
            dpm.setLockTaskPackages(admin, emptyArray())
            dpm.setKeyguardDisabled(admin, false)
            dpm.clearPackagePersistentPreferredActivities(admin, pkg)
            // The grant stays, but the policy no longer pins it.
            dpm.setPermissionGrantState(admin, pkg, Manifest.permission.CAMERA, DevicePolicyManager.PERMISSION_GRANT_STATE_DEFAULT)
        }
    }

    /** So the runtime permission prompt never appears on a provisioned kiosk. Does nothing otherwise. */
    fun grantCameraIfOwner() {
        if (!isDeviceOwner) return
        dpm.setPermissionGrantState(admin, pkg, Manifest.permission.CAMERA, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
    }

    /** Admin "Exit": a locked task can't finish. The operator's choice stands, so the next launch locks again. */
    fun releaseForExit() = stopLockTask()

    private fun stopLockTask() {
        try {
            activity.stopLockTask()
        } catch (e: SecurityException) {
            Log.w(TAG, "stopLockTask refused", e) // this task wasn't the one locked
        }
    }

    /**
     * The relay's view of this device (spec §9's mapping). `connected` stays false: only the relay client knows that,
     * and it fills it in.
     */
    fun status(): KioskDeviceStatus {
        val active = isLockActive
        return KioskDeviceStatus(
            backProtection = active,
            autoLaunch = isDeviceOwner || isDefaultHome(),
            watchdogRunning = CrashRestarter.isInstalled,
            guardianRunning = active,
            appRunning = true,
            lastStateChange = prefs.getString(KEY_CHANGED_AT, null),
            lastStateChangeReason = prefs.getString(KEY_CHANGE_REASON, null),
            platform = PLATFORM,
        )
    }

    private fun isDefaultHome(): Boolean {
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return activity.packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName == pkg
    }

    private fun remember(wanted: Boolean, reason: String) {
        prefs.edit()
            .putBoolean(KEY_WANTED, wanted)
            .putString(KEY_CHANGED_AT, Instant.now().toString())
            .putString(KEY_CHANGE_REASON, reason)
            .apply()
    }

    companion object {
        const val REASON_ADMIN_SCREEN = "Admin screen"
    }
}
