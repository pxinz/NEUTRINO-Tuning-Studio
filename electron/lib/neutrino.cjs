'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  expandHome,
  fileExists,
  dirExists,
  which,
  runAndCapture,
} = require('./util.cjs');

const NEUTRINO_NAMES = ['neutrino.exe', 'NEUTRINO.exe', 'neutrino', 'NEUTRINO'];
const CONVERTER_NAMES = [
  'musicXMLtoLabel.exe',
  'musicXMLToLabel.exe',
  'musicXMLtoLabel',
  'musicXMLToLabel',
];

const DISPLAY_NAMES = {
  MERROW: { en: 'Merrow', ja: 'めろう', zh: 'めろう' },
  NAKUMO: { en: 'Nakumo', ja: 'ナクモ', zh: 'ナクモ' },
  REINA: { en: 'Reina', ja: 'レイナ', zh: 'レイナ' },
  RUNO: { en: 'Runo', ja: 'ルノ', zh: 'ルノ' },
  SOMA: { en: 'Soma', ja: 'ソウマ', zh: 'ソウマ' },
  ZUNDAMON: { en: 'Zundamon', ja: 'ずんだもん', zh: 'ずんだもん' },
  ZUNKO: { en: 'Zunko', ja: '東北ずん子', zh: '东北俊子' },
  KIRITAN: { en: 'Kiritan', ja: '東北きりたん', zh: '东北切蒲英' },
  ITAKO: { en: 'Itako', ja: '東北イタコ', zh: '东北伊太弧' },
  METAN: { en: 'Metan', ja: '四国めたん', zh: '四国梅丹' },
  CHANKO: { en: 'Chanko', ja: '大江戸ちゃんこ', zh: '大江户ちゃんこ' },
  SEVEN: { en: 'No.7', ja: 'No.7', zh: 'No.7' },
  YOKO: { en: 'Yoko', ja: '謡子', zh: '谣子' },
  JSUT: { en: 'JSUT', ja: 'JSUT', zh: 'JSUT' },
  AKANE: { en: 'Akane', ja: '琴葉茜', zh: '琴叶茜' },
  AOI: { en: 'Aoi', ja: '琴葉葵', zh: '琴叶葵' },
  TOBARI: { en: 'Tobari', ja: '夜語トバリ', zh: '夜语トバリ' },
};

function candidateRoots() {
  const roots = [];
  if (process.env.NEUTRINO_ROOT) roots.push(expandHome(process.env.NEUTRINO_ROOT));
  const home = os.homedir();
  if (process.platform === 'win32') {
    roots.push('E:\\Programs\\NEUTRINO', 'C:\\Program Files\\NEUTRINO', 'C:\\NEUTRINO');
    for (const drive of ['C', 'D', 'E', 'F', 'G', 'H']) {
      roots.push(`${drive}:\\NEUTRINO`, `${drive}:\\Programs\\NEUTRINO`);
    }
  } else {
    roots.push(
      path.join(home, 'NEUTRINO'),
      path.join(home, 'neutrino'),
      '/opt/NEUTRINO',
      '/opt/neutrino',
      '/usr/local/NEUTRINO',
      '/Applications/NEUTRINO',
      path.join(home, 'Applications/NEUTRINO'),
      path.join(home, 'Library/NEUTRINO'),
    );
  }
  roots.push(path.join(home, 'Downloads', 'NEUTRINO'));
  return [...new Set(roots)];
}

function findBinary(root, names, subdirs = ['bin', '', 'app', 'macos']) {
  for (const sub of subdirs) {
    for (const name of names) {
      const p = sub ? path.join(root, sub, name) : path.join(root, name);
      if (fileExists(p)) return p;
    }
  }
  // Case-insensitive fallback for Linux / macOS archives.
  try {
    for (const sub of subdirs) {
      const dir = sub ? path.join(root, sub) : root;
      if (!dirExists(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (names.some((n) => n.toLowerCase() === entry.name.toLowerCase())) {
          return path.join(dir, entry.name);
        }
      }
    }
  } catch {}
  return null;
}

function findBinaries(root) {
  if (!root || !dirExists(root)) return null;
  const neutrino = findBinary(root, NEUTRINO_NAMES);
  const converter = findBinary(root, CONVERTER_NAMES);
  if (!neutrino && !converter) return null;
  return { neutrino, converter };
}

function parseToml(text) {
  const out = {};
  let section = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1].trim();
      out[section] = out[section] || {};
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^-?\d+$/.test(value)) value = Number(value);
    else if (/^-?\d+\.\d+$/.test(value)) value = Number(value);
    if (section) out[section][key] = value;
    else out[key] = value;
  }
  return out;
}

function readModel(root, dirName) {
  const dir = path.join(root, 'model', dirName);
  if (!dirExists(dir)) return null;
  let info = {};
  try {
    info = parseToml(fs.readFileSync(path.join(dir, 'info.toml'), 'utf8'));
  } catch {}
  const speaker = info.speaker || {};
  const display = DISPLAY_NAMES[String(dirName).toUpperCase()] || null;
  const name = speaker.name || dirName;
  const lower = String(dirName).toUpperCase();
  const license = ['license.pdf', 'LICENSE.pdf', 'license.txt', 'LICENSE'].find((f) =>
    fileExists(path.join(dir, f)),
  );
  const readme = fs
    .readdirSync(dir)
    .find((f) => /readme/i.test(f) && /\.(pdf|txt|md)$/i.test(f));
  return {
    id: dirName,
    dir,
    name,
    displayName: display ? display.en : name,
    localizedNames: display || { en: name, ja: name, zh: name },
    type: speaker.type || 'unknown',
    gender: speaker.gender || 'unknown',
    language: speaker.language || 'Japanese',
    style: speaker.style || 'normal',
    support: speaker.support !== false,
    version: info.version || '',
    modelType: info.type || '',
    topKey: typeof info.top_key === 'number' ? info.top_key : null,
    bottomKey: typeof info.bottom_key === 'number' ? info.bottom_key : null,
    licensePath: license ? path.join(dir, license) : null,
    readmePath: readme ? path.join(dir, readme) : null,
    hasWeights: fileExists(path.join(dir, 'p.bin')) || fileExists(path.join(dir, 'model.onnx')),
  };
}

