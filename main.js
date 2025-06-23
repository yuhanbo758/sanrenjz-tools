const { app, BrowserWindow, ipcMain, globalShortcut, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 初始化remote模块 - 需要在app ready之后
const remoteMain = require('@electron/remote/main');
// 移除这里的初始化，将在app ready事件中初始化

// 导入插件管理器
const PluginManager = require(app.isPackaged 
  ? path.join(process.resourcesPath, 'app', 'software_manager.js')
  : './app/software_manager.js');

let mainWindow;
let searchWindow;
let superPanelWindow; // 超级面板窗口
let isSuperPanelGracePeriod = false; // 超级面板显示宽限期
let hasActiveInput = false; // 跟踪是否有活动输入框
let pluginManager;
let isPinned = false; // 添加钉住状态
const pluginPinnedMap = new Map();
let lastActiveWindow = null; // 记录最后活动的窗口句柄

// 右键长按相关变量
let rightClickMonitor = null;
let isRightClickMonitorRunning = false;

// 设置文件路径
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// 默认设置
const defaultSettings = {
    globalHotkey: 'Ctrl+Space',
    autoStart: false,
    pinHotkey: 'Ctrl+D', // 钉住快捷键
    enableRightClickPanel: true, // 启用右键长按面板
    rightClickDelay: 500, // 右键长按延迟时间（毫秒）
    customPluginDataPath: null // 自定义插件数据存储路径
};

// 读取设置
function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            return { ...defaultSettings, ...JSON.parse(data) };
        }
    } catch (error) {
        console.error('读取设置失败:', error);
    }
    return defaultSettings;
}

// 保存设置
function saveSettings(settings) {
    try {
        const currentSettings = loadSettings();
        const newSettings = { ...currentSettings, ...settings };
        fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
        return newSettings;
    } catch (error) {
        console.error('保存设置失败:', error);
        throw error;
    }
}

// 获取文本片段
async function getTextSnippets(pluginPath) {
    try {
        console.log('=== 开始获取余汉波文本片段 ===');
        console.log('插件路径:', pluginPath);
        
        // 从插件管理器的持久化存储中读取设置
        let actualPaths = [];
        let settingsFound = false;
        
        try {
            if (pluginManager) {
                // 从插件的持久化存储中获取设置
                const settings = pluginManager.getPluginStorageItem('余汉波文本片段助手', 'snippets-settings');
                console.log('从存储中获取到设置:', settings);
                
                if (settings) {
                    // 支持新版多路径和旧版单一路径
                    if (Array.isArray(settings.snippetsPaths) && settings.snippetsPaths.length > 0) {
                        actualPaths = settings.snippetsPaths.filter(p => p && fs.existsSync(p));
                        console.log('使用新版多路径设置:', actualPaths);
                        settingsFound = actualPaths.length > 0;
                    } else if (settings.snippetsPath && fs.existsSync(settings.snippetsPath)) {
                        actualPaths = [settings.snippetsPath];
                        console.log('使用旧版单一路径设置:', actualPaths);
                        settingsFound = true;
                    }
                }
            }
        } catch (error) {
            console.error('从存储中读取设置失败:', error);
        }
        
        // 如果没有找到插件的设置，显示提示信息
        if (!settingsFound) {
            console.log('❌ 未找到插件的设置或路径无效');
            console.log('💡 请在余汉波文本片段助手插件中设置文件夹路径');
            console.log('   打开插件 → 点击设置 → 添加文本片段文件夹路径');
            return [];
        }
        
        console.log('✅ 最终使用的文本片段路径:', actualPaths);
        
        const allSnippets = [];
        
        // 扫描每个路径中的.md文件
        for (const folderPath of actualPaths) {
            console.log(`开始扫描文件夹: ${folderPath}`);
            
            try {
                // 递归扫描函数
                function scanDirectory(dir, maxDepth = 2, currentDepth = 0) {
                    if (!fs.existsSync(dir) || currentDepth >= maxDepth) return;
                    
                    const items = fs.readdirSync(dir);
                    console.log(`文件夹 ${dir} 中的项目:`, items.slice(0, 10)); // 只显示前10个
                    
                    for (const item of items) {
                        const fullPath = path.join(dir, item);
                        try {
                            const stat = fs.statSync(fullPath);
                            
                            if (stat.isFile() && path.extname(item).toLowerCase() === '.md') {
                                try {
                                    const content = fs.readFileSync(fullPath, 'utf8');
                                    const fileName = path.basename(item, '.md');
                                    
                                    console.log(`✅ 读取MD文件: ${fileName}, 内容长度: ${content.length}`);
                                    
                                    // 生成预览文本（去掉Markdown语法）
                                    let preview = content
                                        .replace(/^#+\s*/gm, '') // 去掉标题标记
                                        .replace(/\*\*(.*?)\*\*/g, '$1') // 去掉加粗标记
                                        .replace(/\*(.*?)\*/g, '$1') // 去掉斜体标记
                                        .replace(/`(.*?)`/g, '$1') // 去掉代码标记
                                        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 去掉链接标记，保留文本
                                        .replace(/\n+/g, ' ') // 将换行符替换为空格
                                        .trim();
                                    
                                    // 截取预览长度
                                    if (preview.length > 150) {
                                        preview = preview.substring(0, 150) + '...';
                                    }
                                    
                                    allSnippets.push({
                                        title: fileName,
                                        content: content,
                                        preview: preview || `${fileName} - Markdown文档`,
                                        path: fullPath,
                                        type: 'text-snippet' // 明确标记类型
                                    });
                                } catch (error) {
                                    console.error(`❌ 读取文件 ${fullPath} 失败:`, error);
                                }
                            } else if (stat.isDirectory() && currentDepth < maxDepth - 1) {
                                // 递归搜索子目录，但限制深度
                                scanDirectory(fullPath, maxDepth, currentDepth + 1);
                            }
                        } catch (error) {
                            console.error(`❌ 处理项目 ${fullPath} 失败:`, error);
                        }
                    }
                }
                
                scanDirectory(folderPath);
            } catch (error) {
                console.error(`扫描文件夹 ${folderPath} 失败:`, error);
            }
        }
        
        console.log(`🎉 最终找到 ${allSnippets.length} 个文本片段`);
        
        // 按文件名排序
        allSnippets.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
        
        console.log('=== 文本片段获取完成 ===');
        
        return allSnippets;
    } catch (error) {
        console.error('获取文本片段失败:', error);
        return [];
    }
}

// 注册全局快捷键
function registerGlobalShortcut(hotkey = 'Ctrl+Space') {
    try {
        // 先注销现有的全局快捷键，但不要注销所有
        globalShortcut.unregister(hotkey);
        
        // 注册全局快捷键
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

    try {
        // 获取鼠标位置并尝试跟随显示
        const { screen } = require('electron');
        const cursorPoint = screen.getCursorScreenPoint();
        const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
        
        const windowWidth = 600;
        const windowHeight = 400;
        
        // 计算窗口位置，在鼠标上方显示
        let x = cursorPoint.x - windowWidth / 2;
        let y = cursorPoint.y - 200; // 在鼠标上方200像素
        
        // 边界检查，确保窗口在屏幕内
        if (x < currentDisplay.workArea.x) {
            x = currentDisplay.workArea.x + 10;
        }
        if (x + windowWidth > currentDisplay.workArea.x + currentDisplay.workArea.width) {
            x = currentDisplay.workArea.x + currentDisplay.workArea.width - windowWidth - 10;
        }
        if (y < currentDisplay.workArea.y) {
            y = currentDisplay.workArea.y + 10;
        }
        if (y + windowHeight > currentDisplay.workArea.y + currentDisplay.workArea.height) {
            y = currentDisplay.workArea.y + currentDisplay.workArea.height - windowHeight - 10;
        }

        searchWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
    } catch (error) {
        console.error('设置浮窗位置失败，使用默认位置:', error);
        
        // 出错时回退到默认位置
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        
        const windowWidth = 600;
        const windowHeight = 400;
        const x = Math.round((width - windowWidth) / 2);
        const y = Math.round((height - windowHeight) / 3);

        searchWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
    }
    
    searchWindow.show();
    searchWindow.focus();
}

// 记录当前活动窗口 (同步)
function recordActiveWindow() {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const execSync = require('child_process').execSync;
    const tempDir = os.tmpdir();
    const scriptPath = path.join(tempDir, `get_active_window_${Date.now()}.ps1`);

    const psScriptContentArr = [
        '$ErrorActionPreference = "Stop"',
        'try {',
        '    $proc = Get-Process | ',
        '        Where-Object { $_.MainWindowTitle -ne "" -and $_.MainWindowHandle -ne 0 -and $_.ProcessName -ne "ApplicationFrameHost" -and $_.ProcessName -ne "SearchHost" } | ',
        '        Sort-Object StartTime -Descending | ',
        '        Select-Object -First 1;',
        '',
        '    if ($proc) {',
        '        Write-Output "$($proc.MainWindowHandle)|$($proc.MainWindowTitle)"',
        '    } else {',
        '        Write-Output "0||"',
        '    }',
        '} catch {',
        '    Write-Output "0||PS_SCRIPT_ERROR: $($_.Exception.Message)"',
        '}'
    ];
    const psScriptContent = psScriptContentArr.join('\n');

    try {
        console.log('记录当前活动窗口 (同步, 使用临时 .ps1 文件)');
        fs.writeFileSync(scriptPath, psScriptContent, { encoding: 'utf8' });
        
        const commandToRun = `powershell -ExecutionPolicy Bypass -NonInteractive -NoProfile -File "${scriptPath}"`;
        console.log('Executing PowerShell script for recordActiveWindow:', commandToRun);
        
        const output = execSync(commandToRun, { windowsHide: true, timeout: 3000, encoding: 'utf8' }).toString().trim();
        
        if (output && output !== '0||' && !output.startsWith("0||PS_SCRIPT_ERROR")) {
            const parts = output.split('|');
            if (parts.length === 2) {
                const [handle, title] = parts;
                if (handle && title && /^[1-9][0-9]*$/.test(handle)) {
                    lastActiveWindow = { handle, title, timestamp: Date.now(), fallback: false };
                    console.log('记录活动窗口成功:', { title, handle });
                } else {
                    console.log('解析到的句柄或标题无效 (handle, title):', handle, title, 'Output was:', output);
                    lastActiveWindow = { handle: null, title: 'Unknown', timestamp: Date.now(), fallback: true };
                }
            } else {
                console.log('解析活动窗口信息失败 (output did not split into 2 parts): ', output);
                lastActiveWindow = { handle: null, title: 'Unknown', timestamp: Date.now(), fallback: true };
            }
        } else {
            console.log('未获取到有效的活动窗口信息或脚本执行出错 (output): ', output);
            lastActiveWindow = { handle: null, title: 'Unknown', timestamp: Date.now(), fallback: true };
        }
    } catch (error) {
        console.error('记录活动窗口异常 (execSync for .ps1):', error.message);
        if (error.stderr) {
            console.error('记录活动窗口 stderr:', error.stderr.toString());
        }
        if (error.stdout) {
            console.error('记录活动窗口 stdout (on execSync error):', error.stdout.toString());
        }
        lastActiveWindow = { handle: null, title: 'Unknown', timestamp: Date.now(), fallback: true };
    } finally {
        try {
            if (fs.existsSync(scriptPath)) {
                fs.unlinkSync(scriptPath);
            }
        } catch (cleanupError) {
            console.error('清理临时PS脚本失败 (recordActiveWindow):', cleanupError.message);
        }
    }
}







// 创建主窗口
function createWindow() {
    try {
        // 调整为原来大小的三分之二
        mainWindow = new BrowserWindow({
            width: 1000,  // 原来是1200
            height: 680, // 原来是800
            title: '三人聚智工具',
            icon: getIconPath(), // 修改为使用新的图标路径函数
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true,
                webSecurity: false
            }
        });

        // 启用remote模块
        remoteMain.enable(mainWindow.webContents);

        // 移除菜单栏 - 多平台兼容
        if (process.platform === 'darwin') {
            // macOS系统需要设置应用级别的空菜单
            Menu.setApplicationMenu(null);
        } else {
            // Windows和Linux直接移除窗口菜单
            mainWindow.setMenu(null);
        }

        // 加载主页面
        mainWindow.loadFile('index.html');

        // 初始化插件管理器
        pluginManager = new PluginManager(mainWindow);

        // 监听窗口关闭事件
        mainWindow.on('closed', () => {
            mainWindow = null;
            if (pluginManager) {
                pluginManager.stopAllPlugins();
            }
        });

        // 开发环境下打开开发者工具
        if (!app.isPackaged) {
            mainWindow.webContents.openDevTools();
        }

        // 添加系统托盘功能
        createTray();

        console.log('主窗口创建成功');

    } catch (error) {
        console.error('创建主窗口失败:', error);
        throw error;
    }
}

// 系统托盘相关
let tray = null;

// 创建系统托盘
function createTray() {
    try {
        // 创建托盘图标 - 修改为使用新的图标路径
        const iconPath = getIconPath();
        console.log('托盘图标路径:', iconPath);
        
        // 确保图标文件存在
        if (!iconPath || !fs.existsSync(iconPath)) {
            console.log('托盘图标文件不存在，跳过托盘创建');
            return;
        }
        
        tray = new Tray(iconPath);
        
        // 设置托盘提示
        tray.setToolTip('三人聚智工具');
        
        // 托盘菜单
        const contextMenu = Menu.buildFromTemplate([
            { 
                label: '显示主窗口', 
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                        // 确保窗口在最前面
                        mainWindow.setAlwaysOnTop(true);
                        setTimeout(() => {
                            mainWindow.setAlwaysOnTop(false);
                        }, 100);
                    }
                }
            },
            { 
                label: '搜索功能', 
                accelerator: loadSettings().globalHotkey || 'Ctrl+Space',
                click: () => {
                    showSearchWindow();
                }
            },
            { 
                label: '设置超级面板', 
                click: () => {
                    console.log('🔧 打开超级面板设置');
                    createSuperPanelManagerWindow();
                }
            },
            { type: 'separator' },
            { 
                label: '关于', 
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            { 
                label: '退出应用', 
                click: () => {
                    // 彻底退出应用
                    app.isQuiting = true;
                    app.quit();
                }
            }
        ]);
        
        // 设置托盘上下文菜单
        tray.setContextMenu(contextMenu);
        
        // 双击托盘图标显示主窗口（Windows 和 Linux）
        tray.on('double-click', () => {
            console.log('托盘图标被双击');
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.focus();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                    // 确保窗口在最前面
                    mainWindow.setAlwaysOnTop(true);
                    setTimeout(() => {
                        mainWindow.setAlwaysOnTop(false);
                    }, 100);
                }
            }
        });
        
        // 单击托盘图标的处理（主要针对 macOS）
        tray.on('click', () => {
            console.log('托盘图标被单击');
            if (process.platform === 'darwin') {
                // macOS 下单击显示/隐藏窗口
                if (mainWindow) {
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            } else {
                // Windows 和 Linux 下单击切换显示/隐藏窗口
                if (mainWindow) {
                    if (mainWindow.isVisible()) {
                        console.log('主窗口可见，隐藏到托盘');
                        mainWindow.hide();
                    } else {
                        console.log('主窗口隐藏，显示并获得焦点');
                        mainWindow.show();
                        mainWindow.focus();
                        mainWindow.setAlwaysOnTop(true);
                        setTimeout(() => {
                            mainWindow.setAlwaysOnTop(false);
                        }, 100);
                    }
                }
            }
        });
        
        console.log('系统托盘创建成功');
    } catch (error) {
        console.error('创建系统托盘失败:', error);
        console.log('应用将继续运行，但没有系统托盘功能');
    }
}

