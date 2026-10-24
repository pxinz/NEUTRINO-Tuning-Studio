import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { Note, Score, TempoEvent, TimeSignature } from './types';
import {
  DEFAULT_TEMPO,
  beatToSeconds,
  measureLengthBeats,
  normalizeScore,
  normalizeTempos,
  normalizeTimeSigs,
  scoreEndBeat,
  timeSignatureAt,
} from './score';
import { uid } from './time';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: true,
  processEntities: true,
});

type X = any;

function arr<T = X>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: X): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (value['#text'] !== undefined) return String(value['#text']);
  }
  return '';
}

function num(value: X, fallback = 0): number {
  const n = Number(text(value));
  return Number.isFinite(n) ? n : fallback;
}

function attr(node: X, name: string): string {
  if (!node || typeof node !== 'object') return '';
  return node[`@_${name}`] !== undefined ? String(node[`@_${name}`]) : '';
}

const STEP_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function pitchToMidi(pitch: X): number | null {
  if (!pitch) return null;
  const step = text(pitch.step).toUpperCase();
  if (!(step in STEP_SEMITONES)) return null;
  const alter = num(pitch.alter, 0);
  const octave = num(pitch.octave, 4);
  return Math.round((octave + 1) * 12 + STEP_SEMITONES[step] + alter);
}

function getLyric(note: X): string {
  const lyrics = arr(note.lyric);
  if (!lyrics.length) return '';
  const sorted = [...lyrics].sort((a, b) => num(a['@_number'], 1) - num(b['@_number'], 1));
  for (const lyric of sorted) {
    const t = text(lyric.text).trim();
    if (t) return t;
  }
  return '';
}

function hasTie(note: X, type: 'start' | 'stop'): boolean {
  for (const tie of arr(note.tie)) {
    if (attr(tie, 'type') === type) return true;
  }
  const notations = arr(note.notations);
  for (const n of notations) {
    for (const tied of arr(n.tied)) {
      if (attr(tied, 'type') === type) return true;
    }
  }
  return false;
}

function hasBreath(note: X): boolean {
  for (const n of arr(note.notations)) {
    if (n && n['breath-mark'] !== undefined) return true;
  }
  return false;
}

interface RawNote {
  pitch: number;
  start: number;
  duration: number;
  lyric: string;
  breath: boolean;
  tieStart: boolean;
  tieStop: boolean;
  voice: string;
  measure: number;
  chord: boolean;
}

interface PartResult {
  notes: RawNote[];
  tempos: TempoEvent[];
  timeSigs: TimeSignature[];
  keyFifths: number;
  partName: string;
  warnings: string[];
}

