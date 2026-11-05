# DiwaliPlay for Android

A native (Kotlin) port of the DiwaliPlay kiosk game, built for the WAF display: hand-tracked Diwali crackers, bombs, the end-of-round photo card, the spin wheel and feedback, all driven by the same server and admin panel as the web game. Design: `docs/superpowers/specs/2026-11-05-native-android-game-design.md`. Checks that need the real display: [`ACCEPTANCE.md`](ACCEPTANCE.md).

- Application id `com.aayush.diwaliplay.kiosk`. `minSdk 26`, `targetSdk 35`, landscape only. Game space is 1920x1080.
- Modules: `app` (screens, wiring) and `core:{model,api,game,tracking,render,audio,branding,kiosk}`.
- Commands marked **not yet run on a real display** are for the WAF and have only been checked as far as the emulator allows. Everything else here was run while writing this file.

## Build

All commands run from `android-native/`. No Java install is needed: use Android Studio's bundled JDK. Gradle must be 9.1 or newer for it (the wrapper is pinned to 9.1.0).

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME=~/Library/Android/sdk        # or put sdk.dir=... in android-native/local.properties (git-ignored)
```

The Android SDK needs platform 35 and build-tools. A fresh checkout has no other setup.

| Command | Output |
|---|---|
| `./gradlew assembleDebug` | `app/build/outputs/apk/debug/app-debug.apk` |
| `./gradlew assembleRelease` | `app/build/outputs/apk/release/app-release.apk` (signed if the signing settings below are set, else `app-release-unsigned.apk`) |
| `./gradlew test lint` | JVM tests, then lint. Lint errors fail the build; warnings don't |

`versionName` is the root `package.json` version. `versionCode` is in `app/build.gradle.kts` and is raised by hand for each release.

### Signing the release build

The keystore lives outside the repo (`*.keystore` and `*.jks` are git-ignored). Give Gradle these four settings, as environment variables or in `~/.gradle/gradle.properties`:

```sh
export DIWALI_KEYSTORE_PATH=/path/to/release.keystore
export DIWALI_KEYSTORE_PASSWORD=...
export DIWALI_KEY_ALIAS=...
export DIWALI_KEY_PASSWORD=...
./gradlew assembleRelease
```

Without `DIWALI_KEYSTORE_PATH` the build still succeeds but is unsigned, and an unsigned APK can't be installed. Always install updates signed with the same key: Android refuses an update signed with a different one.

The release build runs R8 (code shrinking and resource shrinking). The keep rules are in `app/proguard-rules.pro`, each with its reason. MediaPipe needs them: without the Flogger rule, hand tracking fails at start with "no caller found on the stack". After changing dependencies, install the release APK, play a trial round (code `8536`) and confirm there is no "Hand tracking unavailable" message.

### Tests

```sh
./gradlew test                                  # JVM tests (golden parity, Robolectric, fakes)
export ANDROID_SERIAL=emulator-5554             # see "Emulator" below
./gradlew connectedDebugAndroidTest             # Compose and instrumented tests on the emulator
```

Set `ANDROID_SERIAL` for every `connected*` task: with several devices attached Gradle would otherwise try all of them, and a display on the network may be one.

#### Emulator

Tests run on an Android 14 TV AVD called `diwali_tv_34` (system image `system-images;android-34;google-tv;arm64-v8a`, 1920x1080). Headless:

```sh
~/Library/Android/sdk/emulator/emulator -avd diwali_tv_34 -no-window -no-audio -no-snapshot -gpu swiftshader_indirect &
adb -s emulator-5554 wait-for-device
```

The emulator has a virtual front camera, so hand tracking starts there too, on the CPU delegate (the emulator's software GL can't run the GPU one). The emulator can't show real hand detection.

### Regenerating test fixtures and sounds

Run these from the repository root. Commit what they write.

- **Golden fixtures** (expected outputs of the web game's TypeScript, which the Kotlin tests compare against):
  `npx tsx scripts/native-golden/generate.ts --out android-native/core/game/src/test/resources/golden --out-tracking android-native/core/tracking/src/test/resources/golden`
  Rerun after changing game rules in `src/utils/`. A failing golden test means the two drifted. Details: `scripts/native-golden/README.md`.
- **Built-in sounds** (rendered from the web `SoundEngine` to lossless FLAC under `app/src/main/assets/sounds/`):
  `node scripts/export-native-sounds/run.mjs --out "$TMPDIR/sounds-wav"`
  Needs Google Chrome and ffmpeg. (Not re-run when writing this file; the golden command above was, and it changed nothing.) Details: `scripts/export-native-sounds/README.md`.

## Install over adb

```sh
adb devices                                   # lists USB devices and network ones
adb -s <serial> install -r android-native/app/build/outputs/apk/release/app-release.apk
adb -s <serial> shell pm grant com.aayush.diwaliplay.kiosk android.permission.CAMERA
adb -s <serial> shell am start -n com.aayush.diwaliplay.kiosk/com.aayush.diwaliplay.app.MainActivity
```

- **USB:** plug in, accept the debugging prompt on the display, then use the serial from `adb devices`.
- **Network:** enable network debugging on the display (Developer options, or `adb tcpip 5555` once over USB), then `adb connect <ip>:5555` and use `<ip>:5555` as the serial.
- **Always pass `-s <serial>`** when more than one device is listed. On a provisioned kiosk, the camera permission is granted by the app itself and `pm grant` is not needed.
- Not yet run on a real display: installing on the WAF.

## First launch

1. The first thing on screen is **Create admin PIN**: 4 to 8 digits, entered twice, on the screen's own keypad (the PIN cannot be skipped). It protects the admin screen and is stored only as a salted hash.
2. The start screen shows a QR code and a code pad. A player scans the QR (it opens the public web address), gets a 4-digit code there, and types it in. The code `8536` is a trial that needs no network and records nothing.
3. Hand tracking needs the camera permission. A normal install shows the system prompt once; the provisioned kiosk (below) grants it itself.

## Admin screen

Unlock: **tap the brand logo on the start screen 5 times within 3 seconds**, then enter the PIN. The screen closes by itself after 2 minutes without a touch.

- **5 wrong PINs lock the PIN for 15 minutes.** The count is kept across restarts, and the same limit applies to passcodes sent from the web admin panel.
- **Forgotten PIN.** There is no reset screen. What works, checked on the emulator with a normal (non-owner) install: `adb shell pm clear com.aayush.diwaliplay.kiosk` wipes the app's data, and the next launch asks to create a new PIN. This also forgets the pairing, server addresses and lock choice, and revokes the camera permission. On a device owner kiosk, clearing data was not tried; if it doesn't work, a new install is the other way, and a factory reset the last one. From the web admin panel you can still turn the lock off without the PIN (the passcode box there is optional for Android), but that doesn't change the PIN.
- Sections: Kiosk lock, Server addresses, Relay pairing, Camera test (live camera with hand landmarks), Performance overlay, Device info, Exit.
- **Performance overlay:** switch it on in the admin screen. It sits at the bottom left of every screen and shows render fps, inference time in ms, the delegate in use (GPU or CPU), and camera fps. It resets when the app restarts.
- **Server addresses.** Defaults: API `https://diwaliplay.onrender.com`, public web `https://diwali-game-six.vercel.app` (the QR code). The API is reached on Render directly, not through the web host. Release builds accept only `https://` addresses and say so if you try anything else. A debug build also accepts `http://10.0.2.2` and `http://localhost`, for a server on your own computer. Leaving a field blank restores its default.

