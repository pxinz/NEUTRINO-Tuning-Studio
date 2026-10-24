#!/usr/bin/env bash
# Cross-build an unsigned/ad-hoc macOS arm64 .app from Linux/WSL.
# The result must still be tested and (optionally) signed/notarized on a Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${TMPDIR:-/tmp}/nt-mac-stage"
OUT="$ROOT/release/mac-cross"
VERSION="$(node -p "require('$ROOT/package.json').version")"

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE" "$OUT"
cp -a "$ROOT/dist" "$ROOT/electron" "$ROOT/build" "$ROOT/package.json" "$STAGE/"

cd "$ROOT"
npx --yes @electron/packager@19 "$STAGE" "NEUTRINO Tuning Studio" \
  --platform=darwin \
  --arch="${MAC_ARCH:-arm64}" \
  --out="$OUT" \
  --overwrite \
  --asar \
  --app-bundle-id=com.studio.neutrino.tuningstudio \
  --app-version="$VERSION" \
  --build-version="$VERSION" \
  --icon="$ROOT/build/icon.icns" \
  --electron-version=38.8.6 \
  --osx-sign=false

APP="$OUT/NEUTRINO Tuning Studio-darwin-${MAC_ARCH:-arm64}/NEUTRINO Tuning Studio.app"
# @electron/packager on Linux does not apply .icns icons; install it manually.
cp "$ROOT/build/icon.icns" "$APP/Contents/Resources/electron.icns"
echo "APP=$APP"
/usr/bin/file "$APP/Contents/MacOS/NEUTRINO Tuning Studio"
find "$APP" -maxdepth 3 -type f -name '*.plist' | head
if [ -n "${RCODESIGN:-}" ]; then
  "$RCODESIGN" sign "$APP"
else
  echo "WARNING: app is unsigned; set RCODESIGN to ad-hoc sign or re-sign on macOS."
fi
