const { contextBridge, ipcRenderer, clipboard } = require('electron');
const crypto = require('crypto');
const Buffer = require('buffer').Buffer;

const PLUGIN_NAME = 'JWT 检查器';

function decodeJwtPart(part) {
  const normalized = String(part).replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

function decodeJwt(token) {
  token = String(token || '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT 必须包含 header.payload.signature 三段');
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  const expired = payload.exp ? Date.now() >= payload.exp * 1000 : null;
  return { header, payload, signature: parts[2], rawHeader: parts[0], rawPayload: parts[1], expired };
}

function verifyJwt(token, secret) {
  token = String(token || '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return { verified: false, error: 'JWT 格式错误' };
  const header = decodeJwtPart(parts[0]);
  const algMap = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };
  const algorithm = algMap[header.alg];
  if (!algorithm) return { verified: false, error: '仅支持 HS256、HS384、HS512' };
  const signature = crypto.createHmac(algorithm, String(secret || '')).update(parts[0] + '.' + parts[1]).digest('base64url');
  try {
    const verified = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(parts[2]));
    return { verified, algorithm };
  } catch (_) {
    return { verified: false, error: '签名长度不匹配' };
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
  decodeJwt,
  verifyJwt
};

try { contextBridge.exposeInMainWorld('services', services); }
catch (_) { window.services = services; }

window.exports = {
  'plugin-market-jwt-inspector': {
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
