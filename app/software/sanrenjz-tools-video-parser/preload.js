'use strict';

const { contextBridge, ipcRenderer, clipboard, shell } = require('electron');
const { normalizeInput } = require('./parser-service');
const { fork } = require('node:child_process');
const path = require('node:path');
const { createLibraryStore, collectionData, pageUrl } = require('./library-store');
const PLUGIN_NAME = '视频解析播放';
const library = createLibraryStore({
  get: () => ipcRenderer.invoke('plugin-storage-get-async', PLUGIN_NAME, 'library-v1'),
  set: value => ipcRenderer.invoke('plugin-storage-set-async', PLUGIN_NAME, 'library-v1', value)
});
let worker = null, nextId = 0;
const pending = new Map();
function rejectPending() {
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('解析服务已退出，请重新打开插件。')); }
  pending.clear();
}
function request(method, value) {
  if (!worker) {
    worker = fork(path.join(__dirname, 'backend.js'), [], { execPath: process.execPath, execArgv: [], windowsHide: true, silent: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    worker.stdout.on('data', () => {});
    worker.stderr.on('data', () => {});
    worker.on('message', message => {
      const task = pending.get(message.id); if (!task) return;
      clearTimeout(task.timer); pending.delete(message.id);
      message.error ? task.reject(new Error(message.error)) : task.resolve(message.result);
    });
    worker.on('error', () => { worker = null; rejectPending(); });
    worker.on('exit', () => { worker = null; rejectPending(); });
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('解析服务响应超时，请关闭后重新打开插件。')); }, 150000);
    pending.set(id, { resolve, reject, timer });
    worker.send({id,method,value},error=>{if(error){clearTimeout(timer);pending.delete(id);reject(new Error('无法连接解析服务。'));}});
  });
}
const api = {
  checkEngine: customPath => request('checkEngine', String(customPath || '')),
  list: input => request('list', input),
  play: id => request('play', id),
  cancel: () => request('cancel').catch(() => {}),
  clipboardText: () => clipboard.readText(),
  openOriginal: input => shell.openExternal(normalizeInput(input).url),
  getSettings: () => ipcRenderer.invoke('plugin-storage-get-async', PLUGIN_NAME, 'settings-v1'),
  saveSettings: settings => ipcRenderer.invoke('plugin-storage-set-async', PLUGIN_NAME, 'settings-v1', { pythonPath: String(settings.pythonPath || ''), autoNext: !!settings.autoNext }),
  getLibrary: () => library.get(),
  libraryKey: collection => collectionData(collection).key,
  pageKey: input => pageUrl(input),
  rememberCollection: collection => library.remember(collection),
  setFavorite: (key, value) => library.favorite(key, value),
  saveProgress: progress => library.progress(progress),
  removeHistory: key => library.removeHistory(key),
  retryLibrarySave: () => library.flush(),
  choosePython: () => {
    const result = ipcRenderer.sendSync('show-open-dialog', { title: '选择 Python 3.10+ 解释器', properties: ['openFile'], filters: process.platform === 'win32' ? [{name:'Python 可执行程序',extensions:['exe']}] : undefined });
    return result?.[0] || '';
  }
};
try { contextBridge.exposeInMainWorld('videoAPI', api); } catch (_) { window.videoAPI = api; }
window.exports = {
  'video-parser-play': { mode: 'none', args: {
    enter: action => window.dispatchEvent(new CustomEvent('plugin-enter', { detail: action || {} })),
    search: (_action, _word, setList) => setList([]),
    select: () => {}
  } }
};
window.addEventListener('beforeunload', () => {
  try { if (worker?.connected) { worker.send({method:'dispose'}, () => {}); worker.disconnect(); } } catch (_) {}
  rejectPending();
});
