import type { PhraseInfo } from './types';

const EPSILON_HZ = 0.25;

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
  if (previousF0.length !== currentF0.length) return [];
  const dirty: number[] = [];
  for (const phrase of phrases) {
    if (!phrase.sung) continue;
    const start = Math.max(0, Math.min(previousF0.length, phrase.startFrame));
    const end = Math.max(start, Math.min(previousF0.length, phrase.endFrame));
    let changed = false;
    for (let i = start; i < end; i++) {
      const a = previousF0[i];
      const b = currentF0[i];
      if (a === b) continue;
      if (a <= 0 || b <= 0) {
        if (a !== b) {
          changed = true;
          break;
        }
        continue;
      }
      if (Math.abs(a - b) > Math.max(EPSILON_HZ, Math.max(a, b) * 0.001)) {
        changed = true;
        break;
      }
    }
    if (changed) dirty.push(phrase.index);
  }
  return dirty;
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