// IPC 处理程序

// 获取插件列表
ipcMain.handle('get-plugin-list', async () => {
    if (pluginManager) {
        return await pluginManager.getPluginList();
    }
    return [];
});

// 运行插件
ipcMain.handle('run-plugin', async (event, pluginPath, features) => {
    try {
        if (pluginManager && mainWindow && !mainWindow.isDestroyed()) {
            await pluginManager.runPlugin(pluginPath, features);
            
            // 插件运行后，自动注册其超级面板功能
            try {
                const pluginConfigPath = path.join(pluginPath, 'plugin.json');
                if (fs.existsSync(pluginConfigPath)) {
                    const pluginConfig = JSON.parse(fs.readFileSync(pluginConfigPath, 'utf8'));
                    if (pluginConfig && pluginConfig.pluginName) {
                        autoRegisterPluginSuperPanelActions(pluginConfig.pluginName, pluginConfig, pluginPath);
                    }
                }
            } catch (regError) {
                console.error('自动注册插件超级面板功能失败:', regError);
            }
        } else {
            console.log('插件管理器或主窗口不可用，跳过插件执行');
        }
    } catch (error) {
        console.error('运行插件失败:', error);
        // 不要重新抛出错误，已经在pluginManager中处理了
    }
});

// 停止插件
ipcMain.handle('stop-plugin', async (event, pluginName) => {
    try {
        if (pluginManager) {
            pluginManager.stopPlugin(pluginName);
        }
    } catch (error) {
        console.error('停止插件失败:', error);
    }
});

// 重新加载插件（用于开发调试）
ipcMain.handle('reload-plugin', async (event, pluginPath) => {
    try {
        if (pluginManager) {
            return await pluginManager.reloadPlugin(pluginPath);
        }
        return null;
    } catch (error) {
        console.error('重新加载插件失败:', error);
        throw error;
    }
});

// 关闭插件窗口
ipcMain.handle('close-plugin-window', (event, pluginName) => {
    try {
        if (pluginManager) {
            pluginManager.stopPlugin(pluginName);
        }
    } catch (error) {
        console.error('关闭插件窗口失败:', error);
    }
});

// 获取插件内容（如文本片段）
ipcMain.handle('get-plugin-contents', async (event, pluginPath) => {
    try {
        const pluginJsonPath = path.join(pluginPath, 'plugin.json');
        
        if (!fs.existsSync(pluginJsonPath)) {
            console.log('插件配置文件不存在:', pluginJsonPath);
            return [];
        }

        const pluginConfig = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
        const allContents = [];
        
        console.log(`正在处理插件: ${pluginConfig.pluginName}`);
        
        // 1. 添加插件的cmds作为可搜索内容
        if (pluginConfig.features && Array.isArray(pluginConfig.features)) {
            pluginConfig.features.forEach(feature => {
                if (feature.cmds && Array.isArray(feature.cmds)) {
                    console.log(`添加命令: ${feature.cmds.join(', ')}`);
                    feature.cmds.forEach(cmd => {
                        allContents.push({
                            title: String(cmd),
                            content: String(feature.explain || '插件功能'),
                            preview: String(feature.explain || '插件功能') + ' - 点击回车打开插件',
                            type: 'command',
                            featureCode: String(feature.code || ''),
                            command: String(cmd)
                        });
                    });
                }
            });
        }
        
        // 2. 根据插件类型加载具体的内容
        if (pluginConfig.pluginName === '余汉波文本片段助手') {
            console.log('开始加载余汉波文本片段助手的内容...');
            try {
                const textSnippets = await getTextSnippets(pluginPath);
                console.log(`文本片段助手返回了 ${textSnippets.length} 个片段`);
                
                // 为文本片段添加类型标识，确保所有字段都是可序列化的
                textSnippets.forEach(snippet => {
                    console.log(`添加文本片段: ${snippet.title}`);
                    allContents.push({
                        title: String(snippet.title || ''),
                        content: String(snippet.content || ''),
                        preview: String(snippet.preview || ''),
                        type: 'text-snippet',
                        path: String(snippet.path || '')
                    });
                });
            } catch (error) {
                console.error('加载文本片段失败:', error);
            }
        }
        
        console.log(`插件 ${pluginConfig.pluginName} 共加载 ${allContents.length} 个可搜索项`);
        
        return allContents;
    } catch (error) {
        console.error('获取插件内容失败:', error);
        return [];
    }
});

// 插入内容（文本片段等）
ipcMain.handle('insert-content', async (event, content) => {
    try {
        console.log('准备复制内容:', content.title, '类型:', content.contentType || content.type);
        
        // 只处理文本片段类型的内容
        if (content.contentType !== 'text-snippet' && content.type !== 'text-snippet') {
            console.log('非文本片段类型，跳过复制操作');
            return { success: false, message: '不支持的内容类型' };
        }
        
        const { clipboard } = require('electron');
        
        // 复制内容到剪贴板
        clipboard.writeText(content.content);
        console.log('文本片段已复制到剪贴板:', content.title);
        
        // 隐藏搜索窗口
        if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
            searchWindow.hide();
            console.log('搜索窗口已隐藏');
        }
        
        // 显示复制成功通知
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
            new Notification({
                title: '复制成功',
                body: `"${content.title}" 已复制到剪贴板`,
                silent: true
            }).show();
        }
        
        return { success: true, message: '文本片段已复制到剪贴板' };
    } catch (error) {
        console.error('复制内容失败:', error);
        return { success: false, error: error.message };
    }
});

// 带重试机制的粘贴函数


// 辅助函数：显示粘贴提示
function showPasteNotification(content) {
    setTimeout(() => {
        try {
            if (searchWindow && !searchWindow.isDestroyed()) {
                searchWindow.webContents.executeJavaScript(`
                    if (typeof showNotification === 'function') {
                        showNotification('${content.title.replace(/'/g, "\\'")} 已复制，请按 Ctrl+V 粘贴', 'info');
                    }
                `).catch(err => {
                    console.log('通知显示失败:', err.message);
                });
            }
        } catch (notifError) {
            console.log('通知系统错误:', notifError.message);
        }
    }, 50); // 减少通知延迟
}

// 获取设置
ipcMain.handle('get-settings', () => {
    return loadSettings();
});

// 保存设置
ipcMain.handle('save-settings', (event, settings) => {
    try {
        const currentSettings = loadSettings();
        const savedSettings = saveSettings(settings);
        
        // 如果全局快捷键发生变化，重新注册
        if (settings.globalHotkey && settings.globalHotkey !== currentSettings.globalHotkey) {
            console.log('重新注册全局快捷键:', settings.globalHotkey);
            registerGlobalShortcut(settings.globalHotkey);
        }
        
        // 如果钉住快捷键发生变化，重新注册
        if (settings.pinHotkey && settings.pinHotkey !== currentSettings.pinHotkey) {
            console.log('重新注册钉住快捷键:', settings.pinHotkey);
            registerPinShortcut(settings.pinHotkey);
        }
        
        // 如果右键设置发生变化，重新启动监听器
        if (process.platform === 'win32' && 
            (settings.enableRightClickPanel !== currentSettings.enableRightClickPanel ||
             settings.rightClickDelay !== currentSettings.rightClickDelay)) {
            console.log('右键设置已更改，重新启动监听器');
            stopRightClickMonitor();
            if (settings.enableRightClickPanel) {
                setTimeout(() => {
                    startRightClickMonitor();
                }, 1000);
            }
        }
        
        // 处理开机自启动
        if (typeof settings.autoStart === 'boolean') {
            app.setLoginItemSettings({
                openAtLogin: settings.autoStart,
                path: process.execPath
            });
        }
        
        return savedSettings;
    } catch (error) {
        console.error('保存设置失败:', error);
        throw error;
    }
});

// 隐藏搜索窗口
ipcMain.handle('hide-search-window', async (event, options = {}) => {
    if (searchWindow && !searchWindow.isDestroyed()) {
        searchWindow.hide();
        
        // 只有在需要恢复焦点时才执行焦点恢复逻辑
        if (options.restoreFocus !== false) {
            try {
                console.log('搜索窗口被隐藏，开始恢复焦点');
                
                // Using a slightly longer delay here as well
                setTimeout(async () => {
                    try {
                        console.log('窗口已隐藏，无需焦点恢复');
                        
                    } catch (error) {
                        console.error('隐藏后焦点恢复失败:', error.message, error.stack);
                    }
                }, 80); // Consistent delay
                
            } catch (error) {
                console.error('搜索窗口隐藏后处理失败:', error);
            }
        } else {
            console.log('搜索窗口被隐藏，跳过焦点恢复');
        }
    }
});

// 切换钉住状态
ipcMain.handle('toggle-pin', () => {
    return togglePin();
});

// 获取钉住状态
ipcMain.handle('get-pin-status', () => {
    return isPinned;
});

// 显示文件选择对话框（同步）
ipcMain.on('show-open-dialog', (event, options) => {
    try {
        console.log('主进程收到文件选择请求:', options);
        
        const result = dialog.showOpenDialogSync(mainWindow, options);
        console.log('文件选择结果:', result);
        
        event.returnValue = result || null;
    } catch (error) {
        console.error('主进程文件选择错误:', error);
        event.returnValue = null;
    }
});

// 显示保存文件对话框（同步）
ipcMain.on('show-save-dialog', (event, options) => {
    try {
        console.log('主进程收到保存文件选择请求:', options);
        
        const result = dialog.showSaveDialogSync(mainWindow, options);
        console.log('保存文件选择结果:', result);
        
        event.returnValue = result || null;
    } catch (error) {
        console.error('主进程保存文件选择错误:', error);
        event.returnValue = null;
    }
});

// 添加 IPC 处理：切换插件窗口钉住状态
ipcMain.handle('toggle-plugin-pin-window', (event, pluginName) => {
    if (pluginManager) {
        return pluginManager.togglePluginPin(pluginName);
    }
    return false;
});

// 添加 IPC 处理：获取插件窗口钉住状态
ipcMain.handle('get-plugin-pin-status-window', (event, pluginName) => {
    if (pluginManager) {
        return pluginManager.getPluginPinStatus(pluginName);
    }
    return false;
});

// 添加 IPC 处理：最小化插件窗口
ipcMain.handle('minimize-plugin-window', (event, pluginName) => {
    if (pluginManager) {
        return pluginManager.minimizePlugin(pluginName);
    }
    return false;
});

// 添加 IPC 处理：最大化/还原插件窗口
ipcMain.handle('maximize-plugin-window', (event, pluginName) => {
    if (pluginManager) {
        return pluginManager.maximizePlugin(pluginName);
    }
    return false;
});

// 添加 IPC 处理：恢复焦点到原窗口
ipcMain.handle('restore-previous-focus', async (event) => {
    console.log('收到恢复焦点请求');
    try {
        console.log('焦点恢复功能已移除');
        return { success: true };
    } catch (error) {
        console.error('恢复焦点失败:', error);
        return { success: false, error: error.message };
    }
});

// 添加 IPC 处理：获取右键监听器状态
ipcMain.handle('get-right-click-monitor-status', () => {
    return {
        isRunning: isRightClickMonitorRunning,
        isSupported: process.platform === 'win32'
    };
});

// 添加 IPC 处理：切换右键监听器
ipcMain.handle('toggle-right-click-monitor', (event, enabled) => {
    if (process.platform !== 'win32') {
        return { success: false, error: '仅支持 Windows 系统' };
    }
    
    try {
        if (enabled) {
            startRightClickMonitor();
        } else {
            stopRightClickMonitor();
        }
        return { success: true, isRunning: isRightClickMonitorRunning };
    } catch (error) {
        console.error('切换右键监听器失败:', error);
        return { success: false, error: error.message };
    }
});

// 添加 IPC 处理：手动测试右键功能
ipcMain.handle('test-right-click-function', () => {
    try {
        console.log('🧪 手动测试右键功能');
        showSuperPanel();
        return { success: true, message: '超级面板已显示' };
    } catch (error) {
        console.error('测试右键功能失败:', error);
        return { success: false, error: error.message };
    }
});

