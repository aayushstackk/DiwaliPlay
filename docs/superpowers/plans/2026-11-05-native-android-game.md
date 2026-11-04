# Native Android Kiosk Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully native Kotlin version of the DiwaliPlay kiosk game in `android-native/`, with feature parity with the web kiosk, tuned for the Samsung WAF display.

**Architecture:** Gradle multi-module app.
- Pure Kotlin game rules (`core:game`) are verified against the TypeScript originals with golden fixtures.
- CameraX + native MediaPipe (GPU) feed a tracking state machine (`core:tracking`).
- A 1080p `SurfaceView` render thread (`core:render`) draws effects; Compose draws screens and overlays.
- Supporting modules handle server calls (`core:api`), admin content (`core:branding`), sound (`core:audio`) and kiosk lock and relay (`core:kiosk`).

**Tech Stack:** Kotlin, Jetpack Compose, CameraX, MediaPipe Tasks Vision (Android), OkHttp + kotlinx.serialization, Media3 ExoPlayer, SoundPool, ZXing core, JUnit4 + Truth, OkHttp MockWebServer, Robolectric (JVM tests touching Android types), Compose UI test on emulator.

**Spec:** `docs/superpowers/specs/2026-11-05-native-android-game-design.md` — read it alongside this plan.

## Global Constraints

- Project root: `android-native/`. Application ID `com.aayush.diwaliplay.kiosk`. Base package `com.aayush.diwaliplay`.
- `minSdk 26`, `targetSdk 35`, `compileSdk 35`, landscape only (`android:screenOrientation="sensorLandscape"`).
- JDK: Android Studio's bundled JBR (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`, Java 25), so Gradle wrapper must be **≥ 9.1**. Export `JAVA_HOME` to it for every Gradle command in this plan.
- Version floors (use the newest stable at or above these; pin exact versions in `gradle/libs.versions.toml`):
  - Kotlin 2.2, AGP 8.13
  - Compose BOM 2025.01, CameraX 1.4.0, `com.google.mediapipe:tasks-vision` 0.10.20
  - Media3 1.5.0, OkHttp 4.12, kotlinx-serialization 1.8, ZXing core 3.5.3
  - Robolectric 4.14, Truth 1.4
- Logical game space is **1920×1080** everywhere: tracking output, game rules, render surface (`setFixedSize(1920, 1080)`), and the Compose design canvas (scale UI by `screenWidthPx / 1920`).
- All game constants and rules come from the web files named in each task; never invent tuning values.
- Randomness in `core:game` goes through `GameRandom` (Task 3) so golden tests are deterministic.
- Default server addresses: `apiBaseUrl = "https://diwaliplay.onrender.com"`, `publicWebUrl = "https://diwali-game-six.vercel.app"`.
- Trial code `"8536"` is handled locally with no network and no persistence; trial session id `"trial_session_8536"`, user id `"trial_user_8536"`.
- Nothing outside `android-native/`, `scripts/native-golden/`, `scripts/export-native-sounds/` and the relay platform field (Task 21) changes. The web app must keep building (`npm run build`) and type-checking unchanged (only the pre-existing error in `tests/test-remote-kiosk-relay.ts` is allowed).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit locally; don't push.

## Review Focus

1. **Camera disconnects or errors mid-round.** The round keeps running with hands "not detected", ends normally and saves the score; the camera error shows after the round. No crash, no stuck screen. (Test: Task 11, Task 17.)
2. **Render backend cold start (30 s+) while a player presses PLAY repeatedly.** Exactly one verify request is in flight, the keypad shows "connecting…", and a late success still unlocks the round. (Test: Task 12, Task 18.)
3. **Settings JSON from an older or partially configured server** (missing fields, `null`s, unknown keys, empty playlists). Defaults from the web code apply and nothing crashes. (Test: Task 2.)
4. **Queued round result re-sent after the app was killed mid-upload.** The server says the session is already completed (4xx), so the queue drops it instead of retrying forever, and never sends duplicates concurrently. (Test: Task 12.)
5. **Activity paused or recreated mid-round** (HDMI input switch, screen off, process death). The round is abandoned (`/api/session/abandon`), the camera is released and the app returns to the start screen on resume. (Test: Task 11, Task 18.)

---

## File Structure

```
android-native/
  settings.gradle.kts, build.gradle.kts, gradle.properties, gradle/libs.versions.toml, gradlew*
  README.md
  app/                       MainActivity, navigation, screens, DI (AppContainer)
    src/main/java/com/aayush/diwaliplay/app/...
    src/main/assets/{models/hand_landmarker.task, sounds/*.ogg, sounds/manifest.json}
  core/model/                DTOs + game/motion types (Kotlin/JVM library)
  core/game/                 pure rules (Kotlin/JVM library) + golden tests
  core/tracking/             Android library: camera + MediaPipe (android), HandTracker (pure)
  core/render/               Android library: render thread, CanvasRenderer, sprites
  core/audio/                Android library: SoundResolver (pure), AudioEngine
  core/api/                  Kotlin/JVM library: GameApi, ResultQueue
  core/branding/             Android library: SettingsRepository, AssetCache
  core/kiosk/                Android library: lock, crash restart, PIN, relay
scripts/native-golden/       TS → JSON golden fixture generator (tsx)
scripts/export-native-sounds/ web page + driver that renders built-in sounds to WAV
```

Pure modules (`core:model`, `core:game`, `core:api`) are `kotlin("jvm")` libraries so their tests run without Android.

---

### Task 1: Scaffold the Gradle project

**Files:**
- Create: `android-native/settings.gradle.kts`, `android-native/build.gradle.kts`, `android-native/gradle.properties`, `android-native/gradle/libs.versions.toml`, Gradle wrapper files, `android-native/.gitignore`, per-module `build.gradle.kts` for `app` and the eight `core:*` modules, `app/src/main/AndroidManifest.xml`, `app/src/main/java/com/aayush/diwaliplay/app/MainActivity.kt`
- Test: `core/game/src/test/kotlin/com/aayush/diwaliplay/game/SmokeTest.kt`

**Interfaces:**
- Produces: module names `:app`, `:core:model`, `:core:game`, `:core:tracking`, `:core:render`, `:core:audio`, `:core:api`, `:core:branding`, `:core:kiosk`; dependency graph exactly as spec Section 4.

- [ ] **Step 1:** Install SDK platform 35: `~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager "platforms;android-35"`. Expected: `platforms/android-35` exists.
- [ ] **Step 2:** Generate the wrapper (Gradle ≥ 9.1) and write the build files.
  - Module types: `core:model`/`core:game`/`core:api` are JVM; the rest are Android libraries; `app` is the application.
  - `.gitignore` covers `.gradle/`, `build/`, `local.properties`, `*.keystore`, `*.jks`.
  - `MainActivity` shows a placeholder Compose `Text("DiwaliPlay")` in landscape.
- [ ] **Step 3:** Write `SmokeTest.smokeRuns()` asserting `1 + 1 == 2` (proves JVM test wiring).
- [ ] **Step 4:** Run `cd android-native && ./gradlew test assembleDebug`. Expected: BUILD SUCCESSFUL; `app/build/outputs/apk/debug/app-debug.apk` exists.
- [ ] **Step 5:** Commit: `feat(android): scaffold native Android project`.

### Task 2: Shared model types (`core:model`)

**Files:**
- Create: `core/model/src/main/kotlin/com/aayush/diwaliplay/model/{Backend.kt, Motion.kt, Json.kt}`
- Test: `core/model/src/test/kotlin/.../DecodeTest.kt`, fixtures in `core/model/src/test/resources/api/*.json`

