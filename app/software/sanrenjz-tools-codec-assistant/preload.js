const { contextBridge, ipcRenderer, clipboard } = require('electron');
const Buffer = require('buffer').Buffer;

const PLUGIN_NAME = '编解码助手';

function encode(type, text) {
  text = String(text || '');
  switch (type) {
    case 'base64': return Buffer.from(text, 'utf8').toString('base64');
    case 'url': return encodeURIComponent(text);
    case 'hex': return Buffer.from(text, 'utf8').toString('hex');
    case 'unicode': return [...text].map(c => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join('');
    case 'html': return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    default: throw new Error('不支持的编码类型: ' + type);
  }
}

function decode(type, text) {
  text = String(text || '');
  switch (type) {
    case 'base64': return Buffer.from(text, 'base64').toString('utf8');
    case 'url': return decodeURIComponent(text);
    case 'hex': return Buffer.from(text.replace(/\s+/g, ''), 'hex').toString('utf8');
    case 'unicode': return text.replace(/\\u([\da-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
    case 'html': return text.replace(/&(amp|lt|gt|quot|#39);/g, t => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[t]));
    default: throw new Error('不支持的解码类型: ' + type);
  }
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
  encode,
  decode
};

try { contextBridge.exposeInMainWorld('services', services); }
catch (_) { window.services = services; }

window.exports = {
  'plugin-market-codec-assistant': {
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
