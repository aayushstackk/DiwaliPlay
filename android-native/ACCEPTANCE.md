# Acceptance checklist (on the WAF display)

Spec section 11's checks that need the real display. None of these has been run: the emulator has no GPU, no real hands and no sound. Tick a box only when the pass threshold is met, and write down the number you measured.

Setup: install the signed release APK ([README](README.md), "Install over adb"), always with `adb -s <serial>`. Switch on the performance overlay (admin screen) for the performance checks.

Record: date ____  tester ____  display serial ____  app version ____

## 1. Performance

- [ ] **Render rate in the heaviest reachable case.** Hand movement alone fires no crackers or points (as on the web), so a mega combo can't be made by waving. The heavy case that can be reached is **sustained bomb bursts**: play a bomb round with both hands, popping bombs as fast as you can for 60 s. Pass: overlay render fps **>= 58 on average** and never below 45 for more than 1 s. Measured: ____ fps. If the overlay says "(low-end)", the display fell back to the cheaper renderer: record it as a fail for this check and note when it switched. (Low-end is judged per round on the frames of play alone, so the overlay can clear at the next round's start.)
- [ ] **Inference keeps up with the camera.** Overlay, during a round with hands in view. Pass: **inference <= 33 ms** and camera fps >= 28. Measured: ____ ms, ____ fps.
- [ ] **GPU delegate really chosen.** Pass: overlay says `Tracking GPU` on the Mali-G52, not CPU. If it says CPU, note inference ms there and whether it still passes the line above.
- [ ] **Soak.** Leave the app running unattended for 8 h on the start screen with rewards on, then play 100 rounds. Record `adb -s <serial> shell dumpsys meminfo com.aayush.diwaliplay.kiosk` (the TOTAL PSS line, in KB) at the start, after the 8 h, after round 1, and every 25 rounds. The hand-tracking model stays loaded between rounds, so one step up after round 1 is expected. Pass: no restart, no fps drop below the lines above, no memory warning in `adb logcat`, and PSS flat from round 25 to round 100 (growth under 10%). Measured PSS: start ____, after 8 h ____, round 1 ____, 25 ____, 50 ____, 75 ____, 100 ____.
- [ ] **Second round starts fast.** Overlay on. The first camera round after launch loads the model: the live camera or wallpaper shows at once, tracking starts a few seconds later. The second round's tracking starts with no wait, on the same delegate. Measured, first round: ____ s; second: ____ s.

## 2. Camera and hand tracking

- [ ] `adb -s <serial> shell pm list features | grep camera` recorded here: ____________. The camera opens at the first round (no "Hand tracking unavailable").
- [ ] **Real hands.** Admin screen, Camera test: both hands are found and labelled correctly, and the landmarks sit on the hands in the mirrored preview.
- [ ] **Right-hand flame.** In a round, move the right hand: the flame on the right-hand side of the screen follows it (and the left for the left), without noticeable lag.
- [ ] **Backdrop cost in live-camera mode.** With the camera as the background, overlay render fps stays >= 58 in a bomb burst (the camera frames are uploaded to a surface under the game each frame). Measured: ____ fps.
- [ ] **Camera indicator.** If the display shows a camera-in-use dot, it does not cover the "Change Code" button. Note where it sits: ____________.
- [ ] **Wheel pointer at 4K.** If the display runs at 4K, the spin wheel's pointer lines up with the "SPIN & WIN" row and the wheel isn't clipped.

## 3. A full round with the real server