function parsePart(part: X): PartResult {
  const measures = arr(part.measure);
  let divisions = 1;
  let cursor = 0; // in divisions, relative to the current measure start
  let measureStartBeat = 0;
  let keyFifths = 0;
  let partName = '';
  let lastNonChordStart = 0;
  const rawNotes: RawNote[] = [];
  const tempos: TempoEvent[] = [];
  const timeSigs: TimeSignature[] = [];
  const warnings: string[] = [];
  let currentSig: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };

  for (let mi = 0; mi < measures.length; mi++) {
    const measure = measures[mi];
    let measureStartCursor = cursor;
    let expectedLength = measureLengthBeats(currentSig) * divisions;
    let sawAttributes = false;

    const attrs = arr(measure.attributes);
    for (const a of attrs) {
      sawAttributes = true;
      if (a.divisions !== undefined) divisions = Math.max(1, Math.round(num(a.divisions, divisions)));
      if (a.key !== undefined) keyFifths = Math.round(num(a.key.fifths, keyFifths));
      if (a.time !== undefined) {
        const beats = num(arr(a.time.beats)[0], 4);
        const beatType = num(arr(a.time['beat-type'])[0], 4);
        currentSig = {
          beat: measureStartBeat,
          numerator: Math.max(1, Math.round(beats)),
          denominator: Math.max(1, Math.round(beatType)),
        };
        if (!timeSigs.some((s) => Math.abs(s.beat - currentSig.beat) < 1e-6)) {
          timeSigs.push({ ...currentSig });
        }
        expectedLength = measureLengthBeats(currentSig) * divisions;
      }
    }

    // Directions (tempo) can occur before or between notes.
    const processDirection = (dir: X) => {
      const sounds = arr(dir.sound);
      for (const sound of sounds) {
        const tempo = num(sound['@_tempo'], 0);
        if (tempo > 0) {
          const beat = measureStartBeat + cursor / divisions;
          if (!tempos.some((t) => Math.abs(t.beat - beat) < 1e-6)) tempos.push({ beat, bpm: tempo });
        }
      }
      const types = arr(dir['direction-type']);
      for (const dt of types) {
        const metro = dt && dt.metronome;
        if (metro) {
          const perMinute = num(metro['per-minute'], 0);
          if (perMinute > 0) {
            const beat = measureStartBeat + cursor / divisions;
            if (!tempos.some((t) => Math.abs(t.beat - beat) < 1e-6)) tempos.push({ beat, bpm: perMinute });
          }
        }
      }
    };
    for (const dir of arr(measure.direction)) processDirection(dir);

    // MusicXML elements can be interleaved: notes, backup, forward, direction.
    // fast-xml-parser preserves insertion order in object keys, so use a key-order walk.
    for (const key of Object.keys(measure)) {
      if (key.startsWith('@_')) continue;
      const value = measure[key];
      if (key === 'note') {
        for (const note of arr(value)) {
          const isGrace = note.grace !== undefined;
          const isCue = note.cue !== undefined;
          const isChord = note.chord !== undefined;
          const isRest = note.rest !== undefined;
          const duration = Math.max(0, num(note.duration, 0));
          const start = isChord ? lastNonChordStart : cursor;
          if (note.notations !== undefined) {
            for (const n of arr(note.notations)) {
              if (n && n['breath-mark'] !== undefined) {
                // handled on the note below
              }
            }
          }
          if (isGrace) continue;
          if (isCue) continue;
          if (!isChord) lastNonChordStart = cursor;
          const lyric = getLyric(note);
          const voice = text(note.voice) || '1';
          if (!isRest) {
            const midi = pitchToMidi(note.pitch);
            if (midi !== null && duration > 0) {
              rawNotes.push({
                pitch: midi,
                start: measureStartBeat + start / divisions,
                duration: duration / divisions,
                lyric,
                breath: hasBreath(note),
                tieStart: hasTie(note, 'start'),
                tieStop: hasTie(note, 'stop'),
                voice,
                measure: mi + 1,
                chord: isChord,
              });
            }
          }
          if (!isChord) cursor += duration;
        }
      } else if (key === 'backup') {
        for (const b of arr(value)) cursor = Math.max(0, cursor - num(b.duration, 0));
      } else if (key === 'forward') {
        for (const f of arr(value)) cursor += num(f.duration, 0);
      } else if (key === 'direction') {
        // already processed above
      }
    }

    if (!sawAttributes && !timeSigs.length) {
      timeSigs.push({ ...currentSig, beat: 0 });
    }

    const actualLength = Math.max(cursor - measureStartCursor, expectedLength);
    measureStartBeat += (actualLength || expectedLength) / divisions;
    measureStartCursor = cursor;
    cursor = 0;
    lastNonChordStart = 0;
  }

  if (!timeSigs.length) timeSigs.push({ beat: 0, numerator: 4, denominator: 4 });
  if (!tempos.length) tempos.push({ beat: 0, bpm: DEFAULT_TEMPO });

  return { notes: rawNotes, tempos, timeSigs, keyFifths, partName, warnings };
}

