import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  Info,
  Languages,
  Loader2,
  Settings2,
  Sparkles,
  Volume2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';
import { Modal, Button, Field, NumberField, Slider, Toggle } from './ui';
import type { Language, Settings, Theme } from '../lib/types';

type Tab = 'general' | 'engine' | 'audio' | 'about';

export default function SettingsModal() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.modal === 'settings');
  const setModal = useAppStore((s) => s.setModal);
  const settings = useAppStore((s) => s.settings);
  const appInfo = useAppStore((s) => s.appInfo);
  const neutrino = useAppStore((s) => s.neutrino);
  const models = useAppStore((s) => s.models);
  const engineLoading = useAppStore((s) => s.engineLoading);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshEngine = useAppStore((s) => s.refreshEngine);
  const pushToast = useAppStore((s) => s.pushToast);
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setTab('general');
    }
  }, [open, settings]);

  if (!open || !draft) return null;

  const showWine = appInfo?.platform === 'linux';
  const effectiveRunner: Settings['runner'] = showWine ? draft.runner : 'native';

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const browse = async () => {
    const dir = await window.api.directoryDialog({ title: t('settings.engineRoot'), defaultPath: draft.neutrinoRoot || undefined });
    if (dir) {
      set('neutrinoRoot', dir);
      await refreshEngine({ root: dir, runner: effectiveRunner, wineCommand: draft.wineCommand });
      const next = useAppStore.getState().settings;
      if (next) setDraft((d) => (d ? { ...d, neutrinoRoot: next.neutrinoRoot } : d));
    }
  };

  const detect = async () => {
    await refreshEngine({ root: draft.neutrinoRoot, runner: effectiveRunner, wineCommand: draft.wineCommand });
    const next = useAppStore.getState().settings;
    if (next) setDraft((d) => (d ? { ...d, neutrinoRoot: next.neutrinoRoot } : d));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({
        language: draft.language,
        theme: draft.theme,
        neutrinoRoot: draft.neutrinoRoot,
        runner: effectiveRunner,
        wineCommand: draft.wineCommand,
        threads: draft.threads,
        sampleRate: draft.sampleRate,
        bitDepth: draft.bitDepth,
        masterVolume: draft.masterVolume,
        autoSave: draft.autoSave,
        defaultModel: draft.defaultModel,
        scrollWheelMode: draft.scrollWheelMode,
      });
      if (draft.neutrinoRoot && draft.neutrinoRoot !== neutrino?.root) {
        await refreshEngine({ root: draft.neutrinoRoot, runner: effectiveRunner, wineCommand: draft.wineCommand, silent: true });
      }
      pushToast('success', t('settings.saved'));
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('settings.title')}
      onClose={() => setModal(null)}
      width={780}
      footer={
        <>
          <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          {(['general', 'engine', 'audio', 'about'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              className={clsx('settings-tab', tab === id && 'active')}
              onClick={() => setTab(id)}
            >
              {id === 'general' ? <Languages size={15} /> : id === 'engine' ? <Sparkles size={15} /> : id === 'audio' ? <Volume2 size={15} /> : <Info size={15} />}
              {t(`settings.${id}`)}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'general' ? (
            <>
              <Field label={t('settings.language')}>
                <select className="select" value={draft.language} onChange={(e) => set('language', e.target.value as Language)}>
                  <option value="auto">{t('settings.languageAuto')}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                </select>
              </Field>
              <Field label={t('settings.theme')}>
                <select className="select" value={draft.theme} onChange={(e) => set('theme', e.target.value as Theme)}>
                  <option value="dark">{t('theme.dark')}</option>
                  <option value="light">{t('theme.light')}</option>
                  <option value="system">{t('theme.system')}</option>
                </select>
              </Field>
              <Field label={t('settings.scrollWheel')} hint={t('settings.scrollWheelHint')}>
                <select
                  className="select"
                  value={draft.scrollWheelMode}
                  onChange={(e) => set('scrollWheelMode', e.target.value as Settings['scrollWheelMode'])}
                >
                  <option value="horizontal">{t('settings.scrollWheelHorizontal')}</option>
                  <option value="vertical">{t('settings.scrollWheelVertical')}</option>
                </select>
              </Field>
              <Toggle checked={draft.autoSave} onChange={(v) => set('autoSave', v)} label={t('settings.autoSave')} />
              <Field label={t('voice.threads')}>
                <NumberField value={draft.threads} min={1} max={64} onChange={(v) => set('threads', Math.round(v))} />
              </Field>
            </>
          ) : null}

          {tab === 'engine' ? (
            <>
              <div className={clsx('settings-engine-status', neutrino?.ok ? 'ok' : 'error')}>
                <span className="status-dot" />
                <div>
                  <strong>{neutrino?.ok ? t('welcome.engineReady') : t('welcome.engineMissing')}</strong>
                  <span>{neutrino?.ok ? neutrino.version || 'NEUTRINO Tau' : neutrino?.error || t('settings.detectHint')}</span>
                </div>
                {neutrino?.ok ? <Check size={16} /> : <CircleAlert size={16} />}
              </div>
              <Field label={t('settings.engineRoot')} hint={t('settings.engineRootHint')}>
                <div className="input-row">
                  <input className="text-input mono" value={draft.neutrinoRoot} onChange={(e) => set('neutrinoRoot', e.target.value)} spellCheck={false} />
                  <Button size="sm" variant="secondary" onClick={() => void browse()}>
                    <FolderOpen size={14} /> {t('common.browse')}
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void detect()} disabled={engineLoading}>
                    {engineLoading ? <Loader2 size={14} className="spin" /> : <Settings2 size={14} />} {t('common.detect')}
                  </Button>
                </div>
              </Field>
              <div className="settings-grid-2">
                <Field label={t('settings.runner')}>
                  <select className="select" value={effectiveRunner} onChange={(e) => set('runner', e.target.value as Settings['runner'])}>
                    <option value="auto">{t('settings.runnerAuto')}</option>
                    <option value="native">{t('settings.runnerNative')}</option>
                    {showWine ? <option value="wine">{t('settings.runnerWine')}</option> : null}
                  </select>
                </Field>
                {showWine ? (
                  <Field label={t('settings.wine')} hint={t('settings.wineHint')}>
                    <input className="text-input mono" value={draft.wineCommand} onChange={(e) => set('wineCommand', e.target.value)} />
                  </Field>
                ) : null}
              </div>
              <Field label={t('settings.models')}>
                <div className="settings-model-list">
                  {models.length ? models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={clsx('settings-model', draft.defaultModel === m.id && 'active')}
                      onClick={() => set('defaultModel', m.id)}
                    >
                      <span>{m.localizedNames?.[draft.language === 'zh' ? 'zh' : draft.language === 'ja' ? 'ja' : 'en'] || m.name}</span>
                      <small>{m.id} · {m.version?.startsWith('v') ? m.version : `v${m.version}`}</small>
                    </button>
                  )) : <span className="rp-hint">{t('voice.noModels')}</span>}
                </div>
              </Field>
              <div className="settings-links">
                <button type="button" className="link-btn" onClick={() => void window.api.openExternal('https://studio-neutrino.com/')}>
                  <ExternalLink size={12} /> {t('settings.docs')}
                </button>
              </div>
            </>
          ) : null}

          {tab === 'audio' ? (
            <>
              <Field label={t('settings.audio.sampleRate')}>
                <select className="select" value={draft.sampleRate} onChange={(e) => set('sampleRate', Number(e.target.value))}>
                  <option value={48000}>48 kHz</option>
                  <option value={44100}>44.1 kHz</option>
                  <option value={32000}>32 kHz</option>
                </select>
              </Field>
              <Field label={t('settings.audio.bitDepth')}>
                <select className="select" value={draft.bitDepth} onChange={(e) => set('bitDepth', Number(e.target.value))}>
                  <option value={16}>16 bit</option>
                  <option value={24}>24 bit</option>
                  <option value={32}>32 bit float</option>
                </select>
              </Field>
              <Field label={`${t('settings.audio.master')} ${Math.round(draft.masterVolume * 100)}%`}>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={draft.masterVolume}
                  onChange={(v) => set('masterVolume', v)}
                />
              </Field>
              <div className="settings-note">
                <Info size={14} />
                <span>{t('render.takes')}</span>
              </div>
            </>
          ) : null}

          {tab === 'about' ? (
            <div className="about-body">
              <div className="about-logo about-logo-text">
                <div>
                  <strong>NEUTRINO Tuning Studio</strong>
                  <span>{t('about.version', { version: appInfo?.version || '1.0.0' })}</span>
                </div>
              </div>
              <p>{t('about.description')}</p>
              <div className="about-meta">
                <div><span>Electron</span><strong>{appInfo?.electron || '—'}</strong></div>
                <div><span>Chromium</span><strong>{appInfo?.chrome || '—'}</strong></div>
                <div><span>{t('about.neutrino')}</span><strong>{neutrino?.version || '—'}</strong></div>
              </div>
              <p className="about-disclaimer">{t('about.disclaimer')}</p>
              <div className="settings-links">
                <button type="button" className="link-btn" onClick={() => void window.api.openExternal('https://studio-neutrino.com/')}>
                  <ExternalLink size={12} /> studio-neutrino.com
                </button>
                <span>{t('about.license')}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
