'use strict';
process.env.VIDEO_TEST_DISK_STORAGE = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { createMediaProxy } = require('../app/software/sanrenjz-tools-video-parser/media-proxy');
const { app, openPlugin, until, storage, output, temporary, cleanup, failStorageWrites } = require('./video-parser-harness');
app.disableHardwareAcceleration();
const originalLog = console.log;
console.log = (...args) => { if (!/^(设置插件存储|获取插件存储|存储结果|存储保存结果|插件 视频解析播放 存储数据)/.test(String(args[0]))) originalLog(...args); };
const base = 'https://www.bilibili.com/video/BV1bK411W797';
const samples = [1, 2, 3].map(number => ({ url: `${base}?p=${number}`, title: `第 ${number} 集 <b>安全文字</b>`, number, duration: 12 }));
const storageFile = path.join(temporary, 'plugin-data', '视频解析播放-storage.json');
let win, origin, proxy, session = 0;
const disk = () => JSON.parse(fs.readFileSync(storageFile, 'utf8'));
async function waitDisk(check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { if (fs.existsSync(storageFile) && check(disk()['library-v1'])) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('记录没有按预期写入隔离的真实插件存储文件。');
}
async function closePlugin() {
  const closing = new Promise(resolve => win.once('closed', resolve));
  win.close(); await closing; await new Promise(resolve => setTimeout(resolve, 100));
  storage.clear();
}
async function openWithFreshMedia() {
  const media = await proxy.setPlayback({ title: '受控媒体', quality: '180P', video: { url: `http://public-fixture.test:${origin.address().port}/fixture.mp4`, headers: {}, mime: 'video/mp4' } });
  win = await openPlugin();
  await win.webContents.executeJavaScript(`(()=>{
    window.__listCalls=0;window.__resolved=[];window.__fresh=[];
    window.videoAPI.list=async input=>{window.__listCalls++;window.__fresh=${JSON.stringify(samples)}.map((item,index)=>({...item,id:'session-${++session}-'+window.__listCalls+'-'+index}));return {title:'收藏剧集 <script>安全文字</script>',sourceUrl:input,platform:'B 站',episodes:window.__fresh}};
    window.videoAPI.play=async id=>{const episode=window.__fresh.find(item=>item.id===id);if(!episode)throw new Error('不可重用上次窗口的选集 ID');window.__resolved.push(id);return {...${JSON.stringify(media)},title:episode.title,pageUrl:episode.url}};
    return true;
  })()`);
}
async function click(selector) { await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click();true`, true); }
async function load() {
  await win.webContents.executeJavaScript(`document.querySelector('#sourceInput').value=${JSON.stringify(base)};document.querySelector('#loadBtn').click();true`);
  await until(win, `!document.querySelector('#loadBtn').disabled && document.querySelectorAll('.episode').length===3`);
}
(async () => {
  try {
    const fixture = path.join(temporary, 'library-fixture.mp4');
    const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', fixture], { windowsHide: true, encoding: 'utf8' });
    assert.equal(encoded.status, 0, encoded.stderr);
    const bytes = fs.readFileSync(fixture);
    origin = http.createServer((request, response) => {
      const range = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
      const headers = { 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
      response.writeHead(range ? 206 : 200, headers); response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
    });
    await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
    proxy = createMediaProxy({ lookup: (_host, options, cb) => options.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4) });
    await openWithFreshMedia(); await load(); await click('#favoriteBtn');
    await until(win, `document.querySelector('#favoriteBtn').getAttribute('aria-pressed')==='true' && !document.querySelector('#favoriteBtn').disabled`);
    await waitDisk(value => value.items[0].favorite && value.items[0].progress.length === 0);
    await closePlugin(); await openWithFreshMedia();
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('#favoritesList .library-card').length`), 1);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#historyView').hidden`), false);
    assert.equal(await win.webContents.executeJavaScript(`!!document.querySelector('#historyList script')`), false);
    await click('#favoritesTab'); await click('#favoritesList [data-action="directory"]');
    await until(win, `!document.querySelector('#loadBtn').disabled && document.querySelectorAll('.episode').length===3`);
    assert.match(await win.webContents.executeJavaScript(`document.querySelectorAll('.episode')[2].textContent`), /未播放/);
    await click('.episode');
    await until(win, `document.querySelector('#player').currentTime>0.5 && document.querySelector('#player').webkitDecodedFrameCount>0`);
    await win.webContents.executeJavaScript(`document.querySelector('#player').pause();document.querySelector('#player').currentTime=6;true`);
    await waitDisk(value => value.items[0].progress.some(entry => entry.position >= 6));
    await win.webContents.executeJavaScript(`document.querySelector('#player').play();true`);
    await until(win, `document.querySelector('#player').currentTime>6.8`);
    await closePlugin(); await openWithFreshMedia();
    await click('#historyList [data-action="resume"]');
    await until(win, `document.querySelector('#player').currentTime>=6 && document.querySelector('#player').webkitDecodedFrameCount>0 && document.querySelector('#player').webkitAudioDecodedByteCount>0`);
    const resumed = await win.webContents.executeJavaScript(`({time:document.querySelector('#player').currentTime,frames:document.querySelector('#player').webkitDecodedFrameCount,listCalls:window.__listCalls,ids:window.__resolved,title:document.querySelector('#nowTitle').textContent})`);
    assert.equal(resumed.listCalls, 1); assert.ok(resumed.ids[0].startsWith(`session-${session}-`)); assert.match(resumed.title, /第 1 集/);
    await win.webContents.executeJavaScript(`document.querySelector('#player').pause();true`); await click('#historyTab');
    for (const [width, height] of [[900, 650], [1180, 760], [1440, 900]]) {
      win.setSize(width, height); await new Promise(resolve => setTimeout(resolve, 150));
      for (const tab of ['history', 'favorites', 'episodes']) {
        await click(`#${tab}Tab`);
        const bounds = await win.webContents.executeJavaScript(`({x:document.documentElement.scrollWidth,w:innerWidth,y:document.documentElement.scrollHeight,h:innerHeight})`);
        assert.ok(bounds.x <= bounds.w && bounds.y <= bounds.h, JSON.stringify(bounds));
      }
    }
    win.setSize(1180, 760); await click('#historyTab');
    fs.writeFileSync(path.join(output, 'playback-history.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('#player').currentTime=11.7;document.querySelector('#player').play();true`);
    await waitDisk(value => value.items[0].progress.some(entry => entry.completed));
    await until(win, `document.querySelector('#historyList [data-action="resume"]').textContent==='下一未看集'`);
    await click('#historyList [data-action="resume"]');
    await until(win, `document.querySelector('.episode.active')?.dataset.index==='1' && document.querySelector('#player').currentTime>0.5`);
    await win.webContents.executeJavaScript(`document.querySelector('#player').pause();true`);
    await click('#historyTab'); await click('#historyList [data-action="remove"]');
    await until(win, `document.querySelectorAll('#historyList .library-card').length===0 && document.querySelectorAll('#favoritesList .library-card').length===1`);
    await closePlugin(); await openWithFreshMedia();
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#favoritesView').hidden`), false);
    await click('#favoritesList [data-action="directory"]');
    await until(win, `!document.querySelector('#loadBtn').disabled && document.querySelectorAll('.episode').length===3`);
    await click('#favoritesTab'); await click('#favoritesList [data-action="unfavorite"]');
    await until(win, `document.querySelectorAll('#favoritesList .library-card').length===0 && document.querySelectorAll('#historyList .library-card').length===1`);
    await click('#historyTab'); await click('#clearHistoryBtn');
    assert.equal(disk()['library-v1'].items.length, 1); // 清空须二次点击，第一下不写入。
    await click('#clearHistoryBtn'); await until(win, `document.querySelectorAll('#historyList .library-card').length===0`);
    failStorageWrites(true); await load();
    await until(win, `!document.querySelector('#retryLibraryBtn').hidden && document.querySelector('#libraryStatus').textContent.includes('失败')`);
    await click('#favoriteBtn'); await until(win, `!document.querySelector('#favoriteBtn').disabled`);
    failStorageWrites(false); await click('#retryLibraryBtn');
    await until(win, `document.querySelector('#retryLibraryBtn').hidden && document.querySelector('#favoriteBtn').getAttribute('aria-pressed')==='true'`);
    await waitDisk(value => value.items[0].favorite);
    const saved = disk()['library-v1'];
    assert.ok(!JSON.stringify(saved).includes('session-')); assert.ok(!JSON.stringify(saved).includes('127.0.0.1'));
    const report = { checkedAt: new Date().toISOString(), resumed, diskPersistence: true, freshEpisodeIds: true, unplayedFavorites: true, completedToNext: true, clearPreservesFavorites: true, failedWriteRetry: true, threeSizes: true, reopenCount: session - 1 };
    fs.writeFileSync(path.join(output, 'library-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('视频记录/收藏：真实插件存储落盘、关闭重开、进度续播及新选集 ID、未播放收藏、下一未看集、删除/清空边界、写入失败重试与三尺寸布局通过。');
    app.exit(0);
  } catch (error) { console.error(error); if (win && !win.isDestroyed()) console.error(await win.webContents.executeJavaScript(`({status:document.querySelector('#status').textContent,library:document.querySelector('#libraryStatus').textContent})`)); app.exit(1); }
  finally { if (win && !win.isDestroyed()) win.destroy(); proxy?.stop(); if (origin) { origin.closeAllConnections(); origin.close(); } cleanup(); }
})();
