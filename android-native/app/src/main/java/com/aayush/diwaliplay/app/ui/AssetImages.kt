package com.aayush.diwaliplay.app.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.RectF
import android.util.Log
import com.caverock.androidsvg.SVG
import java.io.File
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

private const val TAG = "AssetImages"

/** Enough to get past an XML prolog and an editor's comment to the root element. */
private const val SVG_SNIFF_BYTES = 8 * 1024

/** The admin panel's uploads are far smaller; this only stops a stray file being parsed into memory. */
private const val MAX_SVG_BYTES = 8L * 1024 * 1024

/**
 * An admin-uploaded image as a bitmap whose longer side is about [maxEdge] at most: logos, bomb images, rewards and
 * wallpapers. The admin panel accepts SVG for all of them. They're recognised by their content, because a relative asset
 * URL has no extension. Null when the file is neither a bitmap nor an SVG that can be drawn.
 */
internal fun decodeBounded(file: File, maxEdge: Int): Bitmap? =
    decodeRaster(file, maxEdge) ?: if (looksLikeSvg(file)) decodeSvg(file, maxEdge) else null

/** Scaled down by powers of two while the longer side stays at least [maxEdge]. */
private fun decodeRaster(file: File, maxEdge: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
    return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
}

private fun looksLikeSvg(file: File): Boolean = try {
    if (file.length() !in 1..MAX_SVG_BYTES) {
        false
    } else {
        val head = ByteArray(SVG_SNIFF_BYTES)
        val read = file.inputStream().use { it.read(head) }
        read > 0 && looksLikeSvg(head.copyOf(read))
    }
} catch (e: java.io.IOException) {
    Log.w(TAG, "can't read image: ${e.javaClass.simpleName}")
    false
}

/** The file's first bytes start with markup and the root element is `<svg`. */
internal fun looksLikeSvg(head: ByteArray): Boolean {
    val text = String(head, Charsets.UTF_8).dropWhile { it.code == BYTE_ORDER_MARK || it.isWhitespace() }
    if (!text.startsWith("<")) return false
    // Past the prolog, comments and doctype, the first element has to be the svg.
    var rest = text
    while (true) {
        rest = when {
            rest.startsWith("<?") -> rest.substringAfter("?>", "")
            rest.startsWith("<!--") -> rest.substringAfter("-->", "")
            rest.startsWith("<!") -> rest.substringAfter(">", "")
            else -> break
        }.trimStart()
    }
    return SVG_ROOT.matchesAt(rest, 0)
}

private const val BYTE_ORDER_MARK = 0xFEFF

private val SVG_ROOT = Regex("<(?:[A-Za-z_][\\w.-]*:)?svg[\\s/>]")

/**
 * Longer side exactly [maxEdge], whatever size the file claims: it's vector, so it's sharp at any size, and the size is
 * bounded. Nothing external is loaded: with no resolver set, the library ignores references to other files.
 */
private fun decodeSvg(file: File, maxEdge: Int): Bitmap? = try {
    val svg = file.inputStream().use { SVG.getFromInputStream(it) }
    val box = svg.documentViewBox
    val intrinsicW = svg.documentWidth
    val intrinsicH = svg.documentHeight
    val w = box?.width() ?: intrinsicW
    val h = box?.height() ?: intrinsicH
    val aspect = if (w > 0f && h > 0f) w / h else 1f
    if (box == null && intrinsicW > 0f && intrinsicH > 0f) svg.setDocumentViewBox(0f, 0f, intrinsicW, intrinsicH)
    // Otherwise a width of 160 would draw at 160 px whatever the viewport.
    svg.setDocumentWidth("100%")
    svg.setDocumentHeight("100%")
    val scale = maxEdge / max(aspect, 1f)
    val pxW = ceil(scale * aspect).roundToInt().coerceIn(1, maxEdge)
    val pxH = ceil(scale).roundToInt().coerceIn(1, maxEdge)
    Bitmap.createBitmap(pxW, pxH, Bitmap.Config.ARGB_8888).also { bitmap ->
        svg.renderToCanvas(Canvas(bitmap), RectF(0f, 0f, pxW.toFloat(), pxH.toFloat()))
    }
} catch (e: Exception) {
    // SVGParseException, and the library's own runtime exceptions on odd documents: the caller has a fallback drawing.
    Log.w(TAG, "can't draw SVG: ${e.javaClass.simpleName}")
    null
}
