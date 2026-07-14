const { ipcRenderer } = require('electron');

const STORAGE_NAME = 'AI 共享配置中心';
const CONFIG_KEY = 'runtime-config';
const DEFAULT_CONFIG = {
  schemaVersion: 1,
  providers: [{
    id: 'openai', name: 'OpenAI 兼容服务', baseUrl: 'https://api.openai.com/v1',
    models: [{ id: 'gpt-4o-mini', label: 'GPT-4o mini', capabilities: ['text', 'vision'] }]
  }],
  selections: { text: { providerId: 'openai', modelId: 'gpt-4o-mini' }, vision: { providerId: 'openai', modelId: 'gpt-4o-mini' } },
  timeoutMs: 60000
};

const activeRequests = new Map();

function safeClone(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeBaseUrl(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function errorMessage(error) {
  if (error?.name === 'AbortError') return '请求已取消';
  return error instanceof Error ? error.message : String(error || '未知错误');
}

async function getConfig() {
  const stored = await ipcRenderer.invoke('plugin-storage-get-async', STORAGE_NAME, CONFIG_KEY);
  if (!stored || stored.schemaVersion !== 1) return safeClone(DEFAULT_CONFIG);
  return { ...safeClone(DEFAULT_CONFIG), ...stored };
}

async function saveConfig(config) {
  const next = { ...safeClone(config), schemaVersion: 1 };
  await ipcRenderer.invoke('plugin-storage-set-async', STORAGE_NAME, CONFIG_KEY, next);
  return next;
}

async function saveProviderSecret(providerId, value) {
  return ipcRenderer.invoke('plugin-secret-set', STORAGE_NAME, `provider:${providerId}`, String(value || ''));
}

async function hasProviderSecret(providerId) {
  const value = await ipcRenderer.invoke('plugin-secret-get', STORAGE_NAME, `provider:${providerId}`);
  return Boolean(value);
}

function resolveModel(config, capability, selection) {
  const chosen = selection || config.selections?.[capability] || config.selections?.text;
  const provider = config.providers.find(item => item.id === chosen?.providerId);
  const model = provider?.models?.find(item => item.id === chosen?.modelId);
  if (!provider || !model) throw new Error('请先在供应商设置中选择可用模型');
  if (!model.capabilities?.includes(capability)) throw new Error(`模型 ${model.label || model.id} 不支持 ${capability === 'vision' ? '图片理解' : '文本'}能力`);
  return { provider, model };
}

async function complete(request = {}, onChunk) {
  const requestId = String(request.requestId || `${Date.now()}-${Math.random()}`);
  if (activeRequests.has(requestId)) throw new Error('请求标识正在使用');
  const config = await getConfig();
  const capability = request.capability === 'vision' ? 'vision' : 'text';
  const { provider, model } = resolveModel(config, capability, request.selection);
  const secret = await ipcRenderer.invoke('plugin-secret-get', STORAGE_NAME, `provider:${provider.id}`);
  if (!secret) throw new Error(`请先为“${provider.name}”保存 API Key`);
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(50, Number(request.timeoutMs || config.timeoutMs || 60000)));
  try {
    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ model: model.id, messages: request.messages || [], temperature: request.temperature ?? 0.3, stream: request.stream !== false })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(response.status === 401 ? '鉴权失败，请检查 API Key' : `模型服务返回 ${response.status}：${detail.slice(0, 240)}`);
    }
    if (request.stream === false) {
      const data = await response.json();
      return { requestId, text: data.choices?.[0]?.message?.content || '', model: model.id };
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('模型服务未返回可读流');
    const decoder = new TextDecoder();
    let buffer = ''; let output = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const token = JSON.parse(data).choices?.[0]?.delta?.content || '';
        output += token;
        if (token && onChunk) onChunk({ requestId, token, text: output });
      }
    }
    return { requestId, text: output, model: model.id };
  } catch (error) {
    throw new Error(timedOut ? '请求超时，请稍后重试' : errorMessage(error));
  } finally {
    clearTimeout(timeout);
    activeRequests.delete(requestId);
  }
}

function cancel(requestId) {
  const controller = activeRequests.get(String(requestId || ''));
  if (!controller) return false;
  controller.abort();
  return true;
}

function createAiRuntime(pluginName, emitChunk) {
  return {
    getConfig, saveConfig, saveProviderSecret, hasProviderSecret,
    removeProviderSecret: providerId => ipcRenderer.invoke('plugin-secret-remove', STORAGE_NAME, `provider:${providerId}`),
    complete: request => complete(request, emitChunk), cancel,
    storage: {
      get: key => ipcRenderer.invoke('plugin-storage-get-async', pluginName, key),
      set: (key, value) => ipcRenderer.invoke('plugin-storage-set-async', pluginName, key, value)
    }
  };
}

module.exports = { createAiRuntime, DEFAULT_CONFIG };