// 添加 IPC 处理：获取选中的文本
ipcMain.handle('get-selected-text', async () => {
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const { execSync } = require('child_process');
        const tempDir = os.tmpdir();
        const scriptPath = path.join(tempDir, `get_selected_text_${Date.now()}.ps1`);

        const psScript = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Windows.Forms

$selectedText = ""
try {
    $originalClip = [System.Windows.Forms.Clipboard]::GetText()
    [System.Windows.Forms.SendKeys]::SendWait("^c")
    Start-Sleep -Milliseconds 100
    $selectedText = [System.Windows.Forms.Clipboard]::GetText()
    
    if ($selectedText -eq $originalClip) {
        $selectedText = ""
    }
    
    Write-Output $selectedText
} catch {
    Write-Output ""
}`;

        fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8' });
        
        const command = `powershell -ExecutionPolicy Bypass -NonInteractive -NoProfile -File "${scriptPath}"`;
        const result = execSync(command, { 
            windowsHide: true, 
            timeout: 3000, 
            encoding: 'utf8' 
        }).toString().trim();
        
        // 清理临时文件
        try {
            if (fs.existsSync(scriptPath)) {
                fs.unlinkSync(scriptPath);
            }
        } catch (e) {
            console.error('清理PS脚本失败:', e);
        }
        
        console.log('获取到选中文本:', result);
        return result;
        
    } catch (error) {
        console.error('获取选中文本失败:', error);
        return '';
    }
});

// 已移除重复的 get-super-panel-actions 处理器

// 计算功能与选中文本的匹配度
function calculateMatchScore(selectedText, feature) {
    if (!selectedText || !feature) return 0;
    
    let score = 0;
    const text = selectedText.toLowerCase();
    
    // 检查命令关键词匹配
    if (feature.cmds) {
        feature.cmds.forEach(cmd => {
            if (text.includes(cmd.toLowerCase())) {
                score += 10;
            }
        });
    }
    
    // 检查功能说明匹配
    if (feature.explain) {
        const explain = feature.explain.toLowerCase();
        if (text.includes('图片') && explain.includes('图')) score += 8;
        if (text.includes('文本') && explain.includes('文本')) score += 8;
        if (text.includes('翻译') && explain.includes('翻译')) score += 8;
        if (text.includes('密码') && explain.includes('密码')) score += 8;
    }
    
    // 基础分数
    if (feature.superPanel) score += 5;
    if (feature.contextMenu) score += 3;
    
    return score;
}

// 通用插件图标获取函数 - 优先使用 logo.ico，否则使用 logo.png
function getPluginIconPath(pluginPath, returnDefault = true) {
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
        
        // 如果都没有，返回默认图标或undefined
        if (returnDefault) {
            const appIconPath = app.isPackaged 
                ? path.join(process.resourcesPath, 'build', 'icon.ico')
                : path.join(__dirname, 'build', 'icon.ico');
                
            if (fs.existsSync(appIconPath)) {
                console.log(`插件无自定义图标，使用主应用图标: ${appIconPath}`);
                return appIconPath;
            }
        }
        
        console.log('未找到插件图标文件');
        return undefined;
    } catch (error) {
        console.error('获取插件图标路径失败:', error);
        return undefined;
    }
}

function getPluginIcon(pluginName) {
    const iconMap = {
        '余汉波文本片段助手': '📝',
        '密码管理器': '🔐',
        '插件下载': '📦',
        '余汉波AI助手': '🤖'
    };
    
    return iconMap[pluginName] || '🔧';
}

// 添加 IPC 处理：运行插件操作
ipcMain.handle('run-plugin-action', async (event, { pluginPath, feature, selectedText }) => {
    try {
        console.log('运行插件操作:', { pluginPath, feature: feature.code, selectedText });
        
        if (pluginManager) {
            // 传递选中的文本到插件
            if (selectedText && feature.useSelectedText !== false) {
                // 可以在这里将选中文本传递给插件
                feature.selectedText = selectedText;
            }
            
            await pluginManager.runPlugin(pluginPath, [feature]);
            return { success: true };
        } else {
            throw new Error('插件管理器未初始化');
        }
        
    } catch (error) {
        console.error('运行插件操作失败:', error);
        throw error;
    }
});

// 添加 IPC 处理：执行系统命令
ipcMain.handle('execute-system-command', async (event, { command, args, selectedText }) => {
    try {
        console.log('执行系统命令:', { command, args, selectedText });
        
        const { shell } = require('electron');
        
        switch (command) {
            case 'search-web':
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
                await shell.openExternal(searchUrl);
                break;
                
            case 'open-url':
                await shell.openExternal(args.url);
                break;
                
            case 'send-email':
                const emailUrl = `mailto:${args.email}`;
                await shell.openExternal(emailUrl);
                break;
                
            case 'translate':
                const translateUrl = `https://translate.google.com/?sl=${args.from}&tl=${args.to}&text=${encodeURIComponent(args.text)}`;
                await shell.openExternal(translateUrl);
                break;
                
            case 'open-app':
                // 打开本地应用程序
                const appPath = args.app;
                if (appPath) {
                    const { spawn } = require('child_process');
                    try {
                        spawn(appPath, [], { 
                            detached: true,
                            stdio: 'ignore'
                        }).unref();
                    } catch (error) {
                        console.error('打开应用失败:', error);
                        throw new Error(`无法打开应用: ${appPath}`);
                    }
                } else {
                    throw new Error('未指定应用路径');
                }
                break;
                
            default:
                throw new Error(`未知命令: ${command}`);
        }
        
        return { success: true };
        
    } catch (error) {
        console.error('执行系统命令失败:', error);
        throw error;
    }
});

// 添加 IPC 处理：关闭超级面板
ipcMain.handle('close-super-panel', () => {
    if (superPanelWindow && !superPanelWindow.isDestroyed()) {
        superPanelWindow.hide();
        
        // 恢复焦点到原窗口
        setTimeout(async () => {
            try {
                console.log('超级面板已关闭，无需焦点恢复');
            } catch (error) {
                console.error('关闭超级面板后焦点恢复失败:', error);
            }
        }, 100);
    }
});



// ==================== 超级面板插件API ==================== //

// 超级面板功能注册表
let superPanelRegistry = new Map();

// 插件API：注册功能到超级面板
ipcMain.handle('register-super-panel-action', (event, pluginName, action) => {
    try {
        console.log(`🔌 插件 ${pluginName} 注册功能:`, action.title);
        
        if (!superPanelRegistry.has(pluginName)) {
            superPanelRegistry.set(pluginName, []);
        }
        
        const actions = superPanelRegistry.get(pluginName);
        
        // 检查是否已存在相同ID的功能
        const existingIndex = actions.findIndex(a => a.id === action.id);
        if (existingIndex >= 0) {
            actions[existingIndex] = action; // 更新现有功能
        } else {
            actions.push(action); // 添加新功能
        }
        
        superPanelRegistry.set(pluginName, actions);
        
        // 通知超级面板更新
        notifySuperPanelUpdate();
        
        return true;
    } catch (error) {
        console.error('注册超级面板功能失败:', error);
        return false;
    }
});

// 插件API：取消注册功能
ipcMain.handle('unregister-super-panel-action', (event, pluginName, actionId) => {
    try {
        console.log(`🔌 插件 ${pluginName} 取消注册功能:`, actionId);
        
        if (superPanelRegistry.has(pluginName)) {
            const actions = superPanelRegistry.get(pluginName);
            const filteredActions = actions.filter(a => a.id !== actionId);
            superPanelRegistry.set(pluginName, filteredActions);
            
            // 通知超级面板更新
            notifySuperPanelUpdate();
        }
        
        return true;
    } catch (error) {
        console.error('取消注册超级面板功能失败:', error);
        return false;
    }
});

// 插件API：清除插件的所有功能
ipcMain.handle('clear-super-panel-actions', (event, pluginName) => {
    try {
        console.log(`🔌 清除插件 ${pluginName} 的所有超级面板功能`);
        superPanelRegistry.delete(pluginName);
        
        // 通知超级面板更新
        notifySuperPanelUpdate();
        
        return true;
    } catch (error) {
        console.error('清除超级面板功能失败:', error);
        return false;
    }
});

// 获取超级面板功能（新的统一接口）
ipcMain.handle('get-super-panel-actions', async (event, selectedText) => {
    try {
        console.log('🎯 获取超级面板功能，选中文本:', selectedText);
        
        // 获取设置中保存的功能列表
        const settings = loadSettings();
        let configuredActions = settings.superPanelActions || [];
        console.log(`从设置中加载已配置功能: ${configuredActions.length}个`);
        
        // 总是重新加载功能，确保获取最新的功能列表
        let allActions = [];
        
        // 1. 获取插件注册的功能
        for (const [pluginName, actions] of superPanelRegistry) {
            console.log(`📦 加载插件功能: ${pluginName} (${actions.length}个)`);
            allActions = allActions.concat(actions.map(action => ({
                ...action,
                source: 'plugin',
                pluginName: pluginName
            })));
        }
        
        // 2. 获取持久化的自定义功能
        const customActions = await getCustomSuperPanelActions();
        allActions = allActions.concat(customActions);
        
        // 3. 获取内置功能
        const builtinActions = await getBuiltinSuperPanelActions();
        allActions = allActions.concat(builtinActions);
        
        // 4. 获取动态功能（基于选中内容）
        const dynamicActions = await getDynamicSuperPanelActions(selectedText);
        allActions = allActions.concat(dynamicActions);
        
        console.log(`🔧 总共可用功能: ${allActions.length}个`);
        
        // 如果设置中有指定的功能列表，则过滤出已配置的功能
        if (configuredActions.length > 0) {
            const configuredIds = new Set(configuredActions.map(action => action.id));
            const filteredActions = allActions.filter(action => configuredIds.has(action.id));
            console.log(`🎯 已配置功能: ${filteredActions.length}个`);
            
            // 按配置的顺序排序
            const sortedActions = configuredActions.map(configAction => {
                const foundAction = allActions.find(action => action.id === configAction.id);
                return foundAction || configAction; // 使用最新的功能定义，如果找不到就用配置的
            }).filter(action => action); // 过滤掉空值
            
            return sortedActions;
        }
        
        // 否则返回所有功能（首次使用时）
        console.log('返回所有可用功能');
        
        // 按类型和优先级排序
        allActions.sort((a, b) => {
            const priorityMap = { dynamic: 1, plugin: 2, custom: 3, builtin: 4 };
            return (priorityMap[a.type] || 5) - (priorityMap[b.type] || 5);
        });
        
        return allActions;
    } catch (error) {
        console.error('获取超级面板功能失败:', error);
        return [];
    }
});

// 通知超级面板更新
function notifySuperPanelUpdate() {
    if (superPanelWindow && !superPanelWindow.isDestroyed()) {
        superPanelWindow.webContents.send('refresh-super-panel');
    }
}

