const { contextBridge, ipcRenderer, clipboard } = require('electron');
const fs = require('fs');

const PLUGIN_NAME = '配置格式转换';

const services = {
  storage: {
    get: (key) => { try { return ipcRenderer.sendSync('plugin-storage-get', PLUGIN_NAME, key); } catch(_) { return null; } },
    set: (key, value) => { try { ipcRenderer.sendSync('plugin-storage-set', PLUGIN_NAME, key, value); } catch(_) {} }
  },
  window: {
    close: () => ipcRenderer.invoke('close-plugin-window', PLUGIN_NAME),
    togglePin: () => ipcRenderer.invoke('toggle-plugin-pin-window', PLUGIN_NAME)
  },
  clipboard: { writeText: (text) => clipboard.writeText(String(text || '')) },
  readFile: (filePath) => { try { return fs.readFileSync(filePath, 'utf8'); } catch(_) { return null; } },
  saveFile: (filePath, content) => { try { fs.writeFileSync(filePath, content, 'utf8'); return true; } catch(_) { return false; } }
};

try { contextBridge.exposeInMainWorld('services', services); }
catch (_) { window.services = services; }

window.exports = {
  'plugin-market-config-converter': {
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
