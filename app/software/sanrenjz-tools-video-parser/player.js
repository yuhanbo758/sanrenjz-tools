'use strict';

const $ = selector => document.querySelector(selector);
const api = window.videoAPI;
const HlsPlayer = window.Hls || (typeof require === 'function' ? require('./vendor/hls.light.min.js') : null);
const video = $('#player'), audio = $('#audioTrack');
let episodes = [], selected = -1, busy = false, playbackPage = '', sourceText = '', generation = 0;
let settings = { pythonPath: '', autoNext: false };
let startupTimer = null;
let hls = null;
let library = { version: 1, items: [] }, currentKey = '', libraryReady = false, libraryBusy = false;
let recording = false, finished = false, lastCheckpoint = 0, resumeTarget = null, lastCheckpointEntry = '', currentCollection = null;

function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
function errorMessage(error) { return String(error?.message || error).replace(/^Error:\s*/, ''); }
function refreshControls() {
  $('#loadBtn').disabled = busy;
  $('#pasteBtn').disabled = busy;
  $('#pickPythonBtn').disabled = busy;
  $('#resetPythonBtn').disabled = busy;
  $('#cancelBtn').hidden = !busy;
  $('#prevBtn').disabled = busy || selected <= 0;
  $('#nextBtn').disabled = busy || selected < 0 || selected >= episodes.length - 1;
  for (const button of document.querySelectorAll('.episode')) button.disabled = busy;
  $('#favoriteBtn').disabled = busy || libraryBusy || !libraryReady || !currentKey;
  $('#clearHistoryBtn').disabled = libraryBusy || !library.items.some(item => item.openedAt);
  for (const button of document.querySelectorAll('.library-actions button')) button.disabled = busy || libraryBusy;
}
function setBusy(value) { busy = value; refreshControls(); }
function stopMedia() {
  checkpoint(true);
  recording = false; resumeTarget = null;
  clearTimeout(startupTimer);
  if (hls) { hls.destroy(); hls = null; }
  video.pause(); audio.pause();
  for (const media of [video, audio]) { media.removeAttribute('src'); media.load(); }
  video.hidden = true; $('#empty').hidden = false;
}
function currentItem() { return library.items.find(item => item.key === currentKey); }
function progressFor(episode) { return currentItem()?.progress.find(entry => entry.url === api.pageKey(episode.url)); }
function timeLabel(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function showSide(view) {
  for (const name of ['episodes', 'history', 'favorites']) {
    const active = name === view;
    $(`#${name}Tab`).classList.toggle('active', active); $(`#${name}Tab`).setAttribute('aria-pressed', String(active));
    $(`#${name === 'episodes' ? 'collection' : name}View`).hidden = !active;
  }
}
function libraryError(error) {
  lastCheckpointEntry = '';
  $('#libraryStatus').textContent = `记录/收藏保存或读取失败：${errorMessage(error)}`;
  $('#libraryStatus').classList.add('error'); $('#retryLibraryBtn').hidden = false;
}
async function updateLibrary(work, lock = false) {
  if (lock && libraryBusy) return;
  if (lock) { libraryBusy = true; refreshControls(); }
  try {
    library = await work(); libraryReady = true;
    $('#libraryStatus').textContent = ''; $('#libraryStatus').classList.remove('error'); $('#retryLibraryBtn').hidden = true;
    renderLibrary(); renderEpisodes();
  } catch (error) {
    try { library = await api.getLibrary(); renderLibrary(); } catch (_) {}
    libraryError(error);
  } finally { if (lock) libraryBusy = false; refreshControls(); }
}
function checkpoint(force = false, completed = false) {
  if (!recording || !libraryReady || !currentKey || !episodes[selected] || resumeTarget) return;
  if (!force && Date.now() - lastCheckpoint < 5000) return;
  lastCheckpoint = Date.now();
  const progress = { key: currentKey, url: episodes[selected].url, position: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0, completed: completed || finished || video.ended };
  const entry = `${progress.key}|${progress.url}|${Math.floor(progress.position * 10)}|${Math.floor(progress.duration)}|${progress.completed}`;
  if (entry === lastCheckpointEntry) return;
  lastCheckpointEntry = entry;
  return updateLibrary(() => api.saveProgress(progress));
}
function renderLibrary() {
  const history = library.items.filter(item => item.openedAt).sort((a, b) => b.openedAt - a.openedAt);
  const favorites = library.items.filter(item => item.favorite).sort((a, b) => b.addedAt - a.addedAt);
  $('#historyTab').textContent = `记录${history.length ? ` ${history.length}` : ''}`;
  $('#favoritesTab').textContent = `收藏${favorites.length ? ` ${favorites.length}` : ''}`;
  const saved = !!currentItem()?.favorite;
  $('#favoriteBtn').textContent = saved ? '★ 已收藏' : '☆ 收藏'; $('#favoriteBtn').classList.toggle('saved', saved); $('#favoriteBtn').setAttribute('aria-pressed', String(saved));
  for (const [view, items] of [['history', history], ['favorites', favorites]]) {
    const list = $(`#${view}List`); list.replaceChildren();
    if (!items.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = view === 'history' ? '加载过的选集和播放进度会保存在这里。' : '加载选集后点击“☆ 收藏”，下次无需再次粘贴地址。'; list.append(empty); }
    for (const item of items) {
      const card = document.createElement('article'); card.className = 'library-card'; card.dataset.key = item.key;
      const title = document.createElement('strong'); title.className = 'library-title'; title.textContent = item.title;
      const meta = document.createElement('span'); meta.className = 'library-meta';
      const last = item.episodes.find(episode => episode.url === item.lastEpisodeUrl);
      const progress = item.progress.find(entry => entry.url === item.lastEpisodeUrl);
      const watched = item.progress.filter(entry => entry.completed).length;
      meta.textContent = `${item.platform} · ${item.episodes.length} 集 / P · 已看完 ${watched} 集\n${last ? `${last.title} · ${progress?.completed ? '已看完' : `看到 ${timeLabel(progress?.position)}`}` : '尚未播放'}`;
      meta.style.whiteSpace = 'pre-line';
      const actions = document.createElement('div'); actions.className = 'library-actions';
      const action = (label, name, callback) => { const button = document.createElement('button'); button.textContent = label; button.dataset.action = name; button.addEventListener('click', callback); actions.append(button); };
      if (view === 'history' || last) action(progress?.completed ? watched >= item.episodes.length ? '重新观看' : '下一未看集' : last ? '继续观看' : '开始播放', 'resume', () => openSaved(item, true));
      action('加载选集', 'directory', () => openSaved(item, false));
      if (view === 'history') action('删除记录', 'remove', () => updateLibrary(() => api.removeHistory(item.key), true));
      else action('取消收藏', 'unfavorite', () => updateLibrary(() => api.setFavorite(item.key, false), true));
      card.append(title, meta, actions); list.append(card);
    }
  }
  refreshControls();
}
async function openSaved(item, resume) {
  if (busy || libraryBusy) return;
  let target = item.episodes.find(episode => episode.url === item.lastEpisodeUrl) || item.episodes[0];
  let progress = item.progress.find(entry => entry.url === target.url);
  if (progress?.completed) {
    const index = item.episodes.indexOf(target);
    target = [...item.episodes.slice(index + 1), ...item.episodes.slice(0, index + 1)].find(episode => !item.progress.find(entry => entry.url === episode.url)?.completed) || target;
    progress = item.progress.find(entry => entry.url === target.url);
  }
  $('#sourceInput').value = item.sourceUrl;
  await loadCollection(resume ? { resumeUrl: target.url, position: progress?.completed ? 0 : progress?.position || 0 } : {});
}
function renderEpisodes() {
  const container = $('#episodeList'); container.replaceChildren();
  const query = $('#episodeFilter').value.trim().toLowerCase();
  episodes.forEach((episode, index) => {
    if (query && !`${episode.number || index + 1} ${episode.title}`.toLowerCase().includes(query)) return;
    const button = document.createElement('button');
    button.className = `episode${index === selected ? ' active' : ''}`;
    button.dataset.index = index;
    button.textContent = episode.title;
    const progress = progressFor(episode);
    const number = document.createElement('small'); number.textContent = `#${episode.number || index + 1}${episode.duration ? ` · ${Math.floor(episode.duration / 60)} 分 ${Math.round(episode.duration % 60)} 秒` : ''}${episode.accessLabel ? ` · ${episode.accessLabel}` : ''} · ${progress ? progress.completed ? '已看完' : `看到 ${timeLabel(progress.position)}` : '未播放'}`;
    button.append(number); button.addEventListener('click', () => playEpisode(index)); container.append(button);
  });
  refreshControls();
}
async function loadCollection(options = {}) {
  if (busy) return;
  const task = ++generation;
  stopMedia(); episodes = []; selected = -1; playbackPage = ''; currentKey = ''; currentCollection = null; showSide('episodes');
  sourceText = $('#sourceInput').value.trim();
  $('#episodeFilter').value = ''; $('#collectionTitle').textContent = '选集目录'; $('#episodeCount').textContent = '正在加载'; $('#nowTitle').textContent = '未选择视频'; renderEpisodes();
  setBusy(true); status('正在获取选集目录…');
  try {
    const result = await api.list(sourceText);
    if (task !== generation) return;
    episodes = result.episodes; currentCollection = result; $('#collectionTitle').textContent = result.title;
    if (libraryReady) {
      currentKey = api.libraryKey(result);
      await updateLibrary(() => api.rememberCollection(result));
      if (task !== generation) return;
    }
    $('#episodeCount').textContent = `${episodes.length} 集 / P${result.truncated ? '（最多 500 项）' : ''}`;
    status(result.warning || `${result.platform} · 已取得 ${episodes.length} 个选集，点击一集开始播放。`, !!result.warning);
    renderEpisodes();
  } catch (error) {
    if (task !== generation) return;
    $('#episodeCount').textContent = '未取得选集'; status(errorMessage(error), true);
    const message = document.createElement('p'); message.className = 'muted'; message.textContent = '可使用“原站播放”查看原站选集。'; $('#episodeList').replaceChildren(message);
  } finally { setBusy(false); }
  if (task === generation && options.resumeUrl && episodes.length) {
    const index = episodes.findIndex(episode => api.pageKey(episode.url) === options.resumeUrl);
    if (index >= 0) await playEpisode(index, options.position);
    else status('上次观看的集数不在当前返回的目录中，请重新选择或到原站播放。', true);
  }
}
async function playEpisode(index, position = null) {
  if (busy || !episodes[index]) return;
  const task = ++generation;
  stopMedia(); finished = false; selected = index; playbackPage = episodes[index].url;
  const savedProgress = progressFor(episodes[index]);
  const resumePosition = position === null ? savedProgress?.completed ? 0 : savedProgress?.position || 0 : position;
  resumeTarget = resumePosition > 0 ? { task, position: resumePosition } : null;
  $('#nowTitle').textContent = episodes[index].title; renderEpisodes();
  setBusy(true); status(`正在解析第 ${index + 1} 集 / P…`);
  try {
    const result = await api.play(episodes[index].id);
    if (task !== generation) return;
    playbackPage = result.pageUrl;
    $('#nowTitle').textContent = result.title || episodes[index].title;
    video.hidden = false; $('#empty').hidden = true;
    if (result.audioUrl) audio.src = result.audioUrl;
    if (result.protocol === 'hls') {
      if (!HlsPlayer?.isSupported()) throw new Error('当前客户端不支持 HLS 播放，请到原站播放。');
      hls = new HlsPlayer({ enableWorker: false, maxBufferLength: 20, backBufferLength: 15, emeEnabled: false });
      hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
        if (task === generation && data.fatal) { video.pause(); status('HLS 媒体读取或解码失败，请重新选择本集或到原站播放。', true); }
      });
      hls.loadSource(result.videoUrl); hls.attachMedia(video);
    } else video.src = result.videoUrl;
    video.playbackRate = Number($('#speed').value); audio.playbackRate = video.playbackRate;
    status(`已取得 ${result.quality} 视频，正在缓冲…`);
    startupTimer = setTimeout(() => {
      if (task === generation && video.readyState < 2) status('媒体加载超时，可重新选择本集或到原站播放。', true);
    }, 25000);
    // play() 在网络缓冲时可能一直挂起，不能让它锁住选集与取消按钮。
    video.play().catch(error => {
      if (task !== generation) return;
      if (error.name === 'NotAllowedError' && !video.error) status('已加载视频，点击播放器的播放按钮开始。');
      else if (video.error || error.name === 'NotSupportedError') status('媒体读取或解码失败，点击原站播放；重新选择本集可刷新过期链接。', true);
    });
  } catch (error) {
    if (task === generation) status(errorMessage(error), true);
  } finally { setBusy(false); }
}

