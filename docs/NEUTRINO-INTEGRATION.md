# NEUTRINO integration notes

This document records how NEUTRINO Tuning Studio drives the official Tau CLI and
why the tuning workflow can re-render only part of the pipeline.

The application is a companion tool. It never patches, bundles, or
redistributes NEUTRINO. Everything below assumes a local installation.

## Installation layout

```
NEUTRINO/
  Run.bat (Windows)  or Run.sh (Linux/online build)
  bin/
    neutrino.exe / NEUTRINO
    musicXMLtoLabel.exe / musicXMLtoLabel
  model/
    MERROW/
      info.toml
      p.bin s.bin t.bin v.bin
    ...
  score/
  settings/
  output/
```

Detection checks `bin/` and the root for both executables, then reads
`model/*/info.toml` for display name, version, speaker metadata, supported keys
and support-model capability.

- Windows: executes the official Windows binaries directly.
- Linux/macOS: if only a Windows `.exe` is present, the runner uses Wine. The
  app converts absolute Unix paths to `Z:\...` Wine paths and keeps the
  working directory at the NEUTRINO root, because the converter resolves
  `settings/dic` relative to its working directory.
- Native macOS/Linux builds are launched directly.

## CLI invocation

The normal full render is:

```text
musicXMLtoLabel <score.musicxml> <full.lab> <mono.lab>

neutrino <full.lab> <timing.lab> <out.f0> <out.melspec> <out.wav> \
  <model/MERROW/> -n 4 -k 0 -f 0 -s 48000 -b 16 -t -m \
  [-S SOMA]
```

Options used by the UI:

| UI control | CLI |
| --- | --- |
| CPU threads | `-n N` |
| Style shift | `-k semitones` |
| Transpose | `-f semitones` |
| Sample rate | `-s 44100/48000/32000` |
| Bit depth | `-b 16/24/32` |
| Best GPU | `-m` (omitted for CPU) |
| Support model | `-S MODEL` |
| Trace info | `-t` |
| Timing preserved | `--skip-timing` |
| Pitch preserved | `--skip-f0` |
| Mel-spectrogram preserved | `--skip-melspec` |
| Waveform only | `--skip-timing --skip-f0 --skip-melspec` |

## Intermediate file formats

These were verified against a local Tau v3.2.2 installation.

### `timing.lab`

Plain text, one phoneme per line. Times are integers in 100 ns units:

```text
0 23330000 pau
23330000 24100000 h
24100000 29580000 a
```

The app parses this into seconds, draws draggable boundaries in the Timing
editor, and serializes back. Intervals must remain contiguous; a gap changes
the effective duration. The editor enforces a minimum interval and only moves
the boundary between two adjacent phonemes.

When the Timing editor has edits, a render passes `--skip-timing` and supplies
the edited file. NEUTRINO uses it instead of predicting a new timing.

### `f0`

One little-endian `float32` per frame, 100 frames per second. `0.0` denotes an
unvoiced frame; positive values are Hz. The file for a 24.000 s render is
`2400 * 100 * 4 = 960000` bytes (before optional leading silence / rounding).

The Pitch editor exposes this curve directly. On a pitch-only render, the app
writes the edited array to `output.f0`, then invokes NEUTRINO with
`--skip-timing --skip-f0 --skip-melspec`. Only the vocoder runs. The NEUTRINO
vocoder follows the supplied F0 while keeping the acoustic timbre, so manual
pitch and vibrato edits are made in the vocoder domain rather than by
post-processing the rendered WAV.

### `melspec`

Float32 log-mel frames, 100 bins per frame. The app does not edit the
spectrogram. Dynamics is intentionally implemented as an output gain envelope
(and is applied to playback and export), not as a mel-spectrogram edit.

### WAV

NEUTRINO writes PCM/float WAV at the requested rate and depth. The app reads
the RIFF header for duration/channels/bit depth and decodes it with Web Audio
for playback. The workspace copy remains the authoritative render until the
next render overwrites it; users should export takes they want to keep.

