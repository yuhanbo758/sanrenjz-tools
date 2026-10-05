'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');
const { createIqiyiService } = require('./iqiyi-service');

const ENGINE = path.join(__dirname, 'vendor', 'yt-dlp.pyz');
const PLATFORMS = [
  { id: 'bilibili', name: 'B 站', hosts: ['bilibili.com', 'b23.tv'], parse: true },
  { id: 'tencent', name: '腾讯视频', hosts: ['v.qq.com'], parse: true },
  { id: 'iqiyi', name: '爱奇艺', hosts: ['iqiyi.com'], parse: true },
  { id: 'youku', name: '优酷', hosts: ['youku.com'], parse: true },
  { id: 'tudou', name: '土豆', hosts: ['tudou.com'], parse: true },
  { id: 'mango', name: '芒果 TV', hosts: ['mgtv.com'], parse: true },
  { id: 'hongguo', name: '红果短剧', hosts: ['hongguoduanju.com', 'novelquickapp.com', 'changdunovel.com'], parse: false }
];

function normalizeInput(input) {
  const text = String(input || '').trim();
  const match = text.match(/https?:\/\/[^\s<>"'，。；！）》】]+/i);
  if (!match) throw new Error('请粘贴完整的视频或剧集网页地址。');
  const url = new URL(match[0]);
  if (url.username || url.password || url.port || url.href.length > 5000) throw new Error('视频网页地址格式不正确。');
  const platform = PLATFORMS.find(item => item.hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)));
  if (!platform) throw new Error('仅支持 B 站、腾讯、爱奇艺、优酷、土豆、芒果和红果的原站网页地址。');
  url.hash = '';
  return { url: url.href, platform };
}

