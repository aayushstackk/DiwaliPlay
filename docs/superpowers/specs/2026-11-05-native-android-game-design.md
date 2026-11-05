# Native Android Kiosk Game — Design Spec

**Date:** 2026-11-05
**Status:** Approved in conversation (Sections 1–5). Awaiting written-spec review.
**Location in repo:** `android-native/` on `main`, alongside the existing web app.

## 1. Goal

Build a fully native Android version of the DiwaliPlay **kiosk game** so it runs smoothly on the Samsung WAF interactive display. It must have feature parity with the web kiosk (`/`). The web app, phone registration page (`/register`), admin panel (`/admin`), Windows kiosk and server all stay as they are. The native app is an additional client of the same server.

### Non-goals
- No native admin panel or native phone registration page (both stay on the web).
- No change to game rules, scoring, visuals or sounds beyond what the platform requires.
- No Play Store publishing. The app is sideloaded onto the display.

### What success looks like
- A full round plays end to end on the WAF display with every web-kiosk feature (Section 6 lists them).
- Rendering holds 60 fps during the heaviest moment (mega combo), and hand detection keeps up with the camera's 30 fps.
- Scores, sessions, photos, spins and feedback reach the server exactly as the web kiosk sends them, so the admin panel's reports work unchanged.
- The admin panel can see and control the Android display through the existing cloud relay.

## 2. Target device

| Item | Value |
|---|---|
| Device | Samsung Interactive Display, WAF series |
| OS | Android 14 |
| Chipset | Amlogic A311D2 (4× Cortex-A73 + 4× Cortex-A55, Mali-G52 GPU) |
| RAM | 8 GB |
| Panel | Assumed 4K UHD; the game renders at 1920×1080 and the display's hardware scaler upscales |
| Camera | 1 camera, reported as **back-facing**, orientation 0°, physically faces the player |
| Camera modes | Up to 1920×1080; also 1280×720, 960×720, 640×480, 352×288, 320×240; 15–30 fps; no stabilisation |

App support range: **minSdk 26 (Android 8.0), targetSdk/compileSdk 35**, landscape only.

## 3. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Scope | Full parity in one spec | User decision |
| Stack | Kotlin, Jetpack Compose for screens/overlays, dedicated `SurfaceView` render thread for gameplay effects | Standard Android, no engine; effects are isolated behind a renderer interface so OpenGL can replace Canvas later if profiling demands it |
| Hand tracking | MediaPipe Tasks Vision for Android (`HandLandmarker`), GPU delegate with CPU fallback | Native GPU inference is far faster than the WASM/WebGL path |
| Camera | CameraX, 1280×720 @ 30 fps for both preview and analysis | Same 16:9 shape as the screen, so landmarks map 1:1 with no crop correction |
| Mirroring | Done by the app (preview transform + landmark x-flip) | The camera reports "back", so Android won't mirror it |
| Sound | Built-in web sounds pre-rendered to FLAC and shipped (see "Changes during implementation"); SoundPool for effects, Media3 ExoPlayer for music | Identical sound without porting the 2,200-line synthesiser |
| Kiosk | Built-in lock (device owner + lock-task, home-app fallback) and the existing cloud relay | User decision |
| Server | API and relay go directly to `https://diwaliplay.onrender.com`; both addresses can be changed on-device | Vercel's `/api` rewrite doesn't carry WebSockets |
| Folder | `android-native/` (not `android/`) | Avoids colliding with `npx cap add android` from the Capacitor deps in `package.json` |
| Application ID | `com.aayush.diwaliplay.kiosk` | Matches the Electron app ID family |

## 4. Architecture

`android-native/` is a Gradle multi-module project (Gradle wrapper, Kotlin DSL, version catalog).

