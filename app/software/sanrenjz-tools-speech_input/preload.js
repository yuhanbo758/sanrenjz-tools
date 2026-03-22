const { ipcRenderer, clipboard, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');

const PLUGIN_NAME = 'AI语音输入法';

window.electronAPI = {
    storage: {
        get: (key) => ipcRenderer.sendSync('plugin-storage-get', PLUGIN_NAME, key),
        set: (key, value) => ipcRenderer.sendSync('plugin-storage-set', PLUGIN_NAME, key, value),
        remove: (key) => ipcRenderer.sendSync('plugin-storage-remove', PLUGIN_NAME, key)
    },
    window: {
        hide: () => ipcRenderer.invoke('minimize-plugin-window', PLUGIN_NAME, { keepAlive: true, source: 'hide-button' }),
        close: () => ipcRenderer.invoke('close-plugin-window', PLUGIN_NAME),
        minimize: () => ipcRenderer.invoke('minimize-plugin-window', PLUGIN_NAME),
        maximize: () => ipcRenderer.invoke('maximize-plugin-window', PLUGIN_NAME),
        togglePin: () => ipcRenderer.invoke('toggle-plugin-pin-window', PLUGIN_NAME),
        restorePreviousFocus: () => ipcRenderer.invoke('restore-previous-focus'),
        createIndicatorWindow: () => ipcRenderer.invoke('create-plugin-indicator-window', PLUGIN_NAME),
        closeIndicatorWindow: () => ipcRenderer.invoke('close-plugin-indicator-window', PLUGIN_NAME)
    },
    action: {
        copy: (text) => clipboard.writeText(text),
        insert: async (content) => {
            const text = (content ?? '').toString();
            if (!text) return { success: false, message: '内容为空' };

            try {
                clipboard.writeText(text);
            } catch (e) {
                return { success: false, message: `复制到剪贴板失败: ${e && e.message ? e.message : e}` };
            }

            try {
                await ipcRenderer.invoke('minimize-plugin-window', PLUGIN_NAME);
            } catch (_) {
            }

            try {
                await ipcRenderer.invoke('restore-previous-focus');
            } catch (_) {
            }

            await new Promise(resolve => setTimeout(resolve, 160));

            const psScript = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
            const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

            try {
                await new Promise((resolve, reject) => {
                    const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Sta', '-EncodedCommand', encoded], {
                        windowsHide: true,
                        stdio: ['ignore', 'ignore', 'pipe']
                    });

                    let stderr = '';
                    proc.stderr.setEncoding('utf8');
                    proc.stderr.on('data', (chunk) => {
                        stderr += chunk;
                    });

                    proc.on('error', reject);
                    proc.on('exit', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(stderr || `PowerShell exited with code ${code}`));
                    });
                });
            } catch (e) {
                return { success: false, message: `模拟粘贴失败: ${e && e.message ? e.message : e}` };
            }

            return { success: true };
        }
    },
    utils: {
        openExternal: (url) => shell.openExternal(url)
    },
    qwen: {
        asrTranscribe: async ({ apiKey, model, audioBase64, mimeType }) => {
            const pickedModel = model || 'qwen3-asr-flash';

            if (pickedModel === 'paraformer-v2') {
                const buf = base64ToBuffer(audioBase64);
                return await transcribeRecordedFileWithUpload({ apiKey, model: pickedModel, fileBuffer: buf, mimeType: mimeType || 'audio/wav' });
            }

            if (pickedModel !== 'qwen3-asr-flash') {
                throw new Error(`当前仅支持 qwen3-asr-flash 与 paraformer-v2（收到: ${pickedModel}）`);
            }

            const raw = String(audioBase64 || '').trim();
            if (!raw) throw new Error('音频数据为空');

            const audioData = (/^https?:\/\//i.test(raw) || /^data:/i.test(raw))
                ? raw
                : `data:${mimeType || 'audio/wav'};base64,${raw}`;

            const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
            const payload = {
                model: 'qwen3-asr-flash',
                messages: [
                    { role: 'system', content: [{ text: '' }] },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'input_audio',
                                input_audio: {
                                    data: audioData
                                }
                            }
                        ]
                    }
                ],
                stream: false,
                extra_body: {
                    asr_options: {
                        enable_itn: false
                    }
                }
            };

            const data = await fetchJson(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`
                },
                payload,
                timeoutMs: 120000
            });

            const text = extractDashscopeText(data);
            if (!text) {
                throw new Error('Qwen-ASR 未返回可用转写文本');
            }
            return text;
        },
        textGenerate: async ({ apiKey, model, systemPrompt, userText }) => {
            const messages = [];
            if (systemPrompt && String(systemPrompt).trim()) {
                messages.push({ role: 'system', content: String(systemPrompt) });
            }
            messages.push({ role: 'user', content: String(userText || '') });

            const payload = {
                model: model || 'qwen-plus',
                input: { messages },
                parameters: {
                    result_format: 'message',
                    temperature: 0.2
                }
            };

            const data = await dashscopePost(apiKey, '/api/v1/services/aigc/text-generation/generation', payload);
            return extractDashscopeText(data) || String(userText || '');
        }
    },
    siliconflow: {
        transcribe: async ({ apiKey, model, audioBase64, mimeType }) => {
            const key = String(apiKey || '').trim();
            if (!key) throw new Error('硅基流动 API Key 未配置');

            const raw = String(audioBase64 || '').trim();
            if (!raw) throw new Error('音频数据为空');

            const fileBuffer = base64ToBuffer(raw);
            const out = await siliconflowTranscribeMultipart({
                apiKey: key,
                model: model || 'TeleAI/TeleSpeechASR',
                fileBuffer,
                mimeType: mimeType || 'audio/wav'
            });
            return (out || '').trim();
        }
    }
};

async function fetchWithTimeout(url, init, timeoutMs) {
    if (typeof fetch !== 'function') {
        throw new Error('当前运行环境不支持 fetch');
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 60000));
    try {
        const res = await fetch(url, { ...(init || {}), signal: controller.signal });
        return res;
    } finally {
        clearTimeout(t);
    }
}

async function fetchJson(url, { method = 'GET', headers, payload, timeoutMs = 60000 } = {}) {
    const res = await fetchWithTimeout(url, {
        method,
        headers: {
            Accept: 'application/json',
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
            ...(headers || {})
        },
        body: payload ? JSON.stringify(payload) : undefined
    }, timeoutMs);

    const text = await res.text();
    const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
    const data = ct.includes('application/json') ? safeJsonParse(text) : text;

    if (!res.ok) {
        const msg = (data && data.error && data.error.message)
            || (data && data.message)
            || (data && data.error && data.error.msg)
            || (typeof data === 'string' ? data : '')
            || `HTTP ${res.status}`;
        const detail = (data && typeof data === 'object') ? JSON.stringify(data).slice(0, 1200) : '';
        throw new Error(`HTTP ${res.status}: ${msg}${detail ? ` | ${detail}` : ''}`);
    }
    return data;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch (_) {
        return text;
    }
}

async function dashscopePost(apiKey, path, payload) {
    const url = `https://dashscope.aliyuncs.com${path}`;
    return await fetchJson(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`
        },
        payload,
        timeoutMs: 60000
    });
}

async function dashscopeRequest(apiKey, method, path, { payload, params, headers } = {}) {
    const qs = params && typeof params === 'object'
        ? buildQueryString(params)
        : '';
    const url = `https://dashscope.aliyuncs.com${path}${qs ? `?${qs}` : ''}`;
    return await fetchJson(url, {
        method: String(method || 'GET').toUpperCase(),
        headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(headers || {})
        },
        payload,
        timeoutMs: 60000
    });
}

