package com.aayush.diwaliplay.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Test

class DecodeTest {
    @Serializable
    private data class SettingsEnvelope(val success: Boolean, val settings: SystemSettings)

    @Serializable
    private data class RewardsEnvelope(val success: Boolean, val enabled: Boolean, val rewards: List<RewardItem>)

    private fun fixture(name: String): String =
        checkNotNull(javaClass.getResource("/api/$name")) { "missing fixture $name" }.readText()

    @Test
    fun decodesRealSettings() {
        val s = DiwaliJson.decodeFromString<SettingsEnvelope>(fixture("settings.json")).settings
        assertThat(s.brandName).isNotNull()
        assertThat(s.gameDurationSeconds).isNotNull()
        assertThat(s.audioSettings?.bgm).isNotNull()
        assertThat(s.audioSettings?.presets).isNotEmpty()
        assertThat(s.audioSettings?.sfx?.get("explosion")?.soundId).isEqualTo("explosion_bomb")
    }

    @Test
    fun minimalSettingsUseWebDefaults() {
        val s = DiwaliJson.decodeFromString<SettingsEnvelope>(fixture("settings_minimal.json")).settings
        assertThat(s.brandName).isEqualTo("X")
        assertThat(s.gameDurationSeconds).isEqualTo(35)
        assertThat(s.gameplayMode).isEqualTo("camera")
        assertThat(s.wallpaperEnabled).isTrue()
        assertThat(s.targetScore).isEqualTo(5000)
        assertThat(s.rewardsEnabled).isTrue()
    }

    @Test
    fun nullsAndUnknownKeysDoNotCrash() {
        val s = DiwaliJson.decodeFromString<SettingsEnvelope>(fixture("settings_nulls.json")).settings
        assertThat(s.gameDurationSeconds).isEqualTo(35)
        assertThat(s.gameplayMode).isEqualTo("camera")
        assertThat(s.brandName).isEqualTo("ItsSpotlight")
        assertThat(s.wallpaperEnabled).isTrue()
        assertThat(s.rewardsEnabled).isTrue()
        assertThat(s.brandLogoUrl).isNull()
        assertThat(s.achievementTiers).isNull()
        assertThat(s.audioSettings?.bgm?.activeTrackId).isEqualTo("none")
        assertThat(s.audioSettings?.bgm?.loop).isTrue()
    }

    @Test
    fun decodesBombsAndRewards() {
        val bombs = DiwaliJson.decodeFromString<ListBombsResponse>(fixture("bombs.json"))
        assertThat(bombs.bombs).hasSize(4)
        assertThat(bombs.bombs.first { it.id == "bomb_black" }.points).isEqualTo(-150)
        assertThat(bombs.bombs[0].soundUrl).isNull()
        assertThat(bombs.settings.maxConcurrentBombs).isEqualTo(5)
        assertThat(bombs.settings.launchSpeedMultiplier).isEqualTo(1.45)

        val rewards = DiwaliJson.decodeFromString<RewardsEnvelope>(fixture("rewards.json"))
        assertThat(rewards.enabled).isTrue()
        assertThat(rewards.rewards).isNotEmpty()
        assertThat(rewards.rewards[0].couponCode).isEqualTo("FREEGIFT")
        assertThat(rewards.rewards[0].chances).isEqualTo(25.0)
    }

    @Test
    fun trialVerifyResponseIsTrial() {
        val r = DiwaliJson.decodeFromString<VerifyCodeResponse>(fixture("verify_code_trial.json"))
        assertThat(r.valid).isTrue()
        assertThat(r.isTrial).isTrue()
        assertThat(r.user?.id).isEqualTo("trial_user_8536")
        assertThat(r.session?.id).isEqualTo("trial_session_8536")
        assertThat(r.session?.status).isEqualTo("INITIALIZED")
    }

    @Test
    fun completeRequestRoundTrips() {
        val req = CompleteSessionRequest(
            sessionId = "s1", score = 1234, crackerCount = 20, maxSpeed = 1500.5,
            comboCount = 3, punchCount = 7, photoData = "data:image/jpeg;base64,AAAA",
            wishTitle = "Blazing", wishMessage = "Happy Diwali", feedback = GameFeedback.NeedsImprovement,
            combosCount = 2, penaltyDeductions = 150, comboBonusPoints = 50, targetScore = 5000,
            targetAchieved = false,
            earnedReward = EarnedReward("r1", "Gift", "desc", "http://x/y.png", "CODE", "tnc"),
        )
        val json = DiwaliJson.encodeToString(req)
        assertThat(json).contains("\"Needs Improvement\"")
        assertThat(DiwaliJson.decodeFromString<CompleteSessionRequest>(json)).isEqualTo(req)
    }

    @Test
    fun feedbackSerialNamesAndMotionTypes() {
        assertThat(DiwaliJson.encodeToString(GameFeedback.Good)).isEqualTo("\"Good\"")
        assertThat(DiwaliJson.encodeToString(GameFeedback.Excellent)).isEqualTo("\"Excellent\"")
        assertThat(DiwaliJson.encodeToString(HandGesture.OPEN_PALM)).isEqualTo("\"OPEN_PALM\"")
        val score = GameScoreState()
        assertThat(score.multiplier).isEqualTo(1.0)
        assertThat(score.targetScore).isNull()
        assertThat(GameState.values().map { it.name }).containsExactly(
            "IDLE", "READY", "COUNTDOWN", "PLAYING", "PHOTO_COUNTDOWN", "GAME_OVER",
        ).inOrder()
        val k = DiwaliJson.decodeFromString<KioskDeviceStatus>(
            """{"connected":true,"backProtection":false,"autoLaunch":false,"watchdogRunning":false,"guardianRunning":false,"appRunning":true}""",
        )
        assertThat(k.platform).isNull()
    }

    @Test
    fun decodesSettingsResponseWithPlaylist() {
        val r = DiwaliJson.decodeFromString<SettingsResponse>(fixture("settings.json"))
        assertThat(r.success).isTrue()
        assertThat(r.settings.brandName).isEqualTo("ItsSpotlight")
        assertThat(r.wallpaperPlaylist).isEmpty()
        val withItems = DiwaliJson.decodeFromString<SettingsResponse>(
            """{"success":true,"settings":{},"wallpaperPlaylist":[{"id":"w1","url":"u","displayName":"A","order":2},{"id":"w2","url":"v"}]}""",
        )
        assertThat(withItems.wallpaperPlaylist.map { it.id }).containsExactly("w1", "w2").inOrder()
        assertThat(withItems.wallpaperPlaylist[0].order).isEqualTo(2)
        assertThat(withItems.wallpaperPlaylist[1].displayName).isNull()
        assertThat(DiwaliJson.decodeFromString<SettingsResponse>(fixture("settings_minimal.json")).wallpaperPlaylist).isEmpty()
    }

    @Test
    fun decodesRewardsInfo() {
        val r = DiwaliJson.decodeFromString<RewardsInfo>(fixture("rewards.json"))
        assertThat(r.enabled).isTrue()
        assertThat(r.rewards[0].couponCode).isEqualTo("FREEGIFT")
    }
}
