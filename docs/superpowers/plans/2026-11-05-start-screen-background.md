# Start Screen Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin set an image or MP4 as the kiosk start screen background, with the built-in wallpaper as the default, in the native Android app and the web kiosk.

**Architecture:** A new `start_backgrounds` asset category and three settings fields carry the choice. Each client has one small pure function that turns settings into built-in, image or video, and everything falls back to built-in. Both clients download a video whole and play it locally. Video exists only on the start screen.

**Tech Stack:** Express + multer, React 19/TypeScript/Tailwind v4, Kotlin/Compose, Media3 ExoPlayer 1.5.1.

**Spec:** `docs/superpowers/specs/2026-11-05-start-screen-background-design.md`

## Global Constraints

- Images: JPG, PNG or WebP, 15 MB maximum. Video: MP4 (`video/mp4`, `.mp4`), 40 MB maximum.
- Settings: `startBackgroundUrl` (string or null; blank means none), `startBackgroundType` (`'image'` or `'video'`, default `'image'`, unknown means image), `startBackgroundDim` (0–80, default 50).
- Dim never applies to the built-in wallpaper. Every failure ends at the built-in wallpaper.
- Video is muted and loops, and is released on leaving the start screen.
- `useBuiltInWallpaper`, `wallpaperUrl` and in-game wallpaper behaviour don't change.
- The live admin screen is `src/admin/sections/BrandingSection.tsx`. Don't edit `WallpapersSection.tsx`, which isn't rendered.
- Git: commit locally on `main` as `templar.ajay@gmail.com`, ending each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only when the user asks.
- Never stage `android-hdmi-kiosk/` or `.claude/`. Stage files by name.
- Test on the emulator only: `ANDROID_SERIAL=emulator-5554`, AVD `diwali_tv_34`. Never install on the physical TV (`192.168.1.8:5555`) unless the user asks.
- Run throwaway servers from a temp directory so real data and `.env` aren't used. Never kill a process you didn't start.
- Gradle environment: `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`, `ANDROID_HOME=~/Library/Android/sdk`, run from `android-native/`.

## Review Focus

- The admin replaces a video while a kiosk is showing it: the old player is released and the new file plays (Task 6).
- A round starts while the video plays: the player is released at once, with no video decoding during calibration or play (Task 6).
- A corrupt cached video: built-in with no dim, and no retry on every settings poll until the URL changes (Tasks 5 and 6).
- A stored dim outside 0–80 from an old or hand-edited setting: clamped (Tasks 4 and 5).
- A file over 40 MB: a JSON error the admin card can show, not Express's default HTML error page (Task 1).

---

### Task 1: Server accepts and protects start backgrounds

**Files:**
- Modify: `src/types/backend.ts` (`AssetCategory`)
- Modify: `server/storage/assets/types.ts` (`CategoryValidationRules`)
- Modify: `server/storage/assets/validation.ts`
- Modify: `server/routes/assets.ts`
- Create: `tests/start-background-assets.test.ts`

**Interfaces:**
- Produces: the category `'start_backgrounds'`; upload failures over the limit return HTTP 413 with `{ success: false, error: 'FILE_TOO_LARGE', message }`.

- [ ] **Step 1: Write the failing test**, a script in the style of `tests/assets-api.test.ts`, calling `validateUploadedFile(file, 'start_backgrounds')` with a `{ originalname, mimetype, size, buffer }` object. The MP4 fixture is `Buffer.concat([Buffer.from([0,0,0,0x18]), Buffer.from('ftypisom'), Buffer.alloc(32)])`.

Assert:
- the MP4 fixture is valid;
- `.mp4` with `Buffer.alloc(44)` is invalid;
- an `image/png` that has valid PNG bytes but `size` of 15 MB + 1 is invalid;
- a `video/mp4` of 40 MB is valid and of 40 MB + 1 is invalid;
- `validateUploadedFile(mp4, 'wallpapers')` is invalid;
- an audio file is invalid for `start_backgrounds`;
- `generateSafeObjectKey('start_backgrounds', '.mp4')` starts with `start_backgrounds/bg_`.

Then, using the `MongoMemoryServer` + router setup from `tests/assets-api.test.ts`:
- `GET /settings` omits a `start_backgrounds` asset from `wallpaperPlaylist`;
- `DELETE /admin/assets/:id` is refused when `settings.startBackgroundUrl` is that asset's URL (give the request an admin with `authenticateAdmin` satisfied the way the existing tests or a test-only signed token allow);
- a multipart upload over 40 MB returns 413 with `error: 'FILE_TOO_LARGE'`.

