const fs = require('fs')
const path = require('path')
const { ipcRenderer } = require('electron');

// 默认设置
const DEFAULT_SETTINGS = {
    snippetsPath: '', // 旧版单一路径（保持向后兼容）
    snippetsPaths: [], // 新版多路径支持
    autoInsert: true, // 是否自动插入内容
    searchSubfolders: true, // 是否搜索子文件夹
};

// 用于存储所有文本片段的缓存
let snippetsCache = [];

// 直接插入功能的主要实现
function insertContent(content, insertMode = 'plain') {
    console.log('准备插入内容:', content.substring(0, 30) + '...');
    
    try {
        // 1. 复制内容到剪贴板
        const { clipboard } = require('electron');
        if (insertMode === 'plain') {
            clipboard.writeText(content);
        } else if (insertMode === 'markdown') {
            // 添加markdown格式的特殊处理
            let formattedContent = content;
            // 检查是否需要添加markdown语法
            if (!/^#|^\*\*|^>\s|^```|^\-\s|^\d+\.\s/.test(content)) {
                // 如果内容不包含markdown语法，自动添加一些基本格式
                if (content.split('\n').length > 1) {
                    // 多行内容，添加代码块
                    formattedContent = '```\n' + content + '\n```';
                }
            }
            clipboard.writeText(formattedContent);
        } else {
            clipboard.writeText(content);
        }
        
        console.log('内容已复制到剪贴板');
        
        // 2. 通知主进程处理插入操作（包括焦点恢复和自动粘贴）
        ipcRenderer.invoke('handle-content-insertion', {
            content: content,
            type: 'text-snippet'
        }).then(result => {
            console.log('内容插入处理结果:', result);
        }).catch(error => {
            console.error('内容插入处理失败:', error);
            showNotification('操作失败: ' + error.message, 'error');
        });
        
        // 3. 立即关闭插件窗口
        closePlugin();
        
    } catch (error) {
        console.error('插入过程中发生错误:', error);
        showNotification('操作失败: ' + error.message, 'error');
        closePlugin();
    }
}

