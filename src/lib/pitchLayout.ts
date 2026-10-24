import { clamp } from './time';

export const PITCH_ROW_HEIGHT = 24;

export interface PitchLayout {
  rowHeight: number;
  rowOffset: number;
  rowsHeight: number;
  contentHeight: number;
  maxScroll: number;
  scroll: number;
  span: number;
}

/**
 * Fixed-height piano-roll rows. The roll scrolls vertically instead of
 * squashing notes when the editor (or log drawer) changes height.
 */
export function computePitchLayout(
  top: number,
  bottom: number,
  height: number,
  scroll = 0,
): PitchLayout {
  const span = Math.max(1, Math.round(top) - Math.round(bottom) + 1);
  const rowHeight = PITCH_ROW_HEIGHT;
  const rowsHeight = span * rowHeight;
  const maxScroll = Math.max(0, rowsHeight - height);
  const boundedScroll = clamp(scroll, 0, maxScroll);
  const centeredOffset = Math.max(0, (height - rowsHeight) / 2);
  const rowOffset = centeredOffset - boundedScroll;
  return {
    rowHeight,
    rowOffset,
    rowsHeight,
    contentHeight: rowsHeight,
    maxScroll,
    scroll: boundedScroll,
    span,
  };
}