function buildQueryString(params) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
            for (const item of v) {
                if (item === undefined || item === null) continue;
                usp.append(k, String(item));
            }
        } else {
            usp.append(k, String(v));
        }
    }
    return usp.toString();
}

function base64ToBuffer(b64) {
    if (!b64) return Buffer.alloc(0);
    return Buffer.from(String(b64), 'base64');
}

async function siliconflowTranscribeMultipart({ apiKey, model, fileBuffer, mimeType }) {
    const isWav = String(mimeType || '').toLowerCase().includes('wav');
    const fileName = `recording-${Date.now()}.${isWav ? 'wav' : 'webm'}`;
    const { body, contentType } = buildMultipartBody({
        fields: {
            model: model || 'TeleAI/TeleSpeechASR'
        },
        fileFieldName: 'file',
        fileName,
        fileBuffer,
        fileContentType: mimeType || 'audio/wav'
    });

    const res = await fetchWithTimeout('https://api.siliconflow.cn/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': contentType,
            'Content-Length': String(body.length)
        },
        body
    }, 120000);

    const text = await res.text();
    const data = safeJsonParse(text);

    if (!res.ok) {
        const msg = (data && data.error && data.error.message)
            || (data && data.message)
            || (typeof data === 'string' ? data : '')
            || `HTTP ${res.status}`;
        throw new Error(`HTTP ${res.status}: ${msg}`);
    }

    const outText = data && typeof data.text === 'string' ? data.text.trim() : '';
    if (!outText) {
        throw new Error('硅基流动未返回可用转写文本');
    }
    return outText;
}

