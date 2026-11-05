package com.aayush.diwaliplay.kiosk

import android.app.Application
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ResolveInfo
import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class KioskBootReceiverTest {
    private val app: Application get() = RuntimeEnvironment.getApplication()
    private val boot = Intent(Intent.ACTION_BOOT_COMPLETED)

    @Before
    fun launcher() {
        val launcher = ResolveInfo().apply {
            activityInfo = ActivityInfo().apply {
                packageName = app.packageName
                name = "com.example.Launcher"
            }
        }
        shadowOf(app.packageManager).addResolveInfoForIntent(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(app.packageName),
            launcher,
        )
    }

    private fun makeOwner() {
        val admin = ComponentName(app, KioskDeviceAdminReceiver::class.java)
        val dpm = shadowOf(app.getSystemService(DevicePolicyManager::class.java))
        dpm.setActiveAdmin(admin)
        dpm.setDeviceOwner(admin)
    }

    private fun started(): Intent? = shadowOf(app).nextStartedActivity

    @Test fun lockedDeviceOwnerComesUpOnBoot() {
        makeOwner()
        KioskBootReceiver().onReceive(app, boot)
        val intent = started()!!
        assertThat(intent.component).isEqualTo(ComponentName(app.packageName, "com.example.Launcher"))
        assertThat(intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK).isNotEqualTo(0)
    }

    @Test fun lockTurnedOffLeavesTheDeviceAlone() {
        makeOwner()
        app.getSharedPreferences("kiosk_lock", Context.MODE_PRIVATE).edit().putBoolean("lock_wanted", false).commit()
        KioskBootReceiver().onReceive(app, boot)
        assertThat(started()).isNull()
    }

    /** The system would refuse the start anyway: without an owner, home is how this app comes back. */
    @Test fun withoutDeviceOwnerNothingStarts() {
        KioskBootReceiver().onReceive(app, boot)
        assertThat(started()).isNull()
    }

    @Test fun otherBroadcastsAreIgnored() {
        makeOwner()
        KioskBootReceiver().onReceive(app, Intent(Intent.ACTION_LOCKED_BOOT_COMPLETED))
        assertThat(started()).isNull()
    }
}
