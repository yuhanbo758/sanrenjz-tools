const assert = require('assert');
const path = require('path');
const Module = require('module');
const { catalog } = require('../scripts/plugin-market/catalog');

const root = path.resolve(__dirname, '..');

/**
 * 在普通 Node 测试进程中提供最小 Electron 桥接桩，只测试插件纯逻辑，不访问用户文件或真实系统状态。
 */
function loadPluginApi(plugin) {
  let exposedApi;
  const originalLoad = Module._load;
  global.window = { addEventListener() {}, dispatchEvent() {}, exports: {} };
  global.CustomEvent = class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return {
      contextBridge: { exposeInMainWorld(_name, api) { exposedApi = api; } },
      ipcRenderer: { sendSync() { return null; }, invoke() { return Promise.resolve(null); } },
      clipboard: { writeText() {}, readText() { return ''; }, readImage() { return { isEmpty: () => true }; } },
      nativeImage: { createFromDataURL() { return { getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) }; } },
      shell: { openExternal() {}, showItemInFolder() {} }
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const preloadPath = path.join(root, 'app', 'software', plugin.folder, 'preload.js');
    delete require.cache[require.resolve(preloadPath)];
    require(preloadPath);
    return exposedApi;
  } finally {
    Module._load = originalLoad;
  }
}

async function run() {
  const samples = {
    'json-workbench': [{ input: '{"a":{"b":2}}', options: { query: 'a.b' } }, output => assert.strictEqual(output, '2')],
    'config-converter': [{ input: '{"name":"tools","enabled":true}', options: { source: 'json', target: 'properties' } }, output => assert.match(output, /name=tools/)],
    'xml-workbench': [{ input: '<root><item>1</item></root>', options: { action: 'format' } }, output => assert.match(output, /\n/)],
    'codec-assistant': [{ input: '三人聚智', options: { action: 'base64-encode' } }, output => assert.strictEqual(Buffer.from(output, 'base64').toString('utf8'), '三人聚智')],
    'hash-hmac': [{ input: 'abc', options: { algorithm: 'sha256' } }, output => assert.strictEqual(output.length, 64)],
    'id-generator': [{ input: '', options: { type: 'uuid', count: 3 } }, output => assert.strictEqual(output.split('\n').length, 3)],
    'time-converter': [{ input: '0', options: {} }, output => assert.match(output, /timestampSeconds/)],
    'regex-lab': [{ input: 'a1 b2', options: { pattern: '\\d', flags: 'g' } }, output => assert.match(output, /"value": "1"/)],
    'jwt-inspector': [{ input: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.invalid', options: {} }, output => assert.match(output, /"sub": "1"/)],
    'text-diff': [{ input: 'a\nb', options: { rightText: 'a\nc' } }, output => assert.match(output, /- b\n\+ c/)]
  };

  for (const plugin of catalog.filter(item => item.batch === 1)) {
    const api = loadPluginApi(plugin);
    assert.ok(api, `${plugin.name} 未暴露 pluginAPI`);
    const [payload, verify] = samples[plugin.id];
    const response = await api.runTask({ ...payload, execute: false });
    assert.strictEqual(response.ok, true, `${plugin.name}: ${response.error}`);
    verify(response.result);
  }
  console.log('plugin market logic tests passed: batch 1');
}

run().catch(error => { console.error(error); process.exit(1); });
