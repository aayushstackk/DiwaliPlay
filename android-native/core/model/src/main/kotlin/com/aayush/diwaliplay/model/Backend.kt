package com.aayush.diwaliplay.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Kiosk-side mirrors of src/types/backend.ts. Field names are identical to the web contract. */

@Serializable
enum class GameFeedback {
    @SerialName("Good") Good,
    @SerialName("Excellent") Excellent,
    @SerialName("Needs Improvement") NeedsImprovement,
}

@Serializable
data class User(
    val id: String,
    val name: String = "",
    val mobileNumber: String = "",
    val createdAt: String = "",
    val updatedAt: String = "",
    val hasPlayed: Boolean = false,
    val playCount: Int = 0,
    val feedback: GameFeedback? = null,
    val termsAccepted: Boolean? = null,
    val termsAcceptedAt: String? = null,
    val termsVersion: String? = null,
)

/** [status]: ACTIVE | USED | EXPIRED | CANCELLED. */
@Serializable
data class GameCode(
    val id: String,
    val code: String,
    val userId: String,
    val createdAt: String = "",
    val expiresAt: String = "",
    val usedAt: String? = null,
    val status: String = "ACTIVE",
)

@Serializable
data class EarnedReward(
    val id: String,
    val name: String,
    val description: String,
    val imageUrl: String,
    val couponCode: String,
    val termsAndConditions: String? = null,
)

/** [status]: INITIALIZED | PLAYING | COMPLETED | ABANDONED. */
@Serializable
data class GameSession(
    val id: String,
    val userId: String,
    val gameCodeId: String = "",
    val code: String = "",
    val startTime: String = "",
    val endTime: String? = null,
    val score: Int = 0,
    val crackerCount: Int = 0,
    val maxSpeed: Double = 0.0,
    val comboCount: Int = 0,
    val punchCount: Int = 0,
    val photoUrl: String? = null,
    val wishTitle: String? = null,
    val wishMessage: String? = null,
    val status: String = "INITIALIZED",
    val kioskId: String? = null,
    val feedback: GameFeedback? = null,
    val combosCount: Int? = null,
    val penaltyDeductions: Int? = null,
    val comboBonusPoints: Int? = null,
    val targetScore: Int? = null,
    val targetAchieved: Boolean? = null,
    val earnedReward: EarnedReward? = null,
)

// ---------------------------------------------------------------------------
// Audio settings
// ---------------------------------------------------------------------------

@Serializable
data class SoundEffectConfig(
    val soundId: String = "",
    val volume: Double = 100.0,
    val customAssetId: String? = null,
    val customUrl: String? = null,
)

@Serializable
data class BackgroundMusicConfig(
    val activeTrackId: String = "none",
    val activeTrackUrl: String? = null,
    val volume: Double = 100.0,
    val isMuted: Boolean = false,
    val loop: Boolean = true,
)

@Serializable
data class ComboAudioConfig(
    val soundId: String = "",
    val volume: Double = 100.0,
    val customAssetId: String? = null,
    val customUrl: String? = null,
)

@Serializable
data class CountdownCustomUrls(
    val three: String? = null,
    val two: String? = null,
    val one: String? = null,
    val go: String? = null,
)

@Serializable
data class CountdownAudioConfig(
    val soundThree: String = "",
    val soundTwo: String = "",
    val soundOne: String = "",
    val soundGo: String = "",
    val volume: Double = 100.0,
    val customUrls: CountdownCustomUrls? = null,
)

/** [sfx] keys: firework_launch, explosion, sparkler, bomb_impact, points_score, game_over, photo_shutter. */
@Serializable
data class SoundPreset(
    val id: String,
    val name: String = "",
    val description: String? = null,
    val isDefault: Boolean? = null,
    val countdown: CountdownAudioConfig = CountdownAudioConfig(),
    val bgm: BackgroundMusicConfig = BackgroundMusicConfig(),
    val sfx: Map<String, SoundEffectConfig> = emptyMap(),
)

@Serializable
data class GameAudioSettings(
    val activePresetId: String? = null,
    val masterVolume: Double? = null,
    val isMuted: Boolean? = null,
    val bgm: BackgroundMusicConfig = BackgroundMusicConfig(),
    val combo: ComboAudioConfig? = null,
    val countdown: CountdownAudioConfig? = null,
    val sfx: Map<String, SoundEffectConfig>? = null,
    val presets: List<SoundPreset>? = null,
)

@Serializable
data class AchievementTier(
    val id: String,
    val title: String = "",
    val subtitle: String? = null,
    val minScore: Int = 0,
    val maxScore: Int? = null,
    val emoji: String? = null,
    val badgeColor: String? = null,
    val wishes: List<String> = emptyList(),
)

@Serializable
data class LogoPosition(val x: Double = 0.0, val y: Double = 0.0)

/**
 * Defaults are the web defaults. [gameplayMode]: "camera" | "touch".
 * [brandingDisplayMode]: "both" | "name" | "logo".
 */
@Serializable
data class SystemSettings(
    val allowMultiplePlaysPerUser: Boolean = false,
    val codeExpirySeconds: Int = 120,
    val gameDurationSeconds: Int = 35,
    val gameplayMode: String = "camera",
    val brandName: String = "ItsSpotlight",
    val brandLogoUrl: String? = null,
    val brandingDisplayMode: String = "both",
    val wallpaperUrl: String? = null,
    val experienceTitle: String = "DIWALI FUN PLAY",
    val connectorText: String = "by",
    val logoWidth: Double = 160.0,
    val logoHeight: Double = 48.0,
    val logoPosition: LogoPosition = LogoPosition(),
    val wallpaperOpacity: Double = 100.0,
    val wallpaperEnabled: Boolean = true,
    val targetScoreEnabled: Boolean = false,
    val targetScore: Int = 5000,
    val rewardsEnabled: Boolean = true,
    val audioSettings: GameAudioSettings? = null,
    val achievementTiers: List<AchievementTier>? = null,
)

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

