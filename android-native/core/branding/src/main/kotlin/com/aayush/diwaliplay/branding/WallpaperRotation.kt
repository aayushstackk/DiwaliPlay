package com.aayush.diwaliplay.branding

import com.aayush.diwaliplay.model.WallpaperItem

/** Position in the rotation and the wallpaper URL it selects. */
data class WallpaperRotation(val index: Int, val url: String)

/**
 * Mirror of `buildRotationPlaylist` in src/hooks/useBranding.ts: the active wallpaper first,
 * then the remaining playlist items in their given order.
 */
fun buildRotationPlaylist(
    activeUrl: String,
    playlist: List<WallpaperItem>,
    useBuiltIn: Boolean = false,
): List<WallpaperItem> {
    if (useBuiltIn) return emptyList()
    if (playlist.isEmpty()) {
        return if (activeUrl.isNotEmpty()) listOf(WallpaperItem("active_single", activeUrl, "Active Wallpaper", 0)) else emptyList()
    }
    val active = playlist.firstOrNull { it.url == activeUrl }
    val others = playlist.filter { it.url != activeUrl }
    return when {
        active != null -> listOf(active) + others
        activeUrl.isNotEmpty() -> listOf(WallpaperItem("active_custom", activeUrl, "Active Wallpaper", 0)) + others
        else -> playlist
    }
}

/** Rotation reset: first item of the rotation, falling back to [activeUrl]. */
fun initialRotation(activeUrl: String, playlist: List<WallpaperItem>, useBuiltIn: Boolean = false): WallpaperRotation =
    if (useBuiltIn) WallpaperRotation(0, "")
    else WallpaperRotation(0, buildRotationPlaylist(activeUrl, playlist).firstOrNull()?.url ?: activeUrl)

/** Mirror of `advanceRotation`: next item, wrapping; a list of 0 or 1 items stays at index 0. */
fun advanceRotation(
    activeUrl: String,
    playlist: List<WallpaperItem>,
    currentIndex: Int,
    useBuiltIn: Boolean = false,
): WallpaperRotation {
    if (useBuiltIn) return WallpaperRotation(0, "")
    val list = buildRotationPlaylist(activeUrl, playlist)
    if (list.size <= 1) return WallpaperRotation(0, list.firstOrNull()?.url ?: activeUrl)
    val next = (currentIndex + 1) % list.size
    return WallpaperRotation(next, list[next].url)
}