**Interfaces:**
- Produces:
  - `@Serializable` Kotlin mirrors of these `src/types/backend.ts` types, with identical field names and web defaults as Kotlin defaults: `User`, `GameCode`, `GameSession`, `VerifyCodeResponse`, `StartSessionRequest/Response`, `CompleteSessionRequest/Response`, `SubmitFeedbackRequest/Response`, `AbandonSessionRequest`, `SystemSettings`, `GameAudioSettings` (+ nested configs), `SoundPreset`, `AchievementTier`, `BombConfig`, `BombGameSettings`, `ListBombsResponse`, `RewardItem`, `SpinWheelRequest/Response`, `KioskDeviceStatus` (incl. new `platform: String? = null`), `GameFeedback` (enum serialised as `"Good"`, `"Excellent"`, `"Needs Improvement"`).
  - Mirrors of `src/types/motion.ts`: `LandmarkPoint(x,y,z)`, `Point2D`, `TargetAreaRect`, `HandGesture`, `MovementDirection`, `GameScoreState` (defaults = `INITIAL_SCORE_STATE`), `TrackedHand`, `GameState` enum (`IDLE, READY, COUNTDOWN, PLAYING, PHOTO_COUNTDOWN, GAME_OVER`).
  - `data class HandRender(val side: String, val x: Double, val y: Double, val speed: Double, val vx: Double, val vy: Double, val detected: Boolean, val isPredicted: Boolean, val gesture: HandGesture, val marks: List<LandmarkPoint>?, val trail: List<TrailPoint>)` and `TrailPoint(x, y, timeMs, speed)` — the drawing data the renderer needs, so `core:render` doesn't depend on `core:tracking`.
  - `val DiwaliJson: Json` (`ignoreUnknownKeys = true`, `coerceInputValues = true`, `explicitNulls = false`, `encodeDefaults = true`).

- [ ] **Step 1: Capture real fixtures.**
  1. Run the local server: `npm run dev`, port from its log line.
  2. Save responses for `GET /api/settings`, `/api/bombs`, `/api/rewards`, and `POST /api/kiosk/verify-code` with `{"code":"8536"}`.
  3. Hand-write `settings_minimal.json` = `{"success":true,"settings":{"brandName":"X"}}` and `settings_nulls.json` (every optional field `null`, plus an unknown key `"futureField":1`).
- [ ] **Step 2: Write failing tests.**
  - `decodesRealSettings` asserts `brandName`, `gameDurationSeconds` and `audioSettings.bgm` are non-null.
  - `minimalSettingsUseWebDefaults` asserts `gameDurationSeconds == 35`, `gameplayMode == "camera"`, `wallpaperEnabled == true`, `targetScore == 5000`, `rewardsEnabled == true`.
  - `nullsAndUnknownKeysDoNotCrash` (Review Focus 3).
  - `decodesBombsAndRewards`, `trialVerifyResponseIsTrial`.
  - `completeRequestRoundTrips` encodes, decodes and compares equal.
- [ ] **Step 3:** Run `./gradlew :core:model:test`. Expected: FAIL (types missing).
- [ ] **Step 4:** Implement the types and `DiwaliJson`.
- [ ] **Step 5:** Run `./gradlew :core:model:test`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): shared model types`.

### Task 3: Golden fixture generator and seeded random

**Files:**
- Create:
  - `scripts/native-golden/generate.ts`, `scripts/native-golden/mulberry32.ts`, `scripts/native-golden/README.md`
  - `core/game/src/main/kotlin/.../game/GameRandom.kt`
  - `core/game/src/test/kotlin/.../game/golden/Golden.kt` (fixture loader)
- Test: `core/game/src/test/kotlin/.../game/GameRandomTest.kt`

**Interfaces:**
- Produces:
  - `interface GameRandom { fun nextDouble(): Double }`, plus `class Mulberry32(seed: Int) : GameRandom` and `object SystemRandom : GameRandom`.
  - `fun loadGolden(name: String): JsonElement` (reads `src/test/resources/golden/<name>.json`).
  - CLI: `npx tsx scripts/native-golden/generate.ts --out android-native/core/game/src/test/resources/golden` writes one JSON file per generator. Generators are registered in a `generators` map; later tasks add entries.

`mulberry32` must be bit-identical in TS and Kotlin (32-bit integer maths with `ushr` / `>>> 0`):

```ts
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 1:** Add generator `random_sequence`: the first 1000 values of `mulberry32(42)` and `mulberry32(-7)`.
- [ ] **Step 2:** Write `GameRandomTest.matchesTypeScriptSequence` comparing all 1000 values exactly.
- [ ] **Step 3:** Run the generator, then `./gradlew :core:game:test --tests '*GameRandomTest*'`. Expected: FAIL (no `Mulberry32`).
- [ ] **Step 4:** Implement `Mulberry32` in Kotlin (`Int` arithmetic, `toUInt().toDouble() / 4294967296.0`).
- [ ] **Step 5:** Re-run. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): golden fixture pipeline and seeded random`.

> Every later golden test patches `Math.random = mulberry32(seed)` in the generator before calling the web function, and passes `Mulberry32(seed)` to the Kotlin port. Call order must match the TS source so the sequences line up.

### Task 4: Scoring, timer and achievements (`core:game`)

**Files:**
- Create: `core/game/src/main/kotlin/.../game/{ScoreSystem.kt, Achievements.kt}`
- Modify: `scripts/native-golden/generate.ts` (generators `score_system`, `achievements`)
- Test: `core/game/src/test/kotlin/.../game/{ScoreSystemGoldenTest.kt, AchievementsGoldenTest.kt}`

**Interfaces:**
- Consumes: `GameRandom`, model types (Task 2).
- Produces:
  - `const val GAME_DURATION_SECONDS = 35`
  - `fun formatGameTimer(secondsRemaining: Double): String`
  - `data class BurstPoints(val points: Int, val label: String)`
  - `fun calculateBurstPoints(speed: Double, gesture: HandGesture, isCombo: Boolean): BurstPoints`
  - `fun getScoreTier(score: Int): ScoreTierInfo`
  - `val DEFAULT_ACHIEVEMENT_TIERS: List<AchievementTier>`
  - `fun calculateAchievement(score: Int, tiers: List<AchievementTier>?): PlayerAchievement`
  - `fun getPersonalizedWish(..., random: GameRandom): FormattedPersonalizedWish`. Parameters mirror `src/utils/achievements.ts:145` in order, plus `random` last.

- [ ] **Step 1:** Add the generators, sweeping the same inputs through the TS functions:
  - `formatGameTimer`: `[-1, 0, 0.2, 9.99, 35, 61.5, 3600]`
  - `calculateBurstPoints`: speeds `0..1500` step 50 × every gesture × combo `true`/`false`
  - `getScoreTier` and `calculateAchievement`: scores `0..6000` step 25, with default tiers and with a custom 2-tier list that has `maxScore = null`
  - `getPersonalizedWish`: 50 seeded calls
- [ ] **Step 2:** Write golden tests asserting every fixture row exactly.
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Port the functions from `src/utils/scoreSystem.ts` and `src/utils/achievements.ts`.
- [ ] **Step 5:** Run `./gradlew :core:game:test`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): port scoring, timer and achievements`.

### Task 5: Motion maths and gesture recognition (`core:tracking`, pure package)