## Kiosk lock and device owner

Two tiers, from strongest to weakest:

| | Device owner | Default home app, no owner |
|---|---|---|
| Lock | Full lock task: no home, recents or status bar, camera permission pre-granted | Screen pinning: Android asks for confirmation, and the user can leave it |
| Starts on boot | Yes | Yes, as the home app |
| Restarts after a crash | Yes | Yes |

With neither, the app still runs and can be pinned from the admin screen, but crash restart and start on boot do not work, and the web panel reports them as off.

### Making it the device owner (one time)

Device owner can only be set on a device with **no accounts**, over adb. Check first:

```sh
adb -s <serial> shell dumpsys account        # must list no accounts
adb -s <serial> shell dpm set-device-owner com.aayush.diwaliplay.kiosk/.KioskDeviceAdminReceiver
```

If it refuses because of accounts, remove them in Settings (or factory reset the display) and try again. After it succeeds, open the app: it locks itself, because a device owner is assumed to want the lock until the admin screen says otherwise. Not yet run on a real display (it was run on the emulator).

### Giving up device owner

- **In the admin screen:** Kiosk lock, **Remove device owner**, confirm, enter the PIN. This turns the lock off, clears the owner, and lets you uninstall the app. It cannot be undone from the screen: provisioning again needs adb and an account-free device.
- `adb shell dpm remove-active-admin com.aayush.diwaliplay.kiosk/.KioskDeviceAdminReceiver` only works while the app is test-only or debuggable. On Android 14 it is refused for a release build, so don't rely on it.
- Last resort: factory reset.

### Without device owner: set it as the home app

Make DiwaliPlay the default home app (how depends on the device's launcher; the system asks which home app to use when Home is pressed on most devices). Then check which app is the home app, and that nothing else outranks it:

```sh
adb -s <serial> shell cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN
```

Some launchers (Google TV's) have a higher priority and take over at boot regardless of the choice. That is why start on boot is guaranteed only for a device owner. Not yet run on the WAF.

## Relay pairing (web admin panel control)

1. On the display: admin screen, **Relay pairing**, **Pair this display**. A 6-digit code appears with a countdown (15 minutes).
2. In the web admin panel: Game Settings, **Pair TV**, enter the code.
3. The display says "Paired. Connected." The panel can then send status, enable lock, disable lock and test exit. The panel's passcode box is the admin PIN and is optional for Android: send one and it is checked (against the same 5-try limit); leave it blank and the command runs.
4. If the pairing is deleted in the panel, the display shows "Pairing rejected: unpair and pair again." and stops retrying. If the server address was changed after pairing, it says it is paired with a different server. Either way: **Unpair**, then pair again.
5. Unpairing on the display doesn't delete the device record in the panel; remove it there too.

Test exit stops the app. It comes back in about 5 seconds only for a device owner or the default home app.

## Troubleshooting

- **"Hand tracking unavailable" or no hands detected.** Check the camera is listed: `adb -s <serial> shell pm list features | grep camera`. Open the admin screen, Camera test: it shows the live camera and landmarks, and the status line says what failed. **Retry** restarts the camera. An unplugged camera shows "Camera lost".
- **GPU or CPU.** Hand tracking tries the GPU delegate first and falls back to the CPU if it fails. The performance overlay shows which one is running. CPU is slower; if inference is well over 33 ms there, check the display actually got the GPU.
- **Cold start.** The server on Render's free tier sleeps when idle and is slow to answer the first request. The app shows a connecting state and retries; the trial code `8536` works meanwhile. Finished rounds that can't be sent are queued and sent later.
- **Venue Wi-Fi with a captive portal.** Sign in to the portal from another device first. A blocked relay shows as "Pairing rejected" or "Not connected: retrying".
- **Logs:** `adb -s <serial> logcat -s TrackingPipeline LandmarkerHost KioskController`.
- **Release build crashes at hand tracking but debug doesn't.** R8: see `app/proguard-rules.pro` and the signing section above.
