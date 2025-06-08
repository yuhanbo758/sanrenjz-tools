const fs = require('fs')
const path = require('path')
const { contextBridge } = require('electron');

// 默认设置
const DEFAULT_SETTINGS = {
    openrouterApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    defaultModel: 'google/gemini-pro',
    savePath: '',  // 添加保存路径设置
    customModels: [],
    promptsPath: '',
};

// 内置模型列表
const BUILT_IN_MODELS = [
    {value: 'deepseek-chat', label: 'deepseek-chat', provider: 'deepseek'},
    {value: 'deepseek-reasoner', label: 'deepseek-reasoner', provider: 'deepseek'},
    {value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'gemini'},
    {value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Exp', provider: 'gemini'},
    {value: 'openai/gpt-4o', label: 'GPT-4O', provider: 'openrouter'},
    {value: 'openai/gpt-4o-mini', label: 'GPT-4O Mini', provider: 'openrouter'},
    {value: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openrouter'},
    {value: 'openai/gpt-4.1-nano', label: 'GPT-4.1 Nano', provider: 'openrouter'},
    {value: 'openai/gpt-4o-mini-search-preview', label: 'GPT-4O Mini Search Preview', provider: 'openrouter'},
    {value: 'google/gemini-2.5-pro-exp-03-25:free', label: 'Gemini 2.5 Pro Exp', provider: 'openrouter'},
    {value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 Free', provider: 'openrouter'},
    {value: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek Chat V3 Free', provider: 'openrouter'},
];

window.exports = {
    "ai": {
        mode: "none",
        args: {
            enter: (action) => {
                utools.setExpendHeight(600);
                
                // 获取要填入的文本
                let textToFill = '';
                if (action.type === 'over' && action.payload) {
                    // 如果是选中文本调用
                    textToFill = action.payload;
                } else {
                    // 如果是快捷键调用，尝试获取剪贴板内容
                    textToFill = utools.readClipboard();
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
    }
}

window.services = {
    // 获取内置模型列表
    getBuiltInModels: () => BUILT_IN_MODELS,

    // 获取设置
    getSettings: () => {
        try {
            return utools.dbStorage.getItem('ai-settings') || DEFAULT_SETTINGS;
        } catch (error) {
            console.error('获取设置失败:', error);
            return DEFAULT_SETTINGS;
        }
    },

    // 保存设置
    saveSettings: (settings) => {
        try {
            utools.dbStorage.setItem('ai-settings', settings);
            return true;
        } catch (error) {
            console.error('保存设置失败:', error);
            return false;
        }
    },

    // 选择保存目录
    selectSavePath: () => {
        const result = utools.showOpenDialog({
            title: '选择保存目录',
            properties: ['openDirectory']
        });
        return result ? result[0] : null;
    },

    // 保存聊天记录
    saveChatHistory: (content) => {
        try {
            const settings = window.services.getSettings();
            if (!settings.savePath) {
                utools.showNotification('请先在设置中设置保存路径');
                return false;
            }

            console.log('原始保存路径:', settings.savePath);
            
            // 规范化路径，确保正确处理Windows路径
            const normalizedPath = path.normalize(settings.savePath);
            console.log('规范化后的保存路径:', normalizedPath);
            
            // 检查目录是否存在，不存在则创建
            if (!fs.existsSync(normalizedPath)) {
                console.log('保存目录不存在，尝试创建');
                try {
                    fs.mkdirSync(normalizedPath, { recursive: true });
                    console.log('成功创建目录');
                } catch (mkdirError) {
                    console.error('创建目录失败:', mkdirError);
                    utools.showNotification('创建保存目录失败: ' + mkdirError.message);
                    return false;
                }
            }

            // 创建安全的文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeFileName = `chat-${timestamp}.md`;
            const filePath = path.join(normalizedPath, safeFileName);

            console.log('保存文件路径:', filePath);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('文件保存成功');
            
            utools.showNotification('聊天记录已保存: ' + filePath);
            return true;
        } catch (error) {
            console.error('保存失败:', error);
            utools.showNotification('保存失败: ' + error.message);
            return false;
        }
    },

    // 复制到剪贴板
    copyToClipboard: (text) => {
        utools.copyText(text);
        utools.showNotification('已复制到剪贴板');
    },

    // 修改 callAPI 函数
    async callAPI(message, modelConfig, conversationHistory) {
        const settings = window.services.getSettings();
        
        // 确保 modelConfig 包含必要的信息
        if (!modelConfig || !modelConfig.value || !modelConfig.provider) {
            throw new Error('无效的模型配置');
        }

        // 直接使用传入的模型配置
        const modelInfo = {
            value: modelConfig.value,
            provider: modelConfig.provider
        };

        switch(modelInfo.provider) {
            case 'openrouter':
                if (!settings.openrouterApiKey) {
                    throw new Error('请先设置 OpenRouter API Key');
                }
                
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${settings.openrouterApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'http://localhost:8080',
                        'X-Title': 'uTools AI Plugin'
                    },
                    body: JSON.stringify({
                        model: modelInfo.value,
                        messages: [
                            {
                                role: "system",
                                content: "你是一个有帮助的AI助手。"
                            },
                            ...conversationHistory.map(msg => ({
                                role: msg.role === 'user' ? 'user' : 'assistant',
                                content: msg.content
                            })),
                            {
                                role: "user",
                                content: message
                            }
                        ],
                        stream: true
                    })
                });

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
                                    if (line.trim() === '') continue;
                                    if (line.startsWith('data: ')) {
                                        const data = line.slice(6);
                                        if (data === '[DONE]') continue;
                                        
                                        try {
                                            const parsed = JSON.parse(data);
                                            const content = parsed.choices[0]?.delta?.content || '';
                                            if (content) {
                                                controller.enqueue(content);
                                            }
                                        } catch (e) {
                                            console.error('解析响应数据失败:', e);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            controller.error(error);
                        } finally {
                            controller.close();
                        }
                    }
                });

            case 'deepseek':
                if (!settings.deepseekApiKey) {
                    throw new Error('请先设置 Deepseek API Key');
                }

                const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${settings.deepseekApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            ...conversationHistory.map(msg => ({
                                role: msg.role === 'user' ? 'user' : 'assistant',
                                content: msg.content
                            })),
                            {
                                role: "user",
                                content: message
                            }
                        ],
                        stream: true
                    })
                });

                if (!deepseekResponse.ok) {
                    const error = await deepseekResponse.json();
                    throw new Error(error.error?.message || '请求失败');
                }

                return new ReadableStream({
                    async start(controller) {
                        const reader = deepseekResponse.body.getReader();
                        const decoder = new TextDecoder();
                        
                        try {
                            while (true) {
                                const {done, value} = await reader.read();
                                if (done) break;
                                
                                const chunk = decoder.decode(value);
                                const lines = chunk.split('\n');
                                
                                for (const line of lines) {
                                    if (line.trim() === '') continue;
                                    if (line.startsWith('data: ')) {
                                        const data = line.slice(6);
                                        if (data === '[DONE]') continue;
                                        
                                        try {
                                            const parsed = JSON.parse(data);
                                            const content = parsed.choices[0]?.delta?.content || '';
                                            if (content) {
                                                controller.enqueue(content);
                                            }
                                        } catch (e) {
                                            console.error('解析响应数据失败:', e);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            controller.error(error);
                        } finally {
                            controller.close();
                        }
                    }
                });

            case 'gemini':
                if (!settings.geminiApiKey) {
                    throw new Error('请先设置 Gemini API Key');
                }

                // 构建完整的上下文消息，包含历史对话
                let contextMessage = '';
                if (conversationHistory.length > 0) {
                    contextMessage = conversationHistory.map(msg => {
                        const role = msg.role === 'user' ? '用户' : 'AI';
                        return `${role}: ${msg.content}`;
                    }).join('\n\n');
                    contextMessage += '\n\n用户: ' + message;
                } else {
                    contextMessage = message;
                }

                const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelInfo.value}:generateContent?key=${settings.geminiApiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: contextMessage
                            }]
                        }]
                    })
                });

                if (!geminiResponse.ok) {
                    const error = await geminiResponse.json();
                    throw new Error(error.error?.message || '请求失败');
                }

                // 创建一个模拟的流式输出
                return new ReadableStream({
                    async start(controller) {
                        try {
                            const response = await geminiResponse.json();
                            if (!response.candidates || !response.candidates[0].content.parts[0].text) {
                                throw new Error('无效的响应格式');
                            }

                            const text = response.candidates[0].content.parts[0].text;
                            
                            // 改进分段逻辑
                            const segments = text
                                // 先按段落分割
                                .split(/\n\s*\n/)
                                .flatMap(paragraph => {
                                    // 如果段落太长，按句子再次分割
                                    if (paragraph.length > 100) {
                                        return paragraph
                                            .split(/(?<=[。！？.!?])\s*/)
                                            .filter(s => s.trim());
                                    }
                                    return [paragraph];
                                })
                                .filter(s => s.trim()); // 过滤空段落

                            // 模拟流式输出
                            for (const segment of segments) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                                controller.enqueue(segment.trim() + '\n\n');
                            }
                        } catch (error) {
                            controller.error(error);
                        } finally {
                            controller.close();
                        }
                    }
                });

            default:
                throw new Error(`不支持的模型类型: ${modelInfo.provider}`);
        }
    },

    // 获取聊天历史文件列表
    async getChatHistory() {
        const savePath = this.getSettings().savePath;
        if (!savePath) return [];
        
        const files = await fs.promises.readdir(savePath);
        const chatFiles = [];
        
        for (const file of files) {
            if (file.endsWith('.md')) {
                const filePath = path.join(savePath, file);
                const content = await fs.promises.readFile(filePath, 'utf8');
                const preview = content.split('\n').slice(0, 3).join('\n');
                const stats = await fs.promises.stat(filePath);
                
                chatFiles.push({
                    name: file,
                    path: filePath,
                    date: stats.mtime.toLocaleString(),
                    preview: preview
                });
            }
        }
        
        return chatFiles.sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    // 加载聊天文件内容
    async loadChatFile(filePath) {
        return await fs.promises.readFile(filePath, 'utf8');
    },

    // 保存聊天到文件
    async saveChatToFile(content, fileName) {
        try {
            const settings = this.getSettings();
            if (!settings.savePath) {
                throw new Error('未设置保存路径');
            }
            
            console.log('原始保存路径:', settings.savePath);
            
            // 规范化路径，确保正确处理Windows路径
            const normalizedPath = path.normalize(settings.savePath);
            console.log('规范化后的保存路径:', normalizedPath);
            
            // 检查目录是否存在，不存在则创建
            if (!fs.existsSync(normalizedPath)) {
                console.log('保存目录不存在，尝试创建');
                try {
                    fs.mkdirSync(normalizedPath, { recursive: true });
                    console.log('成功创建目录');
                } catch (mkdirError) {
                    console.error('创建目录失败:', mkdirError);
                    throw new Error('创建保存目录失败: ' + mkdirError.message);
                }
            }
            
            // 安全处理文件名，移除所有不安全字符
            let safeFileName = fileName
                .replace(/[\\/:*?"<>|]/g, '_') // 替换Windows禁止的字符
                .replace(/\s+/g, '_')          // 空格替换为下划线
                .replace(/^\.+/, '')           // 移除开头的点
                .trim();
                
            // 如果文件名为空或只有扩展名，使用默认名称
            if (!safeFileName || safeFileName === '.md') {
                safeFileName = `chat_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
            } else if (!safeFileName.endsWith('.md')) {
                // 确保有.md扩展名
                safeFileName += '.md';
            }
            
            console.log('处理后的文件名:', safeFileName);
            
            // 检查文件名是否已存在，如果存在则添加序号
            let finalFileName = safeFileName;
            let counter = 1;
            
            while (fs.existsSync(path.join(normalizedPath, finalFileName))) {
                const ext = path.extname(safeFileName);
                const nameWithoutExt = safeFileName.slice(0, -ext.length);
                finalFileName = `${nameWithoutExt}_${counter}${ext}`;
                counter++;
            }
            
            const filePath = path.join(normalizedPath, finalFileName);
            console.log('最终保存路径:', filePath);
            
            await fs.promises.writeFile(filePath, content, 'utf8');
            console.log('文件保存成功');
            
            return true;
        } catch (error) {
            console.error('保存对话失败:', error);
            throw error; // 抛出错误以便UI层处理
        }
    },

    // 选择提示词路径
    selectPromptsPath: () => {
        const result = utools.showOpenDialog({
            title: '选择提示词文件夹',
            properties: ['openDirectory']
        });
        return result ? result[0] : null;
    },

    // 获取提示词列表
    async getPrompts() {
        const settings = this.getSettings();
        console.log('前设置:', settings); // 打印完整设置

        if (!settings.promptsPath) {
            console.log('未设置提示词文件夹路径');
            return [];
        }

        const prompts = [];
        try {
            // 检查文件夹是否存在
            const exists = await fs.promises.access(settings.promptsPath)
                .then(() => true)
                .catch(() => false);
            
            if (!exists) {
                console.error('提示词文件夹不存在:', settings.promptsPath);
                return [];
            }

            console.log('正在读取文件夹:', settings.promptsPath);
            const files = await fs.promises.readdir(settings.promptsPath);
            console.log('找到的所有文件:', files);
            
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const filePath = path.join(settings.promptsPath, file);
                    console.log('正在读取文件:', filePath);
                    try {
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        console.log(`文件 ${file} 内容长度:`, content.length);
                        
                        let title = file.replace('.md', '');
                        const titleMatch = content.match(/^#\s+(.+)$/m);
                        if (titleMatch) {
                            title = titleMatch[1];
                        }

                        const preview = content.replace(/^#.*\n/, '').trim().slice(0, 150);
                        const fullContent = content.replace(/^#.*\n/, '').trim();

                        prompts.push({
                            title,
                            preview,
                            content: fullContent,
                            path: filePath
                        });
                        console.log(`成功处理文件 ${file}:`, { title, previewLength: preview.length });
                    } catch (error) {
                        console.error(`读取文件 ${file} 失败:`, error);
                    }
                }
            }
            console.log('成功加载提示词数量:', prompts.length);
            console.log('提示词列表:', prompts);
        } catch (error) {
            console.error('读取提示词文件夹失败:', error);
        }

        return prompts;
    },

    // 添加搜索提示词函数
    async searchPrompts(searchText) {
        try {
            const settings = this.getSettings();
            console.log('当前提示词路径:', settings.promptsPath);
            
            const prompts = await this.getPrompts();
            console.log('搜索文本:', searchText);
            console.log('原始提示词数量:', prompts.length);
            
            if (!searchText) return prompts;
            
            searchText = searchText.toLowerCase();
            const filtered = prompts.filter(prompt => {
                const titleMatch = prompt.title.toLowerCase().includes(searchText);
                const contentMatch = prompt.content.toLowerCase().includes(searchText);
                return titleMatch || contentMatch;
            });
            
            console.log('过滤后的提示词数量:', filtered.length);
            return filtered;
        } catch (error) {
            console.error('搜索提示词时出错:', error);
            throw error; // 抛出错误以便UI层处理
        }
    },

    // 添加高亮匹配文本的辅助函数
    highlightMatch(text, searchText) {
        if (!searchText) return text;
        const regex = new RegExp(searchText, 'gi');
        return text.replace(regex, match => `<mark>${match}</mark>`);
    },

    // 添加获取选中文本的方法
    getSelectedText: () => {
        return window.selectedText || '';
    },

    // 添加系统消息到对话
    addSystemMessage: (content) => {
        const chatContainer = document.getElementById('chatContainer');
        const systemDiv = document.createElement('div');
        systemDiv.className = 'message system-message';
        systemDiv.innerHTML = `
            <div class="system-message-header">
                <span>系统提示</span>
                <button onclick="this.parentElement.parentElement.remove()" class="close-button">×</button>
            </div>
            <div class="system-message-content">${content}</div>
        `;
        chatContainer.appendChild(systemDiv);
        systemDiv.scrollIntoView({ behavior: 'smooth' });
    },

    // 修改 selectPrompt 方法的行为
    selectPrompt: (prompt) => {
        // 添加为系统消息而不是插入到输入框
        window.services.addSystemMessage(prompt.content);
        // 关闭提示词弹窗
        const popup = document.getElementById('promptPopup');
        if (popup) {
            popup.style.display = 'none';
        }
    }
};

// 提供必要的API服务
contextBridge.exposeInMainWorld('services', window.services); 