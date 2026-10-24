import React from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { IconButton, Slider } from '../ui';
import { clamp } from '../../lib/time';

export default function ZoomBar({ width }: { width: number }) {
  const { t } = useTranslation();
  const pxPerSec = useAppStore((s) => s.viewport.pxPerSec);
  const setViewport = useAppStore((s) => s.setViewport);
  const fitTimeline = useAppStore((s) => s.fitTimeline);
  const zoom = (factor: number) => setViewport({ pxPerSec: clamp(pxPerSec * factor, 8, 600) });
  return (
    <div className="zoom-bar">
      <IconButton icon={<Minus size={13} />} label={t('transport.zoom')} size="sm" onClick={() => zoom(0.8)} />
      <Slider
        className="zoom-slider"
        min={8}
        max={600}
        step={1}
        value={Math.round(pxPerSec)}
        onChange={(v) => setViewport({ pxPerSec: v })}
        ariaLabel={t('transport.zoom')}
      />
      <IconButton icon={<Plus size={13} />} label={t('transport.zoom')} size="sm" onClick={() => zoom(1.25)} />
      <IconButton icon={<Maximize2 size={13} />} label={t('transport.fit')} size="sm" onClick={() => fitTimeline(width)} />
      <span className="zoom-label">{Math.round(pxPerSec)} px/s</span>
    </div>
  );
}
