const { contextBridge, ipcRenderer, clipboard } = require('electron');
const crypto = require('crypto');

const PLUGIN_NAME = '哈希与 HMAC';

const ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'];

function computeHash(input, algorithm) {
  return crypto.createHash(algorithm).update(String(input || ''), 'utf8').digest('hex');
}

function computeHashB64(input, algorithm) {
  return crypto.createHash(algorithm).update(String(input || ''), 'utf8').digest('base64');
}

function computeHmac(input, algorithm, key) {
  return crypto.createHmac(algorithm, String(key || '')).update(String(input || ''), 'utf8').digest('hex');
}

function computeHmacB64(input, algorithm, key) {
  return crypto.createHmac(algorithm, String(key || '')).update(String(input || ''), 'utf8').digest('base64');
}

function compareHash(a, b) {
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  catch (_) { return false; }
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
  algorithms: ALGORITHMS,
  computeHash,
  computeHashB64,
  computeHmac,
  computeHmacB64,
  compareHash
};

try { contextBridge.exposeInMainWorld('services', services); }
catch (_) { window.services = services; }

window.exports = {
  'plugin-market-hash-hmac': {
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
