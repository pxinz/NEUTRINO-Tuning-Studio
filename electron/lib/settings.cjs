'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = {
  neutrinoRoot: '',
  runner: 'auto',
  wineCommand: 'wine',
  language: 'auto',
  theme: 'dark',
  defaultModel: '',
  supportModel: '',
  threads: 4,
  useGpu: true,
  sampleRate: 48000,
  bitDepth: 16,
  outputDir: '',
  recentProjects: [],
  scrollWheelMode: 'horizontal',
  window: { width: 1480, height: 940, x: null, y: null, maximized: false },
  showWelcome: true,
  autoSave: true,
  masterVolume: 0.9,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeSettings(base, patch) {
  const out = { ...base, ...(patch || {}) };
  if (patch && typeof patch.window === 'object' && patch.window) {
    out.window = { ...(base.window || {}), ...patch.window };
  }
  if (patch && Array.isArray(patch.recentProjects)) {
    out.recentProjects = patch.recentProjects.slice(0, 12);
  }
  return out;
}

class SettingsStore {
  constructor(userDataDir) {
    this.dir = userDataDir;
    this.file = path.join(userDataDir, 'settings.json');
    this.data = clone(DEFAULT_SETTINGS);
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = mergeSettings(clone(DEFAULT_SETTINGS), parsed);
    } catch {
      this.data = clone(DEFAULT_SETTINGS);
    }
    return this.data;
  }

  get() {
    return clone(this.data);
  }

  set(patch) {
    this.data = mergeSettings(this.data, patch);
    this.save();
    return this.get();
  }

  save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  addRecentProject(projectPath) {
    if (!projectPath) return this.get();
    const list = this.data.recentProjects.filter((p) => p !== projectPath);
    list.unshift(projectPath);
    this.data.recentProjects = list.slice(0, 12);
    this.save();
    return this.get();
  }
}

module.exports = { SettingsStore, DEFAULT_SETTINGS, mergeSettings };
