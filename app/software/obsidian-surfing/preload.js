const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// 确保在渲染进程中可以使用Node.js API
if (typeof window !== 'undefined') {
    window.require = require;
    window.process = process;
}

// 插件配置
const PLUGIN_NAME = '网页浏览';

// 服务API封装
window.services = {
    // 数据存储
    getStorageItem: (key) => {
        return ipcRenderer.sendSync('plugin-storage-get', PLUGIN_NAME, key);
    },
    
    setStorageItem: (key, value) => {
        return ipcRenderer.sendSync('plugin-storage-set', PLUGIN_NAME, key, value);
    },
    
    removeStorageItem: (key) => {
        return ipcRenderer.sendSync('plugin-storage-remove', PLUGIN_NAME, key);
    },
    
    // 文件对话框
    selectFile: (options = {}) => {
        const defaultOptions = {
            title: '选择文件',
            properties: ['openFile']
        };
        return ipcRenderer.sendSync('show-open-dialog', { ...defaultOptions, ...options });
    },
    
    selectFolder: () => {
        return ipcRenderer.sendSync('show-open-dialog', {
            title: '选择文件夹',
            properties: ['openDirectory']
        });
    },
    
    saveFile: (options = {}) => {
        const defaultOptions = {
            title: '保存文件'
        };
        return ipcRenderer.sendSync('show-save-dialog', { ...defaultOptions, ...options });
    },
    
    // 内容插入（已改为仅复制到剪贴板，不再调用自动粘贴）
    insertContent: (content, type = 'text') => {
        try {
            const { clipboard, nativeImage } = require('electron');
            if (type === 'text') {
                clipboard.writeText(String(content || ''));
            } else if (type === 'image') {
                // 支持将 base64 或文件路径写入剪贴板
                let img = null;
                if (Buffer.isBuffer(content)) {
                    img = nativeImage.createFromBuffer(content);
                } else if (typeof content === 'string') {
                    if (content.startsWith('data:image')) {
                        const base64 = content.split(',')[1] || '';
                        img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
                    } else {
                        // 假定为图片路径
                        try {
                            img = nativeImage.createFromPath(content);
                        } catch {}
                    }
                }
                if (img) clipboard.writeImage(img);
            } else {
                // 其他类型统一按文本处理
                clipboard.writeText(String(content || ''));
            }
            return Promise.resolve({ success: true, copied: true });
        } catch (e) {
            console.error('复制到剪贴板失败:', e);
            return Promise.resolve({ success: false, error: e.message });
        }
    },
    
    // 窗口控制
    closeWindow: () => {
        return ipcRenderer.invoke('close-plugin-window', PLUGIN_NAME);
    },
    
    minimizeWindow: () => {
        return ipcRenderer.invoke('minimize-plugin-window', PLUGIN_NAME);
    },
    
    maximizeWindow: () => {
        return ipcRenderer.invoke('maximize-plugin-window', PLUGIN_NAME);
    },
    
    togglePin: () => {
        return ipcRenderer.invoke('toggle-plugin-pin-window', PLUGIN_NAME);
    }
};

// 超级面板功能导出
window.exports = {
    "main-feature": {
        mode: "none",
        args: {
            enter: (action, callbackSetList) => {
                // 主功能入口
                console.log('网页浏览插件功能被调用');
                
                // 打开主界面
                // 注意：超级面板会自动处理界面打开，不需要额外代码
            },
            
            search: (action, searchWord, callbackSetList) => {
                // 搜索功能（如果使用 list 模式）
                // 当前插件使用 none 模式，不需要实现搜索功能
            },
            
            select: (action, itemData) => {
                // 选择处理（如果使用 list 模式）
                // 当前插件使用 none 模式，不需要实现选择功能
            }
        }
    }
};

// 初始化函数
function initializePlugin() {
    console.log('网页浏览插件初始化中...');
    
    // 加载配置
    const config = window.services.getStorageItem('config') || {};
    
    // 设置默认配置
    if (!config.initialized) {
        window.services.setStorageItem('config', {
            initialized: true,
            version: '1.0.0',
            settings: {
                homePage: 'https://www.baidu.com/',
                searchEngine: 'https://www.baidu.com/s?wd=',
                enableBookmarks: true
            }
        });
    }
    
    // 初始化书签（如果不存在）
    if (!window.services.getStorageItem('bookmarks')) {
        window.services.setStorageItem('bookmarks', [
            { title: '百度', url: 'https://www.baidu.com/' },
            { title: '必应', url: 'https://www.bing.com/' },
            { title: '谷歌', url: 'https://www.google.com/' },
            { title: '知乎', url: 'https://www.zhihu.com/' },
            { title: '哔哩哔哩', url: 'https://www.bilibili.com/' }
        ]);
    }
    
    console.log('网页浏览插件初始化完成');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializePlugin);
