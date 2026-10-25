import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirtyFrameCount, dirtyPhraseIndices, dirtyPhraseRanges, f0Changed } from '../src/lib/phrases';
import type { PhraseInfo } from '../src/lib/types';

const require = createRequire(import.meta.url);
const { parsePhraseList } = require('../electron/lib/phrases.cjs');
const { parseWav, splicePhraseWav } = require('../electron/lib/wav.cjs');

function makeWav16(samples: number[], sampleRate = 48000): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32768))), 44 + i * 2));
  return buf;
}

describe('phrase lists', () => {
  it('parses NEUTRINO phrase rows and derives exclusive frame ranges', () => {
    const text = [
      '0 0 0 pau',
      '1 2333 1 h a, r u, g a',
      '2 7158 1 d o, k o',
      '3 11400 0 pau',
      '4 11973 1 y a',
    ].join('\n');
    const phrases = parsePhraseList(text, 2160);
    expect(phrases).toHaveLength(5);
    expect(phrases[1]).toMatchObject({ index: 1, startFrame: 233, endFrame: 716, sung: true });
    expect(phrases[2]).toMatchObject({ index: 2, startFrame: 716, endFrame: 1140, sung: true });
    expect(phrases[4]).toMatchObject({ index: 4, startFrame: 1197, endFrame: 2160, sung: true });
    expect(phrases[3].sung).toBe(false);
  });

  it('marks only phrases containing changed F0 frames', () => {
    const phrases: PhraseInfo[] = [
      { index: 1, startFrame: 0, endFrame: 100, sung: true },
      { index: 2, startFrame: 100, endFrame: 200, sung: true },
      { index: 3, startFrame: 200, endFrame: 300, sung: false },
    ];
    const previous = new Float32Array(300).fill(220);
    const current = previous.slice();
    current[150] = 240;
    expect(dirtyPhraseIndices(phrases, previous, current)).toEqual([2]);
    expect(dirtyFrameCount(phrases, previous, current, [2])).toBe(100);
    current[10] = 221;
    expect(dirtyPhraseIndices(phrases, previous, current)).toEqual([1, 2]);
  });

  it('returns only the changed frame window with a context guard', () => {
    const phrases: PhraseInfo[] = [
      { index: 1, startFrame: 100, endFrame: 200, sung: true },
      { index: 2, startFrame: 200, endFrame: 300, sung: true },
    ];
    const previous = new Float32Array(300).fill(220);
    const current = previous.slice();
    current[150] = 240;
    current[152] = 240;
    const ranges = dirtyPhraseRanges(phrases, previous, current);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      index: 1,
      firstDirtyFrame: 150,
      lastDirtyFrame: 152,
      startFrame: 145,
      endFrame: 158,
      changedFrames: 2,
    });
  });

  it('keeps widely separated edits as separate dirty windows', () => {
    const phrases: PhraseInfo[] = [{ index: 1, startFrame: 0, endFrame: 300, sung: true }];
    const previous = new Float32Array(300).fill(220);
    const current = previous.slice();
    current[50] = 240;
    current[150] = 240;
    const ranges = dirtyPhraseRanges(phrases, previous, current);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toMatchObject({ startFrame: 45, endFrame: 56 });
    expect(ranges[1]).toMatchObject({ startFrame: 145, endFrame: 156 });
    expect(dirtyPhraseIndices(phrases, previous, current)).toEqual([1]);
  });

  it('handles empty, mismatched, silent and boundary-clamped input', () => {
    expect(dirtyPhraseRanges([], new Float32Array(0), new Float32Array(0))).toEqual([]);
    expect(dirtyPhraseRanges([{ index: 1, startFrame: 0, endFrame: 10, sung: true }], new Float32Array(5), new Float32Array(6))).toEqual([]);
    const silent: PhraseInfo = { index: 1, startFrame: 0, endFrame: 10, sung: false };
    expect(dirtyPhraseRanges([silent], new Float32Array(10), new Float32Array(10).fill(220))).toEqual([]);
    const phrases: PhraseInfo[] = [{ index: 1, startFrame: 5, endFrame: 10, sung: true }];
    const previous = new Float32Array(10);
    const current = new Float32Array(10);
    current[9] = 220;
    const range = dirtyPhraseRanges(phrases, previous, current)[0];
    expect(range.startFrame).toBe(5);
    expect(range.endFrame).toBe(10);
    expect(range.changedFrames).toBe(1);
  });

  it('detects F0 differences while ignoring sub-threshold jitter', () => {
    const a = new Float32Array([0, 220, 440]);
    expect(f0Changed(a, a.slice())).toBe(false);
    const jitter = a.slice();
    jitter[1] += 0.01;
    expect(f0Changed(a, jitter)).toBe(false);
    const changed = a.slice();
    changed[2] = 441;
    expect(f0Changed(a, changed)).toBe(true);
    const voiced = a.slice();
    voiced[1] = 0;
    expect(f0Changed(a, voiced)).toBe(true);
    expect(f0Changed(a, new Float32Array(2))).toBe(true);
  });
});

