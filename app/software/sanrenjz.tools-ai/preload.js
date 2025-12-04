const fs = require('fs')
const path = require('path')
const { contextBridge, ipcRenderer, clipboard } = require('electron');

// 插件配置
const PLUGIN_NAME = '余汉波AI助手';

// 默认设置
const DEFAULT_SETTINGS = {
    openrouterApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    defaultModel: 'google/gemini-pro',
    savePath: '',  // 添加保存路径设置
    customModels: [],
    promptsPath: '',
    quickCommands: [] // 用户自定义快捷指令列表
};

// 内置模型列表
const BUILT_IN_MODELS = [
    {value: 'deepseek-chat', label: 'DeepSeek V3', provider: 'deepseek'},
    {value: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'deepseek'},
    {value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini'},
    {value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini'},
    {value: 'gemini-3-pro-preview', label: 'Gemini 3.0 Pro Preview', provider: 'gemini'},
    {value: 'openai/gpt-4o', label: 'GPT-4O', provider: 'openrouter'},
    {value: 'openai/gpt-4o-mini', label: 'GPT-4O Mini', provider: 'openrouter'},
    {value: 'google/gemini-2.5-pro-exp-03-25:free', label: 'Gemini 2.5 Pro Exp', provider: 'openrouter'},
    {value: 'google/gemini-3-pro-preview', label: 'Gemini 3.0 Pro Preview', provider: 'openrouter'},
    {value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 Free', provider: 'openrouter'},
    {value: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek Chat V3 Free', provider: 'openrouter'},
];

window.exports = {
    "ai": {
        mode: "none",
        args: {
            enter: (action) => {
                // 获取要填入的文本
                let textToFill = '';
                if (action.type === 'over' && action.payload) {
                    // 如果是选中文本调用
                    textToFill = action.payload;
                } else {
                    // 如果是快捷键调用，尝试获取剪贴板内容
                    textToFill = clipboard.readText();
                }
                
                // 将文本存储到全局变量，供页面加载完成后使用
                window.pendingText = textToFill;
                
                // 创建新对话并填充文本
                if (window.newChat) {
                    window.newChat();
                }
                
                // 确保文本被填入输入框
                const fillText = () => {
                    const textarea = document.getElementById('promptInput');
                    if (textarea && window.pendingText) {
                        textarea.value = window.pendingText;
                        // 触发 input 事件以调整高度
                        textarea.dispatchEvent(new Event('input'));
                        // 聚焦并将光标移到末尾
                        textarea.focus();
                        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                        // 清除待填充文本
                        window.pendingText = null;
                    }
                };

                // 立即尝试填充一次
                fillText();
                
                // 如果页面还没加载完，等待页面加载后再次尝试
                if (document.readyState !== 'complete') {
                    document.addEventListener('DOMContentLoaded', fillText);
                }
            }
        }
    },
    "ai-quick": {
        mode: "list",
        args: {
            enter: (action, callbackSetList) => {
                // 获取用户配置的快捷指令
                const settings = window.services.getSettings();
                const commands = settings.quickCommands || [];
                
                if (commands.length === 0) {
                    callbackSetList([{
                        title: '暂无快捷指令',
                        description: '请先在插件设置中添加快捷指令',
                        icon: 'logo.png'
                    }]);
                    return;
                }

                // 转换格式供 uTools 显示
                const items = commands.map(cmd => ({
                    title: cmd.title,
                    description: `${cmd.modelLabel} - ${cmd.prompt ? cmd.prompt.slice(0, 30) + '...' : '无预设提示词'}`,
                    icon: 'logo.png',
                    data: cmd // 存储完整指令数据
                }));
                
                callbackSetList(items);
            },
            /**
             * 在超级面板中选择某个快捷指令后，跳转到主界面并应用指令
             * @param {Object} action - 超级面板动作上下文
             * @param {Object} itemData - 列表项数据
             */
            select: (action, itemData) => {
                const cmd = itemData.data;
                if (!cmd) return;

                // 将指令和选中文本传递给主界面
                window.pendingQuickCommand = cmd;
                if (action.type === 'over' && action.payload) {
                    window.pendingText = action.payload;
                } else {
                    window.pendingText = clipboard.readText();
                }

                // 跳转到插件主功能或显示主窗口
                try {
                    if (typeof utools.redirect === 'function') {
                        utools.redirect('ai');
                    } else if (typeof utools.showMainWindow === 'function') {
                        utools.showMainWindow();
                    }
                } catch (e) {}

                // 若主界面已加载，立即应用
                if (window.applyQuickCommand) {
                    window.applyQuickCommand(cmd);
                }
            }
        }
    }
}

window.services = {
    // 获取内置模型列表
    getBuiltInModels: () => BUILT_IN_MODELS,

    // 获取设置
    getSettings: () => {
        try {
            const settings = ipcRenderer.sendSync('plugin-storage-get', PLUGIN_NAME, 'ai-settings');
            // 确保 quickCommands 存在
            const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
            if (!merged.quickCommands) merged.quickCommands = [];
            return merged;
        } catch (error) {
            console.error('获取设置失败:', error);
            return DEFAULT_SETTINGS;
        }
    },

    // 保存设置
    saveSettings: (settings) => {
        try {
            ipcRenderer.sendSync('plugin-storage-set', PLUGIN_NAME, 'ai-settings', settings);
            return true;
        } catch (error) {
            console.error('保存设置失败:', error);
            return false;
        }
    },

    showNotification: (body) => {
        if (Notification.permission === 'granted') {
            new Notification('AI 助手', { body });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification('AI 助手', { body });
                }
            });
        }
    },

    // 选择文件
    selectFile: () => {
        const result = ipcRenderer.sendSync('show-open-dialog', {
            title: '选择文件',
            properties: ['openFile']
        });
        return result ? result[0] : null;
    },

    // 读取文件内容
    readFile: (filePath) => {
        try {
            const stats = fs.statSync(filePath);
            if (stats.size > 10 * 1024 * 1024) { // 10MB 限制
                throw new Error('文件过大，最大支持 10MB');
            }

            const ext = path.extname(filePath).toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            
            if (isImage) {
                const data = fs.readFileSync(filePath);
                const base64 = data.toString('base64');
                return {
                    type: 'image',
                    content: base64,
                    mimeType: `image/${ext.slice(1) === 'jpg' ? 'jpeg' : ext.slice(1)}`,
                    name: path.basename(filePath)
                };
            } else {
                // 默认为文本
                const content = fs.readFileSync(filePath, 'utf8');
                return {
                    type: 'text',
                    content: content,
                    name: path.basename(filePath)
                };
            }
        } catch (error) {
            console.error('读取文件失败:', error);
            throw error;
        }
    },

    selectSavePath: () => {
        const result = ipcRenderer.sendSync('show-open-dialog', {
            title: '选择保存目录',
            properties: ['openDirectory']
        });
        return result ? result[0] : null;
    },

    saveChatHistory: (content) => {
        try {
            const settings = window.services.getSettings();
            if (!settings.savePath) {
                window.services.showNotification('请先在设置中设置保存路径');
                return false;
            }

            const normalizedPath = path.normalize(settings.savePath);
            if (!fs.existsSync(normalizedPath)) {
                fs.mkdirSync(normalizedPath, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeFileName = `chat-${timestamp}.md`;
            const filePath = path.join(normalizedPath, safeFileName);

            fs.writeFileSync(filePath, content, 'utf8');
            window.services.showNotification('聊天记录已保存: ' + filePath);
            return true;
        } catch (error) {
            window.services.showNotification('保存失败: ' + error.message);
            return false;
        }
    },

    getChatHistory: async () => {
        const settings = window.services.getSettings();
        if (!settings.savePath) return [];
        
        const history = [];
        try {
            if (!fs.existsSync(settings.savePath)) return [];
            const files = await fs.promises.readdir(settings.savePath);
            
            for (const file of files) {
                if (file.endsWith('.md') && file.startsWith('chat-')) {
                    const filePath = path.join(settings.savePath, file);
                    try {
                        const stats = await fs.promises.stat(filePath);
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        // 简单的预览提取
                        let preview = content.slice(0, 100).replace(/[\r\n]/g, ' ');
                        history.push({
                            name: file,
                            path: filePath,
                            date: stats.mtime.toLocaleString(),
                            preview: preview + '...'
                        });
                    } catch (e) {}
                }
            }
            // 按时间倒序
            return history.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            console.error(error);
            return [];
        }
    },

    loadChatFile: async (filePath) => {
        return await fs.promises.readFile(filePath, 'utf8');
    },

    insertContent: (content, type = 'text') => {
        return ipcRenderer.invoke('handle-content-insertion', {
            content: content,
            type: type
        });
    },

    copyToClipboard: (text) => {
        clipboard.writeText(text);
        window.services.showNotification('已复制到剪贴板');
    },

    async callAPI(message, modelConfig, conversationHistory, fileAttachment = null) {
        const settings = window.services.getSettings();
        
        if (!modelConfig || !modelConfig.value || !modelConfig.provider) {
            throw new Error('无效的模型配置');
        }

        const modelInfo = {
            value: modelConfig.value,
            provider: modelConfig.provider
        };

        // 准备消息列表
        let messages = [
            {
                role: "system",
                content: "你是一个有帮助的AI助手。"
            },
            ...conversationHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }))
        ];

        // 处理当前用户消息和附件
        let userContent = message;
        let imagePart = null;

        if (fileAttachment) {
            if (fileAttachment.type === 'text') {
                userContent += `\n\n[文件内容 ${fileAttachment.name}]:\n${fileAttachment.content}`;
            } else if (fileAttachment.type === 'image') {
                // 图片处理逻辑依赖于提供商
                imagePart = fileAttachment;
            }
        }

        // OpenRouter / DeepSeek (通常是 OpenAI 格式)
        if (modelInfo.provider === 'openrouter' || modelInfo.provider === 'deepseek') {
            let apiKey = modelInfo.provider === 'deepseek' ? settings.deepseekApiKey : settings.openrouterApiKey;
            let url = modelInfo.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';

            if (!apiKey) throw new Error(`请先设置 ${modelInfo.provider} API Key`);

            const newMessage = { role: "user", content: userContent };
            
            // 如果是 OpenRouter 且有图片，尝试使用 multimodal 格式 (OpenAI Vision 格式)
            if (modelInfo.provider === 'openrouter' && imagePart) {
                newMessage.content = [
                    { type: "text", text: message },
                    { 
                        type: "image_url", 
                        image_url: { 
                            url: `data:${imagePart.mimeType};base64,${imagePart.content}` 
                        } 
                    }
                ];
            }

            messages.push(newMessage);

            let response;
            try {
                response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:8080',
                    'X-Title': 'uTools AI Plugin'
                },
                body: JSON.stringify({
                    model: modelInfo.value,
                    messages: messages,
                    stream: true
                })
            });
            } catch (e) {
                throw new Error('网络请求失败，请检查密钥和网络连接');
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || '请求失败');
            }

            return new ReadableStream({
                async start(controller) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    try {
                        while (true) {
                            const {done, value} = await reader.read();
                            if (done) break;
                            const chunk = decoder.decode(value);
                            const lines = chunk.split('\n');
                            for (const line of lines) {
                                if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                                if (line.startsWith('data: ')) {
                                    try {
                                        const parsed = JSON.parse(line.slice(6));
                                        const content = parsed.choices[0]?.delta?.content || '';
                                        if (content) controller.enqueue(content);
                                    } catch (e) { }
                                }
                            }
                        }
                    } catch (error) { controller.error(error); } 
                    finally { controller.close(); }
                }
            });
        } 
        // Gemini 原生 API
        else if (modelInfo.provider === 'gemini') {
            if (!settings.geminiApiKey) throw new Error('请先设置 Gemini API Key');

            // Gemini 的 history 格式不同，需要转换
            // 它是 contents: [{ role: 'user'|'model', parts: [{text: ...}] }]
            // system instruction 是单独的参数 (systemInstruction)
            
            let contents = conversationHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));

            // 当前消息
            let currentParts = [{ text: message }];
            
            // 如果有文件
            if (fileAttachment) {
                if (fileAttachment.type === 'text') {
                    currentParts[0].text += `\n\n[文件内容 ${fileAttachment.name}]:\n${fileAttachment.content}`;
                } else if (fileAttachment.type === 'image') {
                    currentParts.push({
                        inlineData: {
                            mimeType: fileAttachment.mimeType,
                            data: fileAttachment.content
                        }
                    });
                }
            }

            contents.push({
                role: 'user',
                parts: currentParts
            });

            let geminiResponse;
            try {
                geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelInfo.value}:generateContent?key=${settings.geminiApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: contents,
                        systemInstruction: { parts: [{ text: "你是一个有帮助的AI助手。" }] }
                    })
                });
            } catch (e) {
                throw new Error('网络请求失败，请检查密钥和网络连接');
            }

            if (!geminiResponse.ok) {
                const error = await geminiResponse.json();
                throw new Error(error.error?.message || '请求失败');
            }

            return new ReadableStream({
                async start(controller) {
                    try {
                        const response = await geminiResponse.json();
                        if (!response.candidates || !response.candidates[0].content.parts[0].text) {
                            throw new Error('无效的响应格式');
                        }
                        const text = response.candidates[0].content.parts[0].text;
                        // 简单流式模拟
                        const chunkSize = 20;
                        for (let i = 0; i < text.length; i += chunkSize) {
                            controller.enqueue(text.slice(i, i + chunkSize));
                            await new Promise(r => setTimeout(r, 10));
                        }
                    } catch (error) { controller.error(error); }
                    finally { controller.close(); }
                }
            });
        }

        throw new Error(`不支持的模型提供商: ${modelInfo.provider}`);
    },

    // 选择提示词路径
    selectPromptsPath: () => {
        const result = ipcRenderer.sendSync('show-open-dialog', {
            title: '选择提示词文件夹',
            properties: ['openDirectory']
        });
        return result ? result[0] : null;
    },

    // 获取提示词列表
    async getPrompts() {
        const settings = this.getSettings();
        if (!settings.promptsPath) return [];

        const prompts = [];
        try {
            if (!fs.existsSync(settings.promptsPath)) return [];
            const files = await fs.promises.readdir(settings.promptsPath);
            
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const filePath = path.join(settings.promptsPath, file);
                    try {
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        let title = file.replace('.md', '');
                        const titleMatch = content.match(/^#\s+(.+)$/m);
                        if (titleMatch) title = titleMatch[1];
                        const preview = content.replace(/^#.*\n/, '').trim().slice(0, 150);
                        const fullContent = content.replace(/^#.*\n/, '').trim();
                        prompts.push({ title, preview, content: fullContent, path: filePath });
                    } catch (error) { console.error(error); }
                }
            }
        } catch (error) { console.error(error); }
        return prompts;
    },

    async searchPrompts(searchText) {
        const prompts = await this.getPrompts();
        if (!searchText) return prompts;
        searchText = searchText.toLowerCase();
        return prompts.filter(prompt => 
            prompt.title.toLowerCase().includes(searchText) || 
            prompt.content.toLowerCase().includes(searchText)
        );
    },

    highlightMatch(text, searchText) {
        if (!searchText) return text;
        const regex = new RegExp(searchText, 'gi');
        return text.replace(regex, match => `<mark>${match}</mark>`);
    },

    getSelectedText: () => window.selectedText || '',

    addSystemMessage: (content) => {
        // 辅助函数，具体UI操作应在 index.html 中实现，这里仅保留接口兼容
    },

    selectPrompt: (prompt) => {
        // 辅助函数，具体UI操作应在 index.html 中实现
    }
};

contextBridge.exposeInMainWorld('services', window.services);
