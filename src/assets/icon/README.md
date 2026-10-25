# Icon artwork

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
| `ts-only.png` | “TS” mark for small icons |

Regenerate all platform icons with:

```bash
npm run icon
```

The generator uses nearest-neighbor scaling and:
- TS-only artwork at 16–64 px;
- the full lockup at 128 px and above.
