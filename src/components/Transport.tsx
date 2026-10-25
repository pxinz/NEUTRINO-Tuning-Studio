import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AudioWaveform,
  Check,
  ChevronDown,
  Crosshair,
  Music,
  Pause,
  Play,
  Repeat,
  SkipBack,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';
import { IconButton, Slider } from './ui';
import { formatTime } from '../lib/time';
import { timelineEnd } from '../lib/timeline';

export default function Transport() {
  const { t } = useTranslation();
  const transport = useAppStore((s) => s.transport);
  const audio = useAppStore((s) => s.audio);
  const project = useAppStore((s) => s.project);
  const play = useAppStore((s) => s.play);
  const pause = useAppStore((s) => s.pause);
  const stop = useAppStore((s) => s.stop);
  const seek = useAppStore((s) => s.seek);
  const setLoop = useAppStore((s) => s.setLoop);
  const setFollow = useAppStore((s) => s.setFollow);
  const setMasterVolume = useAppStore((s) => s.setMasterVolume);
  const setVocalMode = useAppStore((s) => s.setVocalMode);
  const reference = project.reference;
  const setReference = useAppStore((s) => s.setReference);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const monitorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!monitorOpen) return;
    const close = (e: MouseEvent) => {
      if (monitorRef.current && !monitorRef.current.contains(e.target as Node)) setMonitorOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMonitorOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [monitorOpen]);

  const vocalModes = [
    { value: 'vocal' as const, label: t('transport.vocal'), icon: <Volume2 size={14} /> },
    { value: 'sine' as const, label: t('transport.vocalSine'), icon: <AudioWaveform size={14} /> },
    { value: 'mute' as const, label: t('transport.vocalMute'), icon: <VolumeX size={14} /> },
  ];
  const activeMode = vocalModes.find((mode) => mode.value === transport.vocalMode) || vocalModes[0];

  const duration =
    timelineEnd(project.score, audio.duration, reference, audio.referenceDuration) ||
    transport.duration ||
    0;
  const hasAudio = audio.loaded || Boolean(reference && audio.referenceDuration > 0);
  const bpm = project.score.tempos[0]?.bpm || 100;

  return (
    <footer className="transport">
      <div className="transport-group">
        <IconButton icon={<SkipBack size={16} />} label={t('transport.goStart')} onClick={() => seek(0)} />
        <button
          type="button"
          className={clsx('transport-play', transport.playing && 'playing')}
          onClick={() => (transport.playing ? pause() : void play())}
          title={transport.playing ? t('transport.pause') : t('transport.play')}
          disabled={!hasAudio}
        >
          {transport.playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
        </button>
        <IconButton icon={<Square size={14} />} label={t('transport.stop')} onClick={stop} />
        <IconButton
          icon={<Repeat size={16} />}
          label={transport.loop ? t('transport.loopOn') : t('transport.loopOff')}
          active={transport.loop}
          onClick={() => setLoop(!transport.loop)}
        />
      </div>

      <div className="time-display">
        <span className="time-current">{formatTime(transport.currentTime)}</span>
        <span className="time-sep">/</span>
        <span className="time-total">{formatTime(duration)}</span>
      </div>

      <div className="transport-info">
        <span className="transport-bpm">
          <Music size={12} />
          {bpm} <small>BPM</small>
        </span>
        <span className="transport-sig">
          {project.score.timeSigs[0]?.numerator || 4}/{project.score.timeSigs[0]?.denominator || 4}
        </span>
        {transport.loop ? (
          <span className="transport-loop-range">
            {formatTime(transport.loopStart, false)} – {formatTime(transport.loopEnd || duration, false)}
          </span>
        ) : null}
      </div>

      <div className="transport-spacer" />

      <div className="transport-group transport-toggles">
        <button
          type="button"
          className={clsx('transport-toggle', transport.follow && 'active')}
          onClick={() => setFollow(!transport.follow)}
          title={t('transport.follow')}
        >
          <Crosshair size={14} />
          <span>{t('transport.follow')}</span>
        </button>
        <div className="transport-monitor" ref={monitorRef}>
          <button
            type="button"
            className={clsx('transport-monitor-trigger', monitorOpen && 'open')}
            onClick={() => setMonitorOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={monitorOpen}
            aria-label={t('transport.vocalMode')}
            title={t('transport.vocalMode')}
          >
            {activeMode.icon}
            <span>{activeMode.label}</span>
            <ChevronDown size={10} className={clsx('monitor-chevron', monitorOpen && 'open')} />
          </button>
          {monitorOpen ? (
            <div className="transport-monitor-menu" role="listbox" aria-label={t('transport.vocalMode')}>
              {vocalModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="option"
                  aria-selected={mode.value === transport.vocalMode}
                  className={clsx('transport-monitor-item', mode.value === transport.vocalMode && 'active')}
                  onClick={() => {
                    setVocalMode(mode.value);
                    setMonitorOpen(false);
                  }}
                >
                  {mode.icon}
                  <span>{mode.label}</span>
                  {mode.value === transport.vocalMode ? <Check size={13} className="monitor-check" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={clsx('transport-toggle', reference && !reference.muted && 'active')}
          onClick={() => reference && setReference({ muted: !reference.muted })}
          disabled={!reference}
          title={reference ? (reference.muted ? t('reference.unmute') : t('reference.mute')) : t('reference.none')}
        >
          {reference && !reference.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
          <span>{t('transport.reference')}</span>
        </button>
      </div>

      <div className="master-volume">
        <Volume2 size={14} />
        <Slider
          value={Math.round((useAppStore.getState().settings?.masterVolume ?? transport.masterVolume) * 100)}
          min={0}
          max={100}
          onChange={(v) => setMasterVolume(v / 100)}
          ariaLabel={t('transport.master')}
        />
        <span>{Math.round((useAppStore.getState().settings?.masterVolume ?? transport.masterVolume) * 100)}</span>
      </div>
    </footer>
  );
}