function chooseVoice(notes: RawNote[]): string {
  const stats = new Map<string, { total: number; lyrics: number }>();
  for (const n of notes) {
    const s = stats.get(n.voice) || { total: 0, lyrics: 0 };
    s.total++;
    if (n.lyric) s.lyrics++;
    stats.set(n.voice, s);
  }
  let best = '1';
  let bestScore = -1;
  for (const [voice, s] of stats) {
    const score = s.lyrics * 1000 + s.total;
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}

function collapseChords(notes: RawNote[]): RawNote[] {
  const map = new Map<string, RawNote>();
  for (const n of notes) {
    const key = `${n.start.toFixed(6)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, n);
    } else {
      if (n.lyric && !existing.lyric) map.set(key, n);
      else if (!n.lyric && !existing.lyric && n.pitch > existing.pitch) map.set(key, n);
      else if (n.pitch > existing.pitch && !existing.lyric) map.set(key, n);
    }
  }
  return [...map.values()].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

function mergeTies(notes: RawNote[]): RawNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const out: RawNote[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.pitch === n.pitch &&
      Math.abs(prev.start + prev.duration - n.start) < 1e-4 &&
      (prev.tieStart || n.tieStop)
    ) {
      prev.duration += n.duration;
      prev.tieStart = n.tieStart;
      if (!prev.lyric && n.lyric) prev.lyric = n.lyric;
      prev.breath = prev.breath || n.breath;
      continue;
    }
    out.push({ ...n });
  }
  return out;
}

export interface MusicXmlImportResult {
  score: Score;
  warnings: string[];
  partName: string;
  partCount: number;
  totalNotes: number;
}

export function importMusicXml(xml: string): MusicXmlImportResult {
  let doc: X;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    throw new Error(`MusicXML parse error: ${(err as Error).message}`);
  }
  const root = doc['score-partwise'];
  if (!root) {
    if (doc['score-timewise']) throw new Error('score-timewise MusicXML is not supported. Export partwise MusicXML.');
    throw new Error('This file is not a MusicXML score-partwise document.');
  }
  const parts = arr(root.part);
  if (!parts.length) throw new Error('MusicXML has no parts.');
  const partNames = new Map<string, string>();
  for (const sp of arr(root['part-list']?.['score-part'])) {
    const id = attr(sp, 'id');
    if (id) partNames.set(id, text(sp['part-name']) || id);
  }

  const parsed = parts.map((part) => {
    const result = parsePart(part);
    result.partName = partNames.get(attr(part, 'id')) || '';
    return result;
  });
  let bestIndex = 0;
  let bestScore = -1;
  parsed.forEach((p, i) => {
    const lyrics = p.notes.filter((n) => n.lyric).length;
    const score = lyrics * 1000 + p.notes.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });
  const chosen = parsed[bestIndex];
  const voice = chooseVoice(chosen.notes);
  let notes = chosen.notes.filter((n) => n.voice === voice);
  if (!notes.length) notes = chosen.notes;
  notes = collapseChords(notes);
  notes = mergeTies(notes);
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);

  const warnings: string[] = [];
  const missingLyrics = notes.filter((n) => !n.lyric.trim()).length;
  if (missingLyrics) {
    warnings.push(`${missingLyrics} note(s) have no lyrics. NEUTRINO requires kana lyrics on every note.`);
  }
  if (parsed.length > 1) {
    warnings.push(`Imported part "${chosen.partName || bestIndex + 1}" of ${parsed.length}.`);
  }
  const overlapping = notes.filter(
    (n, i) => i > 0 && n.start < notes[i - 1].start + notes[i - 1].duration - 1e-4,
  ).length;
  if (overlapping) warnings.push(`${overlapping} overlapping note(s) were found.`);

  const score = normalizeScore({
    title:
      text(root['work']?.['work-title']) ||
      text(root['movement-title']) ||
      chosen.partName ||
      '',
    artist: text(root.identification?.creator) || '',
    notes: notes.map<Note>((n) => ({
      id: uid(),
      pitch: n.pitch,
      start: n.start,
      duration: n.duration,
      lyric: n.lyric,
      breath: n.breath,
    })),
    tempos: normalizeTempos(chosen.tempos),
    timeSigs: normalizeTimeSigs(chosen.timeSigs),
    keyFifths: chosen.keyFifths,
  });

  return {
    score,
    warnings,
    partName: chosen.partName,
    partCount: parts.length,
    totalNotes: notes.length,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const SHARP_NAMES = [
  ['C', 0],
  ['C', 1],
  ['D', 0],
  ['D', 1],
  ['E', 0],
  ['F', 0],
  ['F', 1],
  ['G', 0],
  ['G', 1],
  ['A', 0],
  ['A', 1],
  ['B', 0],
] as const;
const FLAT_NAMES = [
  ['C', 0],
  ['D', -1],
  ['D', 0],
  ['E', -1],
  ['E', 0],
  ['F', 0],
  ['G', -1],
  ['G', 0],
  ['A', -1],
  ['A', 0],
  ['B', -1],
  ['B', 0],
] as const;

function midiToPitchXml(midi: number, keyFifths: number): X {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const [step, alter] = (keyFifths < 0 ? FLAT_NAMES : SHARP_NAMES)[pc];
  return {
    step,
    ...(alter !== 0 ? { alter } : {}),
    octave: Math.floor(Math.round(midi) / 12) - 1,
  };
}

function durationType(beats: number): { type: string; dots: number } {
  const table: Array<[number, string]> = [
    [4, 'whole'],
    [2, 'half'],
    [1, 'quarter'],
    [0.5, 'eighth'],
    [0.25, '16th'],
    [0.125, '32nd'],
    [0.0625, '64th'],
  ];
  for (const [v, t] of table) {
    if (Math.abs(beats - v) < 1e-4) return { type: t, dots: 0 };
    if (Math.abs(beats - v * 1.5) < 1e-4) return { type: t, dots: 1 };
    if (Math.abs(beats - v * 1.75) < 1e-4) return { type: t, dots: 2 };
  }
  let nearest = table[0];
  for (const entry of table) {
    if (Math.abs(beats - entry[0]) < Math.abs(beats - nearest[0])) nearest = entry;
  }
  return { type: nearest[1], dots: 0 };
}

function makeNoteXml(note: Note, startBeat: number, durationBeats: number, keyFifths: number, options: {
  tieStart: boolean;
  tieStop: boolean;
  withLyric: boolean;
  breath: boolean;
}): X {
  const { type, dots } = durationType(durationBeats);
  const notations: X = {};
  if (options.tieStart) notations.tied = { '@_type': 'start' };
  if (options.tieStop) {
    if (notations.tied) notations.tied = [notations.tied, { '@_type': 'stop' }];
    else notations.tied = { '@_type': 'stop' };
  }
  if (options.breath) notations['breath-mark'] = {};
  const noteXml: X = {
    pitch: midiToPitchXml(note.pitch, keyFifths),
    duration: Math.max(1, Math.round(durationBeats * 480)),
    ...(options.tieStart ? { tie: { '@_type': 'start' } } : {}),
    ...(options.tieStop ? { tie: { '@_type': 'stop' } } : {}),
    voice: 1,
    type,
    ...(dots ? { dot: Array.from({ length: dots }, () => ({})) } : {}),
  };
  if (Object.keys(notations).length) noteXml.notations = notations;
  if (options.withLyric && note.lyric) {
    noteXml.lyric = {
      '@_number': 1,
      syllabic: 'single',
      text: note.lyric,
    };
  }
  return noteXml;
}

function makeRestXml(durationBeats: number): X {
  const { type, dots } = durationType(durationBeats);
  return {
    rest: {},
    duration: Math.max(1, Math.round(durationBeats * 480)),
    voice: 1,
    type,
    ...(dots ? { dot: Array.from({ length: dots }, () => ({})) } : {}),
  };
}

export interface ExportOptions {
  software?: string;
}

export function exportMusicXml(score: Score, options: ExportOptions = {}): string {
  const s = normalizeScore(score);
  // musicXMLtoLabel refuses to start on a note: it inserts a full rest into
  // the first measure, which would shift the sung audio by one bar relative to
  // this editor. A one-division lead rest is enough to satisfy the converter
  // and keeps the offset below 2 ms at normal tempos.
  const firstStart = s.notes.length ? Math.min(...s.notes.map((n) => n.start)) : 0;
  const leadRest = s.notes.length > 0 && firstStart <= 1e-6 ? 1 / 480 : 0;
  const endBeat = Math.max(
    scoreEndBeat(s) + leadRest,
    measureLengthBeats(timeSignatureAt(s, 0)),
  );
  const measures: Array<{ start: number; end: number; sig: TimeSignature }> = [];
  let beat = 0;
  let guard = 0;
  while (beat < endBeat - 1e-6 && guard++ < 5000) {
    const sig = timeSignatureAt(s, beat + 1e-6);
    let end = beat + measureLengthBeats(sig);
    // Align a time-signature change that falls inside this measure.
    for (const ts of s.timeSigs) {
      if (ts.beat > beat + 1e-6 && ts.beat < end - 1e-6) {
        end = ts.beat;
        break;
      }
    }
    measures.push({ start: beat, end, sig });
    beat = end;
  }
  if (!measures.length) measures.push({ start: 0, end: 4, sig: timeSignatureAt(s, 0) });

  // Split notes across measures.
  interface Event {
    start: number;
    end: number;
    note: Note;
    segmentIndex: number;
    segmentCount: number;
  }
  const eventsByMeasure: Event[][] = measures.map(() => []);
  for (const note of s.notes) {
    let segIndex = 0;
    const shiftedStart = note.start + leadRest;
    const shiftedEnd = shiftedStart + note.duration;
    const segments: Array<{ start: number; end: number }> = [];
    for (const m of measures) {
      const a = Math.max(shiftedStart, m.start);
      const b = Math.min(shiftedEnd, m.end);
      if (b - a > 1e-6) segments.push({ start: a, end: b });
    }
    for (const seg of segments) {
      const mi = measures.findIndex((m) => seg.start >= m.start - 1e-6 && seg.start < m.end - 1e-6);
      if (mi < 0) continue;
      eventsByMeasure[mi].push({
        start: seg.start,
        end: seg.end,
        note,
        segmentIndex: segIndex,
        segmentCount: segments.length,
      });
      segIndex++;
    }
  }

  const measureNodes: X[] = [];
  for (let mi = 0; mi < measures.length; mi++) {
    const m = measures[mi];
    const events = eventsByMeasure[mi].sort((a, b) => a.start - b.start);
    const children: X[] = [];
    const attrs: X = { divisions: 480 };
    if (
      mi === 0 ||
      m.sig.numerator !== measures[mi - 1].sig.numerator ||
      m.sig.denominator !== measures[mi - 1].sig.denominator
    ) {
      attrs.time = { beats: m.sig.numerator, 'beat-type': m.sig.denominator };
    }
    if (mi === 0) {
      attrs.key = { fifths: s.keyFifths };
      attrs.clef = { sign: 'G', line: 2 };
    }
    children.push({ attributes: attrs });
    const tempoHere = s.tempos.find((t) => t.beat >= m.start - 1e-6 && t.beat < m.end - 1e-6);
    if (tempoHere) {
      children.push({
        direction: {
          '@_placement': 'above',
          'direction-type': {
            metronome: {
              'beat-unit': 'quarter',
              'per-minute': Math.round(tempoHere.bpm),
            },
          },
          sound: { '@_tempo': Math.round(tempoHere.bpm) },
        },
      });
    }
    let cursor = m.start;
    const addGap = (until: number) => {
      if (until > cursor + 1e-6) {
        children.push({ note: makeRestXml(until - cursor) });
        cursor = until;
      }
    };
    for (const ev of events) {
      if (ev.start < cursor - 1e-6) continue;
      addGap(ev.start);
      children.push({
        note: makeNoteXml(ev.note, ev.start, ev.end - ev.start, s.keyFifths, {
          tieStart: ev.segmentIndex < ev.segmentCount - 1,
          tieStop: ev.segmentIndex > 0,
          withLyric: ev.segmentIndex === 0,
          breath: ev.note.breath && ev.segmentIndex === ev.segmentCount - 1,
        }),
      });
      cursor = ev.end;
    }
    addGap(m.end);

    const measureObj: X = { '@_number': mi + 1 };
    for (const child of children) {
      const key = Object.keys(child)[0];
      const value = child[key];
      if (measureObj[key] === undefined) measureObj[key] = value;
      else if (Array.isArray(measureObj[key])) measureObj[key].push(value);
      else measureObj[key] = [measureObj[key], value];
    }
    measureNodes.push(measureObj);
  }

  const doc = {
    'score-partwise': {
      '@_version': '3.1',
      work: s.title ? { 'work-title': s.title } : undefined,
      identification: {
        encoding: {
          software: options.software || 'NEUTRINO Tuning Studio',
          'encoding-date': new Date().toISOString().slice(0, 10),
        },
        ...(s.artist ? { creator: { '@_type': 'composer', '#text': s.artist } } : {}),
      },
      'part-list': {
        'score-part': {
          '@_id': 'P1',
          'part-name': s.title || 'Vocal',
          'score-instrument': { '@_id': 'P1-I1', 'instrument-name': 'Voice' },
          'midi-instrument': {
            '@_id': 'P1-I1',
            'midi-channel': 1,
            'midi-program': 1,
            volume: 78.7402,
            pan: 0,
          },
        },
      },
      part: { '@_id': 'P1', measure: measureNodes },
    },
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(doc);
}

export function musicXmlForNeutrino(score: Score): string {
  return exportMusicXml(score, { software: 'NEUTRINO Tuning Studio' });
}

// Utility used by the UI to estimate where a note falls.
export function noteTime(score: Score, note: Note): number {
  return beatToSeconds(score, note.start);
}