- [ ] **End to end.** Scan the QR with a phone, register, enter the code, calibrate, count down, play, photo, card, spin the wheel, give feedback, and return to the start screen by itself. Pass: no stuck screen and no error shown.
- [ ] **Admin reports.** The round appears in the web admin panel's reports with the right name and score.
- [ ] **Photo.** The photo appears on the card and in the admin panel, and is mirrored the same way as the live preview (your right hand is on the right in both).
- [ ] **SVG artwork.** In the web panel set an SVG as the logo, a bomb's image, a reward's image and a wallpaper (the default rewards already are SVG). Pass: each one shows on the display: the logo on the start screen, the bomb in a bomb round, the reward on the wheel or card, the wallpaper in a round using it as background; none falls back to the built-in drawing; edges are sharp. SVG filters aren't drawn, so a drop shadow in the artwork is missing: note anything else that looks different from the web: ____________.
- [ ] **QR scans on a real phone** from the start screen at normal viewing distance (about 2 m), in the venue's lighting.
- [ ] **Power cut in the send.** Block the server (turn the venue Wi-Fi off) as the card appears, and pull the power within a few seconds. Restore both. Pass: the round is in the admin panel as completed, with its score and photo, within a few minutes of the display coming back.
- [ ] **Unattended with rewards on.** Leave a round at the wheel / card screen and walk away. Pass: it behaves as the web game does (no timeout of its own; the next player can use the display). Note what you saw: ____________.
- [ ] **Venue Wi-Fi with a captive portal.** Behind the portal (before signing in), the app shows a connecting state, not a crash; the trial code `8536` still works; the relay shows "Not connected: retrying", never "Pairing rejected", and recovers by itself after signing in.

## 4. Sound (nobody has listened to these yet)

Listen with the display's own speakers or the venue's, at show volume.

- [ ] Countdown beeps (3, 2, 1, go) are clear and in time with the numbers.
- [ ] Bomb pop and explosion sounds play on every bomb and aren't clipped or too loud.
- [ ] **Music loop seam.** Play the background music for at least 3 loops: no click, gap or jump at the seam.
- [ ] Fanfare at the card / result plays once, completely.
- [ ] Spin wheel ticks follow the wheel's slowing down.
- [ ] **Spark brightness vs the web game**, in a dense burst with both on one screen if possible: the native sparks are not visibly dimmer or flatter. Note the difference: ____________.

## 5. Kiosk lock (device owner)

Provision first, as in the README. Use a display with no accounts.

- [ ] `adb -s <serial> shell dumpsys account` lists no accounts, and `dpm set-device-owner ...` succeeds.
- [ ] **Lock.** After provisioning the app locks: Home, Recents and the status bar do nothing.
- [ ] **Unlock.** Admin screen (5 logo taps in 3 s, then the PIN), turn **Lock this kiosk** off: Home works. Turn it on again: the lock is back.
- [ ] **Boot launch.** Reboot the display (`adb -s <serial> reboot`). Pass: the game starts by itself, no other launcher on top.
- [ ] **Crash recovery.** Make the app crash, e.g. `adb -s <serial> shell am crash com.aayush.diwaliplay.kiosk`. Pass: the game is back in **about 5 s**. Measured: ____ s.
- [ ] **Native crash.** adb's shell user can't signal another app's process, so a plain `kill` from `adb shell` is refused. Pick the one the display allows, and note which: **with su** (a rooted or userdebug display), on the signed release APK, `adb -s <serial> shell su -c 'kill -SEGV $(pidof com.aayush.diwaliplay.kiosk)'`; **or on a debug build**, `adb -s <serial> shell run-as com.aayush.diwaliplay.kiosk sh -c 'kill -SEGV $(pidof com.aayush.diwaliplay.kiosk)'`. Used: ____. Pass: the app comes back (a native crash skips the Java handler, so this may rely on the home-app relaunch). Measured: ____ s, or "did not return".
- [ ] **PIN lockout.** Enter 5 wrong PINs: the dialog refuses for 15 minutes, and a right PIN is refused too until then.
- [ ] **Remove device owner.** Admin screen, **Remove device owner**, confirm, PIN. Pass: `adb -s <serial> shell dpm list-owners` says no owners, Home works, `adb -s <serial> uninstall com.aayush.diwaliplay.kiosk` succeeds. Then provision again with the README command, to check it can be done.

## 6. Home app without device owner

- [ ] `adb -s <serial> shell cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN` names `com.aayush.diwaliplay.kiosk/...` after choosing DiwaliPlay as home app. Output recorded: ____________.
- [ ] The display's own launcher does not outrank it (the output above is still ours after a reboot). If it isn't, note the launcher's package: ____________.
- [ ] Crash restart works as the home app.

## 7. Relay and web admin panel

