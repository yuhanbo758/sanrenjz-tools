const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { catalog } = require('../scripts/plugin-market/catalog');
const { specs } = require('../scripts/plugin-market/ui-specs');

const outputDirectory = process.argv[2] || path.join(__dirname, '..', 'dist', 'plugin-ui-gallery');
const memoryStorage = new Map();
const forbiddenPhrases = [
  '本地处理', '所有数据默认仅在本机处理', '准备就绪；所有数据默认仅在本机处理', '准备就绪', '专为',
  '配置参数后开始本地处理', '结果可复制、保存或导出'
];
const compositionSignatures = new Map();
// Validate every migrated page; the contact sheet doubles as a review artifact for all four batches.
let representatives = catalog.filter(plugin => plugin.batch >= 2 && plugin.batch <= 5).map(plugin => plugin.id);
const requestedBatch = Number(process.argv[3] || 0);
if (requestedBatch) representatives = catalog.filter(plugin => plugin.batch === requestedBatch).map(plugin => plugin.id);

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

// 截图验收只提供界面初始化所需的最小 IPC，避免测试访问用户真实文件和配置。
ipcMain.on('plugin-storage-get', (event, pluginName, key) => { event.returnValue = memoryStorage.get(`${pluginName}:${key}`) || null; });
ipcMain.on('plugin-storage-set', (event, pluginName, key, value) => { memoryStorage.set(`${pluginName}:${key}`, value); event.returnValue = true; });
ipcMain.on('show-open-dialog', event => { event.returnValue = null; });
ipcMain.on('show-save-dialog', event => { event.returnValue = null; });
ipcMain.handle('plugin-storage-get-async', (_event, pluginName, key) => memoryStorage.get(`${pluginName}:${key}`) || null);
ipcMain.handle('plugin-storage-set-async', (_event, pluginName, key, value) => { memoryStorage.set(`${pluginName}:${key}`, value); return true; });
for (const channel of ['toggle-plugin-pin-window', 'minimize-plugin-window', 'create-plugin-indicator-window', 'close-plugin-indicator-window']) {
  ipcMain.handle(channel, () => false);
}

