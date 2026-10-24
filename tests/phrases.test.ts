import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirtyFrameCount, dirtyPhraseIndices } from '../src/lib/phrases';
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
