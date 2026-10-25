#!/usr/bin/env python3
"""Compare a full re-render with an incremental take.

The vocoder phase is not stable between runs, so sample-level equality outside a
dirty window is not a quality metric. This script reports envelope, spectral
magnitude, level and intermediate-data comparisons instead.
"""
import argparse
import json
import os
import wave

import numpy as np


def read_wav(path):
    with wave.open(path, "rb") as w:
        rate = w.getframerate()
        channels = w.getnchannels()
        width = w.getsampwidth()
        frames = w.getnframes()
        data = w.readframes(frames)
    if width != 2:
        raise SystemExit(f"Expected 16-bit PCM: {path}")
    samples = np.frombuffer(data, dtype="<i2").astype(np.float64) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return rate, samples


def envelope_corr(a, b, rate, frame_seconds=0.05):
    hop = max(1, int(rate * frame_seconds))
    count = min(len(a), len(b)) // hop
    if count < 2:
        return float("nan")
    ra = np.sqrt(np.mean(a[: count * hop].reshape(count, hop) ** 2, axis=1) + 1e-20)
    rb = np.sqrt(np.mean(b[: count * hop].reshape(count, hop) ** 2, axis=1) + 1e-20)
    mask = ra > 1e-4
    if mask.sum() < 3:
        return float("nan")
    return float(np.corrcoef(ra[mask], rb[mask])[0, 1])


def spectral_corr(a, b, nfft=1024, hop=512):
    count = max(1, (min(len(a), len(b)) - nfft) // hop + 1)
    window = np.hanning(nfft)
    spec_a = np.empty((count, nfft // 2 + 1))
    spec_b = np.empty((count, nfft // 2 + 1))
    for i in range(count):
        start = i * hop
        seg_a = a[start : start + nfft]
        seg_b = b[start : start + nfft]
        if len(seg_a) < nfft:
            seg_a = np.pad(seg_a, (0, nfft - len(seg_a)))
            seg_b = np.pad(seg_b, (0, nfft - len(seg_b)))
        spec_a[i] = np.abs(np.fft.rfft(seg_a * window))
        spec_b[i] = np.abs(np.fft.rfft(seg_b * window))
    return float(np.corrcoef(np.log1p(spec_a * 1000).ravel(), np.log1p(spec_b * 1000).ravel())[0, 1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--window", nargs=2, type=int, metavar=("START_FRAME", "END_FRAME"))
    args = parser.parse_args()
    root = args.directory
    rate, original = read_wav(os.path.join(root, "full-original.wav"))
    _, incremental = read_wav(os.path.join(root, "incremental.wav"))
    _, full = read_wav(os.path.join(root, "full-edited.wav"))
    result = {
        "sample_rate": rate,
        "lengths": [len(original), len(incremental), len(full)],
        "incremental_vs_full": {
            "rms_ratio": float(np.sqrt(np.mean(full**2)) / (np.sqrt(np.mean(incremental**2)) + 1e-20)),
            "envelope_corr": envelope_corr(incremental, full, rate),
            "spectral_corr": spectral_corr(incremental, full),
        },
        "original_vs_incremental": {
            "envelope_corr": envelope_corr(original, incremental, rate),
            "spectral_corr": spectral_corr(original, incremental),
        },
        "original_vs_full": {
            "envelope_corr": envelope_corr(original, full, rate),
            "spectral_corr": spectral_corr(original, full),
        },
    }
    if args.window:
        lo = int(args.window[0] / 100 * rate)
        hi = int(args.window[1] / 100 * rate)
        diff_b = np.abs(original - incremental) > 1.5 / 32768
        diff_c = np.abs(original - full) > 1.5 / 32768
        result["window"] = {
            "frames": args.window,
            "incremental_changed_inside": int(diff_b[lo:hi].sum()),
            "incremental_changed_outside": int(diff_b[:lo].sum() + diff_b[hi:].sum()),
            "full_changed_inside": int(diff_c[lo:hi].sum()),
            "full_changed_outside": int(diff_c[:lo].sum() + diff_c[hi:].sum()),
            "incremental_vs_full_inside": {
                "envelope_corr": envelope_corr(incremental[lo:hi], full[lo:hi], rate),
                "spectral_corr": spectral_corr(incremental[lo:hi], full[lo:hi]),
            },
            "incremental_vs_full_outside": {
                "envelope_corr": envelope_corr(
                    np.concatenate((incremental[:lo], incremental[hi:])),
                    np.concatenate((full[:lo], full[hi:])),
                    rate,
                ),
                "spectral_corr": spectral_corr(
                    np.concatenate((incremental[:lo], incremental[hi:])),
                    np.concatenate((full[:lo], full[hi:])),
                ),
            },
        }
    f0_i = np.fromfile(os.path.join(root, "incremental.f0"), dtype="<f4")
    f0_f = np.fromfile(os.path.join(root, "full-edited.f0"), dtype="<f4")
    mel_i = np.fromfile(os.path.join(root, "incremental.melspec"), dtype="<f4")
    mel_f = np.fromfile(os.path.join(root, "full-edited.melspec"), dtype="<f4")
    result["intermediates"] = {
        "f0_equal": bool(np.array_equal(f0_i, f0_f)),
        "melspec_corr": float(np.corrcoef(mel_i, mel_f)[0, 1]),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