| Module | Responsibility | Depends on | Ported from (web) |
|---|---|---|---|
| `app` | `MainActivity`, Compose navigation across game phases, screens, DI wiring | all modules | `App.tsx`, `KioskStartupScreen.tsx`, `HandTargetBoxes.tsx`, `CountdownOverlay.tsx`, `GameTimerHud.tsx`, `PlayerGameplayHud.tsx`, `CrackerInteractionHud.tsx`, `PhotoCaptureModal.tsx`, `GameOverModal.tsx`, `SpinWheelModal.tsx`, `DiwaliHeader.tsx`, `BrandingBlock.tsx`, `DiwaliWallpaper.tsx` |
| `core:model` | Shared data types (DTOs, game state, settings) | — | `types/backend.ts`, `types/motion.ts` |
| `core:api` | HTTP client for all kiosk endpoints; result queue | `core:model` | `services/api.ts` (game half only) |
| `core:tracking` | CameraX setup, MediaPipe inference, hand association, smoothing, prediction, speed, gestures, calibration checks | `core:model` | `hooks/useHandTracking.ts`, `utils/motionMath.ts` (maths), `utils/gestureRecognition.ts` |
| `core:game` | Pure Kotlin game rules (no Android imports): round timer, cracker selection and particle simulation, combos, bomb spawning/physics/hits, scoring, achievement tiers, spin-wheel physics | `core:model` | `utils/scoreSystem.ts`, `utils/achievements.ts`, `utils/crackerEngine.ts` (simulation), `components/BombGameOverlay.tsx` (logic), `utils/bombDefaults.ts`, `utils/spinWheelPhysics.ts` |
| `core:render` | Render thread and `Renderer` interface; Canvas implementation drawing particles, rings, flames, embers, skeleton guides, bombs, exhaust, popups | `core:game`, `core:model` | `crackerEngine.render`, `motionMath.ts` (drawing), `CartoonBombSvg.tsx` |
| `core:audio` | SoundPool effects, ExoPlayer music, preset resolution, volume model | `core:model`, `core:branding` | `utils/soundEngine.ts`, `utils/audioDefaults.ts` |
| `core:branding` | Fetch settings/bombs/rewards, on-disk asset cache, polling pause during rounds | `core:api`, `core:model` | `hooks/useBranding.ts` |
| `core:kiosk` | Boot launch, lock-task/device-owner control, crash restart, admin PIN, relay pairing and WebSocket client | `core:api`, `core:model` | `windows-kiosk/*.ps1`, `server/kioskRelay/types.ts` |

### Data flow during a round

```
CameraX (1280×720@30) ──► MediaPipe HandLandmarker (GPU, LIVE_STREAM)
        │                         │ landmarks + handedness (async callback)
        │ preview (optional)      ▼
        │                 core:tracking ──► TrackedHands snapshot (atomic, ~30 Hz)
        ▼                                          │
  PreviewView (mirrored)                           ▼
                         Choreographer frame ──► core:game.step(dt, hands)
                                                   │ GameState (particles, bombs, score…)
                                                   ▼
                                     core:render (SurfaceView thread, 1080p)
                                                   │
                         Compose overlays ◄── UiState (sampled ≤10 Hz, only on change)
```

- Tracking writes an immutable `TrackedHands` snapshot into an `AtomicReference`. The game loop reads the latest one each frame. Nothing blocks.
- The game loop and rendering run on the render thread. Compose never touches per-frame state; it observes a `StateFlow<HudState>` that only emits when the timer second, score, combo or target progress changes.
- Touch mode: `MotionEvent`s from the play surface go to `core:game` as bomb hits; camera and MediaPipe stay off.

## 5. Hand tracking and the game loop

### Camera
- CameraX `ProcessCameraProvider`. Pick the first available camera: the display's built-in one (reported `LENS_FACING_BACK`) or an `EXTERNAL` USB camera if present. Don't require `LENS_FACING_FRONT`.
- Use cases: `Preview` (bound only when the live-camera background is shown) and `ImageAnalysis` (`STRATEGY_KEEP_ONLY_LATEST`, `OUTPUT_IMAGE_FORMAT_RGBA_8888`), both at 1280×720 and a 30 fps target range. If 1280×720 is unavailable, fall back to 640×480 and map coordinates with center-crop correction to 16:9.
- Mirroring: `PreviewView` gets `scaleX = -1`. Landmark x becomes `1 - x` before any game use. Photo capture mirrors the same way, as the web game does.

### Inference
- `HandLandmarker` in `LIVE_STREAM` mode, `numHands = 2`, detection/presence/tracking confidence 0.35, model `hand_landmarker.task` (float16, the same file the web app self-hosts) bundled in the APK's assets.
- GPU delegate first. On init failure, retry with the CPU delegate and record which one is active (shown on the performance overlay).
- Runs on every camera frame (30/s). No inference-rate cap is planned; the low-end fallback (below) handles weak devices.

