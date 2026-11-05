package com.aayush.diwaliplay.app

import android.app.Application
import com.aayush.diwaliplay.kiosk.CrashRestarter

class DiwaliApplication : Application() {
    /** Instrumented tests set this before launching the activity. */
    var dependenciesOverride: AppDependencies? = null

    private val container by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        if (!underTest()) CrashRestarter.install(this)
    }

    /** Only tests have this class. There, a crash must fail the test run, not relaunch the app in the middle of it. */
    private fun underTest(): Boolean = try {
        Class.forName("androidx.test.platform.app.InstrumentationRegistry")
        true
    } catch (_: ClassNotFoundException) {
        false
    }

    fun newDependencies(): AppDependencies = dependenciesOverride ?: container.newDependencies()
}
