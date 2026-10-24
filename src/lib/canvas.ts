import type { Score, WaveformPeaks } from './types';
import { beatToSeconds, getBarLines, timeSignatureAt } from './score';
import { midiToName } from './time';

export function cssVar(name: string, fallback = '#fff'): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export interface GridOptions {
  score: Score;
  pxPerSec: number;
  scrollSec: number;
  width: number;
  height: number;
  pitchTop?: number;
  pitchBottom?: number;
  rowHeight?: number;
  showRows?: boolean;
  rowOffset?: number;
}

export function drawTimelineGrid(ctx: CanvasRenderingContext2D, opts: GridOptions) {
  const { width, height, score, pxPerSec, scrollSec } = opts;
  const bg = cssVar('--grid-bg', '#0d1119');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  if (opts.showRows && opts.pitchTop !== undefined && opts.pitchBottom !== undefined && opts.rowHeight) {
    const rowH = opts.rowHeight;
    const offset = opts.rowOffset || 0;
    for (let midi = opts.pitchTop; midi >= opts.pitchBottom; midi--) {
      const y = offset + (opts.pitchTop - midi) * rowH;
      const pc = ((midi % 12) + 12) % 12;
      const black = [1, 3, 6, 8, 10].includes(pc);
      if (black) {
        ctx.fillStyle = cssVar('--grid-row-black', 'rgba(255,255,255,0.022)');
        ctx.fillRect(0, y, width, rowH);
      }
      if (pc === 0) {
        ctx.strokeStyle = cssVar('--grid-octave', 'rgba(255,255,255,0.09)');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
        ctx.stroke();
      } else {
        ctx.strokeStyle = cssVar('--grid-row', 'rgba(255,255,255,0.035)');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
        ctx.stroke();
      }
    }
  }

  const end = Math.max(score.notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0) + 8, 8);
  const lines = getBarLines(score, end);
  const beatColor = cssVar('--grid-beat', 'rgba(255,255,255,0.04)');
  const barColor = cssVar('--grid-bar', 'rgba(255,255,255,0.12)');
  for (const line of lines) {
    const x = (line.time - scrollSec) * pxPerSec;
    if (x < -2 || x > width + 2) continue;
    ctx.strokeStyle = line.measureStart ? barColor : beatColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }
}

export function drawRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  score: Score,
  pxPerSec: number,
  scrollSec: number,
) {
  const bg = cssVar('--ruler-bg', '#10141d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const lines = getBarLines(score, Math.max(score.notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0) + 8, 8));
  const text = cssVar('--text-muted', '#8892a6');
  const accent = cssVar('--text-secondary', '#b7c0d0');
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';
  let lastLabelX = -999;
  for (const line of lines) {
    const x = (line.time - scrollSec) * pxPerSec;
    if (x < -40 || x > width + 40) continue;
    if (line.measureStart) {
      ctx.strokeStyle = cssVar('--grid-bar', 'rgba(255,255,255,0.14)');
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, height * 0.35);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
      if (x - lastLabelX > 46) {
        ctx.fillStyle = accent;
        ctx.fillText(String(line.index + 1), x + 5, height * 0.45);
        lastLabelX = x;
      }
    } else {
      ctx.strokeStyle = cssVar('--grid-beat', 'rgba(255,255,255,0.05)');
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, height * 0.72);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    }
  }
  // Time labels every ~80 px.
  const stepSec = Math.max(0.5, Math.round((80 / pxPerSec) * 2) / 2);
  ctx.fillStyle = text;
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  for (let t = Math.ceil(scrollSec / stepSec) * stepSec; t < scrollSec + width / pxPerSec; t += stepSec) {
    const x = (t - scrollSec) * pxPerSec;
    ctx.fillText(`${t.toFixed(t < 10 ? 1 : 0)}s`, x + 3, height * 0.9);
  }
  ctx.strokeStyle = cssVar('--border', 'rgba(255,255,255,0.08)');
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();
}

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaks: WaveformPeaks | null,
  duration: number,
  pxPerSec: number,
  scrollSec: number,
  color: string,
  referencePeaks?: WaveformPeaks | null,
  referenceColor?: string,
  referenceDuration?: number,
  referenceOffset?: number,
) {
  ctx.fillStyle = cssVar('--wave-bg', '#0b0f17');
  ctx.fillRect(0, 0, width, height);
  const mid = height / 2;
  ctx.strokeStyle = cssVar('--grid-row', 'rgba(255,255,255,0.04)');
  ctx.beginPath();
  ctx.moveTo(0, mid + 0.5);
  ctx.lineTo(width, mid + 0.5);
  ctx.stroke();

  const drawPeaks = (
    p: WaveformPeaks,
    dur: number,
    offset: number,
    stroke: string,
    alpha: number,
  ) => {
    if (!p.length || dur <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
      const t = scrollSec + x / pxPerSec - offset;
      if (t < 0 || t > dur) continue;
      const idx = Math.floor((t / dur) * p.length);
      const lo = p.min[Math.max(0, Math.min(p.length - 1, idx))];
      const hi = p.max[Math.max(0, Math.min(p.length - 1, idx))];
      ctx.moveTo(x + 0.5, mid - hi * (height * 0.45));
      ctx.lineTo(x + 0.5, mid - lo * (height * 0.45));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  if (referencePeaks && referenceDuration) {
    drawPeaks(referencePeaks, referenceDuration, referenceOffset || 0, referenceColor || '#818cf8', 0.22);
  }
  if (peaks) drawPeaks(peaks, duration, 0, color, 0.9);
  ctx.strokeStyle = cssVar('--border', 'rgba(255,255,255,0.07)');
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();
}

export function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  x: number,
  color?: string,
) {
  if (x < -2 || x > width + 2) return;
  const c = color || cssVar('--accent', '#5eead4');
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x - 4, 0);
  ctx.lineTo(x + 4, 0);
  ctx.lineTo(x, 6);
  ctx.closePath();
  ctx.fill();
}

export function drawPianoRows(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pitchTop: number,
  pitchBottom: number,
  rowHeight: number,
) {
  for (let midi = pitchTop; midi >= pitchBottom; midi--) {
    const y = (pitchTop - midi) * rowHeight;
    const pc = ((midi % 12) + 12) % 12;
    if ([1, 3, 6, 8, 10].includes(pc)) {
      ctx.fillStyle = cssVar('--piano-black', 'rgba(0,0,0,0.22)');
      ctx.fillRect(0, y, width, rowHeight);
    }
    ctx.strokeStyle = cssVar('--piano-row', 'rgba(255,255,255,0.04)');
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
    if (pc === 0) {
      ctx.fillStyle = cssVar('--text-muted', '#8a94a8');
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(midiToName(midi), 4, y + 2);
    }
  }
}

export function drawNoteLane(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  score: Score,
  pxPerSec: number,
  scrollSec: number,
  color: string,
) {
  for (const note of score.notes) {
    const start = beatToSeconds(score, note.start);
    const end = beatToSeconds(score, note.start + note.duration);
    const x = (start - scrollSec) * pxPerSec;
    const w = Math.max(2, (end - start) * pxPerSec);
    if (x + w < 0 || x > width) continue;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    drawRoundedRect(ctx, x + 1, height * 0.18, Math.max(2, w - 2), height * 0.64, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (w > 28) {
      ctx.fillStyle = cssVar('--text-primary', '#e8ecf4');
      ctx.font = '10px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(note.lyric || '', x + 5, height / 2);
    }
  }
}

export function timeSignatureLabel(score: Score, beat: number): string {
  const sig = timeSignatureAt(score, beat);
  return `${sig.numerator}/${sig.denominator}`;
}
