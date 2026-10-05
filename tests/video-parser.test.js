'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { fork } = require('node:child_process');
const directory = path.join(__dirname, '..', 'app', 'software', 'sanrenjz-tools-video-parser');
const { normalizeInput, listUrl, normalizeCollection, choosePlayback, createParserService } = require(path.join(directory, 'parser-service'));
const { createMediaProxy, isPrivateAddress, validateMediaUrl } = require(path.join(directory, 'media-proxy'));
const { videoIdFromUrl, parseResponse, metadataFromResponse, episodeFromInfo, createIqiyiService } = require(path.join(directory, 'iqiyi-service'));

test('爱奇艺按输入 URL 还原真实 64 位视频 ID，禁止返回其他视频和受保护清单', () => {
  const url = 'https://www.iqiyi.com/v_mo3lbdn60s.html?qyTrace=example';
  const id = videoIdFromUrl(url);
  assert.equal(id, '2349242958520400');
  assert.equal(videoIdFromUrl('https://www.iqiyi.com/v_test.html?shareId=' + Buffer.from(id).toString('base64')), id);
  assert.throws(() => videoIdFromUrl('https://www.iqiyi.com/a_test.html'), /单集/);
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:3\n#EXTINF:3,\nhttps://cdn.example.com/one.ts\n#EXT-X-ENDLIST\n';
  const encode = data => Array.from(JSON.stringify(data), char => String.fromCharCode(char.charCodeAt(0) ^ 90)).join('');
  const response = { videoInfo: { tvId: Number(id), title: '公开样本', effective: true }, ev: encode({ code: 'A00000', data: { program: { video: [{ m3u8: playlist, scrsz: '1280x720', duration: 3 }] } } }) };
  const result = parseResponse(response, id, url);
  assert.equal(result.protocol, 'hls'); assert.equal(result.title, '公开样本'); assert.equal(result.quality, '720P'); assert.equal(result.video.playlist, playlist);
  assert.throws(() => parseResponse(response, '123', url), /不一致/);
  assert.throws(() => parseResponse({ ...response, videoInfo: { ...response.videoInfo, isLock: true } }, id, url), /权限/);
  assert.throws(() => parseResponse({ ...response, ev: 'invalid' }, id, url), /格式/);
  assert.throws(() => parseResponse({ ...response, ev: encode({ code: 'A00000', data: { program: { video: [{ m3u8: playlist.replace('#EXTINF', '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="https://example.com/key"\n#EXTINF') }] } } }) }, id, url), /非加密/);
});

test('爱奇艺加载目录不请求播放流，选择下一集时才刷新本集媒体，不要求 Python', async () => {
  let calls = 0, cancelled = false, disposed = false;
  const url = 'https://www.iqiyi.com/v_mo3lbdn60s.html';
  const next = 'https://www.iqiyi.com/v_1vlclo2b284.html';
  const service = createParserService({ spawn: () => { throw new Error('爱奇艺不应启动 Python'); }, iqiyi: {
    list: async input => { assert.equal(input, url); return { title: '择天记', entries: [{ title: '择天记 第1集', webpage_url: url }, { title: '择天记 第2集', webpage_url: next, episode_number: 2, access_label: '原站会员/付费标记' }], truncated: false }; },
    resolve: async input => { calls++; assert.equal(input, next); return { title: '接口短标题', duration: 90, pageUrl: input, protocol: 'hls' }; },
    cancel: () => { cancelled = true; }, dispose: () => { disposed = true; }
  } });
  const collection = await service.list(url);
  assert.equal(collection.episodes.length, 2); assert.equal(collection.episodes[1].url, next); assert.equal(collection.warning, ''); assert.equal(calls, 0);
  assert.equal(collection.episodes[1].number, 2); assert.equal(collection.episodes[1].accessLabel, '原站会员/付费标记');
  const result = await service.resolve(collection.episodes[1].id);
  assert.equal(result.protocol, 'hls'); assert.equal(result.title, '择天记 第2集'); assert.equal(calls, 1);
  service.cancel(); service.dispose(); assert.ok(cancelled && disposed);
});

