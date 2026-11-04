package com.aayush.diwaliplay.branding

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.util.Base64
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class AssetCacheTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var dir: File

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        dir = tmp.newFolder("cache")
    }

    @After fun tearDown() { server.shutdown() }

    private fun cache(d: File = dir) = AssetCache(d, OkHttpClient(), baseUrl = { server.url("/").toString().trimEnd('/') })

    @Test fun downloadsAndKeepsOriginalExtension() = runBlocking {
        server.enqueue(MockResponse().setBody("PNGDATA"))
        val url = server.url("/img/logo.png").toString()
        val f = cache().get(url)!!
        assertThat(f.name).matches("[0-9a-f]{64}\\.png")
        assertThat(f.readText()).isEqualTo("PNGDATA")
        assertThat(f.parentFile).isEqualTo(dir)
    }

    @Test fun assetCacheRevalidatesWith304() = runBlocking {
        server.enqueue(MockResponse().setHeader("ETag", "\"v1\"").setHeader("Last-Modified", "Wed, 21 Oct 2015 07:28:00 GMT").setBody("ONE"))
        server.enqueue(MockResponse().setResponseCode(304))
        val url = server.url("/a.mp3").toString()
        val first = cache().get(url)!!
        server.takeRequest()
        // A fresh instance proves the validators survive on disk (sidecar), not in memory.
        val second = cache().get(url)!!
        val req = server.takeRequest()
        assertThat(req.getHeader("If-None-Match")).isEqualTo("\"v1\"")
        assertThat(req.getHeader("If-Modified-Since")).isEqualTo("Wed, 21 Oct 2015 07:28:00 GMT")
        assertThat(second).isEqualTo(first)
        assertThat(second.readText()).isEqualTo("ONE")
    }

    @Test fun updatesFileWhenServerReturnsNewContent() = runBlocking {
        server.enqueue(MockResponse().setHeader("ETag", "\"v1\"").setBody("ONE"))
        server.enqueue(MockResponse().setHeader("ETag", "\"v2\"").setBody("TWO"))
        val url = server.url("/a.png").toString()
        val c = cache()
        c.get(url)
        assertThat(c.get(url)!!.readText()).isEqualTo("TWO")
        server.enqueue(MockResponse().setResponseCode(304))
        c.get(url)
        server.takeRequest(); server.takeRequest()
        assertThat(server.takeRequest().getHeader("If-None-Match")).isEqualTo("\"v2\"")
    }

    @Test fun assetCacheReturnsStaleOnFailure() = runBlocking {
        server.enqueue(MockResponse().setHeader("ETag", "\"v1\"").setBody("GOOD"))
        server.enqueue(MockResponse().setResponseCode(500).setBody("boom"))
        val url = server.url("/a.png").toString()
        val c = cache()
        c.get(url)
        assertThat(c.get(url)!!.readText()).isEqualTo("GOOD")
        server.shutdown() // connection refused
        assertThat(c.get(url)!!.readText()).isEqualTo("GOOD")
    }

    @Test fun nullWhenNothingCachedAndFetchFails() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(404))
        assertThat(cache().get(server.url("/missing.png").toString())).isNull()
    }

    @Test fun truncatedDownloadDoesNotReplaceGoodCopy() = runBlocking {
        server.enqueue(MockResponse().setBody("GOOD"))
        server.enqueue(MockResponse().setBody("x".repeat(10_000)).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY))
        val url = server.url("/a.png").toString()
        val c = cache()
        c.get(url)
        assertThat(c.get(url)!!.readText()).isEqualTo("GOOD")
        assertThat(dir.listFiles()!!.filter { it.name.endsWith(".tmp") }).isEmpty()
    }

    @Test fun relativeUrlsResolveAgainstApiBase() = runBlocking {
        server.enqueue(MockResponse().setBody("SOUND"))
        val f = cache().get("/api/assets/abc123/content")!!
        assertThat(f.readText()).isEqualTo("SOUND")
        assertThat(server.takeRequest().path).isEqualTo("/api/assets/abc123/content")
    }

    @Test fun decodesPercentEncodedSvgDataUrlWithoutNetwork() = runBlocking {
        val svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M1+1 é\"/></svg>"
        val enc = java.net.URLEncoder.encode(svg, "UTF-8").replace("+", "%20")
        val plusKept = "data:image/svg+xml;utf8,$enc"
        val f = cache().get(plusKept)!!
        assertThat(f.name).endsWith(".svg")
        assertThat(f.readText()).isEqualTo(svg)
        assertThat(server.requestCount).isEqualTo(0)
    }

    @Test fun decodesBase64DataUrl() = runBlocking {
        val b64 = Base64.getEncoder().encodeToString(byteArrayOf(1, 2, 3, 4))
        val f = cache().get("data:image/png;base64,$b64")!!
        assertThat(f.name).endsWith(".png")
        assertThat(f.readBytes()).isEqualTo(byteArrayOf(1, 2, 3, 4))
    }

    @Test fun peekReturnsCachedFileWithoutNetwork() = runBlocking {
        server.enqueue(MockResponse().setBody("X"))
        val url = server.url("/p.png").toString()
        val c = cache()
        assertThat(c.peek(url)).isNull()
        val f = c.get(url)
        assertThat(cache().peek(url)).isEqualTo(f)
        assertThat(server.requestCount).isEqualTo(1)
    }

    @Test fun blankUrlIsNull() = runBlocking {
        assertThat(cache().get("")).isNull()
        assertThat(cache().get("   ")).isNull()
    }
}
