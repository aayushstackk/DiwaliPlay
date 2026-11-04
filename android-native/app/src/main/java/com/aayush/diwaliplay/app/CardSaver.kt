package com.aayush.diwaliplay.app

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

private const val TAG = "CardSaver"
private const val FOLDER = "DiwaliPlay"
private const val JPEG_QUALITY = 95

/** The web's "Save Card": the card JPEG in `Pictures/DiwaliPlay/`. Disk work, so off the main thread. */
class CardSaver(context: Context) {
    private val app = context.applicationContext

    /** Where it went, or null if it couldn't be saved. */
    @WorkerThread
    fun save(bitmap: Bitmap, playerName: String, score: Int): Uri? {
        val name = cardFileName(playerName, score)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) saveToMediaStore(bitmap, name) else saveToFile(bitmap, name)
        } catch (e: IOException) {
            Log.e(TAG, "could not save $name", e)
            null
        } catch (e: SecurityException) {
            Log.e(TAG, "could not save $name", e)
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
        val resolver = app.contentResolver
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return null
        try {
            val out = resolver.openOutputStream(uri) ?: throw IOException("no output stream")
            out.use { if (!bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it)) throw IOException("compress failed") }
        } catch (e: IOException) {
            resolver.delete(uri, null, null)
            throw e
        }
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return uri
    }

    /** Android 8 and 9 have no RELATIVE_PATH; they need WRITE_EXTERNAL_STORAGE, which the manifest asks for up to 28. */
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
