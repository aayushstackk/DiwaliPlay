package com.aayush.diwaliplay.app.ui

import com.aayush.diwaliplay.app.BackdropKind
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class BackdropImagesTest {
    private val startFile = File("/tmp/start.png")
    private val wallpaperFile = File("/tmp/wallpaper.png")
    private val startDecodes = mutableListOf<File>()
    private val wallpaperDecodes = mutableListOf<File>()
    private val images = BackdropImages(
        decodeStart = { file -> startDecodes += file; "start:${file.name}" },
        decodeWallpaper = { file -> wallpaperDecodes += file; "wallpaper:${file.name}" },
    )

    @Test fun theStartScreenDoesNotEvictTheWallpaper() {
        repeat(3) {
            assertThat(images.imageFor(BackdropKind.Wallpaper, wallpaperFile)).isEqualTo("wallpaper:wallpaper.png")
            assertThat(images.imageFor(BackdropKind.StartBackground, startFile)).isEqualTo("start:start.png")
        }
        assertThat(wallpaperDecodes).containsExactly(wallpaperFile)
    }

    @Test fun theBuiltInOrAVideoOnTheStartScreenDoesNotEvictTheWallpaper() {
        images.imageFor(BackdropKind.Wallpaper, wallpaperFile)
        assertThat(images.imageFor(BackdropKind.StartBackground, null)).isNull()
        assertThat(images.imageFor(BackdropKind.Wallpaper, wallpaperFile)).isEqualTo("wallpaper:wallpaper.png")
        assertThat(wallpaperDecodes).containsExactly(wallpaperFile)
    }

    @Test fun theStartImageIsDecodedOnceWhileItShows() {
        repeat(3) { images.imageFor(BackdropKind.StartBackground, startFile) }
        assertThat(startDecodes).containsExactly(startFile)
    }

    @Test fun theStartImageIsNotKeptDuringARound() {
        images.imageFor(BackdropKind.StartBackground, startFile)
        images.imageFor(BackdropKind.CameraSoftVignette, null)
        images.imageFor(BackdropKind.StartBackground, startFile)
        assertThat(startDecodes).containsExactly(startFile, startFile)
    }

    @Test fun aChangedFileIsDecodedInItsOwnSlot() {
        val other = File("/tmp/other.png")
        images.imageFor(BackdropKind.Wallpaper, wallpaperFile)
        assertThat(images.imageFor(BackdropKind.Wallpaper, other)).isEqualTo("wallpaper:other.png")
        images.imageFor(BackdropKind.StartBackground, startFile)
        assertThat(images.imageFor(BackdropKind.StartBackground, other)).isEqualTo("start:other.png")
        assertThat(wallpaperDecodes).containsExactly(wallpaperFile, other)
        assertThat(startDecodes).containsExactly(startFile, other)
    }

    @Test fun aFileThatWontDecodeIsTriedOnce() {
        val decodes = mutableListOf<File>()
        val broken = BackdropImages<String>(decodeStart = { decodes += it; null }, decodeWallpaper = { null })
        repeat(3) { assertThat(broken.imageFor(BackdropKind.StartBackground, startFile)).isNull() }
        assertThat(decodes).containsExactly(startFile)
    }

    @Test fun kindsWithoutAnImageDrawNone() {
        assertThat(images.imageFor(BackdropKind.Dark, wallpaperFile)).isNull()
        assertThat(images.imageFor(BackdropKind.CameraStrongVignette, wallpaperFile)).isNull()
        assertThat(wallpaperDecodes).isEmpty()
    }
}
