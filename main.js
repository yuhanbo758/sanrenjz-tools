const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, dialog, shell, screen, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const remoteMain = require('@electron/remote/main');

// 初始化remote模块
remoteMain.initialize();

// 导入插件管理器
const PluginManager = require('./app/software_manager.js');

// 主窗口变量
let mainWindow;
let searchWindow;
let tray;
let pluginManager;

// 超级面板相关变量
let superPanelWindow;
let isSuperPanelGracePeriod = false; // 宽限期标志
let hasActiveInput = false; // 输入框活动状态

// 右键长按监控相关变量
let rightClickMonitor = null;
let isRightClickMonitorRunning = false;

// 钉住状态
let isPinned = false;

// 设置文件路径
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// 默认设置
const defaultSettings = {
    globalHotkey: 'Ctrl+Space',
    autoStart: false,
    pinHotkey: 'Ctrl+D',
    enableRightClickPanel: true,
    rightClickDelay: 500,
    customPluginDataPath: ''
};

// 加载设置
function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(data);
            return { ...defaultSettings, ...settings };
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
    return defaultSettings;
}

// 保存设置
function saveSettings(settings) {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log('设置已保存');
    } catch (error) {
        console.error('保存设置失败:', error);
    }
}

// 获取文本片段的函数
function getTextSnippets(searchPaths) {
    const snippets = [];
    
    // 确保searchPaths是数组
    const paths = Array.isArray(searchPaths) ? searchPaths : [searchPaths];
    
    paths.forEach(searchPath => {
        if (!searchPath || !fs.existsSync(searchPath)) {
            console.log(`路径不存在: ${searchPath}`);
            return;
        }
        
        try {
            // 如果是插件存储路径，从插件管理器获取数据
            if (pluginManager && searchPath.includes('plugin-storage')) {
                const pluginData = pluginManager.getAllPluginData();
                Object.entries(pluginData).forEach(([pluginName, data]) => {
                    if (data && typeof data === 'object') {
                        Object.entries(data).forEach(([key, value]) => {
                            if (typeof value === 'string' && value.length > 0) {
                                snippets.push({
                                    title: `${pluginName} - ${key}`,
                                    content: value,
                                    preview: value.substring(0, 100) + (value.length > 100 ? '...' : ''),
                                    source: 'plugin-data',
                                    pluginName: pluginName
                                });
                            }
                        });
                    }
                });
                return;
            }
            
            // 递归扫描目录，最大深度为2
            function scanDirectory(dirPath, currentDepth = 0) {
                if (currentDepth > 2) return;
                
                const items = fs.readdirSync(dirPath);
                
                items.forEach(item => {
                    const itemPath = path.join(dirPath, item);
                    const stat = fs.statSync(itemPath);
                    
                    if (stat.isDirectory()) {
                        scanDirectory(itemPath, currentDepth + 1);
                    } else if (stat.isFile() && path.extname(item).toLowerCase() === '.md') {
                        try {
                            const content = fs.readFileSync(itemPath, 'utf8');
                            
                            // 解析markdown内容
                            const lines = content.split('\n');
                            let currentTitle = path.basename(item, '.md');
                            let currentContent = '';
                            
                            lines.forEach(line => {
                                line = line.trim();
                                if (line.startsWith('#')) {
                                    // 如果有之前的内容，保存它
                                    if (currentContent.trim()) {
                                        snippets.push({
                                            title: currentTitle,
                                            content: currentContent.trim(),
                                            preview: currentContent.trim().substring(0, 100) + (currentContent.trim().length > 100 ? '...' : ''),
                                            source: itemPath
                                        });
                                    }
                                    // 开始新的标题
                                    currentTitle = line.replace(/^#+\s*/, '');
                                    currentContent = '';
                                } else if (line) {
                                    currentContent += line + '\n';
                                }
                            });
                            
                            // 保存最后一个片段
                            if (currentContent.trim()) {
                                snippets.push({
                                    title: currentTitle,
                                    content: currentContent.trim(),
                                    preview: currentContent.trim().substring(0, 100) + (currentContent.trim().length > 100 ? '...' : ''),
                                    source: itemPath
                                });
                            }
                        } catch (error) {
                            console.error(`读取文件失败 ${itemPath}:`, error);
                        }
                    }
                });
            }
            
            scanDirectory(searchPath);
        } catch (error) {
            console.error(`扫描路径失败 ${searchPath}:`, error);
        }
    });
    
    // 按标题排序
    return snippets.sort((a, b) => a.title.localeCompare(b.title));
}

// 注册全局快捷键
function registerGlobalShortcut(hotkey = 'Ctrl+Space') {
    try {
        // 先注销现有的快捷键
        globalShortcut.unregister(hotkey);
        
        // 注册新的快捷键
        const ret = globalShortcut.register(hotkey, () => {
            console.log('全局快捷键被触发:', hotkey);
            showSearchWindow();
        });

        if (!ret) {
            console.log('全局快捷键注册失败:', hotkey);
            return false;
        }

        console.log('全局快捷键注册成功:', hotkey);
        return true;
    } catch (error) {
        console.error('注册全局快捷键失败:', error);
        return false;
    }
}

// 注册钉住快捷键
function registerPinShortcut(hotkey = 'Ctrl+D') {
    try {
        // 如果钉住快捷键和全局快捷键相同，跳过注册
        const settings = loadSettings();
        if (hotkey === settings.globalHotkey) {
            console.log('钉住快捷键与全局快捷键相同，跳过注册');
            return true;
        }
        
        // 先注销现有的钉住快捷键
        globalShortcut.unregister(hotkey);
        
        // 注册钉住快捷键
        const ret = globalShortcut.register(hotkey, () => {
            console.log('钉住快捷键被触发:', hotkey);
            
            // 检查搜索窗口是否可见
            if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
                togglePin();
                return;
            }
            
            // 检查是否有插件窗口可以操作
            if (pluginManager) {
                // 首先检查当前获得焦点的插件窗口
                let targetWindow = pluginManager.getActivePluginWindow();
                let pluginName = null;
                
                if (targetWindow) {
                    pluginName = pluginManager.getPluginNameByWindow(targetWindow);
                    console.log('找到获得焦点的插件窗口:', pluginName);
                } else {
                    // 如果没有获得焦点的窗口，检查所有可见的插件窗口
                    targetWindow = pluginManager.getVisiblePluginWindow();
                    if (targetWindow) {
                        pluginName = pluginManager.getPluginNameByWindow(targetWindow);
                        console.log('找到可见的插件窗口:', pluginName);
                    }
                }
                
                if (pluginName && targetWindow) {
                    console.log('对插件窗口执行钉住操作:', pluginName);
                    
                    // 立即执行钉住操作，不需要延迟
                    try {
                        const newPinStatus = pluginManager.togglePluginPin(pluginName);
                        console.log(`插件 ${pluginName} 钉住状态已更改为: ${newPinStatus}`);
                        
                        // 如果成功钉住，确保窗口显示并获得焦点
                        if (newPinStatus && targetWindow && !targetWindow.isDestroyed()) {
                            if (!targetWindow.isVisible()) {
                                targetWindow.show();
                            }
                            targetWindow.focus();
                            console.log(`插件 ${pluginName} 已显示并获得焦点`);
                        }
                        
                        return;
                    } catch (error) {
                        console.error('执行钉住操作时出错:', error);
                    }
                }
            }
            
            console.log('没有找到可操作的窗口，快捷键无效');
        });

        if (!ret) {
            console.log('钉住快捷键注册失败:', hotkey);
            return false;
        }

        console.log('钉住快捷键注册成功:', hotkey);
        return true;
    } catch (error) {
        console.error('注册钉住快捷键失败:', error);
        return false;
    }
}