- [ ] **Step 2: Run it.** `npx tsx tests/start-background-assets.test.ts`. Expected: fails on the unknown category.

- [ ] **Step 3: Implement.**
- Add the category to `AssetCategory`, to `CATEGORY_RULES` and to the prefix map (prefix `bg`).
- Add `maxSizeBytesByMime?: Record<string, number>` to `CategoryValidationRules`, and check it in `validateUploadedFile` alongside `maxSizeBytes`. `maxSizeBytes` is 40 MB, and `image/jpeg`, `image/png` and `image/webp` are 15 MB. `readableLimit` is `'15 MB for images, 40 MB for video'`.
- In `verifyMagicBytes`, for `video/mp4` or `.mp4`, require `ftyp` at byte offset 4.
- Set the multer `fileSize` limit to 40 MB. Wrap `upload.single('file')` in a small handler that turns `MulterError` code `LIMIT_FILE_SIZE` into the 413 above.
- Add `startBackgroundUrl` to the assigned-asset check in the delete route.

- [ ] **Step 4: Run the new test and `npx tsx tests/assets-api.test.ts`.** Expected: both pass, showing other categories still keep their own caps.

- [ ] **Step 5: Commit**, including the spec and this plan.

```bash
git add src/types/backend.ts server/storage/assets/types.ts server/storage/assets/validation.ts server/routes/assets.ts tests/start-background-assets.test.ts docs/superpowers/specs/2026-11-05-start-screen-background-design.md docs/superpowers/plans/2026-11-05-start-screen-background.md
git commit -m "feat(server): start background asset category"
```

### Task 2: Settings fields reach both clients

**Files:**
- Modify: `src/types/backend.ts` (`SystemSettings`)
- Modify: `server/storage/jsonAdapter.ts`, `server/storage/mongoAdapter.ts` (defaults)
- Modify: `src/hooks/useBranding.ts` (`BrandingState`, cache, fetch mapping, returned value)
- Modify: `android-native/core/model/src/main/kotlin/com/aayush/diwaliplay/model/Backend.kt`
- Modify: `android-native/core/branding/src/main/kotlin/com/aayush/diwaliplay/branding/BrandingState.kt` (`collectAssetUrls`)
- Test: `android-native/core/branding/src/test/kotlin/com/aayush/diwaliplay/branding/SettingsRepositoryTest.kt`

**Interfaces:**
- Produces, TypeScript: `SystemSettings.startBackgroundUrl?: string | null`, `startBackgroundType?: 'image' | 'video'`, `startBackgroundDim?: number`. `useBranding()` returns `startBackgroundUrl: string`, `startBackgroundType: string`, `startBackgroundDim: number`.
- Produces, Kotlin: `SystemSettings.startBackgroundUrl: String? = null`, `startBackgroundType: String = "image"`, `startBackgroundDim: Double = 50.0`. `BrandingState.localFiles` includes the background's file once cached.

- [ ] **Step 1: Write the failing test** `startBackgroundIsCached`: with settings `startBackgroundUrl = "http://x/bg.mp4"`, `collectAssetUrls(state)` contains that URL. A second case with `""` adds nothing.

- [ ] **Step 2: Run it.** `./gradlew :core:branding:testDebugUnitTest --tests '*SettingsRepositoryTest*'`. Expected: compile failure on the unknown parameter.

- [ ] **Step 3: Add the fields and defaults** in all the files above. `collectAssetUrls` adds the URL with its existing `add()` helper. Make sure `normalizedForBranding` doesn't drop the fields.

- [ ] **Step 4: Run** the same Gradle test, then `npx tsc --noEmit`. Expected: tests pass. The only `tsc` error is the existing one in `tests/test-remote-kiosk-relay.ts`.

- [ ] **Step 5: Commit.** `feat: start background settings`

### Task 3: Admin card

**Files:**
- Create: `src/admin/sections/StartBackgroundCard.tsx`
- Create: `src/utils/assetIdFromUrl.ts`
- Modify: `src/admin/sections/BrandingSection.tsx` (render the card first in the `activeTab === 'wallpapers'` block)
- Create: `tests/asset-id-from-url.test.ts`

**Interfaces:**
- Consumes: `adminApi.uploadAsset(file, 'start_backgrounds', name)`, `adminApi.updateSettings`, `adminApi.deleteAsset(id)`, `DiwaliWallpaper`'s `contained` prop.
- Produces: `StartBackgroundCard({ settings, onSettingsUpdated, readOnly }: { settings: SystemSettings; onSettingsUpdated: (s: SystemSettings) => void; readOnly: boolean })`. `BrandingSection` passes `readOnly={currentUserRole !== 'superadmin'}`. `assetIdFromUrl(url: string): string | null`.

