'use strict';

const https = require('node:https');

const API = 'https://mesh.if.iqiyi.com/player/lw/lwplay/accelerator.js';
const BASE_INFO = 'https://pcw-api.iqiyi.com/video/video/baseinfo/';
const EPISODE_LIST = 'https://pcw-api.iqiyi.com/albums/album/avlistinfo';
const PAGE_SIZE = 100;
const MAX_EPISODES = 500;

function videoIdFromUrl(input) {
  const url = new URL(input);
  const shared = url.searchParams.get('shareId') || url.searchParams.get('positiveId');
  if (shared) {
    const id = Buffer.from(shared, 'base64').toString('utf8');
    if (!/^\d{1,20}$/.test(id)) throw new Error('爱奇艺分享地址的视频 ID 无效。');
    return id;
  }
  const slug = url.pathname.match(/^\/[vwp]_([a-z0-9]+)\.html$/i)?.[1];
  if (!slug || slug.length > 16) throw new Error('当前爱奇艺解析支持单集播放页，请粘贴 v_ 开头的原站视频地址。');
  // 原站播放页使用 36 进制路径与固定掩码还原 ID；用 BigInt 避免普通位运算截断成 32 位。
  let encoded = 0n;
  for (const char of slug.toLowerCase()) encoded = encoded * 36n + BigInt(parseInt(char, 36));
  let id = encoded ^ 0x75706971676cn;
  if (id < 900000n) id = 100n * (id + 900000n);
  return id.toString();
}

function parseResponse(response, expectedId, pageUrl) {
  const info = response?.videoInfo;
  if (!info || String(info.tvId) !== expectedId) throw new Error('爱奇艺返回的视频与输入地址不一致，请到原站确认地址。');
  if (info.effective === false || info.isLock === true) throw new Error('爱奇艺视频已下线或需要原站权限，请到原站播放。');
  if (typeof response.ev !== 'string' || response.ev.length > 4 * 1024 * 1024) throw new Error('爱奇艺没有返回可用的播放信息，请到原站播放。');
  let decoded;
  try { decoded = JSON.parse(Array.from(response.ev, char => String.fromCharCode(char.charCodeAt(0) ^ 90)).join('')); }
  catch (_) { throw new Error('爱奇艺播放信息格式已变化，请到原站播放。'); }
  if (decoded.code !== 'A00000') throw new Error('爱奇艺未授权当前视频的播放，请到原站播放。');
  const videos = decoded.data?.program?.video;
  const available = (Array.isArray(videos) ? videos : []).filter(item => typeof item.m3u8 === 'string' && item.m3u8.startsWith('#EXTM3U') && !/#EXT-X-(?:KEY|SESSION-KEY):/i.test(item.m3u8));
  available.sort((a, b) => (Number(b.scrsz?.split('x')[1]) || Number(b.bid) || 0) - (Number(a.scrsz?.split('x')[1]) || Number(a.bid) || 0));
  const video = available[0];
  if (!video) throw new Error('爱奇艺未返回可直接播放的非加密 HLS 视频，可能需要登录或原站播放器。');
  const height = Number(video.scrsz?.split('x')[1]);
  return {
    title: String(info.title || '爱奇艺视频'), duration: Number(video.duration) || 0,
    quality: height ? `${height}P` : '原站 HLS', pageUrl, protocol: 'hls',
    video: { playlist: video.m3u8, headers: { Referer: pageUrl }, mime: 'application/vnd.apple.mpegurl' }, audio: null
  };
}

function metadataFromResponse(response, expectedId) {
  const info = response?.data;
  if (response?.code !== 'A00000' || !info || String(info.tvId) !== expectedId) throw new Error('爱奇艺剧集信息与输入地址不一致，请到原站确认地址。');
  if (info.effective === false) throw new Error('爱奇艺视频已下线，请到原站确认地址。');
  return info;
}

function episodeFromInfo(info) {
  try {
    const url = new URL(info.playUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || !(url.hostname === 'iqiyi.com' || url.hostname.endsWith('.iqiyi.com'))) return null;
    if (info.effective === false || (info.contentType != null && Number(info.contentType) !== 1) || videoIdFromUrl(url.href) !== String(info.tvId)) return null;
    url.protocol = 'https:';
    const duration = String(info.duration || '').split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);
    return { webpage_url: url.href, title: String(info.name || info.shortTitle || '爱奇艺视频'), duration: Number(info.durationSec) || duration, episode_number: Number(info.order) || 0, access_label: Number(info.payMark) > 0 ? '原站会员/付费标记' : '' };
  } catch (_) { return null; }
}