async function capturePlugin(plugin) {
  const directory = path.join(__dirname, '..', 'app', 'software', plugin.folder);
  const source = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const forbidden = forbiddenPhrases.find(phrase => source.includes(phrase));
  if (forbidden) throw new Error(`${plugin.id}: forbidden generic phrase: ${forbidden}`);
  const windowControlPattern = /(id|class|title|aria-label)=["'][^"']*(pin|unpin|minimi[sz]e|maximi[sz]e|close|window-control)[^"']*["']|>\s*(置顶|取消置顶|最小化|最大化|关闭)\s*</gi;
  const windowControls = source.match(windowControlPattern) || [];
  if (windowControls.length) throw new Error(`${plugin.id}: plugin page duplicates host window controls: ${windowControls.join(', ')}`);
  const window = new BrowserWindow({
    show: false,
    width: 1180,
    height: 760,
    backgroundColor: '#07111f',
    webPreferences: {
      preload: path.join(directory, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  const pageErrors = [];
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) pageErrors.push(message); });
  window.webContents.on('render-process-gone', (_event, details) => pageErrors.push(`renderer gone: ${details.reason}`));
  await window.loadFile(path.join(directory, 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 650));
  const inspection = await window.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('main.shell');
    const regions = [...document.querySelectorAll('[data-region]')];
    const pathFor = node => { const path = []; while (node && node !== root) { path.unshift(node.tagName.toLowerCase() + '.' + [...node.classList].slice(0, 2).join('.')); node = node.parentElement; } return path.join('>'); };
    return {
      text: document.body.innerText,
      overflow: { width: document.body.scrollWidth - document.body.clientWidth, height: document.body.scrollHeight - document.body.clientHeight },
      rootBounds: root ? { right: root.getBoundingClientRect().right, bottom: root.getBoundingClientRect().bottom } : null,
      controls: document.querySelectorAll('[id*=pin i],[id*=minimize i],[id*=maximize i],[id*=close i],[class*=window-control i]').length,
      category: document.getElementById('category')?.textContent || '',
      signature: regions.map(region => region.dataset.region + ':' + pathFor(region)).sort().join('|'),
      family: document.body.dataset.family
    };
  })()`);
  const liveForbidden = forbiddenPhrases.find(phrase => inspection.text.includes(phrase));
  if (liveForbidden) throw new Error(`${plugin.id}: rendered forbidden phrase: ${liveForbidden}`);
  if (inspection.overflow.width > 1 || inspection.overflow.height > 1 || inspection.rootBounds?.right > 1181 || inspection.rootBounds?.bottom > 761) {
    throw new Error(`${plugin.id}: body overflow at 1180x760: ${JSON.stringify({ overflow: inspection.overflow, rootBounds: inspection.rootBounds })}`);
  }
  if (inspection.controls) throw new Error(`${plugin.id}: rendered ${inspection.controls} duplicate window controls`);
  if (/^\s*\d/.test(inspection.category)) throw new Error(`${plugin.id}: numeric category badge: ${inspection.category}`);
  if (pageErrors.length) throw new Error(`${plugin.id}: renderer errors: ${pageErrors.join(' | ')}`);
  const signature = `${inspection.family}|${inspection.signature}`;
  if (!compositionSignatures.has(signature)) compositionSignatures.set(signature, []);
  compositionSignatures.get(signature).push(plugin.id);
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, `${plugin.id}.png`), image.toPNG());
  window.destroy();
}

function validateCompositionDiversity() {
  const count = representatives.length;
  const minimum = count >= 40 ? 12 : Math.min(6, count);
  if (compositionSignatures.size < minimum) {
    throw new Error(`Insufficient composition diversity: ${compositionSignatures.size}/${count}, expected at least ${minimum}`);
  }
  const largest = [...compositionSignatures.values()].sort((a, b) => b.length - a.length)[0] || [];
  const allowed = count >= 40 ? 4 : Math.ceil(count / 3);
  if (largest.length > allowed) throw new Error(`Composition repeated too often (${largest.length} > ${allowed}): ${largest.join(', ')}`);
}

async function captureIconSheet() {
  const cards = catalog.map(plugin => {
    const iconPath = path.join(__dirname, '..', 'app', 'software', plugin.folder, 'logo.png');
    // 使用内嵌数据地址，确保 data: 页面在启用 Web 安全时也能稳定加载全部本地图标。
    const iconDataUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
    return `<article><img src="${iconDataUrl}"><span>${plugin.name}</span></article>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#07111f;color:#dce9f7;font-family:"Microsoft YaHei",sans-serif}
    h1{margin:0 0 22px;font-size:26px}main{display:grid;grid-template-columns:repeat(10,1fr);gap:14px}
    article{min-width:0;padding:12px 8px;border:1px solid #24354a;border-radius:14px;background:#0d1a2a;text-align:center}
    img{display:block;width:58px;height:58px;margin:0 auto 8px}span{display:block;overflow:hidden;font-size:11px;white-space:nowrap;text-overflow:ellipsis}
  </style><h1>三人聚智 · 50 个原创插件图标</h1><main>${cards}</main>`;
  const window = new BrowserWindow({ show: false, width: 1400, height: 850, backgroundColor: '#07111f' });
  const galleryPage = path.join(outputDirectory, 'icon-contact-sheet.html');
  fs.writeFileSync(galleryPage, html, 'utf8');
  await window.loadFile(galleryPage);
  await new Promise(resolve => setTimeout(resolve, 180));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, 'icon-contact-sheet.png'), image.toPNG());
  window.destroy();
}

async function captureUiSheet() {
  const cards = representatives.map(id => {
    const plugin = catalog.find(item => item.id === id);
    return `<article><img src="${id}.png"><strong>${plugin.name}</strong><span>${specs[id].metaphor}</span></article>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#050c16;color:#e5eef9;font-family:"Microsoft YaHei",sans-serif}
    h1{margin:0 0 18px;font-size:25px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}
    article{overflow:hidden;border:1px solid #24354a;border-radius:14px;background:#0d1a2a}img{display:block;width:100%;aspect-ratio:1180/760;object-fit:cover;object-position:top}
    strong,span{display:inline-block;margin:9px 0 10px 12px}span{color:#8fa7be;font-size:12px}
  </style><h1>${representatives.length} 个功能化插件界面</h1><main>${cards}</main>`;
  const page = path.join(outputDirectory, 'ui-contact-sheet.html');
  fs.writeFileSync(page, html, 'utf8');
  const window = new BrowserWindow({ show: false, width: 1500, height: Math.ceil(representatives.length / 3) * 340 + 100, backgroundColor: '#050c16' });
  await window.loadFile(page);
  await new Promise(resolve => setTimeout(resolve, 220));
  fs.writeFileSync(path.join(outputDirectory, 'ui-contact-sheet.png'), (await window.webContents.capturePage()).toPNG());
  window.destroy();
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const id of representatives) await capturePlugin(catalog.find(plugin => plugin.id === id));
    validateCompositionDiversity();
    await captureIconSheet();
    await captureUiSheet();
    console.log(`Plugin UI gallery generated: ${outputDirectory}`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
