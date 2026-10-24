import React from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  Activity,
  AlertTriangle,
  AudioLines,
  Circle,
  FileText,
  HardDrive,
  Settings2,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { useAppStore } from '../state/useAppStore';
import { formatTime } from '../lib/time';
import { IconButton } from './ui';

export default function StatusBar() {
  const { t } = useTranslation();
  const neutrino = useAppStore((s) => s.neutrino);
  const project = useAppStore((s) => s.project);
  const models = useAppStore((s) => s.models);
  const audio = useAppStore((s) => s.audio);
  const render = useAppStore((s) => s.render);
  const logOpen = useAppStore((s) => s.logOpen);
  const toggleLog = useAppStore((s) => s.toggleLog);
  const setModal = useAppStore((s) => s.setModal);
  const viewport = useAppStore((s) => s.viewport);
  const selection = useAppStore((s) => s.selection);
  const exporting = useAppStore((s) => s.exporting);

  const model = models.find((m) => m.id === project.synth.model);
  const running = render.status === 'running';

  return (
    <div className="statusbar">
      <button type="button" className="status-item clickable" onClick={() => setModal('settings')}>
        <span className={clsx('status-dot', neutrino?.ok ? 'ok' : 'error')} />
        <Settings2 size={12} />
        <span>{neutrino?.ok ? neutrino.version || 'NEUTRINO Tau' : t('welcome.engineMissing')}</span>
      </button>
      <span className="status-sep" />
      <div className="status-item" title={model?.licensePath || ''}>
        <AudioLines size={12} />
        <span>{model ? `${model.localizedNames?.[useAppStore.getState().language === 'zh' ? 'zh' : useAppStore.getState().language === 'ja' ? 'ja' : 'en'] || model.name}` : t('voice.noModels')}</span>
      </div>
      <span className="status-sep" />
      <div className="status-item">
        <HardDrive size={12} />
        <span>
          {audio.loaded
            ? `${audio.sampleRate} Hz · ${audio.channels} ch · ${formatTime(audio.duration, false)}`
            : t('status.notReady')}
        </span>
      </div>
      <span className="status-sep" />
      <div className="status-item">
        <Circle size={8} fill="currentColor" className={audio.loaded ? 'ok-text' : ''} />
        <span>{t('project.notes', { count: project.score.notes.length })}</span>
        {selection.length ? (
          <span className="status-accent"> · {t('status.selected', { count: selection.length })}</span>
        ) : null}
      </div>

      <div className="status-spacer" />

      {exporting ? (
        <span className="status-item status-accent">
          <Sparkles size={12} className="spin" /> {t('status.exporting')}
        </span>
      ) : null}
      {render.error ? (
        <button type="button" className="status-item status-error clickable" onClick={toggleLog}>
          <AlertTriangle size={12} />
          <span>{render.error}</span>
        </button>
      ) : running ? (
        <button type="button" className="status-item status-accent clickable" onClick={toggleLog}>
          <Activity size={12} />
          <span>{render.percent}%</span>
          <span className="status-progress">
            <span style={{ width: `${render.percent}%` }} />
          </span>
        </button>
      ) : render.status === 'done' && audio.loaded ? (
        <span className="status-item ok-text">
          <Sparkles size={12} />
          {t('status.rendered')}
        </span>
      ) : null}
      <span className="status-sep" />
      <div className="status-item" title={t('transport.zoom')}>
        <span>{Math.round(viewport.pxPerSec)} px/s</span>
      </div>
      <button
        type="button"
        className={clsx('status-item clickable', logOpen && 'active')}
        onClick={toggleLog}
        title={t('topbar.log')}
      >
        <TerminalSquare size={12} />
        <span>{t('topbar.log')}</span>
      </button>
    </div>
  );
}
