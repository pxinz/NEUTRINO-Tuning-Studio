import React from 'react';
import clsx from 'clsx';
import { useAppStore } from '../../state/useAppStore';

/**
 * Cheap playhead overlay. Keeping this outside the canvas effects prevents the
 * whole editor (notes, grid, waveform) from re-rendering at the audio tick rate.
 */
export default function Playhead({ className }: { className?: string }) {
  const currentTime = useAppStore((s) => s.transport.currentTime);
  const viewport = useAppStore((s) => s.viewport);
  const x = (currentTime - viewport.scrollSec) * viewport.pxPerSec;
  return (
    <div
      className={clsx('playhead', className)}
      style={{ transform: `translate3d(${x}px, 0, 0)` }}
      aria-hidden
    />
  );
}
