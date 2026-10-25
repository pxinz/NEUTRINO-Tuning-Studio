import { create } from 'zustand';
import i18n from '../i18n';
import { applyLanguage, resolveLanguage } from '../i18n';
import type {
  AppInfo,
  Dynamics,
  DynamicsPoint,
  EditorTab,
  HistorySnapshot,
  Language,
  ModelInfo,
  NeutrinoInfo,
  Note,
  PhraseInfo,
  Project,
  ReferenceTrack,
  RenderMode,
  RenderResult,
  RenderUiState,
  Settings,
  SynthOptions,
  Theme,
  TimingData,
  Toast,
  Tool,
  WaveformPeaks,
} from '../lib/types';
import {
  addDynamicsPoint,
  defaultDynamics,
  moveDynamicsPoint,
  normalizeDynamics,
  removeDynamicsPoint,
  resetDynamics as resetDynamicsEnvelope,
  smoothDynamics,
} from '../lib/dynamics';
import {
  beatToSeconds,
  createDemoScore,
  createEmptyScore,
  getPhrases,
  getScoreHash,
  normalizeScore,
  overlappingNotes,
  scoreDurationSeconds,
  secondsToBeat,
} from '../lib/score';
import {
  applyVibrato,
  decodeF0,
  encodeF0,
  f0ToBytes,
  parseF0,
  resampleF0,
  smoothF0,
  transposeF0,
  warpF0ByTiming,
} from '../lib/pitch';
import {
  dirtyTimingWindows,
  parseTimingText,
  serializeTiming,
  timingHash,
  updateBoundary,
} from '../lib/timing';
import {
  createProject,
  decodeProject,
  defaultSynth,
  encodeProject,
  projectFileName,
  renderSignature,
} from '../lib/project';
import { musicXmlForNeutrino, importMusicXml, exportMusicXml } from '../lib/musicxml';
import { importMidi } from '../lib/midi';
import { checkLyric } from '../lib/lyrics';
import { timelineEnd } from '../lib/timeline';
import { dirtyPhraseRanges, f0Changed } from '../lib/phrases';
import { audioEngine } from '../lib/audio';
import {
  clamp,
  dbToGain,
  deepClone,
  formatTime,
  hashString,
  midiToFreq,
  uid,
} from '../lib/time';

type Modal = 'settings' | 'help' | 'about' | 'project' | 'lyrics' | 'close' | 'discard' | null;

interface Viewport {
  pxPerSec: number;
  scrollSec: number;
  pitchTop: number;
  pitchBottom: number;
  pitchScroll: number;
}

interface TransportState {
  playing: boolean;
  currentTime: number;
  duration: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  follow: boolean;
  masterVolume: number;
  vocalMode: 'vocal' | 'sine' | 'mute';
}

interface AudioState {
  loaded: boolean;
  loading: boolean;
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: WaveformPeaks | null;
  referencePeaks: WaveformPeaks | null;
  referenceDuration: number;
  error: string | null;
}

export interface AppState {
  booted: boolean;
  booting: boolean;
  appInfo: AppInfo | null;
  settings: Settings | null;
  language: 'en' | 'zh' | 'ja';
  theme: Theme;
  neutrino: NeutrinoInfo | null;
  models: ModelInfo[];
  engineLoading: boolean;

  project: Project;
  projectPath: string | null;
  dirty: boolean;
  lastSavedAt: number | null;
  welcomeOpen: boolean;
  modal: Modal;
  pendingDiscardAction: (() => void | Promise<void>) | null;
  logOpen: boolean;
  exporting: boolean;
  toasts: Toast[];

  tab: EditorTab;
  tool: Tool;
  selection: string[];
  selectedPhoneme: number | null;
  viewport: Viewport;
  transport: TransportState;
  audio: AudioState;
  render: RenderUiState;

  baseF0: Float32Array | null;
  currentF0: Float32Array | null;
  pitchEdited: boolean;
  timing: TimingData | null;
  timingBase: TimingData | null;
  timingEdited: boolean;

  history: HistorySnapshot[];
  future: HistorySnapshot[];
  clipboard: Note[];

  boot(): Promise<void>;
  syncSettings(next: Settings): void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  setLanguage(language: Language): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  refreshEngine(opts?: {
    root?: string;
    runner?: Settings['runner'];
    wineCommand?: string;
    silent?: boolean;
  }): Promise<void>;

  setModal(modal: Modal): void;
  setWelcomeOpen(open: boolean): void;
  dismissWelcome(): Promise<void>;
  toggleLog(): void;
  clearLogs(): void;
  pushToast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;

  newProject(skipConfirm?: boolean): Promise<void>;
  openDemo(skipConfirm?: boolean): Promise<void>;
  openProjectDialog(skipConfirm?: boolean): Promise<void>;
  openProjectPath(path: string, skipConfirm?: boolean): Promise<void>;
  saveProject(saveAs?: boolean, silent?: boolean): Promise<boolean>;
  resolveDiscard(choice: 'save' | 'discard' | 'cancel'): Promise<void>;
  importMusicXmlDialog(skipConfirm?: boolean): Promise<void>;
  importMidiDialog(skipConfirm?: boolean): Promise<void>;
  loadMusicXmlPath(path: string): Promise<void>;
  loadMidiPath(path: string): Promise<void>;
  exportMusicXmlFile(): Promise<void>;
  setProjectName(name: string): void;
  setSynth(patch: Partial<SynthOptions>): void;
  setProjectMeta(patch: {
    title?: string;
    artist?: string;
    bpm?: number;
    numerator?: number;
    denominator?: number;
  }): void;

  setScore(score: Project['score'], historyLabel?: string): void;
  updateNote(id: string, patch: Partial<Note>, historyLabel?: string): void;
  addNote(note: Partial<Note>, historyLabel?: string): void;
  deleteNotes(ids: string[], historyLabel?: string): void;
  setLyrics(lyrics: Record<string, string>, historyLabel?: string): void;
  setTab(tab: EditorTab): void;
  setTool(tool: Tool): void;
  selectNotes(ids: string[], additive?: boolean): void;
  toggleSelection(id: string): void;
  clearSelection(): void;
  selectAll(): void;
  setSelectedPhoneme(index: number | null): void;
  copySelection(): void;
  pasteClipboard(): void;
  duplicateSelection(): void;
  transposeSelection(semitones: number): void;
  deleteSelection(): void;

  pushHistory(label: string): void;
  undo(): void;
  redo(): void;

  setViewport(patch: Partial<Viewport>): void;
  fitTimeline(width: number): void;
  setPitchRange(top: number, bottom: number): void;
  fitPitchRange(): void;

  setTimingFromRender(text: string, scoreHash: string, edited?: boolean): void;
  setTimingText(text: string, edited?: boolean): void;
  updateTimingBoundary(boundaryIndex: number, time: number): void;
  resetTiming(): void;

  setPitchData(base: Float32Array | null, current: Float32Array | null, edited: boolean): void;
  setCurrentF0(f0: Float32Array | null, edited?: boolean): void;
  resetPitch(): void;
  resetPitchRange(startSec: number, endSec: number): void;
  transposePitch(semitones: number, startSec?: number, endSec?: number, historyLabel?: string): void;
  smoothPitchRange(startSec: number, endSec: number, strength: number): void;
  applyVibratoRange(
    startSec: number,
    endSec: number,
    rateHz: number,
    depthCents: number,
    fadeSec: number,
  ): void;
  autoTuneRange(startSec: number, endSec: number, strength: number): void;

  setDynamics(dynamics: Dynamics, historyLabel?: string): void;
  setDynamicsEnabled(enabled: boolean): void;
  addDynamicsPointAt(time: number, db: number): void;
  moveDynamicsPointAt(index: number, time: number, db: number): void;
  removeDynamicsPointAt(index: number): void;
  resetDynamics(): void;
  smoothDynamicsEnvelope(): void;

  loadReferenceDialog(): Promise<void>;
  loadReferencePath(path: string): Promise<void>;
  setReference(patch: Partial<ReferenceTrack>): void;
  removeReference(): void;

