import type { DynamicsPoint } from './types';
import { dbToGain } from './time';

export interface Peaks {
  min: Float32Array;
  max: Float32Array;
  length: number;
}

export interface PlayOptions {
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  masterVolume: number;
  referenceVolume: number;
  referenceOffset: number;
  referenceMuted: boolean;
  dynamicsEnabled: boolean;
  dynamicsPoints: DynamicsPoint[];
}

export interface MixOptions {
  sampleRate: number;
  bitDepth: number;
  duration: number;
  includeReference: boolean;
  includeDynamics: boolean;
  normalize: boolean;
  referenceVolume: number;
  referenceOffset: number;
  dynamicsPoints: DynamicsPoint[];
}

export function computePeaks(buffer: AudioBuffer, buckets = 6000): Peaks {
  const length = Math.max(1, Math.min(buckets, buffer.length));
  const min = new Float32Array(length);
  const max = new Float32Array(length);
  const channels = Math.min(2, buffer.numberOfChannels);
  const block = buffer.length / length;
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * block);
    const end = Math.min(buffer.length, Math.floor((i + 1) * block));
    let lo = 0;
    let hi = 0;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let j = start; j < end; j += 2) {
        const v = data[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[i] = lo;
    max[i] = hi;
  }
  return { min, max, length };
}

function scheduleGain(
  param: AudioParam,
  points: DynamicsPoint[],
  startTime: number,
  fromOffset: number,
  duration: number,
) {
  const pts = points.filter((p) => p.time >= fromOffset - 0.001 && p.time <= duration + 0.001);
  const first = pts[0];
  if (!first) {
    param.setValueAtTime(1, startTime);
    return;
  }
  // Value at the starting offset (interpolated).
  let initial = first.db;
  if (pts.length && fromOffset > pts[0].time) {
    for (let i = 1; i < pts.length; i++) {
      if (fromOffset <= pts[i].time) {
        const a = pts[i - 1];
        const b = pts[i];
        const t = (fromOffset - a.time) / Math.max(1e-9, b.time - a.time);
        initial = a.db + (b.db - a.db) * t;
        break;
      }
      initial = pts[i].db;
    }
  }
  param.cancelScheduledValues(startTime);
  param.setValueAtTime(dbToGain(initial), startTime);
  for (const p of pts) {
    if (p.time <= fromOffset + 0.002) continue;
    param.linearRampToValueAtTime(dbToGain(p.db), startTime + (p.time - fromOffset));
  }
}

