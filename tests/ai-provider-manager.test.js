const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'plugin_runtime', 'ai-provider-manager.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'ai-provider-manager.js' });

const models = context.window.AIProviderManager.parseModels([
  'glm-4-flash | GLM-4 Flash | text',
  'glm-4v-plus | GLM-4V Plus | text,vision',
  'deepseek-chat | DeepSeek Chat'
].join('\n'));

assert.deepStrictEqual(JSON.parse(JSON.stringify(models)), [
  { id: 'glm-4-flash', label: 'GLM-4 Flash', capabilities: ['text'] },
  { id: 'glm-4v-plus', label: 'GLM-4V Plus', capabilities: ['text', 'vision'] },
  { id: 'deepseek-chat', label: 'DeepSeek Chat', capabilities: ['text'] }
]);

console.log('AI provider manager tests passed: multi-provider model parsing');
