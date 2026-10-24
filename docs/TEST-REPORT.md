# Verification report

Date of verification: 2026-10-24 · build 1.0.1

## Windows host

| Item | Value |
| --- | --- |
| OS | Windows 11 build 26200 |
| CPU/GPU | NVIDIA GeForce RTX 5060 Laptop GPU, 8 GB |
| NEUTRINO | Tau v3.2.2.stable at `E:\Programs\NEUTRINO` |
| Models | MERROW, NAKUMO, REINA, RUNO, SOMA, ZUNDAMON |
| Node | v24.11.1 |
| Electron | 38.8.6 |

### Functional results

| Case | Result |
| --- | --- |
| First-run engine detection | PASS — found Tau v3.2.2 and 6 models |
| Demo project | PASS — 29 notes, 3 phrases, 19.8 s score |
| Full render (GPU, `-m`) | PASS — 24.0 s WAV in about 11 s |
| Timing edit → re-render | PASS — `--skip-timing`, mode logged as timing; pitch edits retained |
| Pitch edit → vocode-only re-render | PASS — `--skip-timing --skip-f0 --skip-melspec` |
| Project save | PASS — `.ntstudio` with F0 base64, timing and render paths |
| Project reopen | PASS — audio, pitch edited state and notes restored |
| WAV export | PASS — 4,608,044-byte 48 kHz/16-bit file |
| Mixdown export with reference | PASS |
| Playback / cursor / reference track | PASS |
| MIDI import | PASS — 4 notes, tempo/time signature, default kana |
| Lyrics modal + romaji/kana + apply | PASS |
| Note add + undo | PASS |
| MusicXML import (`sample1.musicxml`) | PASS — 60 notes, 4 phrases, lyrics retained |
| MusicXML export | PASS — valid partwise XML with lyrics |
| Chinese / English / Japanese UI | PASS |
| Log drawer with fixed note row height | PASS — note height 23 CSS px before/after opening log; vertical scrollbar appears |
| Unsaved close prompt (save/discard/cancel) | PASS |
| Packaged Windows app (unpacked) | PASS — launched via Playwright with a fresh user data directory |
| Packaged Windows 1.0.1 real render | PASS — detected engine/models, rendered the demo, 21.6 s audio, no leading bar |
| Installer/portable artifacts | PASS — NSIS and portable EXE produced; associated 32 px icon verified |
| Unit tests | PASS — 10 Vitest tests (MusicXML round-trip, lead-in rest, timing, F0, dynamics) |
| Playback alignment | PASS — rendered demo first voiced frame 0.01 s; timing starts `0 100000 pau`; no one-bar lead |
| Light-mode render progress | PASS — running percentage computed color `rgb(15,23,42)` on `rgb(238,243,250)` |
| Pencil drag | PASS — drag creates one note with extended duration |
| Eraser drag | PASS — drag across a pitch row removed multiple notes |
| Overlap feedback | PASS — warning banner shown and overlapping notes outlined red |

### Render log highlights

```
NEUTRINO - Tau v3.2.2.stable
setup device : NVIDIA GeForce RTX 5060 Laptop GPU (GPU 0)
load models  : 0.074 [sec]
inference (timing) / (acoustic)
progress = 100 %
finish : 11.350 [sec]
inference speed : 2.115 [X speed]
wav length : 24.000 [sec]
```

Pitch-only pass log:

```
mode=vocode ... --skip-timing --skip-f0 --skip-melspec
load models : (vocoder model only)
```

## Linux / WSL2

| Item | Value |
| --- | --- |
| Environment | WSL2 Ubuntu 24.04, WSLg (`DISPLAY=:0`, Wayland available), Node 22.20.0 |
| Test | Electron app launched under WSLg via Playwright |
| Welcome screen | PASS |
| Demo score + 29 notes | PASS |
| English UI | PASS |
| Fixed piano-roll height and vertical scrollbar | PASS |
| Log drawer open/close | PASS |
| Packaged unpacked Linux app | PASS — launched under WSLg via Playwright |
| AppImage 1.0.1 (115 MB) | PASS — launched with `APPIMAGE_EXTRACT_AND_RUN=1` under WSLg; light theme checked |
| deb package 1.0.1 (89 MB) | PASS — built successfully with maintainer metadata |
| Renderer console errors | none |

The WSL environment used for GUI verification did not have NEUTRINO installed or
Wine configured, so real synthesis on Linux was not exercised there. The Windows
host performed the real-engine tests. Native Linux / Wine engine execution is
implemented but requires a local NEUTRINO installation and is called out as an
untested environment in the README.

## macOS

A cross-built **arm64 app zip** was produced on WSL with `@electron/packager`,
then ad-hoc signed with `rcodesign`:

`release/mac/NEUTRINO-Tuning-Studio-1.0.1-macOS-arm64-unsigned.zip`

Inspected:

- Mach-O arm64 main executable and helper binaries;
- correct `Info.plist` name/identifier/version/icon;
- 14 framework symlinks and all `Versions/A` targets present in the zip;
- `app.asar` present; executable modes and `Open-Anyway.command` preserved;
- `CodeDirectory` with `ADHOC` flag and resource seal.

**Not executed on macOS**, not Developer ID signed, and not notarized. Gatekeeper
handling and real NEUTRINO macOS integration therefore remain unverified. The
native macOS workflow in `.github/workflows/build-macos.yml` is the recommended
way to produce a proper Mac build. electron-builder itself refuses macOS targets
on Windows (`Build for macOS is supported only on macOS`).

## Packaging

- Windows: `NEUTRINO Tuning Studio Setup 1.0.1.exe` (NSIS) and
  `NEUTRINO Tuning Studio 1.0.1.exe` (portable) are produced successfully.
- Linux: AppImage and deb were built in the WSL environment under
  `release/linux/`; both the unpacked app and the AppImage were launched under
  WSLg.
- Code signing: not configured in this environment, so Windows artifacts are
  unsigned. Users may see SmartScreen warnings.

## Copy audit follow-up

The Chinese UI copy was revised after review:

- fixed the unmatched quote in the lyric-symbol explanation;
- removed unsupported absolute performance/privacy claims;
- replaced colloquial phrasing (e.g. “重跑”) with neutral terminology;
- removed second-person phrasing in notices;
- clarified that the app does not include or distribute NEUTRINO/models;
- replaced the trademark claim in the non-affiliation notice with an accurate
  description of the relationship.

## Brand asset

The supplied “TS for NEUTRINO” artwork is used only for the executable,
installer, taskbar/window icons and documentation. It is not displayed inside the
application UI. Icon generation uses nearest-neighbour scaling with responsive
crops (TS only at 16–48 px, TS for at 64 px, full lockup at 128 px and above).

