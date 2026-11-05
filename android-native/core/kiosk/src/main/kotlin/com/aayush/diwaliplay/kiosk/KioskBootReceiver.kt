package com.aayush.diwaliplay.kiosk

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Starts a device owner kiosk on boot. The preferred home isn't enough on its own: the system goes straight to a
 * launcher whose home filter has a higher priority than ours without looking at preferences, as Google TV's has.
 */
class KioskBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val owner = context.getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(context.packageName)
        if (!owner || !isLockWanted(context, owner)) return
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