// 切换钉住状态（内部函数）
function togglePin() {
    isPinned = !isPinned;
    console.log('搜索窗口钉住状态:', isPinned ? '已钉住' : '未钉住');
    
    if (searchWindow && !searchWindow.isDestroyed()) {
        // 更新窗口行为
        if (isPinned) {
            // 钉住时的行为调整
            searchWindow.setSkipTaskbar(false); // 显示在任务栏
            searchWindow.setMinimizable(true); // 允许最小化
        } else {
            // 取消钉住时恢复原始设置
            searchWindow.setSkipTaskbar(true); // 不显示在任务栏
            searchWindow.setMinimizable(false); // 不允许最小化
        }
        
        // 发送状态更新到渲染进程
        if (searchWindow.webContents) {
            searchWindow.webContents.send('pin-status-changed', isPinned);
        }
    }
    
    return isPinned;
}

// 获取资源路径的辅助函数
function getResourcePath(relativePath) {
    if (app.isPackaged) {
        // 打包后的路径
        return path.join(process.resourcesPath, 'app', relativePath);
    } else {
        // 开发环境的路径
        return path.join(__dirname, relativePath);
    }
}

// 获取图标路径
function getIconPath() {
    // 优先使用 .ico 格式，适用于 Windows
    const icoPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'build', 'icon.ico')
        : path.join(__dirname, 'build', 'icon.ico');
    
    // 检查 .ico 文件是否存在
    if (fs.existsSync(icoPath)) {
        console.log('使用图标路径:', icoPath);
        return icoPath;
    }
    
    // 备用方案：使用 assets 中的 png 图标
    const pngPath = getResourcePath('assets/icon.png');
    if (fs.existsSync(pngPath)) {
        console.log('使用备用图标路径:', pngPath);
        return pngPath;
    }
    
    // 最后备用方案：返回 null，让 Electron 使用默认图标
    console.log('未找到任何图标文件，使用默认图标');
    return null;
}

