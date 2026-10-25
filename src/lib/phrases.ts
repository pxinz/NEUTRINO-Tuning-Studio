import type { PhraseInfo } from './types';

const EPSILON_HZ = 0.25;
const DIRTY_GUARD_FRAMES = 5;
const DIRTY_MERGE_GAP_FRAMES = DIRTY_GUARD_FRAMES * 2 + 1;

export interface DirtyPhraseRange {
  index: number;
  /** Inclusive first changed frame. */
  firstDirtyFrame: number;
  /** Inclusive last changed frame. */
  lastDirtyFrame: number;
  /** Time window to replace, including a short context guard. */
  startFrame: number;
  endFrame: number;
  changedFrames: number;
}

function frameChanged(a: number, b: number): boolean {
  if (a === b) return false;
  if (a <= 0 || b <= 0) return true;
  return Math.abs(a - b) > Math.max(EPSILON_HZ, Math.max(a, b) * 0.001);
}

export function f0Changed(previousF0: Float32Array, currentF0: Float32Array): boolean {
  if (previousF0.length !== currentF0.length) return true;
  for (let i = 0; i < previousF0.length; i++) {
    if (frameChanged(previousF0[i], currentF0[i])) return true;
  }
  return false;
}

export function dirtyPhraseRanges(
  phrases: PhraseInfo[],
  previousF0: Float32Array,
  currentF0: Float32Array,
): DirtyPhraseRange[] {
  if (previousF0.length !== currentF0.length) return [];
  const ranges: DirtyPhraseRange[] = [];
  for (const phrase of phrases) {
    if (!phrase.sung) continue;
    const start = Math.max(0, Math.min(previousF0.length, phrase.startFrame));
    const end = Math.max(start, Math.min(previousF0.length, phrase.endFrame));
    let first = -1;
    let last = -1;
    let changedFrames = 0;
    const flush = () => {
      if (first < 0) return;
      ranges.push({
        index: phrase.index,
        firstDirtyFrame: first,
        lastDirtyFrame: last,
        startFrame: Math.max(phrase.startFrame, first - DIRTY_GUARD_FRAMES),
        endFrame: Math.min(phrase.endFrame, last + 1 + DIRTY_GUARD_FRAMES),
        changedFrames,
      });
      first = -1;
      last = -1;
      changedFrames = 0;
    };
    for (let i = start; i < end; i++) {
      if (!frameChanged(previousF0[i], currentF0[i])) continue;
      if (first >= 0 && i - last > DIRTY_MERGE_GAP_FRAMES) flush();
      if (first < 0) first = i;
      last = i;
      changedFrames++;
    }
    flush();
  }
  return ranges;
}

/**
 * Return the phrase indices whose current F0 differs from the last rendered
 * full take. Only sung rows are candidates. This intentionally ignores pitch
 * differences below a tiny threshold so a click on the canvas does not force a
 * re-render of an unchanged phrase.
 */
export function dirtyPhraseIndices(
  phrases: PhraseInfo[],
  previousF0: Float32Array,
  currentF0: Float32Array,
): number[] {
  return [...new Set(dirtyPhraseRanges(phrases, previousF0, currentF0).map((range) => range.index))];
}

export function dirtyFrameCount(
  phrases: PhraseInfo[],
  previousF0: Float32Array,
  currentF0: Float32Array,
  indices: number[],
): number {
  const set = new Set(indices);
  let count = 0;
  for (const phrase of phrases) {
    if (!set.has(phrase.index)) continue;
    count += Math.max(0, phrase.endFrame - phrase.startFrame);
  }
  return count;
}
