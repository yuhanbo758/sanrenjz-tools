'use strict';
const { createParserService } = require('./parser-service');
const { createMediaProxy } = require('./media-proxy');
const parser = createParserService();
const proxy = createMediaProxy();
const methods = {
  checkEngine: input => parser.detectPython(String(input || '')),
  list: input => parser.list(input),
  play: async id => proxy.setPlayback(await parser.resolve(id)),
  cancel: () => { parser.cancel(); proxy.cancel(); }
};
function dispose() { parser.dispose(); proxy.stop(); process.exit(0); }
process.on('message', async message => {
  if (message?.method === 'dispose') { dispose(); return; }
  const method = methods[message?.method];
  if (!method || typeof message.id !== 'number') return;
  try { const result = await method(message.value); if (process.connected) process.send({id:message.id,result}); }
  catch(error) { if (process.connected) process.send({id:message.id,error:error.message || '解析服务失败。'}); }
});
// 随窗口 IPC 管道退出，确保宿主崩溃时也清理解析进程与本地监听端口。
process.on('disconnect', dispose);
process.on('SIGTERM', dispose);