- [ ] **Step 1: Write the failing test** for `assetIdFromUrl`: `/api/assets/asset_1/content` gives `asset_1`, an absolute URL with the same path gives `asset_1`, and `''` and `https://x/y.png` give `null`. Run `npx tsx tests/asset-id-from-url.test.ts`; expected: fails on the missing module.

- [ ] **Step 2: Implement `assetIdFromUrl`** and run the test. Expected: pass.

- [ ] **Step 3: Build the card**, matching the surrounding section's light and dark styling.
- A 16:9 preview with `object-cover` and the dim overlay. It shows `<DiwaliWallpaper contained />`, with no dim, when nothing is set or chosen, labelled "Built-in wallpaper".
- A file input with `accept="image/jpeg,image/png,image/webp,video/mp4"`.
- On choosing a file: reject over the size limits client-side. For video, load it into a hidden `<video>` from an object URL; on `error`, refuse with "This video can't be played here. Please use a 1080p H.264 MP4." Otherwise preview it, muted and looping. Revoke object URLs when replaced or unmounted.
- A dim slider from 0 to 80. When a saved background exists and no new file is chosen, it saves on release.
- **Set as background:** upload, then `updateSettings({ startBackgroundUrl: asset.url, startBackgroundType, startBackgroundDim })`, then delete the old asset by `assetIdFromUrl`. A failed delete is only logged.
- **Remove (use built-in):** `updateSettings({ startBackgroundUrl: '', startBackgroundType: 'image' })`, then delete the old asset.
- Errors show in the card and via the section's existing toast. With `readOnly`, the preview shows and the controls are disabled.

- [ ] **Step 4: Check it in the browser** against a throwaway server (temp cwd, JSON storage). Upload a 2-second H.264 MP4 and a PNG, change the dim, remove, and confirm via `GET /api/settings` and the assets listing that each step changes the setting and leaves no old asset. Upload a `.mp4` containing garbage, and confirm the refusal message.

- [ ] **Step 5: Commit.** `feat(admin): start screen background card`

### Task 4: Web kiosk background

**Files:**
- Create: `src/utils/startBackground.ts`, `src/components/StartBackground.tsx`
- Modify: `src/components/KioskStartupScreen.tsx`
- Create: `tests/start-background-choice.test.ts`

**Interfaces:**
- Produces: `chooseStartBackground(url: string | null | undefined, type: string | undefined, dim: number | undefined): { kind: 'builtin' } | { kind: 'image' | 'video'; url: string; dim: number }`.

- [ ] **Step 1: Write the failing test** for `chooseStartBackground`:
- blank, null or whitespace URL gives `builtin`;
- `('u','video',30)` gives video with dim 30;
- `('u','gif',30)` gives image;
- `('u','image',undefined)` has dim 50;
- dim 95 gives 80 and dim -5 gives 0.

Run `npx tsx tests/start-background-choice.test.ts`; expected: fails on the missing module.

- [ ] **Step 2: Implement it** and run the test. Expected: pass.

- [ ] **Step 3: Build `StartBackground`**, a `fixed inset-0` layer behind the screen's content.
- Built-in: `<DiwaliWallpaper />`, also shown while loading and after any error. Nest it so its `-z-10` isn't hidden by a parent background.
- Image: `object-cover` with `onError` falling back.
- Video: `fetch(resolveAssetUrl(url), { signal })`, then a blob, then an object URL, in a `muted loop playsInline autoPlay` `<video>` with `object-cover`. Fall back on fetch failure, `error`, or a rejected `play()`.
- A black overlay at `dim / 100` over image and video only.
- Effect cleanup keyed on URL and type: abort the fetch, pause, clear `src`, revoke the object URL.

- [ ] **Step 4: Change `KioskStartupScreen`.** Render `<StartBackground />` from `useBranding()`'s fields. Remove `bg-[#0A0713]` and the two ambient glow divs. Leave the QR and keypad panels solid: if either is translucent, raise its background alpha until a busy image can't reduce the QR's contrast.

- [ ] **Step 5: Check it in the browser** at 1920×1080 against the throwaway server. Check built-in, image and video; a video URL returning 404; removal being picked up within the 8-second poll; and, on leaving the screen, `document.querySelector('video')` being gone and no `blob:` video still loading in the network list. Save a screenshot of each.

- [ ] **Step 6: Run `npx tsc --noEmit` and `npm run build`.** Expected: only the existing `tsc` error; the build succeeds.

