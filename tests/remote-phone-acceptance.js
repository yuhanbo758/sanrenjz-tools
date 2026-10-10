'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {connectPhone}=require('./remote-main-live'),{connectHost}=require('./remote-live-inspect');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const phone=await connectPhone(),host=await connectHost(),directory=path.resolve(__dirname,'../dist/mobile-remote-live');
  try{
    const models=await phone.evaluate(`rpc('chat-models')`),model=models.models.find(item=>item.providerId==='opencode:agent-plan'&&item.modelId==='doubao-seed-2-0-mini-260215');
    assert(model,'电脑现有测试模型不可用');const selection={providerId:model.providerId,modelId:model.modelId};
    const file=path.join(directory,'chat-summary-fixture.txt');fs.writeFileSync(file,'三人聚智遥控方案：手机通过局域网提交聊天任务；AI 模型和插件在电脑执行；用户可以上传文件并下载电脑返回的结果；界面分为聊天、工具分类、投放和我的电脑四页。','utf8');
    const selected=await phone.evaluate(`rpc('file-select',${JSON.stringify({paths:[file]})})`);
    const submitted=await phone.evaluate(`rpc('chat',${JSON.stringify({text:'请读取我选择的文档，然后总结其中的连接方式、执行端和界面结构。',attachments:selected.map(item=>item.id),toolId:'document-read',selection})})`);
    let task;for(let i=0;i<150;i++){task=(await phone.evaluate(`rpc('chat-status')`)).find(item=>item.id===submitted.id);if(['done','failed'].includes(task?.state))break;await pause(1000);}
    assert.strictEqual(task?.state,'done',task?.error);assert.strictEqual(task.tool?.id,'document-read');assert(task.reply.includes('电脑模型处理'));assert(task.reply.includes('局域网'));assert(!task.reply.includes('AI 处理未完成'));
    const cancel=await phone.evaluate(`rpc('chat',${JSON.stringify({text:'请详细介绍计算机网络的各层协议。',selection})})`);
    await phone.evaluate(`rpc('chat-cancel',{id:${JSON.stringify(cancel.id)}})`);await pause(1000);
    const cancelled=(await phone.evaluate(`rpc('chat-status')`)).find(item=>item.id===cancel.id);assert.strictEqual(cancelled.state,'cancelled');
    const before=await host.evaluate(`global.mobileAcceptance.service.chat.tasks.size`);
    await phone.evaluate(`native('disconnect');true`);await pause(600);await phone.evaluate(`native('connect',{endpoint:document.getElementById('endpoint').value});true`);
    for(let i=0;i<20;i++){if(await phone.evaluate('connected'))break;await pause(500);}assert(await phone.evaluate('connected'));
    assert.strictEqual(await host.evaluate(`global.mobileAcceptance.service.chat.tasks.size`),before,'重连不应提交新任务');
    const deviceId=await host.evaluate(`global.mobileAcceptance.service.client.device.id`);
    await host.evaluate(`global.mobileAcceptance.service.revoke(${JSON.stringify(deviceId)})`);await pause(1000);assert(!(await phone.evaluate('connected')));
    const pairing=await host.evaluate(`global.mobileAcceptance.service.pairing()`);await phone.evaluate(`native('pair',{value:${JSON.stringify(JSON.stringify(pairing))}});true`);
    for(let i=0;i<20;i++){if(await phone.evaluate('connected'))break;await pause(500);}assert(await phone.evaluate('connected'));
    await phone.evaluate(`document.getElementById('model').value=${JSON.stringify(JSON.stringify(selection))};document.getElementById('model').dispatchEvent(new Event('change'));document.getElementById('new-chat').click();true`);
    const report={device:'Motorola XT2125-4 / Android 12',version:'1.1.0',mode:'LAN only',realPcAiDocumentSummary:true,summaryTool:task.tool.id,summaryReply:task.reply,cancel:true,reconnectWithoutReplay:true,revokeDisconnect:true,rePair:true};
    fs.writeFileSync(path.join(directory,'phone-acceptance-report.json'),JSON.stringify(report,null,2));console.log('PHONE_ACCEPTANCE_PASS',JSON.stringify({...report,summaryReply:'已验证并记录在隔离报告中'}));
  }finally{phone.socket.close();host.socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
