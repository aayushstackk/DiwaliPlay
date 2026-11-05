package com.aayush.diwaliplay.app

import com.aayush.diwaliplay.model.SystemSettings
import java.io.File

/** What the start screen shows behind its panels. */
sealed interface StartBackgroundChoice {
    /** The built-in festive scene. */
    data object BuiltIn : StartBackgroundChoice

    data class Image(val file: File, val dimPercent: Double) : StartBackgroundChoice

    data class Video(val file: File, val dimPercent: Double) : StartBackgroundChoice
}

/**
 * The admin's start background if it is set and cached, else the built-in. A video that already failed to play
 * ([failedVideo]) falls back to the built-in.
 */
fun chooseStartBackground(settings: SystemSettings, localFiles: Map<String, File>, failedVideo: File?): StartBackgroundChoice {
    val url = settings.startBackgroundUrl?.takeIf { it.isNotBlank() } ?: return StartBackgroundChoice.BuiltIn
    val file = localFiles[url] ?: return StartBackgroundChoice.BuiltIn
    val dim = settings.startBackgroundDim
    return if (settings.startBackgroundType == "video") {
        if (file == failedVideo) StartBackgroundChoice.BuiltIn else StartBackgroundChoice.Video(file, dim)
    } else {
        StartBackgroundChoice.Image(file, dim)
    }
}

/** The black overlay's alpha, 0..204: the dim percent clamped to 0..80. */
fun startDimAlpha(dimPercent: Double): Int = (dimPercent.coerceIn(0.0, 80.0) / 100.0 * 255).toInt()
