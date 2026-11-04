package com.aayush.diwaliplay.branding

import com.aayush.diwaliplay.model.DEFAULT_BOMB_CONFIGS
import com.aayush.diwaliplay.model.DEFAULT_BOMB_SETTINGS
import com.aayush.diwaliplay.model.ListBombsResponse
import com.aayush.diwaliplay.model.RewardsInfo
import com.aayush.diwaliplay.model.SystemSettings
import com.aayush.diwaliplay.model.WallpaperItem
import java.io.File

/**
 * Everything the kiosk needs from the admin panel. [settings] is already normalised with the web
 * fallbacks (see [normalizedForBranding]). [localFiles] maps an asset URL exactly as it appears in
 * [settings]/[bombs]/[rewards]/[playlist] to its cached file; URLs that could not be cached are absent.
 */
data class BrandingState(
    val settings: SystemSettings = SystemSettings().normalizedForBranding(),
    val playlist: List<WallpaperItem> = emptyList(),
    /** Web defaults until the server (or the disk copy) supplies bombs, so an offline first install still has bombs. */
    val bombs: ListBombsResponse = ListBombsResponse(bombs = DEFAULT_BOMB_CONFIGS, settings = DEFAULT_BOMB_SETTINGS),
    val rewards: RewardsInfo = RewardsInfo(),
    val localFiles: Map<String, File> = emptyMap(),
    val currentWallpaperUrl: String = "",
    val rotationIndex: Int = 0,
    /** True until a load from the server or the disk copy has completed. */
    val isLoading: Boolean = true,
)

/** Same `||` fallbacks as `fetchBranding` in src/hooks/useBranding.ts. */
fun SystemSettings.normalizedForBranding(): SystemSettings = copy(
    brandName = brandName.ifEmpty { "ItsSpotlight" },
    brandLogoUrl = brandLogoUrl ?: "",
    experienceTitle = experienceTitle.ifEmpty { "DIWALI FUN PLAY" },
    logoWidth = if (logoWidth > 0) logoWidth else 160.0,
    logoHeight = if (logoHeight > 0) logoHeight else 48.0,
    brandingDisplayMode = if (brandingDisplayMode == "name" || brandingDisplayMode == "logo") brandingDisplayMode else "both",
    wallpaperUrl = wallpaperUrl ?: "",
    gameplayMode = if (gameplayMode == "touch") "touch" else "camera",
    targetScore = if (targetScore > 0) targetScore else 5000,
    gameDurationSeconds = if (gameDurationSeconds > 0) gameDurationSeconds else 35,
)

/** Every asset URL the kiosk may need offline: logo, wallpapers, bomb/reward images, custom sounds. */
fun collectAssetUrls(state: BrandingState): List<String> {
    val urls = LinkedHashSet<String>()
    fun add(u: String?) { if (!u.isNullOrBlank()) urls.add(u) }
    val s = state.settings
    add(s.brandLogoUrl)
    add(s.wallpaperUrl)
    state.playlist.forEach { add(it.url) }
    state.bombs.bombs.forEach { add(it.imageUrl); add(it.soundUrl) }
    state.rewards.rewards.forEach { add(it.imageUrl) }
    s.audioSettings?.let { a ->
        add(a.bgm.activeTrackUrl)
        add(a.combo?.customUrl)
        a.countdown?.customUrls?.let { add(it.three); add(it.two); add(it.one); add(it.go) }
        a.sfx?.values?.forEach { add(it.customUrl) }
    }
    return urls.toList()
}