function fakeIqiyiRequest(responder, afterResponse = () => {}) {
  return (url, options, callback) => {
    assert.equal(options.headers.Cookie, undefined);
    const req = new EventEmitter(); req.destroyed = false;
    req.destroy = error => { if (req.destroyed) return; req.destroyed = true; process.nextTick(() => { req.emit('error', error); req.emit('close'); }); };
    req.end = () => process.nextTick(() => {
      if (req.destroyed) return;
      let data;
      try { data = responder(url); } catch (error) { req.destroy(error); return; }
      const response = new EventEmitter(); response.statusCode = 200; response.resume = () => {};
      callback(response); response.emit('data', Buffer.from(JSON.stringify(data))); response.emit('end');
      afterResponse(url); req.emit('close');
    });
    return req;
  };
}

const iqiyiCurrent = { tvId: 2349242958520400, albumId: 4912162839234901, channelId: 4, name: '择天记 第1集', albumName: '择天记', order: 1, contentType: 1, playUrl: 'http://www.iqiyi.com/v_mo3lbdn60s.html', effective: true, payMark: 7, duration: '29:31' };

test('爱奇艺原站元信息与 URL ID 必须一致，目录过滤预告、外站与错误视频 ID', () => {
  assert.equal(metadataFromResponse({ code: 'A00000', data: iqiyiCurrent }, String(iqiyiCurrent.tvId)), iqiyiCurrent);
  assert.throws(() => metadataFromResponse({ code: 'A00000', data: iqiyiCurrent }, '123'), /不一致/);
  const episode = episodeFromInfo(iqiyiCurrent);
  assert.equal(episode.webpage_url, 'https://www.iqiyi.com/v_mo3lbdn60s.html'); assert.equal(episode.duration, 1771); assert.equal(episode.access_label, '原站会员/付费标记');
  for (const change of [{ effective: false }, { contentType: 3 }, { tvId: 123 }, { playUrl: 'https://www.iqiyi.com.evil.test/v_mo3lbdn60s.html' }, { playUrl: 'https://user:pass@www.iqiyi.com/v_mo3lbdn60s.html' }]) assert.equal(episodeFromInfo({ ...iqiyiCurrent, ...change }), null);
});

test('爱奇艺目录按页取得正片、去重排序，会员标记不会阻止读取目录', async () => {
  const urls = [];
  const makeEpisode = index => ({ ...iqiyiCurrent, tvId: index + 1000000000000000, order: index + 1, name: `样本 第${index + 1}集`, playUrl: 'https://www.iqiyi.com/v_test.html?shareId=' + Buffer.from(String(index + 1000000000000000)).toString('base64') });
  const service = createIqiyiService({ request: fakeIqiyiRequest(url => {
    urls.push(url.href);
    if (url.pathname.includes('baseinfo')) return { code: 'A00000', data: iqiyiCurrent };
    const page = Number(url.searchParams.get('page'));
    return { code: 'A00000', data: { albumId: String(iqiyiCurrent.albumId), total: 202, epsodelist: page === 1 ? Array.from({ length: 100 }, (_, i) => makeEpisode(99 - i)) : page === 2 ? Array.from({ length: 100 }, (_, i) => makeEpisode(100 + i)) : [makeEpisode(199), makeEpisode(200)], afterEpisodeList: [makeEpisode(202)] } };
  }) });
  try {
    const result = await service.list(iqiyiCurrent.playUrl);
    assert.equal(result.entries.length, 201); assert.equal(result.entries[0].episode_number, 1); assert.equal(result.entries.at(-1).episode_number, 201); assert.equal(result.warning, ''); assert.equal(result.truncated, false);
    assert.equal(urls.length, 4); assert.ok(urls.every(url => !url.includes('accelerator')));
  } finally { service.dispose(); }
});