**Files:**
- Create: `core/tracking/src/main/kotlin/.../tracking/math/{MotionMath.kt, GestureRecognition.kt}`
- Modify: `scripts/native-golden/generate.ts` (generators `motion_math`, `gestures`; add an `--out-tracking` path writing to `core/tracking/src/test/resources/golden`)
- Test: `core/tracking/src/test/kotlin/.../tracking/math/{MotionMathGoldenTest.kt, GestureGoldenTest.kt}`

**Interfaces:**
- Produces:
  - `val HAND_BONES`, `val LEFT_TARGET_AREA: TargetAreaRect`, `val RIGHT_TARGET_AREA: TargetAreaRect`
  - `fun getPalmCenterScreen(landmarks: List<LandmarkPoint>): Point2D`
  - `fun isPointInsideRect(pt: Point2D, rect: TargetAreaRect): Boolean`
  - `fun categorizeSpeed(speedPxPerSec: Double): String`
  - `fun calculateMovementDirection(vx: Double, vy: Double): MovementDirection`
  - `fun extrapolateLandmarks(landmarks: List<LandmarkPoint>, vx: Double, vy: Double, dt: Double, width: Double, height: Double, damping: Double): List<LandmarkPoint>`
  - `fun evaluateGameMapping(...)`, with parameters as in `motionMath.ts:152`
  - `fun recognizeHandGesture(landmarks: List<LandmarkPoint>): HandGesture`

- [ ] **Step 1: Add generators.**
  - **Landmark sets:** synthesise 200 seeded 21-point hands, plus 4 canonical poses built so `recognizeHandGesture` returns each of FIST, OPEN_PALM, PEACE and POINTING.
  - **Inputs:** run every function above on those sets, with `width = 1920` and `height = 1080`.
- [ ] **Step 2:** Write the golden tests (floats compared with tolerance `1e-9`).
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Port from `src/utils/motionMath.ts` (maths only, lines 19–197) and `src/utils/gestureRecognition.ts`.
- [ ] **Step 5:** Run `./gradlew :core:tracking:testDebugUnitTest`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): port motion maths and gesture recognition`.

### Task 6: Hand tracking state machine (`HandTracker`)

**Files:**
- Create: `core/tracking/src/main/kotlin/.../tracking/{HandFrame.kt, HandTracker.kt, TrackedHands.kt}`
- Test: `core/tracking/src/test/kotlin/.../tracking/HandTrackerTest.kt`

**Interfaces:**
- Consumes: Task 5 maths.
- Produces:
  - `data class HandFrame(val hands: List<List<LandmarkPoint>>, val handedness: List<Float>)`. Landmarks are already mirrored and normalised 0..1.
  - `data class TrackedHands(val left: TrackedHand, val right: TrackedHand, val avgConfidence: Double, val timestampMs: Double)`
  - `class HandTracker(width: Double = 1920.0, height: Double = 1080.0)`:
    - `fun update(frame: HandFrame, timestampMs: Double): TrackedHands`
    - `fun reset()`
    - `val history: HandHistory` (per-side `prevPx`, `prevPy`, `vx`, `vy`, `smoothedSpeed`, `trail`, `activeMarks`, `isPredicted`, `trackingLosses`, `maxSpeed`)
    - `fun isCalibrated(nowMs: Double): Boolean` (both hands in their target areas continuously for 1000 ms)
    - `fun renderHands(): List<HandRender>` (left, right; pixel coordinates in 1920×1080)

Port the per-frame logic from `src/hooks/useHandTracking.ts` `runInference`/`processResults` (association, prediction grace `MAX_PREDICTION_GRACE_FRAMES = 2`, smoothing, speed, trail of 350 ms / 20 points, gesture, `inTargetArea`). It's a hook, not importable, so expected values are derived by hand from that code.

- [ ] **Step 1: Write failing tests.**
  - `singleHandAssignedToNearestPreviousSide`
  - `secondHandBeyond40PercentWidthIsNotReassigned`
  - `lostHandPredictedForTwoFramesThenDropped` (3rd frame → `detected == false`, `trackingLosses == 1`)
  - `speedIsPixelsPerSecondInLogicalSpace` (palm moves 192 px in 100 ms → raw instant speed 1920)
  - `trailKeepsAtMost20PointsWithin350ms`
  - `calibrationRequiresOneSecondContinuousHold` (break at 900 ms resets the hold)
  - `resetClearsHistory`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `HandTracker`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(android): hand tracking state machine`.

### Task 7: Cracker particle simulation (`CrackerSim`)

**Files:**
- Create: `core/game/src/main/kotlin/.../game/cracker/{CrackerSim.kt, Particle.kt, Palettes.kt}`
- Modify: `scripts/native-golden/generate.ts` (generator `cracker_engine`)
- Test: `core/game/src/test/kotlin/.../game/cracker/CrackerSimGoldenTest.kt`

**Interfaces:**
- Consumes: `GameRandom`.
- Produces: `class CrackerSim(maxParticles: Int = 700, random: GameRandom)`, with:
  - **Simulation:** `fun step(dtSeconds: Double)`
  - **Effects:** `triggerCracker(x, y, speed, gesture, isCombo)`, `addMotionSparkles(x, y, side, speed)`, `createBombBurst(x, y, color, isPenalty)`, `createMegaComboBlast(x1, y1, x2, y2)`
  - **Quality and state:** `setLowEndMode(Boolean)`, `reset()`
  - **Read-only views for the renderer:**
    - `val particles: Array<Particle>`, each with `active, x, y, trailX, trailY, alpha, size, color: Int, flicker`
    - `val rings: Array<Ring>`, `flashIntensity`, `activeCount`, `totalBursts`, `lastStyle`

Port simulation from `src/utils/crackerEngine.ts` (current `main`: pooled spawn with `nextFreeIndex`, `activeLimit`, low-end cap 260). Leave out `render()`; flicker randomness belongs to the renderer.

**Frame-rate independence:**
- `k = dtSeconds * 60`
- `vx *= drag^k`; `vy = vy * drag^k + gravity * k`; `x += vx * k`
- `alpha -= decay * k`; ring `radius += speed * k`; `flash -= 0.04 * k`

At `dt = 1/60` this must equal the TS per-frame `update()` exactly.

- [ ] **Step 1: Add the generator.** For seeds 1–5, run a scripted sequence through the TS engine and record the active particle states after every `update()`. The script:
  1. Call each `create*` style and `triggerCracker` with each gesture.
  2. Call `update()` 90 times.
  3. Repeat with `setLowEndMode(true)`.
