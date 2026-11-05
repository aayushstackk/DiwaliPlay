package com.aayush.diwaliplay.app.ui

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AssetImagesTest {
    private fun svg(text: String) = looksLikeSvg(text.toByteArray())

    @Test fun recognisesSvgsByContent() {
        assertThat(svg("<svg xmlns=\"http://www.w3.org/2000/svg\"/>")).isTrue()
        assertThat(svg("\n  <svg viewBox=\"0 0 1 1\"></svg>")).isTrue() // as the server's reward fixtures start
        assertThat(svg("<svg>")).isTrue()
        assertThat(svg("<?xml version=\"1.0\"?>\n<!-- Generator: Inkscape -->\n<!DOCTYPE svg PUBLIC \"x\" \"y\">\n<svg/>")).isTrue()
        assertThat(svg("﻿<svg/>")).isTrue()
        assertThat(svg("<svg:svg xmlns:svg=\"http://www.w3.org/2000/svg\"/>")).isTrue()
    }

    @Test fun otherFilesAreNotSvg() {
        assertThat(svg("")).isFalse()
        assertThat(svg("<html><body><svg/></body></html>")).isFalse() // a proxy's error page
        assertThat(svg("<svgfoo/>")).isFalse()
        assertThat(svg("not markup <svg/>")).isFalse()
        assertThat(looksLikeSvg(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47))).isFalse()
        assertThat(svg("<!-- never closed <svg/>")).isFalse()
    }
}

class BombSpriteWarmerTest {
    private val red = com.aayush.diwaliplay.model.DEFAULT_BOMB_CONFIGS[0].copy(imageUrl = "/assets/red")
    private val settings = com.aayush.diwaliplay.model.DEFAULT_BOMB_SETTINGS
    private var clears = 0
    private var warmed = 0
    private var file: java.io.File? = null

    private val warmer = BombSpriteWarmer(
        clear = { clears++ },
        prewarm = { _, _ -> warmed++ },
        imageFile = { file },
    )

    @Test fun nothingChangedKeepsTheSprites() {
        warmer.warm(listOf(red), settings)
        val first = clears
        warmer.warm(listOf(red), settings)
        assertThat(clears).isEqualTo(first)
        assertThat(warmed).isEqualTo(2)
    }

    /** The round started before the download finished: the sprite has the fallback drawing. */
    @Test fun anImageThatHasSinceDownloadedRebuilds() {
        warmer.warm(listOf(red), settings)
        val first = clears
        file = java.io.File.createTempFile("bomb", null).also { it.deleteOnExit() }
        warmer.warm(listOf(red), settings)
        assertThat(clears).isEqualTo(first + 1)
    }

    @Test fun aReplacedImageUnderTheSameNameRebuilds() {
        val f = java.io.File.createTempFile("bomb", null).also { it.deleteOnExit() }
        f.setLastModified(1_000_000L)
        file = f
        warmer.warm(listOf(red), settings)
        val first = clears
        f.setLastModified(2_000_000L)
        warmer.warm(listOf(red), settings)
        assertThat(clears).isEqualTo(first + 1)
    }

    @Test fun changedConfigsOrSettingsRebuild() {
        warmer.warm(listOf(red), settings)
        val first = clears
        warmer.warm(listOf(red.copy(points = 999)), settings)
        assertThat(clears).isEqualTo(first + 1)
        warmer.warm(listOf(red.copy(points = 999)), settings.copy(bombRadius = 60.0))
        assertThat(clears).isEqualTo(first + 2)
    }
}
