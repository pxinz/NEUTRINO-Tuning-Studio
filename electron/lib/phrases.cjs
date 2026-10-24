'use strict';

/**
 * Parse the `-i` phrase list emitted by NEUTRINO.
 *
 * Line format:
 *   index start_ms is_phrase lyric...
 * Example:
 *   1 2333 1 h a, r u, g a
 *
 * The engine's frame resolution is 10 ms (100 fps). `endFrame` is derived from
 * the next line, including silence-only lines, because that is how `-p` slices
 * the phrase audio.
 */
function parsePhraseList(text, totalFrames) {
  const rows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\s+(\d+)\s+([01])\s*(.*)$/);
    if (!match) continue;
    const index = Number(match[1]);
    const startMs = Number(match[2]);
    if (!Number.isFinite(index) || !Number.isFinite(startMs)) continue;
    rows.push({
      index,
      startFrame: Math.round(startMs / 10),
      sung: match[3] === '1',
      lyric: match[4].trim(),
    });
  }
  rows.sort((a, b) => a.startFrame - b.startFrame);
  const frameLimit = Number.isFinite(totalFrames) && totalFrames > 0 ? totalFrames : Infinity;
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const next = rows[i + 1];
    const startFrame = Math.max(0, row.startFrame);
    const endFrame = Math.min(frameLimit, next ? next.startFrame : frameLimit);
    if (!Number.isFinite(endFrame) || endFrame <= startFrame) continue;
    out.push({
      index: row.index,
      startFrame,
      endFrame,
      sung: row.sung,
      lyric: row.lyric,
    });
  }
  return out;
}

module.exports = { parsePhraseList };
