const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

const pluginDirectory = path.join(__dirname, '..', 'app', 'software', 'sanrenjz-tools-account-manager');
const database = require(path.join(pluginDirectory, 'database-service'));

async function waitFor(check, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error('等待插件界面状态超时');
}

async function run() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'account-manager-'));
  const databasePath = path.join(temporaryDirectory, 'dynamic-tables.db');
  let window;
  try {
    database.createDatabase(databasePath);
    database.createTable(databasePath, {
      tableName: '账号资料',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: '项目', type: 'TEXT', notNull: true },
        { name: '用户名', type: 'TEXT' },
        { name: '密码', type: 'TEXT' }
      ]
    });
    database.createTable(databasePath, {
      tableName: '服务器资产',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: '主机名', type: 'TEXT', notNull: true },
        { name: '端口', type: 'INTEGER' },
        { name: '启用', type: 'INTEGER' }
      ]
    });
    database.insertRow(databasePath, { tableName: '账号资料', values: { 项目: '示例项目', 用户名: 'tester', 密码: 'local-only' } });
    database.insertRow(databasePath, { tableName: '账号资料', values: { 项目: '备用项目', 用户名: 'backup', 密码: 'another-secret' } });
    database.insertRow(databasePath, { tableName: '服务器资产', values: { 主机名: 'localhost', 端口: '8080', 启用: '1' } });

    const accountRows = database.queryRows(databasePath, { tableName: '账号资料', searchColumn: '项目', searchText: '示例', searchMode: 'contains' });
    assert.strictEqual(accountRows.total, 1);
    assert.deepStrictEqual(accountRows.columns.filter(column => column.hidden === 0).map(column => column.name), ['id', '项目', '用户名', '密码']);
    const allColumnPasswordRows = database.queryRows(databasePath, { tableName: '账号资料', searchColumn: '__all__', searchText: 'local-on', searchMode: 'contains' });
    assert.strictEqual(allColumnPasswordRows.total, 1, '整表查询应能在不知道列名时找到密码片段');
    const allColumnUserRows = database.queryRows(databasePath, { tableName: '账号资料', searchColumn: '__all__', searchText: 'tester', searchMode: 'equals' });
    assert.strictEqual(allColumnUserRows.total, 1, '整表精确查询应匹配任意列');
    const serverRows = database.queryRows(databasePath, { tableName: '服务器资产' });
    assert.strictEqual(serverRows.rows[0].端口, 8080);
    assert.throws(() => database.queryRows(databasePath, { tableName: '服务器资产', searchColumn: '不存在', searchText: 'x' }), /查询字段/);

    ipcMain.handle('plugin-storage-get-async', (_event, _pluginName, key) => key === 'lastSession' ? { databasePath, tableName: '账号资料' } : null);
    ipcMain.handle('plugin-storage-set-async', () => true);
    ipcMain.handle('close-plugin-window', () => true);
    ipcMain.on('show-open-dialog', event => { event.returnValue = null; });
    ipcMain.on('show-save-dialog', event => { event.returnValue = null; });

    window = new BrowserWindow({
      show: false,
      width: 900,
      height: 650,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(pluginDirectory, 'preload.js')
      }
    });
    await window.loadFile(path.join(pluginDirectory, 'index.html'));
    await waitFor(() => window.webContents.executeJavaScript("document.querySelectorAll('#tableHead th').length === 4"));
    const initial = await window.webContents.executeJavaScript(`({
      title: document.querySelector('#tableTitle').textContent,
      headers: [...document.querySelectorAll('#tableHead th')].map(node => node.textContent),
      rows: document.querySelectorAll('#tableBody tr').length,
      pageOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      addButtonVisible: document.querySelector('#addRow').getBoundingClientRect().right <= innerWidth,
      emptyHidden: getComputedStyle(document.querySelector('#empty')).display === 'none',
      passwordMasked: [...document.querySelectorAll('#tableBody td')].at(-1).textContent === '••••••••',
      searchStrategy: document.querySelector('#searchColumn').value,
      searchLabel: document.querySelector('#searchColumn').selectedOptions[0].textContent
    })`);
    assert.strictEqual(initial.title, '账号资料');
    assert.deepStrictEqual(initial.headers, ['id', '项目', '用户名', '密码']);
    assert.strictEqual(initial.rows, 2);
    assert.strictEqual(initial.pageOverflow, false);
    assert.strictEqual(initial.addButtonVisible, true);
    assert.strictEqual(initial.emptyHidden, true);
    assert.strictEqual(initial.passwordMasked, true);
    assert.strictEqual(initial.searchStrategy, '__all__');
    assert.strictEqual(initial.searchLabel, '整表（全部列）');

    await window.webContents.executeJavaScript(`
      document.querySelector('#searchText').value = 'local-on';
      document.querySelector('#searchButton').click();
    `);
    await waitFor(() => window.webContents.executeJavaScript("document.querySelectorAll('#tableBody tr').length === 1 && document.querySelector('#status').textContent.includes('已加载')"));
    const searchedProject = await window.webContents.executeJavaScript("document.querySelector('#tableBody tr td:nth-child(2)').textContent");
    assert.strictEqual(searchedProject, '示例项目', '整表查询 UI 应跨列找到密码片段对应的记录');

    for (const [width, height] of [[1180, 760], [1440, 900]]) {
      window.setSize(width, height);
      await new Promise(resolve => setTimeout(resolve, 80));
      const layout = await window.webContents.executeJavaScript(`({
        pageOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        tableVisible: document.querySelector('.grid-card').getBoundingClientRect().height > 200,
        addButtonVisible: document.querySelector('#addRow').getBoundingClientRect().right <= innerWidth
      })`);
      assert.strictEqual(layout.pageOverflow, false, `${width}x${height} 不应出现页面级滚动`);
      assert.strictEqual(layout.tableVisible, true, `${width}x${height} 数据表区域应保持可见`);
      assert.strictEqual(layout.addButtonVisible, true, `${width}x${height} 新增按钮应保持可见`);
    }
    if (process.env.ACCOUNT_PLUGIN_SCREENSHOT) {
      window.setSize(1180, 760);
      await new Promise(resolve => setTimeout(resolve, 80));
      fs.writeFileSync(process.env.ACCOUNT_PLUGIN_SCREENSHOT, (await window.capturePage()).toPNG());
    }

    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.table-item')].find(node => node.textContent === '服务器资产').click()`);
    await waitFor(() => window.webContents.executeJavaScript("document.querySelector('#tableTitle').textContent === '服务器资产'"));
    const changedHeaders = await window.webContents.executeJavaScript("[...document.querySelectorAll('#tableHead th')].map(node => node.textContent)");
    assert.deepStrictEqual(changedHeaders, ['id', '主机名', '端口', '启用']);

    console.log('账号数据表插件验证通过：动态双表结构、类型写入、查询校验、三尺寸 UI 切换。');
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    ipcMain.removeHandler('plugin-storage-get-async');
    ipcMain.removeHandler('plugin-storage-set-async');
    ipcMain.removeHandler('close-plugin-window');
    ipcMain.removeAllListeners('show-open-dialog');
    ipcMain.removeAllListeners('show-save-dialog');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

app.whenReady().then(() => run().then(() => app.exit(0)).catch(error => {
  console.error(error);
  app.exit(1);
}));