- [ ] **Step 2: Write tests.**
  - `matchesWebEngineAt60Hz` (exact, tolerance `1e-9`)
  - `lowEndCapsAt260`
  - `thirtyHzTwoStepsApproximatesSixtyHz` (position within 2 px after 1 s)
  - `resetClearsEverything`
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement `CrackerSim`. Colours are parsed once to ARGB `Int`.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): port cracker particle simulation`.

### Task 8: Play rules — crackers, combos, score (`PlayDirector`)

**Files:**
- Create: `core/game/src/main/kotlin/.../game/play/{PlayDirector.kt, ComboTracker.kt, PlayEvent.kt}`
- Test: `core/game/src/test/kotlin/.../game/play/{PlayDirectorTest.kt, ComboTrackerTest.kt}`

**Interfaces:**
- Consumes: `TrackedHands` values (pass `TrackedHand` data only, so `core:game` doesn't depend on `core:tracking`), `CrackerSim`, `calculateBurstPoints`.
- Produces:
  - `class PlayDirector(sim: CrackerSim, random: GameRandom, targetScore: Int?)`, with:
    - `fun step(dtSeconds: Double, nowMs: Double, left: TrackedHand, right: TrackedHand)`
    - `fun recordBombHit(points: Int, isPenalty: Boolean, nowMs: Double)`
    - `val score: GameScoreState`
    - `val events: List<PlayEvent>` (drained per frame)
  - `PlayEvent` variants: `CrackerBurst(side, style)`, `ComboAwarded(count, bonus)`, `ComboBroken`, `TargetReached`, `PenaltyApplied(points)`, `PlaySound(key)`

Port the spawn-timer, motion-sparkle, mega-combo and `recordBombTouch` logic from `src/hooks/useHandTracking.ts`:
- spawn timers: around line 902
- combo window: lines ~1250–1300, `COMBO_WINDOW_MS = 1000`, `COMBO_BONUS = 50`
- penalty deduction and target-score handling

Expected values are derived by hand from that code.

- [ ] **Step 1: Write failing tests.**
  - `fastHandTriggersCrackerAfterSpawnInterval`
  - `idleHandsTriggerNothing`
  - `bothHandsFastTriggerMegaCombo`
  - `threeHitsWithinOneSecondAwardFiftyBonus`
  - `hitAfterWindowStartsNewStreak`
  - `penaltyBreaksComboAndDeducts`
  - `targetReachedEmittedOnce`
  - `scoreNeverNegative` (only if the web code clamps — confirm in source; otherwise assert web behaviour)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(android): play rules for crackers, combos and score`.

### Task 9: Bomb game simulation (`BombSim`)

**Files:**
- Create: `core/game/src/main/kotlin/.../game/bomb/{BombSim.kt, BombDefaults.kt}`
- Modify: `scripts/native-golden/generate.ts` (generator `bomb_defaults` dumping `DEFAULT_BOMB_CONFIGS` and `DEFAULT_BOMB_SETTINGS`)
- Test: `core/game/src/test/kotlin/.../game/bomb/{BombSimTest.kt, BombDefaultsGoldenTest.kt}`

**Interfaces:**
- Consumes: `BombConfig`, `BombGameSettings`, `GameRandom`.
- Produces:
  - `class BombSim(configs: List<BombConfig>, settings: BombGameSettings, random: GameRandom, width: Double = 1920.0, height: Double = 1080.0)`, with:
    - `fun step(dtSeconds: Double, nowMs: Double, hands: List<Point2D>)` (hand flame positions)
    - `fun touch(x: Double, y: Double, nowMs: Double)`
    - `val bombs: Array<BombSlot>` (`active, isBursting, x, y, radius, rot, configId, burstStartMs`)
    - `val effects: Array<BombParticle>` (`type: shockwave|flash|muzzle|ember`)
    - `val popups: Array<ScorePopup>`
    - `fun drainHits(): List<BombHit>` (`BombHit(config, x, y, isPenalty)`)
  - `val DEFAULT_BOMB_CONFIGS`, `val DEFAULT_BOMB_SETTINGS`

Port from `src/components/BombGameOverlay.tsx`:
- constants `MAX_BOMB_SLOTS = 8`, `MAX_PARTICLES = 120`, `MAX_SCORE_POPUPS = 8`, `MAX_PENDING_SHOTS = 8`, `BASE_GRAVITY = 2600`
- spawner delays (`minSpawnDelayMs` default 650, `maxSpawnDelayMs` default 1400)
- `maxConcurrentBombs` (default 5), `gravityMultiplier` (default 1.45), effective gravity `BASE_GRAVITY * (mult / 1.45)`
- pending burst shots, collision radius, burst lifetimes

- [ ] **Step 1: Write failing tests.**
  - `defaultsMatchWeb` (golden)
  - `neverExceedsMaxConcurrent`
  - `spawnDelayWithinConfiguredRange`
  - `bombFollowsBallisticArc` (apex time = `-vy0 / g` within 1 frame)
  - `handInsideRadiusBurstsOnce`
  - `touchBurstsBomb`
  - `penaltyBombReportsIsPenalty`
  - `effectsExpireAfterLifetime`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(android): port bomb game simulation`.

### Task 10: Spin wheel physics

**Files:**
- Create: `core/game/src/main/kotlin/.../game/spin/SpinWheelPhysics.kt`
- Modify: `scripts/native-golden/generate.ts` (generator `spin_wheel`)
- Test: `core/game/src/test/kotlin/.../game/spin/SpinWheelGoldenTest.kt`

**Interfaces:**
- Produces:
  - `object SpinConstants` (values from `SPIN_CONSTANTS`)
  - `fun calculateTargetStopAngle(targetIdx: Int, numSlices: Int): Double`
  - `data class DecelTrajectory(...)` (fields as in TS)
  - `fun calculateDecelTrajectory(...)` (parameters as in `spinWheelPhysics.ts:43`)
  - `fun angleAt(trajectory: DecelTrajectory, elapsedMs: Double): Double`

- [ ] **Step 1:** Add the generator: all target indices for 4–12 slices, trajectories sampled every 16 ms.
- [ ] **Step 2:** Write the golden tests.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Port from `src/utils/spinWheelPhysics.ts` (maths only; the tick audio goes to Task 16).
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): port spin wheel physics`.

### Task 11: Game flow controller (`GameController`)

**Files:**
- Create: `core/game/src/main/kotlin/.../game/flow/{GameController.kt, GamePhase.kt, GameEffects.kt, HudState.kt}`
- Test: `core/game/src/test/kotlin/.../game/flow/GameControllerTest.kt`

**Interfaces:**
- Consumes: `PlayDirector`, `BombSim`, `CrackerSim`, `calculateAchievement`, `GameState`.
- Produces:
  - `sealed interface GamePhase`: `Startup`, `Calibrating`, `Countdown(step)`, `Playing`, `PhotoCountdown(step)`, `GameOver(card)`, `Spin`, `Feedback`
  - `class GameController(clock: () -> Double, random: GameRandom, effects: GameEffects)`. Its methods:

    | Method | Purpose |
    |---|---|
    | `onCodeAccepted(session: SessionInfo, settings: RoundSettings)` | starts a round |
    | `onFrame(dtSeconds, left: TrackedHand, right: TrackedHand, calibrated: Boolean)` | advances the game |
    | `onTouch(x, y)` | touch-mode hit |
    | `onPhotoCaptured(jpeg: ByteArray?)` | photo step done |
    | `onCameraLost()` | camera error mid-round |
    | `onSpinDone(reward)` | spin step done |
    | `onFeedback(feedback)` | feedback step done |
    | `onInterrupted()` | activity paused or recreated |
    | `phase: StateFlow<GamePhase>` | current phase |
    | `hud: StateFlow<HudState>` | overlay state |

  - `interface GameEffects`:
    - `startSession(code)`
    - `completeSession(req: CompleteSessionRequest)`
    - `abandonSession(sessionId, reason)`
    - `playSound(key)`
    - `requestPhoto()`
    - `submitFeedback(id, fb)`
  - `RoundSettings(gameDurationSeconds, gameplayMode, targetScore: Int?, rewardsEnabled, tiers)`
  - `HudState(secondsLeftCeil, score, comboActive, comboCount, targetProgress)` emits only when a value changes.

Phase rules from `src/App.tsx`:
- touch mode skips calibration
- countdown 3-2-1-GO with sounds, then `startSession` (skipped for trial)
- the round timer runs `gameDurationSeconds`
- at 0 → `PhotoCountdown` → `completeSession` with the score fields mapped as in `App.tsx:416`
- then `GameOver` → `Spin` only when rewards are enabled and the session isn't offline-trial → `Feedback` → `Startup`

