package com.aayush.diwaliplay.branding

import com.aayush.diwaliplay.model.WallpaperItem
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WallpaperRotationTest {
    private val a = WallpaperItem("a", "http://x/a.png")
    private val b = WallpaperItem("b", "http://x/b.png")
    private val c = WallpaperItem("c", "http://x/c.png")

    @Test fun emptyPlaylistWithActiveUrlYieldsSingleActiveItem() {
        val r = buildRotationPlaylist("http://x/z.png", emptyList())
        assertThat(r).containsExactly(WallpaperItem("active_single", "http://x/z.png", "Active Wallpaper", 0))
    }

    @Test fun emptyEverythingIsEmpty() {
        assertThat(buildRotationPlaylist("", emptyList())).isEmpty()
    }

    @Test fun activeInPlaylistGoesFirstOthersKeepOrder() {
        assertThat(buildRotationPlaylist(b.url, listOf(a, b, c))).containsExactly(b, a, c).inOrder()
    }

    @Test fun activeNotInPlaylistIsPrepended() {
        val r = buildRotationPlaylist("http://x/z.png", listOf(a, b))
        assertThat(r.map { it.id }).containsExactly("active_custom", "a", "b").inOrder()
        assertThat(r[0].displayName).isEqualTo("Active Wallpaper")
    }

    @Test fun noActiveReturnsPlaylistAsIs() {
        assertThat(buildRotationPlaylist("", listOf(a, b))).containsExactly(a, b).inOrder()
    }

    @Test fun advanceCyclesThroughRotationAndWraps() {
        var r = initialRotation(a.url, listOf(a, b, c))
        assertThat(r).isEqualTo(WallpaperRotation(0, a.url))
        r = advanceRotation(a.url, listOf(a, b, c), r.index)
        assertThat(r).isEqualTo(WallpaperRotation(1, b.url))
        r = advanceRotation(a.url, listOf(a, b, c), r.index)
        r = advanceRotation(a.url, listOf(a, b, c), r.index)
        assertThat(r).isEqualTo(WallpaperRotation(0, a.url))
    }

    @Test fun advanceWithSingleOrNoItemsStaysPut() {
        assertThat(advanceRotation("http://x/z.png", emptyList(), 0)).isEqualTo(WallpaperRotation(0, "http://x/z.png"))
        assertThat(advanceRotation("", emptyList(), 3)).isEqualTo(WallpaperRotation(0, ""))
    }
}