- [ ] **Step 7: Commit.** `feat(kiosk): start screen background on the web`

### Task 5: Native image and built-in background

**Files:**
- Create: `android-native/app/src/main/java/com/aayush/diwaliplay/app/StartBackground.kt`
- Create: `android-native/app/src/test/kotlin/com/aayush/diwaliplay/app/StartBackgroundTest.kt`
- Modify: `app/.../app/RoundPolicy.kt`, `app/.../app/GameViewModel.kt:179-181`, `app/.../app/ui/BackdropSurfaceView.kt`, `app/.../app/ui/Wallpaper.kt`, `app/.../app/ui/GameApp.kt` (`BackdropLayer`), `app/.../app/ui/StartScreen.kt`
- Test: `android-native/app/src/test/kotlin/com/aayush/diwaliplay/app/RoundPolicyTest.kt`

**Interfaces:**
- Produces, in `StartBackground.kt`:

```kotlin
sealed interface StartBackgroundChoice {
    data object BuiltIn : StartBackgroundChoice
    data class Image(val file: File, val dimPercent: Double) : StartBackgroundChoice
    data class Video(val file: File, val dimPercent: Double) : StartBackgroundChoice
}
fun chooseStartBackground(settings: SystemSettings, localFiles: Map<String, File>, failedVideo: File?): StartBackgroundChoice
fun startDimAlpha(dimPercent: Double): Int // clamps to 0..80, returns 0..204
```

- Produces: `BackdropKind.StartBackground`; `BackdropContent` gains `dimAlpha: Int = 0`.

- [ ] **Step 1: Write the failing tests.**

In `StartBackgroundTest`:
- null or blank URL gives `BuiltIn`;
- a URL not in `localFiles` gives `BuiltIn`;
- type `"video"` with the file cached gives `Video(file, dim)`;
- type `"gif"` gives `Image`;
- `failedVideo == file` gives `BuiltIn`;
- a different `failedVideo` still gives `Video`;
- `startDimAlpha(50.0) == 127`, `startDimAlpha(95.0) == 204`, `startDimAlpha(-5.0) == 0`.

In `RoundPolicyTest`, change the Startup assertions to expect `BackdropKind.StartBackground`.

- [ ] **Step 2: Run them.** `./gradlew :app:testDebugUnitTest --tests '*StartBackgroundTest*' --tests '*RoundPolicyTest*'`. Expected: compile failure.

- [ ] **Step 3: Implement.**
- `backdropFor` returns `StartBackground` for Startup. `GameViewModel.backdrop` uses it for `r == null` and as the initial `stateIn` value.
- `BackdropLayer` computes the choice. For `StartBackground`, `BackdropContent` carries the image file and `startDimAlpha(dim)` when the choice is `Image`, and neither otherwise (the video draws the built-in beneath it).
- `BackdropSurfaceView.draw` decodes for `StartBackground` as it does for `Wallpaper`, and calls `drawWallpaper(canvas, image, 100.0)`. It then draws black at `dimAlpha` only if `image != null`, so an undecodable file shows an undimmed built-in.
- `StartScreen` drops `.background(Palette.Background)` and both `ambientGlow` modifiers.

- [ ] **Step 4: Run the tests from Step 2 and the full `:app:testDebugUnitTest`.** Expected: pass.

- [ ] **Step 5: Check on the emulator** with `:app:connectedDebugAndroidTest`, class `EndOfRoundScreensTest`, and any start screen test. Adjust a test only if it asserted the removed opaque background. Run the debug app against a throwaway server, and screenshot built-in and image, with `adb -s emulator-5554 exec-out screencap -p`. Confirm the QR and keypad panels are readable.

- [ ] **Step 6: Commit.** `feat(android): start screen image and built-in background`

### Task 6: Native video background

**Files:**
- Modify: `android-native/app/build.gradle.kts` (add `implementation(libs.media3.exoplayer)`)
- Create: `android-native/app/src/main/java/com/aayush/diwaliplay/app/ui/StartVideoSurface.kt`
- Modify: `app/.../app/ui/GameApp.kt`, `app/.../app/ui/StartScreen.kt`
- Create: `android-native/app/src/androidTest/kotlin/com/aayush/diwaliplay/app/StartVideoSurfaceTest.kt`
- Create: `android-native/app/src/androidTest/assets/bg_test.mp4`, `android-native/app/src/androidTest/assets/bg_corrupt.mp4`

