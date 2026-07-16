const { contextBridge, ipcRenderer } = require('electron');
const { createToolRuntime, disposeToolRuntime } = require('../../plugin_runtime/tool-runtime');
const PLUGIN_NAME="结构化数据工作台", TOOLS=["json-workbench","config-converter","xml-workbench"];
const core=createToolRuntime({pluginName:PLUGIN_NAME,defaultTool:TOOLS[0],allowedTools:TOOLS});
const api={...core,migrateLegacy:async()=>{const done=await core.storage.get('migration-v1');if(done)return done;const names=['JSON 工作台','配置格式转换','XML 工作台'], keys=['state','settings','data','items','history','notes','tasks','habits','projects'];const snapshot={schemaVersion:1,migratedAt:new Date().toISOString(),sources:{}};for(const name of names){for(const key of keys){const value=await ipcRenderer.invoke('plugin-storage-get-async',name,key);if(value!==null&&value!==undefined)(snapshot.sources[name]||={})[key]=value;}}await core.storage.set('migration-v1',snapshot);return snapshot;}};
try{contextBridge.exposeInMainWorld('pluginAPI',api)}catch(_){window.pluginAPI=api}
function dispatch(toolId,action){window.dispatchEvent(new CustomEvent('plugin-enter',{detail:{toolId,action:action||{}}}));}
window.exports={'plugin-market-json-workbench':{mode:'none',args:{enter:action=>dispatch('json-workbench',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}},
'plugin-market-config-converter':{mode:'none',args:{enter:action=>dispatch('config-converter',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}},
'plugin-market-xml-workbench':{mode:'none',args:{enter:action=>dispatch('xml-workbench',action),search:(_a,_w,setList)=>setList([]),select:()=>{}}}};
window.addEventListener('beforeunload',disposeToolRuntime);