// 启动右键长按监听器
function startRightClickMonitor() {
    if (isRightClickMonitorRunning || process.platform !== 'win32') {
        return;
    }
    
    const settings = loadSettings();
    if (!settings.enableRightClickPanel) {
        return;
    }
    
    isRightClickMonitorRunning = true;
    startOptimizedRightClickMonitor(settings);
}

// 优化的右键长按监控实现 - 减少资源消耗和控制台输出
function startOptimizedRightClickMonitor(settings) {
    const os = require('os');
    const tempDir = os.tmpdir();
    const scriptPath = path.join(tempDir, `optimized_right_click_${Date.now()}.ps1`);
    
    // 优化的PowerShell脚本 - 减少轮询频率，去除不必要输出
    const psScript = `
$ErrorActionPreference = "SilentlyContinue"
$VK_RBUTTON = 0x02
$DELAY = ${settings.rightClickDelay || 500}

$signature = @'
[DllImport("user32.dll")]
public static extern short GetAsyncKeyState(int vKey);
'@

try {
    Add-Type -MemberDefinition $signature -Name 'Win32API' -Namespace 'Win32'
} catch {
    # Type already exists, continue silently
}

$pressed = $false
$startTime = 0
$longPressTriggered = $false

# 主监听循环 - 降低检测频率减少CPU占用
while ($true) {
    try {
        $state = [Win32.Win32API]::GetAsyncKeyState($VK_RBUTTON)
        $now = [Environment]::TickCount
        $isDown = ($state -band 0x8000) -ne 0
        
        if ($isDown -and -not $pressed) {
            $pressed = $true
            $startTime = $now
            $longPressTriggered = $false
        }
        elseif ($isDown -and $pressed -and -not $longPressTriggered) {
            if (($now - $startTime) -ge $DELAY) {
                $longPressTriggered = $true
                Write-Output "LONG_PRESS"
            }
        }
        elseif (-not $isDown -and $pressed) {
            $pressed = $false
            $longPressTriggered = $false
        }
        
        # 降低轮询频率从30ms增加到100ms，减少CPU占用
        Start-Sleep -Milliseconds 100
    } catch {
        Start-Sleep -Milliseconds 200
    }
}
    `;
    
    try {
        fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8' });
        
        const command = `powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "${scriptPath}"`;
        
        rightClickMonitor = exec(command, { windowsHide: true });
        
        // 简化输出处理，只处理长按事件
        rightClickMonitor.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output.includes('LONG_PRESS')) {
                showSuperPanel();
            }
        });
        
        // 静默处理错误，避免控制台输出过多
        rightClickMonitor.stderr.on('data', () => {
            // 静默处理，避免控制台跳动
        });
        
        // 进程退出处理 - 不频繁重启
        rightClickMonitor.on('exit', (code) => {
            isRightClickMonitorRunning = false;
            
            // 清理临时文件
            try {
                if (fs.existsSync(scriptPath)) {
                    fs.unlinkSync(scriptPath);
                }
            } catch (e) {
                // 静默处理清理错误
            }
            
            // 只在异常情况下重启，并增加重启间隔
            if (code !== 0 && loadSettings().enableRightClickPanel) {
                setTimeout(() => {
                    if (loadSettings().enableRightClickPanel && !isRightClickMonitorRunning) {
                        startRightClickMonitor();
                    }
                }, 10000); // 10秒重启间隔，避免频繁重启
            }
        });
        
        rightClickMonitor.on('error', () => {
            isRightClickMonitorRunning = false;
        });
        
    } catch (error) {
        isRightClickMonitorRunning = false;
    }
}

