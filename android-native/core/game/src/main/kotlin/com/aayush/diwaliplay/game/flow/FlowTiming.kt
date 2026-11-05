package com.aayush.diwaliplay.game.flow

/** App.tsx: READY → startCountdownSequence after a 350 ms celebration flash. */
internal const val READY_FLASH_MS = 350.0

/** App.tsx startCountdownSequence: setInterval(…, 850) for 3 → 2 → 1 → GO → PLAYING. */
internal const val COUNTDOWN_STEP_MS = 850.0

/** PhotoCaptureModal: 5-second countdown, one tick per 1000 ms. */
internal const val PHOTO_COUNTDOWN_START = 5
internal const val PHOTO_STEP_MS = 1000.0

/** PhotoCaptureModal camera-error auto-advance: 2.2 s, then onPhotoCaptured(null). */
internal const val PHOTO_CAMERA_ERROR_MS = 2200.0

/**
 * PhotoCaptureModal's 8 s camera watchdog: how long the countdown waits for the camera before the camera-error path.
 * The same limit also guards the capture itself, so the round can never get stuck.
 */
internal const val PHOTO_WATCHDOG_MS = 8000.0

/** App.tsx target popup burst: (innerWidth / 2, innerHeight * 0.35) in the 1920x1080 game space. */
internal const val TARGET_BURST_X = 1920.0 / 2
internal const val TARGET_BURST_Y = 1080.0 * 0.35
