import type { ReferenceTrack, Score } from './types';
import { scoreDurationSeconds } from './score';

/** End of the reference track on the project timeline, in seconds. */
export function referenceEnd(reference: ReferenceTrack | null, referenceDuration: number): number {
  if (!reference || !Number.isFinite(referenceDuration) || referenceDuration <= 0) return 0;
  return Math.max(0, reference.offset + referenceDuration);
}

/** Visible/playable end of the project timeline, including reference audio. */
export function timelineEnd(
  score: Score,
  audioDuration: number,
  reference: ReferenceTrack | null,
  referenceDuration: number,
): number {
  return Math.max(
    0,
    audioDuration,
    scoreDurationSeconds(score),
    referenceEnd(reference, referenceDuration),
  );
}
