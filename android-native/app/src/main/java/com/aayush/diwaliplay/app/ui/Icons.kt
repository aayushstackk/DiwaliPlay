package com.aayush.diwaliplay.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp

/** A 24x24 stroked icon: the lucide-react glyphs the web uses, from their SVG path data. */
class LineIcon(val paths: List<String>, val circles: List<Triple<Float, Float, Float>> = emptyList())

object Icons {
    val Sparkles = LineIcon(
        listOf(
            "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
            "M20 2v4", "M22 4h-4",
        ),
        listOf(Triple(4f, 20f, 2f)),
    )
    val Timer = LineIcon(listOf("M10 2h4", "M12 14l3-3"), listOf(Triple(12f, 14f, 8f)))
    val Trophy = LineIcon(
        listOf(
            "M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978",
            "M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978",
            "M18 9h1.5a1 1 0 0 0 0-5H18", "M4 22h16",
            "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z",
            "M6 9H4.5a1 1 0 0 1 0-5H6",
        ),
    )
    val Target = LineIcon(emptyList(), listOf(Triple(12f, 12f, 10f), Triple(12f, 12f, 6f), Triple(12f, 12f, 2f)))
    val Delete = LineIcon(
        listOf(
            "M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
            "m12 9 6 6", "m18 9-6 6",
        ),
    )
    val Check = LineIcon(listOf("M20 6 9 17l-5-5"))
    val RotateCcw = LineIcon(listOf("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"))
    val Camera = LineIcon(
        listOf(
            "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z",
        ),
        listOf(Triple(12f, 13f, 3f)),
    )
    val Alert = LineIcon(listOf("m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"))

    /** HandTargetBoxes' raised hand. */
    val Hand = LineIcon(
        listOf(
            "M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0",
            "M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6",
            "M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8",
            "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
        ),
    )
}

@Composable
fun Icon(
    icon: LineIcon,
    size: Dp,
    color: Color,
    modifier: Modifier = Modifier,
    strokeWidth: Float = 2f,
    fill: Color? = null,
    mirrored: Boolean = false,
) {
    val paths = remember(icon) { icon.paths.map { d -> PathParser().parsePathString(d).toPath() } }
    Canvas(modifier.size(size)) {
        val k = this.size.width / 24f
        withTransform({
            if (mirrored) scale(-1f, 1f, center)
            scale(k, k, Offset.Zero)
        }) {
            val stroke = Stroke(strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round)
            for (p in paths) {
                if (fill != null) drawPath(p, fill)
                drawPath(p, color, style = stroke)
            }
            for ((x, y, r) in icon.circles) drawCircle(color, r, Offset(x, y), style = stroke)
        }
    }
}
