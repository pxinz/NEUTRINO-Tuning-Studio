import React from 'react';
import { useTranslation } from 'react-i18next';
import {
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
  const reference = project.reference;
  const setReference = useAppStore((s) => s.setReference);

  const duration = audio.duration || transport.duration || 0;
  const hasAudio = audio.loaded;
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
        {reference ? (
          <button
            type="button"
            className={clsx('transport-toggle', !reference.muted && 'active')}
            onClick={() => setReference({ muted: !reference.muted })}
            title={t('reference.mute')}
          >
            {reference.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{reference.name || t('transport.reference')}</span>
          </button>
        ) : null}
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