export function encodeWav(channels: Float32Array[], sampleRate: number, bitDepth: number): Uint8Array {
  const numChannels = Math.max(1, channels.length);
  const frames = channels[0]?.length || 0;
  const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2;
  const isFloat = bitDepth === 32;
  const dataSize = frames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, isFloat ? 3 : 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0));
      if (isFloat) {
        view.setFloat32(offset, sample, true);
        offset += 4;
      } else if (bitDepth === 24) {
        const v = Math.max(-8388608, Math.min(8388607, Math.round(sample * 8388607)));
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
        offset += 3;
      } else {
        view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
        offset += 2;
      }
    }
  }
  return new Uint8Array(buffer);
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  vocalBuffer: AudioBuffer | null = null;
  referenceBuffer: AudioBuffer | null = null;
  vocalPeaks: Peaks | null = null;
  referencePeaks: Peaks | null = null;

  private vocalSource: AudioBufferSourceNode | null = null;
  private refSource: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private refGain: GainNode | null = null;
  private master: GainNode | null = null;
  private startedAt = 0;
  private startOffset = 0;
  private opts: PlayOptions | null = null;
  private timer: number | null = null;
  private playing = false;

  onTick: ((time: number) => void) | null = null;
  onEnded: (() => void) | null = null;

  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.gain = this.ctx.createGain();
      this.gain.connect(this.master);
      this.refGain = this.ctx.createGain();
      this.refGain.connect(this.master);
    }
    return this.ctx;
  }

  async loadVocal(bytes: Uint8Array): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const data = new Uint8Array(bytes).buffer as ArrayBuffer;
    const buffer = await ctx.decodeAudioData(data);
    this.vocalBuffer = buffer;
    this.vocalPeaks = computePeaks(buffer);
    return buffer;
  }

  async loadReference(bytes: Uint8Array): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const data = new Uint8Array(bytes).buffer as ArrayBuffer;
    const buffer = await ctx.decodeAudioData(data);
    this.referenceBuffer = buffer;
    this.referencePeaks = computePeaks(buffer);
    return buffer;
  }

  clearReference() {
    this.referenceBuffer = null;
    this.referencePeaks = null;
  }

  get duration(): number {
    return this.vocalBuffer ? this.vocalBuffer.duration : 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  getPosition(): number {
    if (!this.ctx || !this.playing) return this.startOffset;
    return this.startOffset + (this.ctx.currentTime - this.startedAt);
  }

  private stopSources() {
    try {
      this.vocalSource?.stop();
    } catch {}
    try {
      this.refSource?.stop();
    } catch {}
    this.vocalSource = null;
    this.refSource = null;
  }

  private startSources(offset: number, opts: PlayOptions) {
    const ctx = this.ensureContext();
    this.stopSources();
    if (!this.vocalBuffer) return;
    const now = ctx.currentTime + 0.02;
    this.startedAt = now;
    this.startOffset = offset;
    this.opts = opts;
    this.master!.gain.setValueAtTime(Math.max(0, Math.min(1, opts.masterVolume)), now);

    const src = ctx.createBufferSource();
    src.buffer = this.vocalBuffer;
    src.connect(this.gain!);
    const vocalOffset = Math.max(0, Math.min(this.vocalBuffer.duration, offset));
    src.start(now, vocalOffset);
    this.vocalSource = src;

    if (opts.dynamicsEnabled) {
      scheduleGain(this.gain!.gain, opts.dynamicsPoints, now, offset, this.vocalBuffer.duration);
    } else {
      this.gain!.gain.setValueAtTime(1, now);
    }

    if (this.referenceBuffer && !opts.referenceMuted && opts.referenceVolume > 0) {
      const refStartInProject = opts.referenceOffset;
      const ref = ctx.createBufferSource();
      ref.buffer = this.referenceBuffer;
      ref.connect(this.refGain!);
      this.refGain!.gain.setValueAtTime(Math.max(0, Math.min(2, opts.referenceVolume)), now);
      if (offset < refStartInProject) {
        const delay = refStartInProject - offset;
        ref.start(now + delay, 0);
      } else {
        const bufferOffset = offset - refStartInProject;
        if (bufferOffset < this.referenceBuffer.duration) {
          ref.start(now, bufferOffset);
        }
      }
      this.refSource = ref;
    }

    this.playing = true;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 40);
  }

  private tick() {
    if (!this.playing || !this.ctx) return;
    const pos = this.getPosition();
    const opts = this.opts;
    if (!opts) return;
    if (opts.loop && opts.loopEnd > opts.loopStart + 0.01) {
      if (pos >= opts.loopEnd) {
        this.startSources(opts.loopStart, opts);
        this.onTick?.(opts.loopStart);
        return;
      }
    } else if (pos >= this.duration - 0.01) {
      this.pause();
      this.onEnded?.();
      return;
    }
    this.onTick?.(Math.min(pos, this.duration));
  }

  play(offset: number, opts: PlayOptions) {
    const ctx = this.ensureContext();
    void ctx.resume();
    this.startSources(Math.max(0, offset), opts);
    this.onTick?.(Math.max(0, offset));
  }

  pause() {
    if (!this.playing) return;
    const pos = this.getPosition();
    this.playing = false;
    this.startOffset = Math.max(0, pos);
    this.stopSources();
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this.pause();
    this.startOffset = 0;
    this.onTick?.(0);
  }

  seek(offset: number) {
    if (this.playing && this.opts) {
      this.startSources(Math.max(0, offset), this.opts);
      this.onTick?.(Math.max(0, offset));
    } else {
      this.startOffset = Math.max(0, offset);
      this.onTick?.(this.startOffset);
    }
  }

  setMasterVolume(v: number) {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.01);
    }
  }

  updatePlaybackOptions(partial: Partial<PlayOptions>) {
    if (!this.opts) return;
    this.opts = { ...this.opts, ...partial };
    if (this.playing) {
      const pos = this.getPosition();
      this.startSources(pos, this.opts);
    }
  }

  dispose() {
    this.pause();
    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
    this.vocalBuffer = null;
    this.referenceBuffer = null;
  }

  async renderMix(options: MixOptions): Promise<Uint8Array> {
    if (!this.vocalBuffer) throw new Error('No vocal audio loaded.');
    const duration = Math.max(options.duration, this.vocalBuffer.duration);
    const frames = Math.max(1, Math.ceil(duration * options.sampleRate));
    const ctx = new OfflineAudioContext(2, frames, options.sampleRate);

    const vocalSrc = ctx.createBufferSource();
    vocalSrc.buffer = this.vocalBuffer;
    const gain = ctx.createGain();
    vocalSrc.connect(gain);
    gain.connect(ctx.destination);
    if (options.includeDynamics) {
      scheduleGain(gain.gain, options.dynamicsPoints, 0, 0, duration);
    }
    vocalSrc.start(0);

    if (options.includeReference && this.referenceBuffer) {
      const refSrc = ctx.createBufferSource();
      refSrc.buffer = this.referenceBuffer;
      const refGain = ctx.createGain();
      refGain.gain.value = Math.max(0, Math.min(2, options.referenceVolume));
      refSrc.connect(refGain);
      refGain.connect(ctx.destination);
      const when = Math.max(0, options.referenceOffset);
      if (when < duration) refSrc.start(when);
    }

    const rendered = await ctx.startRendering();
    const left = rendered.getChannelData(0);
    const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
    let peak = 0;
    for (let i = 0; i < left.length; i++) {
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    let scale = 1;
    if (options.normalize && peak > 0) scale = 0.98 / peak;
    const outL = new Float32Array(left.length);
    const outR = new Float32Array(right.length);
    for (let i = 0; i < left.length; i++) {
      outL[i] = left[i] * scale;
      outR[i] = right[i] * scale;
    }
    return encodeWav([outL, outR], options.sampleRate, options.bitDepth);
  }

  async renderVocal(options: MixOptions): Promise<Uint8Array> {
    return this.renderMix({ ...options, includeReference: false });
  }
}

export const audioEngine = new AudioEngine();