function buildMultipartBody({ fields, fileFieldName, fileName, fileBuffer, fileContentType }) {
    const boundary = `----srjz-${crypto.randomBytes(12).toString('hex')}`;
    const chunks = [];
    const push = (s) => chunks.push(Buffer.from(s, 'utf8'));
    const crlf = '\r\n';

    for (const [k, v] of Object.entries(fields || {})) {
        push(`--${boundary}${crlf}`);
        push(`Content-Disposition: form-data; name="${k}"${crlf}${crlf}`);
        push(String(v ?? ''));
        push(crlf);
    }

    push(`--${boundary}${crlf}`);
    push(`Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"${crlf}`);
    push(`Content-Type: ${fileContentType || 'application/octet-stream'}${crlf}${crlf}`);
    chunks.push(Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer));
    push(crlf);
    push(`--${boundary}--${crlf}`);

    return {
        body: Buffer.concat(chunks),
        contentType: `multipart/form-data; boundary=${boundary}`
    };
}

async function getUploadPolicy(apiKey, model) {
    const data = await dashscopeRequest(apiKey, 'GET', '/api/v1/uploads', {
        params: { action: 'getPolicy', model }
    });
    const out = (data && data.data) ? data.data : data;
    if (!out || !out.upload_host || !out.upload_dir || !out.policy || !out.signature) {
        throw new Error('获取上传凭证失败：响应缺少必要字段');
    }
    return out;
}

async function uploadToDashscopeOss({ apiKey, model, fileBuffer, mimeType }) {
    const policy = await getUploadPolicy(apiKey, model);
    const fileName = `recording-${Date.now()}.wav`;
    const key = `${policy.upload_dir}/${fileName}`;

    const { body, contentType } = buildMultipartBody({
        fields: {
            OSSAccessKeyId: policy.oss_access_key_id,
            Signature: policy.signature,
            policy: policy.policy,
            'x-oss-object-acl': policy.x_oss_object_acl,
            'x-oss-forbid-overwrite': policy.x_oss_forbid_overwrite,
            key,
            success_action_status: '200'
        },
        fileFieldName: 'file',
        fileName,
        fileBuffer,
        fileContentType: mimeType || 'audio/wav'
    });

    const res = await fetchWithTimeout(policy.upload_host, {
        method: 'POST',
        headers: {
            'Content-Type': contentType,
            'Content-Length': String(body.length)
        },
        body
    }, 60000);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`上传录音失败: HTTP ${res.status}${text ? `: ${text.slice(0, 800)}` : ''}`);
    }

    return `oss://${key}`;
}