test('爱奇艺目录空或失败仅回退真实单集，后续页失败保留已取目录并警告', async () => {
  for (const mode of ['empty', 'wrongAlbum', 'partial']) {
    const service = createIqiyiService({ request: fakeIqiyiRequest(url => {
      if (url.pathname.includes('baseinfo')) return { code: 'A00000', data: iqiyiCurrent };
      if (mode === 'partial' && url.searchParams.get('page') === '2') throw new Error('network failure');
      return { code: 'A00000', data: { albumId: mode === 'wrongAlbum' ? '123' : String(iqiyiCurrent.albumId), total: 150, epsodelist: mode === 'partial' ? Array.from({ length: 100 }, () => iqiyiCurrent) : [] } };
    }) });
    try {
      const result = await service.list(iqiyiCurrent.playUrl);
      assert.equal(result.entries.length, 1); assert.equal(result.entries[0].webpage_url, 'https://www.iqiyi.com/v_mo3lbdn60s.html'); assert.match(result.warning, mode === 'partial' ? /未完整取得/ : /仅保留输入/);
    } finally { service.dispose(); }
  }
});

test('爱奇艺分页过程中取消不会回退单集或启动后续请求，关闭后不再请求', async () => {
  let service, calls = 0;
  service = createIqiyiService({ request: fakeIqiyiRequest(() => {
    calls++; return { code: 'A00000', data: iqiyiCurrent };
  }, () => service.cancel()) });
  await assert.rejects(service.list(iqiyiCurrent.playUrl), /取消/); assert.equal(calls, 1);
  service.dispose(); await assert.rejects(service.list(iqiyiCurrent.playUrl), /关闭/); assert.equal(calls, 1);
});

