package com.aayush.diwaliplay.tracking

import com.aayush.diwaliplay.model.TrackedHand

data class TrackedHands(
    val left: TrackedHand,
    val right: TrackedHand,
    val avgConfidence: Double,
    val timestampMs: Double,
)
