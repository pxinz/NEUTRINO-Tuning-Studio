import type { Note, Score, TempoEvent, TimeSignature } from './types';
import { deepClone, hashString, midiToName, uid } from './time';

export const DEFAULT_TEMPO = 100;
export const DEFAULT_TIME_SIG: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };
export const EPS = 1e-6;

export function normalizeTempos(tempos: TempoEvent[]): TempoEvent[] {
  const list = (tempos || [])
    .filter((t) => Number.isFinite(t.beat) && Number.isFinite(t.bpm) && t.bpm > 0)
    .map((t) => ({ beat: Math.max(0, t.beat), bpm: Math.min(400, Math.max(20, t.bpm)) }))
    .sort((a, b) => a.beat - b.beat);
  if (!list.length) return [{ beat: 0, bpm: DEFAULT_TEMPO }];
  if (list[0].beat > EPS) list.unshift({ beat: 0, bpm: list[0].bpm });
  const dedup: TempoEvent[] = [];
  for (const t of list) {
    if (dedup.length && Math.abs(dedup[dedup.length - 1].beat - t.beat) < EPS) {
      dedup[dedup.length - 1] = t;
    } else {
      dedup.push(t);
    }
  }
  return dedup;
}

export function normalizeTimeSigs(sigs: TimeSignature[]): TimeSignature[] {
  const list = (sigs || [])
    .filter(
      (s) =>
        Number.isFinite(s.beat) &&
        Number.isFinite(s.numerator) &&
        Number.isFinite(s.denominator) &&
        s.numerator >= 1 &&
        s.denominator >= 1,
    )
    .map((s) => ({
      beat: Math.max(0, s.beat),
      numerator: Math.min(32, Math.max(1, Math.round(s.numerator))),
      denominator: [1, 2, 4, 8, 16, 32].includes(Math.round(s.denominator))
        ? Math.round(s.denominator)
        : 4,
    }))
    .sort((a, b) => a.beat - b.beat);
  if (!list.length) return [{ ...DEFAULT_TIME_SIG }];
  if (list[0].beat > EPS) list.unshift({ ...DEFAULT_TIME_SIG, beat: 0 });
  const dedup: TimeSignature[] = [];
  for (const s of list) {
    if (dedup.length && Math.abs(dedup[dedup.length - 1].beat - s.beat) < EPS) {
      dedup[dedup.length - 1] = s;
    } else dedup.push(s);
  }
  return dedup;
}

