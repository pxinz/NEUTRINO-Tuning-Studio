import { describe, expect, it } from 'vitest';
import { createDemoScore } from '../src/lib/score';
import { referenceEnd, timelineEnd } from '../src/lib/timeline';
import type { ReferenceTrack } from '../src/lib/types';

function ref(offset: number): ReferenceTrack {
  return { path: '/tmp/ref.wav', name: 'ref', offset, volume: 0.8, muted: false };
}

describe('reference timeline', () => {
  it('extends the timeline to a positive reference offset', () => {
    expect(referenceEnd(ref(2), 10)).toBe(12);
    expect(timelineEnd(createDemoScore(), 5, ref(2), 10)).toBeGreaterThanOrEqual(12);
  });

  it('supports negative offsets and truncates audio before project zero', () => {
    expect(referenceEnd(ref(-2), 10)).toBe(8);
    expect(referenceEnd(ref(-10), 5)).toBe(0);
    expect(timelineEnd(createDemoScore(), 3, ref(-2), 10)).toBeGreaterThanOrEqual(8);
  });

  it('falls back to vocal or score duration without a reference', () => {
    const score = createDemoScore();
    const end = timelineEnd(score, 21.6, null, 0);
    expect(end).toBeGreaterThanOrEqual(21.6);
    expect(referenceEnd(null, 10)).toBe(0);
  });
});
