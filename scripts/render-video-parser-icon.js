'use strict';
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '..', 'app', 'software', 'sanrenjz-tools-video-parser');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, transparent: true, frame: false, width: 256, height: 256, useContentSize: true, webPreferences: { offscreen: true, contextIsolation: true } });
  try {
    const svg = fs.readFileSync(path.join(directory, 'logo.svg'), 'utf8');
    await win.loadURL(`data:text/html,${encodeURIComponent(`<style>html,body{margin:0;overflow:hidden}</style><img width="256" height="256" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`)}`);
    await win.webContents.executeJavaScript('document.images[0].decode().then(()=>true)');
    const source = nativeImage.createFromBuffer((await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(directory, 'logo.png'), source.toPNG());
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const images = sizes.map(size => source.resize({width:size,height:size}).toPNG());
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    images.forEach((buffer, index) => {
      const entry = 6 + index * 16;
      header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(buffer.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += buffer.length;
    });
    fs.writeFileSync(path.join(directory, 'logo.ico'), Buffer.concat([header, ...images]));
    console.log('视频解析播放 PNG/ICO 图标生成完成。');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
