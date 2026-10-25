# Verification report

Date of verification: 2026-10-24 · build 1.1.3

## Windows host

| Item | Value |
| --- | --- |
| OS | Windows 11 build 26200 |
| CPU/GPU | NVIDIA GeForce RTX 5060 Laptop GPU, 8 GB |
| NEUTRINO | Tau v3.2.2.stable in a local installation |
| Models | MERROW, NAKUMO, REINA, RUNO, SOMA, ZUNDAMON |
| Node | v24.11.1 |
| Electron | 38.8.6 |

### Functional results

| Case | Result |
| --- | --- |
| First-run engine detection | PASS — found Tau v3.2.2 and 6 models |
| Demo project | PASS — 29 notes, 3 phrases, 19.8 s score |
| Full render (GPU, `-m`) | PASS — 21.6 s WAV in about 12 s |
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
| Packaged Windows 1.1.3 real render | PASS — detected engine/models, rendered the demo, 21.6 s audio, no leading bar |
| Installer/portable artifacts | PASS — NSIS and portable EXE produced; associated 32 px icon verified |
| Unit tests | PASS — 21 Vitest tests (MusicXML round-trip, lead-in rest, timing, F0, dynamics, phrase parsing/splicing, project phrase persistence, native macOS runner/search paths, reference timeline) |
| Playback alignment | PASS — rendered demo first voiced frame 0.01 s; timing starts `0 100000 pau`; no one-bar lead |
| Light-mode render progress | PASS — running percentage computed color `rgb(15,23,42)` on `rgb(238,243,250)` |
| Pencil drag | PASS — drag creates one note with extended duration |
| Eraser drag | PASS — drag across a pitch row removed multiple notes |
| Overlap feedback | PASS — warning banner shown and overlapping notes outlined red |
| Phrase incremental render | PASS — imported sample1 (60 notes), edited pitch in phrase 1, UI switched to 局部重渲染 (Phrase re-render); phrase 1 vocoded with `-p 1`; only 434,006 samples inside phrase 1 changed, 0 samples outside; audio reloaded with no errors |
| Phrase unit tests | PASS — phrase parser, dirty phrase detection, PCM16 splice/crossfade, project phrase persistence (5 tests) |
| Reference timeline | PASS — 30 s reference extended transport to 0:30; offset -2 produced 0:28; playback from 0:27.7 stopped at the reference end |
| Reference-only playback | PASS — a loaded reference played without a rendered vocal (0:01.18 after 1.2 s) |
| Vocal monitor | PASS — combobox offers 人声 / 正弦波 / 静音; sine mode plays, mute and vocal modes switch live |
| Empty-state render action | PASS — clicked 渲染人声 inside the timing overlay; full render started and the overlay was replaced by timing data |
| Empty-state wording | PASS — timing/pitch/dynamics prompts all use the same “请先渲染人声” wording and 渲染人声 button |
| Playback UI performance | PASS — automated 3 s playback produced no `longtask` entries over 50 ms |
| Reference/playback unit tests | PASS — positive/negative reference endings and fallback durations (3 tests) |

### Render log highlights

```
NEUTRINO - Tau v3.2.2.stable
setup device : NVIDIA GeForce RTX 5060 Laptop GPU (GPU 0)
load models  : 0.074 [sec]
inference (timing) / (acoustic)
progress = 100 %
finish : 11.350 [sec]
inference speed : 2.115 [X speed]
wav length : 21.600 [sec]
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
| AppImage 1.1.3 (115 MB) | PASS — launched with `APPIMAGE_EXTRACT_AND_RUN=1` under WSLg; light theme checked |
| deb package 1.1.3 (89 MB) | PASS — built successfully with maintainer metadata |
| Renderer console errors | none |

The WSL environment used for GUI verification did not have NEUTRINO installed or
Wine configured, so real synthesis on Linux was not exercised there. The Windows
host performed the real-engine tests. Native Linux / Wine engine execution is
implemented but requires a local NEUTRINO installation and is called out as an
untested environment in the README.

## macOS

A cross-built **arm64 app zip** was produced locally on WSL with
`@electron/packager`, then ad-hoc signed with `rcodesign`:

`release/mac/NEUTRINO-Tuning-Studio-1.1.3-macOS-arm64-unsigned.zip`

This is a local build artifact; `release/` is not committed.

Inspected:

- Mach-O arm64 main executable and helper binaries;
- correct `Info.plist` name/identifier/version/icon;
- 14 framework symlinks and all `Versions/A` targets present in the zip;
- `app.asar` present; executable modes and `Open-Anyway.command` preserved;
- `CodeDirectory` with `ADHOC` flag and resource seal.

Static check against the official macOS Tau v3.2.2 distribution:

- `bin/neutrino` and `bin/musicXMLtoLabel` are found as native executables;
- the runner resolves to `native` on macOS;
- `DYLD_LIBRARY_PATH` is set to `<NEUTRINO_ROOT>/bin` for the child process;
- all five bundled models are detected.

**Not executed on macOS**, not Developer ID signed, and not notarized. Gatekeeper
handling and real NEUTRINO macOS integration therefore remain unverified. The
native macOS workflow in `.github/workflows/build-macos.yml` is the recommended
way to produce a proper Mac build. electron-builder itself refuses macOS targets
on Windows (`Build for macOS is supported only on macOS`).

## Packaging

- Windows: `NEUTRINO Tuning Studio Setup 1.1.3.exe` (NSIS) and
  `NEUTRINO Tuning Studio 1.1.3.exe` (portable) are produced successfully.
- Linux: AppImage and deb were built in the WSL environment under
  `release/linux/`; both the unpacked app and the AppImage were launched under
  WSLg.
- Code signing: not configured in this environment, so Windows artifacts are
  unsigned. Users may see SmartScreen warnings.

## Localization review

The zh/en/ja UI copy was reviewed for wording and public-repository suitability:

- the lyric-symbol explanation uses consistent punctuation and terminology;
- notices use neutral, third-person phrasing;
- engine/model distribution and the non-affiliation relationship are stated
  explicitly;
- the experimental phrase-render mode is labelled as experimental in the UI and
  documentation.

## Incremental phrase probe

Tested on Tau v3.2.2 with sample1/MERROW:

- `-p 1` produced 4.83 s / 483 frames in 4.84 s; full render was 43.2 s in 11.84 s.
- `-p 1 --skip-*` vocoded the same phrase in 1.07 s; full vocode took 3.27 s.
- `-i` phrase map format and frame offsets were verified; `-p` indexes include
  silence lines.
- Full renders are not sample-identical: WAV correlation between two full runs
  was -0.066, while F0/melspec correlation was 0.990/0.993. Phrase splicing
  therefore uses a 30 ms crossfade. The UI labels this 局部重渲染（实验性）
  (Phrase re-render, experimental).

Details: [INCREMENTAL-RENDERING.md](INCREMENTAL-RENDERING.md).





