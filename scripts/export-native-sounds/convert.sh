#!/usr/bin/env bash
# Converts the WAVs rendered by run.mjs into lossless FLAC assets for the native app, writes
# manifest.json and checks that every built-in sound id resolves (exits non-zero on a miss).
#
#   scripts/export-native-sounds/convert.sh <wavDir>
#
# Encoder: ffmpeg's built-in lossless FLAC encoder (`ffmpeg -i in.wav -c:a flac -compression_level 8
# out.flac`), keeping the source sample rate and channels. Lossless keeps the files identical to the
# web engine's render and the BGM loop lengths exact; SoundPool/MediaCodec/ExoPlayer decode FLAC on
# every supported Android version. (Controller ruling: no extra encoder installs.)
# Env: FFMPEG (default /opt/homebrew/bin/ffmpeg, else ffmpeg on PATH),
#      SOUNDS_ASSET_DIR (default android-native/app/src/main/assets/sounds).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WAV_DIR="${1:?usage: convert.sh <wavDir>}"
ASSETS="${SOUNDS_ASSET_DIR:-$REPO/android-native/app/src/main/assets/sounds}"
if [[ -z "${FFMPEG:-}" ]]; then
  if [[ -x /opt/homebrew/bin/ffmpeg ]]; then FFMPEG=/opt/homebrew/bin/ffmpeg; else FFMPEG=ffmpeg; fi
fi

[[ -f "$WAV_DIR/plan.json" ]] || { echo "convert.sh: $WAV_DIR/plan.json not found (run run.mjs first)" >&2; exit 1; }

mkdir -p "$ASSETS"
rm -f "$ASSETS"/*.ogg "$ASSETS"/*.flac "$ASSETS/manifest.json"

count=0
for wav in "$WAV_DIR"/*.wav; do
  name="$(basename "$wav" .wav)"
  # bitexact: no encoder tag/metadata, so an unchanged WAV gives a byte-identical FLAC
  "$FFMPEG" -hide_banner -loglevel error -y -i "$wav" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
    -c:a flac -compression_level 8 "$ASSETS/$name.flac"
  count=$((count + 1))
done
echo "[convert] $count FLAC files (lossless, compression_level 8) -> $ASSETS"
du -ch "$ASSETS"/*.flac | tail -1 | sed 's/^/[convert] total size: /'

cd "$REPO"
npx --no-install tsx "$HERE/manifest.ts" "$WAV_DIR" "$ASSETS"
