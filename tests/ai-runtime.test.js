const assert=require('assert');
const http=require('http');
const Module=require('module');

async function main(){
  let config={schemaVersion:1,providers:[{id:'mock',name:'Mock',baseUrl:'',models:[{id:'text',label:'Text',capabilities:['text']},{id:'vision',label:'Vision',capabilities:['text','vision']}]}],selections:{text:{providerId:'mock',modelId:'text'},vision:{providerId:'mock',modelId:'vision'}},timeoutMs:500};
  const server=http.createServer((request,response)=>{let body='';request.on('data',c=>body+=c);request.on('end',()=>{const data=JSON.parse(body||'{}');const content=data.messages?.[0]?.content||'';if(content.includes('AUTH')){response.writeHead(401);response.end('bad key');return}if(content.includes('SLOW')){const timer=setTimeout(()=>{if(!response.destroyed){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({choices:[{message:{content:'late'}}]}))}},1200);response.on('close',()=>clearTimeout(timer));return}if(data.stream===false){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({choices:[{message:{content:'non-stream'}}]}));return}response.writeHead(200,{'content-type':'text/event-stream'});response.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n');response.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n');response.end('data: [DONE]\n\n')})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.providers[0].baseUrl=`http://127.0.0.1:${server.address().port}`;
  const original=Module._load;Module._load=function(request,parent,isMain){if(request==='electron')return{ipcRenderer:{invoke(_channel,_name,key,value){if(_channel==='plugin-storage-get-async')return Promise.resolve(config);if(_channel==='plugin-storage-set-async'){config=value;return Promise.resolve(true)}if(_channel==='plugin-secret-get')return Promise.resolve('mock-key');return Promise.resolve(true)}}};return original.call(this,request,parent,isMain)};
  try{
    delete require.cache[require.resolve('../app/plugin_runtime/ai-runtime')];const {createAiRuntime}=require('../app/plugin_runtime/ai-runtime');let chunks='';const api=createAiRuntime('测试',chunk=>chunks=chunk.text);
    let result=await api.complete({requestId:'stream',messages:[{role:'user',content:'HELLO'}]});assert.strictEqual(result.text,'你好');assert.strictEqual(chunks,'你好');
    result=await api.complete({requestId:'plain',stream:false,messages:[{role:'user',content:'HELLO'}]});assert.strictEqual(result.text,'non-stream');
    await assert.rejects(()=>api.complete({requestId:'auth',messages:[{role:'user',content:'AUTH'}]}),/鉴权失败/);
    config.selections.vision={providerId:'mock',modelId:'text'};await assert.rejects(()=>api.complete({requestId:'vision-mismatch',capability:'vision',messages:[]}),/不支持\s*图片理解/);config.selections.vision={providerId:'mock',modelId:'vision'};
    await assert.rejects(()=>api.complete({requestId:'timeout',stream:false,timeoutMs:100,messages:[{role:'user',content:'SLOW'}]}),/超时/);
    const pending=api.complete({requestId:'cancel',stream:false,timeoutMs:2000,messages:[{role:'user',content:'SLOW'}]});setTimeout(()=>api.cancel('cancel'),30);await assert.rejects(()=>pending,/取消/);
    console.log('AI runtime mock tests passed: stream, non-stream, auth, timeout, cancel, capability guard');
  }finally{Module._load=original;server.close()}
}
main().catch(error=>{console.error(error);process.exit(1)});