- [ ] **Step 1: Write failing tests.**
  - `fullCameraRoundReachesStartupWithOneCompleteCall`
  - `touchModeSkipsCalibration`
  - `trialRoundNeverCallsServer`
  - `timerUsesConfiguredDuration`
  - `hudEmitsOnlyOnChange`
  - `rewardsDisabledSkipsSpin`
  - `cameraLostMidRoundStillCompletesRound` (Review Focus 1)
  - `interruptedMidRoundAbandonsAndResets` (Review Focus 5: `abandonSession(id, "interrupted")` called once, phase `Startup`)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `./gradlew :core:game:test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(android): game flow controller`.

### Task 12: API client and result queue (`core:api`)

**Files:**
- Create: `core/api/src/main/kotlin/.../api/{GameApi.kt, HttpGameApi.kt, ResultQueue.kt, ApiResult.kt}`
- Test: `core/api/src/test/kotlin/.../api/{HttpGameApiTest.kt, ResultQueueTest.kt}`

**Interfaces:**
- Consumes: model DTOs.
- Produces:
  - `sealed interface ApiResult<out T> { Success(value); HttpError(code, body); NetworkError(cause) }`
  - `interface GameApi`:

    | Method | Endpoint |
    |---|---|
    | `suspend fun verifyCode(code: String): ApiResult<VerifyCodeResponse>` | `POST /api/kiosk/verify-code` |
    | `startSession(code, kioskId: String?)` | `POST /api/session/start` |
    | `completeSession(req)` | `POST /api/session/complete` |
    | `abandonSession(req)` | `POST /api/session/abandon` |
    | `submitFeedback(sessionId, feedback)` | `POST /api/session/feedback` |
    | `getSettings()` | `GET /api/settings`; returns `SettingsResponse(settings, wallpaperPlaylist)` |
    | `getBombs()` | `GET /api/bombs` |
    | `getRewards()` | `GET /api/rewards` |
    | `spin(req)` | `POST /api/rewards/spin` |

  - `class HttpGameApi(baseUrl: () -> String, client: OkHttpClient)` with timeouts connect 15 s / read 30 s / call 45 s.
  - `class ResultQueue(dir: File, api: GameApi, scope: CoroutineScope)`:
    - `fun enqueue(req: CompleteSessionRequest)` persists a JSON file atomically
    - `fun start()` runs a single worker with backoff 5 s → 5 min
    - `val pending: StateFlow<Int>`

- [ ] **Step 1: Write failing `HttpGameApiTest` tests (MockWebServer).**
  - Each method hits the right path and verb, and its body matches the fixture.
  - `networkErrorIsReturnedNotThrown`
  - `slowVerifyReturnsAfterDelay` (server delays 20 s; result is Success)
- [ ] **Step 2: Write failing `ResultQueueTest` tests.**
  - `persistsAcrossInstances`
  - `retriesOnNetworkErrorWithBackoff`
  - `dropsOnAlreadyCompleted4xx` (HTTP 409/400 with message containing "already" → file removed, Review Focus 4)
  - `neverSendsSameFileConcurrently`
  - `removesFileOnSuccess`
- [ ] **Step 3:** Run `./gradlew :core:api:test`. Expected: FAIL.
- [ ] **Step 4:** Implement. Confirm the exact already-completed response by reading `server/routes/api.ts` `/session/complete`, and match on its status and code there.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): API client and offline result queue`.

### Task 13: Admin content and asset cache (`core:branding`)

**Files:**
- Create: `core/branding/src/main/kotlin/.../branding/{SettingsRepository.kt, AssetCache.kt, BrandingState.kt, ServerConfig.kt}`
- Test: `core/branding/src/test/kotlin/.../branding/{SettingsRepositoryTest.kt, AssetCacheTest.kt}` (Robolectric)

**Interfaces:**
- Consumes: `GameApi`, model types.
- Produces:
  - `class ServerConfig(prefs: SharedPreferences)`: `var apiBaseUrl`, `var publicWebUrl` (defaults from Global Constraints)
  - `data class BrandingState(settings: SystemSettings, playlist: List<WallpaperItem>, bombs: ListBombsResponse, rewards: RewardsInfo, localFiles: Map<String, File>)`
  - `class SettingsRepository(api, cache: AssetCache, store: File, scope)`:
    - `val state: StateFlow<BrandingState>`
    - `fun setPollingPaused(paused: Boolean)` (resuming triggers an immediate refresh)
    - `fun start()` polls every 8000 ms while not paused
    - `suspend fun refreshNow()`
  - `class AssetCache(dir: File, client: OkHttpClient)`:
    - `suspend fun get(url: String): File?` (ETag/Last-Modified revalidation; returns the last good copy on failure)

- [ ] **Step 1: Write failing tests.**
  - `loadsLastGoodSettingsFromDiskWhenOffline`
  - `pausedPollingMakesNoRequests`
  - `resumeTriggersImmediateRefresh`
  - `pollsEvery8Seconds` (virtual time)
  - `assetCacheRevalidatesWith304`
  - `assetCacheReturnsStaleOnFailure`
  - `collectsLogoWallpapersBombImagesAndCustomSounds` (all URLs from settings, bombs and rewards are prefetched)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(android): settings repository and asset cache`.

### Task 14: Render thread and Canvas renderer (`core:render`)

**Files:**
- Create: `core/render/src/main/kotlin/.../render/{GameSurfaceView.kt, RenderLoop.kt, Renderer.kt, CanvasRenderer.kt, SparkBatcher.kt, FlameRenderer.kt, SkeletonRenderer.kt, BombSprites.kt, FrameRateMonitor.kt}`
- Test: `core/render/src/test/kotlin/.../render/{SparkBatcherTest.kt, FrameRateMonitorTest.kt}`; `core/render/src/androidTest/kotlin/.../render/RenderSmokeTest.kt`

**Interfaces:**
- Consumes: `CrackerSim`, `BombSim`, `HandRender` (Task 2, produced by `HandTracker.renderHands()`), `GamePhase`.
- Produces:
  - `interface Renderer { fun draw(canvas: Canvas, frame: RenderFrame) }`
  - `data class RenderFrame(sim: CrackerSim, bombs: BombSim?, hands: List<HandRender>, phase: GamePhase, lowEnd: Boolean, nowMs: Double)`
  - `class GameSurfaceView(context) : SurfaceView`, which calls `holder.setFixedSize(1920, 1080)`, and has:
    - `fun start(onFrame: (dtSeconds: Double, nowMs: Double) -> RenderFrame)`
    - `fun stop()`
    - `val fps: StateFlow<Float>`
  - `class SparkBatcher` buckets by colour × 5 alpha levels × 3 size levels, with stroke widths `[2.1, 3.2, 4.7]`, as in `crackerEngine.ts` on `main`.
  - `class FrameRateMonitor(thresholdFps = 45f, windowMs = 2000.0)`: `fun record(dtMs: Double): Boolean` returns true once low-end mode should switch on (sticky).

**Drawing:**
- Uses `lockHardwareCanvas()`, on a `HandlerThread` driven by `Choreographer`.
- Port the flame, ember and skeleton drawing from `src/utils/motionMath.ts:199–862`, and the bomb look from `src/components/CartoonBombSvg.tsx` into per-config bitmaps (`BombSprites`).
- Additive blending: `Paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)`.

