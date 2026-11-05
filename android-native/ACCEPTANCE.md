# Acceptance checklist (on the WAF display)

Spec section 11's checks that need the real display. None of these has been run: the emulator has no GPU, no real hands and no sound. Tick a box only when the pass threshold is met, and write down the number you measured.

Setup: install the signed release APK ([README](README.md), "Install over adb"), always with `adb -s <serial>`. Switch on the performance overlay (admin screen) for the performance checks.

Record: date ____  tester ____  display serial ____  app version ____

## 1. Performance

- [ ] **Render rate in the heaviest reachable case.** Hand movement alone fires no crackers or points (as on the web), so a mega combo can't be made by waving. The heavy case that can be reached is **sustained bomb bursts**: play a bomb round with both hands, popping bombs as fast as you can for 60 s. Pass: overlay render fps **>= 58 on average** and never below 45 for more than 1 s. Measured: ____ fps. If the overlay says "(low-end)", the display fell back to the cheaper renderer: record it as a fail for this check and note when it switched.
- [ ] **Inference keeps up with the camera.** Overlay, during a round with hands in view. Pass: **inference <= 33 ms** and camera fps >= 28. Measured: ____ ms, ____ fps.
- [ ] **GPU delegate really chosen.** Pass: overlay says `Tracking GPU` on the Mali-G52, not CPU. If it says CPU, note inference ms there and whether it still passes the line above.
- [ ] **Soak.** Leave the app running unattended for 30 min with rewards on, then play a round. Pass: no restart, no fps drop below the lines above, no memory warning in `adb logcat`.

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
- [ ] **QR scans on a real phone** from the start screen at normal viewing distance (about 2 m), in the venue's lighting.
- [ ] **Unattended with rewards on.** Leave a round at the wheel / card screen and walk away. Pass: it behaves as the web game does (no timeout of its own; the next player can use the display). Note what you saw: ____________.
- [ ] **Venue Wi-Fi with a captive portal.** Behind the portal (before signing in), the app shows a connecting state, not a crash; the trial code `8536` still works; the relay shows "Not connected: retrying" or "Pairing rejected", and recovers after signing in or re-pairing.

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
- [ ] **Native crash.** `adb -s <serial> shell kill -SEGV $(adb -s <serial> shell pidof com.aayush.diwaliplay.kiosk)`. Pass: the app comes back (a native crash skips the Java handler, so this may rely on the home-app relaunch). Measured: ____ s, or "did not return".
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

## Result

- [ ] All boxes above ticked, or each failure written down with its measured value and a decision.

Notes: ____________________________________________