// 插件管理器接口：当插件启动时自动注册其超级面板功能
function autoRegisterPluginSuperPanelActions(pluginName, pluginConfig, pluginPath = null) {
    try {
        if (!pluginConfig || !pluginConfig.features) return;
        
        console.log(`🚀 自动注册插件 ${pluginName} 的超级面板功能`);
        
        // 如果没有提供 pluginPath，尝试推算
        if (!pluginPath && pluginManager && pluginManager.getPluginPath) {
            pluginPath = pluginManager.getPluginPath(pluginName);
        }
        
        // 如果还是没有，根据插件名称推算默认路径
        if (!pluginPath) {
            const pluginFolderName = getPluginFolderName(pluginName);
            pluginPath = path.join(__dirname, 'app', 'software', pluginFolderName);
        }
        
        console.log(`插件 ${pluginName} 的路径: ${pluginPath}`);
        
        pluginConfig.features.forEach(feature => {
            // 检查功能是否支持超级面板
            if (feature.superPanel !== false) { // 默认启用，除非明确禁用
                // 处理图标：优先使用插件目录中的logo.ico，其次使用logo.png，最后使用默认emoji
                let icon = getPluginDefaultIcon(pluginName);
                
                // 尝试查找插件目录中的图标文件
                try {
                    // 首先尝试 logo.ico
                    const icoPath = path.join(pluginPath, 'logo.ico');
                    if (fs.existsSync(icoPath)) {
                        // 读取图片文件并转换为base64
                        try {
                            const imageBuffer = fs.readFileSync(icoPath);
                            const base64Image = imageBuffer.toString('base64');
                            icon = `data:image/x-icon;base64,${base64Image}`;
                            console.log(`使用ICO图标(base64): ${icoPath}`);
                        } catch (error) {
                            console.error(`读取ICO图标失败:`, error);
                            icon = getPluginDefaultIcon(pluginName);
                        }
                    } else {
                        // 然后尝试 logo.png
                        const pngPath = path.join(pluginPath, 'logo.png');
                        if (fs.existsSync(pngPath)) {
                            // 读取图片文件并转换为base64
                            try {
                                const imageBuffer = fs.readFileSync(pngPath);
                                const base64Image = imageBuffer.toString('base64');
                                icon = `data:image/png;base64,${base64Image}`;
                                console.log(`使用PNG图标(base64): ${pngPath}`);
                            } catch (error) {
                                console.error(`读取PNG图标失败:`, error);
                                icon = getPluginDefaultIcon(pluginName);
                            }
                        } else {
                            // 如果指定了图标文件，尝试使用指定的文件
                            if (feature.icon && feature.icon.includes('.')) {
                                const customIconPath = path.join(pluginPath, feature.icon);
                                if (fs.existsSync(customIconPath)) {
                                    try {
                                        const imageBuffer = fs.readFileSync(customIconPath);
                                        const base64Image = imageBuffer.toString('base64');
                                        const ext = path.extname(customIconPath).toLowerCase();
                                        const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'image/x-icon';
                                        icon = `data:${mimeType};base64,${base64Image}`;
                                        console.log(`使用自定义图标(base64): ${customIconPath}`);
                                    } catch (error) {
                                        console.error(`读取自定义图标失败:`, error);
                                        icon = getPluginDefaultIcon(pluginName);
                                    }
                                }
                            }
                            // 如果是emoji，直接使用
                            else if (feature.icon && /^[\u{1F000}-\u{1F9FF}]|^[\u{2600}-\u{26FF}]|^[\u{2700}-\u{27BF}]/u.test(feature.icon)) {
                                icon = feature.icon;
                                console.log(`使用emoji图标: ${feature.icon}`);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`查找插件图标失败:`, error);
                }
                
                const action = {
                    id: `plugin-${pluginName}-${feature.code}`,
                    title: feature.explain || feature.code,
                    description: feature.description || `使用 ${pluginName} 的 ${feature.explain || feature.code} 功能`,
                    icon: icon,
                    type: 'plugin',
                    category: feature.category || '插件功能',
                    pluginPath: pluginPath,
                    feature: feature,
                    priority: feature.priority || 10
                };
                
                console.log(`注册功能: ${action.title} (${action.id})`);
                
                // 直接添加到注册表
                if (!superPanelRegistry.has(pluginName)) {
                    superPanelRegistry.set(pluginName, []);
                }
                
                const actions = superPanelRegistry.get(pluginName);
                const existingIndex = actions.findIndex(a => a.id === action.id);
                if (existingIndex >= 0) {
                    actions[existingIndex] = action;
                } else {
                    actions.push(action);
                }
                
                superPanelRegistry.set(pluginName, actions);
            }
        });
        
        const registeredCount = superPanelRegistry.get(pluginName)?.length || 0;
        console.log(`插件 ${pluginName} 共注册了 ${registeredCount} 个超级面板功能`);
        
        // 通知更新
        notifySuperPanelUpdate();
        
    } catch (error) {
        console.error('自动注册插件超级面板功能失败:', error);
    }
}

// 根据插件名称获取文件夹名称
function getPluginFolderName(pluginName) {
    const folderNameMap = {
        '余汉波文本片段助手': 'sanrenjz-tools-text',
        '密码管理器': 'sanrenjz-tools-password',
        '插件下载': 'sanrenjz-tools-download_plugin',
        '余汉波AI助手': 'sanrenjz.tools-ai'
    };
    
    return folderNameMap[pluginName] || pluginName.toLowerCase().replace(/\s+/g, '-');
}

// 获取插件默认图标
function getPluginDefaultIcon(pluginName) {
    const iconMap = {
        '余汉波文本片段助手': '📝',
        'sanrenjz-tools-text': '📝',
        '密码管理器': '🔐',
        'sanrenjz-tools-password': '🔐',
        '插件下载': '📦',
        'sanrenjz-tools-download_plugin': '📦',
        'sanrenjz-tools-download': '📦',
        '余汉波AI助手': '🤖',
        'sanrenjz.tools-ai': '🤖'
    };
    
    return iconMap[pluginName] || '🔧';
}

// 初始化超级面板默认功能
async function initializeSuperPanelDefaults() {
    try {
        console.log('🚀 初始化超级面板默认功能');
        
        const customActionsPath = path.join(app.getPath('userData'), 'custom-super-panel-actions.json');
        
        // 检查是否已经初始化过
        if (fs.existsSync(customActionsPath)) {
            console.log('超级面板配置文件已存在，跳过初始化');
            return;
        }
        
        // 读取示例配置文件
        const exampleConfigPath = path.join(__dirname, 'custom-super-panel-actions-example.json');
        
        if (fs.existsSync(exampleConfigPath)) {
            console.log('从示例配置初始化超级面板');
            const exampleData = fs.readFileSync(exampleConfigPath, 'utf8');
            fs.writeFileSync(customActionsPath, exampleData);
            console.log('✅ 超级面板默认功能初始化完成');
        } else {
            console.log('示例配置文件不存在，创建基础配置');
            
            // 创建基础配置
            const basicActions = [
                {
                    "id": "generate-password-simple",
                    "title": "简单密码",
                    "description": "生成8位简单密码（无特殊字符）",
                    "icon": "🔒",
                    "type": "builtin",
                    "category": "密码生成",
                    "priority": 1
                },
                {
                    "id": "generate-password-strong",
                    "title": "强密码",
                    "description": "生成16位强密码（包含特殊字符）",
                    "icon": "🔐",
                    "type": "builtin",
                    "category": "密码生成",
                    "priority": 2
                },
                {
                    "id": "current-time",
                    "title": "当前时间",
                    "description": "获取当前时间并复制到剪贴板",
                    "icon": "🕐",
                    "type": "builtin",
                    "category": "时间工具",
                    "priority": 4
                },
                {
                    "id": "custom-calculator",
                    "title": "计算器",
                    "description": "打开系统计算器",
                    "icon": "🧮",
                    "type": "custom",
                    "category": "系统工具",
                    "command": "open-app",
                    "args": { "app": "calc.exe" },
                    "priority": 10
                },
                {
                    "id": "custom-notepad",
                    "title": "记事本",
                    "description": "打开记事本",
                    "icon": "📝",
                    "type": "custom",
                    "category": "系统工具",
                    "command": "open-app",
                    "args": { "app": "notepad.exe" },
                    "priority": 11
                }
            ];
            
            fs.writeFileSync(customActionsPath, JSON.stringify(basicActions, null, 2));
            console.log('✅ 超级面板基础功能初始化完成');
        }
        
    } catch (error) {
        console.error('初始化超级面板默认功能失败:', error);
    }
}

// 初始化插件的超级面板功能
async function initializePluginSuperPanelActions() {
    try {
        console.log('🔌 开始初始化插件超级面板功能');
        
        // 扫描插件目录
        const pluginDir = path.join(__dirname, 'app', 'software');
        
        if (!fs.existsSync(pluginDir)) {
            console.log('插件目录不存在:', pluginDir);
            return;
        }
        
        const pluginFolders = fs.readdirSync(pluginDir).filter(item => {
            const fullPath = path.join(pluginDir, item);
            return fs.statSync(fullPath).isDirectory();
        });
        
        console.log(`找到 ${pluginFolders.length} 个插件文件夹`);
        
        for (const folder of pluginFolders) {
            try {
                const pluginPath = path.join(pluginDir, folder);
                const configPath = path.join(pluginPath, 'plugin.json');
                
                if (fs.existsSync(configPath)) {
                    const pluginConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    
                    if (pluginConfig && pluginConfig.pluginName) {
                        console.log(`🔧 注册插件 ${pluginConfig.pluginName} 的超级面板功能`);
                        
                        // 先清除之前的注册（如果有的话）
                        if (superPanelRegistry.has(pluginConfig.pluginName)) {
                            superPanelRegistry.delete(pluginConfig.pluginName);
                        }
                        
                        // 调用自动注册函数，传递插件路径
                        autoRegisterPluginSuperPanelActions(pluginConfig.pluginName, pluginConfig, pluginPath);
                    }
                } else {
                    console.log(`插件 ${folder} 缺少配置文件`);
                }
            } catch (error) {
                console.error(`处理插件 ${folder} 时出错:`, error);
            }
        }
        
        console.log('✅ 插件超级面板功能初始化完成');
        
        // 通知超级面板更新
        notifySuperPanelUpdate();
        
    } catch (error) {
        console.error('初始化插件超级面板功能失败:', error);
    }
}

// 添加 IPC 处理：获取用户自定义功能
ipcMain.handle('get-custom-super-panel-actions', () => {
    try {
        const customActionsPath = path.join(app.getPath('userData'), 'custom-super-panel-actions.json');
        if (fs.existsSync(customActionsPath)) {
            const data = fs.readFileSync(customActionsPath, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('读取自定义功能失败:', error);
        return [];
    }
});

// 添加 IPC 处理：保存用户自定义功能
ipcMain.handle('save-custom-super-panel-actions', (event, actions) => {
    try {
        const customActionsPath = path.join(app.getPath('userData'), 'custom-super-panel-actions.json');
        fs.writeFileSync(customActionsPath, JSON.stringify(actions, null, 2));
        return true;
    } catch (error) {
        console.error('保存自定义功能失败:', error);
        return false;
    }
});

// 添加内容插入处理器 - 整合焦点恢复和自动粘贴
ipcMain.handle('handle-content-insertion', async (event, { content, type }) => {
    console.log('开始处理内容插入:', content.substring(0, 30) + '...');
    
    try {
        // 1. 等待一小段时间确保窗口关闭完成
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 2. 焦点恢复功能已移除
        console.log('焦点恢复功能已移除');
        
        // 3. 等待焦点稳定
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 4. 执行自动粘贴
        console.log('开始执行自动粘贴');
        await performAutoPaste();
        
        console.log('内容插入处理完成');
        return { success: true };
        
    } catch (error) {
        console.error('内容插入处理失败:', error);
        return { success: false, error: error.message };
    }
});

// 执行自动粘贴的函数
async function performAutoPaste() {
    return new Promise((resolve, reject) => {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');
        
        // 创建PowerShell脚本来执行粘贴
        const tempDir = os.tmpdir();
        const scriptPath = path.join(tempDir, `auto_paste_${Date.now()}.ps1`);
        
        const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Start-Sleep -Milliseconds 100
        [System.Windows.Forms.SendKeys]::SendWait("^v")
        `;
        
        try {
            fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8' });
            
            const command = `powershell -ExecutionPolicy Bypass -NonInteractive -NoProfile -File "${scriptPath}"`;
            console.log('执行自动粘贴命令:', command);
            
            exec(command, { windowsHide: true, timeout: 3000 }, (error, stdout, stderr) => {
                // 清理临时文件
                try {
                    if (fs.existsSync(scriptPath)) {
                        fs.unlinkSync(scriptPath);
                    }
                } catch (e) {
                    console.error('清理PS脚本失败:', e);
                }
                
                if (error) {
                    console.error('自动粘贴失败:', error);
                    reject(error);
                } else {
                    console.log('自动粘贴成功');
                    resolve();
                }
            });
        } catch (error) {
            console.error('创建粘贴脚本失败:', error);
            reject(error);
        }
    });
}

// 插件存储相关的IPC处理器（同步）
ipcMain.on('plugin-storage-set', (event, pluginName, key, value) => {
    try {
        if (pluginManager) {
            const result = pluginManager.setPluginStorageItem(pluginName, key, value);
            console.log(`插件存储设置: ${pluginName} - ${key}`, '成功:', result);
            event.returnValue = result;
        } else {
            console.error('插件管理器未初始化');
            event.returnValue = false;
        }
    } catch (error) {
        console.error('插件存储设置失败:', error);
        event.returnValue = false;
    }
});

ipcMain.on('plugin-storage-get', (event, pluginName, key) => {
    try {
        if (pluginManager) {
            const result = pluginManager.getPluginStorageItem(pluginName, key);
            console.log(`插件存储获取: ${pluginName} - ${key}`, '结果:', result);
            event.returnValue = result;
        } else {
            console.error('插件管理器未初始化');
            event.returnValue = null;
        }
    } catch (error) {
        console.error('插件存储获取失败:', error);
        event.returnValue = null;
    }
});

ipcMain.on('plugin-storage-remove', (event, pluginName, key) => {
    try {
        if (pluginManager) {
            const result = pluginManager.removePluginStorageItem(pluginName, key);
            console.log(`插件存储删除: ${pluginName} - ${key}`, '成功:', result);
            event.returnValue = result;
        } else {
            console.error('插件管理器未初始化');
            event.returnValue = false;
        }
    } catch (error) {
        console.error('插件存储删除失败:', error);
        event.returnValue = false;
    }
});

// 获取插件数据存储目录
ipcMain.handle('get-plugin-data-directory', () => {
    try {
        const settings = loadSettings();
        if (settings.customPluginDataPath && fs.existsSync(settings.customPluginDataPath)) {
            return settings.customPluginDataPath;
        }
        
        if (pluginManager) {
            return pluginManager.getPluginDataDirectory();
        }
        return path.join(app.getPath('userData'), 'plugin-data');
    } catch (error) {
        console.error('获取插件数据目录失败:', error);
        return null;
    }
});

// 设置自定义插件数据存储目录
ipcMain.handle('set-custom-plugin-data-directory', async (event) => {
    try {
        const result = await dialog.showOpenDialog({
            title: '选择插件数据存储目录',
            properties: ['openDirectory', 'createDirectory'],
            buttonLabel: '选择目录'
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { success: false, message: '用户取消选择' };
        }

        const selectedPath = result.filePaths[0];
        
        // 验证目录是否可写
        try {
            const testFile = path.join(selectedPath, '.test_write_permission');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (writeError) {
            return { success: false, message: '所选目录没有写入权限，请选择其他目录' };
        }

        // 创建插件数据子目录
        const pluginDataPath = path.join(selectedPath, 'plugin-data');
        if (!fs.existsSync(pluginDataPath)) {
            fs.mkdirSync(pluginDataPath, { recursive: true });
        }

        // 更新设置
        const settings = loadSettings();
        settings.customPluginDataPath = pluginDataPath;
        saveSettings(settings);

        // 更新插件管理器的数据目录
        if (pluginManager) {
            pluginManager.updatePluginDataDirectory(pluginDataPath);
        }

        return { success: true, path: pluginDataPath };
    } catch (error) {
        console.error('设置自定义插件数据目录失败:', error);
        return { success: false, message: error.message };
    }
});

// 重置插件数据存储目录为默认值
ipcMain.handle('reset-plugin-data-directory', () => {
    try {
        const settings = loadSettings();
        settings.customPluginDataPath = null;
        saveSettings(settings);

        const defaultPath = path.join(app.getPath('userData'), 'plugin-data');
        
        // 更新插件管理器的数据目录
        if (pluginManager) {
            pluginManager.updatePluginDataDirectory(defaultPath);
        }

        return { success: true, path: defaultPath };
    } catch (error) {
        console.error('重置插件数据目录失败:', error);
        return { success: false, message: error.message };
    }
});

// 应用程序生命周期事件

// 当Electron完成初始化时创建窗口
app.whenReady().then(async () => {
    try {
        // 初始化remote模块
        remoteMain.initialize();
        
        // 在应用准备就绪时就设置空菜单，确保所有平台都生效
        Menu.setApplicationMenu(null);
        
        createWindow();
        
        // 注册全局快捷键
        const settings = loadSettings();
        const hotkeyRegistered = registerGlobalShortcut(settings.globalHotkey);
        
        // 如果注册失败，尝试使用备选快捷键
        if (!hotkeyRegistered) {
            console.log(`快捷键 ${settings.globalHotkey} 注册失败，尝试使用备选快捷键`);
            const fallbackHotkey = 'Ctrl+Space';
            
            // 只有当当前快捷键不是备选快捷键时才尝试
            if (settings.globalHotkey !== fallbackHotkey) {
                const fallbackRegistered = registerGlobalShortcut(fallbackHotkey);
                
                if (fallbackRegistered) {
                    // 更新设置
                    settings.globalHotkey = fallbackHotkey;
                    saveSettings(settings);
                    
                    // 通知用户
                    setTimeout(() => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            // 在主窗口显示通知
                            mainWindow.webContents.send('notify', {
                                title: '快捷键已更改',
                                message: `原快捷键 ${settings.globalHotkey} 无法注册，已自动切换到 ${fallbackHotkey}。您可以在设置中更改。`,
                                type: 'warning'
                            });
                        }
                    }, 2000);
                }
            }
        }
        
        // 注册钉住快捷键
        registerPinShortcut(settings.pinHotkey);
        
        // 启动右键长按监听器
        if (process.platform === 'win32') {
            startRightClickMonitor();
        }
        
        // 设置开机自启动
        if (settings.autoStart) {
            app.setLoginItemSettings({
                openAtLogin: true,
                path: process.execPath
            });
        }
        
        // 监听主窗口关闭事件，隐藏到托盘而不是退出
        mainWindow.on('close', (event) => {
            if (!app.isQuiting) {
                console.log('主窗口关闭，隐藏到托盘');
                event.preventDefault();
                mainWindow.hide();
            }
        });
        
        // 注册超级面板测试快捷键
        try {
            globalShortcut.register('Ctrl+Alt+P', () => {
                console.log('🧪 快捷键触发超级面板测试 (Ctrl+Alt+P)');
                showSuperPanel();
            });
            console.log('超级面板测试快捷键注册成功: Ctrl+Alt+P');
        } catch (error) {
            console.error('超级面板测试快捷键注册失败:', error);
        }
        
        // 初始化超级面板默认功能
        await initializeSuperPanelDefaults();
        
        // 自动加载和注册所有插件的超级面板功能
        await initializePluginSuperPanelActions();
        
        console.log('应用初始化完成');
        
    } catch (error) {
        console.error('初始化失败:', error);
        app.quit();
    }
});

// 当所有窗口关闭时的处理
app.on('window-all-closed', () => {
    // 不自动退出，保持在托盘中运行
    console.log('所有窗口已关闭，应用继续在托盘中运行');
});

app.on('activate', () => {
    // macOS 下点击程序坞图标时重新创建窗口
    if (mainWindow === null) {
        createWindow();
    } else if (!mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
    }
});

// 应用退出前清理
app.on('before-quit', () => {
    console.log('应用即将退出，清理资源...');
    app.isQuiting = true;
    
    // 注销全局快捷键
    globalShortcut.unregisterAll();
    
    // 停止右键监听器
    stopRightClickMonitor();
    
    // 停止所有插件
    if (pluginManager) {
        pluginManager.stopAllPlugins();
    }
    
    // 销毁托盘图标
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

// 添加 IPC 处理：打开插件管理器
ipcMain.handle('open-plugin-manager', () => {
    try {
        // 创建插件管理窗口
        createPluginManagerWindow();
    } catch (error) {
        console.error('打开插件管理器失败:', error);
    }
});

// 添加 IPC 处理：打开添加插件功能对话框
ipcMain.handle('open-add-plugin-dialog', async () => {
    try {
        // 获取鼠标位置并计算窗口显示位置
        let windowOptions = {
            width: 600,
            height: 500,
            modal: true,
            parent: superPanelWindow || mainWindow,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            frame: false,
            resizable: false,
            transparent: true,
            alwaysOnTop: true
        };
        
        try {
            // 获取鼠标位置并在鼠标所在的屏幕显示窗口
            const cursorPoint = screen.getCursorScreenPoint();
            const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
            
            // 计算窗口位置，在屏幕中央显示
            let x = currentDisplay.workArea.x + Math.round((currentDisplay.workArea.width - 600) / 2);
            let y = currentDisplay.workArea.y + Math.round((currentDisplay.workArea.height - 500) / 2);
            
            // 边界检查
            if (x < currentDisplay.workArea.x) x = currentDisplay.workArea.x + 10;
            if (x + 600 > currentDisplay.workArea.x + currentDisplay.workArea.width) {
                x = currentDisplay.workArea.x + currentDisplay.workArea.width - 600 - 10;
            }
            if (y < currentDisplay.workArea.y) y = currentDisplay.workArea.y + 10;
            if (y + 500 > currentDisplay.workArea.y + currentDisplay.workArea.height) {
                y = currentDisplay.workArea.y + currentDisplay.workArea.height - 500 - 10;
            }
            
            windowOptions.x = x;
            windowOptions.y = y;
            console.log(`添加插件对话框将在屏幕 ${currentDisplay.id} 显示，位置: (${x}, ${y})`);
        } catch (error) {
            console.error('设置添加插件对话框位置失败，使用默认位置:', error);
        }
        
        // 创建添加插件功能的对话框窗口
        const addPluginWindow = new BrowserWindow(windowOptions);

        // 启用remote模块
        remoteMain.enable(addPluginWindow.webContents);

        // 创建添加插件功能的HTML内容
        const addPluginHtml = createAddPluginDialogHtml();
        addPluginWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(addPluginHtml)}`);

        addPluginWindow.on('closed', () => {
            // 窗口关闭后的清理工作
        });

        return true;
    } catch (error) {
        console.error('打开添加插件对话框失败:', error);
        return false;
    }
});

// 删除重复的处理器 - 已在上面统一定义

// 添加 IPC 处理：统一执行超级面板功能
ipcMain.handle('execute-super-panel-action', async (event, { action, selectedText }) => {
    try {
        console.log('执行超级面板功能:', action);

        // 根据操作类型执行不同的逻辑
        if (action.type === 'builtin') {
            // 执行内置功能
            return await executeBuiltinAction(action, selectedText);
        } else if (action.type === 'custom') {
            // 执行自定义功能
            return await executeCustomAction(action, selectedText);
        } else if (action.type === 'plugin') {
            // 运行插件
            return await runPluginAction(action.pluginPath, action.feature, selectedText);
        } else if (action.type === 'dynamic') {
            // 执行动态功能
            return await executeDynamicAction(action, selectedText);
        }

        return { success: true };
    } catch (error) {
        console.error('执行超级面板功能失败:', error);
        throw error;
    }
});

// 执行内置功能
async function executeBuiltinAction(action, selectedText) {
    try {
        const { clipboard } = require('electron');
        
        switch (action.id) {
            case 'generate-password-simple':
                const simplePassword = generateRandomPassword(8, { includeSymbols: false });
                clipboard.writeText(simplePassword);
                console.log('简单密码已复制:', simplePassword);
                break;
            case 'generate-password-strong':
                const strongPassword = generateRandomPassword(16);
                clipboard.writeText(strongPassword);
                console.log('强密码已复制:', strongPassword);
                break;
            case 'generate-password-ultra':
                const ultraPassword = generateRandomPassword(24);
                clipboard.writeText(ultraPassword);
                console.log('超强密码已复制:', ultraPassword);
                break;
            case 'current-time':
                const timeStr = new Date().toLocaleString('zh-CN');
                clipboard.writeText(timeStr);
                console.log('当前时间已复制:', timeStr);
                break;
            case 'timestamp':
                const timestamp = Date.now().toString();
                clipboard.writeText(timestamp);
                console.log('时间戳已复制:', timestamp);
                break;
            case 'uuid':
                const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
                clipboard.writeText(uuid);
                console.log('UUID已复制:', uuid);
                break;
            default:
                console.log('未知的内置功能:', action.id);
        }
        return { success: true };
    } catch (error) {
        console.error('执行内置功能失败:', error);
        throw error;
    }
}

// 执行自定义功能
async function executeCustomAction(action, selectedText) {
    try {
        if (action.command) {
            // 直接执行系统命令
            return await executeSystemCommand(action.command, action.args || {}, selectedText);
        } else if (action.script) {
            // 执行自定义脚本
            try {
                eval(action.script);
                return { success: true };
            } catch (scriptError) {
                console.error('自定义脚本执行失败:', scriptError);
                throw scriptError;
            }
        }
        return { success: true };
    } catch (error) {
        console.error('执行自定义功能失败:', error);
        throw error;
    }
}

// 执行动态功能
async function executeDynamicAction(action, selectedText) {
    try {
        switch (action.action || action.command) {
            case 'search-web':
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`;
                require('electron').shell.openExternal(searchUrl);
                break;
            case 'open-url':
                require('electron').shell.openExternal(action.args?.url || selectedText);
                break;
            case 'send-email':
                const emailUrl = `mailto:${action.args?.email || selectedText}`;
                require('electron').shell.openExternal(emailUrl);
                break;
            case 'translate':
                const translateUrl = `https://translate.google.com/?sl=${action.args?.from || 'auto'}&tl=${action.args?.to || 'en'}&text=${encodeURIComponent(selectedText)}`;
                require('electron').shell.openExternal(translateUrl);
                break;
            default:
                console.log('未知的动态功能:', action.action);
        }
        return { success: true };
    } catch (error) {
        console.error('执行动态功能失败:', error);
        throw error;
    }
}

// 已在上面定义，删除重复定义

// 获取自定义超级面板功能
async function getCustomSuperPanelActions() {
    try {
        const customActionsPath = path.join(app.getPath('userData'), 'custom-super-panel-actions.json');
        
        if (!fs.existsSync(customActionsPath)) {
            return [];
        }
        
        const data = fs.readFileSync(customActionsPath, 'utf8');
        const actions = JSON.parse(data);
        
        // 返回所有从配置文件读取的功能，包括自定义和内置
        return actions || [];
    } catch (error) {
        console.error('读取自定义超级面板功能失败:', error);
        return [];
    }
}

// 获取内置超级面板功能
async function getBuiltinSuperPanelActions() {
    return [
        {
            id: 'generate-password-simple',
            title: '简单密码',
            description: '生成8位简单密码（无特殊字符）',
            icon: '🔒',
            type: 'builtin',
            category: '密码生成',
            priority: 1
        },
        {
            id: 'generate-password-strong',
            title: '强密码',
            description: '生成16位强密码（包含特殊字符）',
            icon: '🔐',
            type: 'builtin',
            category: '密码生成',
            priority: 2
        },
        {
            id: 'generate-password-ultra',
            title: '超强密码',
            description: '生成24位超强密码',
            icon: '🛡️',
            type: 'builtin',
            category: '密码生成',
            priority: 3
        },
        {
            id: 'current-time',
            title: '当前时间',
            description: '获取当前时间并复制到剪贴板',
            icon: '🕐',
            type: 'builtin',
            category: '时间工具',
            priority: 4
        },
        {
            id: 'timestamp',
            title: '时间戳',
            description: '获取当前时间戳并复制到剪贴板',
            icon: '⏱️',
            type: 'builtin',
            category: '时间工具',
            priority: 5
        },
        {
            id: 'uuid',
            title: 'UUID',
            description: '生成UUID并复制到剪贴板',
            icon: '🆔',
            type: 'builtin',
            category: '生成工具',
            priority: 6
        }
    ];
}

// 获取动态超级面板功能（基于选中内容）
async function getDynamicSuperPanelActions(selectedText) {
    const dynamicActions = [];
    
    if (!selectedText || selectedText.trim() === '') {
        return dynamicActions;
    }
    
    const text = selectedText.trim();
    
    // URL 检测
    if (text.match(/^https?:\/\/.+/)) {
        dynamicActions.push({
            id: 'open-url-' + Date.now(),
            title: '打开链接',
            description: `在浏览器中打开该URL`,
            icon: '🔗',
            type: 'dynamic',
            category: '链接操作',
            command: 'open-url',
            args: { url: text },
            priority: 1
        });
    }
    
    // 邮箱检测
    if (text.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        dynamicActions.push({
            id: 'send-email-' + Date.now(),
            title: '发送邮件',
            description: '发送邮件到该地址',
            icon: '📧',
            type: 'dynamic',
            category: '邮件操作',
            command: 'send-email',
            args: { email: text },
            priority: 2
        });
    }
    
    // 数字检测（计算器）
    if (text.match(/^[\d\+\-\*\/\.\(\)\s]+$/)) {
        dynamicActions.push({
            id: 'calculate-' + Date.now(),
            title: '计算表达式',
            description: `计算 ${text}`,
            icon: '🧮',
            type: 'dynamic',
            category: '计算工具',
            command: 'calculate',
            args: { expression: text },
            priority: 3
        });
    }
    
    // 中文文本检测（翻译）
    if (/[\u4e00-\u9fa5]/.test(text)) {
        dynamicActions.push({
            id: 'translate-zh-en-' + Date.now(),
            title: '翻译到英文',
            description: '翻译选中的中文文本到英文',
            icon: '🌍',
            type: 'dynamic',
            category: '翻译工具',
            command: 'translate',
            args: { text: text, from: 'zh', to: 'en' },
            priority: 4
        });
    }
    
    // 英文文本检测（翻译）
    if (/^[a-zA-Z\s.,!?'"]+$/.test(text)) {
        dynamicActions.push({
            id: 'translate-en-zh-' + Date.now(),
            title: '翻译到中文',
            description: '翻译选中的英文文本到中文',
            icon: '🌏',
            type: 'dynamic',
            category: '翻译工具',
            command: 'translate',
            args: { text: text, from: 'en', to: 'zh' },
            priority: 5
        });
    }
    
    // 搜索功能（对所有文本）
    dynamicActions.push({
        id: 'search-web-' + Date.now(),
        title: '网页搜索',
        description: `搜索 "${text.length > 20 ? text.substring(0, 20) + '...' : text}"`,
        icon: '🔍',
        type: 'dynamic',
        category: '搜索工具',
        command: 'search-web',
        args: { query: text },
        priority: 10
    });
    
    return dynamicActions;
}

// 删除重复定义

// 删除重复定义

// 生成随机密码
function generateRandomPassword(length = 12, options = {}) {
    const defaults = {
        includeNumbers: true,
        includeLowercase: true,
        includeUppercase: true,
        includeSymbols: true
    };
    const settings = { ...defaults, ...options };
    
    let charset = '';
    if (settings.includeNumbers) charset += '0123456789';
    if (settings.includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (settings.includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (settings.includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (!charset) return '';
    
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
}

// 创建添加插件功能对话框的HTML内容
function createAddPluginDialogHtml() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>添加功能到超级面板</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
            background: rgba(40, 44, 52, 0.95);
            color: #ffffff;
            user-select: none;
            overflow: hidden;
            border-radius: 12px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .dialog-header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .dialog-title {
            font-size: 14px;
            font-weight: 500;
            color: #ffffff;
        }
        
        .close-btn {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            font-size: 16px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .close-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }
        
        .tabs {
            display: flex;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
        }
        
        .tab {
            padding: 10px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.7);
            border-bottom: 2px solid transparent;
        }
        
        .tab:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }
        
        .tab.active {
            color: #60a5fa;
            border-bottom-color: #60a5fa;
        }
        
        .dialog-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .plugins-list, .builtin-list, .custom-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 16px;
        }
        
        .feature-card, .plugin-card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.2s ease;
            cursor: pointer;
        }
        
        .feature-card:hover, .plugin-card:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(96, 165, 250, 0.5);
        }
        
        .feature-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .feature-icon {
            font-size: 20px;
            margin-right: 10px;
        }
        
        .plugin-name, .feature-name {
            font-size: 14px;
            font-weight: 500;
            color: #ffffff;
            margin-bottom: 8px;
        }
        
        .feature-description {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 10px;
        }
        
        .feature-meta {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
        }
        
        .plugin-features {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .feature-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.03);
            transition: all 0.2s ease;
        }
        
        .feature-item:hover {
            background: rgba(96, 165, 250, 0.1);
        }
        
        .feature-checkbox {
            margin-right: 8px;
        }
        
        .dialog-footer {
            padding: 16px 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .btn-cancel {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.8);
        }
        
        .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        .btn-save {
            background: #60a5fa;
            color: #ffffff;
        }
        
        .btn-save:hover {
            background: #3b82f6;
        }
        
        .loading-spinner {
            display: inline-block;
            width: 24px;
            height: 24px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #60a5fa;
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: rgba(255, 255, 255, 0.6);
        }
        
        .empty-icon {
            font-size: 32px;
            margin-bottom: 16px;
            opacity: 0.3;
        }
        
        .empty-title {
            font-size: 14px;
            margin-bottom: 8px;
            color: rgba(255, 255, 255, 0.8);
        }
    </style>
</head>
<body>
    <div class="dialog-header">
        <div class="dialog-title">添加功能到超级面板</div>
        <button class="close-btn" onclick="closeDialog()">✕</button>
    </div>
    
    <div class="tabs">
        <div class="tab active" data-tab="plugins" onclick="switchTab('plugins')">🔌 插件功能</div>
        <div class="tab" data-tab="builtin" onclick="switchTab('builtin')">⚙️ 内置功能</div>
        <div class="tab" data-tab="custom" onclick="switchTab('custom')">🎨 自定义功能</div>
    </div>
    
    <div class="dialog-content">
        <!-- 插件功能选项卡 -->
        <div class="tab-content active" id="tab-plugins">
            <div class="plugins-list" id="plugins-list">
                <div class="empty-state">
                    <div class="loading-spinner"></div>
                    <div class="empty-title">正在加载插件功能...</div>
                </div>
            </div>
        </div>
        
        <!-- 内置功能选项卡 -->
        <div class="tab-content" id="tab-builtin">
            <div class="builtin-list" id="builtin-list">
                <div class="empty-state">
                    <div class="loading-spinner"></div>
                    <div class="empty-title">正在加载内置功能...</div>
                </div>
            </div>
        </div>
        
        <!-- 自定义功能选项卡 -->
        <div class="tab-content" id="tab-custom">
            <div class="custom-list" id="custom-list">
                <div class="empty-state">
                    <div class="loading-spinner"></div>
                    <div class="empty-title">正在加载自定义功能...</div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="dialog-footer">
        <button class="btn btn-cancel" onclick="closeDialog()">取消</button>
        <button class="btn btn-save" onclick="saveSelectedFeatures()">保存</button>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        
        let plugins = [];
        let builtinFeatures = [];
        let customFeatures = [];
        let selectedFeatures = new Set();
        let activeTabName = 'plugins';
        
        // 初始化对话框
        async function initDialog() {
            try {
                // 1. 加载插件功能
                loadPluginFeatures();
                
                // 2. 加载内置功能
                loadBuiltinFeatures();
                
                // 3. 加载自定义功能
                loadCustomFeatures();
                
            } catch (error) {
                console.error('初始化对话框失败:', error);
                showError('初始化失败: ' + error.message);
            }
        }
        
        // 加载插件功能
        async function loadPluginFeatures() {
            try {
                plugins = await ipcRenderer.invoke('get-plugin-list');
                console.log('获取到插件列表:', plugins);
                renderPluginsList();
            } catch (error) {
                console.error('加载插件功能失败:', error);
                document.getElementById('plugins-list').innerHTML = 
                    '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">加载插件列表失败</div></div>';
            }
        }
        
        // 加载内置功能
        async function loadBuiltinFeatures() {
            try {
                // 获取所有内置功能
                const allFeatures = await ipcRenderer.invoke('get-builtin-actions');
                
                // 获取当前已启用的功能ID
                const activeFeatures = await ipcRenderer.invoke('get-active-action-ids');
                
                // 筛选出未启用的内置功能
                builtinFeatures = allFeatures.filter(feature => 
                    feature.type === 'builtin' && !activeFeatures.includes(feature.id)
                );
                
                console.log('可添加的内置功能:', builtinFeatures);
                renderBuiltinList();
            } catch (error) {
                console.error('加载内置功能失败:', error);
                document.getElementById('builtin-list').innerHTML = 
                    '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">加载内置功能失败</div></div>';
            }
        }
        
        // 加载自定义功能
        async function loadCustomFeatures() {
            try {
                // 获取所有可用的自定义功能
                const availableCustomFeatures = await ipcRenderer.invoke('get-available-custom-actions');
                customFeatures = availableCustomFeatures || [];
                
                console.log('可添加的自定义功能:', customFeatures);
                renderCustomList();
            } catch (error) {
                console.error('加载自定义功能失败:', error);
                document.getElementById('custom-list').innerHTML = 
                    '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">加载自定义功能失败</div></div>';
            }
        }
        
        // 渲染插件列表
        function renderPluginsList() {
            const container = document.getElementById('plugins-list');
            
            if (!plugins || plugins.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">未找到插件</div></div>';
                return;
            }
            
            container.innerHTML = '';
            
            plugins.forEach(plugin => {
                if (!plugin.config || !plugin.config.features) return;
                
                const pluginDiv = document.createElement('div');
                pluginDiv.className = 'plugin-card';
                
                pluginDiv.innerHTML = \`
                    <div class="plugin-name">\${plugin.config.pluginName || '未知插件'}</div>
                    <div class="feature-meta">可添加 \${plugin.config.features.length} 个功能</div>
                    <div class="plugin-features" style="margin-top: 10px;">
                        \${plugin.config.features.map(feature => \`
                            <div class="feature-item" style="padding: 6px; display: flex; align-items: center;" 
                                 onclick="togglePluginFeature('\${plugin.path}', '\${feature.code}')">
                                <input type="checkbox" class="feature-checkbox" 
                                       id="feature-\${plugin.path}-\${feature.code}" 
                                       onchange="togglePluginFeature('\${plugin.path}', '\${feature.code}')">
                                <span style="font-size: 12px;">\${feature.explain || feature.code}</span>
                            </div>
                        \`).join('')}
                    </div>
                \`;
                
                container.appendChild(pluginDiv);
            });
        }
        
        // 渲染内置功能列表
        function renderBuiltinList() {
            const container = document.getElementById('builtin-list');
            
            if (!builtinFeatures || builtinFeatures.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">所有内置功能已添加</div></div>';
                return;
            }
            
            container.innerHTML = '';
            
            builtinFeatures.forEach(feature => {
                const featureDiv = document.createElement('div');
                featureDiv.className = 'feature-card';
                
                featureDiv.innerHTML = \`
                    <div class="feature-header">
                        <div class="feature-icon">\${feature.icon || '⚙️'}</div>
                        <div class="feature-name">\${feature.title}</div>
                    </div>
                    <div class="feature-description">\${feature.description || '无描述'}</div>
                    <div class="feature-meta">
                        <input type="checkbox" class="feature-checkbox" 
                               id="builtin-\${feature.id}" 
                               onchange="toggleBuiltinFeature('\${feature.id}')">
                        <label for="builtin-\${feature.id}">添加此功能</label>
                    </div>
                \`;
                
                container.appendChild(featureDiv);
            });
        }
        
        // 渲染自定义功能列表
        function renderCustomList() {
            const container = document.getElementById('custom-list');
            
            if (!customFeatures || customFeatures.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">暂无可添加的自定义功能</div></div>';
                return;
            }
            
            container.innerHTML = '';
            
            customFeatures.forEach(feature => {
                const featureDiv = document.createElement('div');
                featureDiv.className = 'feature-card';
                
                featureDiv.innerHTML = \`
                    <div class="feature-header">
                        <div class="feature-icon">\${feature.icon || '🎨'}</div>
                        <div class="feature-name">\${feature.title}</div>
                    </div>
                    <div class="feature-description">\${feature.description || '无描述'}</div>
                    <div class="feature-meta">
                        <input type="checkbox" class="feature-checkbox" 
                               id="custom-\${feature.id}" 
                               onchange="toggleCustomFeature('\${feature.id}')">
                        <label for="custom-\${feature.id}">添加此功能</label>
                    </div>
                \`;
                
                container.appendChild(featureDiv);
            });
        }
        
        // 切换选项卡
        function switchTab(tabName) {
            // 更新标签页状态
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
            });
            
            // 更新内容区域
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById('tab-' + tabName).classList.add('active');
            
            // 记录当前选项卡
            activeTabName = tabName;
        }
        
        // 切换插件功能选择状态
        function togglePluginFeature(pluginPath, featureCode) {
            const featureId = \`plugin:\${pluginPath}:\${featureCode}\`;
            const checkbox = document.getElementById(\`feature-\${pluginPath}-\${featureCode}\`);
            
            if (selectedFeatures.has(featureId)) {
                selectedFeatures.delete(featureId);
                checkbox.checked = false;
            } else {
                selectedFeatures.add(featureId);
                checkbox.checked = true;
            }
        }
        
        // 切换内置功能选择状态
        function toggleBuiltinFeature(featureId) {
            const fullId = \`builtin:\${featureId}\`;
            const checkbox = document.getElementById(\`builtin-\${featureId}\`);
            
            if (selectedFeatures.has(fullId)) {
                selectedFeatures.delete(fullId);
                checkbox.checked = false;
            } else {
                selectedFeatures.add(fullId);
                checkbox.checked = true;
            }
        }
        
        // 切换自定义功能选择状态
        function toggleCustomFeature(featureId) {
            const fullId = \`custom:\${featureId}\`;
            const checkbox = document.getElementById(\`custom-\${featureId}\`);
            
            if (selectedFeatures.has(fullId)) {
                selectedFeatures.delete(fullId);
                checkbox.checked = false;
            } else {
                selectedFeatures.add(fullId);
                checkbox.checked = true;
            }
        }
        
        // 保存选中的功能
        async function saveSelectedFeatures() {
            try {
                // 将选中的功能转换为适当的格式
                const features = [];
                
                for (const featureId of selectedFeatures) {
                    const [type, ...rest] = featureId.split(':');
                    
                    if (type === 'plugin') {
                        const [pluginPath, featureCode] = rest;
                        const plugin = plugins.find(p => p.path === pluginPath);
                        const feature = plugin?.config?.features?.find(f => f.code === featureCode);
                        
                        if (plugin && feature) {
                            features.push({
                                id: \`plugin-\${plugin.config.pluginName}-\${featureCode}\`,
                                title: feature.explain || featureCode,
                                description: \`使用 \${plugin.config.pluginName} 处理内容\`,
                                icon: getPluginIcon(plugin.config.pluginName),
                                type: 'plugin',
                                category: '插件功能',
                                pluginPath: pluginPath,
                                feature: feature
                            });
                        }
                    } 
                    else if (type === 'builtin') {
                        const builtinId = rest.join(':');
                        const feature = builtinFeatures.find(f => f.id === builtinId);
                        
                        if (feature) {
                            features.push(feature);
                        }
                    }
                    else if (type === 'custom') {
                        const customId = rest.join(':');
                        const feature = customFeatures.find(f => f.id === customId);
                        
                        if (feature) {
                            features.push(feature);
                        }
                    }
                }
                
                if (features.length === 0) {
                    alert('请至少选择一个功能');
                    return;
                }
                
                // 保存到自定义功能配置
                const success = await ipcRenderer.invoke('add-features-to-super-panel', features);
                
                if (success) {
                    alert(\`成功添加 \${features.length} 个功能到超级面板\`);
                    closeDialog();
                } else {
                    alert('保存失败');
                }
                
            } catch (error) {
                console.error('保存功能失败:', error);
                alert('保存失败: ' + error.message);
            }
        }
        
        // 获取插件图标
        function getPluginIcon(pluginName) {
            const iconMap = {
                'sanrenjz-tools-password': '🔐',
                'sanrenjz-tools-text': '📝',
                'sanrenjz-tools-download': '⬇️',
                'sanrenjz.tools-ai': '🤖',
                '余汉波文本片段助手': '📝',
                '密码管理器': '🔐',
                '插件下载': '📦',
                '余汉波AI助手': '🤖'
            };
            return iconMap[pluginName] || '🔧';
        }
        
        // 显示错误信息
        function showError(message) {
            document.querySelectorAll('.tab-content').forEach(content => {
                content.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-icon">❌</div>
                        <div class="empty-title">\${message}</div>
                    </div>
                \`;
            });
        }
        
        // 关闭对话框
        function closeDialog() {
            ipcRenderer.invoke('close-current-window');
        }
        
        // 窗口加载完成后初始化
        window.addEventListener('DOMContentLoaded', () => {
            initDialog();
        });
    </script>
</body>
</html>
    `;
}

// 添加 IPC 处理：关闭当前窗口
ipcMain.handle('close-current-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
        window.close();
    }
});



// 运行插件功能
async function runPluginAction(pluginPath, feature, selectedText) {
    try {
        if (pluginManager) {
            return await pluginManager.runPluginAction(pluginPath, feature, selectedText);
        } else {
            console.error('插件管理器未初始化');
            return { success: false, error: '插件管理器未初始化' };
        }
    } catch (error) {
        console.error('运行插件功能失败:', error);
        return { success: false, error: error.message };
    }
}

// 执行系统命令
async function executeSystemCommand(command, args, selectedText) {
    try {
        const { shell } = require('electron');
        
        switch (command) {
            case 'open-app':
                if (args.app) {
                    const { exec } = require('child_process');
                    exec(args.app, (error) => {
                        if (error) {
                            console.error('打开应用失败:', error);
                        }
                    });
                    return { success: true };
                }
                break;
                
            case 'open-url':
                if (args.url) {
                    await shell.openExternal(args.url);
                    return { success: true };
                }
                break;
                
            case 'search-web':
                if (args.query) {
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
                    await shell.openExternal(searchUrl);
                    return { success: true };
                }
                break;
                
            case 'send-email':
                if (args.email) {
                    const emailUrl = `mailto:${args.email}`;
                    await shell.openExternal(emailUrl);
                    return { success: true };
                }
                break;
                
            default:
                console.log('未知的系统命令:', command);
                return { success: false, error: '未知的系统命令' };
        }
        
        return { success: false, error: '缺少必要参数' };
    } catch (error) {
        console.error('执行系统命令失败:', error);
        return { success: false, error: error.message };
    }
}

// 创建超级面板管理器窗口
function createSuperPanelManagerWindow() {
    // 获取鼠标位置并计算窗口显示位置
    let windowOptions = {
        width: 800,
        height: 600,
        modal: false,
        parent: mainWindow,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        frame: false,
        resizable: true,
        transparent: true,
        alwaysOnTop: false,
        movable: true
    };
    
    try {
        // 获取鼠标位置并在鼠标所在的屏幕显示窗口
        const cursorPoint = screen.getCursorScreenPoint();
        const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
        
        // 计算窗口位置，在屏幕中央显示
        let x = currentDisplay.workArea.x + Math.round((currentDisplay.workArea.width - 800) / 2);
        let y = currentDisplay.workArea.y + Math.round((currentDisplay.workArea.height - 600) / 2);
        
        // 边界检查
        if (x < currentDisplay.workArea.x) x = currentDisplay.workArea.x + 10;
        if (x + 800 > currentDisplay.workArea.x + currentDisplay.workArea.width) {
            x = currentDisplay.workArea.x + currentDisplay.workArea.width - 800 - 10;
        }
        if (y < currentDisplay.workArea.y) y = currentDisplay.workArea.y + 10;
        if (y + 600 > currentDisplay.workArea.y + currentDisplay.workArea.height) {
            y = currentDisplay.workArea.y + currentDisplay.workArea.height - 600 - 10;
        }
        
        windowOptions.x = x;
        windowOptions.y = y;
        console.log(`管理器窗口将在屏幕 ${currentDisplay.id} 显示，位置: (${x}, ${y})`);
    } catch (error) {
        console.error('设置管理器窗口位置失败，使用默认位置:', error);
    }
    
    const managerWindow = new BrowserWindow(windowOptions);

    // 启用remote模块
    remoteMain.enable(managerWindow.webContents);

    // 创建管理器的HTML内容
    const managerHtml = createSuperPanelManagerHtml();
    managerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(managerHtml)}`);

    managerWindow.on('closed', () => {
        // 窗口关闭后的清理工作
    });

    return managerWindow;
}

// 创建超级面板设置窗口
function createSuperPanelSettingsWindow() {
    // 获取鼠标位置并计算窗口显示位置
    let windowOptions = {
        width: 600,
        height: 500,
        modal: false,
        parent: superPanelWindow || mainWindow,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        frame: false,
        resizable: true,
        transparent: true,
        alwaysOnTop: false,
        movable: true
    };
    
    try {
        // 获取鼠标位置并在鼠标所在的屏幕显示窗口
        const cursorPoint = screen.getCursorScreenPoint();
        const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
        
        // 计算窗口位置，在屏幕中央显示
        let x = currentDisplay.workArea.x + Math.round((currentDisplay.workArea.width - 600) / 2);
        let y = currentDisplay.workArea.y + Math.round((currentDisplay.workArea.height - 500) / 2);
        
        // 边界检查
        if (x < currentDisplay.workArea.x) x = currentDisplay.workArea.x + 10;
        if (x + 600 > currentDisplay.workArea.x + currentDisplay.workArea.width) {
            x = currentDisplay.workArea.x + currentDisplay.workArea.width - 600 - 10;
        }
        if (y < currentDisplay.workArea.y) y = currentDisplay.workArea.y + 10;
        if (y + 500 > currentDisplay.workArea.y + currentDisplay.workArea.height) {
            y = currentDisplay.workArea.y + currentDisplay.workArea.height - 500 - 10;
        }
        
        windowOptions.x = x;
        windowOptions.y = y;
        console.log(`设置窗口将在屏幕 ${currentDisplay.id} 显示，位置: (${x}, ${y})`);
    } catch (error) {
        console.error('设置窗口位置失败，使用默认位置:', error);
    }
    
    const settingsWindow = new BrowserWindow(windowOptions);

    // 启用remote模块
    remoteMain.enable(settingsWindow.webContents);

    // 创建设置界面的HTML内容
    const settingsHtml = createSuperPanelSettingsHtml();
    settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(settingsHtml)}`);

    settingsWindow.on('closed', () => {
        // 窗口关闭后的清理工作
    });

    return settingsWindow;
}

