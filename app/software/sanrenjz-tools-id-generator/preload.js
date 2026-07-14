const { contextBridge, ipcRenderer, clipboard } = require('electron');
const crypto = require('crypto');

const PLUGIN_NAME = 'ID 生成器';

function generateUuid() { return crypto.randomUUID(); }

function generateNanoId(length, alphabet) {
  alphabet = alphabet || '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
  length = Math.min(128, Math.max(4, Number(length) || 21));
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

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
  generateUuid,
  generateNanoId
};

try { contextBridge.exposeInMainWorld('services', services); }
catch (_) { window.services = services; }

window.exports = {
  'plugin-market-id-generator': {
    mode: 'none',
    args: {
      enter: (action) => {
        window.dispatchEvent(new CustomEvent('plugin-enter', { detail: action || {} }));
      }
    }
  }
};
