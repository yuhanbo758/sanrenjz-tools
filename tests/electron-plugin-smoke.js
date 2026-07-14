const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('path');
const {catalog}=require('../scripts/plugin-market/catalog');
const memory=new Map();
app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
ipcMain.on('show-open-dialog',event=>event.returnValue=[]);ipcMain.on('show-save-dialog',event=>event.returnValue='');
ipcMain.handle('plugin-storage-get-async',(_e,name,key)=>memory.get(`${name}:${key}`)??null);
ipcMain.handle('plugin-storage-set-async',(_e,name,key,value)=>{memory.set(`${name}:${key}`,value);return true});
ipcMain.handle('plugin-secret-get',()=> 'mock-key');ipcMain.handle('plugin-secret-set',()=>true);ipcMain.handle('plugin-secret-remove',()=>true);
for(const channel of ['toggle-plugin-pin-window','minimize-plugin-window','create-plugin-indicator-window','close-plugin-indicator-window'])ipcMain.handle(channel,()=>false);

async function inspect(plugin,width,height){
  const directory=path.join(__dirname,'..','app','software',plugin.folder);const errors=[];
  const win=new BrowserWindow({show:false,width,height,webPreferences:{preload:path.join(directory,'preload.js'),nodeIntegration:true,contextIsolation:false,webSecurity:false}});
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)});win.webContents.on('render-process-gone',(_e,d)=>errors.push(`renderer:${d.reason}`));
  await win.loadFile(path.join(directory,'index.html'));await new Promise(resolve=>setTimeout(resolve,80));
  const state=await win.webContents.executeJavaScript(`(()=>{const bar=document.createElement('div');bar.id='host-test-controls';bar.style='position:fixed;z-index:2147483647;top:0;right:0;width:160px;height:32px;background:#123';document.body.appendChild(bar);const body=getComputedStyle(document.body);const top=document.elementFromPoint(innerWidth-10,10);return{title:document.title,api:Boolean(window.pluginAPI||window.aiAPI),scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth,scrollY:document.documentElement.scrollHeight-document.documentElement.clientHeight,paddingTop:body.paddingTop,hostTop:top?.id||'',layout:document.documentElement.dataset.layout}})()`);
  win.destroy();if(errors.length||!state.api||state.scrollX>1||state.scrollY>1||state.paddingTop!=='32px'||state.hostTop!=='host-test-controls'||state.title!==plugin.name)throw new Error(`${plugin.id}@${width}x${height}: ${JSON.stringify({state,errors})}`);
}
app.whenReady().then(async()=>{try{for(const plugin of catalog){for(const [w,h] of [[900,650],[1180,760],[1440,900]])await inspect(plugin,w,h)}console.log(`Electron smoke passed: ${catalog.length} plugins x 3 window sizes`);app.exit(0)}catch(error){console.error(error);app.exit(1)}});
