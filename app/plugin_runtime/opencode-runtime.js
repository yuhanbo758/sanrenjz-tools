const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const START_TIMEOUT_MS = 20000;
const MAX_ERROR_LENGTH = 600;
const TRANSIENT_RETRY_ATTEMPTS = 3;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function trimError(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_LENGTH);
}

function requestError(status, detail) {
  const message = trimError(detail) || `HTTP ${status}`;
  return new Error(`OpenCode 返回 ${status}：${message}`);
}

function isRetryableOpenCodeError(error) {
  const message = trimError(error?.message || error);
  return /unknown certificate verification error|certificate verification failed|unable to verify the first certificate|econnreset|etimedout|eai_again|fetch failed|socket hang up|connection reset/i.test(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!response.ok) throw requestError(response.status, text);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error('OpenCode 返回了无效 JSON');
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function executableCandidates() {
  const values = [];
  if (process.env.OPENCODE_BIN) values.push(process.env.OPENCODE_BIN);
  if (process.platform === 'win32') {
    if (process.env.APPDATA) values.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'));
    if (process.env.APPDATA) values.push(path.join(process.env.APPDATA, 'npm', 'opencode.cmd'));
    values.push('opencode.cmd');
  } else {
    values.push('opencode');
  }
  return [...new Set(values.filter(Boolean))];
}

function resolveExecutable() {
  for (const candidate of executableCandidates()) {
    if (!path.isAbsolute(candidate) || fs.existsSync(candidate)) return candidate;
  }
  throw new Error('未找到 OpenCode。请先安装 OpenCode CLI，并至少完成一个供应商认证');
}

function modelCapabilities(model) {
  // OpenCode 旧目录使用 modalities.input 数组；当前 /provider 返回
  // capabilities.input 对象。两种格式都要读取，否则 OpenAI OAuth 模型会被误标为纯文本。
  const legacyInput = Array.isArray(model?.modalities?.input) ? model.modalities.input : [];
  const currentCapabilities = model?.capabilities && typeof model.capabilities === 'object' ? model.capabilities : {};
  const currentInput = currentCapabilities.input && typeof currentCapabilities.input === 'object'
    ? Object.entries(currentCapabilities.input).filter(([, enabled]) => enabled === true).map(([type]) => type)
    : [];
  const input = [...new Set([...legacyInput, ...currentInput])];
  const capabilities = ['text'];
  if (input.some(value => value === 'image' || value === 'video' || value === 'pdf') || model?.attachment === true || currentCapabilities.attachment === true) {
    capabilities.push('vision');
  }
  if (input.includes('audio')) capabilities.push('audio');
  return capabilities;
}

function parseProviderCatalog(payload) {
  if (!payload || !Array.isArray(payload.all)) throw new Error('OpenCode 模型目录格式无效');
  const connected = new Set(Array.isArray(payload.connected) ? payload.connected.map(String) : []);
  return payload.all
    .filter(provider => provider && connected.has(String(provider.id || '')))
    .map(provider => ({
      id: String(provider.id),
      name: String(provider.name || provider.id),
      transport: 'opencode',
      source: 'opencode',
      managed: true,
      baseUrl: `opencode://${provider.id}`,
      models: Object.entries(provider.models || {}).map(([key, model]) => ({
        id: String(key),
        label: String(model?.name || model?.id || key),
        capabilities: modelCapabilities(model),
        status: String(model?.status || ''),
        reasoning: Boolean(model?.reasoning),
        contextWindow: Number(model?.limit?.context || 0) || undefined
      })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
    }))
    .filter(provider => provider.models.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function contentParts(content) {
  if (typeof content === 'string') return { text: content, files: [] };
  if (!Array.isArray(content)) return { text: String(content ?? ''), files: [] };
  const text = [];
  const files = [];
  for (const part of content) {
    if (part?.type === 'text' && part.text) text.push(String(part.text));
    if (part?.type === 'image_url' && part.image_url?.url) {
      const url = String(part.image_url.url);
      const match = /^data:([^;,]+)[^,]*,/i.exec(url);
      files.push({ type: 'file', mime: match?.[1] || 'image/png', filename: 'image', url });
    }
  }
  return { text: text.join('\n'), files };
}

function buildPrompt(messages) {
  const system = [];
  const transcript = [];
  const files = [];
  for (const message of messages || []) {
    const parsed = contentParts(message?.content);
    if (message?.role === 'system') system.push(parsed.text);
    else transcript.push(`${message?.role === 'assistant' ? 'Assistant' : 'User'}:\n${parsed.text}`);
    files.push(...parsed.files);
  }
  const prompt = transcript.join('\n\n').trim();
  return {
    system: [
      ...system.filter(Boolean),
      'This is a direct model-completion request. Do not call tools or modify files. Answer only from the supplied conversation and attachments.'
    ].join('\n\n'),
    parts: [{ type: 'text', text: prompt || '请直接回答。' }, ...files]
  };
}

class OpenCodeRuntime {
  constructor(options = {}) {
    this.fetch = options.fetch || global.fetch;
    this.spawn = options.spawn || spawn;
    this.serverUrl = String(options.serverUrl || '').replace(/\/+$/, '');
    this.child = null;
    this.starting = null;
    this.active = new Map();
  }

  async start() {
    if (this.serverUrl) return this.serverUrl;
    if (this.starting) return this.starting;
    this.starting = this._start();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async _start() {
    if (typeof this.fetch !== 'function') throw new Error('当前运行环境不支持访问 OpenCode Server');
    const port = await getFreePort();
    const executable = resolveExecutable();
    const url = `http://127.0.0.1:${port}`;
    const child = this.spawn(executable, ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--log-level', 'ERROR'], {
      cwd: os.homedir(),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child = child;
    let launchError = '';
    child.once('error', error => { launchError = error.message; });
    child.once('exit', code => {
      if (this.child === child) {
        this.child = null;
        if (this.serverUrl === url) this.serverUrl = '';
      }
      if (!this.serverUrl && !launchError) launchError = `OpenCode Server 已退出（${code ?? 'unknown'}）`;
    });
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (launchError) throw new Error(`无法启动 OpenCode：${launchError}`);
      try {
        const response = await this.fetch(`${url}/provider`, { headers: { Accept: 'application/json' } });
        if (response.ok) {
          if (this.child !== child) throw new Error(launchError || 'OpenCode Server 已退出');
          this.serverUrl = url;
          return url;
        }
      } catch (_) {}
      await delay(150);
    }
    this.stop();
    throw new Error('启动 OpenCode Server 超时');
  }

  async request(pathname, options = {}) {
    const baseUrl = await this.start();
    const response = await this.fetch(`${baseUrl}${pathname}`, options);
    return readJson(response);
  }

  async listModels() {
    return parseProviderCatalog(await this.request('/provider', { headers: { Accept: 'application/json' } }));
  }

  async complete(request = {}) {
    const requestId = String(request.requestId || `${Date.now()}-${Math.random()}`);
    if (this.active.has(requestId)) throw new Error('OpenCode 请求标识正在使用');
    const controller = new AbortController();
    this.active.set(requestId, { controller, sessionId: '' });
    try {
      const prompt = buildPrompt(request.messages);
      for (let attempt = 0; attempt < TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
        let sessionId = '';
        try {
          const session = await this.request('/session', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'sanrenjz-tools AI 请求',
              // 供应商接入只需要模型采样，禁止 OpenCode Agent 触发任何本地工具。
              permission: [{ permission: '*', pattern: '*', action: 'deny' }]
            })
          });
          sessionId = String(session?.id || '');
          if (!sessionId) throw new Error('OpenCode 未返回会话 ID');
          this.active.get(requestId).sessionId = sessionId;
          const result = await this.request(`/session/${encodeURIComponent(sessionId)}/message`, {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: { providerID: String(request.providerId || ''), modelID: String(request.modelId || '') },
              tools: {},
              system: prompt.system,
              parts: prompt.parts
            })
          });
          if (result?.info?.error) {
            const detail = result.info.error?.data?.message || result.info.error?.name || '模型调用失败';
            throw new Error(`OpenCode 模型调用失败：${trimError(detail)}`);
          }
          const text = (result?.parts || [])
            .filter(part => part?.type === 'text' && !part.ignored)
            .map(part => String(part.text || ''))
            .join('');
          if (!text) throw new Error('OpenCode 模型未返回文本内容');
          return { requestId, text, model: String(request.modelId || ''), provider: String(request.providerId || '') };
        } catch (error) {
          if (error?.name === 'AbortError' || controller.signal.aborted) throw error;
          if (attempt >= TRANSIENT_RETRY_ATTEMPTS - 1 || !isRetryableOpenCodeError(error)) throw error;
          // OpenCode 偶发在首个上游连接上返回临时证书错误；保留 TLS 校验并用新会话短暂重试。
          await delay(300 * (attempt + 1));
        } finally {
          if (this.active.has(requestId)) this.active.get(requestId).sessionId = '';
          if (sessionId) {
            this.request(`/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      }
      throw new Error('OpenCode 模型调用失败');
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('请求已取消');
      throw error;
    } finally {
      this.active.delete(requestId);
    }
  }

  cancel(requestId) {
    const active = this.active.get(String(requestId || ''));
    if (!active) return false;
    if (active.sessionId && this.serverUrl) {
      this.fetch(`${this.serverUrl}/session/${encodeURIComponent(active.sessionId)}/abort`, { method: 'POST' }).catch(() => {});
    }
    active.controller.abort();
    return true;
  }

  stop() {
    for (const active of this.active.values()) active.controller.abort();
    this.active.clear();
    const child = this.child;
    this.child = null;
    this.serverUrl = '';
    if (child && !child.killed) child.kill();
  }
}

module.exports = { OpenCodeRuntime, buildPrompt, isRetryableOpenCodeError, parseProviderCatalog };
