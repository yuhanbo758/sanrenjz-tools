# AGENTS.md

> 本文件由 OpenCode 维护，帮助 AI 理解项目结构、规范和当前状态。
> 请将此文件提交到版本控制，并在每次重要变更后更新。

---

## 项目概述

**项目名称：** sanrenjz-tools（三人聚智-效率工具）
**项目描述：** 基于 Electron 的桌面效率工具平台，支持插件化架构，内置快捷搜索、超级面板、AI 助手、密码管理等功能，并提供程序小店实现插件在线安装。
**当前版本：** 2.8.0
**当前阶段：** 稳定迭代

---

## 技术栈

| 类别 | 技术/工具 |
|------|----------|
| 语言 | JavaScript（原生，无 TypeScript） |
| 框架 | Electron 25（Chromium + Node.js） |
| 前端渲染 | 原生 HTML / CSS / JavaScript（无框架，无打包工具） |
| 布局方案 | CSS 变量 + Flexbox / Grid |
| IPC 通信 | `ipcRenderer` / `ipcMain`，插件推荐 `contextBridge.exposeInMainWorld` |
| 远程 API | `@electron/remote` ^2.1.2（部分插件兼容旧方式） |
| HTTP 客户端 | axios ^1.6.5（插件侧）、`global.fetch` / Node.js `https`（主进程侧） |
| 自动更新 | electron-updater ^6.8.3（GitHub Releases + 对象存储双源） |
| 打包工具 | electron-builder 23.6.0（NSIS / DMG / AppImage） |
| CI/CD | GitHub Actions（`.github/workflows/release.yml`，推送 `main` 自动递增 minor 版本并构建 Windows/macOS 发布到 GitHub Releases） |
| 数据存储 | JSON 文件（`userData/settings.json`、`userData/plugin-data/<name>-storage.json`） |
| 安全存储 | Electron `safeStorage` API（账号 Token 加密存储） |
| 系统集成 | PowerShell 动态脚本（右键/中键长按监控、zip 解压） |

---

## 目录结构

```
sanrenjz-tools/
├── .github/
│   └── workflows/
│       └── release.yml           # CI/CD：推送 main 后自动递增版本、构建 Windows/macOS 并发布到 GitHub Releases
├── app/
│   ├── software_manager.js       # PluginManager 核心类（插件生命周期、窗口管理、存储）
│   └── software/                 # 所有插件目录（开发环境插件存放路径）
│       ├── obsidian-surfing/
│       ├── sanrenjz-tools-ai_screen_trans/
│       ├── sanrenjz-tools-cut_image/
│       ├── sanrenjz-tools-download_plugin/
│       ├── sanrenjz-tools-password/
│       ├── sanrenjz-tools-speech_input/
│       ├── sanrenjz-tools-text/
│       ├── sanrenjz.tools-ai/
│       └── sanrenjz.tools-multi_wechat/
├── build/                        # 构建资源（图标、macOS 权限声明）
├── dist/                         # 构建输出（.gitignore）
├── index.html                    # 主窗口渲染页面（插件列表、设置、账号、小店、更新）
├── search-window.html            # 快捷搜索窗口（全局热键 Alt+Space 呼出）
├── super-panel.html              # 超级面板窗口（右键/中键长按触发）
├── main.js                       # Electron 主进程入口（所有主进程逻辑集中于此）
├── package.json                  # 项目配置、依赖、electron-builder 配置
├── AGENTS.md                     # 本文件
└── README.md
```

### 插件目录规范（`app/software/<plugin-name>/`）

每个插件必须包含：

| 文件 | 说明 |
|------|------|
| `plugin.json` | 插件元信息（name、version、features、superPanel、width/height 等） |
| `index.html` | 插件主界面（内联 CSS+JS 推荐，单文件） |
| `preload.js` | 安全 API 桥接（`contextBridge.exposeInMainWorld('electronAPI', {...})`） |
| `logo.ico` | 插件图标（显示在主界面插件列表） |

---

## 核心模块说明

| 模块 | 路径 | 职责 |
|------|------|------|
| 主进程 | `main.js` | 应用生命周期、三个 BrowserWindow 管理、全局快捷键、系统托盘、IPC 路由、自动更新、程序小店内置浏览器、插件 zip 安装、safeStorage 账号管理 |
| 插件管理器 | `app/software_manager.js` | `PluginManager` 类——插件目录扫描、插件窗口生命周期（打开/关闭/置顶/保活）、插件数据持久化、动态特性注册、辅助窗口管理 |
| 主界面 | `index.html` | 插件列表渲染、设置页、账号登录/会员、程序小店入口、应用更新 UI（~2800 行，纯原生） |
| 快捷搜索 | `search-window.html` | 全局热键呼出的搜索框，模糊匹配插件名/功能名并启动（~880 行） |
| 超级面板 | `super-panel.html` | 鼠标右键/中键长按触发的快速操作面板，支持自定义动作 |

### BrowserWindow 配置要点

| 窗口 | 特性 |
|------|------|
| `mainWindow` | 常规主窗口，`nodeIntegration: false`，通过 `@electron/remote` 或 IPC 通信 |
| `searchWindow` | `frame: false`，`alwaysOnTop: true`，失焦自动隐藏 |
| `superPanelWindow` | `frame: false`，`alwaysOnTop: true`，`transparent: true` |
| 插件窗口 | 由 `PluginManager` 按 `plugin.json` 配置创建；可选 `nodeIntegration: true`（旧式）或 `contextBridge`（推荐） |

