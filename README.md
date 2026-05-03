# 三人聚智效率工具 (SanRenJZ Tools)

一款基于 Electron 的高效插件化桌面工具平台，提供快速搜索、超级面板和自动化功能。

## ✨ 核心特性

- **🚀 全局快速启动**：支持 `Ctrl+Space` 全局快捷键，随时唤醒
- **🔍 智能搜索窗口**：快速搜索并执行插件功能
- **⚡ 超级面板**：`Ctrl+Alt+P` 一键访问常用功能（**新功能**）
- **🔌 插件化架构**：支持 HTML 和 JavaScript 插件开发
- **📌 窗口钉住功能**：`Ctrl+D` 快捷键钉住窗口，提升工作效率
- **🔄 热重载开发**：支持插件热重载，开发体验友好
- **💾 数据持久化**：完善的插件数据存储系统
- **🎯 自动化粘贴**：文本片段自动粘贴到活动窗口
- **🎨 图标支持**：插件支持自定义图标，美观易识别
- **🔗 超级面板集成**：所有插件功能均可添加到超级面板

## 🛠 技术架构

```
sanrenjz-tools/
├── main.js                     # 主进程 - 应用启动和窗口管理
├── index.html                  # 主界面 - 插件列表和管理
├── search-window.html           # 搜索窗口 - 快速搜索界面
├── super-panel.html             # 超级面板 - 快速功能访问（新增）
├── package.json                 # 项目配置和依赖管理
├── custom-super-panel-actions-example.json  # 超级面板配置示例
├── app/
│   ├── software_manager.js     # 插件管理器 - 核心插件系统
│   └── software/               # 插件目录
│       ├── sanrenjz-tools-text/         # 文本片段助手插件
│       ├── sanrenjz.tools-ai/           # AI助手插件
│       ├── sanrenjz-tools-password/     # 密码管理插件
│       └── sanrenjz-tools-download_plugin/ # 下载管理插件
└── build/                      # 构建配置和图标资源
```

## 🚀 快速开始

### 系统要求

- **Node.js** 16.0 或更高版本
- **Windows 10/11**、**macOS** 或 **Linux**
- **内存** 512MB 以上

### 安装步骤

1. **克隆仓库**
```powershell
git clone https://github.com/yuhanbo758/sanrenjz-tools.git
cd sanrenjz-tools
```

2. **安装依赖**
```powershell
npm install
```

3. **启动开发模式**
```powershell
npm run dev
```

4. **构建应用**
```powershell
# Windows 构建
npm run build-win

# 全平台构建
npm run build-all
```

## 📋 可用脚本

| 命令 | 说明 |
|------|------|
| `npm start` | 启动应用 |
| `npm run dev` | 开发模式（带调试） |
| `npm run build-win` | 构建 Windows 版本 |
| `npm run build-mac` | 构建 macOS 版本 |
| `npm run build-linux` | 构建 Linux 版本 |
| `npm run build-all` | 构建全平台版本 |
| `npm run clean` | 清理构建文件 |
| `npm run rebuild` | 完整重建项目 |

## 🎯 主要功能

### 1. 搜索窗口 (`Ctrl+Space`)
- **智能搜索**：快速查找插件功能和文本片段
- **键盘导航**：方向键选择，回车执行
- **失焦隐藏**：自动隐藏保持整洁
- **钉住功能**：`Ctrl+D` 保持窗口显示

### 2. 超级面板 (`Ctrl+Alt+P`) - **新功能亮点**
- **一键访问**：最常用功能快速启动
- **插件集成**：所有插件功能可添加到面板
- **自定义布局**：拖拽排序个性化定制
- **分类管理**：按功能类型智能分组
- **图标显示**：美观的视觉界面

#### 超级面板功能类型
- **🔐 密码生成**：简单密码、强密码、超强密码
- **⏰ 时间工具**：当前时间、时间戳、UUID生成
- **🖥️ 系统工具**：计算器、记事本、文件管理器
- **🔌 插件功能**：文本片段、AI助手、密码管理等

