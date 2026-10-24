import React, { useRef } from 'react';

export default function PitchScrollbar({
  height,
  contentHeight,
  scroll,
  maxScroll,
  onScroll,
}: {
  height: number;
  contentHeight: number;
  scroll: number;
  maxScroll: number;
  onScroll: (value: number) => void;
}) {
  const dragging = useRef<{ startY: number; startScroll: number } | null>(null);
  if (maxScroll <= 0 || height <= 0) return null;
  const thumbHeight = Math.max(28, (height / contentHeight) * height);
  const travel = Math.max(1, height - thumbHeight);
  const thumbTop = (scroll / maxScroll) * travel;

  return (
    <div
      className="pitch-scrollbar"
      style={{ height }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target !== e.currentTarget) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        onScroll(ratio * maxScroll);
      }}
    >
      <div
        className="pitch-scrollbar-thumb"
        style={{ height: thumbHeight, transform: `translateY(${thumbTop}px)` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = { startY: e.clientY, startScroll: scroll };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const dy = e.clientY - dragging.current.startY;
          onScroll(dragging.current.startScroll + (dy / travel) * maxScroll);
        }}
        onPointerUp={(e) => {
          dragging.current = null;
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {}
        }}
      />
    </div>
  );
}
