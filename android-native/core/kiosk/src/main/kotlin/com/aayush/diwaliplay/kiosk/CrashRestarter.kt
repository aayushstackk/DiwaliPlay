package com.aayush.diwaliplay.kiosk

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.Log

private const val TAG = "CrashRestarter"
private const val PREFS_NAME = "crash_restart"
private const val KEY_TIMES = "crash_times"

/** windows-kiosk/kiosk-config.json `maxCrashCountInWindow` and `crashWindowMinutes`. */
private const val MAX_CRASHES_IN_WINDOW = 5
private const val CRASH_WINDOW_MS = 5 * 60_000L

/** windows-kiosk/watchdog.ps1: a run longer than this "has been stable", which resets the crash history. */
private const val STABLE_MS = 45_000L

/**
 * On an uncaught exception: logs it, schedules a relaunch and kills the process, the native version of the Windows
 * watchdog. The relaunch takes about 5 s, not `delayMs`, because AlarmManager has that minimum for ordinary apps. And
 * the system only lets it start the activity for a device owner or the default home app. A crash loop (see the
 * constants) stops relaunching, unlike the watchdog, which pauses 30 s and carries on; being the home app can still
 * bring the app back.
 */
object CrashRestarter {
    /** True while the crash handler really is the process's default handler. */
    val isInstalled: Boolean get() = Thread.getDefaultUncaughtExceptionHandler() is Handler

    fun install(context: Context, delayMs: Long = 2000) = install(context, delayMs, System::currentTimeMillis)

    internal fun install(context: Context, delayMs: Long, now: () -> Long) {
        Thread.setDefaultUncaughtExceptionHandler(Handler(context.applicationContext, delayMs, now, now()))
    }

    private class Handler(
        private val context: Context,
        private val delayMs: Long,
        private val now: () -> Long,
        private val startedAt: Long,
    ) : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(thread: Thread, error: Throwable) {
            try {
                Log.e(TAG, "uncaught exception on ${thread.name}", error)
                if (recordCrash() < MAX_CRASHES_IN_WINDOW) {
                    scheduleRelaunch()
                } else {
                    Log.e(TAG, "$MAX_CRASHES_IN_WINDOW crashes within ${CRASH_WINDOW_MS / 60_000} min: not relaunching")
                }
            } catch (e: Throwable) {
                Log.e(TAG, "couldn't schedule the relaunch", e) // dying is still the right thing to do
            } finally {
                Process.killProcess(Process.myPid())
            }
        }

        /** How many crashes the current window now holds. On disk because each crash is a new process. */
        private fun recordCrash(): Int {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val t = now()
            val earlier = if (t - startedAt > STABLE_MS) {
                emptyList()
            } else {
                prefs.getString(KEY_TIMES, null).orEmpty().split(',')
                    .mapNotNull { it.toLongOrNull() }
                    .filter { it in (t - CRASH_WINDOW_MS)..t }
            }
            val times = earlier + t
            // Not apply(): the process is about to die.
            prefs.edit().putString(KEY_TIMES, times.joinToString(",")).commit()
            return times.size
        }

        private fun scheduleRelaunch() {
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launch == null) {
                Log.e(TAG, "no launch activity to relaunch")
                return
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val operation = PendingIntent.getActivity(
                context, 0, launch, PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val alarms = context.getSystemService(AlarmManager::class.java)
            val at = SystemClock.elapsedRealtime() + delayMs
            // Exact alarms can be denied from Android 12, and calling setExact then throws.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
                alarms.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, operation)
            } else {
                Log.w(TAG, "exact alarms not allowed: the relaunch may come late")
                alarms.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, operation)
            }
        }
    }
}