// 创建超级面板管理器的HTML内容
function createSuperPanelManagerHtml() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>超级面板管理器</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
            background: rgba(40, 44, 52, 0.95);
            color: #ffffff;
            user-select: none;
            border-radius: 12px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .manager-header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
            -webkit-app-region: drag; /* 允许拖拽窗口 */
        }
        
        .manager-header button {
            -webkit-app-region: no-drag; /* 按钮区域不可拖拽 */
        }
        
        .manager-title {
            font-size: 16px;
            font-weight: 500;
            color: #ffffff;
        }
        
        .header-buttons {
            display: flex;
            gap: 8px;
        }
        
        .header-btn {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: rgba(255, 255, 255, 0.8);
            font-size: 12px;
            cursor: pointer;
            padding: 6px 12px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .header-btn:hover {
            background: rgba(96, 165, 250, 0.2);
            color: #60a5fa;
        }
        
        .manager-content {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        
        .sidebar {
            width: 200px;
            background: rgba(255, 255, 255, 0.03);
            border-right: 1px solid rgba(255, 255, 255, 0.1);
            padding: 16px;
        }
        
        .category-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-bottom: 4px;
            font-size: 13px;
        }
        
        .category-item:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .category-item.active {
            background: rgba(96, 165, 250, 0.2);
            color: #60a5fa;
        }
        
        .main-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        
        .actions-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
        }
        
        .action-card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.2s ease;
            position: relative;
        }
        
        .action-card:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(96, 165, 250, 0.5);
        }
        
        .action-card.active {
            background: rgba(96, 165, 250, 0.1);
            border-color: rgba(96, 165, 250, 0.5);
        }
        
        .action-status {
            position: absolute;
            top: 8px;
            right: 8px;
            font-size: 12px;
            border-radius: 4px;
            padding: 2px 6px;
        }
        
        .action-status.active {
            background: rgba(52, 211, 153, 0.2);
            color: #34d399;
        }
        
        .action-status.inactive {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            cursor: pointer;
        }
        
        .action-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        
        .action-icon {
            font-size: 20px;
            margin-right: 8px;
            width: 20px;
            height: 20px;
            display: inline-block;
            vertical-align: middle;
        }
        
        .action-title {
            font-size: 14px;
            font-weight: 500;
            color: #ffffff;
            flex: 1;
        }
        
        .action-menu {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            font-size: 12px;
        }
        
        .action-menu:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }
        
        .action-description {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 12px;
            line-height: 1.4;
        }
        
        .action-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
        }
        
        .action-type {
            background: rgba(96, 165, 250, 0.2);
            color: #60a5fa;
            padding: 2px 6px;
            border-radius: 3px;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.6);
        }
        
        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.3;
        }
        
        .empty-title {
            font-size: 16px;
            margin-bottom: 8px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .delete-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: rgba(239, 68, 68, 0.8);
            color: white;
            border: none;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        
        .action-card:hover .delete-btn {
            opacity: 1;
        }
        
        .delete-btn:hover {
            background: #ef4444;
            transform: scale(1.1);
        }
        
        .loading-spinner {
            display: inline-block;
            width: 24px;
            height: 24px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #60a5fa;
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="manager-header">
        <div class="manager-title">超级面板管理器</div>
        <div class="header-buttons">
            <button class="header-btn" onclick="addNewAction()">➕ 添加功能</button>
            <button class="header-btn" onclick="importActions()">📥 导入</button>
            <button class="header-btn" onclick="exportActions()">📤 导出</button>
            <button class="header-btn" onclick="closeManager()">✕</button>
        </div>
    </div>
    
    <div class="manager-content">
        <div class="sidebar">
            <div class="category-item active" onclick="filterByCategory('all')">
                🔧 全部功能
            </div>
            <div class="category-item" onclick="filterByCategory('builtin')">
                ⚙️ 内置功能
            </div>
            <div class="category-item" onclick="filterByCategory('custom')">
                🎨 自定义功能
            </div>
            <div class="category-item" onclick="filterByCategory('plugin')">
                🔌 插件功能
            </div>
            <div class="category-item" onclick="filterByCategory('dynamic')">
                ⚡ 动态功能
            </div>
        </div>
        
        <div class="main-content">
            <div class="actions-list" id="actions-list">
                <div class="empty-state">
                    <div class="loading-spinner"></div>
                    <div class="empty-title">正在加载功能列表...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        
        let allActions = [];
        let currentFilter = 'all';
        
        // 初始化管理器
        async function initManager() {
            try {
                // 1. 获取当前所有可用功能（包括已启用和可添加的）
                allActions = await ipcRenderer.invoke('get-all-available-actions');
                
                // 2. 获取当前激活的功能ID
                const activeActionIds = await ipcRenderer.invoke('get-manager-active-action-ids');
                
                // 3. 标记每个功能的激活状态
                allActions.forEach(action => {
                    action.isActive = activeActionIds.includes(action.id);
                });
                
                console.log('获取到功能列表:', allActions.length, '个', '其中激活的:', activeActionIds.length, '个');
                renderActionsList();
            } catch (error) {
                console.error('初始化管理器失败:', error);
                showEmptyState('❌', '加载失败', '无法加载功能列表: ' + error.message);
            }
        }
        
        // 渲染功能列表
        function renderActionsList() {
            const container = document.getElementById('actions-list');
            
            const filteredActions = currentFilter === 'all' 
                ? allActions 
                : allActions.filter(action => action.type === currentFilter);
                
            if (filteredActions.length === 0) {
                showEmptyState('📭', '暂无功能', '此分类下暂无功能，点击"添加功能"按钮添加');
                return;
            }
            
            container.innerHTML = '';
            
            filteredActions.forEach(action => {
                const actionDiv = document.createElement('div');
                actionDiv.className = 'action-card' + (action.isActive ? ' active' : '');
                
                // 准备状态按钮HTML
                const statusBtnHTML = action.isActive
                    ? \`<span class="action-status active">已添加</span>\`
                    : \`<span class="action-status inactive" onclick="addAction('\${action.id}')">未添加</span>\`;
                
                // 处理图标显示：如果是数据URL或文件路径则用img标签，否则直接显示
                const iconHTML = action.icon && (action.icon.startsWith('data:') || action.icon.startsWith('file://') || action.icon.includes('.ico') || action.icon.includes('.png') || action.icon.includes('.jpg') || action.icon.includes('.svg'))
                    ? \`<img src="\${action.icon}" alt="icon" style="width: 20px; height: 20px; object-fit: contain;" class="action-icon">\`
                    : \`<span class="action-icon">\${action.icon || '🔧'}</span>\`;
                
                actionDiv.innerHTML = \`
                    <div class="action-header">
                        <div style="display: flex; align-items: center;">
                            \${iconHTML}
                            <span class="action-title">\${action.title}</span>
                        </div>
                    </div>
                    <div class="action-description">\${action.description || '无描述'}</div>
                    <div class="action-meta">
                        <span class="action-type">\${getTypeLabel(action.type)}</span>
                        <span>\${action.category || '未分类'}</span>
                    </div>
                    \${statusBtnHTML}
                    \${action.isActive ? \`<button class="delete-btn" title="从超级面板中移除此功能" onclick="deleteAction('\${action.id}')">✕</button>\` : ''}
                \`;
                
                container.appendChild(actionDiv);
            });
        }
        
        // 显示空状态
        function showEmptyState(icon, title, description) {
            const container = document.getElementById('actions-list');
            container.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-icon">\${icon}</div>
                    <div class="empty-title">\${title}</div>
                    <div class="empty-description">\${description}</div>
                </div>
            \`;
        }
        
        // 获取类型标签
        function getTypeLabel(type) {
            const labels = {
                'builtin': '内置',
                'custom': '自定义',
                'plugin': '插件',
                'dynamic': '动态'
            };
            return labels[type] || type;
        }
        
        // 按分类筛选
        function filterByCategory(category) {
            currentFilter = category;
            
            // 更新侧边栏活动状态
            document.querySelectorAll('.category-item').forEach(item => {
                item.classList.remove('active');
            });
            event.target.classList.add('active');
            
            renderActionsList();
        }
        
        // 删除功能
        async function deleteAction(actionId) {
            if (confirm('确定要从超级面板中移除这个功能吗？')) {
                try {
                    const success = await ipcRenderer.invoke('delete-super-panel-action', actionId);
                    if (success) {
                        // 更新本地功能状态
                        const action = allActions.find(a => a.id === actionId);
                        if (action) {
                            action.isActive = false;
                        }
                        renderActionsList();
                    } else {
                        alert('移除失败');
                    }
                } catch (error) {
                    alert('移除失败: ' + error.message);
                }
            }
        }
        
        // 添加功能到超级面板
        async function addAction(actionId) {
            try {
                const success = await ipcRenderer.invoke('add-super-panel-action', actionId);
                if (success) {
                    // 更新本地功能状态
                    const action = allActions.find(a => a.id === actionId);
                    if (action) {
                        action.isActive = true;
                    }
                    renderActionsList();
                } else {
                    alert('添加失败');
                }
            } catch (error) {
                alert('添加失败: ' + error.message);
            }
        }
        
        // 添加新功能
        function addNewAction() {
            ipcRenderer.invoke('open-add-plugin-dialog');
        }
        
        // 导入功能
        function importActions() {
            alert('导入功能即将支持');
        }
        
        // 导出功能
        function exportActions() {
            alert('导出功能即将支持');
        }
        
        // 关闭管理器
        function closeManager() {
            ipcRenderer.invoke('close-current-window');
        }
        
        // 窗口加载完成后初始化
        window.addEventListener('DOMContentLoaded', () => {
            initManager();
        });
    </script>
</body>
</html>
    `;
}

// 添加 IPC 处理：获取所有可用功能（包括已启用和未启用的）
ipcMain.handle('get-all-available-actions', async (event) => {
    try {
        console.log('获取所有可用功能...');
        
        // 1. 获取内置功能
        const builtinActions = await getBuiltinSuperPanelActions();
        console.log(`获取到内置功能: ${builtinActions.length}个`);
        
        // 2. 获取自定义功能
        const customActionsPath = path.join(app.getPath('userData'), 'custom-super-panel-actions.json');
        let customActions = [];
        if (fs.existsSync(customActionsPath)) {
            const data = fs.readFileSync(customActionsPath, 'utf8');
            customActions = JSON.parse(data);
            console.log(`获取到自定义功能: ${customActions.length}个`);
        }
        
        // 3. 获取插件功能
        let pluginActions = [];
        for (const [pluginName, actions] of superPanelRegistry) {
            console.log(`从插件获取功能: ${pluginName} (${actions.length}个)`);
            pluginActions = pluginActions.concat(actions.map(action => ({
                ...action,
                source: 'plugin',
                pluginName: pluginName
            })));
        }
        console.log(`获取到插件功能: ${pluginActions.length}个`);
        
        // 4. 合并所有功能并确保ID唯一
        const allActions = [...builtinActions, ...customActions, ...pluginActions];
        const uniqueActions = [];
        const seenIds = new Set();
        
        for (const action of allActions) {
            if (action && action.id && !seenIds.has(action.id)) {
                seenIds.add(action.id);
                uniqueActions.push(action);
            }
        }
        
        console.log(`获取到唯一功能: ${uniqueActions.length}个`);
        return uniqueActions;
    } catch (error) {
        console.error('获取所有可用功能失败:', error);
        return [];
    }
});

// 添加 IPC 处理：获取当前超级面板中激活的功能ID
ipcMain.handle('get-manager-active-action-ids', async (event) => {
    try {
        // 获取当前超级面板中的功能ID
        const settings = loadSettings();
        const activeIds = new Set();
        
        if (settings && settings.superPanelActions && Array.isArray(settings.superPanelActions)) {
            settings.superPanelActions.forEach(action => {
                if (action && action.id) {
                    activeIds.add(action.id);
                }
            });
        }
        
        console.log('当前激活的功能ID:', Array.from(activeIds));
        return Array.from(activeIds);
    } catch (error) {
        console.error('获取超级面板管理器中激活功能ID失败:', error);
        return [];
    }
});

// 添加 IPC 处理：添加功能到超级面板
ipcMain.handle('add-super-panel-action', async (event, actionId) => {
    try {
        console.log(`正在尝试添加功能: ${actionId}`);
        
        // 1. 获取所有可用功能
        const allBuiltinActions = await getBuiltinSuperPanelActions();
        console.log(`获取到内置功能: ${allBuiltinActions.length}个`);
        
        const allCustomActions = await getCustomSuperPanelActions();
        console.log(`获取到自定义功能: ${allCustomActions.length}个`);
        
        // 2. 尝试获取插件功能
        let pluginActions = [];
        for (const [pluginName, actions] of superPanelRegistry) {
            pluginActions = pluginActions.concat(actions);
        }
        console.log(`获取到插件功能: ${pluginActions.length}个`);
        
        // 3. 合并所有功能
        const allActions = [...allBuiltinActions, ...allCustomActions, ...pluginActions];
        console.log(`总功能数: ${allActions.length}个`);
        
        // 4. 查找要添加的功能
        const actionToAdd = allActions.find(action => action.id === actionId);
        
        if (!actionToAdd) {
            console.error(`未找到ID为 ${actionId} 的功能`);
            
            // 调试信息
            console.log('可用功能ID列表:');
            allActions.forEach(a => console.log(`- ${a.id}`));
            
            return false;
        }
        
        console.log(`找到功能: ${actionToAdd.title || actionToAdd.id}`);
        
        // 5. 获取当前设置
        const settings = loadSettings();
        if (!settings.superPanelActions) {
            settings.superPanelActions = [];
        }
        
        // 6. 检查功能是否已存在
        const exists = settings.superPanelActions.some(action => action.id === actionId);
        if (exists) {
            console.log(`功能 ${actionId} 已存在于超级面板中`);
            return true; // 已存在视为成功
        }
        
        // 7. 添加功能到超级面板
        settings.superPanelActions.push(actionToAdd);
        saveSettings(settings);
        
        console.log(`成功添加功能到超级面板: ${actionId}`);
        
        // 8. 直接通知超级面板更新
        if (superPanelWindow && !superPanelWindow.isDestroyed()) {
            console.log('向超级面板发送添加功能的更新通知');
            superPanelWindow.webContents.send('refresh-super-panel');
            
            // 同时发送更新后的功能列表
            superPanelWindow.webContents.send('super-panel-actions-updated', settings.superPanelActions);
        } else {
            console.log('超级面板窗口不存在，无法发送添加功能的更新');
        }
        
        return true;
    } catch (error) {
        console.error('添加功能到超级面板失败:', error);
        console.error(error.stack);
        return false;
    }
});

// 添加 IPC 处理：删除超级面板功能
ipcMain.handle('delete-super-panel-action', (event, actionId) => {
    try {
        console.log(`开始处理功能删除: ${actionId}`);
        
        // 获取当前设置
        const settings = loadSettings();
        if (!settings.superPanelActions) {
            console.log('超级面板功能列表为空');
            return false;
        }
        
        // 检查功能是否存在
        const initialLength = settings.superPanelActions.length;
        settings.superPanelActions = settings.superPanelActions.filter(action => action.id !== actionId);
        
        if (settings.superPanelActions.length === initialLength) {
            console.log(`未找到ID为 ${actionId} 的功能`);
            return false;
        }
        
        console.log(`已从设置中移除功能，剩余功能: ${settings.superPanelActions.length}个`);
        
        // 保存设置
        saveSettings(settings);
        
        // 立即通知超级面板更新
        if (superPanelWindow && !superPanelWindow.isDestroyed()) {
            console.log('向超级面板发送更新通知');
            superPanelWindow.webContents.send('refresh-super-panel');
            
            // 为了更可靠地更新，也发送功能列表
            superPanelWindow.webContents.send('super-panel-actions-updated', settings.superPanelActions);
        } else {
            console.log('超级面板窗口不存在，无法发送更新');
        }
        
        console.log(`成功从超级面板移除功能: ${actionId}`);
        return true;
    } catch (error) {
        console.error('从超级面板移除功能失败:', error);
        console.error(error.stack);
        return false;
    }
});

// 添加 IPC 处理：打开超级面板管理器
ipcMain.handle('open-super-panel-manager', () => {
    try {
        createSuperPanelManagerWindow();
        return true;
    } catch (error) {
        console.error('打开超级面板管理器失败:', error);
        return false;
    }
});

// 添加 IPC 处理：打开超级面板设置
ipcMain.handle('open-super-panel-settings', () => {
    try {
        createSuperPanelSettingsWindow();
        return true;
    } catch (error) {
        console.error('打开超级面板设置失败:', error);
        return false;
    }
});

// 添加 IPC 处理：获取内置功能列表
ipcMain.handle('get-builtin-actions', async () => {
    try {
        return await getBuiltinSuperPanelActions();
    } catch (error) {
        console.error('获取内置功能失败:', error);
        return [];
    }
});

// 添加 IPC 处理：获取当前激活的功能ID
ipcMain.handle('get-active-action-ids', async () => {
    try {
        const settings = loadSettings();
        const actions = settings.superPanelActions || [];
        return actions.map(action => action.id);
    } catch (error) {
        console.error('获取激活功能ID失败:', error);
        return [];
    }
});

// 添加 IPC 处理：批量添加功能到超级面板
ipcMain.handle('add-features-to-super-panel', async (event, features) => {
    try {
        console.log(`批量添加功能到超级面板: ${features.length}个`);
        
        // 获取当前设置
        const settings = loadSettings();
        if (!settings.superPanelActions) {
            settings.superPanelActions = [];
        }
        
        let addedCount = 0;
        
        // 遍历要添加的功能
        for (const feature of features) {
            // 检查功能是否已存在
            const exists = settings.superPanelActions.some(action => action.id === feature.id);
            if (!exists) {
                settings.superPanelActions.push(feature);
                addedCount++;
                console.log(`添加功能: ${feature.title} (${feature.id})`);
            } else {
                console.log(`功能已存在: ${feature.title} (${feature.id})`);
            }
        }
        
        if (addedCount > 0) {
            // 保存设置
            saveSettings(settings);
            console.log(`成功添加 ${addedCount} 个功能到超级面板`);
            
            // 通知超级面板更新
            if (superPanelWindow && !superPanelWindow.isDestroyed()) {
                console.log('向超级面板发送批量添加更新通知');
                superPanelWindow.webContents.send('refresh-super-panel');
                superPanelWindow.webContents.send('super-panel-actions-updated', settings.superPanelActions);
            }
        }
        
        return addedCount > 0;
    } catch (error) {
        console.error('批量添加功能到超级面板失败:', error);
        return false;
    }
});

// 创建超级面板设置的HTML内容
function createSuperPanelSettingsHtml() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>超级面板设置</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
            background: rgba(40, 44, 52, 0.95);
            color: #ffffff;
            user-select: none;
            border-radius: 12px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .settings-header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .settings-title {
            font-size: 16px;
            font-weight: 500;
            color: #ffffff;
        }
        
        .close-btn {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            font-size: 16px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .close-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }
        
        .settings-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        
        .settings-section {
            margin-bottom: 24px;
        }
        
        .section-title {
            font-size: 14px;
            font-weight: 500;
            color: #60a5fa;
            margin-bottom: 12px;
            border-bottom: 1px solid rgba(96, 165, 250, 0.3);
            padding-bottom: 4px;
        }
        
        .setting-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .setting-item:last-child {
            border-bottom: none;
        }
        
        .setting-label {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.9);
        }
        
        .setting-description {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.6);
            margin-top: 2px;
        }
        
        .setting-control {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .toggle {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
        }
        
        .toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.2);
            transition: .4s;
            border-radius: 12px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: #60a5fa;
        }
        
        input:checked + .slider:before {
            transform: translateX(20px);
        }
        
        .btn {
            background: rgba(96, 165, 250, 0.2);
            border: 1px solid rgba(96, 165, 250, 0.4);
            color: #60a5fa;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .btn:hover {
            background: rgba(96, 165, 250, 0.3);
            border-color: rgba(96, 165, 250, 0.6);
        }
        
        .btn-danger {
            background: rgba(239, 68, 68, 0.2);
            border-color: rgba(239, 68, 68, 0.4);
            color: #ef4444;
        }
        
        .btn-danger:hover {
            background: rgba(239, 68, 68, 0.3);
            border-color: rgba(239, 68, 68, 0.6);
        }
        
        .plugin-list {
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.02);
        }
        
        .plugin-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .plugin-item:last-child {
            border-bottom: none;
        }
        
        .plugin-info {
            flex: 1;
        }
        
        .plugin-name {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.9);
        }
        
        .plugin-features {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.6);
            margin-top: 2px;
        }
    </style>