---

## 编码规范

### HTML/CSS
- 使用 Flexbox / Grid 布局，适配 `plugin.json` 中定义的 `width`/`height`。
- 推荐内联样式与脚本（单文件插件），减少外部依赖。
- CSS 变量定义主题色，方便全局调整。

### JavaScript
- 前端页面通过 `window.electronAPI` 调用底层能力（`contextBridge` 暴露）。
- `preload.js` 中**仅暴露业务必要的方法**，禁止暴露完整 `ipcRenderer` 对象。
- 插件生命周期钩子通过 `window.exports` 定义：`enter`、`search`、`select`。
- 主进程文件 `main.js` 集中所有 IPC handler，命名约定为 `kebab-case`（如 `plugin-storage-get`）。

### 插件命名
- 插件目录：`sanrenjz-tools-<name>`（kebab-case）
- Feature Code：唯一标识符，建议与插件目录名一致。

### 常用 IPC API

| IPC Channel | 说明 |
|-------------|------|
| `plugin-storage-get` / `set` / `remove` | 插件数据持久化读写 |
| `hide-plugin-window` | 隐藏当前插件窗口 |
| `close-plugin-window` | 关闭当前插件窗口 |
| `show-open-dialog` | 打开系统文件选择对话框 |
| `copy` | 复制文本到剪贴板 |
| `insert` | 插入文本到光标位置（模拟粘贴） |

---

## 分支策略

- **主分支：** `main`（始终可发布）
- **发布方式：** 推送到 `main` 触发 GitHub Actions 自动递增 minor 版本、构建并发布到 GitHub Releases
- **本地发布：** `npm run release-win`（Windows 安装包 + 上传 GitHub Releases）

---

## 插件分发与更新

- 普通用户更新源：GitHub Releases（`yuhanbo758/sanrenjz-tools`）
- tools 会员更新源：`https://xz.sanrenjz.com/Download/tools/`（generic feed）
- 程序小店：内置浏览器打开 `https://shop.sanrenjz.com/tools`，下载的 zip 插件自动解压安装
- 打包后插件路径：优先 `resources/app/software`，开发环境为 `app/software`（由 `getPluginInstallDir()` 统一解析）
- 单实例保护：`app.requestSingleInstanceLock()`，二次启动自动聚焦已有主窗口

---

## 调试方法

```bash
npm run dev        # 启动应用，开启 Node.js 调试端口 9229
npm start          # 以 UTF-8 编码正常启动
```

- 插件窗口内可使用 DevTools（右键 → 检查，或 `plugin.json` 设置 `openDevTools: true`）
- 主进程日志输出到终端
- 确保 `plugin.json` 的 `features` 和 `superPanel` 字段配置正确

---

## 安全性注意事项

- 不在 `preload.js` 中暴露完整 `ipcRenderer`，仅暴露具体业务方法
- 账号 Token 使用 `safeStorage` 加密存储（`userData/account-token.bin`）
- 插件 zip 安装通过 `will-download` 事件拦截，限制在已知 session 中
- 内置浏览器（程序小店）使用独立 `persist:sanrenjz-tools-shop` session 隔离

---

## 重要决策记录（ADR）

### ADR-001：插件架构设计

- **决策：** 每个插件运行在独立 BrowserWindow，相互隔离
- **背景：** 插件崩溃不影响主应用，权限可独立控制
- **结果：** `PluginManager` 统一管理所有插件窗口生命周期

### ADR-002：无前端构建工具

- **决策：** 主界面（index.html、search-window.html、super-panel.html）均为原生 HTML/JS，不使用 Vite/Webpack
- **背景：** Electron 应用直接加载本地文件，无需打包，降低复杂度
- **结果：** 页面为大型单文件（2000~3000 行），调试直接，无构建步骤

### ADR-003：双更新源设计

- **决策：** 普通用户走 GitHub Releases，会员走对象存储 generic feed
- **背景：** GitHub 在国内访问不稳定，会员需要更快的下载速度
- **结果：** `electron-updater` 配置两套 publish 配置，运行时按账号类型切换

### ADR-004：主分支自动发布策略

- **决策：** 每次推送到 `main` 后由 GitHub Actions 自动将 `package.json` minor 版本加一，并构建 Windows/macOS 安装包发布到 GitHub Releases
- **背景：** 减少手动打 tag 和发版步骤，让公开仓库提交后即可产出可下载、可自动更新的安装包
- **结果：** `.github/workflows/release.yml` 负责版本递增提交、双平台构建和 Release 资产上传

---

## 已知问题与注意事项

- `main.js` 单文件超过 2800 行，后续可考虑按模块拆分（IPC handlers、窗口管理、更新逻辑等）
- 部分旧插件使用 `nodeIntegration: true`，安全性较低，新插件应使用 `contextBridge` 方案
- PowerShell 右键监控脚本为动态生成，仅支持 Windows 平台

---

## 变更日志

| 日期 | 变更内容 | 影响范围 |
|------|----------|---------|
| 2026-05-03 | 调整发布流程为 main 分支自动递增 minor 版本并构建 Windows/macOS 发布到 GitHub Releases | .github/workflows/release.yml、AGENTS.md |
| 2026-05-03 | 新增应用自动更新、程序小店内置浏览器插件安装、本地插件目录打开入口和单实例启动保护 | main.js、index.html |
| 2026-05-03 | 重写 AGENTS.md，基于完整项目分析生成详细开发规范和架构说明 | 全局 |
