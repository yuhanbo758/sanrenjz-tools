const assert = require('assert');
const path = require('path');
const Module = require('module');
const fs = require('fs');
const os = require('os');
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
  if (Number(process.argv[2] || 5) >= 2) await testBatch2();
  console.log(`plugin market logic tests passed: batches 1-${Math.min(2, Number(process.argv[2] || 5))}`);
}

async function testBatch2() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sanrenjz-plugin-test-'));
  try {
    const left = path.join(temporary, '左侧目录'); const right = path.join(temporary, '右侧目录');
    fs.mkdirSync(left); fs.mkdirSync(right);
    fs.writeFileSync(path.join(left, 'alpha.txt'), '第一行\n搜索目标', 'utf8');
    fs.writeFileSync(path.join(right, 'alpha.txt'), '第一行\n不同内容', 'utf8');
    const getApi = id => loadPluginApi(catalog.find(item => item.id === id));

    let response = await getApi('batch-renamer').runTask({ options: { directory: left, find: 'alpha', replace: 'beta' }, execute: false });
    assert.strictEqual(response.ok, true); assert.strictEqual(response.result[0].after, 'beta.txt');

    response = await getApi('file-content-search').runTask({ options: { directory: left, query: '搜索目标', extensions: 'txt' } });
    assert.strictEqual(response.result[0].line, 2);

    response = await getApi('folder-compare').runTask({ options: { directoryA: left, directoryB: right, hash: true } });
    assert.ok(response.result.some(item => item.status === '不同'));

    const encoded = path.join(temporary, '编码.txt'); fs.writeFileSync(encoded, Buffer.from('编码测试'));
    response = await getApi('text-encoding').runTask({ options: { files: [encoded], sourceEncoding: 'utf8', targetEncoding: 'utf8', newline: 'lf', suffix: '.out' }, execute: true });
    assert.ok(fs.existsSync(`${encoded}.out`));

    response = await getApi('csv-table').runTask({ input: 'name,age\n小明,18', options: { action: 'json', delimiter: ',' } });
    assert.match(response.result, /"name": "小明"/);

    response = await getApi('line-processor').runTask({ input: 'b\na\na', options: { unique: true, sort: true } });
    assert.strictEqual(response.result, 'a\nb');

    response = await getApi('directory-tree').runTask({ options: { directory: left, format: 'markdown' } });
    assert.match(response.result, /alpha\.txt/);

    response = await getApi('file-checksum').runTask({ options: { files: [path.join(left, 'alpha.txt')] } });
    assert.strictEqual(response.result[0].sha256.length, 64);

    const { PDFDocument } = require('pdf-lib'); const pdf = await PDFDocument.create(); pdf.addPage([200, 200]); const sourcePdf = path.join(temporary, 'source.pdf'); fs.writeFileSync(sourcePdf, await pdf.save());
    const outputPdf = path.join(temporary, 'output.pdf'); response = await getApi('pdf-organizer').runTask({ options: { files: [sourcePdf], output: outputPdf, rotation: 0 }, execute: true });
    assert.strictEqual(response.result.pages, 1); assert.ok(fs.existsSync(outputPdf));

    const zipPath = path.join(temporary, 'result.zip'); response = await getApi('archive-tool').runTask({ options: { action: 'create', files: [path.join(left, 'alpha.txt')], output: zipPath }, execute: true });
    assert.ok(fs.existsSync(zipPath));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exit(1); });
