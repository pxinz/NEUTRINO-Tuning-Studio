import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../state/useAppStore';
import { drawWaveform, fitCanvas } from '../../lib/canvas';
import { useTimeline } from '../../hooks/useTimeline';
import Playhead from './Playhead';

export default function WaveformStrip({
  width,
  height = 64,
  color,
  showReference = true,
}: {
  width: number;
  height?: number;
  color?: string;
  showReference?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const peaks = useAppStore((s) => s.audio.peaks);
  const referencePeaks = useAppStore((s) => s.audio.referencePeaks);
  const referenceDuration = useAppStore((s) => s.audio.referenceDuration);
  const duration = useAppStore((s) => s.audio.duration);
  const reference = useAppStore((s) => s.project.reference);
  const seek = useAppStore((s) => s.seek);
  const theme = useAppStore((s) => s.theme);
  const { pxPerSec, scrollSec } = useTimeline(width);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = fitCanvas(canvas, width, height);
    if (!ctx) return;
    drawWaveform(
      ctx,
      width,
      height,
      peaks,
      duration,
      pxPerSec,
      scrollSec,
      color || 'var(--wave-color)',
      showReference ? referencePeaks : null,
      '#818cf8',
      referenceDuration,
      reference?.offset || 0,
    );
  }, [
    width,
    height,
    peaks,
    referencePeaks,
    referenceDuration,
    duration,
    pxPerSec,
    scrollSec,
    color,
    showReference,
    reference?.offset,
    theme,
  ]);

  return (
    <div className="timeline-strip" style={{ width, height }}>
      <canvas
        ref={ref}
        className="waveform-strip"
        onPointerDown={(e) => {
          const rect = ref.current!.getBoundingClientRect();
          seek(Math.max(0, scrollSec + (e.clientX - rect.left) / pxPerSec));
        }}
        title={t('waveform.seekHint')}
      />
      <Playhead />
    </div>
  );
}
