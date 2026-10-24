import pako from 'pako';
import type { Phoneme } from './types';
import { base64ToBytes, bytesToBase64, clamp, freqToMidi, midiToFreq } from './time';

export const F0_RATE = 100;

export function parseF0(input: Uint8Array | ArrayBuffer): Float32Array {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const copy = new Uint8Array(bytes.byteLength - (bytes.byteLength % 4));
  copy.set(bytes.subarray(0, copy.length));
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

export function f0ToBytes(f0: Float32Array): Uint8Array {
  return new Uint8Array(f0.buffer.slice(f0.byteOffset, f0.byteOffset + f0.byteLength));
}

export function encodeF0(f0: Float32Array | null): string {
  if (!f0 || !f0.length) return '';
  try {
    const compressed = pako.gzip(f0ToBytes(f0), { level: 6 });
    return bytesToBase64(compressed);
  } catch {
    return '';
  }
}

export function decodeF0(text: string | null | undefined): Float32Array | null {
  if (!text) return null;
  try {
    const compressed = base64ToBytes(text);
    const raw = pako.ungzip(compressed);
    return parseF0(raw);
  } catch {
    return null;
  }
}

export function framesForDuration(duration: number): number {
  return Math.max(0, Math.round(duration * F0_RATE));
}

export function resampleF0(f0: Float32Array | null, newLength: number): Float32Array | null {
  if (!f0) return null;
  if (newLength <= 0) return new Float32Array(0);
  if (f0.length === newLength) return f0.slice();
  const out = new Float32Array(newLength);
  if (f0.length === 0) return out;
  for (let i = 0; i < newLength; i++) {
    const src = (i / Math.max(1, newLength - 1)) * (f0.length - 1);
    const i0 = Math.floor(src);
    const i1 = Math.min(f0.length - 1, i0 + 1);
    const frac = src - i0;
    const a = f0[i0];
    const b = f0[i1];
    // Do not interpolate across voiced/unvoiced boundaries.
    out[i] = a > 0 && b > 0 ? a + (b - a) * frac : a;
  }
  return out;
}

export function warpF0ByTiming(
  f0: Float32Array | null,
  oldTiming: Phoneme[] | null,
  newTiming: Phoneme[] | null,
): Float32Array | null {
  if (!f0) return null;
  if (!oldTiming || !newTiming || oldTiming.length !== newTiming.length || !oldTiming.length) {
    return f0.slice();
  }
  const oldBounds = [oldTiming[0].start, ...oldTiming.map((p) => p.end)];
  const newBounds = [newTiming[0].start, ...newTiming.map((p) => p.end)];
  const outLen = Math.max(1, Math.round((newBounds[newBounds.length - 1] - newBounds[0]) * F0_RATE));
  const out = new Float32Array(outLen);
  const oldLen = f0.length;
  const mapTime = (t: number): number => {
    let i = 0;
    while (i < newBounds.length - 1 && t > newBounds[i + 1]) i++;
    const ns = newBounds[i];
    const ne = newBounds[i + 1] ?? ns;
    const os = oldBounds[i];
    const oe = oldBounds[i + 1] ?? os;
    if (ne <= ns + 1e-9) return os;
    return os + ((t - ns) / (ne - ns)) * (oe - os);
  };
  for (let i = 0; i < outLen; i++) {
    const t = newBounds[0] + i / F0_RATE;
    const src = mapTime(t) * F0_RATE;
    const i0 = clamp(Math.floor(src), 0, oldLen - 1);
    const i1 = clamp(i0 + 1, 0, oldLen - 1);
    const frac = clamp(src - i0, 0, 1);
    const a = f0[i0];
    const b = f0[i1];
    out[i] = a > 0 && b > 0 ? a + (b - a) * frac : a;
  }
  return out;
}

export function smoothF0(
  f0: Float32Array,
  startFrame: number,
  endFrame: number,
  strength = 0.5,
): Float32Array {
  const out = f0.slice();
  const s = clamp(Math.floor(startFrame), 0, out.length);
  const e = clamp(Math.ceil(endFrame), 0, out.length);
  const radius = Math.max(1, Math.round(1 + strength * 8));
  for (let i = s; i < e; i++) {
    if (f0[i] <= 0) continue;
    let sum = 0;
    let weight = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= out.length || f0[j] <= 0) continue;
      const w = radius + 1 - Math.abs(k);
      sum += f0[j] * w;
      weight += w;
    }
    if (weight > 0) out[i] = out[i] * (1 - strength) + (sum / weight) * strength;
  }
  return out;
}

