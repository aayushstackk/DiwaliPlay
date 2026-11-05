package com.aayush.diwaliplay.app

import android.content.ContentValues
import android.graphics.Bitmap
import android.net.Uri
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** MediaProvider's failures must come back as "not saved": thrown, they'd take the kiosk down. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], manifest = Config.NONE)
class CardSaverTest {
    private val uri = Uri.parse("content://media/external/images/media/1")

    private inner class Store(
        val onInsert: () -> Uri? = { uri },
        val onOpen: () -> OutputStream? = { ByteArrayOutputStream() },
        val onUpdate: () -> Unit = {},
        val onDelete: () -> Unit = {},
    ) : ImageStore {
        val deleted = ArrayList<Uri>()
        var updates = 0
        override fun insert(values: ContentValues) = onInsert()
        override fun openOutput(uri: Uri) = onOpen()
        override fun update(uri: Uri, values: ContentValues) { updates++; onUpdate() }
        override fun delete(uri: Uri) { deleted += uri; onDelete() }
    }

    private fun save(store: Store): Uri? {
        val saver = CardSaver(RuntimeEnvironment.getApplication(), store)
        return saver.save(Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888), "Asha", 1)
    }

    @Test
    fun aGoodSaveReturnsTheUriAndKeepsTheRow() {
        val store = Store()
        assertThat(save(store)).isEqualTo(uri)
        assertThat(store.deleted).isEmpty()
        assertThat(store.updates).isEqualTo(1)
    }

    @Test
    fun insertThrowingIsNotSaved() {
        val store = Store(onInsert = { throw IllegalStateException("volume not mounted") })
        assertThat(save(store)).isNull()
        assertThat(store.deleted).isEmpty() // no row was made
    }

    @Test
    fun insertReturningNothingIsNotSaved() {
        assertThat(save(Store(onInsert = { null }))).isNull()
    }

    @Test
    fun openThrowingAnythingDeletesThePendingRow() {
        for (e in listOf(IllegalArgumentException("x"), IllegalStateException("x"), SecurityException("x"))) {
            val store = Store(onOpen = { throw e })
            assertThat(save(store)).isNull()
            assertThat(store.deleted).containsExactly(uri)
        }
        val io = Store(onOpen = { throw IOException("x") })
        assertThat(save(io)).isNull()
        assertThat(io.deleted).containsExactly(uri)
    }

    @Test
    fun noOutputStreamDeletesThePendingRow() {
        val store = Store(onOpen = { null })
        assertThat(save(store)).isNull()
        assertThat(store.deleted).containsExactly(uri)
    }

    @Test
    fun failingToFinishDeletesThePendingRow() {
        val store = Store(onUpdate = { throw IllegalStateException("x") })
        assertThat(save(store)).isNull()
        assertThat(store.deleted).containsExactly(uri)
    }

    @Test
    fun aFailedDeleteStillReportsNotSaved() {
        val store = Store(onOpen = { throw IllegalStateException("x") }, onDelete = { throw IllegalStateException("y") })
        assertThat(save(store)).isNull()
    }
}
