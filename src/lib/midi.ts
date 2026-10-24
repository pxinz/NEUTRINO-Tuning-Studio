import { parseMidi } from 'midi-file';
import type { Score, TempoEvent, TimeSignature } from './types';
import { normalizeScore, normalizeTempos, normalizeTimeSigs } from './score';
import { uid } from './time';

interface PendingNote {
  channel: number;
  pitch: number;
  velocity: number;
  startTick: number;
  lyric?: string;
}

export interface MidiImportResult {
  score: Score;
  warnings: string[];
  channel: number;
  trackName: string;
}

export function importMidi(data: Uint8Array, fileName = 'MIDI'): MidiImportResult {
  let midi: ReturnType<typeof parseMidi>;
  try {
    midi = parseMidi(data);
  } catch (err) {
    throw new Error(`MIDI parse error: ${(err as Error).message}`);
  }
  const ticksPerBeat = midi.header.ticksPerBeat || 480;
  const tempos: TempoEvent[] = [];
  const timeSigs: TimeSignature[] = [];
  const notes: Array<{
    channel: number;
    pitch: number;
    start: number;
    duration: number;
    lyric: string;
    velocity: number;
  }> = [];
  let trackName = '';

  for (const track of midi.tracks) {
    let tick = 0;
    const pending = new Map<string, PendingNote>();
    for (const event of track) {
      tick += event.deltaTime || 0;
      const anyEvent = event as any;
      if (event.type === 'trackName' && !trackName) trackName = String(anyEvent.text || '');
      if (event.type === 'setTempo') {
        const bpm = 60_000_000 / anyEvent.microsecondsPerBeat;
        const beat = tick / ticksPerBeat;
        if (!tempos.some((t) => Math.abs(t.beat - beat) < 1e-6)) tempos.push({ beat, bpm });
      } else if (event.type === 'timeSignature') {
        const beat = tick / ticksPerBeat;
        const numerator = anyEvent.numerator || 4;
        const denominator = 2 ** (anyEvent.denominator || 2);
        if (!timeSigs.some((s) => Math.abs(s.beat - beat) < 1e-6)) {
          timeSigs.push({ beat, numerator, denominator });
        }
      } else if (event.type === 'noteOn' && anyEvent.velocity > 0) {
        const key = `${anyEvent.channel}:${anyEvent.noteNumber}`;
        pending.set(key, {
          channel: anyEvent.channel,
          pitch: anyEvent.noteNumber,
          velocity: anyEvent.velocity,
          startTick: tick,
        });
      } else if (event.type === 'noteOff' || (event.type === 'noteOn' && anyEvent.velocity === 0)) {
        const key = `${anyEvent.channel}:${anyEvent.noteNumber}`;
        const p = pending.get(key);
        if (p) {
          pending.delete(key);
          const durationTicks = Math.max(1, tick - p.startTick);
          notes.push({
            channel: p.channel,
            pitch: p.pitch,
            start: p.startTick / ticksPerBeat,
            duration: durationTicks / ticksPerBeat,
            lyric: '',
            velocity: p.velocity,
          });
        }
      } else if (event.type === 'lyrics' && anyEvent.text) {
        // Attach a lyric to the nearest note starting at this tick.
        const candidates = notes.filter((n) => Math.abs(n.start - tick / ticksPerBeat) < 1e-4);
        const target = candidates[candidates.length - 1];
        if (target) target.lyric = String(anyEvent.text).trim();
      }
    }
    for (const p of pending.values()) {
      notes.push({
        channel: p.channel,
        pitch: p.pitch,
        start: p.startTick / ticksPerBeat,
        duration: Math.max(0.25, (tick - p.startTick) / ticksPerBeat),
        lyric: '',
        velocity: p.velocity,
      });
    }
  }

  if (!notes.length) throw new Error('The MIDI file contains no notes.');

  const channelStats = new Map<number, number>();
  for (const n of notes) {
    if (n.channel === 9) continue;
    channelStats.set(n.channel, (channelStats.get(n.channel) || 0) + 1);
  }
  let bestChannel = 0;
  let bestCount = -1;
  for (const [ch, count] of channelStats) {
    if (count > bestCount) {
      bestCount = count;
      bestChannel = ch;
    }
  }
  const selected = notes
    .filter((n) => n.channel === bestChannel)
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);

  // Monophonic reduction: when notes overlap, prefer the higher note at a time.
  const monophonic: typeof selected = [];
  for (const n of selected) {
    const prev = monophonic[monophonic.length - 1];
    if (prev && n.start < prev.start + prev.duration - 1e-4) {
      if (n.pitch > prev.pitch) {
        prev.duration = Math.max(1 / 32, n.start - prev.start);
        monophonic.push(n);
      }
      continue;
    }
    monophonic.push({ ...n });
  }

  const warnings: string[] = [];
  if (!monophonic.some((n) => n.lyric)) {
    warnings.push('MIDI has no lyric meta events. Every note was filled with “ら”; edit the lyrics.');
  }
  if (channelStats.size > 1) {
    warnings.push(`Imported MIDI channel ${bestChannel + 1} (${bestCount} notes).`);
  }

  const score = normalizeScore({
    title: trackName || fileName.replace(/\.(mid|midi)$/i, '') || 'MIDI Import',
    artist: '',
    notes: monophonic.map((n) => ({
      id: uid(),
      pitch: n.pitch,
      start: n.start,
      duration: Math.max(1 / 32, n.duration),
      lyric: n.lyric || 'ら',
      breath: false,
    })),
    tempos: normalizeTempos(tempos.length ? tempos : [{ beat: 0, bpm: 100 }]),
    timeSigs: normalizeTimeSigs(timeSigs.length ? timeSigs : [{ beat: 0, numerator: 4, denominator: 4 }]),
    keyFifths: 0,
  });

  return { score, warnings, channel: bestChannel, trackName };
}
