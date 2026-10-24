import { describe, expect, it } from 'vitest';
import { createDemoScore, getScoreHash, normalizeScore, scoreEndBeat, secondsToBeat, beatToSeconds } from '../src/lib/score';
import { exportMusicXml, importMusicXml } from '../src/lib/musicxml';
import { decodeF0, encodeF0, parseF0, transposeF0, warpF0ByTiming } from '../src/lib/pitch';
import { parseTimingText, serializeTiming, updateBoundary } from '../src/lib/timing';
import { gainAt, normalizeDynamics } from '../src/lib/dynamics';

describe('score and MusicXML', () => {
  it('exports a vocal score with lyrics and breath marks, then re-imports it', () => {
    const score = createDemoScore();
    const xml = exportMusicXml(score);
    expect(xml).toContain('<score-partwise');
    expect((xml.match(/<text>/g) || []).length).toBeGreaterThanOrEqual(score.notes.length - 1);
    const imported = importMusicXml(xml);
    expect(imported.score.notes.length).toBe(score.notes.length);
    expect(imported.score.notes.filter((n) => n.breath).length).toBe(
      score.notes.filter((n) => n.breath).length,
    );
    expect(imported.score.notes.map((n) => n.lyric).join('')).toContain('は');
    expect(imported.warnings.join(' ')).not.toContain('overlapping');
  });

  it('adds a tiny lead-in rest so musicXMLtoLabel does not shift the song by a bar', () => {
    const score = createDemoScore();
    const xml = exportMusicXml(score);
    const firstMeasure = xml.split(/<measure number="2">/)[0];
    expect(firstMeasure).toContain('<rest/>');
    expect(firstMeasure.indexOf('<rest/>')).toBeLessThan(firstMeasure.indexOf('<lyric'));
    expect(firstMeasure).toContain('<duration>1</duration>');
  });

  it('round-trips beat/time conversion across tempo changes', () => {
    const score = normalizeScore({
      ...createDemoScore(),
      tempos: [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 90 },
      ],
    });
    for (const beat of [0, 1.5, 4, 7.25, 10]) {
      expect(Math.abs(secondsToBeat(score, beatToSeconds(score, beat)) - beat)).toBeLessThan(1e-5);
    }
    expect(scoreEndBeat(score)).toBeGreaterThan(0);
  });

  it('produces a stable score hash for unchanged content', () => {
    const score = createDemoScore();
    expect(getScoreHash(score)).toBe(getScoreHash(createDemoScore()));
    const edited = { ...score, notes: score.notes.map((n, i) => (i === 0 ? { ...n, lyric: 'ほ' } : n)) };
    expect(getScoreHash(edited)).not.toBe(getScoreHash(score));
  });
});

describe('timing labels', () => {
  it('parses and serialises 100 ns timing units', () => {
    const text = '0 23330000 pau\n23330000 24000000 h\n24000000 30000000 a\n';
    const timing = parseTimingText(text);
    expect(timing).not.toBeNull();
    expect(timing!.phonemes).toHaveLength(3);
    expect(timing!.phonemes[1].start).toBeCloseTo(2.333);
    const round = parseTimingText(serializeTiming(timing!.phonemes));
    expect(round!.phonemes[2].end).toBeCloseTo(3.0);
  });

  it('moves a boundary without creating a gap', () => {
    const timing = parseTimingText('0 10000000 a\n10000000 20000000 b\n20000000 30000000 c\n')!;
    const moved = updateBoundary(timing.phonemes, 1, 1.2);
    expect(moved[0].end).toBeCloseTo(1.2);
    expect(moved[1].start).toBeCloseTo(1.2);
    expect(moved[1].end).toBeCloseTo(2.0);
  });
});

describe('F0 data', () => {
  it('compresses and restores a float32 curve', () => {
    const f0 = new Float32Array([0, 220, 0, 440.5, 220.25, 0]);
    const encoded = encodeF0(f0);
    expect(encoded.length).toBeGreaterThan(8);
    const decoded = decodeF0(encoded);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!)).toEqual(Array.from(f0));
  });

  it('parses little-endian float data and transposes voiced frames', () => {
    const f0 = new Float32Array([100, 0, 200]);
    const bytes = new Uint8Array(f0.buffer.slice(0));
    const parsed = parseF0(bytes);
    expect(Array.from(parsed)).toEqual([100, 0, 200]);
    const up = transposeF0(parsed, 12);
    expect(up[0]).toBeCloseTo(200);
    expect(up[1]).toBe(0);
    expect(up[2]).toBeCloseTo(400);
  });

  it('warps a pitch curve across equal-length timing edits', () => {
    const f0 = new Float32Array(Array.from({ length: 100 }, (_, i) => (i < 50 ? 200 : 300)));
    const oldTiming = parseTimingText('0 5000000 a\n5000000 10000000 b\n')!;
    const newTiming = updateBoundary(oldTiming.phonemes, 1, 0.7);
    const warped = warpF0ByTiming(f0, oldTiming.phonemes, newTiming);
    expect(warped).not.toBeNull();
    expect(warped!.length).toBeGreaterThan(0);
  });
});

describe('dynamics', () => {
  it('interpolates dB points and clamps the range', () => {
    const dynamics = normalizeDynamics(
      { enabled: true, points: [{ time: 0, db: 0 }, { time: 1, db: -6 }, { time: 2, db: 0 }] },
      2,
    );
    expect(gainAt(dynamics.points, 0)).toBeCloseTo(1);
    expect(gainAt(dynamics.points, 1)).toBeCloseTo(10 ** (-6 / 20));
    expect(gainAt(dynamics.points, 2)).toBeCloseTo(1);
  });
});