export function transposeF0(
  f0: Float32Array,
  semitones: number,
  startFrame = 0,
  endFrame = f0.length,
): Float32Array {
  const out = f0.slice();
  const factor = 2 ** (semitones / 12);
  const s = clamp(Math.floor(startFrame), 0, out.length);
  const e = clamp(Math.ceil(endFrame), 0, out.length);
  for (let i = s; i < e; i++) if (out[i] > 0) out[i] *= factor;
  return out;
}

export interface VibratoOptions {
  startSec: number;
  endSec: number;
  rateHz: number;
  depthCents: number;
  fadeSec: number;
  phase?: number;
}

export function applyVibrato(f0: Float32Array, opts: VibratoOptions): Float32Array {
  const out = f0.slice();
  const s = Math.max(0, Math.floor(opts.startSec * F0_RATE));
  const e = Math.min(out.length, Math.ceil(opts.endSec * F0_RATE));
  const fade = Math.max(0.005, opts.fadeSec);
  const phase = opts.phase ?? 0;
  for (let i = s; i < e; i++) {
    if (out[i] <= 0) continue;
    const t = i / F0_RATE;
    const env = Math.min(1, (t - opts.startSec) / fade, (opts.endSec - t) / fade);
    if (env <= 0) continue;
    const cents = Math.sin(2 * Math.PI * opts.rateHz * (t - opts.startSec) + phase) * opts.depthCents * env;
    out[i] *= 2 ** (cents / 1200);
  }
  return out;
}

export function setF0AtTime(
  f0: Float32Array,
  timeSec: number,
  midi: number,
  widthSec = 0,
): Float32Array {
  const out = f0.slice();
  const center = Math.round(timeSec * F0_RATE);
  const half = Math.max(0, Math.round((widthSec * F0_RATE) / 2));
  const freq = midiToFreq(midi);
  for (let i = center - half; i <= center + half; i++) {
    if (i >= 0 && i < out.length) out[i] = freq;
  }
  return out;
}

export function f0AtTime(f0: Float32Array | null, timeSec: number): number {
  if (!f0 || !f0.length) return 0;
  const i = clamp(Math.round(timeSec * F0_RATE), 0, f0.length - 1);
  return f0[i] || 0;
}

export function f0ToMidi(freq: number): number {
  return freqToMidi(freq);
}

export function voicedRanges(f0: Float32Array): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let i = 0; i < f0.length; i++) {
    if (f0[i] > 0 && start < 0) start = i;
    if ((f0[i] <= 0 || i === f0.length - 1) && start >= 0) {
      const end = f0[i] > 0 ? i + 1 : i;
      ranges.push({ start: start / F0_RATE, end: end / F0_RATE });
      start = -1;
    }
  }
  return ranges;
}

export function f0Stats(f0: Float32Array | null): { min: number; max: number; voiced: number } {
  if (!f0 || !f0.length) return { min: 0, max: 0, voiced: 0 };
  let min = Infinity;
  let max = 0;
  let voiced = 0;
  for (const v of f0) {
    if (v > 0) {
      voiced++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min: Number.isFinite(min) ? min : 0, max, voiced };
}

export function noteNameAtFreq(freq: number): { midi: number; cents: number; name: string } {
  if (freq <= 0) return { midi: 0, cents: 0, name: '' };
  const midi = freqToMidi(freq);
  const rounded = Math.round(midi);
  return {
    midi,
    cents: Math.round((midi - rounded) * 100),
    name: `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`,
  };
}