</head>
<body>
    <div class="settings-header">
        <div class="settings-title">超级面板设置</div>
        <button class="close-btn" onclick="closeSettings()">✕</button>
    </div>
    
    <div class="settings-content">
        <div class="settings-section">
            <div class="section-title">基本设置</div>
            
            <div class="setting-item">
                <div>
                    <div class="setting-label">启用右键长按</div>
                    <div class="setting-description">长按右键显示超级面板</div>
                </div>
                <div class="setting-control">
                    <label class="toggle">
                        <input type="checkbox" id="enable-right-click" checked>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            
            <div class="setting-item">
                <div>
                    <div class="setting-label">长按延迟时间</div>
                    <div class="setting-description">右键长按触发时间（毫秒）</div>
                </div>
                <div class="setting-control">
                    <input type="number" id="right-click-delay" value="500" min="200" max="2000" 
                           style="width: 80px; padding: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 4px;">
                </div>
            </div>
            
            <div class="setting-item">
                <div>
                    <div class="setting-label">自动隐藏面板</div>
                    <div class="setting-description">失去焦点时自动隐藏面板</div>
                </div>
                <div class="setting-control">
                    <label class="toggle">
                        <input type="checkbox" id="auto-hide" checked>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-title">插件管理</div>
            
            <div class="setting-item">
                <div>
                    <div class="setting-label">已注册插件</div>
                    <div class="setting-description">显示在超级面板中的插件功能</div>
                </div>
                <div class="setting-control">
                    <button class="btn" onclick="refreshPlugins()">刷新</button>
                    <button class="btn" onclick="addNewPlugin()">添加插件</button>
                </div>
            </div>
            
            <div class="plugin-list" id="plugin-list">
                <div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.6);">
                    正在加载插件列表...
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-title">高级设置</div>
            
            <div class="setting-item">
                <div>
                    <div class="setting-label">导出配置</div>
                    <div class="setting-description">导出超级面板配置到文件</div>
                </div>
                <div class="setting-control">
                    <button class="btn" onclick="exportConfig()">导出</button>
                </div>
            </div>
            
            <div class="setting-item">
                <div>
                    <div class="setting-label">导入配置</div>
                    <div class="setting-description">从文件导入超级面板配置</div>
                </div>
                <div class="setting-control">
                    <button class="btn" onclick="importConfig()">导入</button>
                </div>
            </div>
            
            <div class="setting-item">
                <div>
                    <div class="setting-label">重置面板</div>
                    <div class="setting-description">清除所有自定义配置</div>
                </div>
                <div class="setting-control">
                    <button class="btn btn-danger" onclick="resetPanel()">重置</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        
        let registeredPlugins = [];
        
        // 初始化设置
        async function initSettings() {
            try {
                // 加载当前设置
                const settings = await ipcRenderer.invoke('get-settings');
                
                // 更新UI
                document.getElementById('enable-right-click').checked = settings.enableRightClickPanel !== false;
                document.getElementById('right-click-delay').value = settings.rightClickDelay || 500;
                document.getElementById('auto-hide').checked = true; // 默认启用自动隐藏
                
                // 加载插件列表
                await refreshPlugins();
                
            } catch (error) {
                console.error('初始化设置失败:', error);
            }
        }
        
        // 刷新插件列表
        async function refreshPlugins() {
            try {
                const actions = await ipcRenderer.invoke('get-super-panel-actions', '');
                const pluginMap = new Map();
                
                // 按插件名分组
                actions.forEach(action => {
                    if (action.source === 'plugin') {
                        const pluginName = action.pluginName || '未知插件';
                        if (!pluginMap.has(pluginName)) {
                            pluginMap.set(pluginName, []);
                        }
                        pluginMap.get(pluginName).push(action);
                    }
                });
                
                // 渲染插件列表
                const container = document.getElementById('plugin-list');
                
                if (pluginMap.size === 0) {
                    container.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.6);">暂无已注册的插件</div>';
                    return;
                }
                
                container.innerHTML = '';
                
                for (const [pluginName, actions] of pluginMap) {
                    const pluginDiv = document.createElement('div');
                    pluginDiv.className = 'plugin-item';
                    
                    pluginDiv.innerHTML = \`
                        <div class="plugin-info">
                            <div class="plugin-name">\${pluginName}</div>
                            <div class="plugin-features">\${actions.length} 个功能: \${actions.map(a => a.title).join(', ')}</div>
                        </div>
                        <div class="setting-control">
                            <button class="btn btn-danger" onclick="removePlugin('\${pluginName}')">移除</button>
                        </div>
                    \`;
                    
                    container.appendChild(pluginDiv);
                }
                
            } catch (error) {
                console.error('刷新插件列表失败:', error);
            }
        }
        
        // 保存设置
        async function saveSettings() {
            try {
                const settings = {
                    enableRightClickPanel: document.getElementById('enable-right-click').checked,
                    rightClickDelay: parseInt(document.getElementById('right-click-delay').value) || 500
                };
                
                await ipcRenderer.invoke('save-settings', settings);
                console.log('设置已保存');
                
            } catch (error) {
                console.error('保存设置失败:', error);
                alert('保存设置失败: ' + error.message);
            }
        }
        
        // 添加插件
        function addNewPlugin() {
            ipcRenderer.invoke('open-add-plugin-dialog');
        }
        
        // 移除插件
        async function removePlugin(pluginName) {
            if (confirm(\`确定要移除插件 "\${pluginName}" 的所有功能吗？\`)) {
                try {
                    await ipcRenderer.invoke('clear-super-panel-actions', pluginName);
                    await refreshPlugins();
                } catch (error) {
                    console.error('移除插件失败:', error);
                    alert('移除插件失败: ' + error.message);
                }
            }
        }
        
        // 导出配置
        function exportConfig() {
            alert('导出配置功能待实现');
        }
        
        // 导入配置
        function importConfig() {
            alert('导入配置功能待实现');
        }
        
        // 重置面板
        async function resetPanel() {
            if (confirm('确定要重置超级面板吗？这将清除所有自定义配置。')) {
                try {
                    await ipcRenderer.invoke('save-custom-super-panel-actions', []);
                    await refreshPlugins();
                    alert('面板已重置');
                } catch (error) {
                    console.error('重置面板失败:', error);
                    alert('重置失败: ' + error.message);
                }
            }
        }
        
        // 关闭设置
        function closeSettings() {
            saveSettings().then(() => {
                ipcRenderer.invoke('close-current-window');
            });
        }
        
        // 监听设置变化
        document.getElementById('enable-right-click').addEventListener('change', saveSettings);
        document.getElementById('right-click-delay').addEventListener('change', saveSettings);
        document.getElementById('auto-hide').addEventListener('change', saveSettings);
        
        // 初始化
        window.addEventListener('DOMContentLoaded', () => {
            initSettings();
        });
    </script>
</body>
</html>
    `;
}

// 添加 IPC 处理：获取所有超级面板功能
ipcMain.handle('get-all-super-panel-actions', async (event, selectedText) => {
    try {
        console.log('🎯 获取所有超级面板功能，选中文本:', selectedText);
        
        let allActions = [];
        
        // 1. 获取插件注册的功能
        for (const [pluginName, actions] of superPanelRegistry) {
            console.log(`📦 加载插件功能: ${pluginName} (${actions.length}个)`);
            allActions = allActions.concat(actions.map(action => ({
                ...action,
                source: 'plugin',
                pluginName: pluginName
            })));
        }
        
        // 2. 获取持久化的自定义功能
        const customActions = await getCustomSuperPanelActions();
        allActions = allActions.concat(customActions);
        
        // 3. 获取内置功能
        const builtinActions = await getBuiltinSuperPanelActions();
        allActions = allActions.concat(builtinActions);
        
        // 4. 获取动态功能（基于选中内容）
        const dynamicActions = await getDynamicSuperPanelActions(selectedText);
        allActions = allActions.concat(dynamicActions);
        
        console.log(`🔧 总共加载功能: ${allActions.length}个`);
        
        // 按类型和优先级排序
        allActions.sort((a, b) => {
            const priorityMap = { dynamic: 1, plugin: 2, custom: 3, builtin: 4 };
            return (priorityMap[a.type] || 5) - (priorityMap[b.type] || 5);
        });
        
        return allActions;
    } catch (error) {
        console.error('获取所有超级面板功能失败:', error);
        return [];
    }
});



// 添加 IPC 处理：获取可用的自定义功能
ipcMain.handle('get-available-custom-actions', async () => {
    try {
        // 这里可以返回一些预定义的自定义功能模板
        // 例如系统工具、网络工具等
        return [
            {
                id: 'custom-calculator',
                title: '计算器',
                description: '打开系统计算器',
                icon: '🧮',
                type: 'custom',
                category: '系统工具',
                command: 'open-app',
                args: { app: 'calc.exe' }
            },
            {
                id: 'custom-notepad',
                title: '记事本',
                description: '打开记事本',
                icon: '📝',
                type: 'custom',
                category: '系统工具',
                command: 'open-app',
                args: { app: 'notepad.exe' }
            },
            {
                id: 'custom-google-search',
                title: 'Google搜索',
                description: '使用Google搜索选中内容',
                icon: '🔍',
                type: 'custom',
                category: '网络工具',
                command: 'search-web',
                args: { engine: 'google' }
            }
        ];
    } catch (error) {
        console.error('获取可用自定义功能失败:', error);
        return [];
    }
});

// 监听输入框活动状态
ipcMain.handle('notify-input-active', async (event, isActive) => {
    hasActiveInput = isActive;
    console.log('🔍 输入框活动状态更新:', isActive ? '活动' : '非活动');
    return true;
});
