import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  CircleHelp,
  Download,
  FileMusic,
  FilePlus2,
  FolderOpen,
  Gauge,
  History,
  Languages,
  Moon,
  Music2,
  Play,
  Redo2,
  Save,
  Settings,
  Sparkles,
  Square,
  Sun,
  Undo2,
  Upload,
  Waves,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';
import { Button, Dropdown, IconButton, MenuItem } from './ui';
import type { EditorTab, Language, Theme } from '../lib/types';

const TABS: Array<{ id: EditorTab; icon: React.ReactNode; key: string }> = [
  { id: 'score', icon: <Music2 size={15} />, key: 'tabs.score' },
  { id: 'timing', icon: <Activity size={15} />, key: 'tabs.timing' },
  { id: 'pitch', icon: <Waves size={15} />, key: 'tabs.pitch' },
  { id: 'dynamics', icon: <Gauge size={15} />, key: 'tabs.dynamics' },
];

export default function TopBar() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const projectPath = useAppStore((s) => s.projectPath);
  const dirty = useAppStore((s) => s.dirty);
  const tab = useAppStore((s) => s.tab);
  const neutrino = useAppStore((s) => s.neutrino);
  const render = useAppStore((s) => s.render);
  const settings = useAppStore((s) => s.settings);
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const setTab = useAppStore((s) => s.setTab);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const newProject = useAppStore((s) => s.newProject);
  const openProjectDialog = useAppStore((s) => s.openProjectDialog);
  const openProjectPath = useAppStore((s) => s.openProjectPath);
  const saveProject = useAppStore((s) => s.saveProject);
  const importMusicXmlDialog = useAppStore((s) => s.importMusicXmlDialog);
  const importMidiDialog = useAppStore((s) => s.importMidiDialog);
  const exportVocalWav = useAppStore((s) => s.exportVocalWav);
  const exportMixdown = useAppStore((s) => s.exportMixdown);
  const exportMusicXmlFile = useAppStore((s) => s.exportMusicXmlFile);
  const renderVocal = useAppStore((s) => s.renderVocal);
  const cancelRender = useAppStore((s) => s.cancelRender);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const history = useAppStore((s) => s.history);
  const future = useAppStore((s) => s.future);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setTheme = useAppStore((s) => s.setTheme);
  const setModal = useAppStore((s) => s.setModal);
  const toggleLog = useAppStore((s) => s.toggleLog);
  const logOpen = useAppStore((s) => s.logOpen);

  const [nameDraft, setNameDraft] = useState(project.name);
  const nameFocused = useRef(false);
  useEffect(() => {
    if (!nameFocused.current) setNameDraft(project.name);
  }, [project.name, project.id]);

  const commitName = () => {
    nameFocused.current = false;
    if (nameDraft.trim() !== project.name) setProjectName(nameDraft);
    else setNameDraft(project.name);
  };

  const renderBusy = render.status === 'running';
  const canRender = Boolean(neutrino?.ok) && project.score.notes.length > 0;

  const recentItems: MenuItem[] = (settings?.recentProjects || []).slice(0, 5).map((path) => {
    const name = path.replace(/\\/g, '/').split('/').pop() || path;
    return {
      label: name.replace(/\.(ntstudio|json)$/i, ''),
      icon: <History size={15} />,
      onClick: () => void openProjectPath(path),
    };
  });
  const fileItems: MenuItem[] = [
    { label: t('topbar.new'), icon: <FilePlus2 size={15} />, onClick: () => void newProject(), shortcut: 'Ctrl+N' },
    { label: t('topbar.open'), icon: <FolderOpen size={15} />, onClick: () => void openProjectDialog(), shortcut: 'Ctrl+O' },
    ...(recentItems.length
      ? [
          { separator: true as const },
          { label: t('topbar.recent'), icon: <History size={15} />, disabled: true },
          ...recentItems,
        ]
      : []),
    { separator: true },
    { label: t('topbar.save'), icon: <Save size={15} />, onClick: () => void saveProject(), shortcut: 'Ctrl+S' },
    { label: t('common.saveAs'), icon: <Save size={15} />, onClick: () => void saveProject(true), shortcut: 'Ctrl+Shift+S' },
    { separator: true },
    { label: t('topbar.import'), icon: <Upload size={15} />, onClick: () => void importMusicXmlDialog() },
    { label: t('project.importMidi'), icon: <FileMusic size={15} />, onClick: () => void importMidiDialog() },
  ];

  const exportItems: MenuItem[] = [
    {
      label: t('topbar.exportWav'),
      icon: <Download size={15} />,
      onClick: () => void exportVocalWav(),
      disabled: !useAppStore.getState().audio.loaded,
    },
    {
      label: t('topbar.exportMix'),
      icon: <Download size={15} />,
      onClick: () => void exportMixdown(),
      disabled: !useAppStore.getState().audio.loaded,
    },
    { separator: true },
    {
      label: t('topbar.exportMusicXml'),
      icon: <FileMusic size={15} />,
      onClick: () => void exportMusicXmlFile(),
    },
  ];

  const languageItems: MenuItem[] = [
    { label: t('language.auto'), onClick: () => void setLanguage('auto' as Language) },
    { label: t('language.zh'), onClick: () => void setLanguage('zh' as Language) },
    { label: t('language.en'), onClick: () => void setLanguage('en' as Language) },
    { label: t('language.ja'), onClick: () => void setLanguage('ja' as Language) },
  ];

  const themeItems: MenuItem[] = [
    { label: t('theme.dark'), icon: <Moon size={15} />, onClick: () => void setTheme('dark' as Theme) },
    { label: t('theme.light'), icon: <Sun size={15} />, onClick: () => void setTheme('light' as Theme) },
    { label: t('theme.system'), onClick: () => void setTheme('system' as Theme) },
  ];

  return (
    <header className="topbar">
      <div className="app-identity app-identity-text-only" title="NEUTRINO Tuning Studio">
        <div className="app-identity-text">
          <strong>NEUTRINO</strong>
          <span>Tuning Studio</span>
        </div>
      </div>

      <div className="topbar-divider" />

      <div className="project-block">
        <div className="project-title-row">
          <input
            className="project-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onFocus={() => {
              nameFocused.current = true;
            }}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setNameDraft(project.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
            spellCheck={false}
            aria-label={t('project.name')}
          />
          <span className={clsx('dirty-dot', dirty && 'active')} title={dirty ? t('topbar.unsaved') : t('topbar.saved')} />
        </div>
        <div className="project-path" title={projectPath || t('topbar.notSaved')}>
          {projectPath || t('topbar.notSaved')}
        </div>
      </div>

      <div className="topbar-actions-left">
        <Dropdown trigger={<Button variant="ghost" size="sm"><FolderOpen size={15} />{t('topbar.file')}<ChevronDown size={13} /></Button>} items={fileItems} />
        <IconButton icon={<Save size={16} />} label={t('topbar.save')} onClick={() => void saveProject()} />
        <Dropdown
          trigger={<Button variant="ghost" size="sm"><Download size={15} />{t('topbar.export')}<ChevronDown size={13} /></Button>}
          items={exportItems}
        />
      </div>

      <nav className="tabs" aria-label="Editor">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={clsx('tab', tab === item.id && 'active')}
            onClick={() => setTab(item.id)}
            title={t(item.key)}
          >
            {item.icon}
            <span>{t(item.key)}</span>
          </button>
        ))}
      </nav>

      <div className="topbar-spacer" />

      <div className="topbar-actions-right">
        <IconButton icon={<Undo2 size={16} />} label={t('topbar.undo')} onClick={undo} disabled={!history.length} />
        <IconButton icon={<Redo2 size={16} />} label={t('topbar.redo')} onClick={redo} disabled={!future.length} />
        <div className="topbar-divider small" />
        <Dropdown
          align="right"
          trigger={<IconButton icon={<Languages size={17} />} label={t('topbar.language')} active={language !== 'en'} />}
          items={languageItems}
        />
        <Dropdown
          align="right"
          trigger={
            <IconButton
              icon={theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}
              label={t('topbar.theme')}
            />
          }
          items={themeItems}
        />
        <IconButton icon={<CircleHelp size={17} />} label={t('topbar.help')} onClick={() => setModal('help')} />
        <IconButton icon={<Settings size={17} />} label={t('topbar.settings')} onClick={() => setModal('settings')} />
        <IconButton
          icon={<Activity size={16} />}
          label={t('topbar.log')}
          active={logOpen}
          onClick={toggleLog}
          className="log-toggle"
        />
        {renderBusy ? (
          <button type="button" className="render-btn running" onClick={() => void cancelRender()} title={t('render.cancel')}>
            <span className="render-progress-ring" style={{ '--p': `${render.percent}%` } as React.CSSProperties}>
              <X size={14} />
            </span>
            <span>{render.percent}%</span>
          </button>
        ) : (
          <button
            type="button"
            className="render-btn"
            onClick={() => void renderVocal()}
            disabled={!canRender}
            title={!neutrino?.ok ? t('render.needEngine') : !canRender ? t('render.needScore') : t('render.shortcut')}
          >
            <Sparkles size={16} />
            <span>{project.render ? t('topbar.rerender') : t('topbar.render')}</span>
            <kbd>Ctrl ↵</kbd>
          </button>
        )}
      </div>

      <div className="engine-chip" title={neutrino?.root || t('topbar.engineMissing')}>
        <span className={clsx('status-dot', neutrino?.ok ? 'ok' : 'error')} />
        <span>
          {neutrino?.ok
            ? t('topbar.engineOk', { version: neutrino.version || 'Tau' })
            : t('topbar.engineMissing')}
        </span>
      </div>
    </header>
  );
}