async function waitDashscopeTask(apiKey, taskId, { timeoutMs = 120000 } = {}) {
    const started = Date.now();
    while (true) {
        const data = await dashscopeRequest(apiKey, 'GET', `/api/v1/tasks/${taskId}`);
        const status = data && data.output && data.output.task_status ? data.output.task_status : null;
        if (status === 'SUCCEEDED' || status === 'FAILED') return data;
        if (Date.now() - started > timeoutMs) {
            throw new Error('等待转写任务超时');
        }
        await new Promise(r => setTimeout(r, 800));
    }
}

async function transcribeRecordedFileWithUpload({ apiKey, model, fileBuffer, mimeType }) {
    const ossUrl = await uploadToDashscopeOss({ apiKey, model, fileBuffer, mimeType });
    const payload = {
        model,
        input: {
            file_urls: [ossUrl]
        },
        parameters: {
            channel_id: [0]
        }
    };

    const submit = await dashscopeRequest(apiKey, 'POST', '/api/v1/services/audio/asr/transcription', {
        payload,
        headers: {
            'X-DashScope-Async': 'enable',
            'X-DashScope-OssResourceResolve': 'enable'
        }
    });

    const taskId = submit && submit.output && submit.output.task_id ? submit.output.task_id : null;
    if (!taskId) {
        const text = extractDashscopeText(submit);
        if (text) return text;
        throw new Error('录音文件转写任务创建失败：缺少 task_id');
    }

    const done = await waitDashscopeTask(apiKey, taskId);
    const out = done && done.output ? done.output : null;
    if (!out || out.task_status !== 'SUCCEEDED') {
        const msg = out && out.message ? out.message : '任务执行失败';
        throw new Error(msg);
    }

    const results = Array.isArray(out.results) ? out.results : [];
    const texts = [];
    for (const r of results) {
        const url = r && r.transcription_url ? r.transcription_url : null;
        if (!url) continue;
        const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } }, 60000);
        const text = await res.text();
        const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
        const data = ct.includes('application/json') ? safeJsonParse(text) : text;
        if (!res.ok) {
            throw new Error(`获取转写结果失败: HTTP ${res.status}${text ? `: ${String(text).slice(0, 800)}` : ''}`);
        }
        const t = extractDashscopeText(data);
        if (t) texts.push(t);
    }
    const merged = texts.join('\n').trim();
    if (!merged) throw new Error('录音文件转写未返回可用文本');
    return merged;
}

function extractDashscopeText(data) {
    if (!data) return '';
    const output = data.output || data.data || data.result || data;

    if (output && Array.isArray(output.sentences)) {
        const texts = output.sentences.map(s => {
            if (!s) return '';
            if (typeof s.text === 'string') return s.text;
            if (typeof s.sentence === 'string') return s.sentence;
            return '';
        }).filter(Boolean);
        if (texts.length) return texts.join('').trim();
    }

    if (output && typeof output.transcription === 'string') {
        return output.transcription.trim();
    }

    if (output && Array.isArray(output.transcripts)) {
        const texts = output.transcripts.map(t => t && typeof t.text === 'string' ? t.text : '').filter(Boolean);
        if (texts.length) return texts.join('\n').trim();
    }

    const directText = output && typeof output.text === 'string' ? output.text : '';
    if (directText) return directText.trim();

    const choices = output && Array.isArray(output.choices) ? output.choices : null;
    const choice0 = choices && choices[0] ? choices[0] : null;

    if (choice0 && typeof choice0.text === 'string') {
        return choice0.text.trim();
    }

    const message = choice0 && choice0.message ? choice0.message : (output && output.message ? output.message : null);
    if (message && typeof message.content === 'string') {
        return message.content.trim();
    }
    if (message && Array.isArray(message.content)) {
        const parts = message.content;
        const textParts = parts.map(p => {
            if (!p) return '';
            if (typeof p === 'string') return p;
            if (typeof p.text === 'string') return p.text;
            return '';
        }).filter(Boolean);
        if (textParts.length) return textParts.join(' ').trim();
    }

    return '';
}

window.exports = {
    "speech-config": {
        mode: "none",
        args: {
            enter: (action) => {
                console.log('Speech Input Plugin Entered');
            }
        }
    }
};
