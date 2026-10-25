# Architecture

## Layers

```
┌────────────────────────────────────────────────────────────────────┐
│ Electron main process (electron/)                                  │
│  • BrowserWindow / app menu / native dialogs                       │
│  • SettingsStore (userData/settings.json)                          │
│  • NEUTRINO detection + model metadata                             │
│  • RenderManager: validate, spawn, stream logs, cancel, collect    │
│  • File-system and close-confirmation IPC                          │
└────────────────────────────────────────────────────────────────────┘
                 ▲ contextBridge (electron/preload.cjs)
                 │ typed invoke / event channels, context isolation,
                 │ no Node integration, sandboxed renderer
┌────────────────────────────────────────────────────────────────────┐
│ React renderer (src/)                                              │
│  • Zustand store: project, tunings, transport, render UI, history   │
│  • Score / Timing / Pitch / Dynamics editors                       │
│  • Waveform + canvas rendering, wheel/zoom/vertical scroll         │
│  • Web Audio engine (preview, reference mix, offline export)       │
│  • i18next resources: zh / en / ja                                 │
└────────────────────────────────────────────────────────────────────┘
```

The renderer does not have `child_process` access. Long-running work is orchestrated
in the main process and reported through one event channel; renderer actions use
typed `ipcRenderer.invoke` wrappers exposed by the preload script.

## Project model

A project is a JSON document (`.ntstudio`) with:

- `score`: notes (beats, duration, MIDI pitch, kana lyric, breath), tempo map,
  time signatures, key, title/artist;
- `synth`: model, support model, StyleShift, transpose, threads, GPU, sample
  rate, bit depth;
- `timing`: edited timing text + original model text + edited flag + score hash;
- `pitch`: gzip+base64 Float32 F0 arrays (base and current) + edited flag;
- `dynamics`: output gain points in dB;
- `reference`: audio path, offset, volume, mute;
- `render`: output paths, hashes, duration/format, timestamp.

F0 arrays are compressed with pako before base64 encoding so a multi-minute
project stays manageable. Hashes (`scoreHash`, `timingHash`, `synthHash`) drive
render-mode selection and staleness detection.

Undo history keeps up to 80 snapshots of score, timing, base/current F0,
dynamics and reference metadata. Renders are not undoable; changing the score
after a render intentionally makes the previous audio stale.

## Editing and rendering flow

```
Import/new score
      │
      ▼
 musicXMLtoLabel ──► full.lab + mono.lab
      │
      ▼
 NEUTRINO (full) ──► timing.lab + f0 + melspec + wav
      │
      ├── Timing editor edits boundaries ──► timing render (--skip-timing)
      │                                        └─ pitch edits warped and revoiced
      ├── Pitch editor edits f0 ─────────────► vocode render
      └── Dynamics editor edits gain ────────► playback / export only
                                                   │
                                                   ▼
                                      WAV vocal / reference mixdown
```

The timeline uses a shared time viewport (`pxPerSec`, `scrollSec`) and fixed
piano-roll row height (`24px`, `pitchScroll`). Wheel behavior is configurable:
horizontal-first or vertical-first, with Shift reversing the axis. Timing and
dynamics use the same horizontal viewport but no vertical roll.

## Keyboard shortcuts

`src/lib/shortcuts.ts` owns the action list, portable default bindings (`Mod`
resolves to Ctrl/Cmd), event-to-binding matching, and display formatting.
Bindings are persisted in `settings.shortcuts`; the app-level key handler reads
them at event time so changes take effect immediately. Native menu accelerators
for these configurable actions are omitted to avoid a second, non-configurable
key path; menu clicks still dispatch the same actions.

## Playback timeline and monitoring

The playable timeline ends at the later of the rendered vocal, the score, and
`reference.offset + reference.duration`. A reference may have a negative offset;
playback and mixdown start partway into its buffer accordingly. The playhead is a
small absolutely positioned overlay driven directly by `transport.currentTime`.
Editors and waveform canvases redraw only when their content, zoom, or scroll
changes, not on every audio tick. Auto-follow is an imperative store
subscription, so it only re-renders when the viewport actually scrolls. Vocal
monitoring can be set to the rendered vocal, a sine-wave guide generated from
the current F0, or mute; reference monitoring is independent. Vocal monitoring
applies to playback only, while reference mute is saved with the project and
also affects mixdown.

`src/lib/audio.ts` wraps one `AudioContext`:

- decode rendered WAV / reference audio;
- compute min/max peaks for canvas waveform drawing;
- play with source gain automation for the dynamics envelope;
- mix reference audio at its offset for preview;
- offline-render vocal or mixdown at the configured sample rate and bit depth,
  optionally peak-normalizing, then encode a RIFF WAV in the renderer and write
  it through IPC.

Audio is processed locally and is not uploaded by the app.

## Cross-platform process runner

`electron/lib/neutrino.cjs` finds executables and chooses native vs Wine. Windows
and macOS always use their native distribution. On Linux, if only a Windows
`.exe` is present, Wine paths are converted to `Z:\...` and `WINEDEBUG=-all` is
set. On macOS, the child environment includes
`DYLD_LIBRARY_PATH=<root>/bin`, matching the official `Run.sh`. The converter is
run with `cwd` set to the NEUTRINO root, because its dictionary lookup is
relative.

`electron/lib/render.cjs` constructs argument arrays, captures streams, maps
progress, verifies output files and kills the process tree on cancel. It invokes
processes without a shell, so paths with spaces and Japanese characters are
passed intact.

## Packaging

- electron-builder produces Windows NSIS + portable, Linux AppImage + deb and
  macOS dmg configurations.
- The application icon is generated from the supplied TS for NEUTRINO artwork
  by `scripts/make-icon.cjs` with nearest-neighbor scaling and responsive
  crops (TS-only at small sizes, full lockup at large sizes).
- NEUTRINO and models are detected at runtime and are not packaged.

## Testing

The repository contains local Electron/Playwright scripts for real UI flows
(welcome, render, pitch vocode, timing, project reopen, close confirmation,
MIDI/lyrics, playback, reference mix). They require a local NEUTRINO install for
the rendering cases. Screenshots used in the README are under
`docs/screenshots/`.