### Tracking logic (`core:tracking`)
A direct port of `useHandTracking.ts` / `motionMath.ts` / `gestureRecognition.ts`:
- Left/right association (single-hand nearest-previous rule; 40% screen-width limit).
- Landmark extrapolation for up to `MAX_PREDICTION_GRACE_FRAMES = 2` lost frames.
- Palm centre, smoothed speed (px/s in 1920×1080 logical space), velocity, trail (350 ms / 20 points).
- Gesture recognition (fist, open palm, peace, pointing).
- Calibration: both hands in their target boxes continuously for 1.0 s.
- Coordinates are in a fixed **1920×1080 logical space** that matches the render surface, so speeds and thresholds keep their web meanings.

### Game loop (`core:game`)
- Driven by `Choreographer` on the render thread. Each frame calls `step(dtSeconds, hands)`, with `dt` clamped to 50 ms.
- **Frame-rate independence:** the web cracker engine applies drag, gravity and decay per frame at about 60 fps. The port expresses them per second (`value^(dt*60)` for drag and per-frame-equivalent rates × `dt*60` for the rest), so visuals match at 60 Hz and stay correct at 30/90/120 Hz.
- Owns the round timer (`gameDurationSeconds`, default 35), cracker triggering from speed/gesture, motion sparkles, the mega combo (both hands fast), bomb spawning/flight/hits including penalty bombs and pending burst shots (`MAX_BOMB_SLOTS = 8`, `BASE_GRAVITY = 2600`), the combo window (1000 ms, +50 bonus), score state (`GameScoreState` fields exactly as web), target score, and achievement tiers.
- All numbers and rules are taken from the web files listed in Section 4. Where the web code has per-frame randomness, the port takes an injectable `Random` so tests are deterministic.

### Rendering (`core:render`)
- `SurfaceView` with `holder.setFixedSize(1920, 1080)`; the display's hardware compositor scales it to the panel.
- Dedicated render thread; draws with `lockHardwareCanvas()` (GPU-accelerated Canvas).
- Effects, as in the web game:
  - sparks batched by colour × 5 alpha levels × 3 size levels, one path stroke per batch, additive blending (`PorterDuff.Mode.ADD`)
  - shockwave rings and the screen flash
  - hand flames with embers (16; 6 in low-end mode)
  - hand skeletons and trails during calibration
  - bombs, exhaust, explosion particles and score popups
- Bombs are pre-rendered once per bomb config to bitmaps (from the `CartoonBombSvg` design), then drawn with transforms. No per-frame vector drawing.
- Caps: 700 sparks (260 in low-end mode), 120 bomb particles, 8 score popups, 40 rings.
- **Low-end fallback:** if the render rate averages below 45 fps for 2 s, switch to low-end mode for the rest of the session (260 sparks, 6 embers, no full-screen flash). This mirrors the web `low-end` behaviour.

### Overlays
Compose draws the timer, score, combo banner and target-score bar on top of the `SurfaceView`, from `HudState` (≤10 Hz, emits only on change).

## 6. Screens and end-of-round flow

The same order as the web kiosk:

1. **Start screen.** Branding block; QR code (generated with ZXing core) linking to `{publicWebUrl}/register`, default `https://diwali-game-six.vercel.app/register`; 4-digit keypad with Clear/Backspace/Play. `POST /api/kiosk/verify-code` unlocks a round. Trial code `8536` works offline and persists nothing (same rules as `TRIAL_CODE` on the web). The camera stays off until a code is accepted. Shows a "connecting to server" state while the backend is unreachable.
2. **Calibration** (camera mode only). Live preview with the two target boxes; both hands in place for 1.0 s.
3. **Countdown.** 3-2-1-GO with countdown sounds; calls `POST /api/session/start` (skipped for the trial code).
4. **Play.** Round timer, crackers, bombs, combos, optional target-score bar; background is the wallpaper (rotation + opacity) or the live camera, per settings.
5. **Photo.** Countdown, then a mirrored still from the analysis stream (JPEG). `POST /api/session/complete` with score, crackers, max speed, combos, bombs, penalties and the photo — same payload as the web (`CompleteSessionRequest`).
6. **Greeting card.** Envelope reveal, score breakdown, achievement tier, festive wish; drawn natively with the same 900-wide card layout as `GameOverModal`. "Download" saves the card JPEG to `Pictures/DiwaliPlay/` via MediaStore (parity with the web download).
7. **Spin wheel** (when `rewardsEnabled`). Spin physics ported from `spinWheelPhysics.ts`; the outcome comes from `POST /api/rewards/spin`; reward reveal as on the web.
8. **Feedback, then reset.** `POST /api/session/feedback`; then release the camera, clear all round state and return to the start screen.

