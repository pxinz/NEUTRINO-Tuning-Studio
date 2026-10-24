# VST3 / CLAP roadmap (optional)

VST3 support was explicitly optional for the first release and is **not
implemented yet**. The current app is a standalone editor/renderer.

A practical integration would keep the current engine boundary:

1. Build a small native plugin wrapper (VST3 SDK or CLAP) that owns a shared
   render session and exposes parameters for model, StyleShift, transpose,
   pitch offset and dynamics.
2. Use the existing project/render model: the plugin receives note/lyric data
   from the DAW via MIDI/parameter input or from a `.ntstudio` project, and calls
   the same `RenderManager`/CLI layers (or a local daemon) over IPC.
3. For realtime preview, pre-render short phrases (the CLI already supports
   phrase-level operation with `-p` and `-i`), cache PCM/F0/melspec, and use the
   existing vocoder-only pass when the user edits pitch.
4. Share the score/timing/F0 model and localization resources between the
   standalone app and the plugin to avoid a second implementation.
5. Bundle no NEUTRINO binaries/models; detect the user's installation exactly as
   the standalone app does.

Open questions to resolve before implementation:

- latency and transport sync for realtime preview;
- DAW state persistence for a large F0 curve;
- licensing and branding for a plugin named after NEUTRINO;
- macOS notarisation and Windows signing for the wrapper.
