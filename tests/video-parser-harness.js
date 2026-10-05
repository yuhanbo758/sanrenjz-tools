'use strict';
const { app, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const PluginManager = require('../app/software_manager');
const { waitForPluginWindowReady } = require('../app/plugin_runtime/plugin-window-ready');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'video-parser-ui-'));
app.setPath('userData', temporary);
app.on('window-all-closed', () => {});
const storage = new Map();
let storageManager, storageWritesFail = false;
const diskStorage = process.env.VIDEO_TEST_DISK_STORAGE === '1';
ipcMain.handle('plugin-storage-get-async', (_event,name,key)=>diskStorage ? storageManager.getPluginStorageItem(name,key) : storage.get(key) ?? null);
ipcMain.handle('plugin-storage-set-async', (_event,name,key,value)=>{
  if (storageWritesFail) return false;
  storage.set(key,value); return diskStorage ? storageManager.setPluginStorageItem(name,key,value) : true;
});
ipcMain.handle('get-plugin-pin-status-window',()=>false);
ipcMain.on('show-open-dialog',event=>{event.returnValue=null;});
const directory = process.env.VIDEO_PLUGIN_DIR || path.join(__dirname,'..','app','software','sanrenjz-tools-video-parser');
const output = path.join(__dirname,'..','dist','video-parser-validation');
fs.mkdirSync(output,{recursive:true});

async function openPlugin() {
  await app.whenReady();
  const manager = new PluginManager(null);
  storageManager = manager;
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,'plugin.json'),'utf8'));
  const win = await manager.createPluginWindow(directory,manifest,{startHidden:true});
  win.webContents.setBackgroundThrottling(false);
  await waitForPluginWindowReady(win.webContents,15000);
  await until(win,`!!window.videoAPI && !document.querySelector('#loadBtn').disabled`,30000);
  if (win.isVisible()) throw new Error('测试窗口必须隐藏，不能干扰桌面。');
  return win;
}
async function until(win,expression,timeout=15000) {
  const deadline = Date.now()+timeout;
  while(Date.now()<deadline){if(await win.webContents.executeJavaScript(`Boolean(${expression})`))return;await new Promise(resolve=>setTimeout(resolve,150));}
  const status=await win.webContents.executeJavaScript(`document.querySelector('#status')?.textContent`);
  throw new Error(`等待超时: ${expression}; ${status}`);
}
function cleanup() {
  // 仅清理本次 mkdtemp 创建的隔离目录。
  if(path.dirname(temporary)!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('video-parser-ui-'))throw new Error('临时目录检查失败');
  try { fs.rmSync(temporary,{recursive:true,force:true}); }
  catch(error){if(!['EPERM','EBUSY'].includes(error.code))throw error;}
}
module.exports = { app, openPlugin, until, storage, output, temporary, cleanup, failStorageWrites: value => { storageWritesFail = value; } };