  loadAudioForPath(path: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  setLoop(loop: boolean): void;
  setLoopRange(start: number, end: number): void;
  setFollow(follow: boolean): void;
  setMasterVolume(volume: number): void;
  setVocalMode(mode: 'vocal' | 'sine' | 'mute'): void;

  renderVocal(): Promise<void>;
  cancelRender(): Promise<void>;
  exportVocalWav(): Promise<void>;
  exportMixdown(): Promise<void>;
}

const initialRender: RenderUiState = {
  status: 'idle',
  percent: 0,
  stage: '',
  detail: '',
  mode: null,
  renderId: null,
  logs: [],
  error: null,
  result: null,
  startedAt: null,
  elapsedMs: 0,
};

const initialAudio: AudioState = {
  loaded: false,
  loading: false,
  duration: 0,
  sampleRate: 0,
  channels: 0,
  peaks: null,
  referencePeaks: null,
  referenceDuration: 0,
  error: null,
};

function applyTheme(theme: Theme) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function makeInitialProject(settings: Settings | null, models: ModelInfo[]): Project {
  const model =
    models.find((m) => m.id === settings?.defaultModel)?.id || models[0]?.id || '';
  return createProject(createEmptyScore(), defaultSynth(settings || undefined, model), 'Untitled');
}

function snapshotOf(state: AppState, label: string): HistorySnapshot {
  return {
    score: deepClone(state.project.score),
    timing: state.timing ? deepClone(state.timing) : null,
    baseF0: state.baseF0 ? state.baseF0.slice() : null,
    currentF0: state.currentF0 ? state.currentF0.slice() : null,
    pitchEdited: state.pitchEdited,
    dynamics: deepClone(state.project.dynamics),
    reference: state.project.reference ? { ...state.project.reference } : null,
    label,
  };
}

function fileBaseName(p: string): string {
  const clean = p.replace(/\\/g, '/');
  return clean.slice(clean.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
}

function timingFromText(text: string, scoreHash: string, edited = false): TimingData | null {
  return parseTimingText(text, scoreHash);
}

export const useAppStore = create<AppState>((set, get) => {
  const activeRenderId = { value: null as string | null };

  const loadAudioForPath = async (path: string) => {
    set((s) => ({ audio: { ...s.audio, loading: true, error: null } }));
    try {
      const bytes = await window.api.readBinary(path);
      const buffer = await audioEngine.loadVocal(bytes);
      audioEngine.stop();
      set((s) => {
        const duration = timelineEnd(
          s.project.score,
          buffer.duration,
          s.project.reference,
          s.audio.referenceDuration,
        );
        return {
          audio: {
            ...s.audio,
            loaded: true,
            loading: false,
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
            peaks: audioEngine.vocalPeaks,
            error: null,
          },
          transport: {
            ...s.transport,
            playing: false,
            currentTime: 0,
            duration,
            loopEnd: Math.min(s.transport.loopEnd || duration, duration),
          },
        };
      });
    } catch (err) {
      set((s) => ({
        audio: { ...s.audio, loading: false, error: (err as Error).message },
      }));
      get().pushToast('warning', i18n.t('errors.readFile'));
    }
  };

  const loadReferenceForPath = async (path: string) => {
    try {
      const bytes = await window.api.readBinary(path);
      const buffer = await audioEngine.loadReference(bytes);
      set((s) => {
        const reference = {
          path,
          name: fileBaseName(path),
          offset: s.project.reference?.offset || 0,
          volume: s.project.reference?.volume ?? 0.8,
          muted: s.project.reference?.muted ?? false,
        };
        const duration = timelineEnd(s.project.score, s.audio.duration, reference, buffer.duration);
        return {
          audio: { ...s.audio, referencePeaks: audioEngine.referencePeaks, referenceDuration: buffer.duration },
          project: { ...s.project, reference },
          transport: {
            ...s.transport,
            duration,
            currentTime: Math.min(s.transport.currentTime, duration),
            loopEnd: Math.min(s.transport.loopEnd || duration, duration),
          },
        };
      });
      get().pushToast('success', i18n.t('notifications.referenceLoaded'));
    } catch (err) {
      get().pushToast('error', i18n.t('reference.decodeFailed'));
    }
  };

  const runRender = (payload: Parameters<typeof window.api.startRender>[0]) => {
    return new Promise<RenderResult>(async (resolve, reject) => {
      let renderId = '';
      const buffered: any[] = [];
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        fn();
      };
      const handle = (ev: any) => {
        if (!renderId) {
          buffered.push(ev);
          return;
        }
        if (ev.renderId !== renderId) return;
        if (ev.type === 'progress') {
          set((s) => ({
            render: {
              ...s.render,
              percent: ev.percent,
              stage: ev.stage || s.render.stage,
              detail: ev.detail || '',
            },
          }));
        } else if (ev.type === 'log') {
          set((s) => ({
            render: {
              ...s.render,
              logs: [...s.render.logs.slice(-599), ev.line],
            },
          }));
        } else if (ev.type === 'done') {
          set((s) => ({
            render: {
              ...s.render,
              percent: 100,
              result: ev.result,
              status: 'running',
              elapsedMs: ev.result.elapsedMs,
            },
          }));
          finish(() => resolve(ev.result));
        } else if (ev.type === 'error') {
          set((s) => ({
            render: {
              ...s.render,
              status: 'error',
              error: ev.error,
              logs: [...s.render.logs.slice(-599), ...(ev.log || [])],
            },
          }));
          finish(() => reject(new Error(ev.error)));
        }
      };
      const unsubscribe = window.api.onRenderEvent(handle);
      try {
        const started = await window.api.startRender(payload);
        renderId = started.renderId;
        activeRenderId.value = renderId;
        set((s) => ({ render: { ...s.render, renderId } }));
        for (const ev of buffered) handle(ev);
      } catch (err) {
        finish(() => reject(err));
      }
    });
  };

  const setRenderFinal = (
    result: RenderResult,
    mode: RenderMode,
    timing: TimingData | null,
    project: Project,
  ) => {
    const now = Date.now();
    const scoreHash = getScoreHash(project.score);
    const tHash = timing ? timingHash(timing.text) : '';
    set((s) => ({
      project: {
        ...s.project,
        render: {
          wavPath: result.wavPath,
          f0Path: result.f0Path,
          melspecPath: result.melspecPath,
          timingPath: result.timingPath,
          duration: result.duration,
          sampleRate: result.sampleRate,
          channels: result.channels,
          bitsPerSample: result.bitsPerSample,
          model: result.model,
          renderedAt: now,
          scoreHash,
          timingHash: tHash,
          synthHash: renderSignature(s.project.synth),
          logPath: result.logPath,
          phrases: result.phrases?.length ? result.phrases : s.project.render?.phrases,
        },
        updatedAt: now,
      },
      render: {
        ...s.render,
        status: 'done',
        percent: 100,
        mode,
        result,
        error: null,
        elapsedMs: result.elapsedMs,
      },
      dirty: true,
    }));
  };

  const resetEditorState = (project: Project) => {
    audioEngine.stop();
    audioEngine.clearReference();
    set((s) => ({
      project,
      projectPath: null,
      dirty: false,
      lastSavedAt: null,
      welcomeOpen: false,
      tab: 'score',
      tool: 'select',
      selection: [],
      selectedPhoneme: null,
      viewport: { ...s.viewport, scrollSec: 0, pitchScroll: 0 },
      transport: {
        ...s.transport,
        playing: false,
        currentTime: 0,
        duration: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        vocalMode: 'vocal',
      },
      audio: { ...initialAudio },
      render: { ...initialRender },
      baseF0: null,
      currentF0: null,
      pitchEdited: false,
      timing: null,
      timingBase: null,
      timingEdited: false,
      history: [],
      future: [],
      clipboard: [],
    }));
    get().fitPitchRange();
    void window.api.setTitle(`${project.name} — NEUTRINO Tuning Studio`);
  };

  const state: AppState = {
    booted: false,
    booting: false,
    appInfo: null,
    settings: null,
    language: 'en',
    theme: 'dark',
    neutrino: null,
    models: [],
    engineLoading: false,

    project: makeInitialProject(null, []),
    projectPath: null,
    dirty: false,
    lastSavedAt: null,
    welcomeOpen: true,
    modal: null,
    pendingDiscardAction: null,
    logOpen: false,
    exporting: false,
    toasts: [],

    tab: 'score',
    tool: 'select',
    selection: [],
    selectedPhoneme: null,
    viewport: { pxPerSec: 70, scrollSec: 0, pitchTop: 88, pitchBottom: 36, pitchScroll: 0 },
    transport: {
      playing: false,
      currentTime: 0,
      duration: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      follow: true,
      masterVolume: 0.9,
      vocalMode: 'vocal',
    },
    audio: { ...initialAudio },
    render: { ...initialRender },

    baseF0: null,
    currentF0: null,
    pitchEdited: false,
    timing: null,
    timingBase: null,
    timingEdited: false,

    history: [],
    future: [],
    clipboard: [],

    async boot() {
      if (get().booted || get().booting) return;
      set({ booting: true });
      try {
        const [appInfo, settings] = await Promise.all([
          window.api.getAppInfo(),
          window.api.getSettings(),
        ]);
        const language = resolveLanguage(settings.language, appInfo.locale);
        applyLanguage(language);
        applyTheme(settings.theme);
        let neutrino: NeutrinoInfo | null = null;
        try {
          neutrino = await window.api.detectNeutrino({
            root: settings.neutrinoRoot || undefined,
            runner: settings.runner,
            wineCommand: settings.wineCommand,
            save: true,
          });
        } catch (err) {
          neutrino = {
            ok: false,
            root: settings.neutrinoRoot,
            models: [],
            error: (err as Error).message,
          };
        }
        const models = neutrino?.models || [];
        const model =
          models.find((m) => m.id === settings.defaultModel)?.id ||
          models[0]?.id ||
          settings.defaultModel ||
          '';
        const project = makeInitialProject({ ...settings, defaultModel: model }, models);
        project.synth.model = model;
        if (!project.synth.model) project.synth.model = '';
        set((s) => ({
          appInfo,
          settings: neutrino?.root ? { ...settings, neutrinoRoot: neutrino.root } : settings,
          language,
          theme: settings.theme,
          neutrino,
          models,
          project,
          transport: { ...s.transport, masterVolume: settings.masterVolume },
          welcomeOpen: Boolean(settings.showWelcome) || !neutrino?.ok,
        }));
        if (neutrino?.root && neutrino.root !== settings.neutrinoRoot) {
          await window.api.setSettings({ neutrinoRoot: neutrino.root });
        }
        audioEngine.onTick = (t) => {
          const duration = get().transport.duration;
          set((s) => ({
            transport: {
              ...s.transport,
              currentTime: duration ? Math.min(t, duration) : t,
            },
          }));
        };
        audioEngine.onEnded = () => {
          set((s) => ({
            transport: {
              ...s.transport,
              playing: false,
              currentTime: s.transport.duration,
            },
          }));
        };
        await window.api.setTitle('NEUTRINO Tuning Studio');
      } catch (err) {
        console.error(err);
      } finally {
        set({ booted: true, booting: false });
      }
    },

    syncSettings(next) {
      const language = resolveLanguage(next.language, get().appInfo?.locale);
      applyLanguage(language);
      applyTheme(next.theme);
      set({ settings: next, language, theme: next.theme });
    },

    async updateSettings(patch) {
      const next = await window.api.setSettings(patch);
      get().syncSettings(next);
    },

    async setLanguage(language) {
      const next = await window.api.setSettings({ language });
      get().syncSettings(next);
    },

    async setTheme(theme) {
      const next = await window.api.setSettings({ theme });
      get().syncSettings(next);
    },

    async refreshEngine(opts = {}) {
      set({ engineLoading: true });
      try {
        const settings = get().settings;
        const info = await window.api.detectNeutrino({
          root: opts.root ?? settings?.neutrinoRoot ?? undefined,
          runner: opts.runner ?? settings?.runner ?? 'auto',
          wineCommand: opts.wineCommand ?? settings?.wineCommand ?? 'wine',
          force: true,
          save: true,
        });
        const models: ModelInfo[] = info.models || [];
        const currentModel = get().project.synth.model;
        const model =
          models.find((m) => m.id === currentModel)?.id ||
          models.find((m) => m.id === get().settings?.defaultModel)?.id ||
          models[0]?.id ||
          currentModel;
        set((s) => ({
          neutrino: info,
          models,
          engineLoading: false,
          settings: info.ok && info.root ? { ...(s.settings as Settings), neutrinoRoot: info.root } : s.settings,
          project: {
            ...s.project,
            synth: {
              ...s.project.synth,
              model: model || '',
              supportModel:
                s.project.synth.supportModel && s.project.synth.supportModel !== model
                  ? s.project.synth.supportModel
                  : '',
            },
          },
        }));
        if (info.ok) {
          if (!opts.silent) {
            get().pushToast('success', i18n.t('notifications.engineFound', { path: info.root }));
          }
        } else if (!opts.silent) {
          get().pushToast('error', i18n.t('notifications.engineNotFound'));
        }
      } catch (err) {
        set({ engineLoading: false });
        if (!opts.silent) {
          get().pushToast('error', i18n.t('errors.engineDetect', { message: (err as Error).message }));
        }
      }
    },

    setModal(modal) {
      set({ modal });
    },
    setWelcomeOpen(open) {
      set({ welcomeOpen: open });
    },
    async dismissWelcome() {
      set({ welcomeOpen: false });
      await window.api.setSettings({ showWelcome: false });
    },
    toggleLog() {
      set((s) => ({ logOpen: !s.logOpen }));
    },
    clearLogs() {
      set((s) => ({ render: { ...s.render, logs: [] } }));
    },
    pushToast(kind, message) {
      const id = Date.now() + Math.random();
      set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, message }] }));
      window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 6500 : 4200);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    async newProject(skipConfirm = false) {
      if (!skipConfirm && get().dirty) {
        set({ modal: 'discard', pendingDiscardAction: () => get().newProject(true) });
        return;
      }
      const settings = get().settings;
      const models = get().models;
      const model =
        models.find((m) => m.id === settings?.defaultModel)?.id ||
        models[0]?.id ||
        get().project.synth.model;
      const project = createProject(
        createEmptyScore(),
        { ...defaultSynth(settings || undefined, model), model },
        i18n.t('project.newName'),
      );
      resetEditorState(project);
      get().pushToast('info', i18n.t('notifications.projectCreated'));
    },

    async openDemo(skipConfirm = false) {
      if (!skipConfirm && get().dirty) {
        set({ modal: 'discard', pendingDiscardAction: () => get().openDemo(true) });
        return;
      }
      const settings = get().settings;
      const models = get().models;
      const model =
        models.find((m) => m.id === settings?.defaultModel)?.id ||
        models[0]?.id ||
        get().project.synth.model;
      const score = createDemoScore();
      const project = createProject(score, { ...defaultSynth(settings || undefined, model), model }, score.title);
      project.synth.model = model;
      resetEditorState(project);
      set({ dirty: false });
    },

    async openProjectDialog(skipConfirm = false) {
      if (!skipConfirm && get().dirty) {
        set({ modal: 'discard', pendingDiscardAction: () => get().openProjectDialog(true) });
        return;
      }
      const paths = await window.api.openDialog({
        title: i18n.t('project.open'),
        filters: [{ name: 'NEUTRINO Tuning Studio', extensions: ['ntstudio', 'json'] }],
      });
      if (paths[0]) await get().openProjectPath(paths[0], true);
    },

    async openProjectPath(path, skipConfirm = false) {
      if (!skipConfirm && get().dirty) {
        set({ modal: 'discard', pendingDiscardAction: () => get().openProjectPath(path, true) });
        return;
      }
      try {
        const text = await window.api.readProject(path);
        const decoded = decodeProject(text);
        const { project } = decoded;
        const models = get().models;
        if (!project.synth.model && models[0]) project.synth.model = models[0].id;
        let timing = decoded.timing;
        let timingBase = timing;
        if (project.timing?.baseText) {
          const base = timingFromText(project.timing.baseText, getScoreHash(project.score));
          if (base) timingBase = base;
        }
        if (timing && project.timing) timing.edited = Boolean(project.timing.edited);
        const baseF0 = decoded.baseF0;
        const currentF0 = decoded.currentF0 || decoded.baseF0;
        audioEngine.stop();
        audioEngine.clearReference();
        set((s) => ({
          project,
          projectPath: path,
          dirty: false,
          lastSavedAt: Date.now(),
          welcomeOpen: false,
          selection: [],
          selectedPhoneme: null,
          tab: 'score',
          tool: 'select',
          history: [],
          future: [],
          baseF0,
          currentF0,
          pitchEdited: Boolean(project.pitch?.edited),
          timing,
          timingBase,
          timingEdited: Boolean(timing?.edited),
          audio: { ...initialAudio },
          render: { ...initialRender },
          viewport: { ...s.viewport, scrollSec: 0, pitchScroll: 0 },
          transport: {
            ...s.transport,
            playing: false,
            currentTime: 0,
            duration: 0,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            vocalMode: 'vocal',
          },
        }));
        get().fitPitchRange();
        const nextSettings = await window.api.addRecentProject(path);
        set({ settings: nextSettings });
        void window.api.setTitle(`${project.name} — NEUTRINO Tuning Studio`);
        if (project.render?.wavPath) {
          const exists = await window.api.exists(project.render.wavPath);
          if (exists) {
            await loadAudioForPath(project.render.wavPath);
          } else {
            get().pushToast('warning', i18n.t('project.audioMissing'));
          }
        }
        if (project.reference?.path) {
          const exists = await window.api.exists(project.reference.path);
          if (exists) await loadReferenceForPath(project.reference.path);
          else set((s) => ({ project: { ...s.project, reference: null } }));
        }
        get().pushToast('success', i18n.t('project.loaded'));
      } catch (err) {
        get().pushToast('error', `${i18n.t('project.loadError')}: ${(err as Error).message}`);
      }
    },

    async saveProject(saveAs = false, silent = false) {
      const state = get();
      let path = state.projectPath;
      if (!path || saveAs) {
        const chosen = await window.api.saveDialog({
          title: i18n.t('project.save'),
          defaultPath: projectFileName(state.project),
          filters: [{ name: 'NEUTRINO Tuning Studio', extensions: ['ntstudio'] }],
        });
        if (!chosen) return false;
        path = chosen.toLowerCase().endsWith('.ntstudio') ? chosen : `${chosen}.ntstudio`;
      }
      try {
        const project = { ...state.project, updatedAt: Date.now() };
        const data = encodeProject(
          project,
          state.baseF0,
          state.currentF0,
          state.timing,
          state.pitchEdited,
        );
        await window.api.writeProject(path, data);
        const nextSettings = await window.api.addRecentProject(path);
        set((s) => ({
          settings: nextSettings,
          project: { ...s.project, updatedAt: project.updatedAt },
          projectPath: path,
          dirty: false,
          lastSavedAt: Date.now(),
        }));
        void window.api.setTitle(`${project.name} — NEUTRINO Tuning Studio`);
        if (!silent) get().pushToast('success', i18n.t('notifications.saved'));
        return true;
      } catch (err) {
        get().pushToast('error', i18n.t('errors.writeFile'));
        return false;
      }
    },

    async resolveDiscard(choice) {
      const action = get().pendingDiscardAction;
      if (choice === 'cancel') {
        set({ modal: null, pendingDiscardAction: null });
        return;
      }
      if (choice === 'save') {
        const saved = await get().saveProject();
        if (!saved) return;
      }
      set({ modal: null, pendingDiscardAction: null });
      await action?.();
    },

    async importMusicXmlDialog(skipConfirm = false) {
      if (!skipConfirm && get().dirty) {
        set({ modal: 'discard', pendingDiscardAction: () => get().importMusicXmlDialog(true) });
        return;
      }
      const paths = await window.api.openDialog({
        title: i18n.t('project.importMusicXml'),
        filters: [
          { name: 'MusicXML', extensions: ['musicxml', 'xml', 'mxl'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (paths[0]) await get().loadMusicXmlPath(paths[0]);
    },

    async importMidiDialog(skipConfirm = false) {
      if (!skipConfirm && get().dirty) {
        set({ modal: 'discard', pendingDiscardAction: () => get().importMidiDialog(true) });
        return;
      }
      const paths = await window.api.openDialog({
        title: i18n.t('project.importMidi'),
        filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }],
      });
      if (paths[0]) await get().loadMidiPath(paths[0]);
    },

    async loadMusicXmlPath(path) {
      try {
        const text = await window.api.readText(path);
        const result = importMusicXml(text);
        const settings = get().settings;
        const models = get().models;
        const model =
          models.find((m) => m.id === get().project.synth.model)?.id ||
          models[0]?.id ||
          get().project.synth.model;
        const baseName = fileBaseName(path);
        const project = createProject(
          result.score,
          { ...get().project.synth, ...defaultSynth(settings || undefined, model), model },
          baseName,
        );
        project.synth.model = model;
        resetEditorState(project);
        set({ dirty: true, project: { ...project, name: baseName } });
        get().pushToast(
          'success',
          i18n.t('notifications.scoreImported', { count: result.score.notes.length }),
        );
        if (result.warnings.length) {
          get().pushToast('warning', result.warnings[0]);
        }
      } catch (err) {
        get().pushToast('error', i18n.t('errors.importFailed', { message: (err as Error).message }));
      }
    },

    async loadMidiPath(path) {
      try {
        const bytes = await window.api.readBinary(path);
        const result = importMidi(bytes, fileBaseName(path));
        const settings = get().settings;
        const models = get().models;
        const model =
          models.find((m) => m.id === get().project.synth.model)?.id ||
          models[0]?.id ||
          get().project.synth.model;
        const baseName = fileBaseName(path);
        const project = createProject(
          result.score,
          { ...get().project.synth, ...defaultSynth(settings || undefined, model), model },
          baseName,
        );
        project.synth.model = model;
        resetEditorState(project);
        set({ dirty: true, project: { ...project, name: baseName } });
        get().pushToast(
          'success',
          i18n.t('notifications.midiImported', { count: result.score.notes.length }),
        );
        if (result.warnings.length) get().pushToast('warning', result.warnings[0]);
      } catch (err) {
        get().pushToast('error', i18n.t('errors.importFailed', { message: (err as Error).message }));
      }
    },

    async exportMusicXmlFile() {
      const state = get();
      const chosen = await window.api.saveDialog({
        title: i18n.t('project.exportMusicXml'),
        defaultPath: `${state.project.name || 'score'}.musicxml`,
        filters: [{ name: 'MusicXML', extensions: ['musicxml', 'xml'] }],
      });
      if (!chosen) return;
      try {
        const xml = exportMusicXml(state.project.score);
        await window.api.writeText(chosen, xml);
        get().pushToast('success', i18n.t('notifications.exportMusicXml'));
      } catch (err) {
        get().pushToast('error', i18n.t('errors.exportFailed', { message: (err as Error).message }));
      }
    },

    setProjectName(name) {
      set((s) => ({
        project: { ...s.project, name: name.trim() || i18n.t('project.newName'), updatedAt: Date.now() },
        dirty: true,
      }));
      void window.api.setTitle(`${name.trim() || i18n.t('project.newName')} — NEUTRINO Tuning Studio`);
    },

    setSynth(patch) {
      set((s) => {
        const synth = { ...s.project.synth, ...patch };
        if (synth.supportModel && synth.supportModel === synth.model) synth.supportModel = '';
        return {
          project: { ...s.project, synth, updatedAt: Date.now() },
          dirty: true,
        };
      });
    },

    setProjectMeta(patch) {
      const current = get().project.score;
      let next = current;
      if (patch.title !== undefined || patch.artist !== undefined) {
        next = {
          ...next,
          title: patch.title !== undefined ? patch.title : next.title,
          artist: patch.artist !== undefined ? patch.artist : next.artist,
        };
      }
      if (patch.bpm !== undefined) {
        next = { ...next, tempos: [{ beat: 0, bpm: clamp(patch.bpm, 20, 400) }] };
      }
      if (patch.numerator !== undefined || patch.denominator !== undefined) {
        const sig = current.timeSigs[0] || { beat: 0, numerator: 4, denominator: 4 };
        next = {
          ...next,
          timeSigs: [
            {
              beat: 0,
              numerator: clamp(patch.numerator ?? sig.numerator, 1, 32),
              denominator: patch.denominator ?? sig.denominator,
            },
          ],
        };
      }
      if (next !== current) get().setScore(next, 'project-meta');
    },

    setScore(score, historyLabel) {
      if (historyLabel) get().pushHistory(historyLabel);
      const old = get().project;
      const oldHash = getScoreHash(old.score);
      const normalized = normalizeScore(score);
      const newHash = getScoreHash(normalized);
      const invalidate = oldHash !== newHash;
      const validIds = new Set(normalized.notes.map((n) => n.id));
      set((s) => ({
        project: {
          ...s.project,
          score: normalized,
          updatedAt: Date.now(),
          ...(invalidate
            ? { timing: null, pitch: null }
            : {}),
        },
        ...(invalidate
          ? {
              timing: null,
              timingBase: null,
              timingEdited: false,
              baseF0: null,
              currentF0: null,
              pitchEdited: false,
            }
          : {}),
        selection: s.selection.filter((id) => validIds.has(id)),
        dirty: true,
      }));
      if (invalidate) get().fitPitchRange();
    },

    updateNote(id, patch, historyLabel) {
      const notes = get().project.score.notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      get().setScore({ ...get().project.score, notes }, historyLabel);
    },

    addNote(note, historyLabel) {
      const score = get().project.score;
      const newNote: Note = {
        id: note.id || uid(),
        pitch: note.pitch ?? 60,
        start: note.start ?? 0,
        duration: note.duration ?? 1,
        lyric: note.lyric ?? 'ら',
        breath: note.breath ?? false,
      };
      get().setScore({ ...score, notes: [...score.notes, newNote] }, historyLabel);
      get().selectNotes([newNote.id]);
    },

    deleteNotes(ids, historyLabel) {
      if (!ids.length) return;
      const setIds = new Set(ids);
      get().setScore(
        {
          ...get().project.score,
          notes: get().project.score.notes.filter((n) => !setIds.has(n.id)),
        },
        historyLabel,
      );
      set((s) => ({ selection: s.selection.filter((id) => !setIds.has(id)) }));
    },

    setLyrics(lyrics, historyLabel) {
      const notes = get().project.score.notes.map((n) =>
        lyrics[n.id] !== undefined ? { ...n, lyric: lyrics[n.id] } : n,
      );
      get().setScore({ ...get().project.score, notes }, historyLabel);
    },

    setTab(tab) {
      set({ tab });
    },
    setTool(tool) {
      set({ tool });
    },
    selectNotes(ids, additive = false) {
      set((s) => ({
        selection: additive ? [...new Set([...s.selection, ...ids])] : ids,
      }));
    },
    toggleSelection(id) {
      set((s) => ({
        selection: s.selection.includes(id)
          ? s.selection.filter((x) => x !== id)
          : [...s.selection, id],
      }));
    },
    clearSelection() {
      set({ selection: [] });
    },
    selectAll() {
      set((s) => ({ selection: s.project.score.notes.map((n) => n.id) }));
    },
    setSelectedPhoneme(index) {
      set({ selectedPhoneme: index });
    },

    copySelection() {
      const s = get();
      const selected = s.project.score.notes.filter((n) => s.selection.includes(n.id));
      if (!selected.length) return;
      set({ clipboard: selected.map((n) => ({ ...n })) });
      s.pushToast('info', i18n.t('notifications.copiedNotes'));
    },

    pasteClipboard() {
      const s = get();
      if (!s.clipboard.length) return;
      const selected = s.project.score.notes.filter((n) => s.selection.includes(n.id));
      const anchor = selected.length
        ? Math.max(...selected.map((n) => n.start + n.duration))
        : secondsToBeat(s.project.score, s.transport.currentTime);
      const base = Math.min(...s.clipboard.map((n) => n.start));
      const pasted = s.clipboard.map((n) => ({
        ...n,
        id: uid(),
        start: anchor + (n.start - base),
      }));
      s.pushHistory('paste');
      get().setScore({ ...s.project.score, notes: [...s.project.score.notes, ...pasted] });
      get().selectNotes(pasted.map((n) => n.id));
      s.pushToast('info', i18n.t('notifications.pastedNotes'));
    },

    duplicateSelection() {
      const s = get();
      const selected = s.project.score.notes.filter((n) => s.selection.includes(n.id));
      if (!selected.length) return;
      const start = Math.min(...selected.map((n) => n.start));
      const end = Math.max(...selected.map((n) => n.start + n.duration));
      const offset = Math.max(0.25, end - start);
      const copies = selected.map((n) => ({ ...n, id: uid(), start: n.start + offset }));
      s.pushHistory('duplicate');
      get().setScore({ ...s.project.score, notes: [...s.project.score.notes, ...copies] });
      get().selectNotes(copies.map((n) => n.id));
    },

    transposeSelection(semitones) {
      const s = get();
      if (!s.selection.length) return;
      s.pushHistory('transpose');
      const notes = s.project.score.notes.map((n) =>
        s.selection.includes(n.id)
          ? { ...n, pitch: clamp(n.pitch + semitones, 0, 127) }
          : n,
      );
      get().setScore({ ...s.project.score, notes });
    },

    deleteSelection() {
      const s = get();
      if (!s.selection.length) return;
      s.pushHistory('delete');
      get().deleteNotes(s.selection);
      set({ selection: [] });
    },

    pushHistory(label) {
      const snap = snapshotOf(get(), label);
      set((s) => ({
        history: [...s.history.slice(-79), snap],
        future: [],
      }));
    },

    undo() {
      const s = get();
      if (!s.history.length) return;
      const snap = s.history[s.history.length - 1];
      const redoSnap = snapshotOf(s, 'redo');
      set((state) => ({
        history: state.history.slice(0, -1),
        future: [redoSnap, ...state.future].slice(0, 80),
        project: { ...state.project, score: deepClone(snap.score), dynamics: deepClone(snap.dynamics), reference: snap.reference ? { ...snap.reference } : null, updatedAt: Date.now() },
        timing: snap.timing ? deepClone(snap.timing) : null,
        baseF0: snap.baseF0 ? snap.baseF0.slice() : null,
        currentF0: snap.currentF0 ? snap.currentF0.slice() : null,
        pitchEdited: snap.pitchEdited,
        timingEdited: Boolean(snap.timing?.edited),
        dirty: true,
        selection: [],
      }));
      get().fitPitchRange();
    },

    redo() {
      const s = get();
      if (!s.future.length) return;
      const snap = s.future[0];
      const undoSnap = snapshotOf(s, 'undo');
      set((state) => ({
        future: state.future.slice(1),
        history: [...state.history, undoSnap].slice(-80),
        project: { ...state.project, score: deepClone(snap.score), dynamics: deepClone(snap.dynamics), reference: snap.reference ? { ...snap.reference } : null, updatedAt: Date.now() },
        timing: snap.timing ? deepClone(snap.timing) : null,
        baseF0: snap.baseF0 ? snap.baseF0.slice() : null,
        currentF0: snap.currentF0 ? snap.currentF0.slice() : null,
        pitchEdited: snap.pitchEdited,
        timingEdited: Boolean(snap.timing?.edited),
        dirty: true,
        selection: [],
      }));
      get().fitPitchRange();
    },

    setViewport(patch) {
      set((s) => ({ viewport: { ...s.viewport, ...patch } }));
    },

    fitTimeline(width) {
      const s = get();
      const duration = Math.max(
        timelineEnd(s.project.score, s.audio.duration, s.project.reference, s.audio.referenceDuration),
        1,
      );
      const pxPerSec = clamp((width - 32) / duration, 8, 600);
      set((state) => ({ viewport: { ...state.viewport, pxPerSec, scrollSec: 0 } }));
    },

    setPitchRange(top, bottom) {
      set((s) => ({
        viewport: {
          ...s.viewport,
          pitchTop: Math.max(top, bottom + 12),
          pitchBottom: bottom,
          pitchScroll: 0,
        },
      }));
    },

    fitPitchRange() {
      const notes = get().project.score.notes;
      if (!notes.length) {
        set((s) => ({ viewport: { ...s.viewport, pitchTop: 88, pitchBottom: 36, pitchScroll: 0 } }));
        return;
      }
      const min = Math.min(...notes.map((n) => n.pitch));
      const max = Math.max(...notes.map((n) => n.pitch));
      let top = Math.min(108, max + 4);
      let bottom = Math.max(12, min - 4);
      if (top - bottom < 36) {
        const mid = (top + bottom) / 2;
        top = Math.round(mid + 18);
        bottom = Math.round(mid - 18);
      }
      set((s) => ({ viewport: { ...s.viewport, pitchTop: top, pitchBottom: bottom, pitchScroll: 0 } }));
    },

    setTimingFromRender(text, scoreHash, edited = false) {
      const timing = timingFromText(text, scoreHash, edited);
      set((s) => ({
        timing,
        timingBase: edited ? s.timingBase : timing,
        timingEdited: edited,
        project: {
          ...s.project,
          timing: timing
            ? {
                text: timing.text,
                baseText: (edited ? s.timingBase?.text : timing.text) || timing.text,
                edited,
                scoreHash,
                generatedAt: Date.now(),
              }
            : null,
        },
      }));
    },

    setTimingText(text, edited = true) {
      const s = get();
      const timing = timingFromText(text, getScoreHash(s.project.score), edited);
      if (!timing) return;
      const base = s.timingBase || s.timing;
      set({
        timing: { ...timing, edited },
        timingBase: base,
        timingEdited: edited,
        dirty: true,
        project: {
          ...s.project,
          timing: {
            text: timing.text,
            baseText: base?.text || timing.text,
            edited,
            scoreHash: timing.scoreHash,
            generatedAt: Date.now(),
          },
          updatedAt: Date.now(),
        },
      });
    },

    updateTimingBoundary(boundaryIndex, time) {
      const timing = get().timing;
      if (!timing) return;
      const phonemes = updateBoundary(timing.phonemes, boundaryIndex, time);
      get().setTimingText(serializeTiming(phonemes), true);
    },

    resetTiming() {
      const s = get();
      const base = s.timingBase;
      if (!base) return;
      s.pushHistory('timing-reset');
      set({
        timing: { ...base, edited: false },
        timingEdited: false,
        dirty: true,
        project: {
          ...s.project,
          timing: {
            text: base.text,
            baseText: base.text,
            edited: false,
            scoreHash: base.scoreHash,
            generatedAt: Date.now(),
          },
        },
      });
      s.pushToast('info', i18n.t('notifications.timingReset'));
    },

    setPitchData(base, current, edited) {
      set((s) => ({
        baseF0: base,
        currentF0: current,
        pitchEdited: edited,
        dirty: true,
        // The label should describe the next render, not the previous one.
        render: { ...s.render, mode: null },
        project: { ...s.project, updatedAt: Date.now() },
      }));
    },

    setCurrentF0(f0, edited = true) {
      set((s) => ({
        currentF0: f0,
        pitchEdited: edited,
        dirty: true,
        render: { ...s.render, mode: null },
        project: { ...s.project, updatedAt: Date.now() },
      }));
    },

    resetPitch() {
      const s = get();
      if (!s.baseF0) return;
      s.pushHistory('pitch-reset');
      set({
        currentF0: s.baseF0.slice(),
        pitchEdited: false,
        dirty: true,
      });
      s.pushToast('info', i18n.t('notifications.pitchReset'));
    },

    resetPitchRange(startSec, endSec) {
      const s = get();
      if (!s.baseF0 || !s.currentF0) return;
      s.pushHistory('pitch-reset-range');
      const start = clamp(Math.floor(startSec * 100), 0, s.currentF0.length);
      const end = clamp(Math.ceil(endSec * 100), start, s.currentF0.length);
      const current = s.currentF0.slice();
      for (let i = start; i < end; i++) current[i] = s.baseF0[i] ?? 0;
      s.setCurrentF0(current, true);
    },

    transposePitch(semitones, startSec, endSec, historyLabel) {
      const s = get();
      if (!s.currentF0) return;
      if (historyLabel) s.pushHistory(historyLabel);
      const start = startSec !== undefined ? Math.floor(startSec * 100) : 0;
      const end = endSec !== undefined ? Math.ceil(endSec * 100) : s.currentF0.length;
      s.setCurrentF0(transposeF0(s.currentF0, semitones, start, end), true);
    },

    smoothPitchRange(startSec, endSec, strength) {
      const s = get();
      if (!s.currentF0) return;
      s.pushHistory('pitch-smooth');
      s.setCurrentF0(
        smoothF0(s.currentF0, Math.floor(startSec * 100), Math.ceil(endSec * 100), strength),
        true,
      );
    },

    applyVibratoRange(startSec, endSec, rateHz, depthCents, fadeSec) {
      const s = get();
      if (!s.currentF0) return;
      s.pushHistory('pitch-vibrato');
      s.setCurrentF0(
        applyVibrato(s.currentF0, { startSec, endSec, rateHz, depthCents, fadeSec }),
        true,
      );
    },

    autoTuneRange(startSec, endSec, strength) {
      const s = get();
      if (!s.currentF0) return;
      s.pushHistory('pitch-autotune');
      const current = s.currentF0.slice();
      const start = clamp(Math.floor(startSec * 100), 0, current.length);
      const end = clamp(Math.ceil(endSec * 100), start, current.length);
      const score = s.project.score;
      for (let i = start; i < end; i++) {
        if (current[i] <= 0) continue;
        const t = i / 100;
        const beat = secondsToBeat(score, t);
        const note = score.notes.find((n) => beat >= n.start && beat < n.start + n.duration);
        if (!note) continue;
        const target = midiToFreq(note.pitch);
        current[i] = current[i] * (1 - strength) + target * strength;
      }
      s.setCurrentF0(current, true);
    },

    setDynamics(dynamics, historyLabel) {
      if (historyLabel) get().pushHistory(historyLabel);
      const duration = get().audio.duration || scoreDurationSeconds(get().project.score);
      set((s) => ({
        project: {
          ...s.project,
          dynamics: normalizeDynamics(dynamics, duration),
          updatedAt: Date.now(),
        },
        dirty: true,
      }));
      const s = get();
      if (s.transport.playing) {
        audioEngine.updatePlaybackOptions({
          dynamicsEnabled: s.project.dynamics.enabled,
          dynamicsPoints: s.project.dynamics.points,
        });
      }
    },

    setDynamicsEnabled(enabled) {
      const s = get();
      s.setDynamics({ ...s.project.dynamics, enabled }, 'dynamics-enable');
    },

    addDynamicsPointAt(time, db) {
      const s = get();
      const duration = s.audio.duration || scoreDurationSeconds(s.project.score);
      s.setDynamics(
        {
          enabled: true,
          points: addDynamicsPoint(s.project.dynamics.points, time, db, duration),
        },
        'dynamics-add',
      );
    },

    moveDynamicsPointAt(index, time, db) {
      const s = get();
      const duration = s.audio.duration || scoreDurationSeconds(s.project.score);
      s.setDynamics(
        {
          ...s.project.dynamics,
          points: moveDynamicsPoint(s.project.dynamics.points, index, time, db, duration),
        },
        undefined,
      );
    },

    removeDynamicsPointAt(index) {
      const s = get();
      s.setDynamics(
        {
          ...s.project.dynamics,
          points: removeDynamicsPoint(s.project.dynamics.points, index),
        },
        'dynamics-remove',
      );
    },

    resetDynamics() {
      const s = get();
      const duration = s.audio.duration || scoreDurationSeconds(s.project.score);
      s.pushHistory('dynamics-reset');
      set((state) => ({
        project: {
          ...state.project,
          dynamics: resetDynamicsEnvelope(duration),
          updatedAt: Date.now(),
        },
        dirty: true,
      }));
      s.pushToast('info', i18n.t('notifications.dynamicsReset'));
    },

    smoothDynamicsEnvelope() {
      const s = get();
      s.setDynamics(
        { ...s.project.dynamics, points: smoothDynamics(s.project.dynamics.points, 0.6) },
        'dynamics-smooth',
      );
    },

    async loadReferenceDialog() {
      const paths = await window.api.openDialog({
        title: i18n.t('reference.load'),
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'] }],
      });
      if (paths[0]) await get().loadReferencePath(paths[0]);
    },

    async loadReferencePath(path) {
      await loadReferenceForPath(path);
      set((s) => ({ dirty: true, project: { ...s.project, updatedAt: Date.now() } }));
    },

    setReference(patch) {
      set((s) => {
        const reference = s.project.reference ? { ...s.project.reference, ...patch } : null;
        const duration = timelineEnd(
          s.project.score,
          s.audio.duration,
          reference,
          s.audio.referenceDuration,
        );
        return {
          project: { ...s.project, reference, updatedAt: Date.now() },
          transport: {
            ...s.transport,
            duration,
            currentTime: Math.min(s.transport.currentTime, duration),
            loopEnd: Math.min(s.transport.loopEnd || duration, duration),
          },
          dirty: true,
        };
      });
      if (get().transport.playing) {
        const s = get();
        audioEngine.updatePlaybackOptions({
          referenceVolume: s.project.reference?.volume ?? 0.8,
          referenceOffset: s.project.reference?.offset ?? 0,
          referenceMuted: s.project.reference?.muted ?? false,
          duration: s.transport.duration,
        });
      }
    },

    removeReference() {
      audioEngine.clearReference();
      set((s) => {
        const duration = timelineEnd(s.project.score, s.audio.duration, null, 0);
        return {
          project: { ...s.project, reference: null, updatedAt: Date.now() },
          audio: { ...s.audio, referencePeaks: null, referenceDuration: 0 },
          transport: {
            ...s.transport,
            duration,
            currentTime: Math.min(s.transport.currentTime, duration),
            loopEnd: Math.min(s.transport.loopEnd || duration, duration),
          },
          dirty: true,
        };
      });
    },

    async loadAudioForPath(path) {
      await loadAudioForPath(path);
    },

    async play() {
      let s = get();
      if (!s.audio.loaded) {
        if (s.project.render?.wavPath) {
          await loadAudioForPath(s.project.render.wavPath);
          s = get();
        }
        if (!s.audio.loaded && s.project.reference?.path && !audioEngine.referenceBuffer) {
          await loadReferenceForPath(s.project.reference.path);
          s = get();
        }
        if (!s.audio.loaded && !audioEngine.referenceBuffer) {
          s.pushToast('info', i18n.t('render.noAudio'));
          return;
        }
      }
      const st = get();
      if (st.transport.playing) {
        audioEngine.pause();
        set((s2) => ({ transport: { ...s2.transport, playing: false } }));
        return;
      }
      const duration = timelineEnd(
        st.project.score,
        st.audio.duration,
        st.project.reference,
        st.audio.referenceDuration,
      );
      audioEngine.setMasterVolume(st.settings?.masterVolume ?? st.transport.masterVolume);
      const start = st.transport.currentTime >= duration - 0.02 ? 0 : st.transport.currentTime;
      audioEngine.play(start, {
        loop: st.transport.loop,
        loopStart: st.transport.loopStart,
        loopEnd: st.transport.loopEnd || duration,
        duration,
        masterVolume: st.settings?.masterVolume ?? st.transport.masterVolume,
        referenceVolume: st.project.reference?.volume ?? 0.8,
        referenceOffset: st.project.reference?.offset ?? 0,
        referenceMuted: st.project.reference?.muted ?? true,
        vocalMode: st.transport.vocalMode,
        guideF0: st.currentF0,
        dynamicsEnabled: st.project.dynamics.enabled,
        dynamicsPoints: st.project.dynamics.points,
      });
      set((s2) => ({
        transport: { ...s2.transport, playing: true, currentTime: start, duration },
      }));
    },

    pause() {
      audioEngine.pause();
      set((s) => ({
        transport: {
          ...s.transport,
          playing: false,
          currentTime: Math.min(audioEngine.getPosition(), s.transport.duration),
        },
      }));
    },

    stop() {
      audioEngine.stop();
      set((s) => ({ transport: { ...s.transport, playing: false, currentTime: 0 } }));
    },

    seek(time) {
      const s = get();
      const total = timelineEnd(
        s.project.score,
        s.audio.duration,
        s.project.reference,
        s.audio.referenceDuration,
      );
      const t = clamp(time, 0, total);
      audioEngine.seek(t);
      set((state) => ({ transport: { ...state.transport, currentTime: t, duration: total } }));
    },

    setLoop(loop) {
      const s = get();
      const total = timelineEnd(
        s.project.score,
        s.audio.duration,
        s.project.reference,
        s.audio.referenceDuration,
      );
      const loopStart = s.transport.loopStart;
      const loopEnd = s.transport.loopEnd || total;
      set((state) => ({ transport: { ...state.transport, loop, loopStart, loopEnd, duration: total } }));
      if (s.transport.playing) {
        audioEngine.updatePlaybackOptions({ loop, loopStart, loopEnd, duration: total });
      }
    },

    setLoopRange(start, end) {
      const s = get();
      const total = timelineEnd(
        s.project.score,
        s.audio.duration,
        s.project.reference,
        s.audio.referenceDuration,
      );
      const a = clamp(Math.min(start, end), 0, Math.max(0, total - 0.05));
      const b = clamp(Math.max(start, end), a + 0.05, total);
      set((state) => ({
        transport: { ...state.transport, loopStart: a, loopEnd: b, loop: true, duration: total },
      }));
      if (s.transport.playing) {
        audioEngine.updatePlaybackOptions({ loop: true, loopStart: a, loopEnd: b, duration: total });
      }
    },

    setFollow(follow) {
      set((s) => ({ transport: { ...s.transport, follow } }));
    },

    setMasterVolume(volume) {
      const v = clamp(volume, 0, 1);
      set((s) => ({
        transport: { ...s.transport, masterVolume: v },
        settings: s.settings ? { ...s.settings, masterVolume: v } : s.settings,
      }));
      audioEngine.setMasterVolume(v);
      void window.api.setSettings({ masterVolume: v });
    },

    setVocalMode(mode) {
      set((s) => ({ transport: { ...s.transport, vocalMode: mode } }));
      if (get().transport.playing) {
        audioEngine.updatePlaybackOptions({ vocalMode: mode, guideF0: get().currentF0 });
      }
    },

    async renderVocal() {
      const s = get();
      if (s.render.status === 'running') return;
      if (!s.neutrino?.ok) {
        s.pushToast('error', i18n.t('errors.noEngine'));
        set({ modal: 'settings' });
        return;
      }
      if (!s.project.score.notes.length) {
        s.pushToast('error', i18n.t('errors.noNotes'));
        return;
      }
      const missing = s.project.score.notes.filter((n) => !checkLyric(n.lyric).ok);
      if (missing.length) {
        s.pushToast('error', i18n.t('errors.lyrics'));
        return;
      }
      if (overlappingNotes(s.project.score).length) {
        s.pushToast('error', i18n.t('errors.overlap'));
        return;
      }
      if (!s.project.synth.model) {
        s.pushToast('error', i18n.t('voice.noModels'));
        return;
      }
      if (s.project.synth.supportModel === s.project.synth.model) {
        s.pushToast('error', i18n.t('voice.supportHint'));
        return;
      }
      const scoreHash = getScoreHash(s.project.score);
      const synthSig = renderSignature(s.project.synth);
      const rendered = s.project.render;
      const currentTimingHash = s.timing ? timingHash(s.timing.text) : '';
      const timingChanged = Boolean(s.timing && rendered && rendered.timingHash !== currentTimingHash);
      let mode: RenderMode;
      let previousF0: Float32Array | null = null;
      if (!rendered || rendered.scoreHash !== scoreHash || rendered.synthHash !== synthSig) {
        mode = 'full';
      } else if (timingChanged) {
        mode = 'timing';
      } else {
        if (s.currentF0 && rendered.f0Path) {
          try {
            const bytes = await window.api.readBinary(rendered.f0Path);
            previousF0 = bytes ? parseF0(new Uint8Array(bytes)) : null;
          } catch {
            previousF0 = null;
          }
        }
        const currentF0 = s.currentF0;
        let pitchChanged = false;
        if (currentF0) {
          pitchChanged = previousF0 ? f0Changed(previousF0, currentF0) : s.pitchEdited;
        }
        if (!pitchChanged) {
          s.pushToast('info', i18n.t('notifications.noAudioChanges'));
          return;
        }
        mode = 'vocode';
      }
      const timingWindows =
        mode === 'timing' && s.timingBase && s.timing ? dirtyTimingWindows(s.timingBase, s.timing) : null;
      const timingWindowPlan =
        timingWindows &&
        timingWindows.length > 0 &&
        timingWindows.length <= 8 &&
        timingWindows.reduce((sum, window) => sum + (window.endFrame - window.startFrame), 0) <=
          Math.max(1, s.audio.duration * 100) * 0.5
          ? timingWindows
          : null;

      // Stage-level vocode is already incremental. If only a few phrases changed,
      // use NEUTRINO's `-p` single-phrase mode and splice the phrase WAV back in.
      let phrasePlan: {
        phrases: PhraseInfo[];
        indices: number[];
        ranges: Array<{ index: number; startFrame: number; endFrame: number }>;
      } | null = null;
      if (
        mode === 'vocode' &&
        rendered?.phrases?.length &&
        previousF0 &&
        s.currentF0 &&
        previousF0.length === s.currentF0.length
      ) {
        const ranges = dirtyPhraseRanges(rendered.phrases, previousF0, s.currentF0);
        const changedFrames = ranges.reduce((sum, range) => sum + range.changedFrames, 0);
        const phraseCount = new Set(ranges.map((range) => range.index)).size;
        if (
          ranges.length > 0 &&
          phraseCount <= 8 &&
          changedFrames > 0 &&
          changedFrames <= s.currentF0.length * 0.5
        ) {
          mode = 'phrase';
          phrasePlan = {
            phrases: rendered.phrases,
            indices: [...new Set(ranges.map((range) => range.index))],
            ranges: ranges.map(({ index, startFrame, endFrame }) => ({ index, startFrame, endFrame })),
          };
        }
      }

      const basePayload = {
        projectId: s.project.id,
        model: s.project.synth.model,
        supportModel: s.project.synth.supportModel || undefined,
        styleShift: s.project.synth.styleShift,
        transpose: s.project.synth.transpose,
        threads: s.project.synth.threads,
        useGpu: s.project.synth.useGpu,
        sampleRate: s.project.synth.sampleRate,
        bitDepth: s.project.synth.bitDepth,
        binaries: s.neutrino.binaries || undefined,
      };
      set({
        render: {
          ...initialRender,
          status: 'running',
          mode,
          startedAt: Date.now(),
          detail: '',
        },
        logOpen: true,
        transport: { ...s.transport, playing: false },
      });
      audioEngine.stop();

      const oldTiming = s.timing;
      const oldPitch = s.currentF0;
      const hadPitchEdits = s.pitchEdited && Boolean(oldPitch);

      try {
        if (mode === 'full') {
          const result = await runRender({
            ...basePayload,
            mode: 'full',
            scoreXml: musicXmlForNeutrino(s.project.score),
          });
          const timing = timingFromText(result.timingText, scoreHash, false);
          const base = result.f0 ? parseF0(result.f0) : null;
          let current = base;
          if (hadPitchEdits && oldPitch && base) {
            current = resampleF0(oldPitch, base.length);
          }
          set((st) => ({
            timing,
            timingBase: timing,
            timingEdited: false,
            baseF0: base,
            currentF0: current,
            pitchEdited: hadPitchEdits,
            project: {
              ...st.project,
              timing: timing
                ? {
                    text: timing.text,
                    baseText: timing.text,
                    edited: false,
                    scoreHash,
                    generatedAt: Date.now(),
                  }
                : null,
              pitch: null,
              updatedAt: Date.now(),
            },
            dirty: true,
          }));
          let finalResult = result;
          if (hadPitchEdits && current && timing) {
            finalResult = await runRender({
              ...basePayload,
              mode: 'vocode',
              timingText: timing.text,
              f0: f0ToBytes(current),
            });
          }
          setRenderFinal(finalResult, 'full', timing, get().project);
          await loadAudioForPath(finalResult.wavPath);
          set({ logOpen: false });
          s.pushToast('success', i18n.t('notifications.rendered'));
        } else if (mode === 'timing') {
          if (!s.timing) throw new Error(i18n.t('errors.noTiming'));
          const result = await runRender({
            ...basePayload,
            mode: 'timing',
            timingText: s.timing.text,
            timingWindows: timingWindowPlan || undefined,
          });
          const timing = timingFromText(result.timingText || s.timing.text, scoreHash, true);
          const base = result.f0 ? parseF0(result.f0) : null;
          let current = base;
          if (hadPitchEdits && oldPitch && timing) {
            const warped = warpF0ByTiming(oldPitch, oldTiming?.phonemes || null, timing.phonemes);
            current = warped && base && warped.length === base.length ? warped : resampleF0(oldPitch, base?.length || 0);
          }
          set((st) => ({
            timing,
            timingBase: st.timingBase,
            timingEdited: true,
            baseF0: base,
            currentF0: current,
            pitchEdited: hadPitchEdits,
            project: {
              ...st.project,
              timing: timing
                ? {
                    text: timing.text,
                    baseText: st.timingBase?.text || timing.text,
                    edited: true,
                    scoreHash,
                    generatedAt: Date.now(),
                  }
                : null,
              updatedAt: Date.now(),
            },
            dirty: true,
          }));
          let finalResult = result;
          if (hadPitchEdits && current && timing) {
            finalResult = await runRender({
              ...basePayload,
              mode: 'vocode',
              timingText: timing.text,
              f0: f0ToBytes(current),
            });
          }
          setRenderFinal(finalResult, 'timing', timing, get().project);
          await loadAudioForPath(finalResult.wavPath);
          set({ logOpen: false });
          s.pushToast('success', i18n.t('notifications.timingRendered'));
        } else if (mode === 'phrase' && phrasePlan) {
          if (!s.timing || !s.currentF0) throw new Error(i18n.t('errors.noPitch'));
          try {
            const result = await runRender({
              ...basePayload,
              mode: 'phrase',
              timingText: s.timing.text,
              f0: f0ToBytes(s.currentF0),
              phrases: phrasePlan.phrases,
              phraseIndices: phrasePlan.indices,
              phraseRanges: phrasePlan.ranges,
              crossfadeMs: 30,
            });
            setRenderFinal(result, 'phrase', s.timing, get().project);
            await loadAudioForPath(result.wavPath);
            set({ logOpen: false });
            s.pushToast('success', i18n.t('notifications.phraseRendered'));
          } catch (err) {
            const message = (err as Error).message || String(err);
            if (/canceled|cancelled/i.test(message)) throw err;
            // A malformed phrase map or an engine that rejects -p should not
            // leave the user without a take; fall back to the proven full
            // vocoder path.
            s.pushToast('info', i18n.t('notifications.phraseFallback'));
            const result = await runRender({
              ...basePayload,
              mode: 'vocode',
              timingText: s.timing.text,
              f0: f0ToBytes(s.currentF0),
            });
            setRenderFinal(result, 'vocode', s.timing, get().project);
            await loadAudioForPath(result.wavPath);
            set({ logOpen: false });
            s.pushToast('success', i18n.t('notifications.pitchRendered'));
          }
        } else {
          if (!s.timing || !s.currentF0) throw new Error(i18n.t('errors.noPitch'));
          const result = await runRender({
            ...basePayload,
            mode: 'vocode',
            timingText: s.timing.text,
            f0: f0ToBytes(s.currentF0),
          });
          setRenderFinal(result, 'vocode', s.timing, get().project);
          await loadAudioForPath(result.wavPath);
          set({ logOpen: false });
          s.pushToast('success', i18n.t('notifications.pitchRendered'));
        }
      } catch (err) {
        const message = (err as Error).message || String(err);
        const canceled = /canceled|cancelled/i.test(message);
        set((st) => ({
          render: {
            ...st.render,
            status: canceled ? 'idle' : 'error',
            error: canceled ? null : message,
            percent: canceled ? 0 : st.render.percent,
          },
        }));
        if (canceled) {
          s.pushToast('info', i18n.t('notifications.renderCanceled'));
        } else {
          s.pushToast('error', `${i18n.t('render.failed')}: ${message}`);
        }
      } finally {
        activeRenderId.value = null;
      }
    },

    async cancelRender() {
      const id = activeRenderId.value || get().render.renderId;
      if (!id) return;
      await window.api.cancelRender(id);
      set((s) => ({ render: { ...s.render, detail: 'Canceling…' } }));
    },

    async exportVocalWav() {
      const s = get();
      if (!s.audio.loaded) {
        s.pushToast('error', i18n.t('export.noAudio'));
        return;
      }
      const chosen = await window.api.saveDialog({
        title: i18n.t('export.vocalWav'),
        defaultPath: `${s.project.name || 'vocal'}-vocal.wav`,
        filters: [{ name: 'WAV', extensions: ['wav'] }],
      });
      if (!chosen) return;
      set({ exporting: true });
      try {
        const bytes = await audioEngine.renderVocal({
          sampleRate: s.settings?.sampleRate || 48000,
          bitDepth: s.settings?.bitDepth || 16,
          duration: s.audio.duration,
          includeReference: false,
          includeDynamics: s.project.dynamics.enabled,
          normalize: false,
          referenceVolume: s.project.reference?.volume ?? 0.8,
          referenceOffset: s.project.reference?.offset ?? 0,
          dynamicsPoints: s.project.dynamics.points,
        });
        await window.api.writeBinary(chosen, bytes);
        s.pushToast('success', i18n.t('notifications.audioExported'));
      } catch (err) {
        s.pushToast('error', i18n.t('errors.exportFailed', { message: (err as Error).message }));
      } finally {
        set({ exporting: false });
      }
    },

    async exportMixdown() {
      const s = get();
      if (!s.audio.loaded) {
        s.pushToast('error', i18n.t('export.noAudio'));
        return;
      }
      if (s.project.reference && !audioEngine.referenceBuffer) {
        try {
          await loadReferenceForPath(s.project.reference.path);
        } catch {}
      }
      const chosen = await window.api.saveDialog({
        title: i18n.t('export.mixdown'),
        defaultPath: `${s.project.name || 'mix'}-mix.wav`,
        filters: [{ name: 'WAV', extensions: ['wav'] }],
      });
      if (!chosen) return;
      set({ exporting: true });
      try {
        const ref = s.project.reference;
        const refDuration = audioEngine.referenceBuffer?.duration || 0;
        const duration = Math.max(s.audio.duration, ref ? ref.offset + refDuration : 0);
        const bytes = await audioEngine.renderMix({
          sampleRate: s.settings?.sampleRate || 48000,
          bitDepth: s.settings?.bitDepth || 16,
          duration,
          includeReference: Boolean(ref && !ref.muted && audioEngine.referenceBuffer),
          includeDynamics: s.project.dynamics.enabled,
          normalize: false,
          referenceVolume: ref?.volume ?? 0.8,
          referenceOffset: ref?.offset ?? 0,
          dynamicsPoints: s.project.dynamics.points,
        });
        await window.api.writeBinary(chosen, bytes);
        s.pushToast('success', i18n.t('notifications.mixExported'));
      } catch (err) {
        s.pushToast('error', i18n.t('errors.exportFailed', { message: (err as Error).message }));
      } finally {
        set({ exporting: false });
      }
    },
  };

  return state;
});
