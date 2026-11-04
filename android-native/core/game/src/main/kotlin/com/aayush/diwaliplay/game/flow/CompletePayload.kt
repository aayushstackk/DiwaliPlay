package com.aayush.diwaliplay.game.flow

import com.aayush.diwaliplay.model.CompleteSessionRequest
import com.aayush.diwaliplay.model.GameScoreState
import java.util.Base64

/**
 * App.tsx handlePhotoCaptured → gameApi.completeSession payload. `combosAwarded ?? comboCount` is always
 * `combosAwarded` here (non-null in Kotlin). The web sends the photo as a JPEG data URL
 * (canvas.toDataURL('image/jpeg')), so the bytes are wrapped the same way. Wish fields are not sent.
 */
fun buildCompleteSessionRequest(
    sessionId: String,
    score: GameScoreState,
    photoJpeg: ByteArray?,
    targetScore: Int?,
): CompleteSessionRequest = CompleteSessionRequest(
    sessionId = sessionId,
    score = score.score,
    crackerCount = score.crackersBurst,
    maxSpeed = score.maxSpeed,
    comboCount = score.combosAwarded,
    punchCount = score.punchCount,
    photoData = photoJpeg?.let { JPEG_DATA_URL_PREFIX + Base64.getEncoder().encodeToString(it) },
    combosCount = score.combosAwarded,
    penaltyDeductions = score.penaltyDeductions,
    comboBonusPoints = score.comboBonusPoints,
    targetScore = targetScore,
    targetAchieved = targetScore?.let { score.score >= it },
)

private const val JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,"
