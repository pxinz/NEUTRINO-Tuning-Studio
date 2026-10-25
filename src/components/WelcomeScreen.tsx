import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  FolderOpen,
  FolderSearch,
  Languages,
  Loader2,
  Moon,
  Music2,
  Play,
  Settings,
  Sparkles,
  Sun,
  Upload,
  Waves,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';
import { Button, IconButton } from './ui';
import type { Language, Theme } from '../lib/types';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const appInfo = useAppStore((s) => s.appInfo);
  const neutrino = useAppStore((s) => s.neutrino);
  const models = useAppStore((s) => s.models);
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const engineLoading = useAppStore((s) => s.engineLoading);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setTheme = useAppStore((s) => s.setTheme);
  const refreshEngine = useAppStore((s) => s.refreshEngine);
  const openDemo = useAppStore((s) => s.openDemo);
  const newProject = useAppStore((s) => s.newProject);
  const importMusicXmlDialog = useAppStore((s) => s.importMusicXmlDialog);
  const openProjectDialog = useAppStore((s) => s.openProjectDialog);
  const dismissWelcome = useAppStore((s) => s.dismissWelcome);
  const openProjectPath = useAppStore((s) => s.openProjectPath);
  const setModal = useAppStore((s) => s.setModal);

  const [root, setRoot] = useState(settings?.neutrinoRoot || '');
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    setRoot(settings?.neutrinoRoot || '');
  }, [settings?.neutrinoRoot]);

  const recent = settings?.recentProjects || [];
  const backendLang = settings?.language || 'auto';

  const browse = async () => {
    setBrowsing(true);
    try {
      const dir = await window.api.directoryDialog({ title: t('settings.engineRoot'), defaultPath: root || undefined });
      if (dir) {
        setRoot(dir);
        await refreshEngine({ root: dir });
      }
    } finally {
      setBrowsing(false);
    }
  };

  const modelName = (m: (typeof models)[number]) => {
    const key = language === 'zh' ? 'zh' : language === 'ja' ? 'ja' : 'en';
    return m.localizedNames?.[key] || m.name || m.id;
  };

  const cycleLanguage = () => {
    const order: Language[] = ['auto', 'zh', 'en', 'ja'];
    const idx = order.indexOf(backendLang);
    void setLanguage(order[(idx + 1) % order.length]);
  };

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    void setTheme(next);
  };

  return (
    <div className="welcome">
      <div className="welcome-bg">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="welcome-grid" />
      </div>

      <header className="welcome-top">
        <div className="welcome-wordmark">
          <strong>NEUTRINO</strong>
          <span>Tuning Studio</span>
        </div>
        <div className="welcome-top-actions">
          <Button variant="ghost" size="sm" onClick={cycleLanguage}>
            <Languages size={15} />
            {language.toUpperCase()}
          </Button>
          <IconButton
            icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            label={t('topbar.theme')}
            onClick={toggleTheme}
          />
          <IconButton icon={<Settings size={16} />} label={t('topbar.settings')} onClick={() => setModal('settings')} />
        </div>
      </header>

      <main className="welcome-main">
        <section className="welcome-hero">
          <div className="welcome-kicker">
            <Sparkles size={14} />
            NEUTRINO Tau · Tuning environment
          </div>
          <h1>{t('app.title')}</h1>
          <p className="welcome-subtitle">{t('app.subtitle')}</p>
          <div className="welcome-features">
            <div>
              <Music2 size={18} />
              <span>{t('tabs.score')}</span>
            </div>
            <div>
              <Waves size={18} />
              <span>{t('tabs.pitch')}</span>
            </div>
            <div>
              <Play size={18} />
              <span>{t('tabs.timing')}</span>
            </div>
            <div>
              <Sparkles size={18} />
              <span>{t('tabs.dynamics')}</span>
            </div>
          </div>
          <div className="welcome-tip">
            <div className="welcome-tip-icon">✦</div>
            <div>
              <strong>{t('welcome.tipTitle')}</strong>
              <p>{t('welcome.tip')}</p>
            </div>
          </div>
        </section>

        <section className="welcome-panel">
          <div className="welcome-panel-head">
            <div>
              <h2>{t('welcome.engineTitle')}</h2>
              <p>{t('welcome.engineHint')}</p>
            </div>
            <span className={clsx('engine-status-pill', neutrino?.ok ? 'ok' : 'error')}>
              <span className="status-dot" />
              {neutrino?.ok ? t('welcome.engineReady') : t('welcome.engineMissing')}
            </span>
          </div>

          <div className="engine-path-row">
            <div className="engine-path-input">
              <FolderOpen size={15} />
              <input
                value={root}
                placeholder={
                  appInfo?.platform === 'win32'
                    ? 'C:\\Program Files\\NEUTRINO'
                    : appInfo?.platform === 'darwin'
                      ? '/Applications/NEUTRINO'
                      : '/opt/NEUTRINO'
                }
                onChange={(e) => setRoot(e.target.value)}
                spellCheck={false}
              />
            </div>
            <Button variant="secondary" onClick={() => void refreshEngine({ root })} disabled={engineLoading}>
              {engineLoading ? <Loader2 size={15} className="spin" /> : <FolderSearch size={15} />}
              {t('common.detect')}
            </Button>
            <Button variant="ghost" onClick={() => void browse()} disabled={browsing}>
              {t('common.browse')}
            </Button>
          </div>

          {neutrino?.ok ? (
            <div className="engine-result">
              <div className="engine-result-head">
                <Check size={15} />
                <span>{neutrino.version || 'NEUTRINO Tau'}</span>
                <span className="engine-root" title={neutrino.root}>
                  {neutrino.root}
                </span>
              </div>
              <div className="model-chips">
                {models.slice(0, 8).map((m) => (
                  <span key={m.id} className="model-chip">
                    {modelName(m)}
                  </span>
                ))}
                {models.length > 8 ? <span className="model-chip muted">+{models.length - 8}</span> : null}
              </div>
              <div className="engine-meta">{t('welcome.models', { count: models.length })}</div>
            </div>
          ) : (
            <div className="engine-error">
              <CircleAlert size={16} />
              <div>
                <strong>{t('welcome.notFound')}</strong>
                <p>{neutrino?.error || t('welcome.notFoundHint')}</p>
              </div>
            </div>
          )}

          <div className="welcome-actions">
            <Button variant="primary" size="lg" className="grow" onClick={() => void openDemo()}>
              <Sparkles size={17} />
              {t('welcome.openDemo')}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => void newProject()}>
              <Music2 size={16} />
              {t('welcome.newProject')}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => void importMusicXmlDialog()}>
              <Upload size={16} />
              {t('welcome.import')}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => void openProjectDialog()}>
              <FolderOpen size={16} />
              {t('project.open')}
            </Button>
          </div>

          <div className="welcome-foot">
            <button type="button" className="link-btn" onClick={() => void dismissWelcome()}>
              {t('welcome.skip')} <ChevronRight size={13} />
            </button>
          </div>
        </section>
      </main>

      {recent.length ? (
        <section className="recent-projects">
          <div className="recent-head">
            <h3>{t('welcome.recent')}</h3>
          </div>
          <div className="recent-list">
            {recent.slice(0, 5).map((p) => (
              <button key={p} type="button" className="recent-item" onClick={() => void openProjectPath(p)} title={p}>
                <div className="recent-icon">
                  <Music2 size={16} />
                </div>
                <div className="recent-meta">
                  <strong>{p.replace(/\\/g, '/').split('/').pop()?.replace(/\.ntstudio$/, '')}</strong>
                  <span>{p}</span>
                </div>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="welcome-footer">
        <span>{t('welcome.license')}</span>
        <button
          type="button"
          className="link-btn"
          onClick={() => void window.api.openExternal('https://studio-neutrino.com/')}
        >
          studio-neutrino.com
        </button>
      </footer>
    </div>
  );
}
