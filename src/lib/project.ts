import type {
  Project,
  Score,
  Settings,
  StoredPitch,
  StoredTiming,
  SynthOptions,
  TimingData,
} from './types';
import { decodeF0, encodeF0 } from './pitch';
import { createEmptyScore, getScoreHash, normalizeScore } from './score';
import { defaultDynamics, normalizeDynamics } from './dynamics';
import { deepClone, uid } from './time';
import { hashString } from './time';

export const PROJECT_FORMAT = 'neutrino-tuning-studio';
export const PROJECT_EXT = 'ntstudio';

export function defaultSynth(settings?: Partial<Settings>, model = ''): SynthOptions {
  return {
    model: model || settings?.defaultModel || '',
    supportModel: settings?.supportModel || '',
    styleShift: 0,
    transpose: 0,
    threads: settings?.threads ?? 4,
    useGpu: settings?.useGpu ?? true,
    sampleRate: settings?.sampleRate ?? 48000,
    bitDepth: settings?.bitDepth ?? 16,
  };
}

export function createProject(score?: Score, synth?: Partial<SynthOptions>, name?: string): Project {
  const now = Date.now();
  return {
    format: PROJECT_FORMAT,
    version: 1,
    id: uid('p'),
    name: name || (score && score.title) || 'Untitled',
    createdAt: now,
    updatedAt: now,
    score: score ? normalizeScore(score) : createEmptyScore(),
    synth: { ...defaultSynth(), ...(synth || {}) },
    timing: null,
    pitch: null,
    dynamics: defaultDynamics(0),
    reference: null,
    render: null,
  };
}

export interface DecodedProject {
  project: Project;
  baseF0: Float32Array | null;
  currentF0: Float32Array | null;
  timing: TimingData | null;
  scoreHash: string;
}

export function decodeProject(text: string): DecodedProject {
  const raw = JSON.parse(text);
  if (raw?.format !== PROJECT_FORMAT) {
    throw new Error('Not a NEUTRINO Tuning Studio project.');
  }
  const project: Project = {
    format: PROJECT_FORMAT,
    version: 1,
    id: raw.id || uid('p'),
    name: raw.name || 'Untitled',
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
    score: normalizeScore(raw.score || createEmptyScore()),
    synth: { ...defaultSynth(), ...(raw.synth || {}) },
    timing: raw.timing || null,
    pitch: raw.pitch || null,
    dynamics: normalizeDynamics(raw.dynamics || defaultDynamics(0)),
    reference: raw.reference || null,
    render: raw.render || null,
  };
  const baseF0 = decodeF0(project.pitch?.base);
  const currentF0 = decodeF0(project.pitch?.current);
  let timing: TimingData | null = null;
  if (project.timing?.text) {
    const phonemes = parseTimingTextLoose(project.timing.text);
    if (phonemes.length) {
      timing = {
        phonemes,
        text: project.timing.text,
        edited: Boolean(project.timing.edited),
        scoreHash: project.timing.scoreHash || '',
      };
    }
  }
  return { project, baseF0, currentF0, timing, scoreHash: getScoreHash(project.score) };
}

function parseTimingTextLoose(text: string) {
  const phonemes: Array<{ start: number; end: number; phoneme: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    phonemes.push({ start: a / 1e7, end: b / 1e7, phoneme: parts.slice(2).join(' ') });
  }
  return phonemes;
}

export function encodeProject(
  project: Project,
  baseF0: Float32Array | null,
  currentF0: Float32Array | null,
  timing: TimingData | null,
  pitchEdited: boolean,
): string {
  const out = deepClone(project);
  out.updatedAt = Date.now();
  out.timing = timing
    ? ({
        text: timing.text,
        edited: timing.edited,
        scoreHash: timing.scoreHash || getScoreHash(out.score),
        generatedAt: Date.now(),
      } satisfies StoredTiming)
    : null;
  if (baseF0 || currentF0) {
    out.pitch = {
      base: encodeF0(baseF0),
      current: encodeF0(currentF0 || baseF0),
      edited: pitchEdited,
      timingHash: timing ? hashString(timing.text) : '',
    } satisfies StoredPitch;
  } else {
    out.pitch = null;
  }
  out.dynamics = normalizeDynamics(out.dynamics);
  return JSON.stringify(out, null, 2);
}

export function projectFileName(project: Project): string {
  const base = (project.name || 'Untitled')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${base || 'Untitled'}.${PROJECT_EXT}`;
}

export function renderSignature(synth: SynthOptions): string {
  return hashString(
    JSON.stringify({
      model: synth.model,
      supportModel: synth.supportModel,
      styleShift: synth.styleShift,
      transpose: synth.transpose,
      sampleRate: synth.sampleRate,
      bitDepth: synth.bitDepth,
    }),
  );
}

export function projectIsRendered(project: Project): boolean {
  return Boolean(project.render && project.render.wavPath);
}

export function renderMatchesScore(project: Project): boolean {
  if (!project.render) return false;
  return project.render.scoreHash === getScoreHash(project.score);
}

export function renderMatchesTiming(project: Project, timing: TimingData | null): boolean {
  if (!project.render) return false;
  if (!timing) return false;
  return project.render.timingHash === hashString(timing.text);
}

export function updateProjectName(project: Project, name: string): Project {
  return { ...project, name: name.trim() || 'Untitled', updatedAt: Date.now() };
}
