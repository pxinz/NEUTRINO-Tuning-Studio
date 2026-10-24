export type Language = 'auto' | 'zh' | 'en' | 'ja';
export type Theme = 'dark' | 'light' | 'system';
export type EditorTab = 'score' | 'timing' | 'pitch' | 'dynamics';
export type Tool = 'select' | 'pencil' | 'eraser' | 'line' | 'smooth' | 'vibrato';
export type RenderMode = 'full' | 'timing' | 'vocode' | 'phrase';
export type RenderStatus = 'idle' | 'running' | 'done' | 'error';

export interface WindowBounds {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

export interface Settings {
  neutrinoRoot: string;
  runner: 'auto' | 'native' | 'wine';
  wineCommand: string;
  language: Language;
  theme: Theme;
  defaultModel: string;
  supportModel: string;
  threads: number;
  useGpu: boolean;
  sampleRate: number;
  bitDepth: number;
  outputDir: string;
  recentProjects: string[];
  scrollWheelMode: 'horizontal' | 'vertical';
  window: WindowBounds;
  showWelcome: boolean;
  autoSave: boolean;
  masterVolume: number;
}

export interface AppInfo {
  version: string;
  name: string;
  electron: string;
  chrome: string;
  node: string;
  platform: 'win32' | 'darwin' | 'linux' | string;
  arch: string;
  locale: string;
  userData: string;
  isPackaged: boolean;
}

export interface ModelInfo {
  id: string;
  dir: string;
  name: string;
  displayName: string;
  localizedNames: { en: string; ja: string; zh: string };
  type: string;
  gender: string;
  language: string;
  style: string;
  support: boolean;
  version: string;
  modelType: string;
  topKey: number | null;
  bottomKey: number | null;
  licensePath: string | null;
  readmePath: string | null;
  hasWeights: boolean;
}

export interface NeutrinoInfo {
  ok: boolean;
  root: string;
  binaries?: { neutrino: string | null; converter: string | null } | null;
  runner?: 'native' | 'wine';
  wine?: string | null;
  version?: string;
  banner?: string;
  help?: string;
  models: ModelInfo[];
  allModels?: ModelInfo[];
  warnings?: string[];
  error?: string | null;
  candidates?: string[];
  platform?: string;
}

export interface Note {
  id: string;
  pitch: number;
  start: number; // beats (quarter notes)
  duration: number; // beats
  lyric: string;
  breath: boolean;
  velocity?: number;
}

export interface TempoEvent {
  beat: number;
  bpm: number;
}

export interface TimeSignature {
  beat: number;
  numerator: number;
  denominator: number;
}

export interface Score {
  title: string;
  artist: string;
  notes: Note[];
  tempos: TempoEvent[];
  timeSigs: TimeSignature[];
  keyFifths: number;
}

export interface SynthOptions {
  model: string;
  supportModel: string;
  styleShift: number;
  transpose: number;
  threads: number;
  useGpu: boolean;
  sampleRate: number;
  bitDepth: number;
}

export interface DynamicsPoint {
  time: number; // seconds
  db: number;
}

export interface Dynamics {
  enabled: boolean;
  points: DynamicsPoint[];
}

export interface ReferenceTrack {
  path: string;
  name: string;
  offset: number; // seconds
  volume: number; // 0..1
  muted: boolean;
}

export interface StoredTiming {
  text: string;
  baseText?: string;
  edited: boolean;
  scoreHash: string;
  generatedAt: number;
}

export interface StoredPitch {
  base: string; // gzip+base64 Float32LE
  current: string; // gzip+base64 Float32LE
  edited: boolean;
  timingHash: string;
}

export interface PhraseInfo {
  /** Index passed to NEUTRINO's `-p` flag (includes silence rows). */
  index: number;
  /** Start frame at 100 fps. */
  startFrame: number;
  /** Exclusive end frame at 100 fps. */
  endFrame: number;
  sung: boolean;
  lyric?: string;
}

export interface StoredRender {
  wavPath: string;
  f0Path: string;
  melspecPath: string;
  timingPath: string;
  duration: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  model: string;
  renderedAt: number;
  scoreHash: string;
  timingHash: string;
  synthHash?: string;
  logPath?: string;
  phrases?: PhraseInfo[];
}

export interface Project {
  format: 'neutrino-tuning-studio';
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  score: Score;
  synth: SynthOptions;
  timing: StoredTiming | null;
  pitch: StoredPitch | null;
  dynamics: Dynamics;
  reference: ReferenceTrack | null;
  render: StoredRender | null;
}

export interface Phoneme {
  start: number; // seconds
  end: number;
  phoneme: string;
}

export interface TimingData {
  phonemes: Phoneme[];
  text: string;
  edited: boolean;
  scoreHash: string;
}

export interface RenderStartPayload {
  projectId: string;
  mode: RenderMode;
  scoreXml?: string;
  timingText?: string;
  f0?: Uint8Array;
  model: string;
  supportModel?: string;
  styleShift: number;
  transpose: number;
  threads: number;
  useGpu: boolean;
  sampleRate: number;
  bitDepth: number;
  binaries?: { neutrino: string | null; converter: string | null };
  phrases?: PhraseInfo[];
  phraseIndices?: number[];
  crossfadeMs?: number;
}

export interface RenderResult {
  renderId: string;
  mode: RenderMode;
  wavPath: string;
  f0Path: string;
  melspecPath: string;
  timingPath: string;
  timingText: string;
  duration: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  logPath: string;
  model: string;
  elapsedMs: number;
  f0: Uint8Array | null;
  phrases?: PhraseInfo[];
}

export interface RenderProgressEvent {
  type: 'progress';
  renderId: string;
  percent: number;
  stage: string;
  detail: string;
}

export interface RenderLogEvent {
  type: 'log';
  renderId: string;
  line: string;
}

export interface RenderDoneEvent {
  type: 'done';
  renderId: string;
  result: RenderResult;
}

export interface RenderErrorEvent {
  type: 'error';
  renderId: string;
  error: string;
  canceled: boolean;
  log: string[];
}

export type RenderEvent = RenderProgressEvent | RenderLogEvent | RenderDoneEvent | RenderErrorEvent;

export interface RenderUiState {
  status: RenderStatus;
  percent: number;
  stage: string;
  detail: string;
  mode: RenderMode | null;
  renderId: string | null;
  logs: string[];
  error: string | null;
  result: RenderResult | null;
  startedAt: number | null;
  elapsedMs: number;
}

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
  length: number;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface HistorySnapshot {
  score: Score;
  timing: TimingData | null;
  baseF0: Float32Array | null;
  currentF0: Float32Array | null;
  pitchEdited: boolean;
  dynamics: Dynamics;
  reference: ReferenceTrack | null;
  label: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
  multi?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface PreloadApi {
  platform: string;
  getAppInfo(): Promise<AppInfo>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  addRecentProject(path: string): Promise<Settings>;

  detectNeutrino(opts?: {
    root?: string;
    runner?: Settings['runner'];
    wineCommand?: string;
    force?: boolean;
    save?: boolean;
  }): Promise<NeutrinoInfo>;
  getModels(): Promise<ModelInfo[]>;

  openDialog(opts?: OpenDialogOptions): Promise<string[]>;
  saveDialog(opts?: SaveDialogOptions): Promise<string | null>;
  directoryDialog(opts?: { title?: string; defaultPath?: string }): Promise<string | null>;

  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  writeText(path: string, data: string): Promise<boolean>;
  writeBinary(path: string, data: Uint8Array): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ exists: boolean; size: number; mtime: number; isDirectory: boolean }>;
  deleteFile(path: string): Promise<boolean>;

  openExternal(url: string): Promise<void>;
  showItemInFolder(path: string): Promise<boolean>;

  readProject(path: string): Promise<string>;
  writeProject(path: string, data: string): Promise<boolean>;

  startRender(payload: RenderStartPayload): Promise<{
    renderId: string;
    workspace: string;
    files: Record<string, string>;
  }>;
  cancelRender(renderId: string): Promise<boolean>;
  isRenderBusy(): Promise<boolean>;

  setTitle(title: string): Promise<boolean>;
  quit(): Promise<boolean>;
  setDirty(dirty: boolean): Promise<boolean>;
  confirmClose(): Promise<boolean>;

  onRenderEvent(callback: (event: RenderEvent) => void): () => void;
  onMenuAction(callback: (action: string) => void): () => void;
  onSettingsChanged(callback: (settings: Settings) => void): () => void;
  onRequestClose(callback: () => void): () => void;
}