// 关闭插件窗口
function closePlugin() {
    console.log('开始关闭插件窗口...');
    
    try {
        // 先隐藏搜索窗口，这会触发焦点恢复逻辑
        ipcRenderer.invoke('hide-search-window').then(() => {
            console.log('搜索窗口已隐藏');
            
            // 搜索窗口隐藏后，立即尝试恢复焦点
            setTimeout(() => {
                console.log('尝试恢复焦点到原窗口');
                ipcRenderer.invoke('restore-previous-focus').then(result => {
                    console.log('焦点恢复结果:', result);
                    
                    // 给焦点恢复一点时间，然后关闭插件窗口
                    setTimeout(() => {
                        ipcRenderer.invoke('close-plugin-window', '余汉波文本片段助手');
                        console.log('插件窗口关闭完成');
                    }, 200);
                }).catch(error => {
                    console.error('恢复焦点失败:', error);
                    // 即使焦点恢复失败，也要关闭插件窗口
                    ipcRenderer.invoke('close-plugin-window', '余汉波文本片段助手');
                });
            }, 100);
        }).catch(error => {
            console.error('隐藏搜索窗口失败:', error);
            // 即使失败也要尝试恢复焦点并关闭插件窗口
            ipcRenderer.invoke('restore-previous-focus').then(() => {
                setTimeout(() => {
                    ipcRenderer.invoke('close-plugin-window', '余汉波文本片段助手');
                }, 200);
            }).catch(e => {
                console.error('恢复焦点失败:', e);
                ipcRenderer.invoke('close-plugin-window', '余汉波文本片段助手');
            });
        });
    } catch (error) {
        console.error('关闭插件失败:', error);
        // 备用方案：直接关闭插件窗口
        try {
            ipcRenderer.invoke('close-plugin-window', '余汉波文本片段助手');
        } catch (e) {
            console.error('备用关闭方案也失败:', e);
        }
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    try {
        // 使用简单的弹窗通知，可以后续改进
        if (window.parent && window.parent.showNotification) {
            window.parent.showNotification(message, type);
        } else {
            console.log(`通知 [${type}]: ${message}`);
            // 备用方案：创建一个简单的页面内通知
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'error' ? '#ff4d4f' : type === 'success' ? '#52c41a' : '#1890ff'};
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                font-size: 14px;
                max-width: 300px;
            `;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
        }
    } catch (error) {
        console.error('显示通知失败:', error);
    }
}

// 扫描文件夹
function scanFolder() {
    console.log('开始扫描文件夹...');
    
    const settings = getSettings();
    const allSnippets = [];
    
    // 获取所有路径
    const paths = Array.isArray(settings.snippetsPaths) && settings.snippetsPaths.length > 0 
        ? settings.snippetsPaths 
        : (settings.snippetsPath ? [settings.snippetsPath] : []);
    
    if (paths.length === 0) {
        console.log('未设置有效的片段路径');
        snippetsCache = [];
        return [];
    }
    
    try {
        // 递归扫描函数
        function readDir(dir, subDir = false) {
            if (!dir || !fs.existsSync(dir)) {
                console.log(`路径不存在: ${dir}`);
                return;
            }
            
            if (!settings.searchSubfolders && subDir) {
                // 如果设置不搜索子文件夹，并且当前是子文件夹，则跳过
                return;
            }
            
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isFile() && path.extname(item).toLowerCase() === '.md') {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const fileName = path.basename(item, '.md');
                        
                        allSnippets.push({
                            fileName,
                            title: fileName,
                            path: fullPath,
                            content,
                            preview: content.slice(0, 200) + (content.length > 200 ? '...' : '')
                        });
                    } catch (error) {
                        console.error(`读取文件 ${fullPath} 失败:`, error);
                    }
                } else if (stat.isDirectory() && settings.searchSubfolders) {
                    readDir(fullPath, true);
                }
            }
        }
        
        // 扫描每个路径
        for (const folderPath of paths) {
            if (folderPath && fs.existsSync(folderPath)) {
                console.log(`扫描路径: ${folderPath}`);
                readDir(folderPath);
            } else {
                console.log(`跳过无效路径: ${folderPath}`);
            }
        }
        
        console.log(`共找到 ${allSnippets.length} 个片段`);
        snippetsCache = allSnippets;
        
        return allSnippets;
    } catch (error) {
        console.error('扫描文件夹失败:', error);
        return [];
    }
}

// 获取设置
function getSettings() {
    try {
        // 使用 IPC 同步调用获取插件存储数据
        const settings = ipcRenderer.sendSync('plugin-storage-get', '余汉波文本片段助手', 'snippets-settings');
        return settings || DEFAULT_SETTINGS;
    } catch (error) {
        console.error('获取设置失败:', error);
        return DEFAULT_SETTINGS;
    }
}

// 保存设置
function saveSettings(settings) {
    try {
        // 使用 IPC 同步调用保存插件存储数据
        const result = ipcRenderer.sendSync('plugin-storage-set', '余汉波文本片段助手', 'snippets-settings', settings);
        return result;
    } catch (error) {
        console.error('保存设置失败:', error);
        return false;
    }
}

// 创建片段时获取第一个有效路径
function getFirstValidPath(settings) {
    // 先从 snippetsPaths 中获取第一个有效路径
    if (Array.isArray(settings.snippetsPaths) && settings.snippetsPaths.length > 0) {
        for (const path of settings.snippetsPaths) {
            if (path && fs.existsSync(path)) {
                return path;
            }
        }
    }
    
    // 如果没有，则尝试使用 snippetsPath
    if (settings.snippetsPath && fs.existsSync(settings.snippetsPath)) {
        return settings.snippetsPath;
    }
    
    return null;
}

// 获取默认存储路径
function getDefaultSnippetsPath(settings) {
    // 首先使用指定的默认路径
    if (settings.defaultSnippetsPath && fs.existsSync(settings.defaultSnippetsPath)) {
        return settings.defaultSnippetsPath;
    }
    
    // 如果未指定默认路径或路径无效，则使用第一个有效路径
    return getFirstValidPath(settings);
}

// 导出主要功能
window.exports = {
    // 浏览和管理文本片段
    "text-snippets": {
        mode: "list",
        args: {
            enter: (action, callbackSetList) => {
                // 刷新扫描
                const snippets = scanFolder();
                
                // 显示所有片段
                callbackSetList(snippets.map(snippet => ({
                    title: snippet.title,
                    description: snippet.preview,
                    icon: 'file-text.png',
                    data: snippet
                })));
            },
            search: (action, searchWord, callbackSetList) => {
                if (!searchWord) {
                    return callbackSetList(snippetsCache.map(snippet => ({
                        title: snippet.title,
                        description: snippet.preview,
                        icon: 'file-text.png',
                        data: snippet
                    })));
                }
                
                // 搜索匹配的片段
                const results = snippetsCache.filter(snippet => 
                    snippet.title.toLowerCase().includes(searchWord.toLowerCase()) ||
                    snippet.content.toLowerCase().includes(searchWord.toLowerCase())
                );
                
                callbackSetList(results.map(snippet => ({
                    title: snippet.title,
                    description: snippet.preview,
                    icon: 'file-text.png',
                    data: snippet
                })));
            },
            select: (action, itemData) => {
                // 当选择某一项时，插入内容
                const settings = getSettings();
                if (settings.autoInsert) {
                    insertContent(itemData.content);
                } else {
                    // 如果不自动插入，只复制到剪贴板
                    const { clipboard } = require('electron');
                    clipboard.writeText(itemData.content);
                    showNotification('已复制到剪贴板', 'success');
                    closePlugin();
                }
            }
        }
    },
    
    // 设置界面
    "settings": {
        mode: "none",
        args: {
            enter: (action) => {
                // 设置插件窗口高度
                try {
                    // 通过父窗口调整高度（如果可用）
                    if (window.parent && window.parent.resizeWindow) {
                        window.parent.resizeWindow(600, 450);
                    }
                } catch (error) {
                    console.log('调整窗口大小失败:', error);
                }
            }
        }
    },
    

};

// 服务提供给渲染进程
window.services = {
    getSettings: () => getSettings(),
    
    saveSettings: (settings) => {
        const result = saveSettings(settings);
        if (result) {
            // 如果设置变更成功，重新扫描
            scanFolder();
        }
        return result;
    },
    
    selectFolder: () => {
        try {
            // 使用 IPC 同步调用显示文件夹选择对话框
            const result = ipcRenderer.sendSync('show-open-dialog', {
                title: '选择文本片段文件夹',
                properties: ['openDirectory']
            });
            return result ? result[0] : null;
        } catch (error) {
            console.error('选择文件夹失败:', error);
            return null;
        }
    },

    getSnippets: () => snippetsCache,
    
    refreshSnippets: () => {
        return scanFolder();
    },
    
    createSnippet: (title, content) => {
        try {
            const settings = getSettings();
            // 使用默认路径，而不是第一个路径
            const snippetsPath = getDefaultSnippetsPath(settings);
            
            if (!snippetsPath) {
                throw new Error('未设置有效的文本片段文件夹路径');
            }
            
            // 确保文件名有效
            const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
            const filePath = path.join(snippetsPath, `${safeTitle}.md`);
            
            // 写入文件
            fs.writeFileSync(filePath, content, 'utf8');
            
            // 更新缓存
            scanFolder();
            
            return true;
        } catch (error) {
            console.error('创建片段失败:', error);
            return false;
        }
    },
    
    deleteSnippet: (fileName) => {
        try {
            const snippet = snippetsCache.find(s => s.fileName === fileName);
            if (!snippet) {
                throw new Error('找不到对应的片段');
            }
            
            // 删除文件
            fs.unlinkSync(snippet.path);
            
            // 更新缓存
            scanFolder();
            
            return true;
        } catch (error) {
            console.error('删除片段失败:', error);
            return false;
        }
    },
    
    editSnippet: (fileName, newContent) => {
        try {
            const snippet = snippetsCache.find(s => s.fileName === fileName);
            if (!snippet) {
                throw new Error('找不到对应的片段');
            }
            
            // 更新文件内容
            fs.writeFileSync(snippet.path, newContent, 'utf8');
            
            // 更新缓存
            scanFolder();
            
            return true;
        } catch (error) {
            console.error('编辑片段失败:', error);
            return false;
        }
    },
    
    // 获取快速访问片段列表
    getQuickSnippets: (count = 5) => {
        return getQuickSnippets(count);
    },
    
    // 直接插入片段内容
    insertSnippetContent: (snippetData) => {
        if (snippetData && snippetData.content) {
            insertContent(snippetData.content);
            return true;
        }
        return false;
    },
    
    // 刷新片段缓存（保留用于兼容性）
    refreshSnippetsCache: () => {
        return scanFolder();
    }
};

// 初始化插件
(function init() {
    console.log('插件初始化中...');
    
    // 初始化扫描
    scanFolder();
    
    console.log('插件初始化完成');
})();

// 获取快速片段列表（用于超级面板）
function getQuickSnippets(count = 5) {
    return snippetsCache.slice(0, count);
}

 