package com.aayush.diwaliplay.render

import android.os.Build
import kotlin.math.abs
import kotlin.math.roundToInt

/** Small colour helpers shared by the renderers (allocation-free). */
internal object Colors {
    /** Opaque RGB int (0xRRGGBB or ARGB) with its alpha replaced by [alpha] in 0..1. */
    fun withAlpha(rgb: Int, alpha: Double): Int {
        val a = (alpha.coerceIn(0.0, 1.0) * 255.0).roundToInt()
        return (a shl 24) or (rgb and 0x00FFFFFF)
    }

    fun rgba(r: Int, g: Int, b: Int, alpha: Double): Int = withAlpha((r shl 16) or (g shl 8) or b, alpha)

    /** Opaque ARGB from `#RRGGBB` (or `#RGB`); [fallback] when unparsable. */
    fun parseHex(hex: String?, fallback: Int): Int {
        if (hex == null) return fallback
        val h = hex.trim().removePrefix("#")
        val full = when (h.length) {
            3 -> "" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
            6, 8 -> h.substring(0, 6)
            else -> return fallback
        }
        val v = full.toLongOrNull(16) ?: return fallback
        return (0xFF000000L or v).toInt()
    }

    /** CSS `hsla(h, s%, l%, a)` -> ARGB. */
    fun hsla(hDeg: Double, s: Double, l: Double, alpha: Double): Int {
        val c = (1.0 - abs(2.0 * l - 1.0)) * s
        val hp = ((hDeg % 360.0) + 360.0) % 360.0 / 60.0
        val x = c * (1.0 - abs(hp % 2.0 - 1.0))
        var r = 0.0
        var g = 0.0
        var b = 0.0
        when {
            hp < 1 -> { r = c; g = x }
            hp < 2 -> { r = x; g = c }
            hp < 3 -> { g = c; b = x }
            hp < 4 -> { g = x; b = c }
            hp < 5 -> { r = x; b = c }
            else -> { r = c; b = x }
        }
        val m = l - c / 2.0
        return rgba(((r + m) * 255).roundToInt(), ((g + m) * 255).roundToInt(), ((b + m) * 255).roundToInt(), alpha)
    }

    /**
     * Canvas2D `shadowBlur` (blur = 2 sigma) -> Android `setShadowLayer` radius (sigma = 0.57735 r + 0.5).
     */
    fun shadowRadius(canvasBlur: Float): Float = ((canvasBlur / 2f - 0.5f) / 0.57735f).coerceAtLeast(0.5f)

    /** Hardware canvases draw shadow layers for shapes only from API 28. */
    fun shadowsSupported(hardware: Boolean): Boolean = !hardware || Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
}
