package com.aayush.diwaliplay.tracking.math

import com.aayush.diwaliplay.model.HandGesture
import com.aayush.diwaliplay.model.LandmarkPoint
import kotlin.math.max
import kotlin.math.sqrt

/** Port of src/utils/gestureRecognition.ts. No Android imports. */

private fun distance3D(p1: LandmarkPoint, p2: LandmarkPoint): Double {
    val dx = p1.x - p2.x
    val dy = p1.y - p2.y
    val dz = p1.z - p2.z
    return sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Recognises hand gestures from landmarks using geometric distances, scale-invariant on the
 * wrist-to-middle-knuckle palm size.
 */
fun recognizeHandGesture(landmarks: List<LandmarkPoint>): HandGesture {
    if (landmarks.size < 21) return HandGesture.UNKNOWN

    val wrist = landmarks[0]
    val thumbTip = landmarks[4]
    val thumbMcp = landmarks[2]
    val indexMcp = landmarks[5]
    val indexPip = landmarks[6]
    val indexTip = landmarks[8]
    val middleMcp = landmarks[9]
    val middlePip = landmarks[10]
    val middleTip = landmarks[12]
    val ringMcp = landmarks[13]
    val ringPip = landmarks[14]
    val ringTip = landmarks[16]
    val pinkyMcp = landmarks[17]
    val pinkyPip = landmarks[18]
    val pinkyTip = landmarks[20]

    val palmScale = max(distance3D(wrist, middleMcp), 0.05)

    fun extended(tip: LandmarkPoint, pip: LandmarkPoint, mcp: LandmarkPoint) =
        distance3D(tip, wrist) > distance3D(pip, wrist) * 1.15 &&
            distance3D(tip, mcp) > palmScale * 0.55

    val isIndexExtended = extended(indexTip, indexPip, indexMcp)
    val isMiddleExtended = extended(middleTip, middlePip, middleMcp)
    val isRingExtended = extended(ringTip, ringPip, ringMcp)
    val isPinkyExtended = extended(pinkyTip, pinkyPip, pinkyMcp)

    val isThumbExtended =
        distance3D(thumbTip, pinkyMcp) > palmScale * 1.1 &&
            distance3D(thumbTip, thumbMcp) > palmScale * 0.5

    val extendedCount = listOf(isIndexExtended, isMiddleExtended, isRingExtended, isPinkyExtended).count { it }

    // 1. Fist: all four fingers curled
    if (extendedCount == 0) return HandGesture.FIST

    // 2. Open palm
    if (extendedCount >= 3 && isIndexExtended && isMiddleExtended && isRingExtended) return HandGesture.OPEN_PALM

    // 3. Thumbs up (kept as in the web source; its extendedCount == 0 branch is unreachable after the fist check)
    if (extendedCount == 0 || (extendedCount == 1 && !isIndexExtended)) {
        if (isThumbExtended && thumbTip.y < wrist.y - palmScale * 0.4) return HandGesture.THUMBS_UP
    }

    // 4. Peace
    if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) return HandGesture.PEACE

    // 5. Pointing
    if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) return HandGesture.POINTING

    // Loose fallbacks
    if (extendedCount >= 3) return HandGesture.OPEN_PALM
    if (extendedCount <= 1 && !isIndexExtended) return HandGesture.FIST

    return HandGesture.UNKNOWN
}