## Single-phrase prediction (`-p`)

Tau also exposes `-p N` (one phrase) and `-i phrases.txt` (phrase trace). A phrase
render writes phrase-sized F0/melspec/WAV while the timing file remains full. When
combined with skip flags, the F0/melspec inputs must be trimmed to the phrase.

This was verified. Pitch-only phrase splicing is now used automatically when only
a few phrases change; it is experimental and falls back to a full vocode. Timing
or score changes still use the full render path. Measurements and caveats are in
[INCREMENTAL-RENDERING.md](INCREMENTAL-RENDERING.md).

## Render modes

The UI chooses one of four modes from hashes stored in the project:

1. **Full** — score or synth settings changed, or no render exists.
   Regenerates labels, timing, F0, melspec and WAV.
2. **Timing** — only timing was edited. Runs `--skip-timing` to keep the
   boundary edits, regenerates F0/melspec/WAV. If pitch was also edited, the
   app warps the pitch curve from the old phoneme timeline to the new one,
   writes it, and performs a second vocoder-only pass.
3. **Vocode** — only pitch changed. Runs with all three skip flags.
4. **Phrase** — pitch changed and at most four changed phrases cover at most 45%
   of the song. Slices F0/melspec, runs `-p` per phrase, and crossfades the
   phrase audio into the previous take. Falls back to Vocode if unavailable.

Score edits clear timing/F0 because note identities and phoneme alignment no
longer correspond. A full render discards timing edits; pitch edits can be
carried over by time resampling with a warning, but a full re-render is
recommended after structural score changes.

## Score generation

### Lead-in rest and playback alignment

`musicXMLtoLabel` inserts a **full rest into the first measure** when a score
begins with a note. In playback this appears as the audio starting one bar after
the visible playhead. The exporter therefore prepends a one-division (1/480
beat) rest when the first note starts at beat 0. At normal tempos that offset is
under 2 ms, the converter no longer inserts a bar rest, and the rendered F0
starts at the beginning (verified: first voiced frame ≈ 0.01 s, `timing.lab`
begins with `0 100000 pau`). Projects rendered with earlier versions should be
re-rendered once to benefit from this change.

The app exports MusicXML 3.1 partwise with:

- one vocal part, quarter-note divisions of 480;
- `<sound tempo>` for the tempo map and `<sound tempo>` directions at each
  measure start where tempo applies;
- kana lyrics on every sung note;
- `<breath-mark/>` and ties where requested;
- rests filling incomplete measures.

MusicXML import selects the part/voice with the most lyric-bearing notes,
collapses chords to a monophonic line and merges ties. This covers typical
vocal scores (MuseScore exports) but intentionally does not implement every
MusicXML feature: `score-timewise` is rejected, tuplets are represented by
their exact duration where possible, and complex multi-voice piano parts are
reduced.

Lyrics should be full-width hiragana/katakana. `ー` extends the previous vowel,
`’` marks vowel deletion, and `っ` adds a stop. The UI validates these characters
and warns when a phrase exceeds roughly ten seconds.

## Errors and cancellation

- The child process runs with `windowsHide`, argv arrays (no shell), and a
  20-minute timeout.
- Cancellation kills the process tree (`taskkill /T` on Windows, process group
  signals elsewhere).
- The log drawer shows stdout/stderr, including NEUTRINO's progress updates.
- Output existence and non-empty size are verified after each stage; the UI
  surfaces the last log lines on failure.

## References

- Official site: https://studio-neutrino.com/
- MusicXML guide: https://studio-neutrino.com/articles/neutrino-cli-musicxml/
- Linux setup: https://studio-neutrino.com/articles/neutrino-cli-linux/
- Tau v3 notes: https://studio-neutrino.com/articles/neutrino-cli-v3-tau/
