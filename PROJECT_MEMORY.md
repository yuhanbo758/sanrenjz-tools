# PROJECT_MEMORY.md

> 项目级长期记忆。仅记录跨会话仍有价值、已经由代码或运行结果验证，或由用户明确确认的事实。
> 禁止写入密码、API Key、令牌、私钥、Cookie、个人隐私或完整生产数据。

## 项目身份

- **项目名称：** sanrenjz-tools（三人聚智-效率工具）
- **核心目标：** 提供类似 uTools 的 Electron 桌面效率工具平台，通过独立插件窗口承载搜索、超级面板、本地工具和 AI 能力。
- **当前阶段：** 稳定迭代；重组后的插件市场与共享 AI 多供应商运行时已合并到 `main`。

## 已确认的技术事实

- 项目使用 Electron 25、原生 HTML/CSS/JavaScript，不使用前端构建框架；主进程入口为 `main.js`，插件生命周期由 `app/software_manager.js` 管理。
- 2026-07-14 实际扫描到 39 个含 `plugin.json` 的插件目录，其中包括原有 9 个插件、20 个非 AI 工具套件和 10 个 AI 插件。
- 30 个新增插件以 `scripts/plugin-market/catalog-v2.js` 为唯一目录清单；20 个套件保留 44 个旧 Feature Code，10 个 AI 插件各有独立入口。
- 新插件共享 `app/plugin_runtime/tool-runtime.js` 和 `app/plugin_runtime/ai-runtime.js`，但每个插件拥有独立的 HTML、布局标识、配色和业务交互。
- 插件密钥通过主进程 `plugin-secret-*` 接口保存，并在系统支持时使用 Electron `safeStorage` 加密；不得把 API Key 写入页面或普通 JSON 存储。
- 10 个 AI 插件通过 `app/plugin_runtime/ai-provider-manager.js` 共享多供应商目录；可同时保留 GLM、DeepSeek 等供应商和多个模型，文本与视觉模型选择分别持久化，视觉插件只展示声明 `vision` 能力的模型。
- 插件间调用的可用通道是 `execute-super-panel-action` IPC（`action.type:'plugin'`）：主进程本地 `runPluginAction` 会把 `clipboardText` 包装成 `{type:'over', payload}` 完整传给目标插件 `enter(action)`，并把 `feature.args` 作为 `featureArgs` 透传；`run-plugin-action` IPC（main.js 的 ipcMain.handle 版本）会在 executeJavaScript 阶段丢弃 payload，不要用它传文本（2026-08-16 余汉波AI助手总指挥模式已验证）。
- 打包版插件代码统一存放在用户选择的程序安装目录下 `plugins` 子目录；Portable 版使用便携 EXE 所在目录的 `plugins`。安装包内 `resources/app/software` 只作为内置插件源，启动时按 `plugin.json.pluginName` 执行“本地优先、仅补缺”同步；Windows NSIS 升级前把现有 `plugins`（首次迁移时为旧 `resources/app/software`）暂存到原安装目录旁，安装完成后恢复，失败时保留备份并中止（2026-09-20 已通过迁移单测与 Electron 插件冒烟，尚未执行真实已安装客户端升级验收）。
- 供应商预设（`PRESET_PROVIDERS`）现含 OpenAI、DeepSeek、智谱 GLM、Moonshot Kimi、通义千问、MiniMax（含视觉）、OpenCode Go、小米 MiMo（`https://api.xiaomimimo.com/v1`，`mimo-v2.5` 多模态 text/vision/audio）、硅基流动（`https://api.siliconflow.cn/v1`，含 Qwen-VL/InternVL 等视觉模型）。
- 模型能力白名单支持 `text`、`vision`、`audio` 三种；`parseModels/serializeModels` 可往返保留多模态组合；视觉插件按 `includes('vision')` 过滤可选模型，含 `audio` 仅作附加元信息标记，运行时目前不消费音频输入构建。

## 开发环境与约束

- **操作系统：** Windows
- **Shell：** PowerShell
- **文本编码：** UTF-8
- **Node/Electron：** 依赖版本以 `package-lock.json` 为准；当前 `package.json` 使用 Electron `^25.9.8`。
- 用户明确要求不同工具采用不同界面和颜色，不得批量复制页面模板；页面在 900×650、1180×760、最大化三种尺寸下不得产生页面级滚动，主程序窗口控制按钮必须保持可见。
- 用户明确要求当前插件开发只验证 `npm start`/Electron 运行，不构建安装包，除非后续再次明确要求打包。
- `AGENTS.md` 和 `.trae/` 按项目现有约定仅供本地 AI 上下文使用，不同步到公开远端；`PROJECT_MEMORY.md` 不得包含任何敏感信息。

