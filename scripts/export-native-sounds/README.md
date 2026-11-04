# Native sound export

Renders every built-in procedural sound of the web `SoundEngine` (`src/utils/soundEngine.ts`)
to WAV through an `OfflineAudioContext`, converts it to lossless FLAC and writes the native app's
`android-native/app/src/main/assets/sounds/` (`*.flac` + `manifest.json`).

## Re-export (one command)

    node scripts/export-native-sounds/run.mjs --out "$TMPDIR/sounds-wav"

This starts the repo's Vite on a free localhost port, drives the installed Google Chrome headless
over the DevTools Protocol, writes `<out>/*.wav` and `<out>/plan.json`, then runs
`convert.sh <out>`. That script encodes the FLAC files, writes `manifest.json` and checks that every
sound id the web app can reference resolves. It exits non-zero if an id is missing. Commit the
regenerated assets.

- Requires Google Chrome (override the path with `CHROME_BIN`) and ffmpeg (`FFMPEG`, default
  `/opt/homebrew/bin/ffmpeg`). The encoder is ffmpeg's built-in lossless FLAC encoder
  (`-c:a flac -compression_level 8`), so the files are identical to the web render and the BGM
  loop lengths are exact. FLAC replaces the OGG Vorbis named in spec §8 because the installed
  ffmpeg has no libvorbis and no extra tools are installed (controller ruling).
- `--no-convert` stops after the WAVs. `convert.sh <wavDir>` can then be run on its own.
- To debug in a browser, run Vite and open `/scripts/export-native-sounds/index.html`. Then call
  `await exportSound('bomb_pop')` from the console.

## Files

| File | Purpose |
|---|---|
| `index.html`, `export.ts` | Export page. It holds the job list (which ids share a file), the offline renderer and the WAV encoder. |
| `run.mjs` | Driver: Vite + headless Chrome over CDP. Cleans up after itself, then calls `convert.sh`. |
| `convert.sh` | Converts WAV to FLAC and calls `manifest.ts`. |
| `manifest.ts` | Writes `manifest.json` and runs the id check (via `tsx`). |
| `mulberry32.ts` | Seeded PRNG (a copy of `scripts/native-golden/mulberry32.ts`). |

## Rendering rules

- **Same graph as the live engine.** Each sound gets a fresh `SoundEngine`. The graph that
  `unlockAudio()` builds is mirrored onto an `OfflineAudioContext(2, …, 48000)`. That graph is the
  limiter, master, effect and music buses, plus the noise buffers.
- **Delayed stages.** The engine schedules later stages with `setTimeout` and `setInterval`. While
  engine code runs, those calls are mapped to `ctx.suspend(t)` (128-frame quantum, ≤ 2.7 ms).
- **Seeded randomness.** `Math.random` is seeded with mulberry32 while engine code runs. The noise
  buffers use one fixed seed. Each sound uses its own seed, an FNV-1a hash of its key. Chrome is
  not bit-exact from run to run, so a few samples can still differ by ±1 LSB.
- **Gain staging.** Master, music and per-sound volume are 1.0, and the BGM volume is 100. The
  effect bus stays at the engine default of 0.95 × 1.3. The native app applies master × channel ×
  per-sound volume.
- **Crackers.** These use nominal pitch 1, vol 1 and pan 0. Live `playSound()` adds ±8 % pitch and
  ±10 % volume jitter, which the native player may reproduce with its playback rate and volume.
- **Effect length.** Each effect is rendered for 12 s. Everything after the last sample above
  −60 dBFS is cut, keeping 20 ms with a 5 ms fade at the end.
- **BGM.** The period is read from the engine's own `setInterval` delay in `startBgm()`. Three
  periods are rendered and the middle one is kept. That period already contains whatever the
  previous bar and the limiter carry into it, so it loops seamlessly.
- **Spin tick.** The `getOrCreateTickBuffer` buffer × 0.5. Live gain is 0.2–0.5, so native volume
  is `liveGain / 0.5`.
