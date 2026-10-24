'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app } = require('electron');
const { ensureDir, decodeBuffer, readWavInfo, sanitizeName } = require('./util.cjs');
const { buildCommand } = require('./neutrino.cjs');
const { parsePhraseList } = require('./phrases.cjs');
const { splicePhraseWav } = require('./wav.cjs');

function nowMs() {
  return Date.now();
}

function safeRead(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

class RenderManager {
  constructor({ settings, emit, getRoot }) {
    this.settings = settings;
    this.emit = emit;
    this.getRoot = getRoot;
    this.active = null;
    this.counter = 0;
  }

  isBusy() {
    return Boolean(this.active);
  }

  cancel(renderId) {
    if (!this.active || (renderId && this.active.id !== renderId)) return false;
    this.active.cancelled = true;
    this.killActive();
    return true;
  }

  killActive() {
    const child = this.active && this.active.child;
    if (!child || child.killed) return;
    const pid = child.pid;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
      } else {
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
        setTimeout(() => {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {}
        }, 1800);
      }
    } catch (err) {
      try {
        child.kill();
      } catch {}
    }
  }

  emitEvent(event) {
    try {
      this.emit(event);
    } catch {}
  }

  log(id, line) {
    if (!line) return;
    const clean = String(line).replace(/\u001b\[[0-9;]*m/g, '');
    if (!clean.trim()) return;
    if (this.active && this.active.id === id) {
      this.active.logs.push(clean);
      if (this.active.logs.length > 2000) this.active.logs.splice(0, 500);
      try {
        fs.appendFileSync(this.active.logPath, clean + '\n', 'utf8');
      } catch {}
    }
    this.emitEvent({ type: 'log', renderId: id, line: clean });
  }

  progress(id, percent, stage, detail) {
    this.emitEvent({
      type: 'progress',
      renderId: id,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      stage,
      detail: detail || '',
    });
  }

  async start(payload) {
    if (this.active) {
      throw new Error('Another render is already running.');
    }
    const id = `r${++this.counter}-${Date.now()}`;
    const settings = this.settings.get();
    const root = payload.root || settings.neutrinoRoot;
    if (!root) throw new Error('NEUTRINO folder is not configured.');
    const mode = payload.mode || 'full';
    if (!['full', 'timing', 'vocode', 'phrase'].includes(mode)) {
      throw new Error(`Unknown render mode: ${mode}`);
    }
    const model = payload.model || settings.defaultModel;
    if (!model) throw new Error('Choose a voice model first.');
    if (!fs.existsSync(path.join(root, 'model', model))) {
      throw new Error(`Voice model folder was not found: model/${model}`);
    }
    if (payload.supportModel && payload.supportModel === model) {
      throw new Error('The support model must be different from the main voice model.');
    }

    const projectId = sanitizeName(payload.projectId || 'project');
    const workspace = path.join(app.getPath('userData'), 'workspace', projectId);
    ensureDir(workspace);
    const files = {
      workspace,
      xml: path.join(workspace, 'score.musicxml'),
      fullLab: path.join(workspace, 'full.lab'),
      monoLab: path.join(workspace, 'mono.lab'),
      timing: path.join(workspace, 'timing.lab'),
      f0: path.join(workspace, 'output.f0'),
      melspec: path.join(workspace, 'output.melspec'),
      wav: path.join(workspace, 'output.wav'),
      phrases: path.join(workspace, 'phrases.txt'),
      log: path.join(workspace, 'render.log'),
    };

    if (mode === 'full') {
      if (!payload.scoreXml || !String(payload.scoreXml).includes('<score-partwise')) {
        throw new Error('The generated MusicXML score is empty or invalid.');
      }
      for (const f of [
        files.fullLab,
        files.monoLab,
        files.timing,
        files.f0,
        files.melspec,
        files.wav,
        files.phrases,
      ]) {
        try {
          fs.rmSync(f, { force: true });
        } catch {}
      }
      fs.writeFileSync(files.xml, payload.scoreXml, 'utf8');
    } else {
      if (!payload.timingText) throw new Error('Timing data is missing. Render the score first.');
      if (!fs.existsSync(files.fullLab)) throw new Error('Label data is missing. Render the score first.');
      fs.writeFileSync(files.timing, payload.timingText, 'utf8');
      if (mode === 'vocode' || mode === 'phrase') {
        if (!fs.existsSync(files.melspec)) throw new Error('Mel-spectrogram data is missing.');
        if (!(payload.f0 instanceof Uint8Array) || payload.f0.byteLength === 0) {
          throw new Error('Pitch data is missing.');
        }
        const melspecSize = fs.statSync(files.melspec).size;
        const expectedFrames = melspecSize / 400;
        const expectedBytes = expectedFrames * 4;
        if (payload.f0.byteLength !== expectedBytes) {
          throw new Error(
            `Pitch data length mismatch (${payload.f0.byteLength} bytes, expected ${expectedBytes}).`,
          );
        }
        fs.writeFileSync(files.f0, Buffer.from(payload.f0));
      }
      if (mode === 'phrase') {
        if (!fs.existsSync(files.wav)) throw new Error('The previous full take is missing.');
        if (!Array.isArray(payload.phrases) || !payload.phrases.length) {
          throw new Error('Phrase data is missing. Render the full score again.');
        }
        if (!Array.isArray(payload.phraseIndices) || !payload.phraseIndices.length) {
          throw new Error('No changed phrases were provided.');
        }
      }
    }

    this.active = {
      id,
      mode,
      cancelled: false,
      child: null,
      logs: [],
      logPath: files.log,
      startedAt: nowMs(),
      files,
      root,
      payload,
    };
    try {
      fs.writeFileSync(files.log, '');
    } catch {}

    this.run(id, payload, files, root, settings).catch((err) => {
      if (!this.active || this.active.id !== id) return;
      const canceled = this.active.cancelled;
      const message = canceled ? 'Render canceled.' : err && err.message ? err.message : String(err);
      this.emitEvent({
        type: 'error',
        renderId: id,
        error: message,
        canceled,
        log: this.active.logs.slice(-80),
      });
      this.active = null;
    });
    return { renderId: id, workspace, files };
  }

  async run(id, payload, files, root, settings) {
    const mode = payload.mode || 'full';
    const runner = settings.runner || 'auto';
    const wineCommand = settings.wineCommand || 'wine';
    const binaries = payload.binaries || {};
    const neutrinoPath = binaries.neutrino || this.findNeutrino(root);
    const converterPath = binaries.converter || this.findConverter(root);
    if (!neutrinoPath) throw new Error('NEUTRINO executable was not found.');

    if (mode === 'phrase') {
      return this.runPhrase(id, payload, files, root, settings, neutrinoPath, runner, wineCommand);
    }

    if (mode === 'full') {
      if (!converterPath) throw new Error('musicXMLtoLabel executable was not found.');
      this.progress(id, 2, 'labels', 'Converting MusicXML to labels');
      this.log(id, `[studio] musicXMLtoLabel: ${converterPath}`);
      const cmd = buildCommand(
        root,
        converterPath,
        [files.xml, files.fullLab, files.monoLab],
        runner,
        wineCommand,
      );
      const res = await this.spawnStage(id, cmd, 'labels', 2, 12);
      if (res.code !== 0 || !fs.existsSync(files.fullLab)) {
        throw new Error(
          `MusicXML conversion failed (exit ${res.code}). Check the lyrics and score structure.`,
        );
      }
      this.progress(id, 12, 'labels', 'Labels ready');
    }

    const args = [
      files.fullLab,
      files.timing,
      files.f0,
      files.melspec,
      files.wav,
      path.join(root, 'model', payload.model) + path.sep,
      '-n',
      String(payload.threads || settings.threads || 4),
      '-k',
      String(payload.styleShift || 0),
      '-f',
      String(payload.transpose || 0),
      '-s',
      String(payload.sampleRate || settings.sampleRate || 48000),
      '-b',
      String(payload.bitDepth || settings.bitDepth || 16),
      '-t',
    ];
    if (payload.useGpu !== false) args.push('-m');
    if (payload.supportModel) {
      args.push('-S', payload.supportModel);
    }
    if (mode === 'timing') args.push('--skip-timing');
    if (mode === 'vocode') args.push('--skip-timing', '--skip-f0', '--skip-melspec');
    if (mode === 'full' || mode === 'timing') args.push('-i', files.phrases);

    this.log(id, `[studio] NEUTRINO: ${neutrinoPath}`);
    this.log(id, `[studio] mode=${mode} model=${payload.model} args=${args.join(' ')}`);
    const cmd = buildCommand(root, neutrinoPath, args, runner, wineCommand);
    const basePercent = mode === 'full' ? 15 : 6;
    const span = 80;
    const res = await this.spawnStage(id, cmd, mode === 'full' ? 'synthesis' : 'render', basePercent, span);
    if (res.code !== 0) {
      throw new Error(`NEUTRINO exited with code ${res.code}.`);
    }
    if (!fs.existsSync(files.wav)) {
      throw new Error('NEUTRINO finished without producing a WAV file.');
    }

    const wavInfo = readWavInfo(files.wav);
    const timingText = fs.existsSync(files.timing)
      ? fs.readFileSync(files.timing, 'utf8')
      : '';
    const f0 = safeRead(files.f0);
    let phrases = Array.isArray(payload.phrases) ? payload.phrases : [];
    if (f0 && fs.existsSync(files.phrases)) {
      const parsed = parsePhraseList(fs.readFileSync(files.phrases, 'utf8'), f0.byteLength / 4);
      if (parsed.length) phrases = parsed;
    }
    const result = {
      renderId: id,
      mode,
      wavPath: files.wav,
      f0Path: files.f0,
      melspecPath: files.melspec,
      timingPath: files.timing,
      timingText,
      duration: wavInfo.duration,
      sampleRate: wavInfo.sampleRate,
      channels: wavInfo.channels,
      bitsPerSample: wavInfo.bitsPerSample,
      logPath: files.log,
      model: payload.model,
      elapsedMs: nowMs() - this.active.startedAt,
      f0: mode === 'vocode' ? null : f0 ? new Uint8Array(f0) : null,
      phrases,
    };
    this.progress(id, 100, 'done', 'Render complete');
    this.emitEvent({ type: 'done', renderId: id, result });
    this.active = null;
  }

  async runPhrase(id, payload, files, root, settings, neutrinoPath, runner, wineCommand) {
    const selected = new Set((payload.phraseIndices || []).map(Number));
    const phrases = (payload.phrases || []).filter((p) => p.sung && selected.has(Number(p.index)));
    if (!phrases.length) throw new Error('No changed sung phrases were found.');
    const fullF0 = fs.readFileSync(files.f0);
    const fullMel = fs.readFileSync(files.melspec);
    const totalFrames = fullMel.length / 400;
    if (fullF0.length !== totalFrames * 4) {
      throw new Error('Pitch/melspec frame count mismatch in the previous take.');
    }
    const modelDir = path.join(root, 'model', payload.model) + path.sep;
    const tempDir = path.join(files.workspace, 'phrase-cache');
    ensureDir(tempDir);
    const crossfadeMs = Math.max(0, Math.min(200, Number(payload.crossfadeMs ?? 30)));
    const replacements = [];
    this.log(
      id,
      `[studio] mode=phrase crossfade=${crossfadeMs}ms phrases=${phrases.map((p) => p.index).join(', ')}`,
    );
    try {
      for (let n = 0; n < phrases.length; n++) {
        if (!this.active || this.active.id !== id) throw new Error('Render canceled.');
        if (this.active.cancelled) throw new Error('Render canceled.');
        const phrase = phrases[n];
        const startFrame = Math.max(0, Math.min(totalFrames, Math.round(phrase.startFrame)));
        const endFrame = Math.max(startFrame, Math.min(totalFrames, Math.round(phrase.endFrame)));
        if (endFrame <= startFrame) continue;
        const f0Slice = fullF0.subarray(startFrame * 4, endFrame * 4);
        const melSlice = fullMel.subarray(startFrame * 400, endFrame * 400);
        const stem = `phrase-${phrase.index}`;
        const f0Path = path.join(tempDir, `${stem}.f0`);
        const melPath = path.join(tempDir, `${stem}.melspec`);
        const wavPath = path.join(tempDir, `${stem}.wav`);
        fs.writeFileSync(f0Path, f0Slice);
        fs.writeFileSync(melPath, melSlice);
        const args = [
          files.fullLab,
          files.timing,
          f0Path,
          melPath,
          wavPath,
          modelDir,
          '-p',
          String(phrase.index),
          '--skip-timing',
          '--skip-f0',
          '--skip-melspec',
          '-n',
          String(payload.threads || settings.threads || 4),
          '-k',
          String(payload.styleShift || 0),
          '-f',
          String(payload.transpose || 0),
          '-s',
          String(payload.sampleRate || settings.sampleRate || 48000),
          '-b',
          String(payload.bitDepth || settings.bitDepth || 16),
          '-t',
        ];
        if (payload.useGpu !== false) args.push('-m');
        if (payload.supportModel) args.push('-S', payload.supportModel);
        this.log(
          id,
          `[studio] phrase ${n + 1}/${phrases.length}: -p ${phrase.index} frames ${startFrame}-${endFrame}`,
        );
        const cmd = buildCommand(root, neutrinoPath, args, runner, wineCommand);
        const base = 8 + (n / phrases.length) * 78;
        const res = await this.spawnStage(id, cmd, 'phrase', base, 78 / phrases.length);
        if (!this.active || this.active.id !== id || this.active.cancelled) {
          throw new Error('Render canceled.');
        }
        if (res.code !== 0 || !fs.existsSync(wavPath)) {
          throw new Error(`Phrase ${phrase.index} re-render failed (exit ${res.code}).`);
        }
        const info = readWavInfo(wavPath);
        if (!info.duration) throw new Error(`Phrase ${phrase.index} produced an empty WAV file.`);
        replacements.push({
          startFrame,
          endFrame,
          buffer: fs.readFileSync(wavPath),
        });
        this.progress(id, base + (78 / phrases.length), 'phrase', `Phrase ${n + 1}/${phrases.length} ready`);
      }
      if (!replacements.length) throw new Error('No phrase audio was produced.');
      const baseWav = fs.readFileSync(files.wav);
      const spliced = splicePhraseWav(baseWav, replacements, { crossfadeMs });
      const tempWav = path.join(files.workspace, 'output.incremental.wav');
      fs.writeFileSync(tempWav, spliced);
      fs.renameSync(tempWav, files.wav);
      const wavInfo = readWavInfo(files.wav);
      const timingText = fs.existsSync(files.timing) ? fs.readFileSync(files.timing, 'utf8') : '';
      const result = {
        renderId: id,
        mode: 'phrase',
        wavPath: files.wav,
        f0Path: files.f0,
        melspecPath: files.melspec,
        timingPath: files.timing,
        timingText,
        duration: wavInfo.duration,
        sampleRate: wavInfo.sampleRate,
        channels: wavInfo.channels,
        bitsPerSample: wavInfo.bitsPerSample,
        logPath: files.log,
        model: payload.model,
        elapsedMs: nowMs() - this.active.startedAt,
        f0: null,
        phrases: payload.phrases,
      };
      this.progress(id, 100, 'done', 'Phrase render complete');
      this.emitEvent({ type: 'done', renderId: id, result });
      this.active = null;
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  findNeutrino(root) {
    const candidates = [
      path.join(root, 'bin', 'neutrino.exe'),
      path.join(root, 'bin', 'NEUTRINO.exe'),
      path.join(root, 'bin', 'neutrino'),
      path.join(root, 'bin', 'NEUTRINO'),
      path.join(root, 'neutrino'),
      path.join(root, 'NEUTRINO'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  findConverter(root) {
    const candidates = [
      path.join(root, 'bin', 'musicXMLtoLabel.exe'),
      path.join(root, 'bin', 'musicXMLToLabel.exe'),
      path.join(root, 'bin', 'musicXMLtoLabel'),
      path.join(root, 'musicXMLtoLabel'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  spawnStage(id, cmd, stage, basePercent, span) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(cmd.command, cmd.args, {
          cwd: cmd.cwd,
          env: cmd.env,
          windowsHide: true,
          detached: process.platform !== 'win32',
        });
      } catch (err) {
        reject(err);
        return;
      }
      if (!this.active || this.active.id !== id) {
        try {
          child.kill();
        } catch {}
        reject(new Error('Render canceled.'));
        return;
      }
      this.active.child = child;
      this.progress(id, basePercent, stage, 'Starting NEUTRINO');

      let pending = '';
      let lastProgress = -1;
      const consume = (buf) => {
        const text = decodeBuffer(buf);
        pending += text;
        const lines = pending.split(/\r\n|\n|\r/);
        pending = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          this.log(id, line);
          const m = line.match(/progress\s*=\s*(\d+)\s*%/i);
          if (m) {
            const pct = Number(m[1]);
            if (pct !== lastProgress) {
              lastProgress = pct;
              this.progress(id, basePercent + (pct / 100) * span, 'vocoder', line.trim());
            }
          }
        }
      };
      child.stdout.on('data', consume);
      child.stderr.on('data', consume);
      child.on('error', (err) => {
        reject(new Error(`Failed to launch ${cmd.command}: ${err.message}`));
      });
      const timeout = setTimeout(() => {
        if (this.active && this.active.id === id) {
          this.active.cancelled = false;
          this.log(id, '[studio] render timed out after 20 minutes');
          this.killActive();
        }
      }, 20 * 60 * 1000);
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (pending.trim()) this.log(id, pending);
        if (this.active && this.active.id === id) this.active.child = null;
        resolve({ code: code ?? -1 });
      });
    });
  }
}

module.exports = { RenderManager };
