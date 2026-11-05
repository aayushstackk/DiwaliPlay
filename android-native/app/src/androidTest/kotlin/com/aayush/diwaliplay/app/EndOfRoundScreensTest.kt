package com.aayush.diwaliplay.app

import android.content.ContentUris
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.provider.MediaStore
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aayush.diwaliplay.app.ui.CardData
import com.aayush.diwaliplay.app.ui.FeedbackScreen
import com.aayush.diwaliplay.app.ui.GreetingCardScreen
import com.aayush.diwaliplay.app.ui.PhotoCountdownScreen
import com.aayush.diwaliplay.app.ui.SpinWheelScreen
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.app.ui.renderCard
import com.aayush.diwaliplay.app.ui.theme.DesignCanvas
import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import com.aayush.diwaliplay.game.PlayerAchievement
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.game.flow.RoundCard
import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.GameScoreState
import com.aayush.diwaliplay.model.RewardItem
import com.aayush.diwaliplay.tracking.camera.CameraFrame
import com.aayush.diwaliplay.tracking.camera.TrackingStatus
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Saving to MediaStore on a real device, and images of each screen in the app's external files for inspection. */
@RunWith(AndroidJUnit4::class)
class EndOfRoundScreensTest {
    @get:Rule val compose = createComposeRule()

    private val app get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun dump(bitmap: Bitmap, name: String) {
        val dir = File(app.getExternalFilesDir(null), "screens").apply { mkdirs() }
        File(dir, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun photo(): ByteArray {
        val b = Bitmap.createBitmap(1280, 720, Bitmap.Config.ARGB_8888)
        Canvas(b).drawColor(Color.rgb(70, 110, 150))
        return ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, 92, it) }.toByteArray()
    }

    private fun data(photo: ByteArray?) = CardData(
        "Asha", "ItsSpotlight",
        GameScoreState(score = 1234, bombsBurst = 22, combosAwarded = 3, penaltyDeductions = 50, comboBonusPoints = 75),
        PlayerAchievement("🚀", "Rocket Ace", "Sky Blasting Reflector"),
        FormattedPersonalizedWish(
            "HAPPY DIWALI, Asha! 🚀💥",
            listOf("Fast hands and soaring spirits! You scored a stellar 1,234 points today.", "May you soar to incredible heights this year!"),
            "Best festive wishes,\nItsSpotlight",
        ),
        photo, 1000, true,
    )