function listModels(root) {
  if (!root) return [];
  const modelDir = path.join(root, 'model');
  if (!dirExists(modelDir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(modelDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    const model = readModel(root, entry.name);
    if (model) result.push(model);
  }
  result.sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === 'standard') return -1;
      if (b.type === 'standard') return 1;
    }
    return a.id.localeCompare(b.id);
  });
  return result;
}

function winePath(p) {
  if (!p) return p;
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return p;
  const abs = path.resolve(p);
  if (process.platform !== 'win32' && abs.startsWith('/')) {
    return `Z:${abs.replace(/\//g, '\\')}`;
  }
  return abs;
}

function resolveRunner({ runner, neutrinoPath, wineCommand }) {
  const isExe = /\.exe$/i.test(neutrinoPath || '');
  if (process.platform === 'win32') return { runner: 'native', available: true };
  if (runner === 'wine' || (runner !== 'native' && isExe)) {
    const wine = which(wineCommand || 'wine');
    return {
      runner: 'wine',
      available: Boolean(wine),
      wine: wine || null,
      error: wine
        ? null
        : `Wine was not found ("${wineCommand || 'wine'}"). Install Wine or point the app at a native NEUTRINO build.`,
    };
  }
  return { runner: 'native', available: true };
}

async function detectNeutrino(options = {}) {
  const candidates = [];
  if (options.root) candidates.push(expandHome(options.root));
  candidates.push(...candidateRoots());
  const seen = new Set();
  let root = null;
  let binaries = null;
  for (const candidate of candidates) {
    const abs = path.resolve(expandHome(candidate));
    if (seen.has(abs)) continue;
    seen.add(abs);
    const found = findBinaries(abs);
    if (found && found.neutrino) {
      root = abs;
      binaries = found;
      break;
    }
  }
  if (!root) {
    return {
      ok: false,
      root: options.root || '',
      models: [],
      error: 'NEUTRINO installation was not found. Choose the folder that contains Run.bat.',
      candidates: [...seen].slice(0, 30),
    };
  }

  const runnerInfo = resolveRunner({
    runner: options.runner || 'auto',
    neutrinoPath: binaries.neutrino,
    wineCommand: options.wineCommand,
  });

  let version = '';
  let banner = '';
  let help = '';
  if (runnerInfo.available) {
    const cmd = runnerInfo.runner === 'wine' ? runnerInfo.wine : binaries.neutrino;
    const args =
      runnerInfo.runner === 'wine'
        ? [winePath(binaries.neutrino)]
        : [];
    const res = await runAndCapture(cmd, args, {
      cwd: root,
      timeoutMs: 12000,
      env: { ...process.env, WINEDEBUG: '-all' },
    });
    banner = [res.stdout, res.stderr].filter(Boolean).join('\n').trim();
    const m = banner.match(/NEUTRINO\s*-\s*([^\r\n]+)/i);
    if (m) version = m[1].trim();
    if (/usage:/i.test(banner)) help = banner;
  }

  const models = listModels(root);
  const installed = models.filter((m) => m.hasWeights);
  const warnings = [];
  if (!binaries.converter) {
    warnings.push('musicXMLtoLabel was not found next to NEUTRINO.');
  }
  if (installed.length === 0) {
    warnings.push('No voice models were found in the model folder.');
  }
  if (!runnerInfo.available) warnings.push(runnerInfo.error);

  return {
    ok: runnerInfo.available && Boolean(binaries.converter),
    root,
    binaries,
    runner: runnerInfo.runner,
    wine: runnerInfo.wine || null,
    version,
    banner,
    help,
    models: installed,
    allModels: models,
    warnings,
    error: runnerInfo.available ? null : runnerInfo.error,
    platform: process.platform,
  };
}

function buildCommand(root, executable, args, runner, wineCommand) {
  if (runner === 'wine') {
    return {
      command: wineCommand || 'wine',
      args: [winePath(executable), ...args.map((a) => (isPathLike(a) ? winePath(a) : a))],
      cwd: root,
      env: { ...process.env, WINEDEBUG: '-all' },
    };
  }
  return {
    command: executable,
    args,
    cwd: root,
    env: { ...process.env },
  };
}

function isPathLike(arg) {
  if (typeof arg !== 'string') return false;
  if (/^[A-Za-z]:[\\/]/.test(arg)) return true;
  if (arg.startsWith('/')) return true;
  return /\.(lab|musicxml|xml|wav|f0|melspec|exe)$/i.test(arg) && (arg.includes('/') || arg.includes('\\'));
}

module.exports = {
  candidateRoots,
  findBinaries,
  parseToml,
  readModel,
  listModels,
  detectNeutrino,
  buildCommand,
  resolveRunner,
  winePath,
  DISPLAY_NAMES,
  NEUTRINO_NAMES,
  CONVERTER_NAMES,
};
