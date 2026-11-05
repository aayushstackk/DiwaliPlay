package com.aayush.diwaliplay.kiosk

import android.app.admin.DeviceAdminReceiver

/**
 * The component provisioned as device owner, once, during setup:
 * `adb shell dpm set-device-owner com.aayush.diwaliplay.kiosk/.KioskDeviceAdminReceiver`
 */
class KioskDeviceAdminReceiver : DeviceAdminReceiver()
