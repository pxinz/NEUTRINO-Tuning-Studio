import React, { useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from './state/useAppStore';
import TopBar from './components/TopBar';
import EditorArea from './components/EditorArea';
import Transport from './components/Transport';
import StatusBar from './components/StatusBar';
import LogDrawer from './components/LogDrawer';
import WelcomeScreen from './components/WelcomeScreen';
import SettingsModal from './components/SettingsModal';
import HelpModal from './components/HelpModal';
import AboutModal from './components/AboutModal';
import ProjectModal from './components/ProjectModal';
import LyricsModal from './components/LyricsModal';
import CloseConfirmModal from './components/CloseConfirmModal';
import DiscardConfirmModal from './components/DiscardConfirmModal';
import ToastStack from './components/ToastStack';
import { SHORTCUT_ACTIONS, SHORTCUT_DEFAULTS, matchesShortcut } from './lib/shortcuts';

export default function App() {
  const { t } = useTranslation();
  const booted = useAppStore((s) => s.booted);
  const booting = useAppStore((s) => s.booting);
  const welcomeOpen = useAppStore((s) => s.welcomeOpen);
  const project = useAppStore((s) => s.project);
  const dirty = useAppStore((s) => s.dirty);
  const tab = useAppStore((s) => s.tab);
  const selection = useAppStore((s) => s.selection);
  const modal = useAppStore((s) => s.modal);
  const theme = useAppStore((s) => s.theme);
  const autoSave = useAppStore((s) => s.settings?.autoSave);

  useEffect(() => {
    void useAppStore.getState().boot();
  }, []);

  useEffect(() => {
    const unsubMenu = window.api.onMenuAction((action) => {
      const s = useAppStore.getState();
      switch (action) {
        case 'new-project':
          void s.newProject();
          break;
        case 'open-project':
          void s.openProjectDialog();
          break;
        case 'save-project':
          void s.saveProject();
          break;
        case 'save-project-as':
          void s.saveProject(true);
          break;
        case 'import-musicxml':
          void s.importMusicXmlDialog();
          break;
        case 'import-midi':
          void s.importMidiDialog();
          break;
        case 'export-wav':
          void s.exportVocalWav();
          break;
        case 'export-mix':
          void s.exportMixdown();
          break;
        case 'export-musicxml':
          void s.exportMusicXmlFile();
          break;
        case 'undo':
          s.undo();
          break;
        case 'redo':
          s.redo();
          break;
        case 'copy':
          s.copySelection();
          break;
        case 'cut':
          s.copySelection();
          s.deleteSelection();
          break;
        case 'paste':
          s.pasteClipboard();
          break;
        case 'delete':
          s.deleteSelection();
          break;
        case 'select-all':
          s.selectAll();
          break;
        case 'tab-score':
          s.setTab('score');
          break;
        case 'tab-timing':
          s.setTab('timing');
          break;
        case 'tab-pitch':
          s.setTab('pitch');
          break;
        case 'tab-dynamics':
          s.setTab('dynamics');
          break;
        case 'toggle-log':
          s.toggleLog();
          break;
        case 'settings':
          s.setModal('settings');
          break;
        case 'help':
          s.setModal('help');
          break;
        case 'about':
          s.setModal('about');
          break;
        default:
          break;
      }
    });
    const unsubSettings = window.api.onSettingsChanged((next) => {
      useAppStore.getState().syncSettings(next);
    });
    const unsubClose = window.api.onRequestClose(() => {
      const s = useAppStore.getState();
      if (!s.dirty) {
        void window.api.confirmClose();
        return;
      }
      s.setModal('close');
    });
    return () => {
      unsubMenu();
      unsubSettings();
      unsubClose();
    };
  }, []);

  useEffect(() => {
    void window.api.setDirty(dirty);
  }, [dirty]);

  useEffect(() => {
    if (!autoSave) return;
    const timer = window.setInterval(() => {
      const s = useAppStore.getState();
      if (s.dirty && s.projectPath && s.render.status !== 'running' && !s.exporting) {
        void s.saveProject(false, true);
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [booted, autoSave]);

  useEffect(() => {
    document.documentElement.dataset.theme =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (useAppStore.getState().theme !== 'system') return;
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const title = `${project.name || 'Untitled'}${dirty ? ' •' : ''} — NEUTRINO Tuning Studio`;
    void window.api.setTitle(title);
  }, [project.name, project.id, dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const s = useAppStore.getState();
      if (e.key === 'Escape') {
        if (!s.modal) s.clearSelection();
        return;
      }
      if (target?.closest('[data-shortcut-recorder]')) return;
      if (s.modal) return;

      const bindings = { ...SHORTCUT_DEFAULTS, ...(s.settings?.shortcuts || {}) };
      const action = SHORTCUT_ACTIONS.find((id) => matchesShortcut(e, bindings[id]));
      const allowedWhileEditing = new Set([
        'newProject',
        'openProject',
        'saveProject',
        'saveAs',
        'render',
      ]);
      if (action && (!editing || allowedWhileEditing.has(action))) {
        e.preventDefault();
        switch (action) {
          case 'playPause':
            if (s.transport.playing) s.pause();
            else void s.play();
            break;
          case 'stop':
            s.stop();
            break;
          case 'toolSelect':
            s.setTool('select');
            break;
          case 'toolPencil':
            s.setTool('pencil');
            break;
          case 'toolEraser':
            s.setTool('eraser');
            break;
          case 'render':
            void s.renderVocal();
            break;
          case 'newProject':
            void s.newProject();
            break;
          case 'openProject':
            void s.openProjectDialog();
            break;
          case 'saveProject':
            void s.saveProject();
            break;
          case 'saveAs':
            void s.saveProject(true);
            break;
          case 'undo':
            s.undo();
            break;
          case 'redo':
            s.redo();
            break;
          case 'toggleLoop':
            s.setLoop(!s.transport.loop);
            break;
          case 'toggleFollow':
            s.setFollow(!s.transport.follow);
            break;
          case 'tabScore':
            s.setTab('score');
            break;
          case 'tabTiming':
            s.setTab('timing');
            break;
          case 'tabPitch':
            s.setTab('pitch');
            break;
          case 'tabDynamics':
            s.setTab('dynamics');
            break;
          case 'toggleLog':
            s.toggleLog();
            break;
        }
        return;
      }
      if (editing) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && s.tab === 'score' && s.selection.length) {
        e.preventDefault();
        s.deleteSelection();
        return;
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && s.tab === 'score' && s.selection.length) {
        e.preventDefault();
        s.transposeSelection((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!booted) {
    return (
      <div className="boot-screen">
        <div className="boot-logo">
          <h1>NEUTRINO Tuning Studio</h1>
          <p>{t('common.loading')}</p>
          <Loader2 className="spin" size={18} />
        </div>
        <ToastStack />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {welcomeOpen ? (
        <WelcomeScreen />
      ) : (
        <>
          <TopBar />
          <EditorArea />
          <LogDrawer />
          <Transport />
          <StatusBar />
        </>
      )}
      <SettingsModal />
      <HelpModal />
      <AboutModal />
      <ProjectModal />
      <LyricsModal />
      <CloseConfirmModal />
      <DiscardConfirmModal />
      <ToastStack />
      {booting ? (
        <div className="booting-overlay">
          <Loader2 size={18} className="spin" />
        </div>
      ) : null}
    </div>
  );
}