// 停止右键长按监听器
function stopRightClickMonitor() {
    if (rightClickMonitor) {
        console.log('停止右键长按监听器');
        try {
            if (typeof rightClickMonitor.kill === 'function') {
                rightClickMonitor.kill();
            }
            rightClickMonitor = null;
        } catch (error) {
            console.error('停止监听器时出错:', error);
        }
    }
    isRightClickMonitorRunning = false;
}

// 创建超级面板窗口
function createSuperPanelWindow() {
    if (superPanelWindow && !superPanelWindow.isDestroyed()) {
        return superPanelWindow;
    }

    superPanelWindow = new BrowserWindow({
        width: 450,
        height: 350,
        frame: false,
        show: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        transparent: true,
        icon: getIconPath(),
        focusable: true, // 确保窗口可以获得焦点
        acceptFirstMouse: true, // 即使窗口未被激活也接受第一次鼠标点击
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false
        }
    });

    // 启用remote模块
    remoteMain.enable(superPanelWindow.webContents);

    // 加载超级面板页面
    const superPanelPath = getResourcePath('super-panel.html');
    console.log('尝试加载超级面板:', superPanelPath);
    
    if (fs.existsSync(superPanelPath)) {
        console.log('✅ 从资源路径加载超级面板');
        superPanelWindow.loadFile(superPanelPath);
    } else {
        // 备用方案：从根目录加载
        const rootPath = path.join(__dirname, 'super-panel.html');
        console.log('尝试从根目录加载:', rootPath);
        
        if (fs.existsSync(rootPath)) {
            console.log('✅ 从根目录加载超级面板');
            superPanelWindow.loadFile(rootPath);
        } else {
            console.error('❌ 无法找到超级面板HTML文件');
            return null;
        }
    }

    // 失去焦点时隐藏窗口。'blur' 是主要方式，响应迅速。
    superPanelWindow.on('blur', () => {
        if (isSuperPanelGracePeriod) {
            return; // 宽限期内不隐藏
        }
        
        if (superPanelWindow && !superPanelWindow.isDestroyed() && superPanelWindow.isVisible()) {
            // 检查是否有输入框处于活动状态
            if (hasActiveInput) {
                console.log('检测到活动输入框，跳过blur隐藏');
                return; // 有活动输入框时不隐藏
            }
            
            console.log('超级面板失去焦点（blur事件），自动隐藏');
            superPanelWindow.hide();
        }
    });
    
    // 为应对 'blur' 事件在某些情况下可能不触发的问题，增加一个基于轮询的失焦检测作为备用方案。
    let focusCheckInterval = null;

    superPanelWindow.on('show', () => {
        // 窗口显示时，启动轮询检查。
        if (focusCheckInterval) {
            clearInterval(focusCheckInterval);
        }
        focusCheckInterval = setInterval(() => {
            if (isSuperPanelGracePeriod) {
                return; // 宽限期内不检查
            }
            
            // 检查是否有输入框处于活动状态
            if (hasActiveInput) {
                console.log('检测到活动输入框，跳过失焦检查');
                return; // 有活动输入框时不执行失焦检查
            }
            
            if (superPanelWindow && !superPanelWindow.isDestroyed() && superPanelWindow.isVisible() && !superPanelWindow.isFocused()) {
                console.log('超级面板失去焦点（轮询检测），自动隐藏');
                superPanelWindow.hide(); // hide() 会触发 'hide' 事件, 从而清除计时器。
            }
        }, 300); // 增加间隔到300毫秒
    });

    superPanelWindow.on('hide', () => {
        // 窗口隐藏时，停止轮询以节省资源。
        if (focusCheckInterval) {
            clearInterval(focusCheckInterval);
            focusCheckInterval = null;
        }
        
        // 重置输入框活动状态
        hasActiveInput = false;
        console.log('🔍 面板隐藏，重置输入框状态');
    });

    // 监听窗口关闭
    superPanelWindow.on('closed', () => {
        superPanelWindow = null;
    });

    return superPanelWindow;
}

