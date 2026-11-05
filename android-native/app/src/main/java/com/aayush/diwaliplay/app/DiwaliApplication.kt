package com.aayush.diwaliplay.app

import android.app.Application
import com.aayush.diwaliplay.kiosk.CrashRestarter
import com.aayush.diwaliplay.kiosk.KioskController

class DiwaliApplication : Application() {
    /** Instrumented tests set this before launching the activity. */
    var dependenciesOverride: AppDependencies? = null

    private val lazyContainer = lazy { AppContainer(this) }
    private val container by lazyContainer

    override fun onCreate() {
        super.onCreate()
        if (!underTest()) CrashRestarter.install(this)
    }

    /** The landmarker is what's worth giving back: it's kept loaded across rounds, and the next round can reload it. */
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level == TRIM_MEMORY_RUNNING_CRITICAL || level >= TRIM_MEMORY_COMPLETE) releaseMemory()
    }

    private fun releaseMemory() {
        // Not a reason to build everything: nothing to release if the container doesn't exist yet.
        if (dependenciesOverride == null && lazyContainer.isInitialized()) container.releaseLandmarker()
    }

    /** Only tests have this class. There, a crash must fail the test run, not relaunch the app in the middle of it. */
    private fun underTest(): Boolean = try {
        Class.forName("androidx.test.platform.app.InstrumentationRegistry")
        true
    } catch (_: ClassNotFoundException) {
        false
    }

    /** The activity's lock controller, for the relay. Tests that supply their own dependencies have no relay. */
    fun attachKiosk(controller: KioskController) {
        if (dependenciesOverride == null) container.attachKiosk(controller)
    }

    fun detachKiosk(controller: KioskController) {
        if (dependenciesOverride == null) container.detachKiosk(controller)
    }

    fun newDependencies(): AppDependencies = dependenciesOverride ?: container.newDependencies()
}
