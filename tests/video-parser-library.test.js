'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLibraryStore, normalizeLibrary, pageUrl } = require('../app/software/sanrenjz-tools-video-parser/library-store');
const first = 'https://www.iqiyi.com/v_mo3lbdn60s.html', second = 'https://www.iqiyi.com/v_1vlclo2b284.html';
const collection = { collectionKey: 'iqiyi:4912162839234901', sourceUrl: first + '?qyTrace=private-tracking', title: '择天记', platform: '爱奇艺', episodes: [{ id: 'temporary-id', url: first, title: '第1集', number: 1, videoUrl: 'https://cdn.example.com/?signature=private' }, { id: 'another-id', url: second, title: '第2集', number: 2 }] };

test('保存原站目录、收藏与集数进度，重建存储服务后仍可读取；不保存临时 ID、媒体签名和追踪参数', async () => {
  let disk = null;
  const adapter = { get: async () => disk, set: async value => { disk = JSON.parse(JSON.stringify(value)); return true; }, now: () => 100 };
  const store = createLibraryStore(adapter);
  await store.remember(collection); await store.favorite(collection.collectionKey, true);
  await store.progress({ key: collection.collectionKey, url: second, position: 123.5, duration: 600, completed: false });
  const reopened = await createLibraryStore(adapter).get(), item = reopened.items[0];
  assert.equal(item.favorite, true); assert.equal(item.lastEpisodeUrl, second); assert.equal(item.progress[0].position, 123.5); assert.equal(item.sourceUrl, first);
  for (const fragment of ['temporary-id', 'another-id', 'signature', 'private-tracking', 'videoUrl']) assert.ok(!JSON.stringify(reopened).includes(fragment));
  assert.throws(() => pageUrl('https://cdn.example.com/video.mp4'));
  await store.remember({ ...collection, sourceUrl: second });
  assert.equal((await store.get()).items.length, 1); assert.equal((await store.get()).items[0].progress[0].position, 123.5);
});

test('慢写入按序完成，最新进度不会被旧进度覆盖；保存失败可重试，未知版本不覆盖原数据', async () => {
  let disk, active = 0, maxActive = 0, failing = false;
  const store = createLibraryStore({ get: async () => disk, set: async value => {
    active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 8)); active--;
    if (failing) return false; disk = value; return true;
  } });
  await store.remember(collection);
  await Promise.all([10, 30, 50].map(position => store.progress({ key: collection.collectionKey, url: first, position, duration: 600 })));
  assert.equal(maxActive, 1); assert.equal(disk.items[0].progress[0].position, 50);
  failing = true; await assert.rejects(store.favorite(collection.collectionKey, true), /写入失败/); assert.equal(disk.items[0].favorite, false);
  failing = false; await store.flush(); assert.equal(disk.items[0].favorite, true);
  let writes = 0;
  const newer = createLibraryStore({ get: async () => ({ version: 2, items: [] }), set: async () => { writes++; } });
  await assert.rejects(newer.remember(collection), /保留原数据/); assert.equal(writes, 0);
});

test('目录临时回退单集不会丢失旧进度，清空记录保留收藏，取消收藏不删播放记录', async () => {
  let disk;
  const store = createLibraryStore({ get: async () => disk, set: async value => { disk = value; return true; } });
  await store.remember(collection); await store.favorite(collection.collectionKey, true);
  await store.progress({ key: collection.collectionKey, url: second, position: 60, duration: 600, completed: true });
  await store.remember({ ...collection, episodes: collection.episodes.slice(0, 1), warning: '目录失败仅返回单集' });
  assert.equal(disk.items[0].episodes.length, 2); assert.equal(disk.items[0].progress[0].completed, true);
  await store.removeHistory(null);
  assert.equal(disk.items.length, 1); assert.equal(disk.items[0].favorite, true); assert.equal(disk.items[0].openedAt, 0); assert.equal(disk.items[0].progress.length, 0);
  await store.remember(collection); await store.favorite(collection.collectionKey, false);
  assert.ok(disk.items[0].openedAt > 0); assert.equal(disk.items[0].favorite, false);
});

test('最近记录限制为 50 项，旧收藏不会被淘汰；尚未播放的目录可收藏且没有虚构观看进度', async () => {
  let disk, now = 0;
  const store = createLibraryStore({ get: async () => disk, set: async value => { disk = value; return true; }, now: () => ++now });
  await store.remember(collection); await store.favorite(collection.collectionKey, true);
  for (let i = 0; i < 55; i++) await store.remember({ sourceUrl: `https://www.bilibili.com/video/BVfixture${i}`, title: '目录', episodes: [{ url: `https://www.bilibili.com/video/BVfixture${i}` }] });
  assert.equal(disk.items.filter(item => item.openedAt).length, 50);
  const favorite = disk.items.find(item => item.favorite);
  assert.ok(favorite); assert.equal(favorite.progress.length, 0); assert.equal(favorite.lastEpisodeUrl, '');
  assert.equal(disk.items.length, 51);
});

test('记录输入校验仅保留原站条目与允许字段，非有限进度归零，重复条目不制造额外集数', () => {
  const library = normalizeLibrary({ version: 1, items: [{ ...collection, key: collection.collectionKey, episodes: [...collection.episodes, collection.episodes[0], { url: 'file:///private.txt' }], progress: [{ url: first, position: Infinity, duration: -1, completed: true }, { url: 'https://evil.test/', position: 30 }] }, { sourceUrl: 'https://evil.test/', episodes: [] }] });
  assert.equal(library.items.length, 0); // 没有收藏或打开时间的旧条目不进入可见记录。
  const visible = normalizeLibrary({ version: 1, items: [{ ...collection, key: collection.collectionKey, openedAt: 10, progress: [{ url: first, position: Infinity, duration: -1, completed: true }] }] });
  assert.equal(visible.items[0].episodes.length, 2); assert.equal(visible.items[0].progress[0].position, 0); assert.equal(visible.items[0].progress[0].duration, 0);
});