// 显示超级面板
function showSuperPanel() {
    try {
        // 记录当前活动窗口句柄，用于后续恢复焦点
        recordActiveWindow();
    } catch (error) {
        console.error('记录活动窗口失败:', error);
    }
    
    if (!superPanelWindow || superPanelWindow.isDestroyed()) {
        createSuperPanelWindow();
    }

    if (!superPanelWindow) {
        console.error('❌ 无法创建超级面板窗口');
        return;
    }

    try {
        // 获取鼠标位置并在鼠标附近显示
        const { screen } = require('electron');
        const cursorPoint = screen.getCursorScreenPoint();
        const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
        
        const windowWidth = 450;
        const windowHeight = 350;
        
        // 计算窗口位置，在鼠标右侧显示
        let x = cursorPoint.x + 20;
        let y = cursorPoint.y - windowHeight / 2;
        
        // 边界检查，确保窗口在屏幕内
        if (x + windowWidth > currentDisplay.workArea.x + currentDisplay.workArea.width) {
            x = cursorPoint.x - windowWidth - 20; // 显示在鼠标左侧
        }
        if (x < currentDisplay.workArea.x) {
            x = currentDisplay.workArea.x + 10;
        }
        if (y < currentDisplay.workArea.y) {
            y = currentDisplay.workArea.y + 10;
        }
        if (y + windowHeight > currentDisplay.workArea.y + currentDisplay.workArea.height) {
            y = currentDisplay.workArea.y + currentDisplay.workArea.height - windowHeight - 10;
        }

        superPanelWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });

        isSuperPanelGracePeriod = true;
        superPanelWindow.show();
        
        // 首先等待窗口显示完成
        setTimeout(() => {
            // 然后再尝试获取焦点
            superPanelWindow.focus();
            superPanelWindow.webContents.focus();
            
            console.log('✅ 超级面板已显示');
            
            // 再等待足够长时间才关闭宽限期
            setTimeout(() => {
                isSuperPanelGracePeriod = false;
            }, 800); // 进一步延长宽限期
        }, 100); // 短暂等待窗口显示
        
    } catch (error) {
        console.error('设置超级面板位置失败:', error);
        
        // 出错时回退到默认位置
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        
        const windowWidth = 450;
        const windowHeight = 350;
        const x = Math.round((width - windowWidth) / 2);
        const y = Math.round((height - windowHeight) / 3);

        superPanelWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
        superPanelWindow.show();
        superPanelWindow.focus();
    }
}