### 3. 插件生态系统
- **文本片段助手**：Markdown文本快速插入和管理
- **AI智能助手**：对话分析和文本处理
- **密码管理器**：安全加密的密码存储
- **下载管理器**：高效的文件下载工具
- **自动扩展**：新插件自动集成到超级面板

### 4. 智能自动化
- **焦点管理**：操作完成后自动恢复到原应用
- **剪贴板同步**：无缝的复制粘贴体验
- **自动插入**：文本内容直接插入到活动窗口

## 🔌 插件开发指南

### 插件基本结构

```
my-plugin/
├── plugin.json      # 插件配置文件（必需）
├── index.html       # 主界面文件（HTML插件）
├── preload.js       # 预加载脚本（可选）
├── logo.ico         # 插件图标（推荐，支持超级面板显示）
└── assets/          # 资源文件目录（可选）
```

### plugin.json 配置文件

```json
{
  "pluginName": "我的插件",
  "description": "插件功能描述",
  "version": "1.0.0",
  "author": "作者姓名",
  "category": "工具分类",
  "main": "index.html",
  "logo": "logo.ico",
  "preload": "preload.js",
  "features": [
    {
      "code": "feature-code",
      "explain": "功能说明",
      "cmds": ["触发关键词1", "触发关键词2"],
      "icon": "logo.ico",                                 
    }
  ],
  "pluginSetting": {
    "height": 600,
    "width": 800,
    "single": true
  }
}
```

### 开发模式

```powershell
# 带调试模式启动
npm run dev

# 清理项目
npm run clean

# 完整重建
npm run rebuild
```

## 📦 打包发布

### 单平台打包

```powershell
# Windows 版本
npm run build-win

# macOS 版本
npm run build-mac

# Linux 版本
npm run build-linux
```

### 多平台打包

```powershell
# 所有平台
npm run build-all
```

打包后的文件将输出到 `dist/` 目录。

## 🎯 核心功能

### 1. 全局快速启动

- **默认快捷键**：`Ctrl + Space`
- **智能定位**：搜索窗口在鼠标附近显示
- **失焦隐藏**：点击其他地方自动隐藏
- **可自定义**：支持修改全局快捷键

### 2. 超级面板 🆕

- **快捷键**：`Ctrl + Alt + P`
- **功能分类**：密码生成、时间工具、系统工具等
- **插件集成**：所有插件功能均可添加
- **拖拽排序**：支持自定义功能排列

#### 内置功能

| 分类 | 功能 | 描述 |
|------|------|------|
| 密码生成 | 简单密码 | 8位无特殊字符密码 |
| 密码生成 | 强密码 | 16位包含特殊字符 |
| 密码生成 | 超强密码 | 24位超强安全密码 |
| 时间工具 | 当前时间 | 获取并复制当前时间 |
| 时间工具 | 时间戳 | 获取并复制时间戳 |
| 工具 | UUID | 生成并复制UUID |
| 系统工具 | 计算器 | 打开系统计算器 |
| 系统工具 | 记事本 | 打开记事本 |
| 系统工具 | 文件管理 | 打开文件资源管理器 |

### 3. 插件系统

#### 内置插件

- **📝 文本片段助手**：快速插入常用文本模板
- **🤖 AI助手**：智能对话和文本分析
- **🔐 密码管理器**：安全的密码存储和生成
- **📥 下载管理器**：文件下载和管理工具

#### 插件特性

- **热重载**：开发时支持实时重载
- **数据持久化**：完善的数据存储系统
- **超级面板集成**：一键添加到快速访问面板
- **自定义图标**：支持 .ico 文件和 emoji

### 4. 窗口管理

- **钉住功能**：`Ctrl + D` 钉住窗口
- **系统托盘**：最小化到系统托盘
- **智能焦点**：自动恢复到原应用程序
- **多窗口支持**：主窗口、搜索窗口、超级面板

