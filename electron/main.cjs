'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron');

const debugBoot = (message, detail) => {
  if (process.env.NT_DEBUG_BOOT !== '1') return;
  try {
    const line = `[${new Date().toISOString()}] ${message}${detail ? ` ${detail}` : ''}\n`;
    fs.appendFileSync(path.join(os.tmpdir(), 'ntstudio-boot.log'), line, 'utf8');
  } catch {}
};
debugBoot('main module loaded');
const { SettingsStore } = require('./lib/settings.cjs');
const { detectNeutrino } = require('./lib/neutrino.cjs');
const { RenderManager } = require('./lib/render.cjs');
const { ensureDir } = require('./lib/util.cjs');

const isDev = process.env.NT_DEV === '1';
const DEV_URL = process.env.NT_DEV_URL || 'http://127.0.0.1:5173';

let mainWindow = null;
let settings = null;
let renderManager = null;
let detectionCache = null;
let detectionCacheKey = '';
let menuLanguage = 'en';
let rendererDirty = false;
let forceClose = false;

app.setName('NEUTRINO Tuning Studio');
app.setAppUserModelId('com.studio.neutrino.tuningstudio');
if (process.env.NT_USER_DATA) {
  app.setPath('userData', process.env.NT_USER_DATA);
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
  if (process.env.NT_NO_SANDBOX === '1') {
    app.commandLine.appendSwitch('no-sandbox');
  }
  if (process.env.NT_DISABLE_GPU === '1') {
    app.commandLine.appendSwitch('disable-gpu');
  }
}

const MENU_TEXT = {
  en: {
    file: 'File',
    newProject: 'New Project',
    openProject: 'Open Project…',
    save: 'Save',
    saveAs: 'Save As…',
    importMusicXML: 'Import MusicXML…',
    importMIDI: 'Import MIDI…',
    exportWav: 'Export Vocal WAV…',
    exportMix: 'Export Mixdown…',
    exportMusicXML: 'Export MusicXML…',
    quit: 'Quit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    delete: 'Delete',
    selectAll: 'Select All',
    view: 'View',
    score: 'Score',
    timing: 'Timing',
    pitch: 'Pitch',
    dynamics: 'Dynamics',
    toggleLog: 'Toggle Render Log',
    settings: 'Settings…',
    language: 'Language',
    theme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeSystem: 'System',
    help: 'Help',
    quickStart: 'Quick Start',
    website: 'NEUTRINO Website',
    about: 'About',
    auto: 'Auto',
    chinese: '中文',
    english: 'English',
    japanese: '日本語',
  },
  zh: {
    file: '文件',
    newProject: '新建项目',
    openProject: '打开项目…',
    save: '保存',
    saveAs: '另存为…',
    importMusicXML: '导入 MusicXML…',
    importMIDI: '导入 MIDI…',
    exportWav: '导出人声 WAV…',
    exportMix: '导出混音…',
    exportMusicXML: '导出 MusicXML…',
    quit: '退出',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    delete: '删除',
    selectAll: '全选',
    view: '视图',
    score: '乐谱',
    timing: '时序',
    pitch: '音高',
    dynamics: '动态',
    toggleLog: '显示/隐藏渲染日志',
    settings: '设置…',
    language: '语言',
    theme: '主题',
    themeDark: '深色',
    themeLight: '浅色',
    themeSystem: '跟随系统',
    help: '帮助',
    quickStart: '快速上手',
    website: 'NEUTRINO 官网',
    about: '关于',
    auto: '自动',
    chinese: '中文',
    english: 'English',
    japanese: '日本語',
  },
  ja: {
    file: 'ファイル',
    newProject: '新規プロジェクト',
    openProject: 'プロジェクトを開く…',
    save: '保存',
    saveAs: '名前を付けて保存…',
    importMusicXML: 'MusicXML を読み込む…',
    importMIDI: 'MIDI を読み込む…',
    exportWav: 'ボーカル WAV を書き出す…',
    exportMix: 'ミックスを書き出す…',
    exportMusicXML: 'MusicXML を書き出す…',
    quit: '終了',
    edit: '編集',
    undo: '元に戻す',
    redo: 'やり直す',
    cut: '切り取り',
    copy: 'コピー',
    paste: '貼り付け',
    delete: '削除',
    selectAll: 'すべて選択',
    view: '表示',
    score: 'スコア',
    timing: 'タイミング',
    pitch: 'ピッチ',
    dynamics: 'ダイナミクス',
    toggleLog: 'レンダーログの表示',
    settings: '設定…',
    language: '言語',
    theme: 'テーマ',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    themeSystem: 'システム',
    help: 'ヘルプ',
    quickStart: 'クイックスタート',
    website: 'NEUTRINO 公式サイト',
    about: 'このアプリについて',
    auto: '自動',
    chinese: '中文',
    english: 'English',
    japanese: '日本語',
  },
};