describe('phrase WAV splicing', () => {
  it('replaces a phrase region with optional crossfade', () => {
    const base = makeWav16(new Array(48000).fill(0));
    const phrase = makeWav16(new Array(4800).fill(0.5));
    const replaced = splicePhraseWav(base, [{ startFrame: 20, endFrame: 30, buffer: phrase }], {
      crossfadeMs: 0,
    });
    const parsed = parseWav(replaced);
    expect(parsed.frames).toBe(48000);
    const sampleAt = (i: number) => replaced.readInt16LE(parsed.dataOffset + i * 2) / 32768;
    expect(sampleAt(9600)).toBeCloseTo(0.5, 2);
    expect(sampleAt(14000)).toBeCloseTo(0.5, 2);
    expect(sampleAt(50)).toBeCloseTo(0, 5);
  });

  it('replaces only a sub-window from a larger phrase render', () => {
    const base = makeWav16(new Array(48000).fill(0));
    const phrase = makeWav16(new Array(4800).fill(0.9));
    const replaced = splicePhraseWav(
      base,
      [{
        startFrame: 20,
        endFrame: 21,
        sourceStartFrame: 2,
        sourceEndFrame: 3,
        buffer: phrase,
      }],
      { crossfadeMs: 0 },
    );
    const parsed = parseWav(replaced);
    const sampleAt = (i: number) => replaced.readInt16LE(parsed.dataOffset + i * 2) / 32768;
    expect(sampleAt(9599)).toBeCloseTo(0, 5);
    expect(sampleAt(9600)).toBeCloseTo(0.9, 2);
    expect(sampleAt(10079)).toBeCloseTo(0.9, 2);
    expect(sampleAt(10080)).toBeCloseTo(0, 5);
  });

  it('splices multiple sub-windows from one rendered phrase', () => {
    const base = makeWav16(new Array(48000).fill(0));
    const phrase = makeWav16(new Array(4800).fill(0.7));
    const replaced = splicePhraseWav(
      base,
      [
        { startFrame: 20, endFrame: 21, sourceStartFrame: 2, sourceEndFrame: 3, buffer: phrase },
        { startFrame: 30, endFrame: 31, sourceStartFrame: 4, sourceEndFrame: 5, buffer: phrase },
      ],
      { crossfadeMs: 0 },
    );
    const parsed = parseWav(replaced);
    const sampleAt = (i: number) => replaced.readInt16LE(parsed.dataOffset + i * 2) / 32768;
    expect(sampleAt(9599)).toBeCloseTo(0, 5);
    expect(sampleAt(9600)).toBeCloseTo(0.7, 2);
    expect(sampleAt(10079)).toBeCloseTo(0.7, 2);
    expect(sampleAt(10080)).toBeCloseTo(0, 5);
    expect(sampleAt(14399)).toBeCloseTo(0, 5);
    expect(sampleAt(14400)).toBeCloseTo(0.7, 2);
  });

  it('limits a short source window without corrupting the base', () => {
    const base = makeWav16(new Array(48000).fill(0));
    const phrase = makeWav16(new Array(4800).fill(0.6));
    const replaced = splicePhraseWav(
      base,
      [{ startFrame: 20, endFrame: 30, sourceStartFrame: 9, sourceEndFrame: 10, buffer: phrase }],
      { crossfadeMs: 0 },
    );
    const parsed = parseWav(replaced);
    const sampleAt = (i: number) => replaced.readInt16LE(parsed.dataOffset + i * 2) / 32768;
    expect(sampleAt(9600)).toBeCloseTo(0.6, 2);
    expect(sampleAt(9600 + 479)).toBeCloseTo(0.6, 2);
    expect(sampleAt(9600 + 480)).toBeCloseTo(0, 5);
  });

  it('splices full-song timing windows and preserves everything else', () => {
    const base = makeWav16(new Array(96000).fill(0));
    const next = makeWav16(new Array(96000).fill(0.5));
    const replaced = splicePhraseWav(
      base,
      [
        { startFrame: 50, endFrame: 55, sourceStartFrame: 50, sourceEndFrame: 55, buffer: next },
        { startFrame: 100, endFrame: 105, sourceStartFrame: 100, sourceEndFrame: 105, buffer: next },
      ],
      { crossfadeMs: 0 },
    );
    const parsed = parseWav(replaced);
    const sampleAt = (i: number) => replaced.readInt16LE(parsed.dataOffset + i * 2) / 32768;
    expect(sampleAt(23999)).toBeCloseTo(0, 5);
    expect(sampleAt(24000)).toBeCloseTo(0.5, 2);
    expect(sampleAt(26399)).toBeCloseTo(0.5, 2);
    expect(sampleAt(26400)).toBeCloseTo(0, 5);
    expect(sampleAt(47999)).toBeCloseTo(0, 5);
    expect(sampleAt(48000)).toBeCloseTo(0.5, 2);
    expect(sampleAt(50399)).toBeCloseTo(0.5, 2);
    expect(sampleAt(50400)).toBeCloseTo(0, 5);
  });

  it('rejects a phrase WAV with a different format', () => {
    const base = makeWav16(new Array(4800).fill(0));
    const phrase = makeWav16(new Array(480).fill(0.5), 44100);
    expect(() => splicePhraseWav(base, [{ startFrame: 20, endFrame: 21, buffer: phrase }])).toThrow(/format/i);
  });

  it('fades the phrase boundaries into the existing take', () => {
    const base = makeWav16(new Array(48000).fill(0));
    const phrase = makeWav16(new Array(4800).fill(0.8));
    const replaced = splicePhraseWav(base, [{ startFrame: 20, endFrame: 30, buffer: phrase }], {
      crossfadeMs: 20,
    });
    const parsed = parseWav(replaced);
    const sampleAt = (i: number) => replaced.readInt16LE(parsed.dataOffset + i * 2) / 32768;
    expect(sampleAt(9600)).toBeCloseTo(0, 2);
    expect(sampleAt(12000)).toBeCloseTo(0.8, 2);
    expect(sampleAt(14390)).toBeLessThan(0.2);
  });
});
