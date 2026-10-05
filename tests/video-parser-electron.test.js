'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { createMediaProxy } = require('../app/software/sanrenjz-tools-video-parser/media-proxy');
const { app, openPlugin, until, storage, output, temporary, cleanup } = require('./video-parser-harness');
app.disableHardwareAcceleration();
const samples = [
  {id:'one',title:'第 1 集 <script>不执行</script>',url:'https://www.bilibili.com/video/BV1bK411W797?p=1'},
  {id:'two',title:'第 2 集 测试',url:'https://www.bilibili.com/video/BV1bK411W797?p=2'}
];
let win, origin, proxy;
(async()=>{
  try {
    const sample=path.join(temporary,'fixture.mp4');
    const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','12','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',sample],{windowsHide:true,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const bytes=fs.readFileSync(sample);
    origin=http.createServer((request,response)=>{
      const range=request.headers.range?.match(/bytes=(\d+)-(\d*)/);
      const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
      const headers={'Content-Length':end-start+1,'Content-Type':'video/mp4','Accept-Ranges':'bytes'};
      if(range)headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;
      response.writeHead(range?206:200,headers);response.end(request.method==='HEAD'?undefined:bytes.subarray(start,end+1));
    });
    await new Promise(resolve=>origin.listen(0,'127.0.0.1',resolve));
    proxy=createMediaProxy({lookup:(_host,options,cb)=>options.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4)});
    const media=await proxy.setPlayback({title:'隔离 MP4 样本',quality:'180P',pageUrl:samples[0].url,video:{url:`http://public-fixture.test:${origin.address().port}/fixture.mp4`,headers:{},mime:'video/mp4'}});
    win=await openPlugin();
    await until(win,`document.querySelectorAll('.custom-title-bar .window-control-button').length===3`);
    const titleControls=await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.custom-title-bar .window-control-button'),button=>({title:button.title,color:getComputedStyle(button).color,opacity:getComputedStyle(button).opacity,hovered:button.matches(':hover'),width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}))`);
    assert.equal(titleControls.length,3);
    for(const control of titleControls){assert.equal(control.color,'rgb(36, 41, 46)');assert.equal(control.opacity,'1');assert.equal(control.hovered,false);assert.ok(control.width>=32&&control.height===32);}
    fs.writeFileSync(path.join(output,'titlebar-visible.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(()=>{
      const realList=window.videoAPI.list;
      window.videoAPI.list=async input=>input.includes('hongguoduanju.com')?realList(input):({title:'隔离选集',sourceUrl:input,episodes:${JSON.stringify(samples)},platform:'B 站'});
      window.videoAPI.play=async id=>({...${JSON.stringify(media)},pageUrl:${JSON.stringify(samples)}.find(item=>item.id===id).url});
      window.videoAPI.clipboardText=()=>Promise.resolve('https://www.bilibili.com/video/BV1bK411W797');
      window.__opened=[];window.videoAPI.openOriginal=async input=>window.__opened.push(require(window.pluginPath+'/parser-service').normalizeInput(input).url);
      document.querySelector('#pasteBtn').click();return true;
    })()`);
    await until(win,`document.querySelector('#sourceInput').value.includes('BV1bK411W797')`);
    await win.webContents.executeJavaScript(`document.querySelector('#loadBtn').click();true`);
    await until(win,`document.querySelectorAll('.episode').length===2`);
    assert.equal(await win.webContents.executeJavaScript(`!!document.querySelector('#episodeList script')`),false);
    await win.webContents.executeJavaScript(`document.querySelector('.episode').click();true`);
    await until(win,`document.querySelector('#player').currentTime>0.6 && document.querySelector('#player').webkitDecodedFrameCount>0`);
    await win.webContents.executeJavaScript(`document.querySelector('#player').pause();document.querySelector('#player').currentTime=6;document.querySelector('#speed').value='1.5';document.querySelector('#speed').dispatchEvent(new Event('change'));true`);
    await until(win,`document.querySelector('#player').currentTime>=6`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#player').playbackRate`),1.5);
    await win.webContents.executeJavaScript(`document.querySelector('#nextBtn').click();true`);
    await until(win,`document.querySelector('.episode.active')?.dataset.index==='1' && !document.querySelector('#loadBtn').disabled`);
    await win.webContents.executeJavaScript(`document.querySelector('#originalBtn').click();true`);
    await until(win,`window.__opened.length===1`);
    assert.equal(await win.webContents.executeJavaScript(`window.__opened[0]`),samples[1].url);
    await win.webContents.executeJavaScript(`document.querySelector('#prevBtn').click();true`);
    await until(win,`document.querySelector('.episode.active')?.dataset.index==='0' && !document.querySelector('#loadBtn').disabled`);
    await win.webContents.executeJavaScript(`document.querySelector('#autoNext').click();document.querySelector('#player').dispatchEvent(new Event('ended'));true`);
    await until(win,`document.querySelector('.episode.active')?.dataset.index==='1' && !document.querySelector('#loadBtn').disabled`);
    assert.equal(storage.get('settings-v1').autoNext,true);
    await win.webContents.executeJavaScript(`document.querySelector('#player').pause();document.querySelector('#episodeFilter').value='第 2';document.querySelector('#episodeFilter').dispatchEvent(new Event('input'));true`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.episode').length`),1);
    for(const [width,height] of [[900,650],[1180,760],[1440,900]]){
      win.setSize(width,height);await new Promise(resolve=>setTimeout(resolve,200));
      const bounds=await win.webContents.executeJavaScript(`({width:document.documentElement.scrollWidth,viewport:innerWidth,height:document.documentElement.scrollHeight,screen:innerHeight,first:document.querySelector('#sourceInput').getBoundingClientRect().top,titlebar:!!document.querySelector('.custom-title-bar')})`);
      assert.ok(bounds.width<=bounds.viewport&&bounds.height<=bounds.screen,JSON.stringify(bounds));assert.ok(bounds.first>=32);assert.equal(bounds.titlebar,true);
    }
    win.setSize(1180,760);
    fs.writeFileSync(path.join(output,'player-ui.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`window.exports['video-parser-play'].args.enter({type:'over',payload:'https://hongguoduanju.com/detail/1'});document.querySelector('#loadBtn').click();true`);
    await until(win,`!document.querySelector('#loadBtn').disabled && document.querySelector('#status').textContent.includes('尚未接入')`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.episode').length`),0);
    await win.webContents.executeJavaScript(`document.querySelector('#originalBtn').click();true`);
    await until(win,`window.__opened.length===2`);
    assert.equal(await win.webContents.executeJavaScript(`window.__opened[1]`),'https://hongguoduanju.com/detail/1');
    await win.webContents.executeJavaScript(`document.querySelector('#sourceInput').value='https://www.bilibili.com/video/BV1bK411W797';document.querySelector('#loadBtn').click();true`);
    await until(win,`document.querySelectorAll('.episode').length===2`);
    await win.webContents.executeJavaScript(`window.videoAPI.play=async()=>{throw new Error('解析失败测试')};document.querySelector('.episode').click();true`);
    await until(win,`!document.querySelector('#loadBtn').disabled && document.querySelector('#status').textContent.includes('解析失败测试')`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#player').getAttribute('src')`),null);
    await win.webContents.executeJavaScript(`window.videoAPI.play=async()=>({...${JSON.stringify(media)},videoUrl:${JSON.stringify(media.videoUrl+'/missing')}});document.querySelector('.episode').click();true`);
    await until(win,`document.querySelector('#status').textContent.includes('媒体读取或解码失败')`);
    await win.webContents.executeJavaScript(`window.__cancelled=false;window.videoAPI.cancel=()=>{window.__cancelled=true};window.videoAPI.list=()=>new Promise(resolve=>setTimeout(()=>resolve({title:'取消结果',episodes:[],platform:'测试'}),600));document.querySelector('#loadBtn').click();document.querySelector('#cancelBtn').click();true`);
    await until(win,`window.__cancelled && !document.querySelector('#loadBtn').disabled`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#status').textContent`),'已取消解析。');
    await win.webContents.executeJavaScript(`window.videoAPI.checkEngine=async()=>({available:false,message:'需要 Python 3.10 或更高版本。'});document.querySelector('#resetPythonBtn').click();true`);
    await until(win,`document.querySelector('#status').textContent.includes('需要 Python')`);
    console.log('视频解析插件：真实 PluginManager 标题栏三个按钮未悬停时可见、隐藏加载、MP4 解码/拖动、选集/连续播放、原站派发、错误/取消、设置与三尺寸布局通过。');
    app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
  finally{if(win&&!win.isDestroyed())win.destroy();proxy?.stop();if(origin){origin.closeAllConnections();origin.close();}cleanup();}
})();
