# Brand assets

These source crops are used for the **application icon only**. The artwork was
created by the project author and is released under the **MIT license**; it is not
displayed inside the app UI.

The lettering uses **MiSans SemiBold**. MiSans is a separate font by Xiaomi,
licensed under its own free-commercial-use terms; it is not covered by this
project's MIT license. See https://hyperos.mi.com/font/en/faq/.

| File | Purpose |
| --- | --- |
| `ts-for-neutrino.png` | original artwork (retained for provenance) |
| `ts-for-neutrino-mark.png` | alpha-trimmed square full lockup |
| `ts-mark.png` | “TS for” compact crop |
| `ts-only.png` | “TS” mark for 16–48 px icons |

Regenerate all platform icons with:

```bash
npm run icon
```

The generator uses nearest-neighbor scaling and responsive source selection:
TS-only for 16/24/32/48 px, “TS for” for 64 px, and the full lockup for 128 px and
larger.
