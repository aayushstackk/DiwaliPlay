package com.aayush.diwaliplay.kiosk

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.IntentFilter
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ResolveInfo
import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadows.ShadowDevicePolicyManager
import org.robolectric.util.ReflectionHelpers

/** Robolectric's shadow doesn't cover setKeyguardDisabled or clearDeviceOwnerApp. */
@Implements(DevicePolicyManager::class)
class KeyguardShadow : ShadowDevicePolicyManager() {
    @Implementation
    protected fun setKeyguardDisabled(admin: ComponentName, disabled: Boolean): Boolean {
        keyguardDisabled = disabled
        return true
    }

    @Implementation
    protected fun clearDeviceOwnerApp(packageName: String) {
        clearedOwner = packageName
        ReflectionHelpers.setStaticField(ShadowDevicePolicyManager::class.java, "deviceOwner", null)
    }

    companion object {
        var keyguardDisabled: Boolean? = null
        var clearedOwner: String? = null
    }
}

/** startLockTask throws like this when the task isn't in the foreground yet. */
class RefusingActivity : Activity() {
    var refuse = false
    override fun startLockTask() {
        if (refuse) throw IllegalArgumentException("Invalid task, not in foreground")
        super.startLockTask()
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(shadows = [KeyguardShadow::class])
class KioskControllerTest {
    private val activity: Activity = Robolectric.buildActivity(Activity::class.java).setup().get()
    private val dpm: DevicePolicyManager = activity.getSystemService(DevicePolicyManager::class.java)
    private val shadowDpm: ShadowDevicePolicyManager = shadowOf(dpm)
    private val admin = ComponentName(activity, KioskDeviceAdminReceiver::class.java)
    private val pkg: String = activity.packageName
    private var previous: Thread.UncaughtExceptionHandler? = null

    private fun controller() = KioskController(activity, dpm)

    private fun makeOwner() {
        shadowDpm.setActiveAdmin(admin)
        shadowDpm.setDeviceOwner(admin)
    }

    private fun makeHome() {
        val home = ResolveInfo().apply {
            activityInfo = ActivityInfo().apply {
                packageName = pkg
                name = "Home"
            }
        }
        shadowOf(activity.packageManager).addResolveInfoForIntent(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
            home,
        )
    }

    private fun lockModeIs(state: Int) = shadowOf(activity.getSystemService(ActivityManager::class.java)).setLockTaskModeState(state)

    private fun preferredHome(): List<ComponentName> {
        val filters = ArrayList<IntentFilter>()
        val names = ArrayList<ComponentName>()
        shadowOf(activity.packageManager).getPersistentPreferredActivities(filters, names, pkg)
        assertThat(filters.all { it.hasAction(Intent.ACTION_MAIN) && it.hasCategory(Intent.CATEGORY_HOME) && it.hasCategory(Intent.CATEGORY_DEFAULT) }).isTrue()
        return names
    }

    @Before fun setUp() {
        previous = Thread.getDefaultUncaughtExceptionHandler()
        KeyguardShadow.keyguardDisabled = null
        KeyguardShadow.clearedOwner = null
        // The app's manifest declares this; the shadow's grant looks it up on the test package.
        shadowOf(activity.packageManager).getInternalMutablePackageInfo(pkg).requestedPermissions = arrayOf(Manifest.permission.CAMERA)
    }

    @After fun tearDown() = Thread.setDefaultUncaughtExceptionHandler(previous)

    @Test fun enableLockAsDeviceOwnerSetsPackagesAndKeyguard() {
        makeOwner()
        val c = controller()
        assertThat(c.isDeviceOwner).isTrue()

        c.enableLock()

        assertThat(dpm.getLockTaskPackages(admin).toList()).containsExactly(pkg)
        assertThat(KeyguardShadow.keyguardDisabled).isTrue()
        assertThat(preferredHome()).containsExactly(ComponentName(activity, activity.javaClass))
        assertThat(dpm.getPermissionGrantState(admin, pkg, Manifest.permission.CAMERA))
            .isEqualTo(DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        assertThat(shadowOf(activity).isLockTask).isTrue()
        assertThat(c.lockWanted).isTrue()
    }

    @Test fun enableLockWithoutDeviceOwnerFallsBackToPinning() {
        val c = controller()
        assertThat(c.isDeviceOwner).isFalse()

        c.enableLock()

        assertThat(shadowOf(activity).isLockTask).isTrue()
        assertThat(KeyguardShadow.keyguardDisabled).isNull()
        assertThat(preferredHome()).isEmpty()
        assertThat(c.lockWanted).isTrue()
    }

    @Test fun disableLockUndoesEverything() {
        makeOwner()
        val c = controller()
        c.enableLock()

        c.disableLock()

        assertThat(shadowOf(activity).isLockTask).isFalse()
        assertThat(dpm.getLockTaskPackages(admin).toList()).isEmpty()
        assertThat(KeyguardShadow.keyguardDisabled).isFalse()
        assertThat(preferredHome()).isEmpty()
        assertThat(c.lockWanted).isFalse()
    }

    /** Android 14 also makes a persistent preferred home the ordinary default, and clearing the first leaves that. */
    @Test fun disableLockAlsoDropsTheOrdinaryDefaultHome() {
        makeOwner()
        val c = controller()
        c.enableLock()
        val home = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        @Suppress("DEPRECATION")
        activity.packageManager.addPreferredActivity(home, 0, null, ComponentName(activity, activity.javaClass))

        c.disableLock()

        val names = ArrayList<ComponentName>()
        activity.packageManager.getPreferredActivities(ArrayList(), names, pkg)
        assertThat(names).isEmpty()
    }

    @Test fun disableLockWithoutDeviceOwnerOnlyStopsPinning() {
        val c = controller()
        c.enableLock()
        c.disableLock()
        assertThat(shadowOf(activity).isLockTask).isFalse()
        assertThat(KeyguardShadow.keyguardDisabled).isNull()
    }

    @Test fun removeDeviceOwnerUndoesTheLockThenGivesUpOwnership() {
        makeOwner()
        val c = controller()
        c.enableLock()

        c.removeDeviceOwner()

        assertThat(KeyguardShadow.clearedOwner).isEqualTo(pkg)
        assertThat(c.isDeviceOwner).isFalse()
        assertThat(c.lockWanted).isFalse()
        assertThat(shadowOf(activity).isLockTask).isFalse()
        assertThat(KeyguardShadow.keyguardDisabled).isFalse()
        assertThat(preferredHome()).isEmpty()
        // No looking at the lock task packages here: only an owner may, and the shadow enforces the same for setting
        // them, so disableLock can't have run after ownership went.
    }

    @Test fun removeDeviceOwnerWithoutBeingOwnerDoesNothing() {
        controller().removeDeviceOwner()
        assertThat(KeyguardShadow.clearedOwner).isNull()
    }

    @Test fun statusIsOnlyAutoLaunchWhileTheOwnerWantsTheLock() {
        makeOwner()
        val c = controller()
        c.enableLock()
        assertThat(c.status().autoLaunch).isTrue()
        c.disableLock()
        assertThat(c.status().autoLaunch).isFalse()
    }

    /** Spec amendment: a crash handler whose relaunch the system will block isn't watching anything. */
    @Test fun watchdogNeedsAnOwnerOrHomeForItsRelaunchToWork() {
        Thread.setDefaultUncaughtExceptionHandler(null)
        CrashRestarter.install(activity.applicationContext)
        assertThat(controller().status().watchdogRunning).isFalse()

        makeHome()
        assertThat(controller().status().watchdogRunning).isTrue()
    }

    @Test fun watchdogAsOwnerEvenWithTheLockOff() {
        makeOwner()
        CrashRestarter.install(activity.applicationContext)
        val c = controller()
        c.disableLock()
        assertThat(c.status().watchdogRunning).isTrue()
    }

    @Test fun restoreIfNeededPinsOnlyOnceWithoutAnOwner() {
        val c = controller()
        c.enableLock()
        activity.stopLockTask()

        val next = controller()
        next.restoreLockIfNeeded()
        assertThat(shadowOf(activity).isLockTask).isTrue()
        activity.stopLockTask()

        next.restoreLockIfNeeded() // would put the system's prompt up again
        assertThat(shadowOf(activity).isLockTask).isFalse()
    }

    @Test fun restoreIfNeededKeepsTryingAsOwnerUntilTheLockHolds() {
        makeOwner()
        val refusing = Robolectric.buildActivity(RefusingActivity::class.java).setup().get()
        val c = KioskController(refusing, dpm)

        refusing.refuse = true
        c.restoreLockIfNeeded()
        assertThat(shadowOf(refusing).isLockTask).isFalse()

        refusing.refuse = false
        c.restoreLockIfNeeded() // the first attempt didn't take
        assertThat(shadowOf(refusing).isLockTask).isTrue()

        refusing.stopLockTask()
        c.restoreLockIfNeeded() // it held, so that was the last
        assertThat(shadowOf(refusing).isLockTask).isFalse()
    }

    @Test fun statusMapsFieldsAndPlatformAndroid() {
        makeOwner()
        Thread.setDefaultUncaughtExceptionHandler(null)

        val idle = controller().status()
        assertThat(idle.platform).isEqualTo("android")
        assertThat(idle.appRunning).isTrue()
        assertThat(idle.backProtection).isFalse()
        assertThat(idle.guardianRunning).isFalse()
        assertThat(idle.autoLaunch).isTrue() // device owner
        assertThat(idle.watchdogRunning).isFalse()

        CrashRestarter.install(activity.applicationContext)
        lockModeIs(ActivityManager.LOCK_TASK_MODE_LOCKED)
        val locked = controller().status()
        assertThat(locked.backProtection).isTrue()
        assertThat(locked.guardianRunning).isTrue()
        assertThat(locked.watchdogRunning).isTrue()

        lockModeIs(ActivityManager.LOCK_TASK_MODE_PINNED)
        assertThat(controller().status().backProtection).isTrue()
    }

    @Test fun autoLaunchNeedsDeviceOwnerOrDefaultHome() {
        assertThat(controller().status().autoLaunch).isFalse()
        makeHome()
        assertThat(controller().status().autoLaunch).isTrue()
    }

    @Test fun statusRecordsTheLastChange() {
        val c = controller()
        assertThat(c.status().lastStateChange).isNull()
        c.enableLock("Remote relay")
        assertThat(c.status().lastStateChangeReason).isEqualTo("Remote relay")
        assertThat(c.status().lastStateChange).isNotEmpty()
        c.disableLock()
        assertThat(c.status().lastStateChangeReason).isEqualTo("Admin screen")
    }

    @Test fun restoreLockReappliesAcrossRestartsOnlyIfWanted() {
        val c = controller()
        c.restoreLock()
        assertThat(shadowOf(activity).isLockTask).isFalse()

        c.enableLock()
        val after = Robolectric.buildActivity(Activity::class.java).setup().get()
        val again = KioskController(after, dpm)
        assertThat(again.lockWanted).isTrue()
        again.restoreLock()
        assertThat(shadowOf(after).isLockTask).isTrue()
    }

    /** Provisioned as device owner and never touched: the spec's full lock, from the first launch. */
    @Test fun deviceOwnerWantsTheLockUntilToldOtherwise() {
        makeOwner()
        val c = controller()
        assertThat(c.lockWanted).isTrue()
        c.disableLock()
        assertThat(controller().lockWanted).isFalse()
    }

    @Test fun ownerGrantsCameraWithoutStartingTheLock() {
        makeOwner()
        controller().grantCameraIfOwner()
        assertThat(dpm.getPermissionGrantState(admin, pkg, Manifest.permission.CAMERA))
            .isEqualTo(DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        assertThat(shadowOf(activity).isLockTask).isFalse()
    }

}
