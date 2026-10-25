import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, RotateCcw, Sparkles, TimerReset } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../state/useAppStore';
import { useElementSize } from '../../hooks/useElementSize';
import { useTimeline } from '../../hooks/useTimeline';
import { drawNoteLane, drawTimelineGrid, fitCanvas, cssVar, drawRoundedRect } from '../../lib/canvas';
import TimelineRuler from '../timeline/TimelineRuler';
import WaveformStrip from '../timeline/WaveformStrip';
import ZoomBar from '../timeline/ZoomBar';
import Playhead from '../timeline/Playhead';
import { Button } from '../ui';

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o', 'N', 'n']);

function phonemeColor(name: string): string {
  if (name === 'pau') return '#4b5563';
  if (name === 'br') return '#d97706';
  if (VOWELS.has(name)) return '#14b8a6';
  if (name.startsWith('cl')) return '#7c3aed';
  return '#6366f1';
}

export default function TimingEditor() {
  const { t } = useTranslation();
  const timing = useAppStore((s) => s.timing);
  const timingEdited = useAppStore((s) => s.timingEdited);
  const updateTimingBoundary = useAppStore((s) => s.updateTimingBoundary);
  const resetTiming = useAppStore((s) => s.resetTiming);
  const selectedPhoneme = useAppStore((s) => s.selectedPhoneme);
  const setSelectedPhoneme = useAppStore((s) => s.setSelectedPhoneme);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const renderVocal = useAppStore((s) => s.renderVocal);
  const render = useAppStore((s) => s.render);
  const score = useAppStore((s) => s.project.score);
  const player = useAppStore((s) => s.play);
  const seek = useAppStore((s) => s.seek);
  const theme = useAppStore((s) => s.theme);

  const { ref: bodyRef, size: bodySize } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const timelineWidth = Math.max(0, bodySize.width - 58);
  const canvasHeight = Math.max(120, bodySize.height - 30 - 60);
  const { pxPerSec, scrollSec, xToTime, attachWheel } = useTimeline(timelineWidth);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef<{ index: number; started: boolean } | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return attachWheel(el);
  }, [bodyRef, attachWheel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasHeight) return;
    const ctx = fitCanvas(canvas, timelineWidth || 1, canvasHeight);
    if (!ctx) return;
    drawTimelineGrid(ctx, {
      score,
      pxPerSec,
      scrollSec,
      width: timelineWidth,
      height: canvasHeight,
    });

    const noteLaneH = 38;
    ctx.fillStyle = cssVar('--panel-2', '#111722');
    ctx.fillRect(0, 0, timelineWidth, noteLaneH);
    drawNoteLane(ctx, timelineWidth, noteLaneH, score, pxPerSec, scrollSec, cssVar('--accent', '#5eead4'));

    if (!timing) {
      ctx.fillStyle = cssVar('--text-muted', '#8b95a7');
      ctx.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('timing.noData'), timelineWidth / 2, canvasHeight / 2);
      ctx.textAlign = 'left';
      return;
    }

    const laneTop = noteLaneH;
    const laneHeight = canvasHeight - laneTop;
    for (let i = 0; i < timing.phonemes.length; i++) {
      const p = timing.phonemes[i];
      const x = (p.start - scrollSec) * pxPerSec;
      const w = (p.end - p.start) * pxPerSec;
      if (x + w < 0 || x > timelineWidth) continue;
      const selected = selectedPhoneme === i;
      ctx.fillStyle = phonemeColor(p.phoneme);
      ctx.globalAlpha = selected ? 0.95 : 0.6;
      drawRoundedRect(ctx, x + 1, laneTop + 8, Math.max(2, w - 2), laneHeight - 20, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (selected) {
        ctx.strokeStyle = cssVar('--text-primary', '#e8ecf4');
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, x + 1, laneTop + 8, Math.max(2, w - 2), laneHeight - 20, 4);
        ctx.stroke();
      }
      if (w > 18) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 3, laneTop, w - 6, laneHeight);
        ctx.clip();
        ctx.fillStyle = '#f8fafc';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(p.phoneme, x + 5, laneTop + 14);
        if (w > 42) {
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillText(`${(p.end - p.start).toFixed(3)}s`, x + 5, laneTop + 30);
        }
        ctx.restore();
      }
    }

    // Boundaries
    for (let i = 1; i < timing.phonemes.length; i++) {
      const p = timing.phonemes[i];
      const x = (p.start - scrollSec) * pxPerSec;
      if (x < -10 || x > timelineWidth + 10) continue;
      const hot = hover === i;
      ctx.strokeStyle = hot ? cssVar('--accent', '#5eead4') : 'rgba(255,255,255,0.65)';
      ctx.lineWidth = hot ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, laneTop);
      ctx.lineTo(Math.round(x) + 0.5, canvasHeight);
      ctx.stroke();
      if (hot) {
        ctx.fillStyle = cssVar('--accent', '#5eead4');
        ctx.beginPath();
        ctx.arc(x, laneTop - 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [
    timelineWidth,
    canvasHeight,
    timing,
    score,
    pxPerSec,
    scrollSec,
    selectedPhoneme,
    hover,
    theme,
    t,
  ]);

  const nearestBoundary = (x: number): number | null => {
    if (!timing) return null;
    for (let i = 1; i < timing.phonemes.length; i++) {
      const bx = (timing.phonemes[i].start - scrollSec) * pxPerSec;
      if (Math.abs(bx - x) <= 7) return i;
    }
    return null;
  };

  const xFromEvent = (e: React.PointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return e.clientX - rect.left;
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const x = xFromEvent(e);
    const boundary = nearestBoundary(x);
    if (boundary !== null) {
      dragging.current = { index: boundary, started: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (timing) {
      const time = xToTime(x);
      const idx = timing.phonemes.findIndex((p) => time >= p.start && time < p.end);
      setSelectedPhoneme(idx >= 0 ? idx : null);
    }
    seek(xToTime(x));
  };

  const onMove = (e: React.PointerEvent) => {
    const x = xFromEvent(e);
    if (dragging.current) {
      if (!dragging.current.started) {
        pushHistory('timing-edit');
        dragging.current.started = true;
      }
      updateTimingBoundary(dragging.current.index, xToTime(x));
      return;
    }
    const b = nearestBoundary(x);
    setHover(b);
    if (surfaceRef.current) {
      surfaceRef.current.style.cursor = b !== null ? 'col-resize' : 'crosshair';
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (dragging.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      dragging.current = null;
    }
  };

  const selected = timing && selectedPhoneme !== null ? timing.phonemes[selectedPhoneme] : null;

  return (
    <div className="editor-pane">
      <div className="editor-toolbar">
        <span className="tool-label">
          <Activity size={15} />
          {t('timing.title')}
        </span>
        {timing ? (
          <span className="toolbar-meta">
            {t('timing.phonemes', { count: timing.phonemes.length })}
            {timingEdited ? <span className="edited-pill">{t('timing.edited')}</span> : null}
          </span>
        ) : null}
        <div className="toolbar-spacer" />
        {selected ? (
          <span className="toolbar-selection">
            {t('timing.selected', { phoneme: selected.phoneme })} · {(selected.end - selected.start).toFixed(3)}s
          </span>
        ) : null}
        <Button size="sm" variant="ghost" onClick={resetTiming} disabled={!timing || !timingEdited}>
          <TimerReset size={14} /> {t('timing.reset')}
        </Button>
        {timingEdited ? (
          <Button size="sm" variant="primary" onClick={() => void renderVocal()} disabled={render.status === 'running'}>
            <Sparkles size={14} /> {t('topbar.render')}
          </Button>
        ) : null}
        <ZoomBar width={timelineWidth} />
      </div>
      <div className="timeline-body" ref={bodyRef}>
        <div className="timeline-line ruler-line">
          <div className="timeline-gutter" />
          <TimelineRuler width={timelineWidth} />
        </div>
        <div className="timeline-line wave-line">
          <div className="timeline-gutter wave-gutter">
            <Activity size={13} />
          </div>
          <WaveformStrip width={timelineWidth} height={60} color={cssVar('--wave-color', '#5eead4')} />
        </div>
        <div className="timing-content" style={{ height: canvasHeight }}>
          <div className="timing-gutter">
            <span>{t('timing.boundary')}</span>
            <span className="timing-gutter-hint">◀ ▶</span>
          </div>
          <div
            className="timing-surface"
            ref={surfaceRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setHover(null)}
          >
            <canvas ref={canvasRef} />
            <Playhead />
            {!timing ? (
              <div className="empty-overlay compact" onPointerDown={(e) => e.stopPropagation()}>
                <Activity size={28} />
                <strong>{t('timing.noData')}</strong>
                <Button size="sm" variant="primary" onClick={() => void renderVocal()}>
                  <Sparkles size={14} /> {t('render.button')}
                </Button>
              </div>
            ) : null}
            {timingEdited ? (
              <div className="timing-badge">
                <span />
                {t('timing.renderHint')}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
