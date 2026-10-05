'use strict';

const { normalizeInput } = require('./parser-service');
const MAX_HISTORY = 50, MAX_FAVORITES = 100, MAX_EPISODES = 500;
const text = value => String(value || '').slice(0, 240);
const seconds = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(604800, Number(value))) : 0;
const timestamp = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const copy = value => JSON.parse(JSON.stringify(value));

function pageUrl(input) {
  const url = new URL(normalizeInput(input).url);
  url.protocol = 'https:';
  // 只持久化原站页面及定位视频的参数，丢弃分享追踪参数和临时媒体地址。
  for (const key of [...url.searchParams.keys()]) if (!['p', 'vid', 'cid', 'tvid', 'albumId', 'shareId', 'positiveId'].includes(key)) url.searchParams.delete(key);
  return url.href;
}

function episodeData(raw) {
  try { return { url: pageUrl(raw.url), title: text(raw.title), number: Math.max(1, Math.floor(seconds(raw.number) || 1)), duration: seconds(raw.duration), accessLabel: text(raw.accessLabel) }; }
  catch (_) { return null; }
}

function collectionData(raw) {
  const sourceUrl = pageUrl(raw.sourceUrl);
  const episodes = [], seen = new Set();
  for (const rawEpisode of (Array.isArray(raw.episodes) ? raw.episodes : []).slice(0, MAX_EPISODES)) {
    const episode = episodeData(rawEpisode);
    if (!episode || seen.has(episode.url)) continue;
    if (!rawEpisode.number) episode.number = episodes.length + 1;
    seen.add(episode.url); episodes.push(episode);
  }
  if (!episodes.length) throw new Error('没有可保存的原站选集。');
  const key = /^iqiyi:[1-9]\d{0,19}$/.test(raw.collectionKey || '') ? raw.collectionKey : episodes[0].url;
  return { key, sourceUrl, title: text(raw.title) || '视频选集', platform: text(raw.platform), episodes };
}

function normalizeLibrary(raw) {
  if (raw == null) return { version: 1, items: [] };
  if (raw.version !== 1 || !Array.isArray(raw.items)) throw new Error('播放记录格式无法识别，已保留原数据；请检查插件数据。');
  const items = [], keys = new Set();
  for (const rawItem of raw.items.slice(0, MAX_HISTORY + MAX_FAVORITES)) {
    try {
      const collection = collectionData({ ...rawItem, collectionKey: rawItem.key });
      if (keys.has(collection.key)) continue;
      keys.add(collection.key);
      const allowed = new Set(collection.episodes.map(episode => episode.url));
      const progress = [];
      for (const entry of (Array.isArray(rawItem.progress) ? rawItem.progress : []).slice(0, MAX_EPISODES)) {
        let url; try { url = pageUrl(entry.url); } catch (_) { continue; }
        if (!allowed.has(url) || progress.some(item => item.url === url)) continue;
        progress.push({ url, position: seconds(entry.position), duration: seconds(entry.duration), completed: entry.completed === true, updatedAt: timestamp(entry.updatedAt) });
      }
      let lastEpisodeUrl = ''; try { lastEpisodeUrl = pageUrl(rawItem.lastEpisodeUrl); } catch (_) {}
      items.push({ ...collection, progress, lastEpisodeUrl: allowed.has(lastEpisodeUrl) ? lastEpisodeUrl : '', favorite: rawItem.favorite === true, addedAt: timestamp(rawItem.addedAt), openedAt: timestamp(rawItem.openedAt), playedAt: timestamp(rawItem.playedAt) });
    } catch (_) { /* 单个过期或无效条目不能阻止其余原站记录加载。 */ }
  }
  return prune({ version: 1, items });
}

function prune(library) {
  const favorites = library.items.filter(item => item.favorite).sort((a, b) => b.addedAt - a.addedAt).slice(0, MAX_FAVORITES);
  const history = library.items.filter(item => item.openedAt).sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_HISTORY);
  const keep = new Set([...favorites, ...history].map(item => item.key));
  library.items = library.items.filter(item => keep.has(item.key));
  for (const item of library.items) if (!history.includes(item)) item.openedAt = 0;
  return library;
}

function remember(library, raw, now) {
  const collection = collectionData(raw);
  let item = library.items.find(entry => entry.key === collection.key);
  if (!item) { item = { ...collection, progress: [], lastEpisodeUrl: '', favorite: false, addedAt: now, openedAt: now, playedAt: 0 }; library.items.push(item); }
  else {
    // 重新解析只刷新原站目录；已保存进度按稳定页面 URL 对齐，不使用已失效的随机选集 ID。
    if (raw.warning || raw.truncated) {
      const fresh = new Set(collection.episodes.map(episode => episode.url));
      collection.episodes = [...collection.episodes, ...item.episodes.filter(episode => !fresh.has(episode.url))].slice(0, MAX_EPISODES).sort((a, b) => a.number - b.number);
    }
    const allowed = new Set(collection.episodes.map(episode => episode.url));
    item.progress = item.progress.filter(entry => allowed.has(entry.url));
    if (!allowed.has(item.lastEpisodeUrl)) item.lastEpisodeUrl = '';
    Object.assign(item, collection, { openedAt: now });
  }
  prune(library);
  return item;
}

function createLibraryStore(options) {
  let state = null, loading = null, queue = Promise.resolve();
  const now = options.now || Date.now;
  async function load() {
    if (state) return state;
    if (!loading) loading = Promise.resolve().then(options.get).then(value => { state = normalizeLibrary(value); return state; }).catch(error => { loading = null; throw error; });
    return loading;
  }
  function mutate(work) {
    // 所有写入按顺序完成，避免较慢的旧进度覆盖新进度、取消收藏或删除操作。
    const result = queue.catch(() => {}).then(async () => {
      await load(); work(state);
      if (await options.set(copy(state)) === false) throw new Error('插件存储写入失败，当前更改尚未保存。');
      return copy(state);
    });
    queue = result;
    return result;
  }
  return {
    get: async () => copy(await load()),
    remember: raw => mutate(library => { remember(library, raw, now()); }),
    favorite: (key, value) => mutate(library => {
      const item = library.items.find(entry => entry.key === key);
      if (!item) throw new Error('记录已失效，请重新加载选集。');
      if (value && !item.favorite && library.items.filter(entry => entry.favorite).length >= MAX_FAVORITES) throw new Error('收藏已达到 100 项，请先取消部分收藏。');
      item.favorite = value === true;
      if (item.favorite) item.addedAt = now();
      prune(library);
    }),
    progress: raw => mutate(library => {
      const item = library.items.find(entry => entry.key === raw.key);
      if (!item) return;
      const url = pageUrl(raw.url);
      if (!item.episodes.some(entry => entry.url === url)) throw new Error('播放集数与记录不一致。');
      let entry = item.progress.find(entry => entry.url === url);
      if (!entry) { entry = { url }; item.progress.push(entry); }
      Object.assign(entry, { position: seconds(raw.position), duration: seconds(raw.duration), completed: raw.completed === true, updatedAt: now() });
      item.lastEpisodeUrl = url; item.playedAt = now(); item.openedAt = now();
      prune(library);
    }),
    removeHistory: key => mutate(library => {
      for (const item of library.items) if (key === null || item.key === key) { item.openedAt = 0; item.playedAt = 0; item.progress = []; item.lastEpisodeUrl = ''; }
      prune(library);
    }),
    flush: () => mutate(() => {})
  };
}

module.exports = { pageUrl, collectionData, normalizeLibrary, createLibraryStore };