## 🔧 配置选项

### 快捷键设置

```json
{
  "globalHotkey": "Ctrl+Space",
  "pinHotkey": "Ctrl+D",
  "superPanelHotkey": "Ctrl+Alt+P"
}
```

### 系统设置

- **开机自启动**：可选择是否开机自动启动
- **右键长按面板**：启用右键长按显示超级面板
- **插件数据路径**：自定义插件数据存储位置

## 🔌 插件开发

### 插件结构

```
sanrenjz-tools-插件名/
├── plugin.json          # 插件配置文件（必需）
├── index.html           # 主界面文件（必需）
├── preload.js          # 预加载脚本（必需）
├── logo.ico            # 插件图标（必需）
└── README.md           # 说明文档（推荐）
```

### 配置文件示例

```json
{
  "pluginName": "示例插件",
  "description": "这是一个示例插件",
  "version": "1.0.0",
  "author": "开发者",
  "main": "index.html",
  "logo": "logo.ico",
  "preload": "preload.js",
  "features": [
    {

      "code": "my-feature",
      "explain": "功能说明",
      "cmds": ["触发关键词1", "触发关键词2"],
      "icon": "logo.ico",
      "platform": ["win32", "darwin", "linux"],
      "mode": "list",
      "superPanel": true,
      "description": "超级面板中显示的描述",
      "category": "插件功能",
      "code": "example-feature",
      "explain": "示例功能",
      "cmds": ["示例", "example"],
      "icon": "logo.ico",
      "superPanel": true,
      "category": "工具",
      "priority": 10
    }
  ],
  "pluginSetting": {
    "height": 600,
    "width": 800,
    "single": true
    "width": 1000,
    "height": 680,
    "single": true,
    "autoHideMenuBar": true
  }
}
```

### 超级面板集成（新特性）

插件功能将自动注册到超级面板系统：

```javascript
// preload.js 中的超级面板集成
window.exports = {
    "my-feature": {
        mode: "list",
        args: {
            enter: (action, callbackSetList) => {
                // 功能执行逻辑
                console.log('超级面板执行功能:', action);
            }
        }
    }
};
```

