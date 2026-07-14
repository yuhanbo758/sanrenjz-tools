const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { catalog } = require('../scripts/plugin-market/catalog');
const { specs } = require('../scripts/plugin-market/ui-specs');

const outputDirectory = process.argv[2] || path.join(__dirname, '..', 'dist', 'plugin-ui-gallery');
const memoryStorage = new Map();
// 12 个样本分别覆盖 12 种信息架构；50 个插件再通过唯一 ui.id 校验保证不会退化为同一模板。
const representatives = [
  'json-workbench', 'text-encoding', 'color-workbench', 'habit-tracker', 'clipboard-history', 'local-file-search',
  'markdown-notes', 'process-monitor', 'todo-list', 'environment-manager', 'hosts-manager', 'lan-transfer'
];

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
  await window.loadFile(path.join(directory, 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 120));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, `${plugin.id}.png`), image.toPNG());
  window.destroy();
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
  </style><h1>12 种独立信息架构抽查</h1><main>${cards}</main>`;
  const page = path.join(outputDirectory, 'ui-contact-sheet.html');
  fs.writeFileSync(page, html, 'utf8');
  const window = new BrowserWindow({ show: false, width: 1500, height: 1750, backgroundColor: '#050c16' });
  await window.loadFile(page);
  await new Promise(resolve => setTimeout(resolve, 220));
  fs.writeFileSync(path.join(outputDirectory, 'ui-contact-sheet.png'), (await window.webContents.capturePage()).toPNG());
  window.destroy();
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const id of representatives) await capturePlugin(catalog.find(plugin => plugin.id === id));
    await captureIconSheet();
    await captureUiSheet();
    console.log(`Plugin UI gallery generated: ${outputDirectory}`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
