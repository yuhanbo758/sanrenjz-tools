const { contextBridge, ipcRenderer, clipboard, desktopCapturer, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'AI 屏幕翻译';

/**
 * 默认配置
 * Default settings for the plugin
 */
const DEFAULT_SETTINGS = {
    apiKey: '',
    baseUrl: 'https://api.siliconflow.cn/v1',
    textModel: 'deepseek-ai/DeepSeek-V3.2',
    ocrModel: 'deepseek-ai/DeepSeek-OCR'
};

/**
 * 获取插件配置 (内部函数)
 * Retrieve plugin configuration from storage
 * @returns {Object} Current settings merged with defaults
 */
function getSettingsInternal() {
    try {
        const stored = ipcRenderer.sendSync('plugin-storage-get', PLUGIN_NAME, 'settings');
        if (!stored || typeof stored !== 'object') {
            return { ...DEFAULT_SETTINGS };
        }
        return { ...DEFAULT_SETTINGS, ...stored };
    } catch (error) {
        console.error('获取配置失败:', error);
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * 保存插件配置 (内部函数)
 * Save plugin configuration to storage
 * @param {Object} settings - The settings object to save
 * @returns {boolean} Success status
 */
function saveSettingsInternal(settings) {
    try {
        const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
        ipcRenderer.sendSync('plugin-storage-set', PLUGIN_NAME, 'settings', merged);
        return true;
    } catch (error) {
        console.error('保存配置失败:', error);
        return false;
    }
}

// 缓存最后一次进入的数据，防止渲染进程未准备好
// Cache the last entry context in case the renderer is not ready
let lastEnterContext = null;

/**
 * 处理进入事件
 * Handle plugin entry event
 * @param {string} mode - Entry mode ('text' or 'ocr')
 * @param {Object} action - Action object from the host
 */
function handleEnter(mode, action) {
    try {
        console.log(`Plugin Enter: mode=${mode}`, action);
        let payload = '';
        if (action && typeof action === 'object' && action.payload) {
            payload = action.payload;
        }
        
        const context = { mode, payload, action };
        lastEnterContext = context;

        // 发送消息给渲染进程
        // Send message to renderer process
        window.postMessage({
            type: 'AI_SCREEN_TRANS_ENTER',
            data: context
        }, '*');
    } catch (error) {
        console.error('处理进入事件失败:', error);
    }
}

/**
 * 暴露给渲染进程的服务 API
 * Service APIs exposed to the renderer process
 */
const services = {
    /**
     * 获取配置
     * Get current settings
     */
    getSettings: () => getSettingsInternal(),

    /**
     * 保存配置
     * Save settings
     */
    saveSettings: (settings) => saveSettingsInternal(settings),

    /**
     * 复制文本到剪贴板
     * Copy text to clipboard
     */
    copyText: (text) => {
        try {
            clipboard.writeText(String(text || ''));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * 关闭窗口
     * Close plugin window
     */
    closeWindow: async () => {
        return await ipcRenderer.invoke('close-plugin-window', PLUGIN_NAME);
    },

    /**
     * 最小化窗口
     * Minimize plugin window
     */
    minimizeWindow: async () => {
        return await ipcRenderer.invoke('minimize-plugin-window', PLUGIN_NAME);
    },

    /**
     * 切换窗口置顶状态
     * Toggle window pin status
     */
    togglePin: async () => {
        return await ipcRenderer.invoke('toggle-plugin-pin-window', PLUGIN_NAME);
    },

    /**
     * 获取初始上下文（用于渲染进程初始化时主动获取）
     * Get initial context (called by renderer on init)
     */
    getInitialContext: () => {
        const ctx = lastEnterContext;
        lastEnterContext = null; // 获取后清除，避免重复
        return ctx;
    },

    /**
     * 获取剪贴板文本
     * Get text from clipboard
     */
    getClipboardText: () => {
        return clipboard.readText();
    },

    /**
     * 获取剪贴板图片（返回 Base64）
     * Get image from clipboard as Base64 string
     * Supports: Image data, Data URI text, File path to image
     */
    getClipboardImage: () => {
        try {
            // 调试日志：查看当前剪贴板支持的格式
            const formats = clipboard.availableFormats();
            console.log('Clipboard formats:', formats);

            // 1. 优先尝试直接读取 Image 对象 (适用于截图)
            const image = clipboard.readImage();
            if (image && !image.isEmpty()) {
                return image.toPNG().toString('base64');
            }

            // 2. 尝试读取文本（可能是 Data URI 或文件路径）
            // 注意：某些系统复制文件时，readText 可能为空，需要更底层的处理，
            // 但 Electron 对文件复制的支持主要通过 readBuffer('FileNameW') 等，这里暂且尝试 readText
            const text = (clipboard.readText() || '').trim();
            if (text) {
                // Case A: Data URI
                if (text.startsWith('data:image')) {
                    const base64 = text.split(',')[1] || '';
                    if (base64) {
                        const img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
                        if (!img.isEmpty()) {
                            return img.toPNG().toString('base64');
                        }
                    }
                } 
                // Case B: File Path
                else {
                    const possiblePath = text.replace(/^"|"$/g, '');
                    if (fs.existsSync(possiblePath)) {
                        const ext = path.extname(possiblePath).toLowerCase();
                        if ([".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(ext)) {
                            const img = nativeImage.createFromPath(possiblePath);
                            if (!img.isEmpty()) {
                                return img.toPNG().toString('base64');
                            }
                        }
                    }
                }
            }

            // 3. (高级) 尝试从 HTML 格式中提取 img src (适用于从浏览器复制图片)
            // 有些浏览器复制图片时不提供 image/png，只提供 text/html
            if (formats.includes('text/html')) {
                const html = clipboard.readHTML();
                const srcMatch = html.match(/<img[^>]+src="([^">]+)"/);
                if (srcMatch && srcMatch[1]) {
                    const src = srcMatch[1];
                    if (src.startsWith('file://')) {
                         const p = decodeURI(src.replace('file://', ''));
                         // Windows 路径修正 /C:/... -> C:/...
                         const winPath = p.replace(/^\/([a-zA-Z]:)/, '$1');
                         if (fs.existsSync(winPath)) {
                             const img = nativeImage.createFromPath(winPath);
                             if (!img.isEmpty()) return img.toPNG().toString('base64');
                         }
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('读取剪贴板图片失败:', error);
            return null;
        }
    },

    /**
     * 屏幕截图 (备用)
     * Capture screen (Fallback)
     */
    captureScreen: async () => {
        try {
            // 获取屏幕模块
            let screen;
            try {
                screen = require('@electron/remote').screen;
            } catch (e) {
                console.warn('Failed to load screen from @electron/remote, trying electron...', e);
                screen = require('electron').screen;
            }

            if (!screen) {
                 console.warn('Screen module not found, using default resolution 1920x1080');
                 const sources = await desktopCapturer.getSources({ 
                    types: ['screen'], 
                    thumbnailSize: { width: 1920, height: 1080 }
                });
                if (sources.length > 0) {
                    return sources[0].thumbnail.toPNG().toString('base64');
                }
                 throw new Error('No screen source found (fallback)');
            }

            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.size;
            const scaleFactor = primaryDisplay.scaleFactor || 1;
            const thumbWidth = Math.ceil(width * scaleFactor);
            const thumbHeight = Math.ceil(height * scaleFactor);

            const sources = await desktopCapturer.getSources({ 
                types: ['screen'], 
                thumbnailSize: { width: thumbWidth, height: thumbHeight }
            });
            
            if (sources.length > 0) {
                const source = sources.find(s => s.display_id === primaryDisplay.id.toString()) || sources[0];
                return source.thumbnail.toPNG().toString('base64');
            }
            throw new Error('No screen source found');
        } catch (e) {
            console.error('Capture failed', e);
            throw e;
        }
    }
};

// 暴露 API
try {
    contextBridge.exposeInMainWorld('services', services);
} catch (error) {
    console.warn('contextBridge expose failed, fallback to window.services');
    window.services = services;
}

// 注册插件功能
window.exports = {
    "ai-screen-text-translate": {
        mode: "none",
        args: {
            enter: (action) => {
                handleEnter('text', action);
            }
        }
    },
    "ai-screen-ocr-translate": {
        mode: "none",
        args: {
            enter: (action) => {
                handleEnter('ocr', action);
            }
        }
    }
};
