package com.aayush.diwaliplay.tracking

import com.aayush.diwaliplay.model.LandmarkPoint

/**
 * One inference result. Landmarks are raw MediaPipe output (normalised 0..1, as the web passes them
 * to getPalmCenterScreen, which does the mirror flip). [handedness] holds one confidence score per
 * detected hand (the web's handedness[i][0].score).
 */
data class HandFrame(val hands: List<List<LandmarkPoint>>, val handedness: List<Float>)
