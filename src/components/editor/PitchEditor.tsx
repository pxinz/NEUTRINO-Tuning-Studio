import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  Eraser,
  Minus,
  PenLine,
  RotateCcw,
  Sparkles,
  Spline,
  Waves,
  Wind,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../state/useAppStore';
import { useElementSize } from '../../hooks/useElementSize';
import { useTimeline } from '../../hooks/useTimeline';
import Playhead from '../timeline/Playhead';
import {
  cssVar,
  drawRoundedRect,
  drawTimelineGrid,
  fitCanvas,
} from '../../lib/canvas';
import { beatToSeconds } from '../../lib/score';
import { clamp, freqToMidi, midiToFreq, midiToName } from '../../lib/time';
import { computePitchLayout } from '../../lib/pitchLayout';
import { getPhrases } from '../../lib/score';
import { checkLyric } from '../../lib/lyrics';
import TimelineRuler from '../timeline/TimelineRuler';
import WaveformStrip from '../timeline/WaveformStrip';
import ZoomBar from '../timeline/ZoomBar';
import PitchScrollbar from '../timeline/PitchScrollbar';
import PianoKeyboard from './PianoKeyboard';
import { Button, IconButton, NumberField } from '../ui';

type PitchTool = 'pen' | 'line' | 'smooth' | 'vibrato' | 'reset';

interface Range {
  start: number;
  end: number;
}

