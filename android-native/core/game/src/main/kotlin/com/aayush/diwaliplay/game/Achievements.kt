package com.aayush.diwaliplay.game

import com.aayush.diwaliplay.model.AchievementTier
import com.aayush.diwaliplay.model.GameScoreState

/** Port of src/utils/achievements.ts. */
data class PlayerAchievement(
    val emoji: String,
    val title: String,
    val subtitle: String,
    val badgeColor: String? = null,
)

data class FormattedPersonalizedWish(
    val heading: String,
    val lines: List<String>,
    val signoff: String,
)

val DEFAULT_ACHIEVEMENT_TIERS: List<AchievementTier> = listOf(
    AchievementTier(
        id = "tier_legend",
        title = "Diwali Legend",
        subtitle = "Grand Fireworks Legend",
        minScore = 2000,
        maxScore = null,
        emoji = "🌟",
        badgeColor = "from-amber-400 via-amber-300 to-yellow-200",
        wishes = listOf(
            "HAPPY DIWALI, {playerName}! 🪔✨\nYou truly lit up the celebration today with {score} points!\nMay this Diwali bring you bigger dreams, brighter opportunities and endless happiness.\nKeep shining and creating spectacular moments!\nWarm wishes,\n{brandName}",
            "A GRAND DIWALI SALUTE TO {playerName}! 🌟👑\nYou achieved legendary status with an astonishing {score} points in the arena!\nMay your future sparkle with the exact brilliance and triumph you displayed today.\nProudly presented by\n{brandName}",
            "OUTSTANDING DHAMAKA, {playerName}! 🎆🔥\nYour phenomenal reflexes scored {score} points!\nMay your year ahead be just as powerful, joyful and bursting with golden wins.\nWith love,\n{brandName}",
        ),
    ),
    AchievementTier(
        id = "tier_master",
        title = "Light Master",
        subtitle = "Stellar Energy Champion",
        minScore = 1500,
        maxScore = 1999,
        emoji = "✨",
        badgeColor = "from-teal-400 via-cyan-300 to-emerald-200",
        wishes = listOf(
            "DEAR {playerName}! ✨\nBrilliant play scoring {score} points! Lighting up the celebration with stellar energy.\nMay every new beginning bring triumphant milestones and happiness into your home.\nWarm wishes,\n{brandName}",
            "HAPPY DIWALI, {playerName}! 🎇\nYour vibrant spirit and festive aura brought pure magic to the stage!\nMay divine light remove all shadows and fill your journey with abundant prosperity.\nFrom your friends at\n{brandName}",
        ),
    ),
    AchievementTier(
        id = "tier_ace",
        title = "Rocket Ace",
        subtitle = "Sky Blasting Reflector",
        minScore = 1000,
        maxScore = 1499,
        emoji = "🚀",
        badgeColor = "from-rose-400 via-amber-300 to-yellow-200",
        wishes = listOf(
            "HAPPY DIWALI, {playerName}! 🚀💥\nFast hands and soaring spirits! You scored a stellar {score} points today.\nMay you soar to incredible heights this year just like a rocket lighting up the midnight sky!\nBest festive wishes,\n{brandName}",
            "HEY {playerName}! 🔥✨\nYou brought the ultimate firepower scoring {score} points, now let Diwali bring all the magic!\nMay your celebrations be dazzling bright and your victories unstoppable.\n— {brandName}",
        ),
    ),
    AchievementTier(
        id = "tier_sparkler",
        title = "Festive Sparkler",
        subtitle = "Joy & Energy Player",
        minScore = 0,
        maxScore = 999,
        emoji = "🪔",
        badgeColor = "from-amber-300 via-amber-400 to-yellow-300",
        wishes = listOf(
            "SHUBH DEEPAWALI, {playerName}! 🪔\nWishing you joy, prosperity, and endless festive moments with {score} points!\nMay thousands of sparkling lights guide you toward everlasting peace.\nWarmest wishes,\n{brandName}",
            "DEAREST {playerName}! 💛\nAs diyas illuminate every corner, may your heart be filled with delightful wonders.\nMay this sacred celebration shower your family with endless blessings and good fortune.\nShubh Deepawali from\n{brandName}",
        ),
    ),
)

private fun activeTiers(custom: List<AchievementTier>?): List<AchievementTier> =
    if (!custom.isNullOrEmpty()) custom else DEFAULT_ACHIEVEMENT_TIERS

