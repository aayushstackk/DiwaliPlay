# Relay integration check (Android display against the local server)

Run this after any change to `core/kiosk/.../relay/` or the server's kiosk relay. Never use real data: run the server from a throwaway directory so its `data/db.json` and `.env` resolve there.

## Setup
1. `mkdir -p $TMP/relay-live && cd $TMP/relay-live`
2. `NODE_ENV=production PORT=3917 env -u MONGODB_URI /path/to/repo/node_modules/.bin/tsx /path/to/repo/server.ts &` (note the listener's PID). The log must say "JSON file storage adapter active".
3. One-time admin: `POST /api/admin/auth/setup {"username":"relaytest","password":"<throwaway with a digit>"}`, then `POST /api/admin/auth/login` with `curl -c jar`.
4. Emulator `diwali_tv_34`; always `adb -s emulator-5554` and `ANDROID_SERIAL=emulator-5554`. Never the physical WAF.
5. `./gradlew :app:installDebug`, grant CAMERA, launch. Create the admin PIN (e.g. 2468), tap the logo 5 times within 3 s, enter the PIN.
6. Admin screen, Server addresses: API server `http://10.0.2.2:3917`, Save (http is allowed in debug for 10.0.2.2 only).

## Steps
1. Relay pairing, "Pair this display": a 6-digit code and "Expires in 14:5x" appear.
2. `curl -b jar -X POST :3917/api/kiosk-relay/pair-claim -d '{"pairingCode":"<code>","name":"Emulator TV"}'`. Within 3 s the section reads "Paired. Connected."
3. `GET /api/kiosk-relay/devices`: `isOnline:true`, `status.platform:"android"`, fresh `lastHeartbeatAt` (check again after 30 s: the socket must outlive OkHttp's 10 s default read timeout).
4. `POST /api/kiosk-relay/devices/<id>/command` with each body:
   - `{"action":"status"}`: success, status with `platform:"android"`.
   - `{"action":"disable","passcode":"0000"}`: `success:false`, `error:"Invalid passcode"`, message "4 attempts left".
   - `{"action":"enable"}`: success, `lastStateChangeReason:"Remote relay"`.
   - `{"action":"disable","passcode":"2468"}`: success.
   - `{"action":"disable"}` (no passcode): success, and no attempt is spent.
   - `{"action":"test-exit"}`: ack first, the process is gone about 500 ms later. A device owner or home app relaunches in about 5 s; without either it stays down (relaunch it by hand; it reconnects from the stored token).
5. Web admin (`npm run dev` instead of the production server, if you want the panel): the device shows an "Android" badge and no watchdog lines.
6. Admin screen "Unpair": section returns to "Not paired", socket closes.

## Cleanup
Stop the server by its listener PID, delete `$TMP/relay-live`, `adb -s emulator-5554 uninstall com.aayush.diwaliplay.kiosk`, `adb -s emulator-5554 emu kill`.

## Result, 2026-11-05 (Android 14 TV emulator, server on JSON storage in a temp dir)
| Step | Result |
|---|---|
| Pair, claim | Code 484794 shown with "Expires in 14:58"; after claim "Paired. Connected." |
| devices list | online, `status.platform:"android"`, heartbeat age 4 s after 30 s idle |
| status | success, `platform:"android"`, `connected:true`, `appRunning:true` |
| disable wrong passcode | `success:false`, `Invalid passcode`, "4 attempts left" |
| enable | success, reason "Remote relay" (non-owner: pinning waits for the system prompt, so `backProtection` stays false in that ack) |
| disable right passcode / no passcode | both success |
| test-exit | ack "Exiting in 500 ms", process gone within 3 s, not relaunched (not owner or home); manual relaunch reconnected, so paired state survives |
| Web panel badge | not run live (type-check and build only) |