- [ ] **Pairing.** Admin screen, Relay pairing, code shown; claimed in the web panel; the display reads "Paired. Connected."
- [ ] Each command from the panel works and the panel shows the result: **status**, **enable**, **disable** (with and without the admin PIN), **test exit** (the app is back in about 5 s if owner or home app).
- [ ] Wrong passcode from the panel is refused and the message shows the tries left.
- [ ] **Android badge.** The paired display shows an "Android" badge in the panel and no Windows watchdog lines. (This was type-checked and built, never viewed in a browser.)
- [ ] The panel's Android-specific text reads correctly: optional passcode box, test exit tooltip (about 5 s), error text such as "Invalid passcode: 4 attempts left".
- [ ] Deleting the device in the panel makes the display show "Pairing rejected: unpair and pair again."
- [ ] Heartbeats keep the device online in the panel for 10 minutes of idle.

## 8. The signed release APK, for R8

R8 can remove or rename what's only reached by reflection, and only this APK shows it. On the emulator it has launched and reached calibration with the trial code, twice in a row; none of the below has been run on it. Everything below on the **signed release APK**, watching `adb -s <serial> logcat -b crash` for `ClassNotFoundException`, `NoSuchMethodError` or `NoSuchFieldError`.

- [ ] **Audio:** the countdown, a bomb, the music and a custom sound uploaded in the panel all play.
- [ ] **Wheel:** spins, ticks, lands, and shows the prize with its (SVG) image.
- [ ] **Card:** shows with the photo, and saves.
- [ ] **Relay:** pairs, connects, and answers status, enable, disable from the panel.

## 9. Start screen background (image or MP4)

Needs the real display. In the web admin, Wallpapers tab, "Start screen background" card. Emulator checks (built-in, image, video, corrupt fallback, player released on leaving the start screen) are done; these are not.

- [ ] **Video smoothness.** Set a 1080p H.264 MP4 and watch the start screen for 5 minutes. Pass: no visible stutter, dropped frames or tearing; the loop point is acceptable. Note: ____________.
- [ ] **Tracking feel right after a video start screen.** Enter a code from the video start screen and play a round. Pass: hand tracking feels the same as after an image or built-in start screen (overlay inference <= 33 ms, camera fps >= 28). Measured: ____ ms, ____ fps.
- [ ] **QR scans from a phone over a busy background.** With a bright, busy image and then a busy video at 0% dim and at the default 50%, scan the start screen's QR code from about 2 m. Pass: scans on the first or second try at the default dim. Note the dim needed: ____.
- [ ] **40 MB upload and download through production.** After Ayush pushes (deploys only trigger on his push): upload a 40 MB MP4 through the admin panel on the Render server behind the Vercel rewrite, then confirm the display downloads and plays it. Pass: upload succeeds, no 413 or timeout, and the display shows it. Then do it once more with two displays or browsers downloading while the upload runs. Pass: the Render instance's memory stays under its limit and the game server doesn't restart. Downloads are streamed now, so they should add little: the local concurrent check (`tests/asset-transfer-memory.test.ts`, one upload plus two throttled downloads of 39 MB) peaked at about 490 MB server RSS on GridFS from 440 MB idle, and about 390 MB from 355 MB on the local provider. An upload is the main cost, and a 512 MB instance leaves little room. Peak measured: ____ MB.
- [ ] **No stale hand skeleton.** Use "Change Code" with real hands in view, so the app returns to the start screen. Pass: no hand skeleton or tracking overlay from the previous round shows over the start screen.
- [ ] **First video frames.** When the video starts (after launch, and after returning to the start screen), the first frames can show undimmed for a moment, because the dim applies only once a frame is showing. Check this doesn't look wrong. Note: ____________.
- [ ] **H.265 file.** Upload an H.265 (HEVC) MP4 (the admin's browser check may refuse it first; if so, set it through the API or another browser that decodes it). Pass: the display ends at the built-in scene, undimmed, with no black screen and no crash. Only MPEG-1 was tested on the emulator.
- [ ] **Video restart doesn't stutter.** Leave the start screen (enter a code, or open the admin screen) and come back several times. Pass: the video restarts each time without a visible stutter or a black flash, and the round's camera opens normally after the video was released.
- [ ] **Broken file and removal.** Set a background, then "Remove (use built-in)". Pass: the display returns to the built-in scene within the 8-second settings poll.

## Result

- [ ] All boxes above ticked, or each failure written down with its measured value and a decision.

Notes: ____________________________________________
