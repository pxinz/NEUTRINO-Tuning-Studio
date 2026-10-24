# Incremental / phrase-level re-rendering

Status: **implemented for pitch-only edits** (experimental, automatic fallback
to full vocode). Timing/score changes still use the full/timing render path.

The app already does stage-level incremental rendering: after a full render it can
reuse `timing.lab`, `f0` and `melspec`, and only run later stages. The next step
is re-rendering only the changed **phrase**, then splicing it into the existing
take. This document records what the Tau CLI actually supports and the risks.

## What the CLI supports

`neutrino.exe --help` on Tau v3.2.2 lists:

| Option | Meaning |
| --- | --- |
| `-p i` | single phrase prediction |
| `-i filename` | write phrase information |
| `--skip-timing` / `--skip-f0` / `--skip-melspec` | reuse existing intermediates |
| `--skip-wav` | skip waveform synthesis |

The installed `Run_single_phrase.bat` uses exactly this pattern:

```bat
bin\neutrino.exe ...full.lab ...timing.lab output\sample1-1.f0 output\sample1-1.melspec output\sample1-1.wav model\MERROW\ ^
  -i output\sample1-phraselist.txt -p 1 -n 4 -k 0 -f 0 -s 48000 -b 16 -m -t
```

`-p` selects the **line index** in the phrase list, including silence lines (not
only sung phrases). The `-i` file for sample1 starts with:

```text
0 0 0 pau
1 2333 1 h a, r u, g a, k i, t a, h a, r u, g a, k i, t a br
2 7158 1 d o, k o, n i, k i, t a
3 11400 0 pau
4 11973 1 y a, m a, n i, k i, t a, s a, t o, n i, k i, t a br
```

Format: `index start_ms is_phrase lyrics`. Frame offsets derived from the
start times by rounding to 10 ms frames (2333 → frame 233).

## Measured behaviour (Tau v3.2.2, MERROW, RTX 5060, 48 kHz/16-bit)

| Render | Audio | Frames | Wall time |
| --- | --- | --- | --- |
| full sample1 | 43.20 s | 4320 | 11.84 s |
| single phrase 1 | 4.83 s | 483 | 4.84 s |
| single phrase 2 | 4.24 s | 424 | 4.51 s |
| silence phrase 3 | 0.57 s | 57 | 3.65 s |
| full vocode (`--skip-*`) | 43.20 s | 4320 | 3.27 s |
| phrase 1 vocode (`--skip-* -p 1`) | 4.83 s | 483 | 1.07 s |

- A normal `-p` render writes a **phrase-sized F0/melspec/WAV** and a **full
  timing.lab**. The phrase audio starts at its frame offset, not at project 0.
- With `-p` plus skip flags, the timing file remains the full file but the
  supplied F0 and melspec must be **trimmed to the phrase**. Passing the full
  arrays fails with `loaded f0 size (4320) does not match expected frame size
  (483)`.
- Phrase boundaries in the trace file are rounded to ms but the actual frame
  slice is `round(ms / 10)`. Phrase 1 is 483 frames, phrase 2 is 424 frames.
- Repeated full renders are acoustically similar but **not sample-identical**:

| Comparison | Result |
| --- | --- |
| F0 full vs full2 | correlation 0.990 |
| melspec full vs full2 | correlation 0.993 |
| WAV full vs full2 | correlation **-0.066** |
| P1 F0 vs full segment | mean absolute log2 error 0.011 octave |
| P1 melspec vs full segment | correlation 0.958 |
| P2 melspec vs full segment | correlation 0.969 |

The vocoder phase is not stable across runs. A phrase splice cannot simply
overwrite PCM; it needs a short crossfade (or phase alignment), and even then
boundary quality must be listened to.

## Feasible scope

### Safe first step: pitch-only phrase re-vocode

Recommended, because it does not change timing or phrase boundaries:

1. On the full render, pass `-i` so the workspace contains the phrase map.
2. Store phrase index, start frame, frame count and end frame in the project's
   render metadata.
3. After pitch editing, determine which phrases contain changed F0 frames.
4. For each dirty phrase:
   - slice the current full F0 and melspec to the phrase frame range;
   - run `neutrino ... -p N --skip-timing --skip-f0 --skip-melspec`;
   - splice the new phrase WAV into the take at `startFrame * 480` samples with a
     20–50 ms crossfade.
5. Replace the workspace WAV, reload Web Audio, and keep the full F0/melspec
   arrays (already edited) in the project.

This reduces the vocode cost from 3.27 s to roughly 1.1 s per changed phrase on
the test machine. On a 43 s sample the saving is modest; it grows with song
length and on slower CPUs.

### Not safe yet: timing/score changes

- A timing edit changes phrase lengths, so all later frame offsets shift; the
  full F0/melspec/WAV must be rebuilt, not just one phrase.
- A score change can renumber phrases and changes the full label file.
- These should continue to use the existing full/timing render path until a
  global timeline remap is implemented.

## Implemented in 1.1.0

- Full and timing renders now pass `-i <workspace>/phrases.txt`; the parsed
  phrase map is stored in `project.render.phrases` and saved with the project.
- Before a pitch re-render, the renderer compares `currentF0` with the last
  rendered `output.f0`. If 1–4 sung phrases changed and those phrases cover at
  most 45% of the song, it switches to `mode=phrase` automatically. Otherwise
  it uses the normal full vocode.
- The main process slices F0/melspec to each dirty phrase, runs
  `-p N --skip-timing --skip-f0 --skip-melspec`, then splices the phrase WAVs
  into the previous take with a 30 ms crossfade. Timing and melspec stay
  untouched; the full edited F0 is written for the next pass.
- The operation is atomic: phrase WAVs are rendered to a temp directory and the
  final WAV is replaced only after all phrases succeed. A missing phrase map,
  too many dirty phrases, or a full-song phrase falls back to the existing
  full vocode. Cancellation leaves the previous take untouched.
- Unit tests cover phrase parsing, dirty phrase detection, and PCM16
  splicing/crossfade; a real-engine Playwright test imports sample1, changes
  pitch in phrase 1, and asserts that only that phrase region of the WAV changed.

Measured on sample1: full render 43.2 s/11.84 s; phrase 1 vocode 4.83 s/1.07 s;
after the phrase splice, samples outside phrase 1 were byte-identical to the
previous take (0 changed samples), while the phrase region changed. UI mode
label shows **局部重渲染 / Phrase re-render**.

## What is already in the app

- Full render.
- Timing render with `--skip-timing`.
- Pitch-only vocode with `--skip-timing --skip-f0 --skip-melspec`.
- Stale-render detection and output validation.

So “incremental” is already present at the **stage** level. Phrase-level is a
separate, riskier optimization.

## Files/areas to change for the UI feature

- `electron/lib/render.cjs`: append `-i <workspace>/phrases.txt`; parse and
  return the phrase map; add a phrase render command.
- `src/state/useAppStore.ts`: render-mode selection, dirty phrase detection,
  audio reload after splice.
- `src/components/RightPanel.tsx`: phrase/region selector and a “render selected
  phrase” action.
- `src/lib/audio.ts` / main process: PCM splice + crossfade and WAV reload.
- Tests: phrase parsing, slicing, crossfade boundaries, fallback to full.

## Recommendation

Implement **pitch-only phrase re-vocode** first, behind an optional setting.
Keep timing and score changes on the full render path. Do not ship automatic
phrase splicing without a listening test at phrase boundaries; the vocoder's
phase is not stable across runs.
