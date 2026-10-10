'use strict';
const fs=require('fs'),path=require('path'),{definitions}=require('../app/remote/chat-tools');
const directory=path.resolve(__dirname,'../app/software'),plugins=[];
for(const id of fs.readdirSync(directory)){try{const p=JSON.parse(fs.readFileSync(path.join(directory,id,'plugin.json'),'utf8'));plugins.push({id,name:p.pluginName,features:p.features||[]});}catch(_){}}
const tools=definitions(plugins),lines=['# 手机聊天接口兼容性','',`本分支共有 ${plugins.length} 个插件目录、${tools.length} 个登记业务接口。接口只能覆盖表中明确列出的能力；没有自动业务接口的插件不进行窗口投屏或自动点击。`,'','| 电脑插件 | 手机聊天能力 | 状态 |','|---|---|---|'];
for(const plugin of plugins){const selected=tools.filter(tool=>tool.pluginId===plugin.id);lines.push(`| ${plugin.name} | ${selected.map(tool=>tool.description.replace(/\|/g,'/')).join('；')||'暂无自动业务接口'} | ${selected.length?'部分业务已接入':'暂需电脑界面操作'} |`);}
lines.push('','24 个文本/文件/图片/PDF/ZIP 接口已在真实 Electron 隐藏执行器中验证。笔记新增的确认/取消/防重复写入经过逻辑测试；投放运行包的真实解码及明确队列续播经过独立进程测试。各项真机范围与尚未验证内容见 [使用与验证说明](mobile-remote-control.md)。','');
fs.mkdirSync(path.resolve(__dirname,'../docs'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../docs/mobile-compatibility.md'),lines.join('\n'),'utf8');console.log(`MOBILE_COMPATIBILITY: ${plugins.length} plugins / ${tools.length} operations`);