Every phase also handles the web's abandon path (`POST /api/session/abandon`) when a round is cut short, e.g. by an admin action or a crash restart mid-round.

## 7. Admin-controlled content (`core:branding`)

- **Fetched at startup and between rounds, never during one:** `GET /api/settings` (settings + `wallpaperPlaylist`), `GET /api/bombs` (active bombs + `BombGameSettings`), `GET /api/rewards`. Polled every 8 s while on the start screen; paused from countdown until the round resets (matches the web behaviour on `main`).
- **Settings applied:**
  - branding: `brandName`, `brandLogoUrl`, `brandingDisplayMode`, `experienceTitle`, `connectorText`, `logoWidth`/`logoHeight`/`logoPosition`
  - background: `wallpaperUrl` + playlist rotation, `wallpaperOpacity`, `wallpaperEnabled` (off = live camera background)
  - gameplay: `gameplayMode` (camera/touch), `gameDurationSeconds`, `targetScoreEnabled`/`targetScore`, `rewardsEnabled`, `achievementTiers`
  - all of `audioSettings`
- **On-disk cache** (app-private storage, keyed by URL with ETag/Last-Modified revalidation): logos, wallpapers, bomb images, reward images and custom sounds. The last good settings JSON is also cached, so the display shows correct branding after a reboot with no network.
- **Server addresses:** `apiBaseUrl` (default `https://diwaliplay.onrender.com`) and `publicWebUrl` (default `https://diwali-game-six.vercel.app`) are build-time defaults that can be overridden in the admin screen.

## 8. Sound (`core:audio`)

- **Built-in sounds.** A dev-only export tool (`scripts/export-native-sounds/` — an HTML page served by Vite plus a tiny driver) runs the existing `SoundEngine` against an `OfflineAudioContext`. It renders every built-in sound ID across all presets: the effects (`firework_launch`, `explosion`, `sparkler`, `bomb_impact`, `points_score`, `game_over`, `photo_shutter`), combo sounds, countdown three/two/one/go, and one seamless cycle of each built-in music loop. The output WAVs are converted to OGG Vorbis (ffmpeg) and committed to `android-native/app/src/main/assets/sounds/`, with a generated `manifest.json` mapping sound IDs to files.
- **Custom sounds** (`customUrl`, `activeTrackUrl`, countdown `customUrls`) are downloaded and cached by `core:branding`.
- **Playback.** SoundPool (max 16 streams) for effects, countdown and combo; Media3 ExoPlayer for looping music and long custom tracks. Volume = master × channel (effects/music) × per-sound volume; mute and the active preset are honoured.

## 9. Kiosk lock and remote relay (`core:kiosk`)

### Lock tiers
- **Full lock (recommended).** The app is provisioned as **device owner** once during setup (`adb shell dpm set-device-owner com.aayush.diwaliplay.kiosk/.KioskDeviceAdminReceiver`; requires no accounts on the device). Then:
  - `setLockTaskPackages` and `startLockTask` block Home/Back/Recents/status bar
  - keyguard is disabled and the screen stays on (`FLAG_KEEP_SCREEN_ON` + `setKeyguardDisabled`)
  - the app is set as the persistent preferred home activity, so it starts on boot
  - camera permission is auto-granted (`setPermissionGrantState`)
- **Fallback (no device owner).** The app declares a `HOME` intent filter. Once the operator picks it as the default home app, it starts on boot and Home returns to it. Back is consumed in-app; immersive full-screen hides the system bars. Exit through system gestures remains possible.
- **Crash recovery.** A default uncaught-exception handler schedules a relaunch via `AlarmManager` (about 5 s in practice, see "Changes during implementation"), then exits. Being the home app also brings it back.

### Hidden admin access
- Tap the brand logo 5 times within 3 s, then enter the local **admin PIN** (set on first launch; stored as a salted PBKDF2 hash in app-private storage).
- The admin screen shows:
  - kiosk lock on/off
  - server addresses
  - relay pairing (and unpairing)
  - camera test with live landmarks
  - performance overlay toggle (render fps, inference ms, GPU/CPU delegate, camera fps)
  - device info
  - exit app

