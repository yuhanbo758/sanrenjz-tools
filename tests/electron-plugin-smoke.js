const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { catalog } = require('../scripts/plugin-market/catalog');

const maxBatch = Number(process.argv[2] || 5);
const memoryStorage = new Map();

app.disableHardwareAcceleration();
// 冒烟测试会逐个销毁窗口；阻止 Electron 在第一个窗口关闭后自动结束测试进程。
app.on('window-all-closed', () => {});

ipcMain.on('plugin-storage-get', (event, pluginName, key) => { event.returnValue = memoryStorage.get(`${pluginName}:${key}`) || null; });
ipcMain.on('plugin-storage-set', (event, pluginName, key, value) => { memoryStorage.set(`${pluginName}:${key}`, value); event.returnValue = true; });
ipcMain.on('show-open-dialog', event => { event.returnValue = null; });
ipcMain.on('show-save-dialog', event => { event.returnValue = null; });
ipcMain.handle('plugin-storage-get-async', (_event, pluginName, key) => memoryStorage.get(`${pluginName}:${key}`) || null);
ipcMain.handle('plugin-storage-set-async', (_event, pluginName, key, value) => { memoryStorage.set(`${pluginName}:${key}`, value); return true; });
for (const channel of ['toggle-plugin-pin-window', 'minimize-plugin-window', 'create-plugin-indicator-window', 'close-plugin-indicator-window']) {
  ipcMain.handle(channel, () => false);
}

async function smokePlugin(plugin) {
  const directory = path.join(__dirname, '..', 'app', 'software', plugin.folder);
  const pageErrors = [];
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(directory, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) pageErrors.push(message); });
  window.webContents.on('render-process-gone', (_event, details) => pageErrors.push(`renderer gone: ${details.reason}`));
  await window.loadFile(path.join(directory, 'index.html'));
  const state = await window.webContents.executeJavaScript(`({ title: document.title, hasApi: Boolean(window.pluginAPI), profileId: window.pluginAPI?.profile?.id, status: document.getElementById('status')?.textContent })`);
  if (plugin.batch === 3) {
    const fixture = path.join(os.tmpdir(), 'sanrenjz-plugin-image-fixture.png');
    if (!fs.existsSync(fixture)) fs.writeFileSync(fixture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAfW5R8sAAAAASUVORK5CYII=', 'base64'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      if (profile.id === 'svg-workbench') elements.input.value = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#38bdf8"/></svg>';
      else if (profile.id === 'qr-barcode') { state.values.action = 'generate'; state.values.qrText = '三人聚智'; }
      else if (profile.id !== 'color-workbench') state.values.files = [${JSON.stringify(fixture)}, ${JSON.stringify(fixture)}];
      await run(false);
      return { statusClass: elements.status.className, canvasWidth: elements.canvas.width, cards: elements.cards.children.length, output: state.output };
    })()`);
    if (result.statusClass.includes('error') || (!result.canvasWidth && !result.cards && !result.output)) pageErrors.push(`图片核心流程未产生结果：${JSON.stringify(result)}`);
  }
  if (plugin.batch === 4) {
    const result = await window.webContents.executeJavaScript(`(async () => {
      if (profile.id === 'calculation-paper') elements.input.value = 'a = 2 + 3\\na * 4';
      else if (profile.id === 'unit-converter') { elements.input.value = '1000'; state.values.unitType = 'length'; state.values.fromUnit = 'm'; state.values.toUnit = 'km'; }
      else if (profile.id === 'date-world-clock') elements.input.value = '2026-07-14';
      else if (profile.id === 'pomodoro-focus') state.remaining = 1;
      else {
        state.values.title = state.values.title || '冒烟测试记录'; state.values.project = state.values.project || '测试项目'; state.values.url = 'https://example.com';
        elements.input.value = '仅保存在冒烟测试内存中的内容';
      }
      await run(!['calculation-paper','unit-converter','date-world-clock','pomodoro-focus'].includes(profile.id));
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      return { statusClass: elements.status.className, cards: elements.cards.children.length, output: state.output || elements.output.textContent };
    })()`);
    if (result.statusClass.includes('error') || (!result.cards && !result.output)) pageErrors.push(`效率工具核心流程未产生结果：${JSON.stringify(result)}`);
  }
  if (plugin.batch === 5 && !['clipboard-history', 'image-pinboard'].includes(plugin.id)) {
    const fixtureDirectory = path.join(os.tmpdir(), 'sanrenjz-system-smoke'); fs.mkdirSync(fixtureDirectory, { recursive: true }); fs.writeFileSync(path.join(fixtureDirectory, 'smoke-target.txt'), 'system smoke', 'utf8');
    const result = await window.webContents.executeJavaScript(`(async () => {
      const options = { directory: ${JSON.stringify(fixtureDirectory)}, query: 'smoke-target', action: 'status', outputDirectory: ${JSON.stringify(fixtureDirectory)} };
      if (profile.id === 'lan-transfer') {
        options.action = 'start'; const started = await window.pluginAPI.runTask({ options, execute: true });
        options.action = 'stop'; const stopped = await window.pluginAPI.runTask({ options, execute: true });
        return { ok: started.ok && stopped.ok, result: started.result, error: started.error || stopped.error };
      }
      return window.pluginAPI.runTask({ options, execute: false });
    })()`);
    if (!result.ok) pageErrors.push(`系统工具安全读取流程失败：${result.error || JSON.stringify(result)}`);
  }
  window.destroy();
  if (!state.hasApi || state.profileId !== plugin.id || state.title !== plugin.name || pageErrors.length) {
    throw new Error(`${plugin.name} 加载失败：${JSON.stringify({ state, pageErrors })}`);
  }
}

app.whenReady().then(async () => {
  try {
    const plugins = catalog.filter(plugin => plugin.batch <= maxBatch);
    for (const plugin of plugins) await smokePlugin(plugin);
    console.log(`Electron plugin smoke passed: ${plugins.length} plugins`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