export function normalizeScore(score: Score): Score {
  const notes = (score.notes || [])
    .filter(
      (n) =>
        Number.isFinite(n.start) &&
        Number.isFinite(n.duration) &&
        Number.isFinite(n.pitch) &&
        n.duration > EPS,
    )
    .map((n) => ({
      ...n,
      id: n.id || uid(),
      start: Math.max(0, Math.round(n.start * 1e6) / 1e6),
      duration: Math.max(1 / 64, Math.round(n.duration * 1e6) / 1e6),
      pitch: Math.min(127, Math.max(0, Math.round(n.pitch))),
      lyric: n.lyric ?? '',
      breath: Boolean(n.breath),
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return {
    title: score.title || '',
    artist: score.artist || '',
    notes,
    tempos: normalizeTempos(score.tempos),
    timeSigs: normalizeTimeSigs(score.timeSigs),
    keyFifths: Number.isFinite(score.keyFifths) ? Math.round(score.keyFifths) : 0,
  };
}

export function bpmAt(score: Score, beat: number): number {
  const tempos = score.tempos;
  let bpm = tempos[0]?.bpm || DEFAULT_TEMPO;
  for (const t of tempos) {
    if (t.beat <= beat + EPS) bpm = t.bpm;
    else break;
  }
  return bpm;
}

export function tempoAtBeat(score: Score, beat: number): TempoEvent {
  const tempos = score.tempos;
  let current = tempos[0] || { beat: 0, bpm: DEFAULT_TEMPO };
  for (const t of tempos) {
    if (t.beat <= beat + EPS) current = t;
    else break;
  }
  return current;
}

export function beatToSeconds(score: Score, beat: number): number {
  if (beat <= 0) return 0;
  let seconds = 0;
  const tempos = score.tempos;
  for (let i = 0; i < tempos.length; i++) {
    const cur = tempos[i];
    const next = tempos[i + 1];
    if (beat <= cur.beat + EPS) break;
    const end = next ? Math.min(beat, next.beat) : beat;
    if (end > cur.beat) {
      seconds += ((end - cur.beat) * 60) / cur.bpm;
    }
    if (next && beat <= next.beat + EPS) break;
  }
  return seconds;
}

export function secondsToBeat(score: Score, seconds: number): number {
  if (seconds <= 0) return 0;
  let acc = 0;
  const tempos = score.tempos;
  for (let i = 0; i < tempos.length; i++) {
    const cur = tempos[i];
    const next = tempos[i + 1];
    const span = next ? next.beat - cur.beat : Infinity;
    const secSpan = span === Infinity ? Infinity : (span * 60) / cur.bpm;
    if (seconds <= acc + secSpan + EPS) {
      return cur.beat + ((seconds - acc) * cur.bpm) / 60;
    }
    acc += secSpan;
  }
  const last = tempos[tempos.length - 1] || { beat: 0, bpm: DEFAULT_TEMPO };
  return last.beat + ((seconds - acc) * last.bpm) / 60;
}

export function timeSignatureAt(score: Score, beat: number): TimeSignature {
  let sig = score.timeSigs[0] || DEFAULT_TIME_SIG;
  for (const s of score.timeSigs) {
    if (s.beat <= beat + EPS) sig = s;
    else break;
  }
  return sig;
}

export function measureLengthBeats(sig: TimeSignature): number {
  return (sig.numerator * 4) / sig.denominator;
}

export function scoreEndBeat(score: Score): number {
  let end = 0;
  for (const n of score.notes) end = Math.max(end, n.start + n.duration);
  return end;
}

export function scoreDurationSeconds(score: Score): number {
  return beatToSeconds(score, scoreEndBeat(score));
}

export function noteStartSeconds(score: Score, note: Note): number {
  return beatToSeconds(score, note.start);
}

export function noteEndSeconds(score: Score, note: Note): number {
  return beatToSeconds(score, note.start + note.duration);
}

export interface BarLine {
  beat: number;
  time: number;
  index: number;
  measureStart: boolean;
  sig: TimeSignature;
}

export function getBarLines(score: Score, maxBeats?: number): BarLine[] {
  const lines: BarLine[] = [];
  const end = maxBeats ?? scoreEndBeat(score) + measureLengthBeats(timeSignatureAt(score, scoreEndBeat(score)));
  let beat = 0;
  let index = 0;
  const guard = 20000;
  while (beat <= end + EPS && index < guard) {
    const sig = timeSignatureAt(score, beat + EPS);
    const len = measureLengthBeats(sig);
    lines.push({
      beat,
      time: beatToSeconds(score, beat),
      index,
      measureStart: true,
      sig,
    });
    // beat lines inside the measure
    const beatUnit = 4 / sig.denominator;
    for (let b = beat + beatUnit; b < beat + len - EPS; b += beatUnit) {
      lines.push({
        beat: b,
        time: beatToSeconds(score, b),
        index,
        measureStart: false,
        sig,
      });
    }
    beat += len;
    index++;
  }
  return lines;
}

export function measureIndexAt(score: Score, beat: number): number {
  let cur = 0;
  let index = 0;
  let guard = 0;
  while (cur < beat - EPS && guard++ < 20000) {
    const sig = timeSignatureAt(score, cur + EPS);
    cur += measureLengthBeats(sig);
    index++;
  }
  return index;
}

export function beatOfMeasure(score: Score, measureIndex: number): number {
  let cur = 0;
  for (let i = 0; i < measureIndex; i++) {
    const sig = timeSignatureAt(score, cur + EPS);
    cur += measureLengthBeats(sig);
  }
  return cur;
}

export interface PhraseRange {
  startBeat: number;
  endBeat: number;
  start: number;
  end: number;
  noteIds: string[];
}

export function getPhrases(score: Score): PhraseRange[] {
  const notes = score.notes;
  const phrases: PhraseRange[] = [];
  let current: Note[] = [];
  let lastEnd = -1;
  const flush = () => {
    if (!current.length) return;
    const startBeat = current[0].start;
    const endBeat = current[current.length - 1].start + current[current.length - 1].duration;
    phrases.push({
      startBeat,
      endBeat,
      start: beatToSeconds(score, startBeat),
      end: beatToSeconds(score, endBeat),
      noteIds: current.map((n) => n.id),
    });
    current = [];
  };
  for (const note of notes) {
    if (lastEnd >= 0 && note.start > lastEnd + 1e-4) flush();
    current.push(note);
    lastEnd = Math.max(lastEnd, note.start + note.duration);
    if (note.breath) flush();
  }
  flush();
  return phrases;
}

export function overlappingNotes(score: Score): [Note, Note][] {
  const out: [Note, Note][] = [];
  const notes = [...score.notes].sort((a, b) => a.start - b.start);
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1];
    if (notes[i].start < prev.start + prev.duration - 1e-5) out.push([prev, notes[i]]);
  }
  return out;
}

export function notesAtTime(score: Score, seconds: number): Note[] {
  return score.notes.filter((n) => {
    const s = beatToSeconds(score, n.start);
    const e = beatToSeconds(score, n.start + n.duration);
    return seconds >= s && seconds < e;
  });
}

export function getScoreHash(score: Score): string {
  return hashString(
    JSON.stringify({
      notes: score.notes.map((n) => [n.pitch, n.start, n.duration, n.lyric, n.breath]),
      tempos: score.tempos,
      timeSigs: score.timeSigs,
      keyFifths: score.keyFifths,
    }),
  );
}

export function createEmptyScore(): Score {
  return {
    title: '',
    artist: '',
    notes: [],
    tempos: [{ beat: 0, bpm: DEFAULT_TEMPO }],
    timeSigs: [{ ...DEFAULT_TIME_SIG }],
    keyFifths: 0,
  };
}

export function createDemoScore(): Score {
  // Original public-domain-friendly demo melody (D minor pentatonic).
  const melody: Array<[number, number, string, boolean?]> = [
    [62, 1, 'は'],
    [65, 1, 'る'],
    [67, 2, 'の'],
    [69, 1.5, 'か'],
    [67, 0.5, 'ぜ'],
    [65, 1, 'が'],
    [62, 1, 'ふ'],
    [60, 1, 'く'],
    [62, 1, 'こ'],
    [65, 1, 'ろ'],
    [67, 2, 'に'],
    [69, 1, 'ひ'],
    [72, 1, 'と'],
    [69, 1, 'つ'],
    [67, 1, 'の'],
    [65, 1, 'ゆ'],
    [62, 1, 'め'],
    [65, 1, 'を'],
    [67, 2, 'み'],
    [65, 1, 'つ'],
    [62, 1, 'け'],
    [60, 1, 'て'],
    [62, 2, 'ゆ'],
    [65, 1, 'く'],
    [67, 1, 'は'],
    [69, 1.5, 'る'],
    [67, 0.5, 'の'],
    [65, 1, 'か'],
    [62, 1, 'ぜ'],
  ];
  const notes: Note[] = [];
  let beat = 0;
  let bar = 0;
  for (let i = 0; i < melody.length; i++) {
    const [pitch, duration, lyric] = melody[i];
    if (bar > 0 && beat >= bar * 4 - 1e-6) {
      // keep notes inside 4/4 bars
    }
    notes.push({
      id: uid(),
      pitch,
      start: beat,
      duration,
      lyric,
      breath: i === 9 || i === 19,
    });
    beat += duration;
    bar = Math.floor(beat / 4);
  }
  return normalizeScore({
    title: 'Spring Breeze',
    artist: 'NEUTRINO Tuning Studio',
    notes,
    tempos: [{ beat: 0, bpm: 100 }],
    timeSigs: [{ beat: 0, numerator: 4, denominator: 4 }],
    keyFifths: 0,
  });
}

export function cloneScore(score: Score): Score {
  return deepClone(score);
}

export function noteLabel(note: Note): string {
  return `${midiToName(note.pitch)} ${note.lyric || '—'}`;
}

export function durationName(beats: number): string {
  const map: Array<[number, string]> = [
    [4, 'whole'],
    [3, 'half-dotted'],
    [2, 'half'],
    [1.5, 'quarter-dotted'],
    [1, 'quarter'],
    [0.75, 'eighth-dotted'],
    [0.5, 'eighth'],
    [0.375, '16th-dotted'],
    [0.25, '16th'],
    [0.125, '32nd'],
  ];
  for (const [v, name] of map) if (Math.abs(beats - v) < 1e-4) return name;
  return 'custom';
}
