import type { Phoneme, TimingData } from './types';
import { hashString } from './time';

const UNITS = 10_000_000;

export function parseTimingText(text: string, scoreHash = ''): TimingData | null {
  if (!text || !text.trim()) return null;
  const phonemes: Phoneme[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const p = parts.slice(2).join(' ');
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    phonemes.push({ start: a / UNITS, end: b / UNITS, phoneme: p });
  }
  if (!phonemes.length) return null;
  return {
    phonemes,
    text: serializeTiming(phonemes),
    edited: false,
    scoreHash,
  };
}

export function serializeTiming(phonemes: Phoneme[]): string {
  return phonemes
    .map((p) => `${Math.round(p.start * UNITS)} ${Math.round(p.end * UNITS)} ${p.phoneme}`)
    .join('\n');
}

export function timingDuration(phonemes: Phoneme[]): number {
  if (!phonemes.length) return 0;
  return phonemes[phonemes.length - 1].end;
}

export function timingHash(text: string): string {
  return hashString(text);
}

export interface TimingDirtyWindow {
  startFrame: number;
  endFrame: number;
  changedBoundaries: number;
}

/**
 * Compare two phoneme timelines and return time windows whose boundaries moved.
 * Returns null when the phoneme structure changed and a full timing render is
 * safer. Windows are in 100 fps frames.
 */
export function dirtyTimingWindows(
  base: TimingData | null,
  current: TimingData | null,
  guardSeconds = 0.05,
): TimingDirtyWindow[] | null {
  if (!base || !current) return null;
  if (base.phonemes.length !== current.phonemes.length) return null;
  for (let i = 0; i < base.phonemes.length; i++) {
    if (base.phonemes[i].phoneme !== current.phonemes[i].phoneme) return null;
  }
  const baseBoundaries = timingBoundaries(base.phonemes);
  const currentBoundaries = timingBoundaries(current.phonemes);
  if (baseBoundaries.length !== currentBoundaries.length) return null;
  const guard = Math.max(0, guardSeconds);
  const raw: Array<{ start: number; end: number; changed: number }> = [];
  for (let i = 0; i < baseBoundaries.length; i++) {
    const a = baseBoundaries[i];
    const b = currentBoundaries[i];
    if (Math.abs(a - b) < 0.0005) continue;
    raw.push({ start: Math.min(a, b), end: Math.max(a, b), changed: 1 });
  }
  if (!raw.length) return [];
  raw.sort((a, b) => a.start - b.start);
  const merged: typeof raw = [];
  for (const item of raw) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end + guard) {
      last.end = Math.max(last.end, item.end);
      last.changed += item.changed;
    } else {
      merged.push({ ...item });
    }
  }
  return merged.map((item) => ({
    startFrame: Math.max(0, Math.round((item.start - guard) * 100)),
    endFrame: Math.max(1, Math.round((item.end + guard) * 100)),
    changedBoundaries: item.changed,
  }));
}

export function timingBoundaries(phonemes: Phoneme[]): number[] {
  if (!phonemes.length) return [];
  return [phonemes[0].start, ...phonemes.map((p) => p.end)];
}

export function phonemeAtTime(phonemes: Phoneme[], time: number): number {
  if (!phonemes.length) return -1;
  for (let i = 0; i < phonemes.length; i++) {
    if (time >= phonemes[i].start && time < phonemes[i].end) return i;
  }
  return time < phonemes[0].start ? 0 : phonemes.length - 1;
}

export function updateBoundary(
  phonemes: Phoneme[],
  boundaryIndex: number,
  newTime: number,
  minDuration = 0.008,
): Phoneme[] {
  if (boundaryIndex <= 0 || boundaryIndex >= phonemes.length) return phonemes;
  const prev = phonemes[boundaryIndex - 1];
  const next = phonemes[boundaryIndex];
  const min = prev.start + minDuration;
  const max = next.end - minDuration;
  const t = Math.min(max, Math.max(min, newTime));
  const out = phonemes.map((p) => ({ ...p }));
  out[boundaryIndex - 1].end = t;
  out[boundaryIndex].start = t;
  return out;
}

export function normalizeTiming(phonemes: Phoneme[]): Phoneme[] {
  if (!phonemes.length) return [];
  const out: Phoneme[] = [];
  let cursor = phonemes[0].start;
  for (const p of phonemes) {
    const start = cursor;
    const end = Math.max(start + 0.001, p.end);
    out.push({ ...p, start, end });
    cursor = end;
  }
  return out;
}

export function timingPhonemeStats(phonemes: Phoneme[]): { count: number; duration: number; voiced: number } {
  const vowels = new Set(['a', 'i', 'u', 'e', 'o', 'N', 'n']);
  let voiced = 0;
  for (const p of phonemes) if (vowels.has(p.phoneme)) voiced++;
  return { count: phonemes.length, duration: timingDuration(phonemes), voiced };
}
