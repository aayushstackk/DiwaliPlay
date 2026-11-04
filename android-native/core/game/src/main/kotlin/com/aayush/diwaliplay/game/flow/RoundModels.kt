package com.aayush.diwaliplay.game.flow

import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import com.aayush.diwaliplay.game.GAME_DURATION_SECONDS
import com.aayush.diwaliplay.game.GameRandom
import com.aayush.diwaliplay.game.PlayerAchievement
import com.aayush.diwaliplay.game.calculateAchievement
import com.aayush.diwaliplay.game.getPersonalizedWish
import com.aayush.diwaliplay.game.bomb.DEFAULT_BOMB_CONFIGS
import com.aayush.diwaliplay.game.bomb.DEFAULT_BOMB_SETTINGS
import com.aayush.diwaliplay.model.AchievementTier
import com.aayush.diwaliplay.model.BombConfig
import com.aayush.diwaliplay.model.BombGameSettings
import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.GameScoreState

/**
 * The verified code's session (Ruling P5). Trial sessions never reach the server through [GameEffects].
 * [mobileNumber] is the user's number for SpinWheelRequest (web passes currentUser.mobileNumber).
 */
data class SessionInfo(
    val sessionId: String,
    val code: String,
    val userName: String,
    val isTrial: Boolean,
    val mobileNumber: String? = null,
)

/**
 * Per-round settings, read once at [GameController.onCodeAccepted] (the web fetches settings between rounds).
 *
 * @param gameplayMode "camera" | "touch" (SystemSettings.gameplayMode).
 * @param targetScore the target when `targetScoreEnabled`, else null.
 * @param tiers SystemSettings.achievementTiers (null/empty → defaults).
 * @param brandName for the personalised wish sign-off.
 * @param bombConfigs active bombs from `GET /api/bombs` (empty → defaults, as BombSim does).
 */
data class RoundSettings(
    val gameDurationSeconds: Int = GAME_DURATION_SECONDS,
    val gameplayMode: String = "camera",
    val targetScore: Int? = null,
    val rewardsEnabled: Boolean = true,
    val tiers: List<AchievementTier>? = null,
    val brandName: String = "ItsSpotlight",
    val bombConfigs: List<BombConfig> = DEFAULT_BOMB_CONFIGS,
    val bombSettings: BombGameSettings = DEFAULT_BOMB_SETTINGS,
) {
    val isTouchMode: Boolean get() = gameplayMode == "touch"

    /** App.tsx: `gameDurationSeconds > 0 ? gameDurationSeconds : GAME_DURATION_SECONDS`. */
    val effectiveDurationSeconds: Int get() = if (gameDurationSeconds > 0) gameDurationSeconds else GAME_DURATION_SECONDS
}

/**
 * Everything the greeting card needs (GameOverModal props). Identity equality: [photoJpeg] is an array.
 *
 * @param targetAchieved null when no target score is set.
 * @param earnedReward from the completeSession response, set via [GameController.onRoundCompleted].
 */
class RoundCard(
    val playerName: String,
    val score: GameScoreState,
    val achievement: PlayerAchievement,
    val wish: FormattedPersonalizedWish,
    val photoJpeg: ByteArray?,
    val targetScore: Int?,
    val targetAchieved: Boolean?,
    val earnedReward: EarnedReward? = null,
) {
    fun withEarnedReward(reward: EarnedReward?): RoundCard =
        RoundCard(playerName, score, achievement, wish, photoJpeg, targetScore, targetAchieved, reward)
}

/**
 * GameOverModal's card data: achievement via calculateAchievement (with combosAwarded / crackersBurst, which
 * only the fallback branch uses) and the personalised wish (no rank; the web passes none here either).
 */
internal fun buildRoundCard(
    playerName: String,
    score: GameScoreState,
    photoJpeg: ByteArray?,
    settings: RoundSettings,
    random: GameRandom,
): RoundCard {
    val achievement = calculateAchievement(score.score, settings.tiers, score.combosAwarded, score.crackersBurst)
    val wish = getPersonalizedWish(
        stats = score, achievement = achievement, playerName = playerName, brandName = settings.brandName,
        customTiers = settings.tiers, rank = null, random = random,
    )
    val target = settings.targetScore
    return RoundCard(playerName, score, achievement, wish, photoJpeg, target, target?.let { score.score >= it })
}