function listUrl(input) {
  const parsed = normalizeInput(input);
  const url = new URL(parsed.url);
  // 单集地址带剧集 ID 时先尝试整个目录，避免下一集又要粘贴网址。
  if (parsed.platform.id === 'bilibili' && /^\/video\//.test(url.pathname)) url.searchParams.delete('p');
  if (parsed.platform.id === 'tencent') {
    const cover = url.pathname.match(/^\/x\/cover\/([\w]+)(?:\/|\.html)/);
    if (cover) { url.pathname = `/x/cover/${cover[1]}.html`; url.search = ''; }
  }
  return url.href;
}

function normalizeCollection(data, sourceUrl) {
  const entries = Array.isArray(data.entries) ? data.entries : [data];
  const episodes = [];
  for (const entry of entries.slice(0, 500)) {
    if (!entry) continue;
    const rawUrl = entry.webpage_url || (entry._type === 'url' ? entry.url : sourceUrl);
    let url;
    try { url = normalizeInput(rawUrl).url; } catch (_) { continue; }
    if (episodes.some(item => item.url === url)) continue;
    episodes.push({ id: randomUUID(), url, title: String(entry.title || `第 ${episodes.length + 1} 集 / P`), duration: Number(entry.duration) || 0, number: Number(entry.episode_number) || episodes.length + 1, accessLabel: String(entry.access_label || '') });
  }
  if (!episodes.length) throw new Error('解析器没有返回可用的选集，原站页面可能已改版或受到访问限制。');
  return { title: String(data.title || normalizeInput(sourceUrl).platform.name), sourceUrl, collectionKey: data.collectionKey || '', episodes, truncated: typeof data.truncated === 'boolean' ? data.truncated : entries.length >= 500 };
}

function choosePlayback(data) {
  if (data.has_drm === true) throw new Error('该视频有 DRM 保护，请到原站播放。');
  const formats = (data.formats || []).filter(item => item.url && !item.has_drm && /^https?:$/.test(new URL(item.url).protocol));
  const progressive = formats.filter(item => item.ext === 'mp4' && (!item.vcodec || /^(avc[13]|h264)/i.test(item.vcodec)) && item.acodec !== 'none' && (!item.protocol || /^https?$/.test(item.protocol)));
  const videos = formats.filter(item => item.ext === 'mp4' && /^avc[13]/i.test(item.vcodec || '') && item.acodec === 'none' && /^https?$/.test(item.protocol || 'https'));
  const audio = formats.filter(item => item.vcodec === 'none' && /^(m4a|mp4)$/.test(item.ext || '') && /^https?$/.test(item.protocol || 'https'));
  const score = item => (Number(item.height) || 0) * 100000 + (Number(item.tbr) || Number(item.abr) || 0);
  const sorted = items => [...items].sort((a, b) => score(b) - score(a));
  const video = sorted(progressive)[0] || sorted(videos)[0];
  if (!video) {
    const hls = sorted(formats.filter(item => item.ext === 'mp4' && /^m3u8/.test(item.protocol || '') && item.vcodec !== 'none' && (!item.vcodec || /^(avc[13]|h264)/i.test(item.vcodec))))[0];
    if (hls) return { title: String(data.title || ''), quality: hls.height ? `${hls.height}P` : '原站 HLS', protocol: 'hls', video: { url: hls.url, headers: { ...data.http_headers, ...hls.http_headers }, mime: 'application/vnd.apple.mpegurl' }, audio: null };
    throw new Error('当前只有插件不能直接播放的流格式，请到原站播放。');
  }
  const selectedAudio = video.acodec === 'none' ? sorted(audio)[0] : null;
  if (video.acodec === 'none' && !selectedAudio) throw new Error('未取得完整音轨，请到原站播放。');
  const stream = item => ({ url: item.url, headers: { ...data.http_headers, ...item.http_headers }, mime: item.vcodec === 'none' ? 'audio/mp4' : 'video/mp4' });
  return { title: String(data.title || ''), quality: video.height ? `${video.height}P` : '原始画质', video: stream(video), audio: selectedAudio ? stream(selectedAudio) : null };
}

function createParserService(options = {}) {
  const spawnProcess = options.spawn || spawn;
  const iqiyi = options.iqiyi || createIqiyiService();
  const active = new Set();
  let python = null;
  let busy = false;
  let disposed = false;
  let collection = null;

  function run(command, args, timeout = 60000) {
    return new Promise((resolve, reject) => {
      if (disposed) { reject(new Error('解析窗口已关闭。')); return; }
      const child = spawnProcess(command, args, { windowsHide: true, shell: false, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
      active.add(child);
      let out = '', err = '', bytes = 0, settled = false;
      const outputDecoder = new StringDecoder('utf8'), errorDecoder = new StringDecoder('utf8');
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); active.delete(child);
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => { child.kill(); finish(new Error('解析超时，可重试或到原站播放。')); }, timeout);
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) { child.kill(); finish(new Error('解析结果超过安全大小限制。')); }
        else out += outputDecoder.write(chunk);
      });
      child.stderr.on('data', chunk => { err = (err + errorDecoder.write(chunk)).slice(-4000); });
      child.on('error', error => finish(error));
      child.on('close', code => {
        out += outputDecoder.end(); err += errorDecoder.end();
        if (code !== 0) {
          const reason = /DRM/i.test(err) ? '视频受到 DRM 保护。' : /login|sign.in|premium|会员/i.test(err) ? '此视频需要原站登录或相应权限。' : /Unsupported URL/i.test(err) ? '开源解析器暂不支持这个页面地址。' : '原站接口、网络或视频权限导致解析失败。';
          finish(new Error(`${reason} 可到原站播放。`));
        } else finish(null, out);
      });
    });
  }

  async function detectPython(customPath = '') {
    const candidates = customPath ? [{ command: customPath, args: [] }] : [{ command: 'python', args: [] }, { command: 'python3', args: [] }, ...(process.platform === 'win32' ? [{ command: 'py', args: ['-3'] }] : [])];
    for (const candidate of candidates) {
      try {
        const output = await run(candidate.command, [...candidate.args, '-I', '-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3]); sys.exit(0 if sys.version_info >= (3,10) else 1)'], 8000);
        python = candidate;
        return { available: true, version: output.trim(), command: candidate.command };
      } catch (_) { /* 自动探测失败后只尝试下一个解释器，不修改系统环境。 */ }
    }
    python = null;
    return { available: false, message: '需要 Python 3.10 或更高版本。可安装 Python，或在设置中选择现有 python.exe。' };
  }

  async function extract(url, flat) {
    if (!python) { const status = await detectPython(); if (!status.available) throw new Error(status.message); }
    const output = await run(python.command, [...python.args, '-I', ENGINE, '--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--skip-download', '--dump-single-json', '--socket-timeout', '12', '--retries', '0', '--extractor-retries', '0', '--use-extractors', 'Bili.*,VQQ.*,Iqiyi.*,Youku.*,MangoTV.*', ...(flat ? ['--flat-playlist', '--playlist-end', '500'] : ['--no-playlist']), '--', url]);
    try { return JSON.parse(output); } catch (_) { throw new Error('开源解析器返回了无效结果。'); }
  }

  async function exclusive(work) {
    if (busy) throw new Error('正在解析，请等待完成或取消。');
    busy = true;
    try { return await work(); } finally { busy = false; }
  }

  return {
    detectPython,
    list: input => exclusive(async () => {
      collection = null;
      const parsed = normalizeInput(input);
      if (!parsed.platform.parse) throw new Error('红果短剧尚未接入可靠的开源直链解析，当前请使用“原站播放”。');
      if (parsed.platform.id === 'iqiyi') {
        const directory = await iqiyi.list(parsed.url);
        collection = normalizeCollection(directory, parsed.url);
        return { ...collection, platform: parsed.platform.name, warning: directory.warning || '' };
      }
      const directoryUrl = listUrl(parsed.url);
      let warning = '';
      try { collection = normalizeCollection(await extract(directoryUrl, true), parsed.url); }
      catch (error) {
        if (directoryUrl === parsed.url) throw error;
        const data = await extract(parsed.url, false);
        collection = normalizeCollection(data, parsed.url);
        warning = '剧集目录获取失败，仅取得输入的这一集。可在原站选集。';
      }
      return { ...collection, platform: parsed.platform.name, warning };
    }),
    resolve: id => exclusive(async () => {
      const episode = collection?.episodes.find(item => item.id === id);
      if (!episode) throw new Error('选集已失效，请重新加载目录。');
      if (normalizeInput(episode.url).platform.id === 'iqiyi') return { ...await iqiyi.resolve(episode.url), title: episode.title };
      return { ...choosePlayback(await extract(episode.url, false)), pageUrl: episode.url };
    }),
    cancel: () => { iqiyi.cancel(); for (const child of active) child.kill(); },
    dispose: () => { disposed = true; iqiyi.dispose(); for (const child of active) child.kill(); collection = null; }
  };
}

module.exports = { createParserService, normalizeInput, listUrl, normalizeCollection, choosePlayback };
