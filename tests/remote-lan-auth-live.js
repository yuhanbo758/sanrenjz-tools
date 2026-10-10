'use strict';
const assert=require('assert'),crypto=require('crypto'),{WebSocket}=require('ws'),{connectHost}=require('./remote-live-inspect');
(async()=>{const host=await connectHost();let socket;try{
  const certificate=await host.evaluate('global.mobileAcceptance.service.identity.tls.cert'),fingerprint=new crypto.X509Certificate(certificate).fingerprint256;
  async function connect(){socket=new WebSocket('wss://127.0.0.1:19876/ws',{ca:certificate,checkServerIdentity:(_name,cert)=>cert.fingerprint256===fingerprint?undefined:new Error('错误电脑证书')});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});}
  const send=value=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('认证测试超时')),5000);socket.once('message',raw=>{clearTimeout(timer);resolve(JSON.parse(raw));});socket.send(JSON.stringify(value));});
  await connect();const forbidden=await send({type:'request',value:{v:1,id:'unauthorized',method:'catalog'}});assert.strictEqual(forbidden.type,'error');assert(forbidden.value.includes('未配对'));socket.close();
  const pairing=await host.evaluate('global.mobileAcceptance.service.pairing()');await host.evaluate('global.mobileAcceptance.service.pairCode.expiresAt=Date.now()-1');
  await connect();const expired=await send({type:'pair',code:pairing.code,name:'过期配对测试'});assert.strictEqual(expired.type,'error');assert(expired.value.includes('过期'));socket.close();
  assert(await host.evaluate('Boolean(global.mobileAcceptance.service.client)'));
  console.log('REMOTE_LAN_AUTH_PASS: 真实 TLS 下未配对请求、过期二维码被拒绝，当前手机保持连接');
}finally{socket?.close();host.socket.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