### Relay client
Same protocol and endpoints as `windows-kiosk/kiosk-cloud-agent.ps1`:
- **Pairing:**
  1. `POST /api/kiosk-relay/device-request-code` returns `deviceId` + 6-digit `pairingCode`, shown in the admin screen.
  2. The operator claims the code in the web admin panel.
  3. The app polls `POST /api/kiosk-relay/device-check-pairing` until it receives `deviceToken`.
  4. `deviceId` and `deviceToken` are stored encrypted with an Android Keystore AES key.
- **Connection:** OkHttp WebSocket to `wss://{apiHost}/ws/kiosk-relay?deviceId=…&token=…`. Heartbeat on connect and every 20 s; answer `ping` with `pong`; reconnect with exponential backoff (2 s → 30 s).
- **Commands:**
  - `status` → ack with current status
  - `enable` / `disable` → turn the kiosk lock on/off; the optional `passcode` is verified against the local admin PIN, mirroring the Windows bridge
  - `test-exit` → ack, then exit so crash recovery relaunches the app
- **Status mapping:**

  | Field | Android meaning |
  |---|---|
  | `backProtection` | lock-task active |
  | `autoLaunch` | device owner or default home app |
  | `watchdogRunning` | crash handler installed |
  | `guardianRunning` | lock-task active |
  | `appRunning` | true |
  | `platform` | `'android'` (new, optional) |

### Server/admin change (the only change outside `android-native/`)
- `KioskDeviceStatus` gains an optional `platform?: 'windows' | 'android'` (absent = windows). The relay stores and forwards it unchanged.
- The admin panel's kiosk device list shows an "Android" badge, and hides Windows-only labels (watchdog/guardian process names) for Android devices.

## 10. Error handling

| Situation | Behaviour |
|---|---|
| Camera missing/busy/denied | "Camera access required" screen with Retry (as on web). Touch mode doesn't need the camera. |
| GPU delegate fails | Fall back to CPU, log it, show it on the performance overlay |
| MediaPipe can't start at all | Error screen with the cause; touch-mode rounds still work |
| Server unreachable on code check | "Can't reach the server — try again" on the keypad; trial code still works; background retry with backoff |
| Server unreachable on round completion | Request (incl. photo) goes to a persistent on-device queue (JSON files in app storage) and is retried with backoff until accepted. The player still sees their card. |
| Spin request fails | Show a friendly "rewards unavailable" message and continue to feedback |
| Asset download fails | Use the last cached copy, else the built-in default |
| Crash | Auto-relaunch (Section 9); an unfinished round is reported as abandoned on next start |

## 11. Testing

- **Parity ("golden") tests for `core:game` and `core:tracking`.** A Node script (`scripts/native-golden/`, run with `tsx`) feeds fixed, seeded input sequences through the TypeScript implementations and writes expected outputs as JSON fixtures into `android-native/core/*/src/test/resources/golden/`. Kotlin unit tests assert the same outputs (exact for discrete values, tolerance for floats). Coverage:
  - `calculateBurstPoints`, combo window and bonus, penalties, score state
  - gesture recognition and hand association
  - smoothing, speed and extrapolation
  - bomb spawn/flight/hit maths
  - spin-wheel physics and achievement-tier lookup
  - cracker particle counts per style
- **`core:api`:** OkHttp `MockWebServer` tests using JSON captured from the real server for every endpoint; result-queue retry and persistence tests.
- **Relay:** an instrumented/JVM test runs the Kotlin client against the local Node server (`npm run dev`), covering pairing, heartbeats, `status`/`enable`/`disable`/`test-exit` and reconnect. It's modelled on `tests/test-remote-kiosk-relay.ts`.
- **Screens:** Compose UI tests on an Android 14, 1920×1080 landscape emulator, using a fake tracker and fake API. They drive a full round: code → calibration → countdown → play → photo → card → wheel → feedback → reset, plus the trial code and touch mode.
- **Tracking pipeline without a camera:** a short recorded clip of hands (`androidTest` asset) is decoded and fed through the real MediaPipe + `core:tracking` path. Assertions cover detection and left/right labelling on known frames. The same mechanism powers a demo/replay mode in the admin screen.
- **On the WAF display (manual acceptance, needs the user):**
  - render ≥ 58 fps average during a mega combo
  - inference keeps pace with 30 fps camera (≤ 33 ms per frame) on the GPU delegate
  - full round end to end with the real server
  - lock/unlock, boot launch, crash recovery
  - relay pairing and every command from the admin panel