## 已验证的常用命令

| 用途 | 命令 | 验证日期 | 适用条件 |
|------|------|----------|----------|
| 插件协议与逻辑测试 | `npm run test:plugins` | 2026-07-15 | 校验 20 个套件、10 个 AI 插件、旧入口、AI Mock 和临时文件流程 |
| Electron 三尺寸冒烟 | `npm run test:plugins:electron` | 2026-07-15 | 每个新增插件验证 900×650、1180×760、最大化三种尺寸 |
| 插件界面截图 | `npm run test:plugins:gallery` | 2026-07-15 | 输出到 `dist/plugin-ui-gallery-v2/`，用于人工检查布局 |
| 图标缩略图检查 | `npm run test:plugins:icons` | 2026-07-14 | 输出到 `dist/plugin-icon-gallery/`，检查 30 个图标的语义与辨识度 |
| 重建插件图标 | `node scripts/regenerate-tabler-icons.js` 后运行 `npm run generate:icons` | 2026-07-14 | 先更新官方 Tabler SVG，再生成 PNG 和多尺寸 ICO |

## 用户确认的项目偏好

- 插件首先追求可稳定使用的核心流程，不堆叠同类商业插件的全部高级功能。
- 30 个新增插件不得共享同一页面模板；不同业务应具有不同布局、配色和交互重点。
- 图标必须与插件业务语义对应，不得用编号、文字或同一图形换色充当不同插件图标。
- 超级面板图标下方的功能标题最多 4 个汉字（汉字按 2 字节、其他字符按 1 字节，上限 8 字节）：新增动作必须直接使用能表达功能的短名，不能以供应商、模型或插件品牌名代替，也不能依赖页面硬截断；完整标题与描述通过悬浮提示展示。
- 本地优先、无需登录；除局域网传输和用户主动配置的 AI 请求外，默认不上传用户数据。

## 关键决策与原因

- 将 50 个候选功能收敛为 20 个工具套件并新增 10 个 AI 插件，删除与 Windows 自带能力高度重复的系统工具；原因是降低碎片化和维护成本，同时保留 44 个有价值的旧功能入口。
- AI 插件共享供应商、密钥、流式请求、取消和超时能力，但不共享页面结构；原因是安全逻辑需要集中维护，而用户明确要求每个插件保持独立设计。
- AI 供应商配置采用一个共享目录而不是每个插件独立维护；原因是供应商和密钥应一次配置、多处复用，同时每次请求仍需显式传递当前模型选择，避免切换配置时互相覆盖。
- 30 个插件图标参考 Icon-Icons 的 Tabler 图标包，但从 Tabler 官方 MIT 源获取并在每个插件保存来源与许可证；原因是保证授权清晰且可追溯。

## 已知陷阱与可靠处理方式

- 不能只检查插件源码是否存在；新增插件完成后必须运行 Electron 冒烟测试，验证真实 BrowserWindow 加载和三种窗口尺寸。
- 插件 preload 中裸调用 `contextBridge.exposeInMainWorld` 在 `contextIsolation: false` 的插件窗口必然抛错并记录 "Unable to load preload script"；必须 try/catch 并回退挂载到 `window`（2026-08-15 已在余汉波AI助手修复，老插件末尾遗留一处裸调用是历史报错根因）。
- `main.js` 的 `plugin-secret-get` 返回 `{ value, encryptionAvailable }` 对象；渲染层必须解包 `.value` 后再拼请求头，否则服务端收到 `Bearer [object Object]` 并报鉴权失败（2026-08-15 已在共享 AI Runtime 修复并通过 mock 测试）。
- 超级面板选区采集曾把“捕获到的选中图片”随剪贴板快照恢复一起清掉；2026-08-15 起 `captureSelectedTextForPanel` 检测到选中图片时改写回该图片，图片类插件需在 `plugin-enter` 时自行读取剪贴板（AI 图片理解已接入，并支持拖放/Ctrl+V）。
- 文件修改、批量重命名、Hosts 等破坏性能力必须先预览、备份、二次确认，并明确反馈失败；测试只能使用临时目录。
- 插件图标不能只保留 SVG；主界面和系统入口还需要 PNG 与包含多个尺寸的 ICO，统一使用 `scripts/render-plugin-icons.js` 生成。
- `main.js` 已超过 8000 行，修改 IPC 或窗口生命周期时应进行窄范围改动并重点验证资源释放，避免继续复制同类 handler。
- 主进程复用已加载的插件窗口时，不能无条件等待新的 `dom-ready`；总指挥派发统一通过 `waitForPluginWindowReady()` 检查真实加载状态，并对加载失败和 10 秒超时显式报错。派发卡片再次打开目标插件时必须传 `autoRun:false`，避免重复调用付费模型（2026-09-03 已通过 Node 回归与 Electron 定向冒烟）。
- `tool-runtime.saveResult()` 会自行打开保存对话框；页面不得先调用 `chooseSavePath()` 再调用它。只有由具体任务直接写入 `options.output` 时才先选择路径。
- `createToolRuntime()` 会按 `allowedTools` 拒绝跨套件工具 ID；页面需要的小型展示逻辑应本地实现，不能随意调用其他套件的 `runTask`。

