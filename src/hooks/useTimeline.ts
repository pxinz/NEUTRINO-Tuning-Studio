import { useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../state/useAppStore';
import { clamp } from '../lib/time';
import { scoreDurationSeconds } from '../lib/score';
import { PITCH_ROW_HEIGHT } from '../lib/pitchLayout';

export function useTimeline(width: number, options?: { verticalHeight?: number }) {
  const viewport = useAppStore((s) => s.viewport);
  const setViewport = useAppStore((s) => s.setViewport);
  const audioDuration = useAppStore((s) => s.audio.duration);
  const score = useAppStore((s) => s.project.score);
  const playing = useAppStore((s) => s.transport.playing);
  const currentTime = useAppStore((s) => s.transport.currentTime);
  const follow = useAppStore((s) => s.transport.follow);
  const wheelMode = useAppStore((s) => s.settings?.scrollWheelMode ?? 'horizontal');

  const verticalHeight = options?.verticalHeight ?? 0;
  const duration = useMemo(
    () => Math.max(audioDuration, scoreDurationSeconds(score), 1),
    [audioDuration, score],
  );
  const pxPerSec = viewport.pxPerSec;
  const scrollSec = viewport.scrollSec;
  const pitchSpan = Math.max(1, viewport.pitchTop - viewport.pitchBottom + 1);
  const pitchContentHeight = pitchSpan * PITCH_ROW_HEIGHT;
  const maxPitchScroll = Math.max(0, pitchContentHeight - verticalHeight);
  const pitchScroll = clamp(viewport.pitchScroll, 0, maxPitchScroll);
  const visibleSeconds = width > 0 ? width / pxPerSec : 0;
  const maxScroll = Math.max(0, duration - visibleSeconds + 0.5);

  useEffect(() => {
    if (scrollSec > maxScroll + 0.001) setViewport({ scrollSec: maxScroll });
  }, [maxScroll, scrollSec, setViewport]);

  useEffect(() => {
    if (viewport.pitchScroll > maxPitchScroll + 0.001) {
      setViewport({ pitchScroll: maxPitchScroll });
    }
  }, [viewport.pitchScroll, maxPitchScroll, setViewport]);

  useEffect(() => {
    if (!playing || !follow || width <= 0) return;
    const x = (currentTime - scrollSec) * pxPerSec;
    if (x > width * 0.82 || x < 0) {
      const next = clamp(currentTime - (width / pxPerSec) * 0.35, 0, maxScroll);
      setViewport({ scrollSec: next });
    }
  }, [currentTime, playing, follow, width, pxPerSec, scrollSec, maxScroll, setViewport]);

  const timeToX = useCallback(
    (time: number) => (time - scrollSec) * pxPerSec,
    [scrollSec, pxPerSec],
  );
  const xToTime = useCallback(
    (x: number) => scrollSec + x / pxPerSec,
    [scrollSec, pxPerSec],
  );

  const onWheel = useCallback(
    (event: WheelEvent) => {
      if (width <= 0) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const x = event.clientX - rect.left;
        const anchor = scrollSec + x / pxPerSec;
        const factor = Math.exp(-event.deltaY * 0.0022);
        const nextPx = clamp(pxPerSec * factor, 8, 600);
        const nextScroll = clamp(anchor - x / nextPx, 0, Math.max(0, duration - width / nextPx + 0.5));
        setViewport({ pxPerSec: nextPx, scrollSec: nextScroll });
        return;
      }
      event.preventDefault();
      const primaryVertical = wheelMode === 'vertical';
      const wantsVertical = maxPitchScroll > 0 && (event.shiftKey ? !primaryVertical : primaryVertical);
      const verticalDelta = wantsVertical ? event.deltaY || 0 : 0;
      const horizontalDelta =
        (event.deltaX || 0) + (wantsVertical ? 0 : event.deltaY || 0);
      const nextScroll = clamp(scrollSec + horizontalDelta / pxPerSec, 0, maxScroll);
      const nextPitch = clamp(pitchScroll + verticalDelta, 0, maxPitchScroll);
      setViewport({
        scrollSec: nextScroll,
        ...(maxPitchScroll > 0 ? { pitchScroll: nextPitch } : {}),
      });
    },
    [
      width,
      scrollSec,
      pxPerSec,
      duration,
      maxScroll,
      maxPitchScroll,
      pitchScroll,
      wheelMode,
      setViewport,
    ],
  );

  const attachWheel = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return () => {};
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    },
    [onWheel],
  );

  return {
    duration,
    pxPerSec,
    scrollSec,
    visibleSeconds,
    maxScroll,
    timeToX,
    xToTime,
    onWheel,
    attachWheel,
    pitchScroll,
    maxPitchScroll,
    pitchContentHeight,
    setPitchScroll: (value: number) => setViewport({ pitchScroll: clamp(value, 0, maxPitchScroll) }),
    setViewport,
    zoomTo: (nextPx: number, anchorTime?: number) => {
      const clamped = clamp(nextPx, 8, 600);
      const anchor = anchorTime ?? scrollSec + (width / pxPerSec) / 2;
      const anchorX = (anchor - scrollSec) * pxPerSec;
      const nextScroll = clamp(anchor - anchorX / clamped, 0, Math.max(0, duration - width / clamped + 0.5));
      setViewport({ pxPerSec: clamped, scrollSec: nextScroll });
    },
  };
}
