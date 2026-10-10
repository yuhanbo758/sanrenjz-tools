'use strict';
const http = require('http');
const { WebSocket } = require('ws');
const { Phone } = require('./remote-main-live');
async function connectHost() {
  const targets = await new Promise((resolve, reject) => http.get('http://127.0.0.1:9231/json/list', response => {
    let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  }).on('error', reject));
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return new Phone(socket);
}
if (require.main === module) connectHost().then(async host => {
  try { console.log(JSON.stringify(await host.evaluate(process.argv[2] || 'Boolean(global.mobileAcceptance)'))); }
  finally { host.socket.close(); }
}).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { connectHost };
