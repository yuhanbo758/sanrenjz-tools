'use strict';

const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const { randomBytes } = require('node:crypto');

function isPrivateAddress(address) {
  let value = String(address).toLowerCase();
  if (net.isIP(value) === 6) value = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  if (net.isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return !net.isIP(value) || /^(::|f[cd]|fe[89ab])/.test(value);
}

function validateMediaUrl(value) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || host === 'localhost' || host.endsWith('.localhost') || (net.isIP(host) && isPrivateAddress(host))) throw new Error('无效的公网媒体地址。');
  return url;
}

function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) return callback(new Error('拒绝访问内网媒体地址。'));
    const address = addresses.find(item => item.family === (options.family || 4)) || addresses[0];
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  });
}

function mediaHeaders(stream) {
  const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' };
  for (const [key, value] of Object.entries(stream.headers || {})) {
    if (/^(user-agent|referer|origin|accept|accept-language)$/i.test(key) && typeof value === 'string' && !/[\r\n]/.test(value)) headers[key] = value;
  }
  return headers;
}

function createMediaProxy(options = {}) {
  const lookup = options.lookup || publicLookup;
  const token = randomBytes(24).toString('hex');
  const routes = new Map();
  const requests = new Set();
  const sockets = new Set();
  let server = null, starting = null, closed = false;

  function forward(stream, request, response, address, redirects = 0) {
    let url;
    try { url = validateMediaUrl(address); } catch (_) { response.writeHead(502); response.end(); return; }
    // 仅转发解析器提供的防盗链头；不把宿主 Cookie、任意页面头或请求目标交给播放器。
    const headers = mediaHeaders(stream);
    if (request.headers.range) headers.Range = request.headers.range;
    const upstream = (url.protocol === 'https:' ? https : http).request(url, { method: request.method, headers, lookup, timeout: 20000 }, incoming => {
      if (incoming.statusCode >= 300 && incoming.statusCode < 400 && incoming.headers.location) {
        incoming.resume();
        if (redirects >= 4) { response.writeHead(502); response.end(); return; }
        try { forward(stream, request, response, new URL(incoming.headers.location, url).href, redirects + 1); }
        catch (_) { response.writeHead(502); response.end(); }
        return;
      }
      if (![200, 206].includes(incoming.statusCode)) { console.warn('媒体源返回错误', url.host, incoming.statusCode); incoming.resume(); response.writeHead(502); response.end(); return; }
      const outputHeaders = { 'Content-Type': stream.mime, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
      for (const key of ['content-length', 'content-range']) if (incoming.headers[key]) outputHeaders[key] = incoming.headers[key];
      response.writeHead(incoming.statusCode, outputHeaders);
      incoming.on('error', () => response.destroy());
      incoming.pipe(response);
    });
    requests.add(upstream);
    const deadline = setTimeout(() => upstream.destroy(new Error('媒体连接超时')), 20000);
    const abort = () => upstream.destroy();
    response.on('close', abort);
    upstream.on('close', () => { clearTimeout(deadline); requests.delete(upstream); response.removeListener('close', abort); });
    upstream.on('timeout', () => upstream.destroy(new Error('媒体请求超时')));
    upstream.on('error', error => { console.warn('媒体源请求失败', url.host, error.code || error.message); if (!response.headersSent) response.writeHead(502); response.end(); });
    upstream.end();
  }

  function loadPlaylist(stream, address = stream.url, redirects = 0) {
    const url = validateMediaUrl(address);
    return new Promise((resolve, reject) => {
      const req = (url.protocol === 'https:' ? https : http).request(url, { headers: mediaHeaders(stream), lookup, timeout: 15000 }, response => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          if (redirects >= 4) { reject(new Error('HLS 清单重定向过多，请到原站播放。')); return; }
          try { resolve(loadPlaylist(stream, new URL(response.headers.location, url).href, redirects + 1)); }
          catch (error) { reject(error); }
          return;
        }
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`HLS 清单返回 HTTP ${response.statusCode}，请重新解析或到原站播放。`)); return; }
        const chunks = [];
        let bytes = 0;
        response.on('data', chunk => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) req.destroy(new Error('HLS 清单超过大小限制。')); else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => resolve({ playlist: Buffer.concat(chunks).toString('utf8'), playlistBase: url.href }));
      });
      requests.add(req);
      const timer = setTimeout(() => req.destroy(new Error('HLS 清单加载超时。')), 20000);
      req.on('timeout', () => req.destroy(new Error('HLS 清单连接超时。')));
      req.on('error', () => reject(new Error('HLS 清单加载失败或已取消，请重新解析或到原站播放。')));
      req.on('close', () => { clearTimeout(timer); requests.delete(req); });
      req.end();
    });
  }

  async function start() {
    if (closed) throw new Error('播放器已关闭。');
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      server = http.createServer((request, response) => {
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
        const stream = routes.get(request.url.split('?')[0]);
        if (!stream) { response.writeHead(404); response.end(); return; }
        if (stream.body) {
          response.writeHead(200, { 'Content-Type': stream.mime, 'Content-Length': Buffer.byteLength(stream.body), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
          response.end(request.method === 'HEAD' ? undefined : stream.body); return;
        }
        if (requests.size >= 12) { response.writeHead(429); response.end(); return; }
        forward(stream, request, response, stream.url);
      });
      server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      server.requestTimeout = 30000;
      server.headersTimeout = 15000;
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        if (closed) { server.close(); reject(new Error('播放器已关闭。')); }
        else resolve(server.address().port);
      });
    });
    return starting;
  }

  return {
    async setPlayback(playback) {
      const port = await start();
      routes.clear();
      for (const request of requests) request.destroy();
      const video = playback.protocol === 'hls' && !playback.video.playlist ? { ...playback.video, ...await loadPlaylist(playback.video) } : playback.video;
      if (closed) throw new Error('播放器已关闭。');
      const key = randomBytes(8).toString('hex');
      const register = (kind, stream) => {
        if (!stream) return null;
        const route = `/${token}/${key}/${kind}`;
        if (stream.playlist) {
          const lines = stream.playlist.split(/\r?\n/);
          if (stream.playlist.length > 4 * 1024 * 1024 || lines.length > 20000 || !lines[0].startsWith('#EXTM3U')) throw new Error('HLS 播放清单无效或超过大小限制。');
          // 仅接受非加密媒体清单，所有分片经过已有的公网校验和防盗链代理；不让清单绕过代理访问任意地址。
          if (/#EXT-X-(?:STREAM-INF|MEDIA|MAP|KEY|SESSION-KEY):|URI\s*=/i.test(stream.playlist)) throw new Error('当前 HLS 清单包含不支持的加密、嵌套或独立音轨，请到原站播放。');
          let count = 0;
          const body = lines.map(line => {
            const value = line.trim();
            if (!value || value.startsWith('#')) return line;
            const url = validateMediaUrl(new URL(value, stream.playlistBase).href).href;
            const segment = `${route}/segment-${count++}`;
            routes.set(segment, { url, headers: stream.headers, mime: 'video/mp2t' });
            return `http://127.0.0.1:${port}${segment}`;
          }).join('\n');
          if (!count) throw new Error('HLS 清单没有可用分片。');
          routes.set(route, { body, mime: stream.mime });
        } else {
          validateMediaUrl(stream.url);
          routes.set(route, stream);
        }
        return `http://127.0.0.1:${port}${route}`;
      };
      return { title: playback.title, quality: playback.quality, pageUrl: playback.pageUrl, protocol: playback.protocol || 'mp4', videoUrl: register('video', video), audioUrl: register('audio', playback.audio) };
    },
    cancel() { for (const request of requests) request.destroy(); },
    stop() {
      closed = true; routes.clear();
      for (const request of requests) request.destroy();
      for (const socket of sockets) socket.destroy();
      if (server) server.close();
    }
  };
}

module.exports = { createMediaProxy, isPrivateAddress, validateMediaUrl, publicLookup };