export default function PitchEditor() {
  const { t } = useTranslation();
  const currentF0 = useAppStore((s) => s.currentF0);
  const baseF0 = useAppStore((s) => s.baseF0);
  const pitchEdited = useAppStore((s) => s.pitchEdited);
  const setCurrentF0 = useAppStore((s) => s.setCurrentF0);
  const resetPitch = useAppStore((s) => s.resetPitch);
  const resetPitchRange = useAppStore((s) => s.resetPitchRange);
  const smoothPitchRange = useAppStore((s) => s.smoothPitchRange);
  const applyVibratoRange = useAppStore((s) => s.applyVibratoRange);
  const autoTuneRange = useAppStore((s) => s.autoTuneRange);
  const transposePitch = useAppStore((s) => s.transposePitch);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const score = useAppStore((s) => s.project.score);
  const viewport = useAppStore((s) => s.viewport);
  const theme = useAppStore((s) => s.theme);
  const renderVocal = useAppStore((s) => s.renderVocal);
  const seek = useAppStore((s) => s.seek);

  const { ref: bodyRef, size: bodySize } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const timelineWidth = Math.max(0, bodySize.width - 58);
  const canvasHeight = Math.max(120, bodySize.height - 30 - 56);
  const timeline = useTimeline(timelineWidth, { verticalHeight: canvasHeight });
  const { pxPerSec, scrollSec, xToTime, attachWheel } = timeline;
  const pitchTop = viewport.pitchTop;
  const pitchBottom = viewport.pitchBottom;
  const pitchLayout = computePitchLayout(pitchTop, pitchBottom, canvasHeight, timeline.pitchScroll);
  const rowHeight = pitchLayout.rowHeight;
  const rowOffset = pitchLayout.rowOffset;

  const [tool, setTool] = useState<PitchTool>('pen');
  const [range, setRange] = useState<Range | null>(null);
  const [draft, setDraft] = useState<Float32Array | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; time: number; freq: number; midi: number } | null>(null);
  const [vibrato, setVibrato] = useState({ depth: 35, rate: 5.5, fade: 0.15 });
  const [autoStrength, setAutoStrength] = useState(0.35);
  const drag = useRef<{
    mode: PitchTool | 'select';
    startTime: number;
    startMidi: number;
    lastTime: number;
    lastMidi: number;
    work: Float32Array | null;
  } | null>(null);
  const draftRef = useRef<Float32Array | null>(null);
  const rangeRef = useRef<Range | null>(null);
  rangeRef.current = range;
  const pointerDown = useRef(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return attachWheel(el);
  }, [bodyRef, attachWheel]);

  const midiAtY = (y: number) => pitchTop - (y - rowOffset) / rowHeight;
  const yAtMidi = (midi: number) => rowOffset + (pitchTop - midi) * rowHeight;
  const xAtTime = (time: number) => (time - scrollSec) * pxPerSec;
  const timeAtX = (x: number) => scrollSec + x / pxPerSec;
  const timeAtEvent = (e: React.PointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return Math.max(0, timeAtX(e.clientX - rect.left));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = fitCanvas(canvas, timelineWidth || 1, canvasHeight);
    if (!ctx) return;
    drawTimelineGrid(ctx, {
      score,
      pxPerSec,
      scrollSec,
      width: timelineWidth,
      height: canvasHeight,
      pitchTop,
      pitchBottom,
      rowHeight,
      rowOffset,
      showRows: true,
    });

    // Note blocks
    for (const note of score.notes) {
      const s = beatToSeconds(score, note.start);
      const e = beatToSeconds(score, note.start + note.duration);
      const x = (s - scrollSec) * pxPerSec;
      const w = Math.max(2, (e - s) * pxPerSec);
      if (x + w < 0 || x > timelineWidth) continue;
      const y = yAtMidi(note.pitch);
      ctx.fillStyle = 'rgba(99,102,241,0.16)';
      drawRoundedRect(ctx, x + 1, y - rowHeight, Math.max(2, w - 2), rowHeight * 2, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(129,140,248,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (w > 34) {
        ctx.fillStyle = cssVar('--text-muted', '#9aa4b8');
        ctx.font = '9px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${note.lyric || ''} ${midiToName(note.pitch)}`, x + 5, y);
      }
    }

    // Range overlay
    if (range) {
      const x1 = xAtTime(range.start);
      const x2 = xAtTime(range.end);
      ctx.fillStyle = cssVar('--accent-soft', 'rgba(94,234,212,0.08)');
      ctx.fillRect(x1, 0, x2 - x1, canvasHeight);
      ctx.strokeStyle = cssVar('--accent', '#5eead4');
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, canvasHeight);
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, canvasHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar('--accent', '#5eead4');
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`${range.start.toFixed(2)}s`, x1 + 4, 12);
      ctx.fillText(`${range.end.toFixed(2)}s`, Math.max(x1 + 4, x2 - 38), 12);
    }

    const drawCurve = (f0: Float32Array | null, color: string, width: number, alpha: number) => {
      if (!f0) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (let x = 0; x <= timelineWidth; x += 1) {
        const time = scrollSec + x / pxPerSec;
        const idx = Math.floor(time * 100);
        if (idx < 0 || idx >= f0.length) {
          started = false;
          continue;
        }
        const v = f0[idx];
        if (v <= 0) {
          started = false;
          continue;
        }
        const midi = freqToMidi(v);
        const y = clamp(yAtMidi(midi), -20, canvasHeight + 20);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawCurve(baseF0, cssVar('--text-muted', '#76839a'), 1.2, 0.55);
    drawCurve(draft || currentF0, cssVar('--accent', '#5eead4'), 2, 1);

    if (cursor && tool === 'pen') {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, cursor.y);
      ctx.lineTo(timelineWidth, cursor.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const midi = midiAtY(cursor.y);
      const freq = midiToFreq(midi);
      ctx.fillStyle = cssVar('--panel', '#121722');
      ctx.fillRect(timelineWidth - 120, 6, 114, 20);
      ctx.fillStyle = cssVar('--text-secondary', '#cbd5e1');
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`${freq.toFixed(1)} Hz  ${midiToName(Math.round(midi))}`, timelineWidth - 114, 20);
    }

  }, [
    timelineWidth,
    canvasHeight,
    score,
    baseF0,
    currentF0,
    draft,
    range,
    cursor,
    pitchTop,
    pitchBottom,
    rowHeight,
    rowOffset,
    pxPerSec,
    scrollSec,
    theme,
    tool,
  ]);

  const applyRangeOrAll = (): Range => {
    if (range) return range;
    const duration = currentF0 ? currentF0.length / 100 : 0;
    return { start: 0, end: duration };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    pointerDown.current = true;
    const time = timeAtEvent(e);
    const rect = surfaceRef.current!.getBoundingClientRect();
    const midi = midiAtY(e.clientY - rect.top);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === 'pen' || tool === 'line') {
      if (!currentF0) return;
      pushHistory(tool === 'pen' ? 'pitch-draw' : 'pitch-line');
      const work = currentF0.slice();
      const idx = clamp(Math.round(time * 100), 0, work.length - 1);
      if (!currentF0 || currentF0[idx] > 0) {
        work[idx] = midiToFreq(clamp(midi, 0, 127));
      }
      setDraft(work);
      draftRef.current = work;
      drag.current = { mode: tool, startTime: time, startMidi: midi, lastTime: time, lastMidi: midi, work };
      return;
    }
    if (tool === 'smooth' || tool === 'vibrato' || tool === 'reset') {
      const r = { start: time, end: time + 0.01 };
      setRange(r);
      drag.current = { mode: 'select', startTime: time, startMidi: midi, lastTime: time, lastMidi: midi, work: null };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = Math.max(0, timeAtX(x));
    const midi = midiAtY(y);
    if (tool === 'pen') {
      const v = currentF0 ? currentF0[Math.floor(time * 100)] : 0;
      setCursor({ x, y, time, freq: v, midi });
    }
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pen' || d.mode === 'line') {
      const work = (draftRef.current || d.work)?.slice();
      if (!work) return;
      if (d.mode === 'pen') {
        const from = Math.round(d.lastTime * 100);
        const to = Math.round(time * 100);
        const step = to >= from ? 1 : -1;
        const count = Math.abs(to - from);
        const fromMidi = d.lastMidi;
        for (let i = 0; i <= count; i++) {
          const idx = from + i * step;
          if (idx < 0 || idx >= work.length) continue;
          // Leave unvoiced consonants and rests silent. Drawing should shape
          // the existing sung frames rather than voice the whole score.
          if (currentF0 && currentF0[idx] <= 0) continue;
          const m = fromMidi + (midi - fromMidi) * (i / Math.max(1, count));
          work[idx] = midiToFreq(clamp(m, 0, 127));
        }
        d.lastTime = time;
        d.lastMidi = midi;
      } else {
        const s = Math.round(d.startTime * 100);
        const end = Math.round(time * 100);
        const lo = Math.min(s, end);
        const hi = Math.max(s, end);
        for (let i = lo; i <= hi; i++) {
          if (i < 0 || i >= work.length) continue;
          if (currentF0 && currentF0[i] <= 0) continue;
          const t = i / 100;
          const frac = (t - d.startTime) / Math.max(1e-6, time - d.startTime);
          const m = d.startMidi + (midi - d.startMidi) * frac;
          work[i] = midiToFreq(clamp(m, 0, 127));
        }
      }
      draftRef.current = work;
      setDraft(work);
    } else if (d.mode === 'select') {
      const r = { start: Math.min(d.startTime, time), end: Math.max(d.startTime, time) };
      setRange(r);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (!d) return;
    if ((d.mode === 'pen' || d.mode === 'line') && draftRef.current) {
      setCurrentF0(draftRef.current, true);
      setDraft(null);
      draftRef.current = null;
    } else if (d.mode === 'select') {
      if (tool === 'smooth' && rangeRef.current) {
        smoothPitchRange(rangeRef.current.start, rangeRef.current.end, 0.7);
      } else if (tool === 'reset' && rangeRef.current) {
        resetPitchRange(rangeRef.current.start, rangeRef.current.end);
      }
    }
    drag.current = null;
    pointerDown.current = false;
  };

  const duration = currentF0 ? currentF0.length / 100 : 0;
  const effRange = range || { start: 0, end: duration };
  const selectedRange = range ? `${range.start.toFixed(2)}s – ${range.end.toFixed(2)}s` : t('pitch.noSelection');
  const rangeSeconds = Math.max(0.01, effRange.end - effRange.start);

  return (
    <div className="editor-pane">
      <div className="editor-toolbar">
        <div className="tool-segment">
          <IconButton icon={<PenLine size={15} />} label={t('pitch.tool.pen')} active={tool === 'pen'} size="sm" onClick={() => setTool('pen')} />
          <IconButton icon={<Spline size={15} />} label={t('pitch.tool.line')} active={tool === 'line'} size="sm" onClick={() => setTool('line')} />
          <IconButton icon={<Waves size={15} />} label={t('pitch.tool.smooth')} active={tool === 'smooth'} size="sm" onClick={() => setTool('smooth')} />
          <IconButton icon={<Wind size={15} />} label={t('pitch.tool.vibrato')} active={tool === 'vibrato'} size="sm" onClick={() => setTool('vibrato')} />
          <IconButton icon={<Eraser size={15} />} label={t('pitch.tool.reset')} active={tool === 'reset'} size="sm" onClick={() => setTool('reset')} />
        </div>
        <div className="toolbar-divider" />
        <Button size="sm" variant="ghost" onClick={resetPitch} disabled={!pitchEdited}>
          <RotateCcw size={14} /> {t('pitch.resetAll')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => autoTuneRange(effRange.start, effRange.end, autoStrength)}
          disabled={!currentF0}
          title={t('pitch.autoTuneHint')}
        >
          <Sparkles size={14} /> {t('pitch.autoTune')}
        </Button>
        <div className="pitch-transpose">
          <IconButton icon={<ArrowDown size={14} />} label={`${t('pitch.transpose')} -1`} size="sm" onClick={() => transposePitch(-1, range?.start, range?.end, 'pitch-transpose')} disabled={!currentF0} />
          <span>{t('pitch.transpose')}</span>
          <IconButton icon={<ArrowUp size={14} />} label={`${t('pitch.transpose')} +1`} size="sm" onClick={() => transposePitch(1, range?.start, range?.end, 'pitch-transpose')} disabled={!currentF0} />
          <button type="button" className="mini-btn" onClick={() => transposePitch(-12, range?.start, range?.end, 'pitch-transpose')} disabled={!currentF0}>
            -12
          </button>
          <button type="button" className="mini-btn" onClick={() => transposePitch(12, range?.start, range?.end, 'pitch-transpose')} disabled={!currentF0}>
            +12
          </button>
        </div>
        <div className="toolbar-spacer" />
        <span className="range-pill">{selectedRange}</span>
        {pitchEdited ? <span className="edited-pill">{t('pitch.edited')}</span> : null}
        <ZoomBar width={timelineWidth} />
      </div>

      <div className="timeline-body" ref={bodyRef}>
        <div className="timeline-line ruler-line">
          <div className="timeline-gutter" />
          <TimelineRuler width={timelineWidth} />
        </div>
        <div className="timeline-line wave-line">
          <div className="timeline-gutter wave-gutter">
            <Waves size={13} />
          </div>
          <WaveformStrip width={timelineWidth} height={56} color={cssVar('--accent', '#5eead4')} />
        </div>
        <div className="pitch-content" style={{ height: canvasHeight }}>
          <PianoKeyboard pitchTop={pitchTop} pitchBottom={pitchBottom} rowHeight={rowHeight} height={canvasHeight} rowOffset={rowOffset} />
          <div
            className="pitch-surface"
            ref={surfaceRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setCursor(null)}
          >
            <canvas ref={canvasRef} />
            <Playhead />
            <PitchScrollbar
              height={canvasHeight}
              contentHeight={pitchLayout.contentHeight}
              scroll={timeline.pitchScroll}
              maxScroll={timeline.maxPitchScroll}
              onScroll={timeline.setPitchScroll}
            />
            {!currentF0 ? (
              <div className="empty-overlay compact">
                <Waves size={28} />
                <strong>{t('pitch.noData')}</strong>
                <Button size="sm" variant="primary" onClick={() => void renderVocal()}>
                  <Sparkles size={14} /> {t('render.button')}
                </Button>
              </div>
            ) : null}
            <div className="pitch-legend">
              <span><i className="legend-line base" />{t('pitch.model')}</span>
              <span><i className="legend-line current" />{t('pitch.current')}</span>
            </div>
            {tool === 'vibrato' ? (
              <div className="pitch-float" onPointerDown={(e) => e.stopPropagation()}>
                <strong>{t('pitch.tool.vibrato')}</strong>
                <label>
                  {t('pitch.depth')}
                  <NumberField value={vibrato.depth} min={0} max={200} step={1} suffix="ct" onChange={(v) => setVibrato({ ...vibrato, depth: v })} />
                </label>
                <label>
                  {t('pitch.rate')}
                  <NumberField value={vibrato.rate} min={0.5} max={12} step={0.1} suffix="Hz" onChange={(v) => setVibrato({ ...vibrato, rate: v })} />
                </label>
                <label>
                  {t('pitch.fade')}
                  <NumberField value={vibrato.fade} min={0.01} max={2} step={0.01} suffix="s" onChange={(v) => setVibrato({ ...vibrato, fade: v })} />
                </label>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!range}
                  onClick={() => {
                    if (!range) return;
                    applyVibratoRange(range.start, range.end, vibrato.rate, vibrato.depth, vibrato.fade);
                  }}
                >
                  {t('pitch.applyVibrato')}
                </Button>
                <span className="pitch-float-hint">{t('pitch.vibratoHint')}</span>
              </div>
            ) : null}
            {tool === 'smooth' || tool === 'reset' ? (
              <div className="pitch-float" onPointerDown={(e) => e.stopPropagation()}>
                <strong>{tool === 'smooth' ? t('pitch.tool.smooth') : t('pitch.tool.reset')}</strong>
                <span className="pitch-float-hint">
                  {range ? `${range.start.toFixed(2)}s – ${range.end.toFixed(2)}s` : t('pitch.selectRange')}
                </span>
                {tool === 'smooth' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!range}
                    onClick={() => range && smoothPitchRange(range.start, range.end, 0.7)}
                  >
                    {t('common.apply')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!range}
                    onClick={() => range && resetPitchRange(range.start, range.end)}
                  >
                    {t('common.apply')}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
