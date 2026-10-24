# macOS build

The project contains an **arm64 macOS cross-build** in

`release/mac/NEUTRINO-Tuning-Studio-1.0.1-macOS-arm64-unsigned.zip`.

Important: this artifact was built on WSL from the Electron darwin-arm64
distribution. It has been inspected (arm64 Mach-O, `.app` structure, framework
symlinks, ad-hoc signature, icon, Info.plist) but **not executed on macOS**. It is
not Developer ID signed or notarized. Treat it as a preview for a friend rather
than a public release.

## What the friend needs

- Apple Silicon Mac (M1/M2/M3/M4), macOS 12 or newer.
- The official **NEUTRINO Tau macOS** package, installed separately.
- The app moved to `/Applications`.

Gatekeeper will block the unsigned build. The zip contains
`Open-Anyway.command` and `README-macOS.txt`. The reliable first launch is from
Terminal:

```bash
xattr -cr "/Applications/NEUTRINO Tuning Studio.app"
codesign --force --deep --sign - "/Applications/NEUTRINO Tuning Studio.app"
open "/Applications/NEUTRINO Tuning Studio.app"
```

The included command script performs the same steps. It may be blocked itself;
run it with `bash` from Terminal instead of double-clicking.

## Native build (recommended for distribution)

On a Mac with Xcode command line tools and Node.js 22:

```bash
npm ci
npm run build
npx electron-builder --mac dmg --arm64
```

Or use the GitHub Actions workflow in `.github/workflows/build-macos.yml` and
download the artifact. The workflow produces an unsigned/ad-hoc DMG; signing
requires an Apple Developer ID and notarization secrets.

## Why not build the DMG on Windows?

electron-builder refuses macOS targets on Windows:

```
Build for macOS is supported only on macOS
```

The cross-build above uses `@electron/packager` on Linux, then ad-hoc signs the
bundle with `rcodesign`. A native Mac run is still the only way to validate
Gatekeeper, audio device, and NEUTRINO engine integration.

## NEUTRINO on macOS

Use the official macOS (Apple Silicon) NEUTRINO package and point the studio at
the folder containing `Run.sh` and `model/`. The app does not bundle or
redistribute the engine or voice libraries.