// 创建搜索浮窗
function createSearchWindow() {
    if (searchWindow && !searchWindow.isDestroyed()) {
        return searchWindow;
    }

    searchWindow = new BrowserWindow({
        width: 600,
        height: 400,
        frame: false,
        show: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        icon: getIconPath(), // 添加图标
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false
        }
    });

    // 启用remote模块
    remoteMain.enable(searchWindow.webContents);

    // 加载搜索窗口页面 - 修复打包后的路径问题
    const searchWindowPath = getResourcePath('search-window.html');
    console.log('尝试加载搜索窗口:', searchWindowPath);
    
    if (fs.existsSync(searchWindowPath)) {
        console.log('✅ 从资源路径加载搜索窗口');
        searchWindow.loadFile(searchWindowPath);
    } else {
        // 备用方案1：尝试从应用根目录加载
        const rootPath = path.join(__dirname, 'search-window.html');
        console.log('尝试从根目录加载:', rootPath);
        
        if (fs.existsSync(rootPath)) {
            console.log('✅ 从根目录加载搜索窗口');
            searchWindow.loadFile(rootPath);
        } else {
            // 备用方案2：如果是打包后的应用，尝试从asar包外部加载
            const asarPath = app.isPackaged 
                ? path.join(path.dirname(process.execPath), 'search-window.html')
                : './search-window.html';
            console.log('尝试从ASAR外部加载:', asarPath);
            
            if (fs.existsSync(asarPath)) {
                console.log('✅ 从ASAR外部加载搜索窗口');
                searchWindow.loadFile(asarPath);
            } else {
                console.error('❌ 无法找到搜索窗口HTML文件');
                // 创建一个简单的内联搜索窗口
                searchWindow.loadURL(`data:text/html;charset=utf-8,
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>搜索</title>
                        <style>
                            body { font-family: 'Microsoft YaHei', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                            .search-box { width: 100%; padding: 10px; font-size: 16px; border: 1px solid #ddd; border-radius: 4px; }
                            .notice { margin-top: 20px; color: #666; text-align: center; }
                        </style>
                    </head>
                    <body>
                        <input type="text" class="search-box" placeholder="搜索功能暂时不可用，请重新安装应用" disabled>
                        <div class="notice">搜索窗口文件缺失，请联系技术支持</div>
                    </body>
                    </html>
                `);
            }
        }
    }

    // 失去焦点时隐藏窗口（除非被钉住）
    searchWindow.on('blur', () => {
        if (searchWindow && !searchWindow.isDestroyed() && !isPinned) {
            console.log('搜索窗口失去焦点，自动隐藏');
            searchWindow.hide();
        }
    });

    // 监听窗口关闭
    searchWindow.on('closed', () => {
        searchWindow = null;
        isPinned = false; // 重置钉住状态
    });

    return searchWindow;
}

// 显示搜索窗口
function showSearchWindow() {
    try {
        // 记录当前活动窗口句柄，用于后续恢复焦点
        recordActiveWindow();
    } catch (error) {
        console.error('记录活动窗口失败:', error);
    }
    
    if (!searchWindow || searchWindow.isDestroyed()) {
        createSearchWindow();
    }

    if (!searchWindow) {
        console.error('❌ 无法创建搜索窗口');
        return;
    }

    try {
        // 获取鼠标位置并在鼠标附近显示
        const { screen } = require('electron');
        const cursorPoint = screen.getCursorScreenPoint();
        const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
        
        const windowWidth = 600;
        const windowHeight = 400;
        
        // 计算窗口位置，在鼠标右侧显示
        let x = cursorPoint.x + 20;
        let y = cursorPoint.y - windowHeight / 2;
        
        // 边界检查，确保窗口在屏幕内
        if (x + windowWidth > currentDisplay.workArea.x + currentDisplay.workArea.width) {
            x = cursorPoint.x - windowWidth - 20; // 显示在鼠标左侧
        }
        if (x < currentDisplay.workArea.x) {
            x = currentDisplay.workArea.x + 10;
        }
        if (y < currentDisplay.workArea.y) {
            y = currentDisplay.workArea.y + 10;
        }
        if (y + windowHeight > currentDisplay.workArea.y + currentDisplay.workArea.height) {
            y = currentDisplay.workArea.y + currentDisplay.workArea.height - windowHeight - 10;
        }

        searchWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
        searchWindow.show();
        searchWindow.focus();
        
        console.log('✅ 搜索窗口已显示');
        
    } catch (error) {
        console.error('设置搜索窗口位置失败:', error);
        
        // 出错时回退到默认位置
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        
        const windowWidth = 600;
        const windowHeight = 400;
        const x = Math.round((width - windowWidth) / 2);
        const y = Math.round((height - windowHeight) / 3);

        searchWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
        searchWindow.show();
        searchWindow.focus();
    }
}