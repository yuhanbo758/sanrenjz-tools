const assert = require('assert');
const http = require('http');
const { OpenCodeRuntime, buildPrompt, parseProviderCatalog } = require('../app/plugin_runtime/opencode-runtime');

const catalog = {
  connected: ['openai', 'custom'],
  all: [
    {
      id: 'openai', name: 'OpenAI', models: {
        'gpt-codex': { name: 'GPT Codex', reasoning: true, attachment: true, limit: { context: 200000 }, modalities: { input: ['text', 'image'], output: ['text'] } }
      }
    },
    {
      id: 'custom', name: 'Custom', models: {
        chat: { name: 'Chat', reasoning: false, attachment: false, limit: { context: 32000 } }
      }
    },
    { id: 'offline', name: 'Offline', models: { hidden: { name: 'Hidden' } } }
  ]
};

const parsed = parseProviderCatalog(catalog);
assert.deepStrictEqual(parsed.map(provider => provider.id).sort(), ['custom', 'openai']);
assert.deepStrictEqual(parsed.find(provider => provider.id === 'openai').models[0].capabilities, ['text', 'vision']);

const prompt = buildPrompt([
  { role: 'system', content: 'system rule' },
  { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }
]);
assert.ok(prompt.system.includes('Do not call tools'));
assert.strictEqual(prompt.parts[0].text, 'User:\nhello');
assert.strictEqual(prompt.parts[1].mime, 'image/png');

let createdBody;
let promptBody;
let deleted = false;
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && request.url === '/provider') return response.end(JSON.stringify(catalog));
    if (request.method === 'POST' && request.url === '/session') {
      createdBody = body;
      return response.end(JSON.stringify({ id: 'session-1' }));
    }
    if (request.method === 'POST' && request.url === '/session/session-1/message') {
      promptBody = body;
      return response.end(JSON.stringify({ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'done' }] }));
    }
    if (request.method === 'DELETE' && request.url === '/session/session-1') {
      deleted = true;
      return response.end('true');
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const runtime = new OpenCodeRuntime({ serverUrl: `http://127.0.0.1:${port}` });
    const providers = await runtime.listModels();
    assert.strictEqual(providers.length, 2);
    const result = await runtime.complete({
      requestId: 'test', providerId: 'openai', modelId: 'gpt-codex',
      messages: [{ role: 'user', content: 'hello' }]
    });
    assert.strictEqual(result.text, 'done');
    assert.deepStrictEqual(createdBody.permission, [{ permission: '*', pattern: '*', action: 'deny' }]);
    assert.deepStrictEqual(promptBody.model, { providerID: 'openai', modelID: 'gpt-codex' });
    assert.deepStrictEqual(promptBody.tools, {});
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.strictEqual(deleted, true);
    console.log('OpenCode runtime tests passed: connected catalog, Codex model routing, denied tools, cleanup');
  } finally {
    server.close();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
