'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),http=require('http');
const {spawn}=require('child_process');const {WebSocket}=require('ws');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(args){return new Promise((resolve,reject)=>{const p=spawn('C:/Users/yuhan/AppData/Local/Android/Sdk/platform-tools/adb.exe',['-s','ZY22C74C3S',...args],{windowsHide:true});let output='',error='';p.stdout.on('data',chunk=>output+=chunk);p.stderr.on('data',chunk=>error+=chunk);p.on('error',reject);p.on('close',code=>code?reject(new Error(`ADB ${args[0]} exit ${code}: ${error||output}`)):resolve(output.trim()));});}
function fetchJson(url) {
  return new Promise((resolve,reject) => {
    http.get(url,response => {
      let body=''; response.on('data',chunk => { body+=chunk; });
      response.on('end',() => { try { resolve(JSON.parse(body)); } catch(error) { reject(error); } });
    }).on('error',reject);
  });
}
class Phone {
  constructor(socket){this.socket=socket;this.id=0;this.pending=new Map();socket.on('message',raw=>{const value=JSON.parse(raw);if(value.id&&this.pending.has(value.id)){const entry=this.pending.get(value.id);this.pending.delete(value.id);clearTimeout(entry.timer);value.error?entry.reject(new Error(value.error.message)):entry.resolve(value.result);}});}
  call(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`手机调试请求超时 ${method}`));},120000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression){const value=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;}
}
async function connectPhone(){
  await command(['shell','am','start','-n','com.sanrenjz.tools.remote/.MainActivity']);
  let pid;
  for(let i=0;i<20;i++){try{pid=(await command(['shell','pidof','com.sanrenjz.tools.remote'])).split(' ')[0];if(pid)break;}catch(_){}await wait(300);}
  if(!pid)throw new Error('手机 App 启动失败');
  await command(['forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`]);
  let tab;
  for(let i=0;i<20;i++){try{tab=(await fetchJson('http://127.0.0.1:9223/json/list')).find(item=>/^https:\/\/appassets\.androidplatform\.net\/assets\/index\.html(?:#.*)?$/.test(item.url));if(tab)break;}catch(_){}await wait(500);}
  if(!tab)throw new Error('手机 App WebView 调试连接不可用');
  const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});const phone=new Phone(socket);
  for(let i=0;i<30;i++){if(await phone.evaluate("document.readyState==='complete'&&typeof rpc==='function'"))return phone;await wait(100);}
  socket.close();throw new Error('手机本地页面尚未加载完成');
}
async function run({service,manager,mainWindow}){
  const directory=path.resolve(__dirname,'../dist/mobile-remote-live');fs.mkdirSync(directory,{recursive:true});
  const source='D:/data/sanrenjz-tools/plugin-data',destination=manager.getPluginDataDirectory();
  for(const name of ['AI 共享配置中心-storage.json','AI 共享配置中心-secrets.bin']){
    const file=path.join(source,name);if(fs.existsSync(file)&&!fs.existsSync(path.join(destination,name)))fs.copyFileSync(file,path.join(destination,name));
  }
  await service.configure({enabled:true,port:19876});
  const phone=await connectPhone();
  await phone.evaluate(`Native.send(JSON.stringify({type:'pair',value:${JSON.stringify(JSON.stringify(await service.pairing()))}}));true;`);
  for(let i=0;i<30&&!service.client;i++)await wait(500);
  if(!service.client)throw new Error('真机局域网配对失败');
  global.mobileAcceptance={service,manager,mainWindow,phone,directory};
  const catalog=await phone.evaluate(`rpc('catalog')`);
  const tools=await phone.evaluate(`rpc('chat-tools')`);
  const submitted=await phone.evaluate(`rpc('chat',{text:'生成 3 个 UUID'})`);
  let task;
  for(let i=0;i<40;i++){task=service.chat.tasks.get(submitted.id);if(task?.state==='done'||task?.state==='failed')break;await wait(250);}
  if(task?.state!=='done'||!task.reply.match(/[a-f0-9]{8}-/))throw new Error('真机聊天工具调用失败：'+(task?.error||task?.state));
  const report={device:'Motorola XT2125-4',android:'12',mode:'real-lan-chat',catalog:catalog.length,tools:tools.length,task:service.chat.snapshot(task),pluginWindows:manager.pluginWindows.size};
  fs.writeFileSync(path.join(directory,'phone-lan-report.json'),JSON.stringify(report,null,2));
  console.log('PHONE_REAL_LAN_PASS',JSON.stringify(report));
  // 保留隔离主程序，继续验证真机文件与电脑 AI 处理。
  global.mobileAcceptance={service,manager,mainWindow,phone,directory};
}
module.exports={run,connectPhone,Phone};
