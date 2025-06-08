const path = require('path');
const { spawn, fork } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain } = require('electron');

class PluginManager {
    constructor(mainWindow) {
        try {
            // 插件目录配置
            this.pluginDir = app.isPackaged
                ? path.join(process.resourcesPath, 'app', 'software')
                : path.join(__dirname, 'software');
                
            if (!fs.existsSync(this.pluginDir)) {
                fs.mkdirSync(this.pluginDir, { recursive: true });
                console.log('创建插件目录成功:', this.pluginDir);
            }

            this.mainWindow = mainWindow;
            this.pluginWindows = new Map(); // 存储插件窗口
            this.pluginPinnedMap = new Map(); // 存储插件窗口的钉住状态
            this.pluginProcesses = new Map(); // 存储插件进程

            console.log('PluginManager 初始化成功');
            console.log('插件目录:', this.pluginDir);

            // 添加插件数据存储管理
            this.initPluginDataStorage();

        } catch (error) {
            console.error('PluginManager 初始化失败:', error);
            throw error;
        }
    }

    // 初始化插件数据存储系统
    initPluginDataStorage() {
        // 检查是否有自定义路径设置
        const settings = this.loadSettings();
        if (settings.customPluginDataPath && fs.existsSync(settings.customPluginDataPath)) {
            this.pluginDataDir = settings.customPluginDataPath;
        } else {
            this.pluginDataDir = path.join(app.getPath('userData'), 'plugin-data');
        }
        
        // 确保插件数据目录存在
        if (!fs.existsSync(this.pluginDataDir)) {
            fs.mkdirSync(this.pluginDataDir, { recursive: true });
            console.log('创建插件数据目录:', this.pluginDataDir);
        }
    }

    // 更新插件数据存储目录
    updatePluginDataDirectory(newPath) {
        this.pluginDataDir = newPath;
        
        // 确保新目录存在
        if (!fs.existsSync(this.pluginDataDir)) {
            fs.mkdirSync(this.pluginDataDir, { recursive: true });
            console.log('创建新的插件数据目录:', this.pluginDataDir);
        }
        
        console.log('插件数据目录已更新为:', this.pluginDataDir);
    }

    // 获取插件存储文件路径
    getPluginStoragePath(pluginName) {
        return path.join(this.pluginDataDir, `${pluginName}-storage.json`);
    }

    // 读取插件存储数据
    loadPluginStorage(pluginName) {
        try {
            const storagePath = this.getPluginStoragePath(pluginName);
            if (fs.existsSync(storagePath)) {
                const data = fs.readFileSync(storagePath, 'utf8');
                return JSON.parse(data);
            }
            return {};
        } catch (error) {
            console.error(`读取插件 ${pluginName} 存储数据失败:`, error);
            return {};
        }
    }