/** [reason]: NOT_FOUND | EXPIRED | USED | CANCELLED | ALREADY_PLAYED. */
@Serializable
data class VerifyCodeResponse(
    val success: Boolean = false,
    val valid: Boolean = false,
    val user: User? = null,
    val code: GameCode? = null,
    val session: GameSession? = null,
    val reason: String? = null,
    val message: String = "",
    val isTrial: Boolean? = null,
)

@Serializable
data class StartSessionRequest(val code: String, val kioskId: String? = null)

@Serializable
data class StartSessionResponse(
    val success: Boolean = false,
    val session: GameSession,
    val user: User,
    val message: String? = null,
    val isTrial: Boolean? = null,
)

@Serializable
data class CompleteSessionRequest(
    val sessionId: String,
    val score: Int,
    val crackerCount: Int,
    val maxSpeed: Double,
    val comboCount: Int,
    val punchCount: Int,
    val photoData: String? = null,
    val wishTitle: String? = null,
    val wishMessage: String? = null,
    val feedback: GameFeedback? = null,
    val combosCount: Int? = null,
    val penaltyDeductions: Int? = null,
    val comboBonusPoints: Int? = null,
    val targetScore: Int? = null,
    val targetAchieved: Boolean? = null,
    val earnedReward: EarnedReward? = null,
)

@Serializable
data class CompleteSessionResponse(
    val success: Boolean = false,
    val session: GameSession,
    val user: User,
    val message: String? = null,
    val isTrial: Boolean? = null,
)

@Serializable
data class SubmitFeedbackRequest(val sessionId: String, val feedback: GameFeedback)

@Serializable
data class SubmitFeedbackResponse(
    val success: Boolean = false,
    val message: String = "",
    val feedback: GameFeedback? = null,
    val isTrial: Boolean? = null,
)

@Serializable
data class AbandonSessionRequest(val sessionId: String, val reason: String? = null)

// ---------------------------------------------------------------------------
// Bombs
// ---------------------------------------------------------------------------

/**
 * [soundPreset]: pop | blast | chime | penalty_buzz | rocket | sparkle | custom.
 * [imagePreset]: red_classic | blue_happy | green_super | black_penalty | custom.
 */
@Serializable
data class BombConfig(
    val id: String,
    val name: String = "",
    val color: String = "#EF4444",
    val points: Int = 0,
    val spawnWeight: Double = 1.0,
    val soundPreset: String = "pop",
    val soundAssetId: String? = null,
    val soundUrl: String? = null,
    val imagePreset: String = "red_classic",
    val imageAssetId: String? = null,
    val imageUrl: String? = null,
    val sizePercent: Double? = null,
    val isActive: Boolean = true,
    val isDefault: Boolean? = null,
    val isDeleted: Boolean? = null,
    val deletedAt: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class BombGameSettings(
    val minSpawnDelayMs: Double,
    val maxSpawnDelayMs: Double,
    val maxConcurrentBombs: Int,
    val bombRadius: Double,
    val bombLifetimeMs: Double,
    val launchSpeedMultiplier: Double? = null,
    val gravityMultiplier: Double? = null,
    val maxBurstSize: Int? = null,
    val burstIntervalMs: Double? = null,
)

@Serializable
data class ListBombsResponse(
    val success: Boolean = false,
    val bombs: List<BombConfig> = emptyList(),
    val settings: BombGameSettings,
    val message: String? = null,
)

// ---------------------------------------------------------------------------
// Rewards & spin wheel
// ---------------------------------------------------------------------------

/** [mode]: "chance" (default) | "score". */
@Serializable
data class RewardItem(
    val id: String,
    val name: String = "",
    val description: String = "",
    val imageUrl: String = "",
    val couponCode: String = "",
    val termsAndConditions: String = "",
    val chances: Double = 0.0,
    val mode: String? = null,
    val isActive: Boolean? = null,
    val minScore: Int? = null,
    val maxScore: Int? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class SpinRecord(
    val id: String,
    val userId: String? = null,
    val playerName: String = "",
    val mobileNumber: String? = null,
    val sessionId: String? = null,
    val rewardId: String = "",
    val rewardName: String = "",
    val couponCode: String = "",
    val rewardImageUrl: String = "",
    val termsAndConditions: String? = null,
    val timestamp: String = "",
)

@Serializable
data class SpinWheelRequest(
    val userId: String? = null,
    val playerName: String? = null,
    val mobileNumber: String? = null,
    val sessionId: String? = null,
)

@Serializable
data class SpinWheelResponse(
    val success: Boolean = false,
    val reward: RewardItem? = null,
    val rewardIndex: Int? = null,
    val spinRecord: SpinRecord? = null,
    val alreadySpun: Boolean? = null,
    val isMaster: Boolean? = null,
    val message: String? = null,
)

// ---------------------------------------------------------------------------
// Remote kiosk relay
// ---------------------------------------------------------------------------

@Serializable
data class KioskDeviceStatus(
    val connected: Boolean = false,
    val backProtection: Boolean = false,
    val autoLaunch: Boolean = false,
    val watchdogRunning: Boolean = false,
    val guardianRunning: Boolean = false,
    val appRunning: Boolean = false,
    val lastStateChange: String? = null,
    val lastStateChangeReason: String? = null,
    val platform: String? = null,
)
