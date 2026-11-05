package com.aayush.diwaliplay.app

import android.content.ContentUris
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.provider.MediaStore
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsEnabled
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
import com.aayush.diwaliplay.app.ui.GameOverScreen
import com.aayush.diwaliplay.app.ui.PhotoCountdownScreen
import com.aayush.diwaliplay.app.ui.SpinWheelPanel
import com.aayush.diwaliplay.app.ui.Tags
import com.aayush.diwaliplay.app.ui.WISH_MIN_SP
import com.aayush.diwaliplay.app.ui.WheelInputs
import com.aayush.diwaliplay.app.ui.renderCard
import com.aayush.diwaliplay.app.ui.theme.DesignCanvas
import com.aayush.diwaliplay.game.FormattedPersonalizedWish
import com.aayush.diwaliplay.game.PlayerAchievement
import com.aayush.diwaliplay.game.flow.GamePhase
import com.aayush.diwaliplay.game.flow.RoundCard
import com.aayush.diwaliplay.model.EarnedReward
import com.aayush.diwaliplay.model.GameFeedback
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
                SpinWheelPanel(rewards, false, emptyMap(), { awaitCancellation() }, {}, {}, {}, Modifier.size(860.dp, 640.dp))
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

    private val longWish = FormattedPersonalizedWish(
        "HAPPY DIWALI, Asha, from all of us at the festival! \uD83D\uDE80\uD83D\uDCA5",
        List(12) { "Fast hands and soaring spirits! You scored a stellar 1,234 points today, and may the lights of this Diwali carry you to incredible heights all through the coming year." },
        "With the warmest of festive wishes from the whole team,\nItsSpotlight",
    )

    private fun gameOver(
        card: RoundCard = roundCard(),
        wheel: WheelInputs? = WheelInputs(prizes, { awaitCancellation() }),
        isTrial: Boolean = false,
        seconds: Int? = null,
    ) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                GameOverScreen(card, "ItsSpotlight", isTrial, seconds, null, emptyMap(), wheel, { true }, {}, {}, {})
            }
        }
        compose.mainClock.advanceTimeBy(1_500)
        Thread.sleep(300) // the photo decodes on a background thread
        compose.mainClock.advanceTimeBy(100)
    }

    private val prizes = listOf("₹1000/- OFF", "20% OFF", "Free Mug", "₹500", "Flat ₹200 OFF", "Mystery Gift Hamper").mapIndexed { i, n ->
        RewardItem(id = "r$i", name = n, couponCode = "DIWALI$i", termsAndConditions = "Show this code at the counter. Valid until the end of the festival.")
    }

    private fun bounds(tag: String) = compose.onNodeWithTag(tag).getBoundsInRoot()

    private fun screenshot(name: String) = dump(compose.onRoot().captureToImage().asAndroidBitmap(), name)

    /** The left column in order, the right column in order, and nothing off the canvas. */
    private fun assertColumnsInOrder(left: List<String>, right: List<String>) {
        for (column in listOf(left, right)) {
            column.zipWithNext { a, b -> assertThat(bounds(a).bottom).isAtMost(bounds(b).top) }
            assertThat(bounds(column.last()).bottom).isAtMost(1080.dp) // the emulator's pixels are the design canvas
        }
        assertThat(bounds(left.first()).right).isAtMost(bounds(right.first()).left)
    }

    @Test
    fun gameOverWithTheWheelImage() {
        gameOver()
        assertThat(shows(Tags.WISH)).isTrue()
        assertColumnsInOrder(listOf(Tags.WISH, Tags.SAVE_CARD), listOf(Tags.CARD_SCORE, Tags.POINTER, Tags.feedback("Good"), Tags.PLAY_AGAIN))
        assertThat(bounds(Tags.WHEEL).bottom).isAtMost(bounds(Tags.feedback("Good")).top)
        screenshot("native_gameover_wheel.png")
    }

    @Test
    fun theWheelFitsEvenWithAScorePrizeAndAFailure() {
        val wheel = WheelInputs(prizes, { SpinOutcome.Failed })
        gameOver(roundCard(EarnedReward("r", "Free Mug", "", "", "MUG50")), wheel)
        compose.onNodeWithTag(Tags.SPIN_BUTTON).performClick()
        compose.mainClock.advanceTimeBy(6_000)
        val wheelBounds = bounds(Tags.WHEEL)
        val pointer = bounds(Tags.POINTER)
        val banner = bounds(Tags.SPIN_ERROR)
        val prize = bounds(Tags.CARD_REWARD)
        assertThat(prize.bottom).isAtMost(pointer.top)
        assertThat(wheelBounds.bottom).isAtMost(banner.top)
        assertThat(banner.bottom).isAtMost(bounds(Tags.feedback("Good")).top)
        assertThat(wheelBounds.width).isEqualTo(wheelBounds.height)
        screenshot("native_gameover_wheel_prize_failed.png")
    }

    @Test
    fun gameOverAfterTheSpinImage() {
        val won = prizes[1]
        val wheel = WheelInputs(prizes, { SpinOutcome.Won(won, 1) })
        gameOver(roundCard(EarnedReward("r", "Free Mug", "", "", "MUG50")), wheel, seconds = 17)
        compose.onNodeWithTag(Tags.SPIN_BUTTON).performClick()
        compose.mainClock.advanceTimeBy(9_000)
        assertThat(shows(Tags.SPIN_VOUCHER)).isTrue()
        assertThat(shows(Tags.WHEEL)).isFalse()
        assertThat(shows(Tags.CARD_REWARD)).isTrue()
        assertThat(bounds(Tags.CARD_REWARD).bottom).isAtMost(bounds(Tags.SPIN_VOUCHER).top)
        assertThat(bounds(Tags.SPIN_VOUCHER).bottom).isAtMost(bounds(Tags.feedback("Good")).top)
        screenshot("native_gameover_prize.png")
    }

    @Test
    fun gameOverWithRewardsOffImage() {
        gameOver(wheel = null, seconds = 20)
        assertThat(shows(Tags.WHEEL)).isFalse()
        assertThat(bounds(Tags.SCORE_LARGE).bottom).isAtMost(bounds(Tags.feedback("Good")).top)
        screenshot("native_gameover_norewards.png")
    }

    @Test
    fun aLongWishStaysInItsCard() {
        val card = roundCard()
        val long = RoundCard(card.playerName, card.score, card.achievement, longWish, card.photoJpeg, card.targetScore, card.targetAchieved, null)
        gameOver(long)
        assertColumnsInOrder(listOf(Tags.WISH, Tags.SAVE_CARD), listOf(Tags.CARD_SCORE, Tags.PLAY_AGAIN))
        // At the floor, cut short with an ellipsis, and nothing spilling out of its box.
        val layout = wishLayout()
        assertThat(lineHeight(layout)).isWithin(4f).of(WISH_MIN_SP * 1.2f)
        assertThat(layout.isLineEllipsized(layout.lineCount - 1)).isTrue()
        assertThat(bounds(Tags.WISH_BODY).bottom).isAtMost(bounds(Tags.SAVE_CARD).top)
        screenshot("native_gameover_longwish.png")
    }

    /** In design pixels. autoSize's chosen size isn't in the layout's style; its effect on the lines is. */
    private fun lineHeight(layout: TextLayoutResult) = layout.getLineBottom(0) - layout.getLineTop(0)

    private fun wishLayout(): TextLayoutResult {
        val results = ArrayList<TextLayoutResult>()
        compose.onNodeWithTag(Tags.WISH_BODY).fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!(results)
        return results.single()
    }

    @Test
    fun anOrdinaryWishIsLargeAndWhole() {
        gameOver()
        val layout = wishLayout()
        assertThat(lineHeight(layout)).isGreaterThan(WISH_MIN_SP * 1.2f + 4f)
        assertThat(layout.isLineEllipsized(layout.lineCount - 1)).isFalse()
    }

    @Test
    fun aHeldWheelSaysSoAndWontSpin() {
        val spins = AtomicInteger(0)
        gameOver(
            wheel = WheelInputs(prizes, {
                spins.incrementAndGet()
                awaitCancellation()
            }, held = true),
        )
        assertThat(compose.onAllNodesWithTag(Tags.SPIN_WAITING, useUnmergedTree = true).fetchSemanticsNodes()).isNotEmpty()
        compose.onNodeWithTag(Tags.SPIN_BUTTON).performClick()
        compose.mainClock.advanceTimeBy(100)
        assertThat(spins.get()).isEqualTo(0)
        compose.onNodeWithTag(Tags.PLAY_AGAIN).assertIsEnabled()
        screenshot("native_gameover_wheel_held.png")
    }

    @Test
    fun aTrialHasNoFeedbackRow() {
        gameOver(isTrial = true)
        assertThat(shows(Tags.feedback("Good"))).isFalse()
        assertThat(shows(Tags.PLAY_AGAIN)).isTrue()
    }

    @Test
    fun theFeedbackRowTakesOneTap() {
        val sent = ArrayList<GameFeedback>()
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                var recorded by remember { mutableStateOf<GameFeedback?>(null) }
                GameOverScreen(roundCard(), "ItsSpotlight", false, null, recorded, emptyMap(), null, { true }, { sent += it; recorded = it }, {}, {})
            }
        }
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag(Tags.feedback("Excellent")).performClick()
        compose.mainClock.advanceTimeBy(100)
        assertThat(shows(Tags.FEEDBACK_THANKS)).isTrue()
        compose.onNodeWithTag(Tags.feedback("Good")).performClick()
        compose.mainClock.advanceTimeBy(100)
        assertThat(sent).containsExactly(GameFeedback.Excellent)
    }

    @Test
    fun photoScreenImage() {
        // Bright, with detail: the hard case for text over video. Its edge bands show whether it really fills the frame.
        val frame = Bitmap.createBitmap(640, 360, Bitmap.Config.ARGB_8888).also { b ->
            val c = Canvas(b)
            c.drawColor(Color.rgb(245, 240, 225))
            val paint = android.graphics.Paint()
            for (i in 0 until 16) {
                paint.color = if (i % 2 == 0) Color.rgb(250, 250, 250) else Color.rgb(190, 215, 240)
                c.drawRect(i * 40f, 0f, (i + 1) * 40f, 360f, paint)
            }
            paint.color = Color.RED
            c.drawRect(0f, 0f, 640f, 6f, paint)
            c.drawRect(0f, 354f, 640f, 360f, paint)
            c.drawRect(0f, 0f, 6f, 360f, paint)
            c.drawRect(634f, 0f, 640f, 360f, paint)
        }
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                PhotoCountdownScreen(GamePhase.PhotoCountdown(3), "Asha", TrackingStatus.Running("CPU", 5.0, 30.0)) { CameraFrame(frame, 0) }
            }
        }
        compose.mainClock.advanceTimeBy(200)
        val photoFrame = bounds(Tags.PHOTO_FRAME)
        // A third of the screen's area (0.577 of 1800 x 1010), centred on the 1920 x 1080 canvas.
        assertThat(photoFrame.width.value).isWithin(1f).of(1040f)
        assertThat(photoFrame.height.value).isWithin(1f).of(584f)
        assertThat(((photoFrame.left + photoFrame.right) / 2).value).isWithin(1f).of(960f)
        assertThat(((photoFrame.top + photoFrame.bottom) / 2).value).isWithin(1f).of(540f)
        assertThat(bounds(Tags.PHOTO_COUNT).right).isAtMost(photoFrame.right)
        screenshot("native_photo.png")
    }

    @Test
    fun theSpinButtonWaitsForTodaysRewards() {
        val gate = CompletableDeferred<List<RewardItem>?>()
        val spins = AtomicInteger(0)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DesignCanvas {
                SpinWheelPanel(
                    rewards = listOf(RewardItem(id = "old", name = "Old Prize")),
                    isTrial = false,
                    localFiles = emptyMap(),
                    requestSpin = {
                        spins.incrementAndGet()
                        awaitCancellation()
                    },
                    onTick = {},
                    onVictory = {},
                    onSettled = {},
                    modifier = Modifier.size(860.dp, 640.dp),
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
        screenshot("native_photo_error.png")
    }
}