    @Test
    fun cardSavesAsAJpegInPicturesDiwaliPlay() {
        val card = renderCard(data(photo()))
        dump(card, "task19_card.png")
        val uri = CardSaver(app).save(card, "Asha Test", 1234)
        assertThat(uri).isNotNull()
        try {
            val projection = arrayOf(MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.RELATIVE_PATH, MediaStore.Images.Media.MIME_TYPE)
            app.contentResolver.query(uri!!, projection, null, null, null)!!.use { c ->
                assertThat(c.moveToFirst()).isTrue()
                assertThat(c.getString(0)).isEqualTo("Diwali_Fun_Play_Asha Test_1234.jpg")
                assertThat(c.getString(1)).isEqualTo("Pictures/DiwaliPlay/")
                assertThat(c.getString(2)).isEqualTo("image/jpeg")
            }
            val saved = app.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it) }
            assertThat(saved.width).isEqualTo(900)
        } finally {
            uri?.let { app.contentResolver.delete(ContentUris.removeId(it).buildUpon().appendPath(it.lastPathSegment).build(), null, null) }
        }
    }

    @Test
    fun wheelMidSpinImage() {
        val rewards = listOf("₹1000/- OFF", "20% OFF", "Free Mug", "₹500", "Flat ₹200 OFF", "Mystery Gift Hamper").mapIndexed { i, n -> RewardItem(id = "r$i", name = n) }
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                SpinWheelScreen(rewards, false, null, emptyMap(), { awaitCancellation() }, {}, {}, {}, {}, {})
            }
        }
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag(Tags.SPIN_BUTTON).performClick()
        compose.mainClock.advanceTimeBy(700)
        dump(compose.onRoot().captureToImage().asAndroidBitmap(), "task19_wheel.png")
    }

    private fun roundCard(reward: EarnedReward? = null) = RoundCard(
        "Asha",
        GameScoreState(score = 1234, bombsBurst = 22, combosAwarded = 3, penaltyDeductions = 50, comboBonusPoints = 75),
        PlayerAchievement("\uD83D\uDE80", "Rocket Ace", "Sky Blasting Reflector"),
        FormattedPersonalizedWish(
            "HAPPY DIWALI, Asha! \uD83D\uDE80\uD83D\uDCA5",
            listOf("Fast hands and soaring spirits! You scored a stellar 1,234 points today.", "May you soar to incredible heights this year!"),
            "Best festive wishes,\nItsSpotlight",
        ),
        photo(), 1000, true, reward,
    )

    @Test
    fun greetingCardImages() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                GreetingCardScreen(
                    roundCard(EarnedReward("r", "Free Mug", "", "", "MUG50")),
                    "ItsSpotlight", true, false, null, emptyMap(), {}, { true }, {}, {},
                )
            }
        }
        compose.mainClock.advanceTimeBy(1_500)
        Thread.sleep(300) // the photo decodes on a background thread
        compose.mainClock.advanceTimeBy(100)
        dump(compose.onRoot().captureToImage().asAndroidBitmap(), "task19_card_screen_closed.png")
        compose.onNodeWithTag(Tags.ENVELOPE).performClick()
        compose.mainClock.advanceTimeBy(900)
        dump(compose.onRoot().captureToImage().asAndroidBitmap(), "task19_card_screen_open.png")
    }

    @Test
    fun photoScreenImage() {
        val frame = Bitmap.createBitmap(640, 360, Bitmap.Config.ARGB_8888).also { Canvas(it).drawColor(Color.rgb(70, 110, 150)) }
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                PhotoCountdownScreen(GamePhase.PhotoCountdown(3), "Asha", TrackingStatus.Running("CPU", 5.0, 30.0)) { CameraFrame(frame, 0) }
            }
        }
        compose.mainClock.advanceTimeBy(200)
        dump(compose.onRoot().captureToImage().asAndroidBitmap(), "task19_photo.png")
    }

    @Test
    fun theSpinButtonWaitsForTodaysRewards() {
        val gate = CompletableDeferred<List<RewardItem>?>()
        val spins = AtomicInteger(0)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                SpinWheelScreen(
                    rewards = listOf(RewardItem(id = "old", name = "Old Prize")),
                    isTrial = false,
                    autoReturnSeconds = null,
                    localFiles = emptyMap(),
                    requestSpin = {
                        spins.incrementAndGet()
                        awaitCancellation()
                    },
                    onTick = {},
                    onVictory = {},
                    onSettled = {},
                    onContinue = {},
                    onClose = {},
                    loadRewards = { gate.await() },
                )
            }
        }
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag(Tags.SPIN_BUTTON).performClick()
        compose.mainClock.advanceTimeBy(100)
        assertThat(spins.get()).isEqualTo(0)

        gate.complete(null) // failed: the cached slices stay and the wheel can spin
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag(Tags.SPIN_BUTTON).performClick()
        compose.mainClock.advanceTimeBy(100)
        assertThat(spins.get()).isEqualTo(1)
    }

    private fun photoScreen(phase: GamePhase.PhotoCountdown, status: TrackingStatus = TrackingStatus.Running("CPU", 5.0, 30.0)) {
        compose.mainClock.autoAdvance = false
        compose.setContent { DesignCanvas { PhotoCountdownScreen(phase, "Asha", status) { null } } }
        compose.mainClock.advanceTimeBy(100)
    }

    private fun shows(tag: String) = compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun theStampOnlyShowsForARealStill() {
        photoScreen(GamePhase.PhotoCountdown(0))
        assertThat(shows(Tags.PHOTO_CAPTURED)).isFalse()
    }

    @Test
    fun theStampShowsOnceCaptured() {
        photoScreen(GamePhase.PhotoCountdown(0, captured = true))
        assertThat(shows(Tags.PHOTO_CAPTURED)).isTrue()
    }

    @Test
    fun noCountdownShowsWhileWaitingForTheCamera() {
        photoScreen(GamePhase.PhotoCountdown(5, waitingForCamera = true), TrackingStatus.Starting)
        assertThat(shows(Tags.PHOTO_COUNT)).isFalse()
        assertThat(shows(Tags.PHOTO_ERROR)).isFalse()
    }

    @Test
    fun cameraErrorStateImage() {
        photoScreen(GamePhase.PhotoCountdown(0, cameraError = true), TrackingStatus.Starting)
        assertThat(shows(Tags.PHOTO_ERROR)).isTrue()
        assertThat(shows(Tags.PHOTO_CAPTURED)).isFalse()
        dump(compose.onRoot().captureToImage().asAndroidBitmap(), "task19_photo_error.png")
    }

    @Test
    fun wheelWithAScorePrizeImage() {
        val rewards = listOf("₹1000/- OFF", "20% OFF", "Free Mug", "₹500").mapIndexed { i, n -> RewardItem(id = "r$i", name = n) }
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                SpinWheelScreen(
                    rewards, false, null, emptyMap(), { SpinOutcome.Failed }, {}, {}, {}, {}, {},
                    earnedReward = EarnedReward("m", "Free Mug", "", "", "MUG50"),
                )
            }
        }
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag(Tags.SPIN_BUTTON).performClick()
        compose.mainClock.advanceTimeBy(6_000) // settled: the Continue button is up, the tightest layout
        dump(compose.onRoot().captureToImage().asAndroidBitmap(), "task19_wheel_prize.png")

        // The message has to be readable, and everything has to fit, in this tightest layout.
        fun bounds(tag: String) = compose.onNodeWithTag(tag).getBoundsInRoot()
        val banner = bounds(Tags.SPIN_ERROR)
        val wheel = bounds(Tags.WHEEL)
        val pointer = bounds(Tags.POINTER)
        assertThat(banner.top).isAtLeast(wheel.bottom)
        assertThat(banner.top).isAtLeast(pointer.bottom)
        assertThat(banner.bottom).isAtMost(bounds(Tags.CARD_REWARD).top)
        assertThat(bounds(Tags.CARD_REWARD).bottom).isAtMost(bounds(Tags.SPIN_CONTINUE).top)
    }

    @Test
    fun feedbackImage() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                FeedbackScreen(RewardItem(id = "r", name = "20% OFF", couponCode = "DIWALI20"), false, 17, null, emptyMap(), {}, {}, {})
            }
        }
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag(Tags.feedback("Excellent")).performClick()
        compose.mainClock.advanceTimeBy(100)
        dump(compose.onRoot().captureToImage().asAndroidBitmap(), "task19_feedback.png")
    }
}
