package com.aayush.diwaliplay.tracking.camera

import com.aayush.diwaliplay.model.LandmarkPoint

// Landmark coordinate mapping between the camera frame and the 16:9 game space.
//
// No landmark mirroring happens here: HandTracker takes RAW MediaPipe landmarks and its
// getPalmCenterScreen flips x itself, exactly like the web. Only the visible preview
// (PreviewView.scaleX = -1) and captureStill() are mirrored.

private const val SIXTEEN_NINE = 16.0 / 9.0

/**
 * Maps normalised landmarks from a [srcW]×[srcH] frame into the centre 16:9 crop of that frame
 * (the 640×480 fallback keeps rows 60..420). Frames that are already 16:9 come back unchanged;
 * wider frames lose their sides instead. Points outside the crop map outside 0..1 and are not
 * clamped (MediaPipe can report slightly out-of-frame landmarks too). z is unchanged.
 */
fun cropToSixteenNine(points: List<LandmarkPoint>, srcW: Int, srcH: Int): List<LandmarkPoint> {
    if (srcW <= 0 || srcH <= 0) return points
    val aspect = srcW.toDouble() / srcH
    if (kotlin.math.abs(aspect - SIXTEEN_NINE) < 1e-3) return points
    return if (aspect < SIXTEEN_NINE) {
        // Too tall (4:3): keep the full width, crop height.
        val keptH = srcW / SIXTEEN_NINE
        val offset = (srcH - keptH) / 2
        points.map { it.copy(y = (it.y * srcH - offset) / keptH) }
    } else {
        // Too wide: keep the full height, crop width.
        val keptW = srcH * SIXTEEN_NINE
        val offset = (srcW - keptW) / 2
        points.map { it.copy(x = (it.x * srcW - offset) / keptW) }
    }
}
