const { contextBridge, ipcRenderer, clipboard } = require('electron');

const PLUGIN_NAME = '时间转换器';

const services = {
  storage: {
    get: (key) => { try { return ipcRenderer.sendSync('plugin-storage-get', PLUGIN_NAME, key); } catch(_) { return null; } },
    set: (key, value) => { try { ipcRenderer.sendSync('plugin-storage-set', PLUGIN_NAME, key, value); } catch(_) {} }
  },
  window: {
    close: () => ipcRenderer.invoke('close-plugin-window', PLUGIN_NAME),
    togglePin: () => ipcRenderer.invoke('toggle-plugin-pin-window', PLUGIN_NAME)
  },
  clipboard: { writeText: (text) => clipboard.writeText(String(text || '')) }
};

try { contextBridge.exposeInMainWorld('services', services); }
catch (_) { window.services = services; }

window.exports = {
  'plugin-market-time-converter': {
    mode: 'none',
    args: {
      enter: (action) => {
        const payload = action && typeof action === 'object'
          ? String(action.payload || action.clipboardText || '') : '';
        if (payload) window.dispatchEvent(new CustomEvent('plugin-enter', { detail: payload }));
      }
    }
  }
};