- [ ] **Step 1: Write failing tests.**
  - `batcherGroupsByColourAlphaSize`
  - `batcherSkipsAlphaBelow0_02`
  - `monitorSwitchesAfter2sBelow45`
  - `monitorIgnoresSingleSpikes`
  - `monitorIsSticky`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the render module.
- [ ] **Step 4:** Run `./gradlew :core:render:testDebugUnitTest`. Expected: PASS.
- [ ] **Step 5:** Write `RenderSmokeTest` (instrumented, API 34 TV emulator). It draws a mega combo frame to an offscreen 1920×1080 bitmap, asserts more than 1% non-transparent pixels, and saves `render_smoke.png` to test storage for visual review.
- [ ] **Step 6:** Run `./gradlew :core:render:connectedDebugAndroidTest` with the emulator running. Expected: PASS. Pull and look at the PNG.
- [ ] **Step 7:** Commit: `feat(android): render thread and canvas renderer`.

### Task 15: Export built-in sounds from the web engine

**Files:**
- Create: `scripts/export-native-sounds/index.html`, `scripts/export-native-sounds/export.ts`, `scripts/export-native-sounds/convert.sh`, `scripts/export-native-sounds/README.md`
- Create (generated, committed): `android-native/app/src/main/assets/sounds/*.ogg`, `android-native/app/src/main/assets/sounds/manifest.json`

**Interfaces:**
- Produces: `manifest.json`, with this shape:

  ```json
  {
    "sounds": { "<soundId>": "<file>.ogg" },
    "crackers": { "<CrackerSoundType>": "<file>.ogg" },
    "bombPresets": { "<soundPreset>": "<file>.ogg" },
    "bgm": { "<trackId>": { "file": "<file>.ogg", "loop": true } },
    "spinTick": "<file>.ogg"
  }
  ```

**Export tool:**
- Served by Vite from the repo root (`npm run dev`, open `/scripts/export-native-sounds/index.html`).
- For each sound it creates an `OfflineAudioContext(2, 48000 * seconds, 48000)`. It mirrors `SoundEngine.unlockAudio()`'s graph onto the offline context (assign the engine's private `ctx`, gain and limiter fields via `as any`), calls the engine method, renders, and downloads a WAV.
- **Sound IDs to export:** every `case` in `SoundEngine.playBuiltIn` (`soundEngine.ts:1855`), every `CrackerSoundType`, every bomb `soundPreset` used by `DEFAULT_BOMB_CONFIGS`, the countdown steps, `playGameOverFanfare`, and the spin tick from `getOrCreateTickBuffer`.
- **Music:** each `BGM_TRACK_OPTIONS` loop, exported as exactly one loop period. Read the BGM scheduler near `soundEngine.ts:2092` for the period.

- [ ] **Step 1:** Write the tool, then run it in the built-in browser pane and download all WAVs into `$SCRATCH/sounds-wav/`.
- [ ] **Step 2:** `convert.sh` runs `ffmpeg -i in.wav -c:a libvorbis -q:a 5 out.ogg` for each file and writes `manifest.json`.
- [ ] **Step 3: Verify.**
  - Every ID referenced in `audioDefaults.ts` presets resolves in the manifest: a `node` check in `convert.sh` exits non-zero on a missing ID.
  - Spot-listen to five sounds.
- [ ] **Step 4:** Confirm the web app still builds: `npm run build`. Expected: success, no changes under `src/`.
- [ ] **Step 5:** Commit: `feat(android): export built-in web sounds for the native app`.

### Task 16: Audio engine (`core:audio`)

**Files:**
- Create: `core/audio/src/main/kotlin/.../audio/{SoundResolver.kt, AudioEngine.kt, SoundManifest.kt}`
- Test: `core/audio/src/test/kotlin/.../audio/SoundResolverTest.kt`

**Interfaces:**
- Consumes: `GameAudioSettings`, `BrandingState.localFiles`, manifest (Task 15).
- Produces:
  - `sealed interface SoundSource { Asset(path); File(file); None }`
  - `class SoundResolver(manifest: SoundManifest)`:
    - `fun sfx(key: SfxKey, settings: GameAudioSettings, files: Map<String, File>): Pair<SoundSource, Float>` (volume 0..1)
    - plus `countdown(step)`, `combo()`, `bgm()`, `cracker(type)`, `bombBurst(soundPreset, soundUrl)`, `spinTick()`
  - `class AudioEngine(context, resolver)`:
    - `fun apply(settings: GameAudioSettings, files: Map<String, File>)` preloads SoundPool, max 16 streams
    - `fun play(source: SoundSource, volume: Float, pan: Float = 0f)`
    - `fun startBgm()`, `fun stopBgm()` (ExoPlayer, `REPEAT_MODE_ONE` when looping)
    - `fun release()`
- Volume = `masterVolume/100 × channel × perSound/100`; `isMuted` → silence. Channel defaults come from `SoundEngine` (effect 0.95, music 0.8).