    // 保存插件存储数据
    savePluginStorage(pluginName, data) {
        try {
            const storagePath = this.getPluginStoragePath(pluginName);
            fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`插件 ${pluginName} 存储数据已保存到:`, storagePath);
            return true;
        } catch (error) {
            console.error(`保存插件 ${pluginName} 存储数据失败:`, error);
            return false;
        }
    }

    // 插件存储API
    getPluginStorageItem(pluginName, key) {
        try {
            console.log(`获取插件存储: ${pluginName} - ${key}`);
            const storage = this.loadPluginStorage(pluginName);
            const result = storage[key] || null;
            console.log(`存储结果:`, result);
            return result;
        } catch (error) {
            console.error(`获取插件存储失败: ${pluginName} - ${key}`, error);
            return null;
        }
    }

    setPluginStorageItem(pluginName, key, value) {
        try {
            console.log(`设置插件存储: ${pluginName} - ${key}`, '值:', value);
            
            // 确保值是可序列化的
            let serializableValue = value;
            if (typeof value === 'object' && value !== null) {
                try {
                    // 测试序列化
                    JSON.stringify(value);
                    serializableValue = value;
                } catch (serializeError) {
                    console.error('值不可序列化，转换为字符串:', serializeError);
                    serializableValue = String(value);
                }
            }
            
            const storage = this.loadPluginStorage(pluginName);
            storage[key] = serializableValue;
            const result = this.savePluginStorage(pluginName, storage);
            console.log(`存储保存结果:`, result);
            return result;
        } catch (error) {
            console.error(`设置插件存储失败: ${pluginName} - ${key}`, error);
            return false;
        }
    }

    removePluginStorageItem(pluginName, key) {
        try {
            console.log(`删除插件存储: ${pluginName} - ${key}`);
            const storage = this.loadPluginStorage(pluginName);
            delete storage[key];
            const result = this.savePluginStorage(pluginName, storage);
            console.log(`删除结果:`, result);
            return result;
        } catch (error) {
            console.error(`删除插件存储失败: ${pluginName} - ${key}`, error);
            return false;
        }
    }

    // 获取插件数据存储目录路径
    getPluginDataDirectory() {
        return this.pluginDataDir;
    }

    // 发送输出到主窗口
    sendOutput(output) {
        try {
            if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('terminal-output', output);
            }
        } catch (error) {
            console.error('发送输出失败:', error);
        }
    }

    // 发送错误到主窗口
    sendError(error) {
        try {
            if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('terminal-error', error);
            }
        } catch (error) {
            console.error('发送错误失败:', error);
        }
    }

    // 清空输出
    clearOutput() {
        try {
            if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('terminal-clear');
            }
        } catch (error) {
            console.error('清空输出失败:', error);
        }
    }

    // 扫描并获取所有插件列表
    async getPluginList() {
        try {
            const plugins = [];
            
            if (!fs.existsSync(this.pluginDir)) {
                return plugins;
            }

            const items = fs.readdirSync(this.pluginDir, { withFileTypes: true });
            
            for (const item of items) {
                if (item.isDirectory()) {
                    const pluginPath = path.join(this.pluginDir, item.name);
                    const pluginJsonPath = path.join(pluginPath, 'plugin.json');
                    
                    // 检查是否存在plugin.json配置文件
                    if (fs.existsSync(pluginJsonPath)) {
                        try {
                            const pluginConfig = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
                            
                            // 只返回可序列化的基本信息
                            plugins.push({
                                name: pluginConfig.pluginName || item.name,
                                description: pluginConfig.description || '暂无描述',
                                version: pluginConfig.version || '1.0.0',
                                author: pluginConfig.author || '未知',
                                category: pluginConfig.category || '工具',
                                path: pluginPath,
                                main: pluginConfig.main || 'index.html',
                                // 移除可能导致序列化问题的复杂对象
                                features: Array.isArray(pluginConfig.features) ? pluginConfig.features.map(f => ({
                                    code: f.code,
                                    explain: f.explain,
                                    cmds: Array.isArray(f.cmds) ? f.cmds : []
                                })) : []
                            });
                        } catch (error) {
                            console.error(`解析插件配置失败 ${item.name}:`, error);
                        }
                    }
                }
            }

            return plugins;
        } catch (error) {
            console.error('获取插件列表失败:', error);
            return [];
        }
    }

    // 执行插件
    async runPlugin(pluginPath, features = []) {
        try {
            console.log('开始执行插件:', pluginPath);
            
            const pluginJsonPath = path.join(pluginPath, 'plugin.json');
            
            if (!fs.existsSync(pluginJsonPath)) {
                throw new Error(`插件配置文件不存在: ${pluginJsonPath}`);
            }

            const pluginConfig = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
            const mainFile = pluginConfig.main || 'index.html';
            const mainFilePath = path.join(pluginPath, mainFile);

            if (!fs.existsSync(mainFilePath)) {
                throw new Error(`插件主文件不存在: ${mainFilePath}`);
            }

            // 根据主文件类型决定执行方式
            const fileExt = path.extname(mainFile).toLowerCase();
            
            if (fileExt === '.html') {
                // HTML插件，创建新窗口显示
                await this.createPluginWindow(pluginPath, pluginConfig);
            } else if (fileExt === '.js') {
                // JavaScript插件，在Node.js环境中执行
                await this.executeJavaScriptPlugin(pluginPath, pluginConfig);
            } else {
                throw new Error(`不支持的插件类型: ${fileExt}`);
            }

            this.sendOutput(`插件 ${pluginConfig.pluginName || path.basename(pluginPath)} 启动成功\n`);
            
        } catch (error) {
            console.error('执行插件失败:', error);
            const errorMsg = `执行插件失败: ${error.message}\n`;
            this.sendError(errorMsg);
            // 不要重新抛出错误，避免上层再次处理导致双重错误
        }
    }
    
    // 创建插件窗口（适用于HTML插件）
    async createPluginWindow(pluginPath, pluginConfig) {
        const pluginName = pluginConfig.pluginName || path.basename(pluginPath);
        
        // 检查插件是否已经在运行
        if (this.pluginWindows.has(pluginName)) {
            const existingWindow = this.pluginWindows.get(pluginName);
            
            // 如果现有窗口还未销毁
            if (existingWindow && !existingWindow.isDestroyed()) {
                console.log(`插件 ${pluginName} 已经在运行，聚焦到现有窗口`);
                
                // 显示并聚焦到现有窗口
                if (!existingWindow.isVisible()) {
                    existingWindow.show();
                }
                existingWindow.focus();
                
                // 返回现有窗口，不创建新窗口
                return existingWindow;
            } else {
                // 如果窗口已销毁，清理引用
                this.pluginWindows.delete(pluginName);
                this.pluginPinnedMap.delete(pluginName);
                console.log(`插件 ${pluginName} 的旧窗口已销毁，将创建新窗口`);
            }
        }

        const mainFile = pluginConfig.main || 'index.html';
        const mainFilePath = path.join(pluginPath, mainFile);
        
        console.log(`创建新的插件窗口: ${pluginName}`);
        
        // 获取插件图标路径
        const pluginIconPath = this.getPluginIconPath(pluginPath);
        console.log(`插件 ${pluginName} 图标路径: ${pluginIconPath}`);
        
        // 创建插件窗口，默认不显示在任务栏，且不置顶
        const pluginWindow = new BrowserWindow({
            width: pluginConfig.pluginSetting?.width || 800,
            height: pluginConfig.pluginSetting?.height || 600,
            title: pluginName,
            icon: pluginIconPath, // 设置窗口图标
            skipTaskbar: true,  // 默认不显示在任务栏
            alwaysOnTop: false, // 默认不置顶
            minimizable: true,  // 允许最小化
            resizable: true,    // 允许调整大小
            frame: false,       // 隐藏默认窗口边框，使用自定义标题栏
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true,
                webSecurity: false,
                // 如果有preload脚本，加载它
                preload: pluginConfig.preload ? path.join(pluginPath, pluginConfig.preload) : undefined
            },
            show: false
        });

        // 为插件窗口设置独特的应用ID，确保在任务栏中独立显示
        try {
            if (process.platform === 'win32') {
                // 为每个插件生成唯一的AppUserModelID
                const appId = `SanRenJuZhi.Plugin.${pluginName.replace(/[^a-zA-Z0-9]/g, '')}`;
                console.log(`为插件 ${pluginName} 设置应用ID: ${appId}`);
                
                // 准备应用详情参数
                const appDetails = {
                    appId: appId,
                    appIconIndex: 0,
                    relaunchCommand: '', // 空字符串表示不提供重启命令
                    relaunchDisplayName: pluginName
                };
                
                // 获取.ico格式的图标用于任务栏显示
                const icoIconPath = this.getPluginIcoPath(pluginPath);
                if (icoIconPath) {
                    appDetails.appIconPath = icoIconPath;
                    console.log(`任务栏将使用图标: ${icoIconPath}`);
                } else {
                    console.log(`插件 ${pluginName} 没有可用的.ico图标，任务栏将使用默认图标`);
                }
                
                pluginWindow.setAppDetails(appDetails);
            }
        } catch (error) {
            console.error(`设置插件 ${pluginName} 的应用详情失败:`, error);
        }

        // 插件窗口按键监听：只处理窗口控制快捷键，不处理钉住快捷键
        pluginWindow.webContents.on('before-input-event', (event, input) => {
            // Ctrl+W 关闭插件窗口
            if (input.control && !input.shift && !input.alt && input.key.toLowerCase() === 'w') {
                console.log('插件窗口内Ctrl+W被触发，关闭窗口');
                this.stopPlugin(pluginName);
                event.preventDefault();
                return;
            }
            
            // 其他快捷键不拦截，让全局快捷键正常工作
            // 特别注意：不要在这里处理钉住快捷键，避免与全局快捷键冲突
        });

        // 初始化钉住状态
        this.pluginPinnedMap.set(pluginName, false);
        console.log(`插件 ${pluginName} 钉住状态初始化为: false`);

        // 失去焦点时隐藏窗口（除非被钉住）
        pluginWindow.on('blur', () => {
            const pinned = this.pluginPinnedMap.get(pluginName);
            console.log(`插件 ${pluginName} 失去焦点，钉住状态: ${pinned}`);
            
            // 如果没有钉住，延迟隐藏窗口以允许快捷键操作
            if (!pinned && pluginWindow && !pluginWindow.isDestroyed()) {
                // 延迟500ms隐藏，给钉住快捷键操作留出充足时间
                setTimeout(() => {
                    // 再次检查钉住状态，可能在延迟期间被改变了
                    const currentPinned = this.pluginPinnedMap.get(pluginName);
                    if (!currentPinned && pluginWindow && !pluginWindow.isDestroyed() && !pluginWindow.isFocused()) {
                        console.log(`插件 ${pluginName} 因失去焦点而隐藏`);
                        pluginWindow.hide();
                    }
                }, 500);
            }
            // 如果已钉住，保持显示状态
        });

        // 窗口关闭时清理状态
        pluginWindow.on('closed', () => {
            console.log(`插件窗口关闭，清理状态: ${pluginName}`);
            this.pluginWindows.delete(pluginName);
            this.pluginPinnedMap.delete(pluginName);
        });

        // 监听窗口最大化/还原状态变化
        pluginWindow.on('maximize', () => {
            if (pluginWindow.webContents) {
                pluginWindow.webContents.send('window-maximized', true);
            }
        });

        pluginWindow.on('unmaximize', () => {
            if (pluginWindow.webContents) {
                pluginWindow.webContents.send('window-maximized', false);
            }
        });

        // 为插件窗口注入全局变量
        pluginWindow.webContents.once('dom-ready', () => {
            // 添加完整的自定义标题栏样式
            pluginWindow.webContents.insertCSS(`
                /* 自定义标题栏样式 */
                .custom-title-bar {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 32px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #e1e4e8;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    z-index: 10000;
                    -webkit-app-region: drag;
                    user-select: none;
                }
                
                .title-bar-title {
                    flex: 1;
                    padding-left: 12px;
                    font-size: 14px;
                    color: #24292e;
                    font-weight: 500;
                    -webkit-app-region: drag;
                }
                
                .title-bar-controls {
                    display: flex;
                    align-items: center;
                    -webkit-app-region: no-drag;
                }
                
                .title-bar-pin-button {
                    background: transparent;
                    border: none;
                    border-radius: 3px;
                    padding: 4px 8px;
                    font-size: 14px;
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.3s;
                    width: 32px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    -webkit-app-region: no-drag;
                    margin-right: 4px;
                    color: #666;
                }
                .title-bar-pin-button:hover {
                    background: #e1e4e8;
                }
                .title-bar-pin-button.pinned {
                    background: #0078d4 !important;
                    color: white !important;
                }
                .title-bar-pin-button.pinned:hover {
                    background: #106ebe !important;
                }
                
                .window-control-button {
                    background: transparent;
                    border: none;
                    width: 46px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background-color 0.2s;
                    -webkit-app-region: no-drag;
                }
                
                .window-control-button:hover {
                    background: #e1e4e8;
                }
                
                .window-control-button.close:hover {
                    background: #e13238;
                    color: white;
                }
                
                /* 调整页面内容位置 */
                body {
                    padding-top: 32px !important;
                }
            `);
            
            // 注入插件路径和配置
            pluginWindow.webContents.executeJavaScript(`
                try {
                    // 创建完整的自定义标题栏
                    const { ipcRenderer } = require('electron');
                    // 安全地定义插件名称，避免字符串转义问题
                    const pluginName = ${JSON.stringify(pluginName)};
                    const pluginIconPath = ${JSON.stringify(pluginIconPath)};
                    
                    // 创建标题栏容器
                    const titleBar = document.createElement('div');
                    titleBar.className = 'custom-title-bar';
                    
                    // 创建标题区域
                    const titleElement = document.createElement('div');
                    titleElement.className = 'title-bar-title';
                    
                    // 如果有插件图标，创建图标元素
                    if (pluginIconPath) {
                        const iconElement = document.createElement('img');
                        iconElement.src = 'file://' + pluginIconPath.replace(/\\\\/g, '/');
                        iconElement.style.cssText = \`
                            width: 16px;
                            height: 16px;
                            margin-right: 8px;
                            vertical-align: middle;
                        \`;
                        iconElement.onerror = function() {
                            // 如果图标加载失败，隐藏图标元素
                            this.style.display = 'none';
                        };
                        titleElement.appendChild(iconElement);
                    }
                    
                    // 添加标题文本
                    const titleText = document.createElement('span');
                    titleText.textContent = pluginName;
                    titleElement.appendChild(titleText);
                    
                    // 创建控制按钮区域
                    const controlsContainer = document.createElement('div');
                    controlsContainer.className = 'title-bar-controls';
                    
                    // 创建钉住按钮
                    const pinButton = document.createElement('button');
                    pinButton.className = 'title-bar-pin-button';
                    pinButton.innerHTML = '📌'; // 使用innerHTML而不是textContent以支持emoji
                    pinButton.title = '钉住到任务栏';
                    
                    let isPinned = false;
                    
                    // 更新钉住按钮状态的函数
                    function updatePinButtonState(pinned) {
                        isPinned = pinned;
                        if (isPinned) {
                            pinButton.classList.add('pinned');
                            pinButton.innerHTML = '📌'; // 钉住时显示实心图钉
                            pinButton.title = '已钉住 - 点击取消钉住';
                            pinButton.style.background = '#0078d4';
                            pinButton.style.color = 'white';
                        } else {
                            pinButton.classList.remove('pinned');
                            pinButton.innerHTML = '📍'; // 未钉住时显示空心图钉
                            pinButton.title = '钉住到任务栏';
                            pinButton.style.background = 'transparent';
                            pinButton.style.color = '#666';
                        }
                    }
                    
                    // 钉住按钮点击事件
                    pinButton.addEventListener('click', async () => {
                        try {
                            console.log('点击钉住按钮，当前状态:', isPinned);
                            const newStatus = await ipcRenderer.invoke('toggle-plugin-pin-window', pluginName);
                            console.log('钉住状态更新为:', newStatus);
                            updatePinButtonState(newStatus);
                        } catch (error) {
                            console.error('切换钉住状态失败:', error);
                        }
                    });
                    
                    // 创建最小化按钮
                    const minimizeButton = document.createElement('button');
                    minimizeButton.className = 'window-control-button minimize';
                    minimizeButton.innerHTML = '&#8211;';
                    minimizeButton.title = '最小化';
                    minimizeButton.addEventListener('click', async () => {
                        try {
                            console.log('点击最小化按钮');
                            await ipcRenderer.invoke('minimize-plugin-window', pluginName);
                        } catch (error) {
                            console.error('最小化失败:', error);
                        }
                    });
                    
                    // 创建最大化/还原按钮
                    const maximizeButton = document.createElement('button');
                    maximizeButton.className = 'window-control-button maximize';
                    maximizeButton.innerHTML = '&#9633;';
                    maximizeButton.title = '最大化';
                    maximizeButton.addEventListener('click', async () => {
                        try {
                            console.log('点击最大化按钮');
                            const isMaximized = await ipcRenderer.invoke('maximize-plugin-window', pluginName);
                            if (isMaximized) {
                                maximizeButton.title = '还原';
                                maximizeButton.innerHTML = '&#9635;';
                            } else {
                                maximizeButton.title = '最大化';
                                maximizeButton.innerHTML = '&#9633;';
                            }
                        } catch (error) {
                            console.error('最大化失败:', error);
                        }
                    });
                    
                    // 创建关闭按钮
                    const closeButton = document.createElement('button');
                    closeButton.className = 'window-control-button close';
                    closeButton.innerHTML = '&#10005;';
                    closeButton.title = '关闭';
                    closeButton.addEventListener('click', async () => {
                        try {
                            console.log('点击关闭按钮');
                            await ipcRenderer.invoke('close-plugin-window', pluginName);
                        } catch (error) {
                            console.error('关闭失败:', error);
                        }
                    });
                    
                    // 组装控制按钮
                    controlsContainer.appendChild(pinButton);
                    controlsContainer.appendChild(minimizeButton);
                    controlsContainer.appendChild(maximizeButton);
                    controlsContainer.appendChild(closeButton);
                    
                    // 组装标题栏
                    titleBar.appendChild(titleElement);
                    titleBar.appendChild(controlsContainer);
                    
                    // 初始化钉住状态
                    ipcRenderer.invoke('get-plugin-pin-status-window', pluginName).then(status => {
                        console.log('插件初始钉住状态:', pluginName, status);
                        updatePinButtonState(status);
                    }).catch(error => {
                        console.error('获取钉住状态失败:', error);
                        updatePinButtonState(false); // 默认未钉住
                    });
                    
                    // 添加标题栏到页面
                    document.body.appendChild(titleBar);
                    
                    // 监听窗口状态变化
                    ipcRenderer.on('window-maximized', (event, isMaximized) => {
                        if (isMaximized) {
                            maximizeButton.title = '还原';
                            maximizeButton.innerHTML = '&#9635;';
                        } else {
                            maximizeButton.title = '最大化';
                            maximizeButton.innerHTML = '&#9633;';
                        }
                    });
                    
                    // 监听钉住状态更新事件
                    ipcRenderer.on('pin-status-updated', (event, newPinStatus) => {
                        console.log('收到钉住状态更新事件:', newPinStatus);
                        updatePinButtonState(newPinStatus);
                    });
                    
                    console.log('自定义标题栏创建完成');
                } catch (error) {
                    console.error('创建标题栏失败:', error);
                }
                
                // 安全地定义变量，避免字符串转义问题
                window.pluginPath = ${JSON.stringify(pluginPath)};
                window.pluginConfig = ${JSON.stringify(pluginConfig)};
                window.currentPluginName = ${JSON.stringify(pluginName)};
                
                // 模拟uTools API的基本功能
                window.utools = {
                    // 输出插件信息
                    outPlugin: () => {
                        require('electron').ipcRenderer.invoke('close-plugin-window', window.currentPluginName);
                    },
                    
                    // 隐藏主窗口
                    hideMainWindow: () => {
                        require('electron').remote.getCurrentWindow().hide();
                    },
                    
                    // 显示主窗口
                    showMainWindow: () => {
                        require('electron').remote.getCurrentWindow().show();
                    },
                    
                    // 复制文本到剪贴板
                    copyText: (text) => {
                        require('electron').clipboard.writeText(text);
                    },
                    
                    // 获取剪贴板文本
                    getCopyedText: () => {
                        return require('electron').clipboard.readText();
                    },
                    
                    // 模拟键盘按键
                    simulateKeyboardTap: (key, ...modifiers) => {
                        try {
                            console.log('模拟键盘按键:', key, modifiers);
                            
                            if (process.platform === 'win32') {
                                // 在Windows上使用PowerShell实现键盘模拟
                                const { spawn } = require('child_process');
                                
                                let keyString = '';
                                if (modifiers.includes('ctrl')) keyString += '^';
                                if (modifiers.includes('shift')) keyString += '+';
                                if (modifiers.includes('alt')) keyString += '%';
                                keyString += key;
                                
                                const psScript = \`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("\${keyString}")\`;
                                
                                const ps = spawn('powershell', [
                                    '-Command', psScript
                                ], { 
                                    windowsHide: true,
                                    stdio: 'ignore'
                                });
                                
                                ps.on('close', (code) => {
                                    console.log(\`键盘模拟完成，退出码: \${code}\`);
                                });
                                
                                return true;
                            } else {
                                console.log('当前平台不支持键盘模拟');
                                return false;
                            }
                        } catch (error) {
                            console.error('键盘模拟失败:', error);
                            return false;
                        }
                    },
                    
                    // 显示通知
                    showNotification: (message) => {
                        try {
                            const { Notification } = require('electron');
                            if (Notification.isSupported()) {
                                const notification = new Notification({
                                    title: '插件通知',
                                    body: message,
                                    timeoutType: 'default'
                                });
                                notification.show();
                            } else {
                                console.log('通知:', message);
                            }
                        } catch (error) {
                            console.error('显示通知失败:', error);
                        }
                    },
                    
                    // 插件本地存储
                    dbStorage: {
                        setItem: (key, value) => {
                            try {
                                console.log('插件存储设置开始:', window.currentPluginName, key, typeof value, value);
                                
                                // 深度克隆并确保值是可序列化的
                                let serializableValue;
                                try {
                                    // 先尝试序列化测试
                                    const testSerialization = JSON.stringify(value);
                                    // 如果成功，再反序列化以确保数据完整性
                                    serializableValue = JSON.parse(testSerialization);
                                    console.log('序列化测试通过:', serializableValue);
                                } catch (serializeError) {
                                    console.error('值不可序列化，转换为字符串:', serializeError);
                                    serializableValue = String(value);
                                }
                                
                                const { ipcRenderer } = require('electron');
                                // 使用同步IPC调用主进程的存储API
                                const result = ipcRenderer.sendSync('plugin-storage-set', window.currentPluginName, key, serializableValue);
                                console.log('插件存储设置结果:', window.currentPluginName, key, '成功:', result);
                                return result;
                            } catch (error) {
                                console.error('插件存储设置失败:', error);
                                alert('保存设置失败: ' + error.message);
                                return false;
                            }
                        },
                        getItem: (key) => {
                            try {
                                console.log('插件存储获取开始:', window.currentPluginName, key);
                                const { ipcRenderer } = require('electron');
                                // 使用同步IPC调用主进程的存储API
                                const result = ipcRenderer.sendSync('plugin-storage-get', window.currentPluginName, key);
                                console.log('插件存储获取结果:', window.currentPluginName, key, '结果:', result);
                                return result;
                            } catch (error) {
                                console.error('插件存储获取失败:', error);
                                return null;
                            }
                        },
                        removeItem: (key) => {
                            try {
                                console.log('插件存储删除开始:', window.currentPluginName, key);
                                const { ipcRenderer } = require('electron');
                                // 使用同步IPC调用主进程的存储API
                                const result = ipcRenderer.sendSync('plugin-storage-remove', window.currentPluginName, key);
                                console.log('插件存储删除结果:', window.currentPluginName, key, '成功:', result);
                                return result;
                            } catch (error) {
                                console.error('插件存储删除失败:', error);
                                return false;
                            }
                        }
                    },
                    
                    // 显示文件/文件夹选择对话框
                    showOpenDialog: (options) => {
                        try {
                            const { ipcRenderer } = require('electron');
                            const defaultOptions = {
                                title: '选择文件或文件夹',
                                properties: ['openFile']
                            };
                            const dialogOptions = { ...defaultOptions, ...options };
                            const result = ipcRenderer.sendSync('show-open-dialog', dialogOptions);
                            return result;
                        } catch (error) {
                            console.error('文件选择对话框错误:', error);
                            return null;
                        }
                    },
                    
                    // 切换钉住状态
                    togglePin: () => {
                        const { ipcRenderer } = require('electron');
                        return ipcRenderer.invoke('toggle-plugin-pin-window', window.currentPluginName);
                    },
                    
                    // 获取钉住状态
                    getPinStatus: () => {
                        const { ipcRenderer } = require('electron');
                        return ipcRenderer.invoke('get-plugin-pin-status-window', window.currentPluginName);
                    },
                    
                    // 插件进入事件（兼容性方法）
                    onPluginEnter: (callback) => {
                        console.log('注册插件进入事件');
                        setTimeout(() => {
                            if (callback) {
                                callback({
                                    code: 'main',
                                    type: 'enter',
                                    payload: null
                                });
                            }
                        }, 100);
                    },
                    
                    // 插件准备就绪事件
                    onPluginReady: (callback) => {
                        console.log('注册插件准备就绪事件');
                        setTimeout(() => {
                            if (callback) {
                                callback();
                            }
                        }, 200);
                    }
                };
            `);
        });

        // 加载插件主页面
        pluginWindow.loadFile(mainFilePath);

        // 窗口准备显示时显示窗口
        pluginWindow.once('ready-to-show', () => {
            pluginWindow.show();
        });

        // 存储窗口引用
        this.pluginWindows.set(pluginName, pluginWindow);
        
        return pluginWindow;
    }

    // 执行JavaScript插件（适用于纯JS插件）
    async executeJavaScriptPlugin(pluginPath, pluginConfig) {
        const pluginName = pluginConfig.pluginName || path.basename(pluginPath);
        const mainFile = pluginConfig.main || 'index.js';
        const mainFilePath = path.join(pluginPath, mainFile);

        // 如果插件已经在运行，先停止旧进程
        if (this.pluginProcesses.has(pluginName)) {
            const oldProcess = this.pluginProcesses.get(pluginName);
            if (!oldProcess.killed) {
                oldProcess.kill();
            }
        }

        return new Promise((resolve, reject) => {
            // 使用child_process.fork执行JavaScript文件
            const pluginProcess = fork(mainFilePath, [], {
                cwd: pluginPath,
                env: {
                    ...process.env,
                    PLUGIN_PATH: pluginPath,
                    PLUGIN_NAME: pluginName,
                    PLUGIN_CONFIG: JSON.stringify(pluginConfig)
                }
            });

            // 监听子进程的消息
            pluginProcess.on('message', (message) => {
                if (message.type === 'output') {
                    this.sendOutput(message.data);
                } else if (message.type === 'error') {
                    this.sendError(message.data);
                }
            });

            // 监听子进程错误
            pluginProcess.on('error', (error) => {
                console.error(`插件进程错误 ${pluginName}:`, error);
                this.sendError(`插件执行错误: ${error.message}\n`);
                this.pluginProcesses.delete(pluginName);
                reject(error);
            });

            // 监听子进程退出
            pluginProcess.on('exit', (code, signal) => {
                console.log(`插件进程退出 ${pluginName}: code=${code}, signal=${signal}`);
                this.pluginProcesses.delete(pluginName);
                if (code !== 0) {
                    this.sendError(`插件进程异常退出，退出码: ${code}\n`);
                }
                });

                // 存储进程引用
            this.pluginProcesses.set(pluginName, pluginProcess);
            resolve(pluginProcess);
        });
    }

    // 停止插件
    stopPlugin(pluginName) {
        try {
            // 关闭插件窗口
            if (this.pluginWindows.has(pluginName)) {
                const pluginWindow = this.pluginWindows.get(pluginName);
                if (pluginWindow && !pluginWindow.isDestroyed()) {
                    pluginWindow.close();
                }
                this.pluginWindows.delete(pluginName);
            }

            // 清理钉住状态
            if (this.pluginPinnedMap.has(pluginName)) {
                this.pluginPinnedMap.delete(pluginName);
            }

            // 终止插件进程
            if (this.pluginProcesses.has(pluginName)) {
                const pluginProcess = this.pluginProcesses.get(pluginName);
                if (pluginProcess && !pluginProcess.killed) {
                    pluginProcess.kill();
                }
                this.pluginProcesses.delete(pluginName);
            }

            this.sendOutput(`插件 ${pluginName} 已停止\n`);
        } catch (error) {
            console.error(`停止插件 ${pluginName} 时出错:`, error);
        }
    }

    // 停止所有插件
    stopAllPlugins() {
        // 关闭所有插件窗口
        for (const [pluginName, pluginWindow] of this.pluginWindows) {
            if (!pluginWindow.isDestroyed()) {
                pluginWindow.close();
            }
        }
        this.pluginWindows.clear();

        // 终止所有插件进程
        for (const [pluginName, pluginProcess] of this.pluginProcesses) {
            if (!pluginProcess.killed) {
                pluginProcess.kill();
            }
        }
        this.pluginProcesses.clear();

        this.sendOutput('所有插件已停止\n');
    }

    // 重新加载插件（用于开发调试）
    async reloadPlugin(pluginPath) {
        const pluginJsonPath = path.join(pluginPath, 'plugin.json');
        
        if (!fs.existsSync(pluginJsonPath)) {
            throw new Error(`插件配置文件不存在: ${pluginJsonPath}`);
        }

        const pluginConfig = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
        const pluginName = pluginConfig.pluginName || path.basename(pluginPath);
        
        // 先停止插件
        this.stopPlugin(pluginName);
        
        // 等待一小段时间确保资源释放
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 重新启动插件
        return this.runPlugin(pluginPath, pluginConfig.features);
    }

    // 切换插件窗口钉住状态
    togglePluginPin(pluginName) {
        try {
            const win = this.pluginWindows.get(pluginName);
            if (!win || win.isDestroyed()) {
                console.log(`插件窗口 ${pluginName} 不存在或已销毁，无法切换钉住状态`);
                return false;
            }
            
            const currentStatus = this.pluginPinnedMap.get(pluginName) || false;
            const newStatus = !currentStatus;
            this.pluginPinnedMap.set(pluginName, newStatus);
            
            console.log(`插件 ${pluginName} 钉住状态: ${currentStatus} -> ${newStatus}`);
            
            if (newStatus) {
                // 钉住：显示在任务栏，允许最小化，保持窗口显示
                win.setSkipTaskbar(false);
                win.setMinimizable(true);  // 钉住时允许最小化
                if (!win.isVisible()) {
                    win.show();
                }
                console.log(`插件 ${pluginName} 已钉住到任务栏，将独立显示`);
                
                // 确保窗口在任务栏中独立显示（Windows特定）
                if (process.platform === 'win32') {
                    try {
                        // 强制刷新任务栏状态
                        setTimeout(() => {
                            if (win && !win.isDestroyed()) {
                                win.setSkipTaskbar(true);
                                setTimeout(() => {
                                    if (win && !win.isDestroyed()) {
                                        win.setSkipTaskbar(false);
                                        console.log(`插件 ${pluginName} 任务栏状态已刷新`);
                                    }
                                }, 100);
                            }
                        }, 100);
                    } catch (refreshError) {
                        console.error(`刷新插件 ${pluginName} 任务栏状态失败:`, refreshError);
                    }
                }
            } else {
                // 取消钉住：从任务栏移除，不允许最小化，但不立即隐藏
                win.setSkipTaskbar(true);
                win.setMinimizable(false); // 取消钉住时不允许最小化
                console.log(`插件 ${pluginName} 已从任务栏移除，窗口保持显示`);
                // 注意：不在这里隐藏窗口，让blur事件处理隐藏逻辑
            }
            
            // 向渲染进程发送钉住状态更新事件
            try {
                if (win.webContents && !win.webContents.isDestroyed()) {
                    win.webContents.send('pin-status-updated', newStatus);
                    console.log(`向插件 ${pluginName} 发送钉住状态更新事件: ${newStatus}`);
                }
            } catch (sendError) {
                console.error(`发送钉住状态更新事件失败:`, sendError);
            }
            
            return newStatus;
        } catch (error) {
            console.error(`切换插件 ${pluginName} 钉住状态时出错:`, error);
            return false;
        }
    }

    // 获取插件窗口钉住状态
    getPluginPinStatus(pluginName) {
        return this.pluginPinnedMap.get(pluginName) || false;
    }

    // 最小化插件窗口
    minimizePlugin(pluginName) {
        const win = this.pluginWindows.get(pluginName);
        if (win && !win.isDestroyed()) {
            win.minimize();
            return true;
        }
        return false;
    }

    // 最大化/还原插件窗口
    maximizePlugin(pluginName) {
        const win = this.pluginWindows.get(pluginName);
        if (win && !win.isDestroyed()) {
            if (win.isMaximized()) {
                win.unmaximize();
                return false; // 返回false表示现在是还原状态
            } else {
                win.maximize();
                return true; // 返回true表示现在是最大化状态
            }
        }
        return false;
    }

    // 获取活跃的插件窗口（当前获得焦点的插件窗口）
    getActivePluginWindow() {
        for (const [pluginName, pluginWindow] of this.pluginWindows) {
            if (pluginWindow && !pluginWindow.isDestroyed() && pluginWindow.isFocused()) {
                return pluginWindow;
            }
        }
        return null;
    }

    // 获取可见的插件窗口（用于快捷键操作）
    getVisiblePluginWindow() {
        for (const [pluginName, pluginWindow] of this.pluginWindows) {
            if (pluginWindow && !pluginWindow.isDestroyed() && pluginWindow.isVisible()) {
                return pluginWindow;
            }
        }
        return null;
    }

    // 根据窗口对象获取插件名称
    getPluginNameByWindow(window) {
        for (const [pluginName, pluginWindow] of this.pluginWindows) {
            if (pluginWindow === window) {
                return pluginName;
            }
        }
        return null;
    }

    // 获取插件图标路径 - 优先使用 logo.ico，否则使用 logo.png
    getPluginIconPath(pluginPath) {
        try {
            const logoIcoPath = path.join(pluginPath, 'logo.ico');
            const logoPngPath = path.join(pluginPath, 'logo.png');
            
            // 优先检查 logo.ico
            if (fs.existsSync(logoIcoPath)) {
                console.log(`插件图标找到 logo.ico: ${logoIcoPath}`);
                return logoIcoPath;
            }
            
            // 其次检查 logo.png
            if (fs.existsSync(logoPngPath)) {
                console.log(`插件图标找到 logo.png: ${logoPngPath}`);
                return logoPngPath;
            }
            
            // 如果都没有，使用主应用的图标
            const appIconPath = app.isPackaged 
                ? path.join(process.resourcesPath, 'build', 'icon.ico')
                : path.join(__dirname, '..', 'build', 'icon.ico');
                
            if (fs.existsSync(appIconPath)) {
                console.log(`插件无自定义图标，使用主应用图标: ${appIconPath}`);
                return appIconPath;
            }
            
            console.log('未找到插件图标文件');
            return undefined;
        } catch (error) {
            console.error('获取插件图标路径失败:', error);
            return undefined;
        }
    }

    // 获取插件的.ico格式图标（专门用于任务栏显示）- 优先使用 logo.ico，其次 logo.png
    getPluginIcoPath(pluginPath) {
        try {
            const logoIcoPath = path.join(pluginPath, 'logo.ico');
            const logoPngPath = path.join(pluginPath, 'logo.png');
            
            // 优先检查 logo.ico
            if (fs.existsSync(logoIcoPath)) {
                console.log(`插件.ico图标找到 logo.ico: ${logoIcoPath}`);
                return logoIcoPath;
            }
            
            // 其次检查 logo.png（虽然不是.ico格式，但可以作为备选）
            if (fs.existsSync(logoPngPath)) {
                console.log(`插件.ico图标找到 logo.png: ${logoPngPath}`);
                return logoPngPath;
            }
            
            // 如果都没有，使用主应用的.ico图标
            const appIconPath = app.isPackaged 
                ? path.join(process.resourcesPath, 'build', 'icon.ico')
                : path.join(__dirname, '..', 'build', 'icon.ico');
                
            if (fs.existsSync(appIconPath)) {
                console.log(`插件无自定义图标，使用主应用.ico图标: ${appIconPath}`);
                return appIconPath;
            }
            
            console.log('未找到插件.ico格式图标文件');
            return undefined;
        } catch (error) {
            console.error('获取插件.ico图标路径失败:', error);
            return undefined;
        }
    }

    // 加载设置的方法（从main.js复制）
    loadSettings() {
        try {
            const path = require('path');
            const fs = require('fs');
            const { app } = require('electron');
            
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            const defaultSettings = {
                globalHotkey: 'Ctrl+Space',
                autoStart: false,
                pinHotkey: 'Ctrl+D'
            };
            
            if (fs.existsSync(settingsPath)) {
                const data = fs.readFileSync(settingsPath, 'utf8');
                return { ...defaultSettings, ...JSON.parse(data) };
            }
            return defaultSettings;
        } catch (error) {
            console.error('读取设置失败:', error);
            return {
                globalHotkey: 'Ctrl+Space',
                autoStart: false,
                pinHotkey: 'Ctrl+D'
            };
        }
    }

    // 执行插件的特定功能
    async runPluginAction(pluginPath, feature, selectedText) {
        try {
            console.log('🎯 执行插件功能:', feature.code, '选中文本:', selectedText);
            
            const pluginJsonPath = path.join(pluginPath, 'plugin.json');
            
            if (!fs.existsSync(pluginJsonPath)) {
                throw new Error(`插件配置文件不存在: ${pluginJsonPath}`);
            }

            const pluginConfig = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
            const pluginName = pluginConfig.pluginName || path.basename(pluginPath);

            // 检查插件是否已经运行，如果没有，先创建插件窗口
            let pluginWindow;
            if (this.pluginWindows.has(pluginName)) {
                pluginWindow = this.pluginWindows.get(pluginName);
                if (pluginWindow && pluginWindow.isDestroyed()) {
                    this.pluginWindows.delete(pluginName);
                    pluginWindow = null;
                }
            }

            // 如果插件窗口不存在，创建一个
            if (!pluginWindow) {
                console.log(`插件 ${pluginName} 未运行，创建插件窗口`);
                pluginWindow = await this.createPluginWindow(pluginPath, pluginConfig);
                
                // 等待窗口内容加载完成
                await new Promise((resolve) => {
                    pluginWindow.webContents.once('dom-ready', resolve);
                });
                
                // 稍微延迟，确保插件初始化完成
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 确保窗口可见
            if (!pluginWindow.isVisible()) {
                pluginWindow.show();
            }
            
            // 聚焦窗口
            pluginWindow.focus();

            // 发送功能执行请求到插件
            try {
                console.log('向插件发送功能执行请求:', feature.code);
                
                // 首先检查插件是否支持exports API
                const result = await pluginWindow.webContents.executeJavaScript(`
                    (function() {
                        try {
                            // 检查插件是否有exports对象和对应的功能
                            if (typeof window.exports === 'object' && window.exports && window.exports['${feature.code}']) {
                                const featureHandler = window.exports['${feature.code}'];
                                console.log('找到插件功能处理器:', '${feature.code}');
                                
                                // 执行功能
                                if (featureHandler.mode === 'list') {
                                    // 列表模式：通过enter方法进入功能
                                    if (featureHandler.args && featureHandler.args.enter) {
                                        console.log('执行列表模式功能');
                                        featureHandler.args.enter('${feature.code}', function(items) {
                                            console.log('插件返回的列表项:', items.length);
                                        });
                                        return { success: true, message: '插件功能已启动' };
                                    }
                                } else if (featureHandler.mode === 'none') {
                                    // 无模式：直接通过enter方法执行
                                    if (featureHandler.args && featureHandler.args.enter) {
                                        console.log('执行无模式功能');
                                        featureHandler.args.enter('${feature.code}');
                                        return { success: true, message: '插件功能已执行' };
                                    }
                                }
                                
                                return { success: false, error: '未找到合适的功能处理方法' };
                            } else {
                                console.log('插件exports对象或功能不存在');
                                return { success: false, error: '插件功能未找到' };
                            }
                        } catch (error) {
                            console.error('执行插件功能时出错:', error);
                            return { success: false, error: error.message };
                        }
                    })();
                `);

                console.log('插件功能执行结果:', result);

                if (result && result.success) {
                    return { success: true, message: result.message || '插件功能执行成功' };
                } else {
                    console.warn('插件功能执行失败:', result?.error);
                    return { success: false, error: result?.error || '插件功能执行失败' };
                }

            } catch (executeError) {
                console.error('向插件发送执行请求失败:', executeError);
                return { success: false, error: `插件通信失败: ${executeError.message}` };
            }

        } catch (error) {
            console.error('执行插件功能失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 获取插件路径（供外部调用）
    getPluginPath(pluginName) {
        // 根据插件名称推算插件路径
        const folderNameMap = {
            '余汉波文本片段助手': 'sanrenjz-tools-text',
            '密码管理器': 'sanrenjz-tools-password',
            '插件下载': 'sanrenjz-tools-download_plugin',
            '余汉波AI助手': 'sanrenjz.tools-ai'
        };
        
        const folderName = folderNameMap[pluginName] || pluginName.toLowerCase().replace(/\s+/g, '-');
        return path.join(this.pluginDir, folderName);
    }
}

module.exports = PluginManager; 