'use strict';

/**
 * Minimal RIFF/WAVE PCM splicing for phrase-level re-rendering.
 * We keep the original header and data layout and overwrite the phrase region
 * in a copy, so no extra chunks or metadata are lost.
 */

function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (body + 16 > buffer.length) return null;
      fmt = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        byteRate: buffer.readUInt32LE(body + 8),
        blockAlign: buffer.readUInt16LE(body + 12),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataSize = Math.min(size, buffer.length - body);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || dataOffset < 0 || !dataSize) return null;
  const bytesPerSample = Math.max(1, fmt.bitsPerSample / 8);
  const blockAlign = fmt.blockAlign || fmt.channels * bytesPerSample;
  if (!blockAlign || dataSize % blockAlign !== 0) return null;
  return {
    ...fmt,
    bytesPerSample,
    blockAlign,
    dataOffset,
    dataSize,
    frames: dataSize / blockAlign,
  };
}

function readSample(buffer, offset, bits, format) {
  if (format === 3 && bits === 32) return buffer.readFloatLE(offset);
  if (bits === 16) return buffer.readInt16LE(offset) / 32768;
  if (bits === 24) {
    let v = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
    if (v & 0x800000) v |= 0xff000000;
    return v / 8388608;
  }
  if (bits === 32) return buffer.readInt32LE(offset) / 2147483648;
  return 0;
}

function writeSample(buffer, offset, value, bits, format) {
  const v = Math.max(-1, Math.min(1, value));
  if (format === 3 && bits === 32) {
    buffer.writeFloatLE(v, offset);
  } else if (bits === 16) {
    buffer.writeInt16LE(v >= 1 ? 32767 : Math.round(v * 32768), offset);
  } else if (bits === 24) {
    let n = Math.round(v * 8388608);
    if (n > 8388607) n = 8388607;
    if (n < -8388608) n = -8388608;
    buffer[offset] = n & 0xff;
    buffer[offset + 1] = (n >> 8) & 0xff;
    buffer[offset + 2] = (n >> 16) & 0xff;
  } else if (bits === 32) {
    buffer.writeInt32LE(v >= 1 ? 2147483647 : Math.round(v * 2147483648), offset);
  }
}

/**
 * @param {Buffer} baseBuffer original full WAV
 * @param {{startFrame:number,endFrame:number,sourceStartFrame?:number,sourceEndFrame?:number,buffer:Buffer}[]} replacements
 * @param {{crossfadeMs?:number}} [options]
 * @returns {Buffer}
 */
function splicePhraseWav(baseBuffer, replacements, options = {}) {
  const base = parseWav(baseBuffer);
  if (!base) throw new Error('Base WAV is not a supported PCM/float RIFF file.');
  const out = Buffer.from(baseBuffer);
  const crossfadeMs = Math.max(0, Math.min(200, Number(options.crossfadeMs ?? 30)));
  const fadeSamples = Math.round((crossfadeMs / 1000) * base.sampleRate);

  for (const replacement of replacements) {
    const phrase = parseWav(replacement.buffer);
    if (!phrase) throw new Error(`Phrase ${replacement.startFrame} is not a supported WAV file.`);
    if (
      phrase.channels !== base.channels ||
      phrase.sampleRate !== base.sampleRate ||
      phrase.bitsPerSample !== base.bitsPerSample ||
      phrase.audioFormat !== base.audioFormat
    ) {
      throw new Error(
        `Phrase WAV format does not match the full take (${phrase.channels}ch/${phrase.sampleRate}Hz/${phrase.bitsPerSample}bit vs ${base.channels}ch/${base.sampleRate}Hz/${base.bitsPerSample}bit).`,
      );
    }
    const startFrame = Math.max(0, Math.min(base.frames, Math.round(replacement.startFrame)));
    const endFrame = Math.max(startFrame, Math.min(base.frames, Math.round(replacement.endFrame)));
    const startSample = Math.round((startFrame / 100) * base.sampleRate);
    const endSample = Math.round((endFrame / 100) * base.sampleRate);
    const sourceStartFrame = Math.max(0, Number(replacement.sourceStartFrame) || 0);
    const sourceEndFrame = Math.max(
      sourceStartFrame,
      Number.isFinite(replacement.sourceEndFrame)
        ? Number(replacement.sourceEndFrame)
        : sourceStartFrame + (endFrame - startFrame),
    );
    const sourceStartSample = Math.round((sourceStartFrame / 100) * phrase.sampleRate);
    const sourceEndSample = Math.round((sourceEndFrame / 100) * phrase.sampleRate);
    const expected = Math.max(0, endSample - startSample);
    const count = Math.min(expected, Math.max(0, sourceEndSample - sourceStartSample), Math.max(0, phrase.frames - sourceStartSample));
    if (!count) continue;
    const hasPrev = startSample > 0;
    const hasNext = endSample < base.frames;
    for (let i = 0; i < count; i++) {
      let weight = 1;
      if (fadeSamples > 0) {
        if (hasPrev) weight = Math.min(weight, i / fadeSamples);
        if (hasNext) weight = Math.min(weight, (count - 1 - i) / fadeSamples);
        weight = Math.max(0, Math.min(1, weight));
      }
      for (let ch = 0; ch < base.channels; ch++) {
        const baseOffset = base.dataOffset + (startSample + i) * base.blockAlign + ch * base.bytesPerSample;
        const newOffset = phrase.dataOffset + (sourceStartSample + i) * phrase.blockAlign + ch * phrase.bytesPerSample;
        const oldValue = readSample(out, baseOffset, base.bitsPerSample, base.audioFormat);
        const newValue = readSample(replacement.buffer, newOffset, phrase.bitsPerSample, phrase.audioFormat);
        writeSample(out, baseOffset, oldValue * (1 - weight) + newValue * weight, base.bitsPerSample, base.audioFormat);
      }
    }
  }
  return out;
}

module.exports = { parseWav, splicePhraseWav };
