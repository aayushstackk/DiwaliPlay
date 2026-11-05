package com.aayush.diwaliplay.kiosk

import android.app.AlarmManager
import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ResolveInfo
import android.os.Process
import android.os.SystemClock
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlarmManager
import org.robolectric.shadows.ShadowProcess

@RunWith(RobolectricTestRunner::class)
class CrashRestarterTest {
    private val app: Application get() = RuntimeEnvironment.getApplication()
    private val alarms get() = shadowOf(app.getSystemService(AlarmManager::class.java))
    private var previous: Thread.UncaughtExceptionHandler? = null
    private var nowMs = 1_000_000L

    @Before
    fun setUp() {
        previous = Thread.getDefaultUncaughtExceptionHandler()
        ShadowProcess.clearKilledProcesses()
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

    @After
    fun tearDown() {
        Thread.setDefaultUncaughtExceptionHandler(previous)
        ShadowAlarmManager.setCanScheduleExactAlarms(true)
    }

    private fun install(delayMs: Long = 2000) = CrashRestarter.install(app, delayMs) { nowMs }

    private fun crash() =
        Thread.getDefaultUncaughtExceptionHandler()!!.uncaughtException(Thread.currentThread(), IllegalStateException("boom"))

    @Test fun crashRestarterSchedulesRelaunch() {
        install()
        crash()

        val alarm = alarms.nextScheduledAlarm!!
        assertThat(alarm.type).isEqualTo(AlarmManager.ELAPSED_REALTIME_WAKEUP)
        assertThat(alarm.triggerAtMs).isEqualTo(SystemClock.elapsedRealtime() + 2000)
        val shadow = shadowOf(alarm.operation)
        assertThat(shadow.isActivityIntent).isTrue()
        assertThat(shadow.savedIntent.component).isEqualTo(ComponentName(app.packageName, "com.example.Launcher"))
        assertThat(ShadowProcess.wasKilled(Process.myPid())).isTrue()
    }

    @Test fun isInstalledFollowsTheDefaultHandler() {
        Thread.setDefaultUncaughtExceptionHandler(null)
        assertThat(CrashRestarter.isInstalled).isFalse()
        install()
        assertThat(CrashRestarter.isInstalled).isTrue()
        Thread.setDefaultUncaughtExceptionHandler { _, _ -> }
        assertThat(CrashRestarter.isInstalled).isFalse()
    }

    /** The Windows watchdog's maxCrashCountInWindow = 5. Each crash is a new process, so history is on disk. */
    @Test fun fifthRapidCrashStopsRelaunchingButStillDies() {
        repeat(4) { i ->
            install()
            nowMs += 5_000
            crash()
            assertWithMessage("crash ${i + 1}").that(alarms.nextScheduledAlarm).isNotNull()
        }
        install()
        nowMs += 5_000
        ShadowProcess.clearKilledProcesses()
        crash()
        assertThat(alarms.nextScheduledAlarm).isNull()
        assertThat(ShadowProcess.wasKilled(Process.myPid())).isTrue()
    }

    /** The watchdog's 45 s: a run that stable wasn't part of a crash loop, so the count starts over. */
    @Test fun stableRunClearsTheCrashHistory() {
        repeat(4) {
            install()
            nowMs += 5_000
            crash()
            alarms.nextScheduledAlarm
        }
        install()
        nowMs += 46_000
        crash()
        assertThat(alarms.nextScheduledAlarm).isNotNull()
    }

    /** The watchdog's crashWindowMinutes = 5, for crashes that stay just under the stable time. */
    @Test fun crashesOlderThanTheWindowDontCount() {
        repeat(4) {
            install()
            nowMs += 40_000
            crash()
            assertThat(alarms.nextScheduledAlarm).isNotNull()
        }
        // 160 s of history so far; these push the earliest ones out of the 5 minute window.
        repeat(6) {
            install()
            nowMs += 44_000
            crash()
        }
        val prefs = app.getSharedPreferences("crash_restart", Context.MODE_PRIVATE)
        val kept = prefs.getString("crash_times", "")!!.split(',').map { it.toLong() }
        assertThat(kept.first()).isAtLeast(nowMs - 5 * 60_000)
    }

    /** Android 14 denies exact alarms by default; without the fallback the crash handler itself would throw. */
    @Config(sdk = [34])
    @Test fun fallsBackToAnInexactAlarmWithoutThePermission() {
        ShadowAlarmManager.setCanScheduleExactAlarms(false)
        install()
        crash()
        assertThat(alarms.nextScheduledAlarm).isNotNull()
        assertThat(ShadowProcess.wasKilled(Process.myPid())).isTrue()
    }
}
