# Incremental and phrase-level rendering

Status: **implemented for pitch-only edits; experimental**. Timing and score
changes still use the full/timing render path.

The app performs two kinds of incremental rendering:

- **Stage-level**: reuse `timing.lab`, `f0` and `melspec`, then run only the
  remaining stages.
- **Dirty-region**: when eligible, re-vocode affected phrases and splice only
  the changed F0 frame windows back into the existing take. Unchanged audio
  inside the same phrase is preserved; separated edits become separate windows.

## CLI support

`neutrino.exe --help` on Tau v3.2.2 lists:

| Option | Meaning |
| --- | --- |
| `-p i` | single phrase prediction |
| `-i filename` | write phrase information |
| `--skip-timing` / `--skip-f0` / `--skip-melspec` | reuse existing intermediates |
| `--skip-wav` | skip waveform synthesis |

The `Run_single_phrase.bat` included with Tau uses this pattern:

```bat
bin\neutrino.exe ...full.lab ...timing.lab output\sample1-1.f0 output\sample1-1.melspec output\sample1-1.wav model\MERROW\ ^
  -i output\sample1-phraselist.txt -p 1 -n 4 -k 0 -f 0 -s 48000 -b 16 -m -t
```

`-p` selects the **line index** in the phrase list, including silence lines (not
only sung phrases). A phraselist for sample1 begins with:

```text
0 0 0 pau
1 2333 1 h a, r u, g a, k i, t a, h a, r u, g a, k i, t a br
2 7158 1 d o, k o, n i, k i, t a
3 11400 0 pau
4 11973 1 y a, m a, n i, k i, t a, s a, t o, n i, k i, t a br
```

Format: `index start_ms is_phrase lyrics`. Frame offsets are derived by rounding
the start time to 10 ms frames (2333 → frame 233).

## Measured behavior

Environment: Tau v3.2.2, MERROW, RTX 5060, 48 kHz/16-bit.

| Render | Audio | Frames | Wall time |
| --- | --- | --- | --- |
| full sample1 | 43.20 s | 4320 | 11.84 s |
| single phrase 1 | 4.83 s | 483 | 4.84 s |
| single phrase 2 | 4.24 s | 424 | 4.51 s |
| silence phrase 3 | 0.57 s | 57 | 3.65 s |
| full vocode (`--skip-*`) | 43.20 s | 4320 | 3.27 s |
| phrase 1 vocode (`--skip-* -p 1`) | 4.83 s | 483 | 1.07 s |

- A normal `-p` render writes a **phrase-sized F0/melspec/WAV** and a **full
  timing.lab**. The phrase audio starts at its frame offset, not at project zero.
- With `-p` plus skip flags, the timing file remains the full file, but the
  supplied F0 and melspec must be **trimmed to the phrase**. Passing full arrays
  fails with `loaded f0 size (4320) does not match expected frame size (483)`.
- Phrase boundaries in the trace file are rounded to ms, but the frame slice is
  `round(ms / 10)`. Phrase 1 is 483 frames; phrase 2 is 424 frames.
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
overwrite PCM; it needs a short crossfade (or phase alignment), and the boundary
quality should be auditioned.

## Current implementation

- Full and timing renders pass `-i <workspace>/phrases.txt`; the parsed phrase
  map is stored in `project.render.phrases` and saved with the project.
- Before a pitch re-render, the renderer compares `currentF0` with the last
  rendered `output.f0`. Changed frames are grouped into windows with a 50 ms
  context guard; edits separated by more than the merge gap become separate
  windows. If at most eight sung phrases are affected and changed frames cover
  at most 50% of the song, it switches to `mode=phrase`; otherwise it uses the
  normal full vocode.
- The main process slices F0/melspec to each affected phrase and runs
  `-p N --skip-timing --skip-f0 --skip-melspec` once per phrase. It then splices
  only each dirty frame window from the rendered phrase WAV into the previous
  take, with a 30 ms crossfade at every window edge. Unchanged samples inside
  the phrase are preserved.
- The operation is atomic: phrase WAVs are rendered to a temp directory and the
  final WAV is replaced only after all windows succeed. A missing phrase map,
  too many changed phrases, or invalid windows fall back to a full vocode.
  Cancellation leaves the previous take untouched.
- Unit tests cover phrase parsing, dirty window detection (merged and separated
  windows), PCM16 sub-window splicing, and project phrase persistence. A
  real-engine Playwright test imports sample1, changes pitch in phrase 1, and
  verifies the changed-sample boundaries.

Measured on sample1 (43.2 s, 48 kHz): the edit produced a **1.79 s** dirty
window (frames 500–679). After the splice, **85,756 samples changed inside the
window and 0 samples changed outside it**; the previous whole-phrase splice
changed roughly 434,000 samples. The UI label is **脏区重渲染（实验性）/
Dirty-region re-render (experimental)**. This remains a feasibility experiment,
not a release feature.

## Current render paths

1. **Full** — score, synth settings, model, or no render; regenerates labels,
   timing, F0, melspec, WAV.
2. **Timing** — timing edited; `--skip-timing`, then regenerates F0/melspec/WAV.
3. **Vocode** — pitch edited but phrase mode is unavailable or not beneficial;
   `--skip-timing --skip-f0 --skip-melspec`.
4. **Dirty region** — pitch edited and at most 8 changed phrases cover at most
   50% of the song; per-phrase `-p` plus changed-frame-window splices.

## Remaining work

- Timing edits change phrase lengths and shift later frame offsets, so they still
  require a full rebuild.
- Score edits can renumber phrases and change the label file, so they still
  require a full render.
- The phrase boundary crossfade should be auditioned on more material before the
  feature leaves experimental status.