function syncAudio(force = false) {
  if (!audio.getAttribute('src')) return;
  if (force || Math.abs(audio.currentTime - video.currentTime) > 0.35) {
    try { audio.currentTime = video.currentTime; } catch (_) { /* 音轨元数据尚未加载时，等下一次同步。 */ }
  }
  audio.playbackRate = video.playbackRate; audio.volume = video.volume; audio.muted = video.muted;
}
async function playAudio() {
  syncAudio(true);
  if (audio.getAttribute('src')) {
    try { await audio.play(); } catch (_) { if (!video.paused) status('音轨未能播放，可重新选择本集或到原站播放。', true); }
  }
}
function applyResume() {
  // 新媒体元数据就绪后再恢复秒数，同时对齐独立音轨；超出当前时长的旧进度要截到有效范围。
  if (!resumeTarget || resumeTarget.task !== generation || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const position = Math.min(resumeTarget.position, Math.max(0, video.duration - 1));
  resumeTarget = null; video.currentTime = position; syncAudio(true);
}
video.addEventListener('loadedmetadata', applyResume);
video.addEventListener('durationchange', applyResume);
// 只有媒体真正播放后才记录观看进度，加载目录或解析失败不会标记为已观看。
video.addEventListener('playing', () => { applyResume(); recording = true; clearTimeout(startupTimer); status(`正在播放第 ${episodes[selected]?.number || selected + 1} 集 / P`); playAudio(); checkpoint(true); });
video.addEventListener('pause', () => { audio.pause(); if (recording && !video.error) status(`已暂停第 ${episodes[selected]?.number || selected + 1} 集 / P`); checkpoint(true); });
video.addEventListener('waiting', () => { audio.pause(); status('视频缓冲中…'); });
video.addEventListener('seeking', () => { audio.pause(); syncAudio(true); });
video.addEventListener('seeked', () => { if (!video.ended) finished = false; syncAudio(true); checkpoint(true); if (!video.paused) playAudio(); });
video.addEventListener('timeupdate', () => { syncAudio(); checkpoint(); });
video.addEventListener('volumechange', () => syncAudio());
video.addEventListener('ratechange', () => syncAudio());
audio.addEventListener('loadedmetadata', () => syncAudio(true));
for (const media of [video, audio]) media.addEventListener('error', () => {
  if (media.getAttribute('src')) { video.pause(); audio.pause(); status('媒体读取或解码失败，点击原站播放；重新选择本集可刷新过期链接。', true); }
});
video.addEventListener('ended', () => { finished = true; audio.pause(); checkpoint(true, true); if (settings.autoNext && selected + 1 < episodes.length) playEpisode(selected + 1); });
$('#speed').addEventListener('change', () => { video.playbackRate = Number($('#speed').value); syncAudio(); });
$('#loadBtn').addEventListener('click', () => loadCollection());
$('#sourceInput').addEventListener('keydown', event => { if (event.key === 'Enter') loadCollection(); });
$('#pasteBtn').addEventListener('click', async () => { try { $('#sourceInput').value = await api.clipboardText(); } catch (error) { status(errorMessage(error), true); } });
$('#originalBtn').addEventListener('click', async () => {
  const input = $('#sourceInput').value.trim();
  try { await api.openOriginal(input !== sourceText ? input : playbackPage || input); } catch (error) { status(errorMessage(error), true); }
});
$('#prevBtn').addEventListener('click', () => playEpisode(selected - 1));
$('#nextBtn').addEventListener('click', () => playEpisode(selected + 1));
$('#episodeFilter').addEventListener('input', renderEpisodes);
$('#cancelBtn').addEventListener('click', () => { generation++; api.cancel(); status('已取消解析。'); });
for (const name of ['episodes', 'history', 'favorites']) $(`#${name}Tab`).addEventListener('click', () => showSide(name));
$('#favoriteBtn').addEventListener('click', () => updateLibrary(async () => {
  const saved = !!currentItem()?.favorite;
  if (!currentItem()) await api.rememberCollection(currentCollection);
  return api.setFavorite(currentKey, !saved);
}, true));
$('#clearHistoryBtn').addEventListener('click', () => {
  if ($('#clearHistoryBtn').dataset.confirm !== 'yes') { $('#clearHistoryBtn').dataset.confirm = 'yes'; $('#clearHistoryBtn').textContent = '确认清空'; $('#libraryStatus').textContent = '再次点击确认清空播放记录及进度；收藏会保留。'; return; }
  $('#clearHistoryBtn').dataset.confirm = ''; $('#clearHistoryBtn').textContent = '清空记录'; updateLibrary(() => api.removeHistory(null), true);
});
$('#retryLibraryBtn').addEventListener('click', () => updateLibrary(async () => {
  const saved = libraryReady ? await api.retryLibrarySave() : await api.getLibrary();
  if (currentCollection && (!currentKey || !saved.items.some(item => item.key === currentKey))) { currentKey = api.libraryKey(currentCollection); return api.rememberCollection(currentCollection); }
  return saved;
}, true));
window.addEventListener('beforeunload', () => checkpoint(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) checkpoint(true); });
document.addEventListener('click', event => { if (event.target.closest('.window-control-button.close')) checkpoint(true); }, true);
async function saveSettings() { try { await api.saveSettings(settings); } catch (error) { status(`设置保存失败：${errorMessage(error)}`, true); } }
$('#autoNext').addEventListener('change', () => { settings.autoNext = $('#autoNext').checked; saveSettings(); });
async function checkEngine(pythonPath) {
  setBusy(true);
  try {
    const result = await api.checkEngine(pythonPath);
    $('#engineStatus').textContent = result.available ? `yt-dlp · Python ${result.version}` : '解析环境未就绪';
    status(result.available ? '粘贴原站地址并加载选集。' : result.message, !result.available);
  } catch (error) { status(errorMessage(error), true); } finally { setBusy(false); }
}
$('#pickPythonBtn').addEventListener('click', async () => {
  try { const chosen = await api.choosePython(); if (!chosen) return; settings.pythonPath = chosen; $('#pythonPath').value = chosen; await saveSettings(); await checkEngine(chosen); }
  catch (error) { status(errorMessage(error), true); }
});
$('#resetPythonBtn').addEventListener('click', async () => { settings.pythonPath = ''; $('#pythonPath').value = ''; await saveSettings(); await checkEngine(''); });
window.addEventListener('plugin-enter', event => {
  const payload = typeof event.detail?.payload === 'string' ? event.detail.payload : '';
  if (payload && !busy) { $('#sourceInput').value = payload; status('已填入选中的地址，点击加载选集。'); }
});
(async () => {
  try { library = await api.getLibrary(); libraryReady = true; renderLibrary(); showSide(library.items.some(item => item.openedAt) ? 'history' : library.items.some(item => item.favorite) ? 'favorites' : 'episodes'); }
  catch (error) { libraryError(error); renderLibrary(); }
  try { const saved = await api.getSettings(); if (saved && typeof saved === 'object') settings = { pythonPath: typeof saved.pythonPath === 'string' ? saved.pythonPath : '', autoNext: saved.autoNext === true }; }
  catch (_) { /* 历史设置读取失败不阻止解析工作台打开。 */ }
  $('#pythonPath').value = settings.pythonPath; $('#autoNext').checked = settings.autoNext;
  await checkEngine(settings.pythonPath);
})();
