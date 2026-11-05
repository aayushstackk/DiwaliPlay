package com.aayush.diwaliplay.app

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.WorkerThread
import androidx.core.net.toUri
import com.aayush.diwaliplay.app.ui.cardFileName
import java.io.File
import java.io.IOException
import java.io.OutputStream

private const val TAG = "CardSaver"
private const val FOLDER = "DiwaliPlay"
private const val JPEG_QUALITY = 95

/** The MediaStore calls [CardSaver] makes: a seam, because MediaProvider's failures can't be provoked on demand. */
internal interface ImageStore {
    fun insert(values: ContentValues): Uri?
    fun openOutput(uri: Uri): OutputStream?
    fun update(uri: Uri, values: ContentValues)
    fun delete(uri: Uri)
}

private class MediaStoreImages(private val resolver: ContentResolver) : ImageStore {
    override fun insert(values: ContentValues) = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
    override fun openOutput(uri: Uri) = resolver.openOutputStream(uri)
    override fun update(uri: Uri, values: ContentValues) { resolver.update(uri, values, null, null) }
    override fun delete(uri: Uri) { resolver.delete(uri, null, null) }
}

/**
 * The web's "Save Card": the card JPEG in `Pictures/DiwaliPlay/`. Disk work, so off the main thread.
 *
 * Known limit, Android 8 and 9 (API 26-28): saving needs WRITE_EXTERNAL_STORAGE. The manifest declares it, but nothing
 * requests it at runtime, because a kiosk has nobody to answer a prompt; there, unless the permission has been granted
 * some other way, a save fails and the player sees "Couldn't save". The target device runs Android 14, which needs none.
 */
class CardSaver internal constructor(context: Context, private val images: ImageStore) {
    constructor(context: Context) : this(context, MediaStoreImages(context.applicationContext.contentResolver))

    private val app = context.applicationContext

    /** Where it went, or null if it couldn't be saved. */
    @WorkerThread
    fun save(bitmap: Bitmap, playerName: String, score: Int): Uri? {
        val name = cardFileName(playerName, score)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) saveToMediaStore(bitmap, name) else saveToFile(bitmap, name)
        } catch (e: IOException) {
            Log.e(TAG, "could not save the card: ${e.javaClass.simpleName}")
            null
        } catch (e: RuntimeException) {
            // MediaProvider also throws IllegalStateException and IllegalArgumentException, and SecurityException: this
            // runs in a screen's coroutine, where any of them would take the kiosk down.
            Log.e(TAG, "could not save the card: ${e.javaClass.simpleName}")
            null
        }
    }

    private fun saveToMediaStore(bitmap: Bitmap, name: String): Uri? {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$FOLDER")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = images.insert(values) ?: return null
        var saved = false
        try {
            val out = images.openOutput(uri) ?: throw IOException("no output stream")
            out.use { if (!bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it)) throw IOException("compress failed") }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            images.update(uri, values)
            saved = true
            return uri
        } finally {
            if (!saved) deletePending(uri)
        }
    }

    /** Nothing more can be done if this fails too, and the original failure is the one to report. */
    private fun deletePending(uri: Uri) {
        try {
            images.delete(uri)
        } catch (e: RuntimeException) {
            Log.e(TAG, "could not remove the unfinished card: ${e.javaClass.simpleName}")
        }
    }

    /** Android 8 and 9 have no RELATIVE_PATH. See the class comment for the permission this needs. */
    @Suppress("DEPRECATION")
    private fun saveToFile(bitmap: Bitmap, name: String): Uri {
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FOLDER)
        if (!dir.isDirectory && !dir.mkdirs()) throw IOException("can't create $dir")
        val file = File(dir, name)
        file.outputStream().use { if (!bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it)) throw IOException("compress failed") }
        MediaScannerConnection.scanFile(app, arrayOf(file.path), arrayOf("image/jpeg"), null)
        return file.toUri()
    }
}