function t(key) {
  return (MENU_TEXT[menuLanguage] || MENU_TEXT.en)[key] || MENU_TEXT.en[key] || key;
}

function sendMenu(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu:action', action);
  }
}

function buildMenu() {
  const langSubmenu = [
    { label: t('auto'), type: 'radio', checked: settings.get().language === 'auto', click: () => setLanguage('auto') },
    { label: t('chinese'), type: 'radio', checked: settings.get().language === 'zh', click: () => setLanguage('zh') },
    { label: t('english'), type: 'radio', checked: settings.get().language === 'en', click: () => setLanguage('en') },
    { label: t('japanese'), type: 'radio', checked: settings.get().language === 'ja', click: () => setLanguage('ja') },
  ];
  const themeSubmenu = [
    { label: t('themeDark'), type: 'radio', checked: settings.get().theme === 'dark', click: () => setTheme('dark') },
    { label: t('themeLight'), type: 'radio', checked: settings.get().theme === 'light', click: () => setTheme('light') },
    { label: t('themeSystem'), type: 'radio', checked: settings.get().theme === 'system', click: () => setTheme('system') },
  ];
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: t('file'),
      submenu: [
        { label: t('newProject'), accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new-project') },
        { label: t('openProject'), accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open-project') },
        { type: 'separator' },
        { label: t('save'), accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save-project') },
        { label: t('saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('save-project-as') },
        { type: 'separator' },
        { label: t('importMusicXML'), click: () => sendMenu('import-musicxml') },
        { label: t('importMIDI'), click: () => sendMenu('import-midi') },
        { type: 'separator' },
        { label: t('exportWav'), click: () => sendMenu('export-wav') },
        { label: t('exportMix'), click: () => sendMenu('export-mix') },
        { label: t('exportMusicXML'), click: () => sendMenu('export-musicxml') },
        { type: 'separator' },
        { label: t('quit'), accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: t('edit'),
      submenu: [
        { label: t('undo'), accelerator: 'CmdOrCtrl+Z', click: () => sendMenu('undo') },
        { label: t('redo'), accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendMenu('redo') },
        { type: 'separator' },
        { label: t('cut'), accelerator: 'CmdOrCtrl+X', click: () => sendMenu('cut') },
        { label: t('copy'), accelerator: 'CmdOrCtrl+C', click: () => sendMenu('copy') },
        { label: t('paste'), accelerator: 'CmdOrCtrl+V', click: () => sendMenu('paste') },
        { label: t('delete'), accelerator: 'Delete', click: () => sendMenu('delete') },
        { label: t('selectAll'), accelerator: 'CmdOrCtrl+A', click: () => sendMenu('select-all') },
      ],
    },
    {
      label: t('view'),
      submenu: [
        { label: t('score'), accelerator: 'CmdOrCtrl+1', click: () => sendMenu('tab-score') },
        { label: t('timing'), accelerator: 'CmdOrCtrl+2', click: () => sendMenu('tab-timing') },
        { label: t('pitch'), accelerator: 'CmdOrCtrl+3', click: () => sendMenu('tab-pitch') },
        { label: t('dynamics'), accelerator: 'CmdOrCtrl+4', click: () => sendMenu('tab-dynamics') },
        { type: 'separator' },
        { label: t('toggleLog'), accelerator: 'CmdOrCtrl+L', click: () => sendMenu('toggle-log') },
        { label: t('settings'), accelerator: 'CmdOrCtrl+,', click: () => sendMenu('settings') },
        { type: 'separator' },
        { label: t('language'), submenu: langSubmenu },
        { label: t('theme'), submenu: themeSubmenu },
        { type: 'separator' },
        { role: 'reload', visible: isDev },
        { role: 'toggleDevTools', visible: isDev },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: t('help'),
      submenu: [
        { label: t('quickStart'), click: () => sendMenu('help') },
        { label: t('website'), click: () => shell.openExternal('https://studio-neutrino.com/') },
        { label: t('about'), click: () => sendMenu('about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setLanguage(language) {
  settings.set({ language });
  menuLanguage = resolveMenuLanguage(language);
  buildMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:changed', settings.get());
  }
}

function setTheme(theme) {
  settings.set({ theme });
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme;
  buildMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:changed', settings.get());
  }
}

function resolveMenuLanguage(language) {
  if (language === 'zh' || language === 'ja' || language === 'en') return language;
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith('zh')) return 'zh';
  if (locale.startsWith('ja')) return 'ja';
  return 'en';
}

async function getDetection(force = false, overrides = {}) {
  const s = settings.get();
  const root = overrides.root !== undefined ? overrides.root : s.neutrinoRoot;
  const runner = overrides.runner || s.runner || 'auto';
  const wineCommand = overrides.wineCommand || s.wineCommand || 'wine';
  const key = `${root}|${runner}|${wineCommand}`;
  if (!force && detectionCache && detectionCacheKey === key) return detectionCache;
  const info = await detectNeutrino({ root, runner, wineCommand });
  detectionCache = info;
  detectionCacheKey = key;
  return info;
}

function createWindow() {
  const s = settings.get();
  const bounds = s.window || {};
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  const win = new BrowserWindow({
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    width: Math.max(1120, bounds.width || 1480),
    height: Math.max(720, bounds.height || 940),
    x: Number.isFinite(bounds.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds.y) ? bounds.y : undefined,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0e14',
    title: 'NEUTRINO Tuning Studio',
    autoHideMenuBar: process.platform === 'win32',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow = win;
  if (bounds.maximized) win.maximize();

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    settings.set({
      window: {
        width: b.width,
        height: b.height,
        x: b.x,
        y: b.y,
        maximized: win.isMaximized(),
      },
    });
  };
  win.on('close', (event) => {
    saveBounds();
    if (!forceClose && rendererDirty) {
      event.preventDefault();
      win.webContents.send('app:request-close');
    }
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith('file:');
    if (!allowed) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale(),
    userData: app.getPath('userData'),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:set', (_e, patch) => {
    const prev = settings.get();
    const next = settings.set(patch || {});
    if (patch && patch.language && patch.language !== prev.language) {
      menuLanguage = resolveMenuLanguage(next.language);
      buildMenu();
    }
    if (patch && patch.theme && patch.theme !== prev.theme) {
      nativeTheme.themeSource = next.theme === 'system' ? 'system' : next.theme;
      buildMenu();
    }
    return next;
  });
  ipcMain.handle('settings:addRecent', (_e, projectPath) => settings.addRecentProject(projectPath));

  ipcMain.handle('neutrino:detect', async (_e, opts) => {
    const info = await getDetection(Boolean(opts && opts.force), opts || {});
    if (info.ok && info.root && (!opts || opts.save !== false)) {
      settings.set({ neutrinoRoot: info.root });
    }
    return info;
  });
  ipcMain.handle('neutrino:models', async () => {
    const info = await getDetection(false);
    return info.models || [];
  });

  ipcMain.handle('dialog:open', async (_e, opts = {}) => {
    if (process.env.NT_TEST === '1' && process.env.NT_TEST_OPEN_PATH) {
      return process.env.NT_TEST_OPEN_PATH.split('|').filter(Boolean);
    }
    const res = await dialog.showOpenDialog(mainWindow, {
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    if (res.canceled) return [];
    return res.filePaths;
  });
  ipcMain.handle('dialog:save', async (_e, opts = {}) => {
    if (process.env.NT_TEST === '1' && process.env.NT_TEST_DIALOG_DIR) {
      ensureDir(process.env.NT_TEST_DIALOG_DIR);
      const name = path.basename(opts.defaultPath || `export-${Date.now()}`);
      return path.join(process.env.NT_TEST_DIALOG_DIR, name);
    }
    const res = await dialog.showSaveDialog(mainWindow, {
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
    });
    if (res.canceled || !res.filePath) return null;
    return res.filePath;
  });
  ipcMain.handle('dialog:directory', async (_e, opts = {}) => {
    if (process.env.NT_TEST === '1' && process.env.NT_TEST_DIALOG_DIR) {
      ensureDir(process.env.NT_TEST_DIALOG_DIR);
      return process.env.NT_TEST_DIALOG_DIR;
    }
    const res = await dialog.showOpenDialog(mainWindow, {
      title: opts.title,
      defaultPath: opts.defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled) return null;
    return res.filePaths[0] || null;
  });

  ipcMain.handle('fs:readText', async (_e, filePath) => fs.readFileSync(filePath, 'utf8'));
  ipcMain.handle('fs:readBinary', async (_e, filePath) => fs.readFileSync(filePath));
  ipcMain.handle('fs:writeText', async (_e, { path: filePath, data }) => {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, String(data ?? ''), 'utf8');
    return true;
  });
  ipcMain.handle('fs:writeBinary', async (_e, { path: filePath, data }) => {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, Buffer.from(data));
    return true;
  });
  ipcMain.handle('fs:exists', async (_e, filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });
  ipcMain.handle('fs:stat', async (_e, filePath) => {
    try {
      const st = fs.statSync(filePath);
      return { exists: true, size: st.size, mtime: st.mtimeMs, isDirectory: st.isDirectory() };
    } catch {
      return { exists: false, size: 0, mtime: 0, isDirectory: false };
    }
  });
  ipcMain.handle('fs:delete', async (_e, filePath) => {
    try {
      fs.rmSync(filePath, { force: true });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('shell:openExternal', async (_e, url) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
    return false;
  });
  ipcMain.handle('shell:showItem', async (_e, filePath) => {
    if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle('project:read', async (_e, filePath) => fs.readFileSync(filePath, 'utf8'));
  ipcMain.handle('project:write', async (_e, { path: filePath, data }) => {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, String(data), 'utf8');
    settings.addRecentProject(filePath);
    return true;
  });

  ipcMain.handle('render:start', async (_e, payload) => {
    return renderManager.start(payload || {});
  });
  ipcMain.handle('render:cancel', async (_e, renderId) => {
    return renderManager.cancel(renderId);
  });
  ipcMain.handle('render:busy', async () => renderManager.isBusy());

  ipcMain.handle('app:setTitle', async (_e, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(title || 'NEUTRINO Tuning Studio');
    return true;
  });
  ipcMain.handle('app:quit', async () => {
    app.quit();
    return true;
  });
  ipcMain.handle('app:setDirty', async (_e, dirty) => {
    rendererDirty = Boolean(dirty);
    return true;
  });
  ipcMain.handle('app:confirmClose', async () => {
    forceClose = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    return true;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    debugBoot('app ready');
    settings = new SettingsStore(app.getPath('userData'));
    menuLanguage = resolveMenuLanguage(settings.get().language);
    nativeTheme.themeSource =
      settings.get().theme === 'system' ? 'system' : settings.get().theme || 'dark';

    renderManager = new RenderManager({
      settings,
      emit: (event) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('render:event', event);
        }
      },
      getRoot: () => settings.get().neutrinoRoot,
    });

    registerIpc();
    buildMenu();

    // First-run detection: remember a usable installation automatically.
    if (!settings.get().neutrinoRoot) {
      try {
        const info = await getDetection(true);
        if (info.ok && info.root) {
          settings.set({
            neutrinoRoot: info.root,
            defaultModel: info.models[0] ? info.models[0].id : '',
          });
        }
      } catch {}
    }

    debugBoot('creating window');
    createWindow();
    debugBoot('window created');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
