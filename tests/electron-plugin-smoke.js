const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('path');
const {catalog}=require('../scripts/plugin-market/catalog');
const memory=new Map();
memory.set('AI 共享配置中心:runtime-config',{schemaVersion:1,providers:[
  {id:'glm',name:'GLM',baseUrl:'https://open.bigmodel.cn/api/paas/v4',models:[{id:'glm-4-flash',label:'GLM-4 Flash',capabilities:['text']},{id:'glm-4v-plus',label:'GLM-4V Plus',capabilities:['text','vision']}]},
  {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',models:[{id:'deepseek-chat',label:'DeepSeek Chat',capabilities:['text']}]}
],selections:{text:{providerId:'deepseek',modelId:'deepseek-chat'},vision:{providerId:'glm',modelId:'glm-4v-plus'}},timeoutMs:60000});
app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
ipcMain.on('show-open-dialog',event=>event.returnValue=[]);ipcMain.on('show-save-dialog',event=>event.returnValue='');
ipcMain.handle('plugin-storage-get-async',(_e,name,key)=>memory.get(`${name}:${key}`)??null);
ipcMain.handle('plugin-storage-set-async',(_e,name,key,value)=>{memory.set(`${name}:${key}`,value);return true});
ipcMain.handle('plugin-secret-get',()=> 'mock-key');ipcMain.handle('plugin-secret-set',()=>true);ipcMain.handle('plugin-secret-remove',()=>true);
for(const channel of ['toggle-plugin-pin-window','minimize-plugin-window','create-plugin-indicator-window','close-plugin-indicator-window'])ipcMain.handle(channel,()=>false);

async function inspect(plugin,width,height){
  const directory=path.join(__dirname,'..','app','software',plugin.folder);const errors=[];
  // Windows 下完全隐藏的 BrowserWindow 不参与命中测试，elementFromPoint() 会错误返回 null。
  // 将测试窗口放到屏幕外并短暂显示，既能真实验证主程序标题栏控件未被插件遮挡，也不会干扰用户桌面。
  const win=new BrowserWindow({show:false,x:-32000,y:-32000,width,height,webPreferences:{preload:path.join(directory,'preload.js'),nodeIntegration:true,contextIsolation:false,webSecurity:false}});
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)});win.webContents.on('render-process-gone',(_e,d)=>errors.push(`renderer:${d.reason}`));
  await win.loadFile(path.join(directory,'index.html'));win.showInactive();await new Promise(resolve=>setTimeout(resolve,80));
  const state=await win.webContents.executeJavaScript(`(()=>{const bar=document.createElement('div');bar.id='host-test-controls';bar.style='position:fixed;z-index:2147483647;top:0;right:0;width:160px;height:32px;background:#123';document.body.appendChild(bar);const body=getComputedStyle(document.body);const top=document.elementFromPoint(innerWidth-10,10);const modelSelect=document.querySelector('.ai-model-picker select');return{title:document.title,api:Boolean(window.pluginAPI||window.aiAPI),scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth,scrollY:document.documentElement.scrollHeight-document.documentElement.clientHeight,paddingTop:body.paddingTop,hostTop:top?.id||'',layout:document.documentElement.dataset.layout,modelOptions:modelSelect?.options.length||0,providerGroups:modelSelect?.querySelectorAll('optgroup').length||0,modelValue:modelSelect?.value||''}})()`);
  const expectedGroups=plugin.type==='ai'?(plugin.id==='ai-image'?1:2):0;
  const expectedModel=plugin.id==='ai-image'?'glm-4v-plus':'deepseek-chat';
  win.destroy();if(errors.length||!state.api||state.scrollX>1||state.scrollY>1||state.paddingTop!=='32px'||state.hostTop!=='host-test-controls'||state.title!==plugin.name||(plugin.type==='ai'&&(state.modelOptions<1||state.providerGroups!==expectedGroups||!state.modelValue.includes(expectedModel))))throw new Error(`${plugin.id}@${width}x${height}: ${JSON.stringify({state,errors})}`);
}
app.whenReady().then(async()=>{try{for(const plugin of catalog){for(const [w,h] of [[900,650],[1180,760],[1440,900]])await inspect(plugin,w,h)}console.log(`Electron smoke passed: ${catalog.length} plugins x 3 window sizes`);app.exit(0)}catch(error){console.error(error);app.exit(1)}});
