package com.aayush.diwaliplay.app.ui

/** Compose test tags. */
object Tags {
    const val START_SCREEN = "start_screen"
    const val QR = "qr_code"
    const val CONNECTING = "connecting"
    const val ERROR = "start_error"
    const val WELCOME = "start_welcome"
    const val CLEAR = "key_clear"
    const val BACKSPACE = "key_backspace"
    const val PLAY = "key_play"
    const val CALIBRATION = "calibration"
    const val COUNTDOWN = "countdown"
    const val HUD_TIMER = "hud_timer"
    const val HUD_SCORE = "hud_score"
    const val TOUCH_LAYER = "touch_layer"
    const val PHOTO_PLACEHOLDER = "photo_placeholder"
    const val CARD_CONTINUE = "card_continue"
    const val SPIN_CONTINUE = "spin_continue"
    const val FEEDBACK_CONTINUE = "feedback_continue"

    fun key(digit: Char) = "key_$digit"
}
