import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../state/useAppStore';
import { useElementSize } from '../../hooks/useElementSize';
import { useTimeline } from '../../hooks/useTimeline';
import Playhead from '../timeline/Playhead';
import {
  cssVar,
  drawTimelineGrid,
  fitCanvas,
  drawRoundedRect,
} from '../../lib/canvas';
import { clamp, formatTime } from '../../lib/time';
import { DYNAMICS_MAX_DB, DYNAMICS_MIN_DB, gainAt } from '../../lib/dynamics';
import { scoreDurationSeconds } from '../../lib/score';
import TimelineRuler from '../timeline/TimelineRuler';
import WaveformStrip from '../timeline/WaveformStrip';
import ZoomBar from '../timeline/ZoomBar';
import { Button, IconButton, Toggle } from '../ui';

export default function DynamicsEditor() {
  const { t } = useTranslation();
  const dynamics = useAppStore((s) => s.project.dynamics);
  const audio = useAppStore((s) => s.audio);
  const setDynamicsEnabled = useAppStore((s) => s.setDynamicsEnabled);
  const addDynamicsPointAt = useAppStore((s) => s.addDynamicsPointAt);
  const moveDynamicsPointAt = useAppStore((s) => s.moveDynamicsPointAt);
  const removeDynamicsPointAt = useAppStore((s) => s.removeDynamicsPointAt);
  const resetDynamics = useAppStore((s) => s.resetDynamics);
  const smoothDynamicsEnvelope = useAppStore((s) => s.smoothDynamicsEnvelope);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const score = useAppStore((s) => s.project.score);
  const theme = useAppStore((s) => s.theme);
  const renderVocal = useAppStore((s) => s.renderVocal);

  const { ref: bodyRef, size: bodySize } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const timelineWidth = Math.max(0, bodySize.width - 58);
  const canvasHeight = Math.max(120, bodySize.height - 30 - 56);
  const { pxPerSec, scrollSec, xToTime, attachWheel } = useTimeline(timelineWidth);
  const [hover, setHover] = useState<{ time: number; db: number } | null>(null);
  const dragging = useRef<{ index: number; moved: boolean } | null>(null);
  const duration = audio.duration || scoreDurationSeconds(score);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return attachWheel(el);
  }, [bodyRef, attachWheel]);

  const dbToY = (db: number) =>
    ((DYNAMICS_MAX_DB - db) / (DYNAMICS_MAX_DB - DYNAMICS_MIN_DB)) * (canvasHeight - 18) + 9;
  const yToDb = (y: number) =>
    clamp(
      DYNAMICS_MAX_DB - ((y - 9) / Math.max(1, canvasHeight - 18)) * (DYNAMICS_MAX_DB - DYNAMICS_MIN_DB),
      DYNAMICS_MIN_DB,
      DYNAMICS_MAX_DB,
    );
  const xAt = (time: number) => (time - scrollSec) * pxPerSec;
  const timeAt = (x: number) => scrollSec + x / pxPerSec;

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
    });
    // Dark overlay
    ctx.fillStyle = cssVar('--panel', '#0f141d');
    ctx.globalAlpha = 0.72;
    ctx.fillRect(0, 0, timelineWidth, canvasHeight);
    ctx.globalAlpha = 1;

    // dB grid
    for (const db of [12, 6, 0, -6, -12, -18, -24]) {
      const y = dbToY(db);
      ctx.strokeStyle = db === 0 ? cssVar('--grid-bar', 'rgba(255,255,255,0.14)') : cssVar('--grid-row', 'rgba(255,255,255,0.05)');
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(timelineWidth, Math.round(y) + 0.5);
      ctx.stroke();
    }

    if (duration > 0 && dynamics.enabled) {
      const points = dynamics.points;
      const x0 = xAt(0);
      const x1 = xAt(duration);
      const gradient = ctx.createLinearGradient(0, dbToY(0), 0, dbToY(-24));
      gradient.addColorStop(0, 'rgba(94,234,212,0.18)');
      gradient.addColorStop(1, 'rgba(94,234,212,0.01)');
      ctx.beginPath();
      ctx.moveTo(x0, dbToY(0));
      for (let t = 0; t <= duration; t += 0.01) {
        const db = 20 * Math.log10(Math.max(1e-5, gainAt(points, t)));
        ctx.lineTo(xAt(t), dbToY(db));
      }
      ctx.lineTo(x1, dbToY(0));
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = cssVar('--accent', '#5eead4');
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      for (let t = 0; t <= duration; t += 0.01) {
        const db = 20 * Math.log10(Math.max(1e-5, gainAt(points, t)));
        const x = xAt(t);
        const y = dbToY(db);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      points.forEach((p, i) => {
        const x = xAt(p.time);
        if (x < -15 || x > timelineWidth + 15) return;
        const y = dbToY(p.db);
        ctx.fillStyle = i === 0 || i === points.length - 1 ? cssVar('--text-secondary', '#cbd5e1') : cssVar('--accent', '#5eead4');
        ctx.beginPath();
        ctx.arc(x, y, i === 0 || i === points.length - 1 ? 4 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = cssVar('--panel', '#0f141d');
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    if (hover) {
      const x = xAt(hover.time);
      const y = dbToY(hover.db);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.moveTo(0, y);
      ctx.lineTo(timelineWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    timelineWidth,
    canvasHeight,
    pxPerSec,
    scrollSec,
    score,
    dynamics,
    duration,
    hover,
    theme,
  ]);

  const nearestPoint = (time: number, db: number): number | null => {
    let best = -1;
    let bestDist = 12;
    dynamics.points.forEach((p, i) => {
      const dx = Math.abs(xAt(p.time) - xAt(time));
      const dy = Math.abs(dbToY(p.db) - dbToY(db));
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best >= 0 ? best : null;
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const rect = surfaceRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = clamp(timeAt(x), 0, duration);
    const db = yToDb(y);
    const idx = nearestPoint(time, db);
    if (idx !== null) {
      pushHistory('dynamics-move');
      dragging.current = { index: idx, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    addDynamicsPointAt(time, db);
  };

  const onMove = (e: React.PointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = clamp(timeAt(x), 0, duration);
    const db = yToDb(y);
    setHover({ time, db });
    if (dragging.current) {
      dragging.current.moved = true;
      moveDynamicsPointAt(dragging.current.index, time, db);
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

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = surfaceRef.current!.getBoundingClientRect();
    const time = timeAt(e.clientX - rect.left);
    const db = yToDb(e.clientY - rect.top);
    const idx = nearestPoint(time, db);
    if (idx !== null) removeDynamicsPointAt(idx);
  };

  return (
    <div className="editor-pane">
      <div className="editor-toolbar">
        <span className="tool-label">
          <Gauge size={15} />
          {t('dynamics.title')}
        </span>
        <Toggle checked={dynamics.enabled} onChange={setDynamicsEnabled} label={t('dynamics.enable')} />
        <div className="toolbar-divider" />
        <Button size="sm" variant="ghost" onClick={smoothDynamicsEnvelope} disabled={!dynamics.enabled}>
          <SlidersHorizontal size={14} /> {t('dynamics.smooth')}
        </Button>
        <Button size="sm" variant="ghost" onClick={resetDynamics}>
          <RotateCcw size={14} /> {t('dynamics.reset')}
        </Button>
        <div className="toolbar-spacer" />
        <span className="toolbar-meta">
          {dynamics.enabled ? t('dynamics.applied') : t('common.off')} · {dynamics.points.length}
        </span>
        <ZoomBar width={timelineWidth} />
      </div>
      <div className="timeline-body" ref={bodyRef}>
        <div className="timeline-line ruler-line">
          <div className="timeline-gutter" />
          <TimelineRuler width={timelineWidth} />
        </div>
        <div className="timeline-line wave-line">
          <div className="timeline-gutter wave-gutter">
            <Gauge size={13} />
          </div>
          <WaveformStrip width={timelineWidth} height={56} color={cssVar('--wave-color', '#5eead4')} />
        </div>
        <div className="dynamics-content" style={{ height: canvasHeight }}>
          <div className="db-gutter">
            {[12, 6, 0, -6, -12, -18, -24].map((db) => (
              <span key={db} style={{ top: dbToY(db) }}>
                {db > 0 ? `+${db}` : db}
              </span>
            ))}
          </div>
          <div
            className="dynamics-surface"
            ref={surfaceRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setHover(null)}
            onContextMenu={onContextMenu}
          >
            <canvas ref={canvasRef} />
            <Playhead />
            {!audio.loaded ? (
              <div className="empty-overlay compact" onPointerDown={(e) => e.stopPropagation()}>
                <Gauge size={28} />
                <strong>{t('dynamics.noAudio')}</strong>
                <Button size="sm" variant="primary" onClick={() => void renderVocal()}>
                  <Sparkles size={14} /> {t('render.button')}
                </Button>
              </div>
            ) : null}
            <div className="dynamics-hint">
              {hover ? `${hover.time.toFixed(2)}s · ${hover.db.toFixed(1)} dB` : t('dynamics.addPoint')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