## 12. Delivery

- Build with the Gradle wrapper using Android Studio's bundled JDK (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`); no other Java install needed.
- Outputs: debug APK and signed release APK. The release keystore and its passwords live outside the repo (`*.keystore`/`*.jks` are already ignored) and are passed via `~/.gradle/gradle.properties` or environment variables.
- `android-native/README.md` covers:
  - build commands
  - installing over `adb` (USB or network)
  - the one-time device-owner command and how to undo it
  - first-launch admin PIN
  - relay pairing
  - changing server addresses
  - the admin unlock gesture
  - performance overlay
- Versioning: `versionName` follows the root `package.json` version; `versionCode` increments per release.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Mali-G52 GPU delegate unstable for MediaPipe | Automatic CPU fallback; overlay shows the active delegate; measured during acceptance |
| Canvas too slow at 1080p with additive blending | Renderer is behind an interface; switch to an OpenGL ES renderer if acceptance fails |
| Device-owner provisioning blocked (accounts already on the display) | Home-app fallback works without it; README documents removing accounts or factory-reset provisioning |
| Render free-tier cold starts delay code checks | "Connecting" state, background retry, trial code works offline, result queue |
| Exported sounds differ slightly from live synthesis | Export uses the same engine code offline; spot-check by ear during acceptance |
| Web game changes later and the native port drifts | Golden fixtures are regenerated from the TS code; a failing golden test flags drift |

## 14. Changes during implementation

Where the build differed from the text above, and why. The text above has been corrected only where it named a wrong command or number; everything else is recorded here.

**Sound (section 8)**
- Built-in sounds are lossless **FLAC**, not OGG Vorbis. No Vorbis encoder was available without installing software, FLAC is exact so the music loops keep their precise lengths, and the whole set is 4.09 MB. The APK stores `.flac` uncompressed, because SoundPool opens assets by file descriptor.

**Kiosk lock and relay (section 9)**
- Device-owner command is `adb shell dpm set-device-owner com.aayush.diwaliplay.kiosk/.KioskDeviceAdminReceiver`: the receiver is in the package `com.aayush.diwaliplay.kiosk`, the same as the application id, so there is no `.kiosk.` segment.
- Crash relaunch takes about **5 s**, not 2 s: `AlarmManager` has that floor for ordinary apps. The system only lets the relaunch start the activity for a device owner or the default home app.
- Status mapping for the relay: `watchdogRunning = installed && (owner || default home)`; `autoLaunch = (owner && lockWanted) || default home`. The original mapping overstated what works without either.
- PIN lockout: **5 attempts, then 15 minutes**, as the server's admin login. It is shared by the admin dialog and relay passcodes.
- The admin screen has a PIN-protected **Remove device owner**. Without it a provisioned kiosk could only be released by a factory reset, and Android 14 refuses `dpm remove-active-admin` for a non-test admin.
- A relay `enable`/`disable` with no passcode is honoured; a passcode that is sent is checked against the PIN. The web panel's passcode box is therefore optional for Android devices.
- The web panel change is slightly wider than section 9 said: an Android-specific passcode dialog, the test-exit tooltip (about 5 s) and showing the device's error message.

**Rendering and tracking (section 5)**
- Hand movement alone triggers **no crackers or points** (web parity). Bombs score.
- The camera preview is a `BackdropSurfaceView`: the mirrored analysis frames drawn on a surface under the game surface, rather than `PreviewView`.
- Sparks are drawn with `drawLines` per batch, not one path stroke per batch.
- Landmarks reach `HandTracker` raw; its palm maths does the mirroring, as the web does. Touch-mode rounds run the camera without hand tracking.
- The bomb hit radius is 46 px.

**Screens (sections 6 and 10)**
- The photo countdown waits for the camera, with an 8 s watchdog, in touch rounds.
- Trial rounds reach the wheel when rewards are on. The wheel refetches the rewards on entry.

**Testing (section 11)**
- The hand-tracking test uses Google's sample hand image, from the same host as the bundled model, instead of a recorded clip.

**Delivery (section 12)**
- Release builds run R8 with keep rules for MediaPipe and Flogger (`app/proguard-rules.pro`). Without the Flogger rule hand tracking fails at start.
- Lint gate: no lint errors; warnings are allowed.
