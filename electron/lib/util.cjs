'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function decodeBuffer(buf) {
  if (!buf || buf.length === 0) return '';
  // NEUTRINO writes mostly UTF-8 on current builds, but some Windows tools
  // still emit CP932. Try strict UTF-8 first, then fall back.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

function which(command, env = process.env) {
  if (!command) return null;
  if (command.includes('/') || command.includes('\\')) {
    return fileExists(command) ? command : null;
  }
  const isWin = process.platform === 'win32';
  const tool = isWin ? 'where' : 'sh';
  const args = isWin ? [command] : ['-lc', `command -v -- "${String(command).replace(/"/g, '\\"')}"`];
  try {
    const res = spawnSync(tool, args, { encoding: 'utf8', timeout: 6000, env, windowsHide: true });
    if (res.status !== 0) return null;
    const first = String(res.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    return first || null;
  } catch {
    return null;
  }
}

function runAndCapture(command, args, opts = {}) {
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let child;
    try {
      child = spawn(command, args, {
        cwd: opts.cwd,
        env: opts.env || process.env,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: String(err), error: err });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, opts.timeoutMs || 15000);
    child.stdout.on('data', (d) => (stdout = Buffer.concat([stdout, d])));
    child.stderr.on('data', (d) => (stderr = Buffer.concat([stderr, d])));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: decodeBuffer(stdout), stderr: String(err), error: err });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout: decodeBuffer(stdout), stderr: decodeBuffer(stderr) });
    });
  });
}

function readWavInfo(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(64 * 1024);
    const read = fs.readSync(fd, header, 0, header.length, 0);
    fs.closeSync(fd);
    const b = header.subarray(0, read);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
      return { duration: 0, sampleRate: 0, channels: 0, bitsPerSample: 0 };
    }
    let offset = 12;
    let fmt = null;
    let dataSize = 0;
    while (offset + 8 <= b.length) {
      const id = b.toString('ascii', offset, offset + 4);
      const size = b.readUInt32LE(offset + 4);
      if (id === 'fmt ') {
        fmt = {
          channels: b.readUInt16LE(offset + 10),
          sampleRate: b.readUInt32LE(offset + 12),
          bitsPerSample: b.readUInt16LE(offset + 22),
        };
      } else if (id === 'data') {
        dataSize = size;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (!fmt || !dataSize) return { duration: 0, sampleRate: 0, channels: 0, bitsPerSample: 0 };
    const bytesPerFrame = Math.max(1, fmt.channels * (fmt.bitsPerSample / 8));
    return {
      ...fmt,
      dataSize,
      duration: dataSize / bytesPerFrame / fmt.sampleRate,
    };
  } catch {
    return { duration: 0, sampleRate: 0, channels: 0, bitsPerSample: 0 };
  }
}

function sanitizeName(name, fallback = 'project') {
  const s = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return s || fallback;
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

module.exports = {
  expandHome,
  fileExists,
  dirExists,
  ensureDir,
  decodeBuffer,
  which,
  runAndCapture,
  readWavInfo,
  sanitizeName,
  formatBytes,
};
