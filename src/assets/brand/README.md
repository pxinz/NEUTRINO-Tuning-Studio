# Brand assets

These are the source crops used for the **application icon only**. The artwork
was supplied by the project author ("TS for NEUTRINO", MiSans SemiBold, used
with permission under MiSans' free-commercial-use terms). It is not displayed
inside the app UI; the UI uses a typographic wordmark.

| File | Purpose |
| --- | --- |
| `ts-for-neutrino.png` | original supplied artwork (retained for provenance) |
| `ts-for-neutrino-mark.png` | alpha-trimmed square full lockup |
| `ts-mark.png` | "TS for" compact crop |
| `ts-only.png` | "TS" mark for 16–48 px icons |

Regenerate all platform icons with:

```bash
npm run icon
```

The generator uses nearest-neighbour scaling and responsive source selection:
TS-only for 16/24/32/48 px, "TS for" for 64 px, and the full lockup for 128 px
and larger.