test('限制原站地址，分享文本可识别，拒绝伪域名、凭据与内网', () => {
  assert.equal(normalizeInput('分享 https://www.bilibili.com/video/BV1GJ411x7h7。').platform.id, 'bilibili');
  assert.equal(normalizeInput('https://hongguoduanju.com/detail/123').platform.parse, false);
  assert.equal(normalizeInput('https://play.tudou.com/v_show/id_XNjAxNjI2OTU3Ng==.html').platform.id, 'tudou');
  for (const url of ['file:///tmp/a.mp4', 'https://v.qq.com.evil.test/x/page/a', 'https://user:pass@v.qq.com/', 'https://127.0.0.1/', 'https://v.qq.com:1234/']) assert.throws(() => normalizeInput(url));
});
test('单集优先转整部目录，完整视频 URL 保持原内容', () => {
  assert.equal(listUrl('https://www.bilibili.com/video/BV1bK411W797?p=2&from=test'), 'https://www.bilibili.com/video/BV1bK411W797?from=test');
  assert.equal(listUrl('https://v.qq.com/x/cover/testcover/testvideo.html'), 'https://v.qq.com/x/cover/testcover.html');
  assert.equal(listUrl('https://v.qq.com/x/page/testvideo.html'), 'https://v.qq.com/x/page/testvideo.html');
});
test('真实 flat playlist 的匿名 URL 项可选集，拒绝空目录和非原站项', () => {
  const url = 'https://www.bilibili.com/video/BV1bK411W797';
  const result = normalizeCollection({title:'多 P 视频', entries:[{_type:'url',url:`${url}?p=1`},{_type:'url',url:`${url}?p=2`},{_type:'url',url:'https://evil.test/'}]}, url);
  assert.equal(result.episodes.length, 2);
  assert.match(result.episodes[0].title, /1/);
  assert.notEqual(result.episodes[0].id, result.episodes[1].id);
  assert.throws(() => normalizeCollection({entries:[]}, url), /没有返回可用/);
});
test('B 站选完整音视频、腾讯选 MP4，优酷/土豆选 HLS，拒绝 DRM 和 HEVC', () => {
  const url = 'https://cdn.example.com/v';
  const data = { http_headers:{Referer:'https://www.bilibili.com/'}, formats:[
    {url,ext:'mp4',vcodec:'av01.0.08',acodec:'none',height:2160,protocol:'https'},
    {url,ext:'mp4',vcodec:'avc1.640032',acodec:'none',height:1080,protocol:'https'},
    {url,ext:'m4a',vcodec:'none',acodec:'mp4a.40.2',abr:128,protocol:'https'}
  ]};
  const result = choosePlayback(data); assert.equal(result.quality, '1080P'); assert.ok(result.audio); assert.equal(result.video.headers.Referer, data.http_headers.Referer);
  assert.equal(choosePlayback({formats:[{url,ext:'mp4',height:720,protocol:'https'}]}).audio, null);
  assert.throws(() => choosePlayback({...data,has_drm:true}), /DRM/);
  assert.throws(() => choosePlayback({formats:[data.formats[1]]}), /音轨/);
  assert.equal(choosePlayback({formats:[{url,ext:'mp4',protocol:'m3u8_native'}]}).protocol, 'hls');
  assert.throws(() => choosePlayback({formats:[{url,ext:'mp4',vcodec:'hev1.1.6',acodec:'aac',protocol:'https'}]}), /流格式/);
});
test('公网代理验证覆盖 IPv4、IPv6、映射地址和伪装 loopback', () => {
  for (const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','0:0:0:0:0:0:0:1','::ffff:127.0.0.1','::ffff:7f00:1','fc00::1','fe80::1']) assert.equal(isPrivateAddress(address), true, address);
  for (const address of ['1.1.1.1','172.32.0.1','2606:4700:4700::1111']) assert.equal(isPrivateAddress(address), false, address);
  for (const url of ['http://127.1/','http://0x7f000001/','http://[::1]/','http://localhost/','file:///tmp/video.mp4']) assert.throws(() => validateMediaUrl(url));
});
test('代理流式 Range、头过滤、随机路由、关闭与目录替换', async () => {
  let seen;
  const origin = http.createServer((request,response) => {
    seen = {headers:request.headers,url:request.url};
    response.writeHead(206, {'Content-Type':'application/octet-stream','Content-Range':'bytes 2-5/10','Content-Length':4}); response.end('2345');
  });
  await new Promise(resolve => origin.listen(0,'127.0.0.1',resolve));
  const proxy = createMediaProxy({lookup:(_host,options,cb) => options.all ? cb(null,[{address:'127.0.0.1',family:4}]) : cb(null,'127.0.0.1',4)});
  try {
    const media = {title:'测试',video:{url:`http://public-media.test:${origin.address().port}/video`,mime:'video/mp4',headers:{Referer:'https://www.bilibili.com/',Cookie:'must-not-forward',Authorization:'must-not-forward'}}};
    const first = await proxy.setPlayback(media);
    const response = await fetch(first.videoUrl,{headers:{Range:'bytes=2-5'}});
    assert.equal(response.status,206); assert.equal(await response.text(),'2345'); assert.equal(response.headers.get('content-range'),'bytes 2-5/10');
    assert.equal(seen.headers.range,'bytes=2-5'); assert.equal(seen.headers.referer,'https://www.bilibili.com/'); assert.equal(seen.headers.cookie,undefined); assert.equal(seen.headers.authorization,undefined);
    assert.equal((await fetch(new URL('/video',first.videoUrl))).status,404);
    const second = await proxy.setPlayback(media); assert.notEqual(second.videoUrl,first.videoUrl); assert.equal((await fetch(first.videoUrl)).status,404);
    proxy.stop(); await assert.rejects(fetch(second.videoUrl)); await assert.rejects(proxy.setPlayback(media));
  } finally { proxy.stop(); origin.closeAllConnections(); await new Promise(resolve=>origin.close(resolve)); }
});

test('HLS 清单的分片全部走随机代理，阻止内网、加密和嵌套清单，旧清单失效', async () => {
  let seen, seenUrl, slowStarted;
  const slowRequest = new Promise(resolve => { slowStarted = resolve; });
  const origin = http.createServer((req, res) => {
    seen = req.headers; seenUrl = req.url;
    if (req.url === '/redirect.m3u8') { res.writeHead(302, { Location: '/lists/media.m3u8' }); res.end(); }
    else if (req.url === '/private.m3u8') { res.writeHead(302, { Location: 'http://127.0.0.1/private.m3u8' }); res.end(); }
    else if (req.url === '/lists/media.m3u8') res.end('#EXTM3U\n#EXT-X-TARGETDURATION:3\n#EXTINF:3,\none.ts\n#EXT-X-ENDLIST\n');
    else if (req.url === '/slow.m3u8') slowStarted();
    else res.end('ts-segment');
  });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  const proxy = createMediaProxy({ lookup: (_host, options, cb) => options.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4) });
  const playlist = `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-TARGETDURATION:3\n#EXTINF:3,\nhttp://public-fixture.test:${origin.address().port}/one.ts\n#EXT-X-ENDLIST\n`;
  const playback = { protocol: 'hls', video: { playlist, headers: { Referer: 'https://www.iqiyi.com/', Cookie: 'private' }, mime: 'application/vnd.apple.mpegurl' } };
  try {
    const result = await proxy.setPlayback(playback);
    assert.equal(result.protocol, 'hls');
    const manifest = await (await fetch(result.videoUrl)).text();
    const segment = manifest.split('\n').find(line => line.startsWith('http'));
    assert.match(segment, /^http:\/\/127\.0\.0\.1:/); assert.ok(!manifest.includes('public-fixture.test'));
    assert.equal(await (await fetch(segment)).text(), 'ts-segment'); assert.equal(seen.referer, 'https://www.iqiyi.com/'); assert.equal(seen.cookie, undefined);
    assert.equal((await fetch(result.videoUrl, { method: 'HEAD' })).headers.get('content-type'), 'application/vnd.apple.mpegurl');
    await proxy.setPlayback(playback); assert.equal((await fetch(result.videoUrl)).status, 404);
    for (const content of [playlist.replace('public-fixture.test', '127.0.0.1'), playlist.replace('#EXTINF', '#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key"\n#EXTINF'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhttps://example.com/child.m3u8']) {
      await assert.rejects(proxy.setPlayback({ ...playback, video: { ...playback.video, playlist: content } }));
    }
    const remote = route => ({ protocol: 'hls', video: { url: `http://public-fixture.test:${origin.address().port}${route}`, headers: playback.video.headers, mime: playback.video.mime } });
    const loaded = await proxy.setPlayback(remote('/redirect.m3u8'));
    const rewritten = await (await fetch(loaded.videoUrl)).text();
    const relativeSegment = rewritten.split('\n').find(line => line.startsWith('http'));
    assert.equal(await (await fetch(relativeSegment)).text(), 'ts-segment'); assert.equal(seenUrl, '/lists/one.ts'); assert.equal(seen.cookie, undefined);
    await assert.rejects(proxy.setPlayback(remote('/private.m3u8')), /公网/);
    const pending = proxy.setPlayback(remote('/slow.m3u8'));
    await slowRequest; proxy.cancel(); await assert.rejects(pending, /取消/);
  } finally { proxy.stop(); origin.closeAllConnections(); await new Promise(resolve => origin.close(resolve)); }
});

function fakeProcess(output, delay = 5) {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const timer = setTimeout(() => { const bytes = Buffer.from(output); child.stdout.emit('data',bytes.subarray(0,8)); child.stdout.emit('data',bytes.subarray(8)); child.emit('close',0); },delay);
  child.kill = () => { clearTimeout(timer); setImmediate(()=>child.emit('close',null)); return true; };
  return child;
}
test('解析参数隔离系统配置，拒绝重复解析和过期选集 ID，取消会结束进程', async () => {
  const calls = [];
  const service = createParserService({spawn:(command,args,options) => {
    calls.push({command,args,options});
    return fakeProcess(args.includes('-c') ? '3.12.7\n' : JSON.stringify({_type:'playlist',title:'中文标题',entries:[{_type:'url',url:'https://www.bilibili.com/video/BV1bK411W797?p=1'}]}), 20);
  }});
  try {
    const first = service.list('https://www.bilibili.com/video/BV1bK411W797');
    await assert.rejects(service.list('https://www.bilibili.com/video/BV1bK411W797'),/正在解析/);
    const collection = await first; assert.equal(collection.title,'中文标题');
    const call = calls.find(item=>item.args.includes('--dump-single-json')); assert.ok(call.args.includes('--ignore-config')); assert.ok(call.args.includes('--no-plugin-dirs')); assert.equal(call.options.shell,false); assert.equal(call.options.windowsHide,true);
    const running = service.resolve(collection.episodes[0].id); service.cancel(); await assert.rejects(running);
    await assert.rejects(service.resolve('invalid-id'),/失效/);
    await assert.rejects(service.list('https://hongguoduanju.com/detail/1'),/尚未接入/);
    await assert.rejects(service.resolve(collection.episodes[0].id),/失效/);
  } finally { service.dispose(); }
});
test('腾讯目录为空时仅回退真实输入单集，不能制造选集', async () => {
  const service = createParserService({spawn:(_command,args) => fakeProcess(args.includes('-c') ? '3.12.7\n' : JSON.stringify(args.includes('--flat-playlist') ? {entries:[]} : {title:'真实单集'}))});
  try {
    const collection = await service.list('https://v.qq.com/x/cover/cid/vid.html');
    assert.equal(collection.episodes.length,1); assert.equal(collection.episodes[0].url,'https://v.qq.com/x/cover/cid/vid.html'); assert.match(collection.warning,/仅取得输入/);
  } finally { service.dispose(); }
});
test('内置的是可审查 Python 源码 ZIP，版本固定且图标和清单完整', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(directory,'vendor','engine-source.json')));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'vendor','yt-dlp.pyz'))).digest('hex'),lock.archiveSha256);
  assert.match(lock.commit,/^[a-f0-9]{40}$/);
  assert.equal(lock.license,'Unlicense');
  const hls = JSON.parse(fs.readFileSync(path.join(directory, 'vendor', 'hls-source.json')));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, 'vendor', 'hls.light.min.js'))).digest('hex'), hls.fileSha256);
  assert.equal(hls.license, 'Apache-2.0');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,'plugin.json'))); assert.equal(manifest.preload,'preload.js');
  const ico = fs.readFileSync(path.join(directory,'logo.ico')); assert.equal(ico.readUInt16LE(2),1); assert.equal(ico.readUInt16LE(4),7);
});
test('独立任务进程返回结构化错误，父 IPC 断开后自行退出', async () => {
  const worker = fork(path.join(directory,'backend.js'),[],{silent:true,windowsHide:true});
  worker.stdout.on('data',()=>{});worker.stderr.on('data',()=>{});
  const request = (id,method,value) => new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.removeListener('message',listener);reject(new Error('任务进程响应超时'));},10000);
    const listener=message=>{if(message.id===id){clearTimeout(timer);worker.removeListener('message',listener);resolve(message);}};
    worker.on('message',listener);worker.send({id,method,value});
  });
  try {
    const engine=await request(1,'checkEngine',process.execPath);assert.equal(engine.result.available,false);
    const restricted=await request(2,'list','https://hongguoduanju.com/detail/1');assert.match(restricted.error,/尚未接入/);
    await request(3,'cancel');
    const closed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('断开 IPC 后未退出')),3000);worker.once('exit',code=>{clearTimeout(timer);resolve(code);});});
    worker.disconnect();assert.equal(await closed,0);
  }finally{if(worker.connected)worker.disconnect();if(worker.exitCode===null)worker.kill();}
});
