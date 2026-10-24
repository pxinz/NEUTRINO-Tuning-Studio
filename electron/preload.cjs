'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  addRecentProject: (p) => ipcRenderer.invoke('settings:addRecent', p),

  detectNeutrino: (opts) => ipcRenderer.invoke('neutrino:detect', opts),
  getModels: () => ipcRenderer.invoke('neutrino:models'),

  openDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  saveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),
  directoryDialog: (opts) => ipcRenderer.invoke('dialog:directory', opts),

  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  readBinary: (p) => ipcRenderer.invoke('fs:readBinary', p),
  writeText: (p, data) => ipcRenderer.invoke('fs:writeText', { path: p, data }),
  writeBinary: (p, data) => ipcRenderer.invoke('fs:writeBinary', { path: p, data }),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  stat: (p) => ipcRenderer.invoke('fs:stat', p),
  deleteFile: (p) => ipcRenderer.invoke('fs:delete', p),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (p) => ipcRenderer.invoke('shell:showItem', p),

  readProject: (p) => ipcRenderer.invoke('project:read', p),
  writeProject: (p, data) => ipcRenderer.invoke('project:write', { path: p, data }),

  startRender: (payload) => ipcRenderer.invoke('render:start', payload),
  cancelRender: (renderId) => ipcRenderer.invoke('render:cancel', renderId),
  isRenderBusy: () => ipcRenderer.invoke('render:busy'),

  setTitle: (title) => ipcRenderer.invoke('app:setTitle', title),
  quit: () => ipcRenderer.invoke('app:quit'),
  setDirty: (dirty) => ipcRenderer.invoke('app:setDirty', dirty),
  confirmClose: () => ipcRenderer.invoke('app:confirmClose'),

  onRenderEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('render:event', handler);
    return () => ipcRenderer.removeListener('render:event', handler);
  },
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  onSettingsChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('settings:changed', handler);
    return () => ipcRenderer.removeListener('settings:changed', handler);
  },
  onRequestClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:request-close', handler);
    return () => ipcRenderer.removeListener('app:request-close', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
