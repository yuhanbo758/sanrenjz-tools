const { contextBridge, ipcRenderer } = require('electron');
const { createToolRuntime, disposeToolRuntime } = require('../../plugin_runtime/tool-runtime');
const PLUGIN_NAME="图片创作台", TOOLS=["image-watermark","image-collage","screenshot-beautifier"];
const core=createToolRuntime({pluginName:PLUGIN_NAME,defaultTool:TOOLS[0],allowedTools:TOOLS});
const api={...core,migrateLegacy:async()=>{const done=await core.storage.get('migration-v1');if(done)return done;const names=['图片水印','图片拼接','截图美化器'], keys=['state','settings','data','items','history','notes','tasks','habits','projects'];const snapshot={schemaVersion:1,migratedAt:new Date().toISOString(),sources:{}};for(const name of names){for(const key of keys){const value=await ipcRenderer.invoke('plugin-storage-get-async',name,key);if(value!==null&&value!==undefined)(snapshot.sources[name]||={})[key]=value;}}await core.storage.set('migration-v1',snapshot);return snapshot;}};
try{contextBridge.exposeInMainWorld('pluginAPI',api)}catch(_){window.pluginAPI=api}
function dispatch(toolId,action){window.dispatchEvent(new CustomEvent('plugin-enter',{detail:{toolId,action:action||{}}}));}
window.exports={'plugin-market-image-watermark':{mode:'none',args:{enter:action=>dispatch('image-watermark',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}},
'plugin-market-image-collage':{mode:'none',args:{enter:action=>dispatch('image-collage',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}},
'plugin-market-screenshot-beautifier':{mode:'none',args:{enter:action=>dispatch('screenshot-beautifier',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}}};
window.addEventListener('beforeunload',disposeToolRuntime);