function createIqiyiService(options = {}) {
  const request = options.request || https.request;
  const active = new Set();
  let disposed = false;
  let generation = 0;

  async function getJson(url, pageUrl, task) {
    if (disposed) throw new Error('解析窗口已关闭。');
    if (task !== generation) throw new Error('已取消解析。');
    const data = await new Promise((resolve, reject) => {
      // 只调用原站公开接口，不发送 Cookie；响应中的用户信息和媒体签名均不落盘。
      const req = request(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: pageUrl }, timeout: 15000 }, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`爱奇艺接口返回 HTTP ${response.statusCode}，请稍后重试或到原站播放。`)); return; }
        let bytes = 0;
        const chunks = [];
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) req.destroy(new Error('爱奇艺播放信息超过大小限制。'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (_) { reject(new Error('爱奇艺接口返回了无效数据，请到原站播放。')); }
        });
      });
      active.add(req);
      const timer = setTimeout(() => req.destroy(new Error('爱奇艺解析超时，请重试或到原站播放。')), 20000);
      req.on('timeout', () => req.destroy(new Error('爱奇艺接口连接超时。')));
      req.on('error', error => reject(new Error(error.message.includes('爱奇艺') || error.message.includes('取消') ? error.message : '爱奇艺接口连接失败，请检查网络或到原站播放。')));
      req.on('close', () => { clearTimeout(timer); active.delete(req); });
      req.end();
    });
    if (task !== generation || disposed) throw new Error('已取消解析。');
    return data;
  }

  async function list(pageUrl) {
    const task = generation;
    const id = videoIdFromUrl(pageUrl);
    // 目录只读取原站元信息，不依赖当前集能否播放；粘贴会员集也可以先加载同一剧集的目录。
    const info = metadataFromResponse(await getJson(new URL(BASE_INFO + id), pageUrl, task), id);
    const current = episodeFromInfo(info);
    if (!current) throw new Error('爱奇艺没有返回当前视频的有效原站地址。');
    const title = String(info.albumName || info.name || '爱奇艺视频');
    const collectionKey = /^\d{1,20}$/.test(String(info.albumId)) && Number(info.albumId) > 0 ? `iqiyi:${info.albumId}` : '';
    const single = warning => ({ title, collectionKey, entries: [current], truncated: false, warning });
    if (!/^\d{1,20}$/.test(String(info.albumId)) || Number(info.albumId) <= 0 || [1, 5].includes(Number(info.channelId))) return single('原站返回的是单个视频，当前只加载这一项。');
    const entries = [], seen = new Set();
    let total = 0, truncated = false, partial = false;
    try {
      for (let page = 1; page <= MAX_EPISODES / PAGE_SIZE; page++) {
        const url = new URL(EPISODE_LIST);
        url.search = new URLSearchParams({ aid: String(info.albumId), page: String(page), size: String(PAGE_SIZE) }).toString();
        const response = await getJson(url, pageUrl, task);
        const data = response?.data;
        if (response?.code !== 'A00000' || String(data?.albumId) !== String(info.albumId) || !Array.isArray(data.epsodelist)) throw new Error('爱奇艺剧集目录格式已变化。');
        total = Math.max(total, Number(data.total) || 0);
        let added = 0;
        // 只使用正片 epsodelist，排除同一响应里的预告、花絮和推荐，不按集数自行生成地址。
        for (const raw of data.epsodelist.slice(0, PAGE_SIZE)) {
          const episode = episodeFromInfo(raw);
          if (!episode || seen.has(episode.webpage_url)) continue;
          seen.add(episode.webpage_url); entries.push(episode); added++;
        }
        if (!added && data.epsodelist.length) { partial = true; break; }
        if (data.epsodelist.length < PAGE_SIZE || (total > 0 && page * PAGE_SIZE >= total)) break;
        if (page * PAGE_SIZE === MAX_EPISODES) truncated = true;
      }
    } catch (error) {
      if (task !== generation || disposed) throw error;
      if (!entries.length) return single('剧集目录获取失败，仅保留输入的这一集。可重试或到原站选集。');
      partial = true;
    }
    if (!entries.length) return single('原站未返回正片目录，仅保留输入的这一集。可到原站选集。');
    entries.sort((a, b) => a.episode_number - b.episode_number);
    return { title, collectionKey, entries, truncated, warning: partial ? `剧集目录未完整取得，已保留 ${entries.length} 集。可重新加载或到原站选集。` : truncated ? '选集已达到 500 项上限，更多内容请到原站查看。' : '' };
  }

  async function resolve(pageUrl) {
    const id = videoIdFromUrl(pageUrl);
    const url = new URL(API);
    url.search = new URLSearchParams({ tvid: id, ad_cid: '', disableDRM: 'false', cpt: '0', apiVer: '3', format: 'json', timestamp: String(Date.now()) }).toString();
    const data = await getJson(url, pageUrl, generation);
    return parseResponse(data, id, pageUrl);
  }
  function cancel() { generation++; for (const req of active) req.destroy(new Error('已取消解析。')); }
  return { list, resolve, cancel, dispose: () => { disposed = true; cancel(); } };
}

module.exports = { videoIdFromUrl, parseResponse, metadataFromResponse, episodeFromInfo, createIqiyiService };