## 待确认或可能过期的信息

- `package.json` 当前版本为 2.15.0；远端发布工作流可能自动递增版本，涉及发布时必须重新确认。

## 记忆更新记录

| 日期 | 新增/修订内容 | 依据 |
|------|---------------|------|
| 2026-07-16 | 确认插件市场重组与共享 AI 多供应商运行时已合并到 `main` | `npm run test:plugins`、`npm run test:plugins:electron`、Git 合并结果 |
| 2026-07-15 | 记录 AI 多供应商目录、文本/视觉模型筛选和显式请求选择 | AI Runtime/组件测试、30 插件三尺寸 Electron 冒烟与界面图库 |
| 2026-07-15 | 更新 30 个插件界面验证日期，并记录保存对话框与工具权限陷阱 | `npm run test:plugins`、`npm run test:plugins:electron`、界面图库与运行时审计 |
| 2026-07-14 | 创建项目记忆，记录插件重组架构、用户确认的界面约束和已验证测试命令 | 当前代码、`package.json`、插件校验与 Electron 冒烟结果 |
| 2026-08-15 | 记录 `plugin-secret-get` 对象返回必须解包 `.value` 的陷阱；供应商测试改为逐模型探测 | `tests/ai-runtime.test.js`、`npm run test:plugins` |
| 2026-08-15 | 记录超级面板选中图片的剪贴板保留规则与 AI 图片理解的自动加载/拖拽修复 | `npm run test:plugins`、内联脚本语法检查 |
| 2026-08-15 | 新增小米 MiMo、硅基流动供应商预设，MiniMax 增加视觉模型，能力白名单加入 audio | `tests/ai-provider-manager.test.js`、`npm run test:plugins` |
| 2026-08-15 | 余汉波AI助手接入共享供应商目录：分组下拉、供应商管理抽屉、跟随共享文本模型选择；记录 contextBridge 裸调用陷阱 | 定向 Electron 冒烟（真实 BrowserWindow + stub IPC）、`npm run test:plugins` |
| 2026-08-16 | 余汉波AI助手新增总指挥模式：关键词路由移交 9 个 AI 插件并自动执行（`featureArgs.autoRun`），派发卡片支持回退本助手回答 | 定向 Electron 冒烟（路由/派发/回退/autoRun/真实 preload IPC 契约）、`npm run test:plugins` |
| 2026-08-16 | 超级面板图标标题统一压缩到 4 汉字/8 字节上限：显示层新增 `clampActionTitle()`，内置/动态/自定义模板 8 处超长标题改短 | `clampActionTitle` 边界用例、`node --check main.js`、内联脚本语法检查、`npm run test:plugins` |
| 2026-08-16 | 超级面板插件标题改为功能导向短名，覆盖全部 64 个插件入口；移除页面硬截断，保留悬浮提示展示详情 | 全量插件清单长度检查、JSON 解析、`npm run test:plugins` |
| 2026-09-03 | 修复总指挥重复派发复用窗口时等待 `dom-ready` 卡住；“打开插件”改为 `autoRun:false`，避免重复模型调用 | `tests/plugin-window-ready.test.js`、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-20 | 将打包版插件改存到用户选择的安装目录下 `plugins`；应用升级按插件名称只补缺不覆盖，NSIS 在旧版卸载前暂存并于新版安装后恢复 | `tests/plugin-store.test.js`、`npm run test:plugins`、`npm run test:plugins:electron` |