private fun findTier(score: Int, tiers: List<AchievementTier>): AchievementTier? =
    tiers.firstOrNull { score >= it.minScore && (it.maxScore == null || score <= it.maxScore!!) }

/**
 * Port of calculateAchievement. [combosAwarded] / [crackersBurst] only matter in the
 * fallback branch (no tier matches the score), as in the web version.
 */
fun calculateAchievement(
    score: Int,
    tiers: List<AchievementTier>?,
    combosAwarded: Int = 0,
    crackersBurst: Int = 0,
): PlayerAchievement {
    val matched = findTier(score, activeTiers(tiers))
    if (matched != null) {
        return PlayerAchievement(
            emoji = matched.emoji?.takeUnless { it.isEmpty() } ?: "\uD83E\uDE94",
            title = matched.title,
            subtitle = matched.subtitle?.takeUnless { it.isEmpty() } ?: "Festival Motion Challenger",
            badgeColor = matched.badgeColor?.takeUnless { it.isEmpty() }
                ?: "from-amber-300 via-amber-400 to-yellow-300",
        )
    }
    if (score >= 2000) {
        return PlayerAchievement(
            "\uD83C\uDF1F", "DIWALI DHAMAKA MASTER", "Grand Fireworks Legend",
            "from-amber-400 via-amber-300 to-yellow-200",
        )
    }
    if (combosAwarded >= 5) {
        return PlayerAchievement(
            "\uD83D\uDCA5", "BLAST BOSS", "Master of the Big Bang",
            "from-purple-400 via-amber-300 to-yellow-300",
        )
    }
    if (crackersBurst >= 35) {
        return PlayerAchievement(
            "\uD83C\uDF86", "FIREWORKS LEGEND", "Diwali Motion Champion",
            "from-amber-300 via-yellow-200 to-emerald-300",
        )
    }
    return PlayerAchievement(
        "\uD83E\uDE94", "DIWALI SPARK MASTER", "Light & Energy Legend",
        "from-amber-300 via-amber-400 to-yellow-300",
    )
}

/** en-US digit grouping, as Number.prototype.toLocaleString() gives in the web app. */
private fun groupDigits(n: Int): String = "%,d".format(java.util.Locale.US, n)

/** Port of getPersonalizedWish; [achievement] is unused by the web version too. */
@Suppress("UNUSED_PARAMETER")
fun getPersonalizedWish(
    stats: GameScoreState,
    achievement: PlayerAchievement,
    playerName: String = "Player",
    brandName: String = "ItsSpotlight",
    customTiers: List<AchievementTier>? = null,
    rank: String? = null,
    random: GameRandom,
): FormattedPersonalizedWish {
    val tiers = activeTiers(customTiers)
    val score = stats.score

    var matchedTier = findTier(score, tiers)
    if (matchedTier == null || matchedTier.wishes.isEmpty()) {
        matchedTier = tiers.firstOrNull() ?: DEFAULT_ACHIEVEMENT_TIERS[0]
    }
    val wishes = matchedTier.wishes.ifEmpty { DEFAULT_ACHIEVEMENT_TIERS[0].wishes }

    val rotationIndex = (random.nextDouble() * wishes.size).toInt()
    val rawTemplate = wishes.getOrNull(rotationIndex)?.takeUnless { it.isEmpty() } ?: wishes[0]

    val cleanName = playerName.ifEmpty { "Player" }
    val cleanScore = groupDigits(score)
    val cleanRank = if (!rank.isNullOrEmpty()) "#$rank" else "Top Rank"
    val cleanBrand = brandName.ifEmpty { "ItsSpotlight" }

    val processed = rawTemplate
        .replace("{playerName}", cleanName)
        .replace("{score}", cleanScore)
        .replace("{rank}", cleanRank)
        .replace("{brandName}", cleanBrand)

    val lines = processed.split("\n").map { it.trim() }.filter { it.isNotEmpty() }

    var heading = "HAPPY DIWALI, $cleanName! \uD83E\uDE94\u2728"
    var signoff = "Warm wishes,\n$cleanBrand"
    var bodyLines: List<String> = emptyList()

    when {
        lines.size >= 3 -> {
            heading = lines.first()
            signoff = lines.last()
            bodyLines = lines.subList(1, lines.size - 1)
        }
        lines.size == 2 -> {
            heading = lines[0]
            bodyLines = listOf(lines[1])
        }
        lines.size == 1 -> bodyLines = listOf(lines[0])
    }
    return FormattedPersonalizedWish(heading, bodyLines, signoff)
}
