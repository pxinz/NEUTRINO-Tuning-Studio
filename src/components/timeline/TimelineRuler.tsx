import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../state/useAppStore';
import { drawRuler, fitCanvas } from '../../lib/canvas';
import { useTimeline } from '../../hooks/useTimeline';
import Playhead from './Playhead';

export default function TimelineRuler({ width }: { width: number }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const score = useAppStore((s) => s.project.score);
  const seek = useAppStore((s) => s.seek);
  const theme = useAppStore((s) => s.theme);
  const setLoopRange = useAppStore((s) => s.setLoopRange);
  const { pxPerSec, scrollSec, xToTime } = useTimeline(width);
  const dragging = useRef<{ mode: 'seek' | 'loop'; start: number } | null>(null);
  const height = 30;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = fitCanvas(canvas, width, height);
    if (!ctx) return;
    drawRuler(ctx, width, height, score, pxPerSec, scrollSec);
  }, [width, height, score, pxPerSec, scrollSec, theme]);

  const timeAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, xToTime(clientX - rect.left));
  };

  return (
    <div className="timeline-strip" style={{ width, height }}>
      <canvas
        ref={ref}
        className="timeline-ruler"
        onPointerDown={(e) => {
          const time = timeAt(e.clientX);
          if (e.shiftKey) {
            dragging.current = { mode: 'loop', start: time };
            setLoopRange(time, time + 0.05);
          } else {
            dragging.current = { mode: 'seek', start: time };
            seek(time);
          }
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const time = timeAt(e.clientX);
          if (dragging.current.mode === 'seek') seek(time);
          else setLoopRange(dragging.current.start, time);
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        title={t('timeline.seekHint')}
      />
      <Playhead />
    </div>
  );
}