### HTML 插件开发

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>我的插件</title>
    <style>
        body { 
            font-family: 'Microsoft YaHei', Arial, sans-serif; 
            padding: 20px;
            background: #f5f5f5;
        }
        .container { 
            max-width: 100%; 
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        button { 
            padding: 10px 20px; 
            margin: 5px;
            background: #007acc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background: #005999;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>插件界面</h2>
        <button onclick="handleAction()">执行操作</button>
        <div id="result"></div>
    </div>

    <script>
        // 获取插件配置信息
        console.log('插件配置:', window.pluginConfig);
        console.log('插件路径:', window.pluginPath);
        
        function handleAction() {
            // 使用插件API
            const { ipcRenderer } = require('electron');
            
            // 复制文本到剪贴板
            ipcRenderer.invoke('handle-content-insertion', {
                content: '处理后的内容',
                type: 'text'
            });
            
            // 显示结果
            document.getElementById('result').innerHTML = '操作完成！';
            
            // 3秒后自动关闭插件
            setTimeout(() => {
                ipcRenderer.invoke('close-plugin-window', window.pluginConfig.pluginName);
            }, 3000);
        }
    </script>
</body>
</html>
```

### preload.js 预加载脚本

```javascript
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// 插件存储API
window.services = {
    // 数据存储
    getStorageItem: (key) => {
        return ipcRenderer.sendSync('plugin-storage-get', '插件名称', key);
    },
    
    setStorageItem: (key, value) => {
        return ipcRenderer.sendSync('plugin-storage-set', '插件名称', key, value);
    },
    
    removeStorageItem: (key) => {
        return ipcRenderer.sendSync('plugin-storage-remove', '插件名称', key);
    },
    
    // 文件对话框
    selectFile: () => {
        return ipcRenderer.sendSync('show-open-dialog', {
            title: '选择文件',
            properties: ['openFile']
        });
    },
    
    // 内容插入
    insertContent: (content) => {
        return ipcRenderer.invoke('handle-content-insertion', {
            content: content,
            type: 'text'
        });
    }
};

// 超级面板功能导出
window.exports = {
    "功能代码": {
        mode: "list", // 或 "none"
        args: {
            enter: (action, callbackSetList) => {
                // 执行功能逻辑
                if (callbackSetList) {
                    callbackSetList([
                        { title: '选项1', description: '描述1' },
                        { title: '选项2', description: '描述2' }
                    ]);
                }
            },
            search: (action, searchWord, callbackSetList) => {
                // 搜索功能逻辑
            },
            select: (action, itemData) => {
                // 选择项目的处理逻辑
            }
        }
    }
};
```

## 🔧 插件API参考

### 数据存储API

```javascript
// 同步存储API
const { ipcRenderer } = require('electron');

// 保存数据
const success = ipcRenderer.sendSync('plugin-storage-set', 'pluginName', 'key', value);

// 获取数据  
const data = ipcRenderer.sendSync('plugin-storage-get', 'pluginName', 'key');

// 删除数据
const success = ipcRenderer.sendSync('plugin-storage-remove', 'pluginName', 'key');
```

### 窗口控制API

```javascript
// 窗口管理
await ipcRenderer.invoke('toggle-plugin-pin-window', 'pluginName');      // 切换钉住
await ipcRenderer.invoke('minimize-plugin-window', 'pluginName');        // 最小化
await ipcRenderer.invoke('maximize-plugin-window', 'pluginName');        // 最大化
await ipcRenderer.invoke('close-plugin-window', 'pluginName');           // 关闭
```

### 系统文件对话框

```javascript
// 文件选择
const filePaths = ipcRenderer.sendSync('show-open-dialog', {
    title: '选择文件',
    filters: [{ name: 'Text Files', extensions: ['txt', 'md'] }],
    properties: ['openFile', 'multiSelections']
});

// 保存文件
const savePath = ipcRenderer.sendSync('show-save-dialog', {
    title: '保存文件',
    defaultPath: 'untitled.txt'
});
```

### 内容插入API

```javascript
// 自动插入内容到活动窗口
await ipcRenderer.invoke('handle-content-insertion', {
    content: '要插入的文本内容',
    type: 'text'
});
```

## 📦 内置插件介绍

### 1. 余汉波文本片段助手 📝
- **功能**：管理和快速插入Markdown文本片段
- **触发词**：`文本片段`、`超级文本`、`余汉波文本片段助手`
- **超级面板功能**：
  - 文本片段浏览和管理
  - 快速访问常用片段
  - 直接插入选定片段
- **特性**：
  - 支持多文件夹扫描
  - 智能文本预览
  - 自动粘贴到活动窗口
  - 设置管理界面

### 2. 余汉波AI助手 🤖
- **功能**：AI对话和文本分析
- **触发词**：`ai`、`AI助手`、`GPT`
- **超级面板功能**：一键启动AI助手
- **特性**：
  - 支持多种AI模型
  - 选中文本分析
  - 对话历史管理
  - 自定义API配置

### 3. 密码管理工具 🔐
- **功能**：安全的密码存储和生成
- **超级面板功能**：快速访问密码管理器
- **特性**：
  - 密码加密存储
  - 随机密码生成
  - 快速复制功能
  - 分类管理

### 4. 下载管理插件 📦
- **功能**：文件下载和管理
- **超级面板功能**：启动下载管理器
- **特性**：
  - 多线程下载
  - 下载进度监控
  - 文件分类管理

### 5. AI 屏幕翻译插件 🖼️
- **功能**：文本翻译与截图 OCR 翻译
- **触发词**：`翻译`、`文本翻译`、`截图翻译`、`OCR翻译`
- **超级面板功能**：一键启动文本翻译或截图翻译
- **特性**：
  - 自动读取剪贴板文本并翻译
  - 打开截图翻译时自动清空上次翻译结果
  - 打开截图翻译时自动读取剪贴板最后一张图片并识别翻译

### 6. AI 语音输入法插件 🎙️
- **功能**：按住右 Ctrl 录音，松开后自动转写并插入到当前输入位置
- **触发词**：`语音输入`、`Voice Input`、`Speech`、`AI语音`
- **超级面板功能**：打开语音输入设置，配置模型和提示词场景
- **特性**：
  - 支持 Google Gemini、阿里通义千问（Qwen）和硅基流动 TeleAI/TeleSpeechASR
  - 支持分别配置不同服务的 API Key
  - 硅基流动模式通过 `https://api.siliconflow.cn/v1/audio/transcriptions` 完成语音转文本

## ⚙️ 配置选项

### 应用配置
应用配置文件位于：`%USERPROFILE%\AppData\Roaming\sanrenjz-tools\settings.json`

```json
{
  "globalHotkey": "Ctrl+Space",      // 搜索窗口快捷键
  "autoStart": false,                // 开机自启动
  "pinHotkey": "Ctrl+D",            // 窗口钉住快捷键
  "superPanelHotkey": "Ctrl+Alt+P"  // 超级面板快捷键（新增）
}
```

### 超级面板配置
超级面板配置文件：`%USERPROFILE%\AppData\Roaming\sanrenjz-tools\custom-super-panel-actions.json`

支持自定义功能、内置功能和插件功能的组合配置。

### 插件数据存储
插件数据存储目录：`%USERPROFILE%\AppData\Roaming\sanrenjz-tools\plugin-data\`

每个插件都有独立的数据存储空间，确保数据隔离和安全。

## 🏗 构建配置

项目支持多平台构建，配置详见 `package.json` 中的 `build` 部分：

- **Windows**: NSIS 安装程序，支持 x64 架构
- **macOS**: DMG 镜像和 ZIP 包，支持 Intel 和 Apple Silicon
- **Linux**: tar.gz 归档包

构建产物输出到 `dist/` 目录。

## 🔍 故障排除

### 常见问题

1. **全局快捷键无效**
   - 检查是否与其他软件冲突
   - 尝试在设置中更改快捷键

2. **插件无法加载**
   - 确认 `plugin.json` 格式正确
   - 检查插件目录权限
   - 验证插件图标文件存在

3. **超级面板功能无响应**
   - 检查插件是否正确注册
   - 查看控制台错误信息
   - 重新启动应用程序

4. **文本片段无法粘贴**
   - 确认目标应用程序支持文本输入
   - 检查剪贴板权限
   - 验证焦点管理是否正常

5. **图标不显示**
   - 确认插件目录下有 `logo.ico` 或 `logo.png` 文件
   - 检查图标文件格式和大小
   - 重新注册插件功能

### 调试模式

启动调试模式查看详细日志：
```powershell
npm run dev
```

按 `F12` 打开开发者工具查看控制台信息。

## 🤝 贡献指南

1. **Fork** 本仓库
2. **创建**特性分支：`git checkout -b feature/amazing-feature`
3. **提交**更改：`git commit -m 'Add amazing feature'`
4. **推送**分支：`git push origin feature/amazing-feature`
5. **提交** Pull Request

### 开发规范

- 使用 ESLint 进行代码规范检查
- 提交前运行 `npm test` 进行测试
- 遵循插件开发规范
- 添加适当的注释和文档
- 确保超级面板集成功能正常

### 插件开发规范

- 必须包含 `plugin.json` 配置文件
- 推荐提供 `logo.ico` 图标文件
- 实现 `window.exports` 接口以支持超级面板
- 使用统一的错误处理机制
- 遵循数据存储API规范

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源协议。

## 👨‍💻 作者信息

**余汉波** - 全栈开发工程师

- **GitHub**: [@yuhanbo758](https://github.com/yuhanbo758)
- **Email**: yuhanbo758@sanrenjz.com
- **Website**: [三人聚智](https://www.sanrenjz.com)

## 🌐 相关链接

- 🏠 [项目主页](https://www.sanrenjz.com)
- 📚 [在线文档](https://wd.sanrenjz.com)
- 🛒 [插件商店](https://jy.sanrenjz.com)
- 🐛 [问题反馈](https://github.com/yuhanbo758/sanrenjz-tools/issues)
- 💬 [讨论区](https://github.com/yuhanbo758/sanrenjz-tools/discussions)

## 🙏 致谢

感谢所有为本项目贡献代码和想法的开发者们！

特别感谢社区用户对超级面板功能的建议和反馈，让工具变得更加实用和高效。

---

**⭐ 如果这个项目对您有帮助，请给它一个 Star！** 

## 联系我们

![三码合一](https://gdsx.sanrenjz.com/image/sanrenjz_yuhanbolh_yuhanbo758.png?imageSlim&t=1ab9b82c-e220-8022-beff-e265a194292a)

![余汉波打赏码](https://gdsx.sanrenjz.com/PicGo/%E6%89%93%E8%B5%8F%E7%A0%81500.png)

### 超级面板集成

插件功能可以通过以下方式集成到超级面板：

1. **配置 plugin.json**：
   ```json
   {
     "superPanel": true,
     "category": "工具分类",
     "priority": 10
   }
   ```

2. **导出功能函数**：
   ```javascript
   // preload.js
   window.pluginExports = {
     executeFeature: async () => {
       // 功能实现
     }
   };
   ```

### 开发指南

详细的插件开发指南请参考根目录下的 AI 提示词文档，该文档包含完整的插件开发规范和示例代码，可直接用于 AI 辅助开发。

## 🛠 故障排除

### 常见问题

1. **应用无法启动**
   ```powershell
   # 重新安装依赖
   npm run clean
   npm install
   npm start
   ```

2. **快捷键不生效**
   - 检查是否有其他应用占用快捷键
   - 在设置中修改为其他快捷键组合
   - 重启应用程序

3. **插件加载失败**
   - 检查插件目录结构
   - 验证 plugin.json 格式
   - 查看控制台错误信息

### 重置应用

```powershell
# 完整重置
npm run clean
rm -rf node_modules
npm install
npm start
```

## 📁 项目结构

```
sanrenjz-tools/
├── 📄 main.js                     # Electron 主进程
├── 🌐 index.html                  # 主界面
├── 🔍 search-window.html           # 搜索窗口
├── ⚡ super-panel.html             # 超级面板
├── 📦 package.json                 # 项目配置
├── 📋 custom-super-panel-actions-example.json # 超级面板配置
├── 📂 app/
│   ├── 🔧 software_manager.js     # 插件管理器
│   └── 📂 software/               # 插件目录
│       ├── 📝 sanrenjz-tools-text/
│       ├── 🤖 sanrenjz.tools-ai/
│       ├── 🔐 sanrenjz-tools-password/
│       └── 📥 sanrenjz-tools-download_plugin/
├── 📂 build/                      # 构建配置
│   ├── 🖼️ icon.ico               # Windows 图标
│   ├── 🖼️ icon.icns              # macOS 图标
│   ├── 🖼️ icon.png               # Linux 图标
│   └── 📄 entitlements.mac.plist  # macOS 权限配置
├── 📖 README.md                   # 项目说明
└── 📖 sanrenjz-tools插件开发AI提示词.md  # 插件开发 AI 辅助提示词
```

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📞 技术支持

- **GitHub Issues**：[提交问题](https://github.com/yuhanbo758/sanrenjz-tools/issues)
- **邮箱支持**：yuhanbo758@sanrenjz.com
- **项目主页**：https://github.com/yuhanbo758/sanrenjz-tools

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者和用户！

---

**三人聚智效率工具** - 让效率工具触手可及 🚀

