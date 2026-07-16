const { contextBridge, ipcRenderer } = require('electron');
const { createToolRuntime, disposeToolRuntime } = require('../../plugin_runtime/tool-runtime');
const PLUGIN_NAME="文本工程实验室", TOOLS=["regex-lab","text-diff","line-processor","text-encoding"];
const core=createToolRuntime({pluginName:PLUGIN_NAME,defaultTool:TOOLS[0],allowedTools:TOOLS});
const api={...core,migrateLegacy:async()=>{const done=await core.storage.get('migration-v1');if(done)return done;const names=['正则实验室','文本差异对比','行处理器','文本编码转换'], keys=['state','settings','data','items','history','notes','tasks','habits','projects'];const snapshot={schemaVersion:1,migratedAt:new Date().toISOString(),sources:{}};for(const name of names){for(const key of keys){const value=await ipcRenderer.invoke('plugin-storage-get-async',name,key);if(value!==null&&value!==undefined)(snapshot.sources[name]||={})[key]=value;}}await core.storage.set('migration-v1',snapshot);return snapshot;}};
try{contextBridge.exposeInMainWorld('pluginAPI',api)}catch(_){window.pluginAPI=api}
function dispatch(toolId,action){window.dispatchEvent(new CustomEvent('plugin-enter',{detail:{toolId,action:action||{}}}));}
window.exports={'plugin-market-regex-lab':{mode:'none',args:{enter:action=>dispatch('regex-lab',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}},
'plugin-market-text-diff':{mode:'none',args:{enter:action=>dispatch('text-diff',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}},
'plugin-market-line-processor':{mode:'none',args:{enter:action=>dispatch('line-processor',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}},
'plugin-market-text-encoding':{mode:'none',args:{enter:action=>dispatch('text-encoding',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}}};
window.addEventListener('beforeunload',disposeToolRuntime);