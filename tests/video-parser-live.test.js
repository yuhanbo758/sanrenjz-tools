'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
if(process.env.VIDEO_LIVE_RESUME==='1')process.env.VIDEO_TEST_DISK_STORAGE='1';
const {app,openPlugin,until,output,cleanup}=require('./video-parser-harness');
if(process.env.VIDEO_LIVE_RESUME==='1'){
  const log=console.log;
  console.log=(...args)=>{if(!/^(设置插件存储|获取插件存储|存储结果|存储保存结果|插件 视频解析播放 存储数据)/.test(String(args[0])))log(...args);};
}
app.disableHardwareAcceleration();
let win;
const report={checkedAt:new Date().toISOString(),results:[]};
const reportName=process.env.VIDEO_LIVE_PLATFORM?`live-${({'爱奇艺':'iqiyi','优酷':'youku','土豆':'tudou'})[process.env.VIDEO_LIVE_PLATFORM]||'filtered'}-report.json`:'live-report.json';
(async()=>{
  try{
    win=await openPlugin();
    win.webContents.on('console-message',(_event,_level,message)=>{if(message.startsWith('媒体')||message.includes('Content Security'))console.log(message);});
    for(const sample of [
      {platform:'B 站多 P',url:'https://www.bilibili.com/video/BV1bK411W797',minEpisodes:2},
      {platform:'腾讯公开视频',url:'https://v.qq.com/x/page/o3013za7cse.html',minEpisodes:1},
      {platform:'爱奇艺剧集',url:'https://www.iqiyi.com/v_mo3lbdn60s.html',minEpisodes:26},
      {platform:'优酷公开视频',url:'https://v.youku.com/v_show/id_XNTA2NTA0MjA1Mg==.html',minEpisodes:1},
      {platform:'土豆公开视频',url:'https://play.tudou.com/v_show/id_XNjAxNjI2OTU3Ng==.html',minEpisodes:1}
    ].filter(sample=>!process.env.VIDEO_LIVE_PLATFORM||sample.platform.includes(process.env.VIDEO_LIVE_PLATFORM))){
      await win.webContents.executeJavaScript(`document.querySelector('#sourceInput').value=${JSON.stringify(sample.url)};document.querySelector('#loadBtn').click();true`);
      await until(win,`!document.querySelector('#loadBtn').disabled`,75000);
      const count=await win.webContents.executeJavaScript(`document.querySelectorAll('.episode').length`);
      console.log(sample.platform,'目录:',count);
      assert.ok(count>=sample.minEpisodes,`${sample.platform} 没有取得选集`);
      if(sample.platform.startsWith('爱奇艺')){
        assert.equal(count,26);
        const catalog=await win.webContents.executeJavaScript(`({title:document.querySelector('#collectionTitle').textContent,first:document.querySelector('.episode').textContent,last:document.querySelectorAll('.episode')[25].textContent})`);
        assert.equal(catalog.title,'择天记');assert.match(catalog.last,/第26集/);assert.match(catalog.last,/会员\/付费/);
        await win.webContents.executeJavaScript(`document.querySelector('#episodeFilter').value='第26集';document.querySelector('#episodeFilter').dispatchEvent(new Event('input'));true`);
        assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.episode').length`),1);
        await win.webContents.executeJavaScript(`document.querySelector('#episodeFilter').value='';document.querySelector('#episodeFilter').dispatchEvent(new Event('input'));true`);
        report.iqiyiCatalog=catalog;
      }
      await win.webContents.executeJavaScript(`document.querySelector('.episode').click();true`,true);
      await until(win,`!document.querySelector('#loadBtn').disabled`,75000);
      console.log(sample.platform,'媒体 URL 就绪');
      await until(win,`document.querySelector('#player').currentTime>2 && document.querySelector('#player').webkitDecodedFrameCount>0`,35000);
      const media=await win.webContents.executeJavaScript(`(()=>{const v=document.querySelector('#player'),a=document.querySelector('#audioTrack');return {duration:v.duration,videoTime:v.currentTime,decodedFrames:v.webkitDecodedFrameCount,videoWidth:v.videoWidth,embeddedAudioBytes:v.webkitAudioDecodedByteCount,audioUsed:!!a.getAttribute('src'),audioReady:a.readyState,audioTime:a.currentTime,audioPaused:a.paused,title:document.querySelector('#nowTitle').textContent,status:document.querySelector('#status').textContent}})()`);
      assert.ok(media.videoWidth>0&&media.duration>0);
      if(media.audioUsed){assert.ok(media.audioReady>=2&&media.audioTime>0&&!media.audioPaused,JSON.stringify(media));assert.ok(Math.abs(media.audioTime-media.videoTime)<1,JSON.stringify(media));}
      else assert.ok(media.embeddedAudioBytes>0,`${sample.platform} 必须实际解码内置音轨`);
      report.results.push({platform:sample.platform,sampleUrl:sample.url,episodeCount:count,...media});
      console.log(JSON.stringify(report.results.at(-1)));
      await win.webContents.executeJavaScript(`document.querySelector('#player').pause();document.querySelector('#player').currentTime=Math.min(20,document.querySelector('#player').duration/2);true`);
      await until(win,`!document.querySelector('#player').seeking && document.querySelector('#player').currentTime>3`,20000);
      if(sample.platform.startsWith('B')){
        fs.writeFileSync(path.join(output,'bilibili-live.png'),(await win.webContents.capturePage()).toPNG());
        await win.webContents.executeJavaScript(`document.querySelector('#nextBtn').click();true`,true);
        await until(win,`!document.querySelector('#loadBtn').disabled`,75000);
        await until(win,`document.querySelector('.episode.active')?.dataset.index==='1' && document.querySelector('#player').currentTime>1 && document.querySelector('#player').webkitDecodedFrameCount>0`,35000);
        report.results.at(-1).nextEpisode=await win.webContents.executeJavaScript(`({title:document.querySelector('#nowTitle').textContent,decodedFrames:document.querySelector('#player').webkitDecodedFrameCount,videoTime:document.querySelector('#player').currentTime,audioTime:document.querySelector('#audioTrack').currentTime})`);
        assert.ok(report.results.at(-1).nextEpisode.audioTime>0);
        console.log('B 站直接切换到下一 P 并播放成功。');
      }
      if(!sample.platform.startsWith('B')){
        await win.webContents.executeJavaScript(`document.querySelector('#player').play();true`);
        await until(win,`document.querySelector('#player').currentTime>21 && document.querySelector('#player').webkitDecodedFrameCount>${media.decodedFrames}`,30000);
        report.results.at(-1).afterSeek=await win.webContents.executeJavaScript(`({time:document.querySelector('#player').currentTime,frames:document.querySelector('#player').webkitDecodedFrameCount,audioBytes:document.querySelector('#player').webkitAudioDecodedByteCount})`);
        fs.writeFileSync(path.join(output,`${sample.platform.startsWith('爱奇艺')?'iqiyi':sample.platform.startsWith('优酷')?'youku':sample.platform.startsWith('土豆')?'tudou':'tencent'}-live.png`),(await win.webContents.capturePage()).toPNG());
      }
      if(sample.platform.startsWith('爱奇艺')){
        await win.webContents.executeJavaScript(`document.querySelector('#nextBtn').click();true`,true);
        await until(win,`!document.querySelector('#loadBtn').disabled`,75000);
        await until(win,`document.querySelector('.episode.active')?.dataset.index==='1' && document.querySelector('#player').currentTime>2 && document.querySelector('#player').webkitDecodedFrameCount>0 && document.querySelector('#player').webkitAudioDecodedByteCount>0`,35000);
        report.results.at(-1).nextEpisode=await win.webContents.executeJavaScript(`({title:document.querySelector('#nowTitle').textContent,decodedFrames:document.querySelector('#player').webkitDecodedFrameCount,videoTime:document.querySelector('#player').currentTime,audioBytes:document.querySelector('#player').webkitAudioDecodedByteCount})`);
        assert.match(report.results.at(-1).nextEpisode.title,/第2集/);
        await win.webContents.executeJavaScript(`document.querySelectorAll('.episode')[2].click();true`,true);
        await until(win,`!document.querySelector('#loadBtn').disabled`,75000);
        await until(win,`document.querySelector('.episode.active')?.dataset.index==='2' && document.querySelector('#player').currentTime>2 && document.querySelector('#player').webkitDecodedFrameCount>0 && document.querySelector('#player').webkitAudioDecodedByteCount>0`,35000);
        report.results.at(-1).selectedEpisode=await win.webContents.executeJavaScript(`({title:document.querySelector('#nowTitle').textContent,decodedFrames:document.querySelector('#player').webkitDecodedFrameCount,videoTime:document.querySelector('#player').currentTime,audioBytes:document.querySelector('#player').webkitAudioDecodedByteCount})`);
        assert.match(report.results.at(-1).selectedEpisode.title,/第3集/);
        fs.writeFileSync(path.join(output,'iqiyi-episodes-live.png'),(await win.webContents.capturePage()).toPNG());
        console.log('爱奇艺 26 集目录、筛选第26集、下一集与直接选择第3集的画面/音轨解码通过。');
        if(process.env.VIDEO_LIVE_RESUME==='1'){
          await win.webContents.executeJavaScript(`document.querySelector('#player').pause();document.querySelector('#player').currentTime=12;true`);
          await until(win,`document.querySelector('.episode.active').textContent.includes('看到 0:12')`,10000);
          await win.webContents.executeJavaScript(`document.querySelector('#favoriteBtn').click();true`);
          await until(win,`document.querySelector('#favoriteBtn').getAttribute('aria-pressed')==='true' && !document.querySelector('#favoriteBtn').disabled`);
          const closed=new Promise(resolve=>win.once('closed',resolve));win.close();await closed;
          win=await openPlugin();
          assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('#favoritesList .library-card').length`),1);
          await win.webContents.executeJavaScript(`document.querySelector('#historyList [data-action="resume"]').click();true`,true);
          await until(win,`!document.querySelector('#loadBtn').disabled`,75000);
          await until(win,`document.querySelector('.episode.active')?.dataset.index==='2' && document.querySelector('#player').currentTime>12.5 && document.querySelector('#player').webkitDecodedFrameCount>0 && document.querySelector('#player').webkitAudioDecodedByteCount>0`,35000);
          report.results.at(-1).reopenedResume=await win.webContents.executeJavaScript(`({title:document.querySelector('#nowTitle').textContent,time:document.querySelector('#player').currentTime,frames:document.querySelector('#player').webkitDecodedFrameCount,audioBytes:document.querySelector('#player').webkitAudioDecodedByteCount,episodeCount:document.querySelectorAll('.episode').length,favorites:document.querySelectorAll('#favoritesList .library-card').length})`);
          assert.match(report.results.at(-1).reopenedResume.title,/第3集/);
          await win.webContents.executeJavaScript(`document.querySelector('#player').pause();document.querySelector('#historyTab').click();true`);
          fs.writeFileSync(path.join(output,'iqiyi-history-live.png'),(await win.webContents.capturePage()).toPNG());
          console.log('爱奇艺原站 HLS：第3集观看记录和收藏真实落盘，关闭后新窗口重新解析并从12秒续播、画面及音轨解码通过。');
        }
      }
    }
    fs.writeFileSync(path.join(output,reportName),JSON.stringify(report,null,2)+'\n','utf8');
    console.log('视频真实解析 → preload → 本地媒体代理 → Electron 解码帧/音轨及拖动通过。');
    app.exit(0);
  }catch(error){report.failure=error.message;if(win&&!win.isDestroyed())report.mediaState=await win.webContents.executeJavaScript(`(()=>{const v=document.querySelector('#player'),a=document.querySelector('#audioTrack');return{videoReady:v.readyState,videoNetwork:v.networkState,videoError:v.error?.code,videoPaused:v.paused,audioReady:a.readyState,audioError:a.error?.code,audioPaused:a.paused,status:document.querySelector('#status').textContent}})()`);fs.writeFileSync(path.join(output,reportName),JSON.stringify(report,null,2)+'\n','utf8');console.error(error,report.mediaState);app.exit(1);}
  finally{if(win&&!win.isDestroyed())win.destroy();cleanup();}
})();