- [ ] **Step 1: Write failing tests.**
  - `customUrlWinsOverBuiltIn`
  - `builtInIdResolvesToAsset`
  - `presetSelectionApplies`
  - `mutedResolvesZeroVolume`
  - `volumeMultipliesMasterChannelAndSound`
  - `unknownIdFallsBackToPresetDefault`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the resolver, then `AudioEngine`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(android): audio engine`.

### Task 17: Camera and MediaPipe pipeline (`core:tracking`, Android part)

**Files:**
- Create: `core/tracking/src/main/kotlin/.../tracking/camera/{CameraController.kt, LandmarkerHost.kt, FrameMirroring.kt, TrackingPipeline.kt}`
- Copy: `public/models/hand_landmarker.task` → `app/src/main/assets/models/hand_landmarker.task`
- Test:
  - `core/tracking/src/test/kotlin/.../tracking/camera/FrameMirroringTest.kt`
  - `core/tracking/src/androidTest/kotlin/.../tracking/camera/RecordedClipTest.kt`, using asset `androidTest/assets/hands_clip.mp4` (record a 5 s clip of two hands, 1280×720, with the Mac camera via `ffmpeg -f avfoundation`)

**Interfaces:**
- Consumes: `HandTracker`, `HandFrame`.
- Produces:
  - `class TrackingPipeline(context, lifecycleOwner, tracker: HandTracker)`:
    - `fun start(showPreview: PreviewView?)`, `fun stop()`
    - `val hands: AtomicReference<TrackedHands>`
    - `val status: StateFlow<TrackingStatus>`, where `TrackingStatus` is `Starting`, `Running(delegate: "GPU"|"CPU", inferenceMs, cameraFps)`, `CameraLost(reason)` or `Failed(reason)`
    - `fun captureStill(): ByteArray?` (mirrored JPEG)
  - `fun mirrorLandmarks(points: List<LandmarkPoint>): List<LandmarkPoint>` (x → 1 − x)
  - `fun cropToSixteenNine(points, srcW, srcH): List<LandmarkPoint>` (for the 640×480 fallback)

**Camera:**
- Selector: first of built-in (any lens facing) or `EXTERNAL`. Never require front-facing.
- `ImageAnalysis` uses `STRATEGY_KEEP_ONLY_LATEST`, RGBA_8888, target 1280×720, fps range 30.
- Fallback to 640×480 when 1280×720 is unsupported.

**Landmarker:**
- `LIVE_STREAM`, `numHands 2`, confidences 0.35, model from assets.
- GPU delegate first; on exception, recreate with CPU.

- [ ] **Step 1: Write failing tests.**
  - `mirrorFlipsX`
  - `cropMaps4by3To16by9Centre`
  - `cropKeepsInsidePointsInRange`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the pipeline. On a camera `onError` or a closed state mid-run, emit `CameraLost` and publish empty hands (Review Focus 1).
- [ ] **Step 4:** Run the unit tests. Expected: PASS.
- [ ] **Step 5:** Write `RecordedClipTest`. It decodes the clip with `MediaMetadataRetriever`, feeds frames through `LandmarkerHost` in VIDEO mode, and asserts both hands are detected on more than 70% of frames, with left/right stable.
- [ ] **Step 6:** Run on the emulator. Expected: PASS (CPU delegate is acceptable there).
- [ ] **Step 7:** Commit: `feat(android): camera and MediaPipe tracking pipeline`.

### Task 18: App shell and the playing half of the flow

**Files:**
- Create: `app/src/main/java/com/aayush/diwaliplay/app/`, with:
  - `AppContainer.kt` (wires the modules)
  - `GameViewModel.kt` (owns `GameController`, `GameEffects` implementation using `GameApi`/`ResultQueue`/`AudioEngine`)
  - `ui/StartScreen.kt` (branding, ZXing QR, keypad)
  - `ui/CalibrationScreen.kt`, `ui/CountdownOverlay.kt`, `ui/PlayScreen.kt` (`GameSurfaceView` in `AndroidView` + `HudOverlay`)
  - `ui/BrandingBlock.kt`, `ui/Wallpaper.kt`
  - `ui/theme/*`
- Modify: `MainActivity.kt`, `AndroidManifest.xml` (camera permission, `HOME` + `LAUNCHER` intent filters, `keepScreenOn`, immersive)
- Test:
  - `app/src/test/.../GameViewModelTest.kt`
  - `app/src/androidTest/.../PlayFlowTest.kt` (fakes: `FakeGameApi`, `FakeTrackingPipeline` scripted to hold hands in the target boxes, then move fast)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `GameViewModel`:
    - `fun onKeypad(digit: Char)`, `fun onClear()`, `fun onBackspace()`, `fun onPlay()`
    - `val startUi: StateFlow<StartUi>` (`code`, `busy`, `error`, `serverReachable`)
    - `fun onInterrupted()` (called from `onPause` while a round is active)
  - QR content is `"${serverConfig.publicWebUrl}/register"`.
- `onPlay()`:
  - is ignored while a verify is in flight (Review Focus 2)
  - code `"8536"` → local trial session
  - otherwise `verifyCode`; invalid → `error` text from `VerifyCodeResponse.message`; `NetworkError` → "Can't reach the server — try again"
- Polling: `SettingsRepository.setPollingPaused(true)` from countdown until reset.

- [ ] **Step 1: Write failing `GameViewModelTest` tests.**
  - `doublePlayTapSendsOneVerify`
  - `slowVerifySuccessStillStartsRound`
  - `trialCodeNeedsNoNetwork`
  - `invalidCodeShowsServerMessage`
  - `pollingPausedDuringRound`
  - `pauseMidRoundAbandonsAndReturnsToStart` (Review Focus 5)
- [ ] **Step 2:** Run `./gradlew :app:testDebugUnitTest`. Expected: FAIL.
- [ ] **Step 3:** Implement the view model and screens.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Write `PlayFlowTest`: code → calibration → countdown → playing → HUD timer counts down. It also covers the touch-mode variant, where tapping a bomb raises the score.
- [ ] **Step 6:** Run `./gradlew :app:connectedDebugAndroidTest` on the API 34 TV emulator (1920×1080). Expected: PASS.
- [ ] **Step 7:** Commit: `feat(android): app shell, start screen and gameplay screens`.

### Task 19: End-of-round screens

**Files:**
- Create: `app/src/main/java/com/aayush/diwaliplay/app/ui/{PhotoCountdownScreen.kt, GreetingCard.kt, CardRenderer.kt, SpinWheelScreen.kt, FeedbackScreen.kt}`, `app/.../CardSaver.kt`
- Test: `app/src/test/.../CardRendererTest.kt` (Robolectric), `app/src/androidTest/.../EndOfRoundFlowTest.kt`

**Interfaces:**
- Consumes: `GameController` phases, `TrackingPipeline.captureStill()`, `calculateAchievement`, `getPersonalizedWish`, spin physics (Task 10), `GameApi.spin`, `AudioEngine`.
- Produces:
  - `fun renderCard(data: CardData): Bitmap`: 900 px wide, layout ported from `GameOverModal.tsx:727–890` (photo at 135,150 size 630×354, etc.)
  - `class CardSaver(context)`: `fun save(bitmap, playerName, score): Uri?`, writing `Pictures/DiwaliPlay/Diwali_Fun_Play_<name>_<score>.jpg` at quality 95 via MediaStore
- Flow:
  1. Photo countdown, then `captureStill()`, then `completeSession`, which goes through `ResultQueue` on failure.
  2. Card with envelope reveal.
  3. Spin, when enabled: `GameApi.spin`; on failure show "Rewards are unavailable right now" and continue.
  4. Feedback: `submitFeedback`, then reset.

- [ ] **Step 1: Write failing tests.**
  - `cardIs900WideAndDrawsPhotoRect`
  - `cardWithoutPhotoDrawsHappyDiwaliPlaceholder`
  - `fileNameMatchesWebPattern`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the screens and renderer.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Write `EndOfRoundFlowTest`, covering:
  - the full flow to feedback and back to start
  - spin failure shows the message and continues
  - rewards disabled skips the wheel
  - offline completion queues the result and still shows the card
- [ ] **Step 6:** Run on the emulator. Expected: PASS.
- [ ] **Step 7:** Commit: `feat(android): photo, greeting card, spin wheel and feedback`.

### Task 20: Kiosk lock, crash restart and admin screen (`core:kiosk` + app)

**Files:**
- Create:
  - `core/kiosk/src/main/kotlin/.../kiosk/{KioskDeviceAdminReceiver.kt, KioskController.kt, CrashRestarter.kt, AdminPin.kt, SecureStore.kt}`
  - `core/kiosk/src/main/res/xml/device_admin.xml`
  - `app/.../ui/admin/{AdminUnlock.kt, AdminScreen.kt, PerfOverlay.kt}`
- Modify: `app/src/main/AndroidManifest.xml` (receiver with `BIND_DEVICE_ADMIN`)
- Test: `core/kiosk/src/test/.../{AdminPinTest.kt, KioskControllerTest.kt, CrashRestarterTest.kt}` (Robolectric with shadow `DevicePolicyManager`), `app/src/androidTest/.../AdminUnlockTest.kt`

**Interfaces:**
- Produces:
  - `class AdminPin(prefs)`:
    - `val isSet: Boolean`
    - `fun set(pin: String)` requires 4–8 digits; stores salted PBKDF2WithHmacSHA256, 120,000 iterations
    - `fun verify(pin: String): Boolean` (constant-time)
  - `class KioskController(activity, dpm)`:
    - `val isDeviceOwner: Boolean`
    - `fun enableLock()`: device owner → `setLockTaskPackages` + `startLockTask` + `setKeyguardDisabled(true)` + persistent preferred HOME + camera permission grant; else `startLockTask()` screen pinning
    - `fun disableLock()`
    - `fun status(): KioskDeviceStatus` (mapping per spec Section 9, `platform = "android"`)
  - `object CrashRestarter`:
    - `fun install(context, delayMs: Long = 2000)` sets the default handler, `AlarmManager.setExact` relaunch, then `Process.killProcess`
  - `class SecureStore(context)`: AES-GCM with an Android Keystore key alias `diwaliplay_relay`; `put(key, value)`, `get(key)`
- Admin unlock: 5 taps on the brand logo within 3000 ms → PIN dialog. First launch with no PIN set forces PIN creation.
- Admin screen sections: kiosk lock toggle, server addresses (`ServerConfig`), relay pairing (Task 21), camera test, perf overlay toggle, device info, exit.

- [ ] **Step 1: Write failing tests.**
  - `pinRejectsShortOrNonDigit`
  - `pinVerifiesOnlyCorrect`
  - `pinHashIsSalted` (two sets of the same PIN give different stored values)
  - `enableLockAsDeviceOwnerSetsPackagesAndKeyguard`
  - `enableLockWithoutDeviceOwnerFallsBackToPinning`
  - `statusMapsFieldsAndPlatformAndroid`
  - `crashRestarterSchedulesRelaunch`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Write `AdminUnlockTest` (4 taps do nothing; 5 taps in 3 s open the PIN prompt; wrong PIN is rejected) and run it on the emulator. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(android): kiosk lock, crash restart and admin screen`.

### Task 21: Relay client and platform field

**Files:**
- Create: `core/kiosk/src/main/kotlin/.../kiosk/relay/{RelayPairing.kt, RelayClient.kt, RelayMessages.kt}`
- Modify:
  - `src/types/backend.ts:583` (`KioskDeviceStatus` gets `platform?: 'windows' | 'android'`)
  - `src/admin/sections/GameSettingsSection.tsx` (kiosk device list: "Android" badge; hide watchdog/guardian rows when `status.platform === 'android'`)
- Test:
  - `core/kiosk/src/test/.../relay/{RelayClientTest.kt, RelayPairingTest.kt}` (MockWebServer WebSocket)
  - `scripts/native-golden/relay-integration.md` (manual steps for the live local-server check)

**Interfaces:**
- Consumes: `SecureStore`, `KioskController`, `AdminPin`, `ServerConfig`.
- Produces:
  - `class RelayPairing(api: OkHttpClient, config: ServerConfig, store: SecureStore)`:
    - `suspend fun requestCode(name: String): PairingCode(deviceId, pairingCode, expiresAt)` (`POST /api/kiosk-relay/device-request-code`)
    - `suspend fun awaitPaired(deviceId): Boolean` (polls `POST /api/kiosk-relay/device-check-pairing` every 3 s until token or expiry)
    - `fun unpair()`
  - `class RelayClient(client, config, store, kiosk: KioskController, pin: AdminPin, scope)`:
    - `fun start()`, `fun stop()`
    - `val connected: StateFlow<Boolean>`
  - Socket URL: `wss://<apiHost>/ws/kiosk-relay?deviceId=<id>&token=<token>` (`ws://` for `http://` bases)
  - Messages exactly as `server/kioskRelay/types.ts`:
    - outbound: `heartbeat` (on connect and every 20 s), `ack`, `pong`
    - inbound: `command`, `heartbeat_ack`, `ping`
- Commands:
  - `status` → ack with `kiosk.status()`
  - `enable` / `disable` → verify `params.passcode` with `AdminPin.verify` when present (a wrong passcode → ack `success=false`, `error="Invalid passcode"`), then toggle the lock and ack
  - `test-exit` → ack, then exit the process after 500 ms
- Reconnect backoff: 2 s, doubling to 30 s; reset on successful open.

- [ ] **Step 1: Write failing tests.**
  - `pairingStoresTokenEncrypted`
  - `pairingStopsAtExpiry`
  - `connectsWithIdAndTokenQuery`
  - `heartbeatOnConnectAndEvery20s`
  - `answersPingWithPong`
  - `statusCommandAcksWithAndroidPlatform`
  - `disableWithWrongPasscodeIsRejected`
  - `enableTogglesLock`
  - `reconnectBackoffDoublesToThirty`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the client, plus the server type and admin badge change.
- [ ] **Step 4:** Run `./gradlew :core:kiosk:testDebugUnitTest`, then `npx tsc --noEmit` and `npm run build`. Expected: Kotlin PASS; tsc shows only the pre-existing `tests/test-remote-kiosk-relay.ts` error; build succeeds.
- [ ] **Step 5: Live check against the local server** (`npm run dev`).
  1. Install the debug APK on the emulator, setting the API base to `http://10.0.2.2:<port>`.
  2. Pair from the admin screen, then claim the code in `/admin`.
  3. Send `status`, `disable` and `enable` from the panel.
  4. Confirm acks and the Android badge.
  5. Record the result in `relay-integration.md`.
- [ ] **Step 6:** Commit: `feat(android): cloud relay client; add platform to kiosk status`.

### Task 22: Release build, README and acceptance checklist

**Files:**
- Create: `android-native/README.md`, `android-native/ACCEPTANCE.md`
- Modify: `android-native/app/build.gradle.kts` (release signing from `DIWALI_KEYSTORE_PATH`, `DIWALI_KEYSTORE_PASSWORD`, `DIWALI_KEY_ALIAS`, `DIWALI_KEY_PASSWORD` env/Gradle properties; `versionName` read from root `package.json`; R8 enabled with keep rules for MediaPipe and kotlinx.serialization)

- [ ] **Step 1:** Write the README covering every item in spec Section 12. That includes the device-owner command and its undo, `adb shell dpm remove-active-admin com.aayush.diwaliplay.kiosk/.kiosk.KioskDeviceAdminReceiver` (works while the app is test-only/debuggable; otherwise factory reset).
- [ ] **Step 2:** Write `ACCEPTANCE.md` with the spec Section 11 on-display checks as checkboxes, each with its pass threshold (≥ 58 fps during mega combo; inference ≤ 33 ms on GPU; etc.).
- [ ] **Step 3:** Run `./gradlew test lint assembleRelease` (with a locally generated test keystore in `$SCRATCH`). Expected: BUILD SUCCESSFUL, signed `app-release.apk`.
- [ ] **Step 4:** Run the full emulator suite `./gradlew connectedDebugAndroidTest`. Expected: PASS.
- [ ] **Step 5:** Commit: `docs(android): README, acceptance checklist and release build`.

---

## Self-Review Notes

- **Spec coverage:**

  | Spec section | Tasks |
  |---|---|
  | §4 modules | 1 |
  | §5 camera/inference | 17 |
  | §5 tracking | 5–6 |
  | §5 game loop | 7–9, 11 |
  | §5 rendering and low-end fallback | 14 |
  | §5 overlays | 18 |
  | §6 screens 1–4 | 18 |
  | §6 screens 5–8 | 19 |
  | §7 | 13 |
  | §8 | 15–16 |
  | §9 lock/admin | 20 |
  | §9 relay and server change | 21 |
  | §10 errors | 11, 12, 13, 17, 18, 19 |
  | §11 tests | throughout, plus 22 |
  | §12 delivery | 22 |
- **Golden tests vs. hand-derived tests.** Golden tests cover modules importable from TS (`scoreSystem`, `achievements`, `motionMath` maths, `gestureRecognition`, `crackerEngine`, `spinWheelPhysics`, `bombDefaults`). Logic that only exists inside React components or hooks (`useHandTracking` association and play rules, `BombGameOverlay` physics, `App.tsx` flow) gets hand-derived tests in Tasks 6, 8, 9 and 11 (stated in each task).