**Interfaces:**
- Consumes: `chooseStartBackground`, `startDimAlpha`.
- Produces: `@Composable fun StartVideoSurface(file: File, onFailed: (File) -> Unit, modifier: Modifier = Modifier, onFirstFrame: () -> Unit = {}, onReleased: () -> Unit = {})`.

- [ ] **Step 1: Create the fixtures.** `ffmpeg -f lavfi -i testsrc=size=320x180:rate=15 -t 2 -c:v libx264 -pix_fmt yuv420p -an android-native/app/src/androidTest/assets/bg_test.mp4`. `bg_corrupt.mp4` is the same file's first 44 bytes plus 1 KB of zeros.

- [ ] **Step 2: Write the failing tests** in `StartVideoSurfaceTest`, copying fixtures to the app's cache dir and using `ComposeTestRule` with `waitUntil`:
- `aValidVideoReachesItsFirstFrame`: `onFirstFrame` fires and `onFailed` doesn't.
- `aCorruptVideoReportsFailureOnce`: `onFailed` fires exactly once with that file.
- `leavingCompositionReleasesThePlayer`: removing the composable fires `onReleased`.
- `changingTheFileSwapsThePlayer`: changing `file` fires `onReleased` once for the old one, then `onFirstFrame` for the new one.

- [ ] **Step 3: Run them.** `ANDROID_SERIAL=emulator-5554 ./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.aayush.diwaliplay.app.StartVideoSurfaceTest`. Expected: compile failure.

- [ ] **Step 4: Implement `StartVideoSurface`.**
- An `AndroidView` `SurfaceView` with `setZOrderMediaOverlay(true)`, which puts it above the default-tier backdrop. The game surface is the same tier but transparent on the start screen, so their relative order doesn't matter.
- An ExoPlayer keyed on `file`: `setTrackSelectionParameters` with `C.TRACK_TYPE_AUDIO` disabled, `volume = 0f`, `repeatMode = REPEAT_MODE_ONE`, `videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING`.
- `Player.Listener.onRenderedFirstFrame` calls `onFirstFrame`; `onPlayerError` releases and calls `onFailed(file)`.
- `DisposableEffect` releases, with a `LifecycleEventObserver` releasing on `ON_PAUSE` and rebuilding on `ON_RESUME`.

- [ ] **Step 5: Wire it into `GameApp`.**
- Hold `var failedVideo by remember { mutableStateOf<File?>(null) }`, so a corrupt file stays failed across polls until the file changes.
- Show `StartVideoSurface` immediately after the backdrop view, only when `phase == GamePhase.Startup` and the choice is `Video`.
- Pass `StartScreen` a new `videoDimAlpha: Int` parameter (0 unless the choice is `Video`). It draws a black layer at that alpha behind its content.

- [ ] **Step 6: Run the tests from Step 3.** Expected: 4 pass.

- [ ] **Step 7: Prove the stacking and release on the emulator.** Run the debug app against the throwaway server with a video set, and screencap: the video is visible under the panels and dim. Play a trial round. In logcat, confirm the ExoPlayer codec is released before the camera opens, and screencap calibration and play to confirm no video shows. Return to the start screen and confirm the video resumes with no stale game frame over it. Set a corrupt file and confirm the built-in. **If the video isn't visible or sits over the panels, stop and report: don't change the game surface's z-order, because the backdrop depends on it.**

- [ ] **Step 8: Commit.** `feat(android): start screen video background`

### Task 7: Docs and whole-feature check

**Files:**
- Modify: `PROJECT_CONTEXT.md`, `android-native/README.md`, `android-native/ACCEPTANCE.md`

- [ ] **Step 1: Update the docs.** `PROJECT_CONTEXT.md` covers the new settings, asset category and components. `README.md` notes Media3 in `app`. `ACCEPTANCE.md` gains the checks the emulator can't do: video smoothness on the TV, tracking feel right after a video start screen, QR scanning from a phone over a busy background, and a 40 MB upload and download through production.

- [ ] **Step 2: Run everything.**
- `npx tsx tests/start-background-assets.test.ts`, `npx tsx tests/asset-id-from-url.test.ts`, `npx tsx tests/start-background-choice.test.ts`, `npx tsx tests/assets-api.test.ts`
- `npx tsc --noEmit`, `npm run build`
- `./gradlew :app:testDebugUnitTest :core:branding:testDebugUnitTest`
- `ANDROID_SERIAL=emulator-5554 ./gradlew :app:connectedDebugAndroidTest`

Expected: all pass apart from the existing `tsc` error. Also do a 40 MB upload and download against the local throwaway server, and note its peak memory.

- [ ] **Step 3: Commit.** `docs: start screen background`
