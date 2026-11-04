package com.aayush.diwaliplay.app

import android.app.Application

class DiwaliApplication : Application() {
    /** Instrumented tests set this before launching the activity. */
    var dependenciesOverride: AppDependencies? = null

    private val container by lazy { AppContainer(this) }

    fun newDependencies(): AppDependencies = dependenciesOverride ?: container.newDependencies()
}
