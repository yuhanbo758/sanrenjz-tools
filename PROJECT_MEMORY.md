# PROJECT_MEMORY.md

> 项目级长期记忆。仅记录跨会话仍有价值、已经由代码或运行结果验证，或由用户明确确认的事实。
> 禁止写入密码、API Key、令牌、私钥、Cookie、个人隐私或完整生产数据。

## 项目身份

- **项目名称：** sanrenjz-tools（三人聚智-效率工具）
- **核心目标：** 提供类似 uTools 的 Electron 桌面效率工具平台，通过独立插件窗口承载搜索、超级面板、本地工具和 AI 能力。
- **当前阶段：** 稳定迭代；重组后的插件市场与共享 AI 多供应商运行时已合并到 `main`。

## 已确认的技术事实

- `app/software/sanrenjz-tools-task-habit/` 版本 2.2.0 保留 `todos` 与 `habits` 存储键，并以 `pomodoro-v1` 独立保存番茄计时和记录；任务支持 TXT/Markdown 导入、搜索筛选排序、编辑、预计番茄数和一键专注，习惯支持每周目标和历史周打卡。旧 `weeks` 记录兼容读取，新打卡写入本地日期 `days`；2026-09-27 已通过核心逻辑、Electron 拖入与计时重载交互及插件协议校验，已安装客户端尚未验收。

- 项目使用 Electron 25、原生 HTML/CSS/JavaScript，不使用前端构建框架；主进程入口为 `main.js`，插件生命周期由 `app/software_manager.js` 管理。
- 2026-07-14 实际扫描到 39 个含 `plugin.json` 的插件目录，其中包括原有 9 个插件、20 个非 AI 工具套件和 10 个 AI 插件。
- 30 个新增插件以 `scripts/plugin-market/catalog-v2.js` 为唯一目录清单；20 个套件保留 44 个旧 Feature Code，10 个 AI 插件各有独立入口。
- 新插件共享 `app/plugin_runtime/tool-runtime.js` 和 `app/plugin_runtime/ai-runtime.js`，但每个插件拥有独立的 HTML、布局标识、配色和业务交互。
- `app/software/sanrenjz-tools-csv-data/` 的表格导入、解析和视图处理留在插件目录；版本 2.1.0 支持选择/拖入 CSV、TSV、TXT、JSON，UTF-8/GB18030 解码、分隔符识别、数据质量提示、筛选/排序/分页，以及按当前视图导出 CSV/TSV/JSON。空或重复表头会拒绝 JSON 导出以免覆盖字段（2026-09-27 已通过核心测试、目标插件 Electron 文件交互与双尺寸测试、全插件三尺寸冒烟；未验收已安装客户端）。
- `app/software/sanrenjz-tools-file-inspector/` 版本 2.1.0 的检查逻辑留在插件目录：窗口拖入文件或目录，内容搜索支持正则、大小写和大小限制，目录比较支持流式 SHA-256、结果筛选和 CSV 导出，目录树支持深度、扩展名和保存。遍历跳过符号链接，文件数量与匹配数有限额；2026-09-27 已通过临时目录核心测试、目标插件 Electron 交互测试和插件协议校验，未验收已安装客户端。
- `app/software/sanrenjz-tools-pdf-studio/` 版本 2.1.0 的 PDF 处理逻辑留在插件目录：窗口拖入或选择多个 PDF，按文件设置页码范围、奇偶页和倒序，再合并或逐页拆分；输出禁止覆盖原文件，拆分同名结果自动编号且单次上限 300 页。2026-09-27 已通过核心 PDF 内容测试、目标插件 Electron 拖入/预览/保存测试及插件协议校验；未验收已安装客户端。
- `app/software/sanrenjz-tools-lan-transfer/` 版本 2.1.0 的 HTTP 服务在插件目录内：临时随机口令保护链接，手机向电脑发送文字或多文件，电脑向手机分享文字或文件；上传流式限额并先写临时文件，停止或关闭插件后会话失效。2026-09-27 已通过本机 HTTP 核心测试、桌面与手机 Electron 交互和双尺寸布局测试；真实跨设备网络与已安装客户端待验收。
- 插件密钥通过主进程 `plugin-secret-*` 接口保存，并在系统支持时使用 Electron `safeStorage` 加密；不得把 API Key 写入页面或普通 JSON 存储。
- 10 个 AI 插件通过 `app/plugin_runtime/ai-provider-manager.js` 共享多供应商目录；可同时保留 GLM、DeepSeek 等供应商和多个模型，文本与视觉模型选择分别持久化，视觉插件只展示声明 `vision` 能力的模型。
- 插件间调用的可用通道是 `execute-super-panel-action` IPC（`action.type:'plugin'`）：主进程本地 `runPluginAction` 会把 `clipboardText` 包装成 `{type:'over', payload}` 完整传给目标插件 `enter(action)`，并把 `feature.args` 作为 `featureArgs` 透传；`run-plugin-action` IPC（main.js 的 ipcMain.handle 版本）会在 executeJavaScript 阶段丢弃 payload，不要用它传文本（2026-08-16 余汉波AI助手总指挥模式已验证）。
- 打包版插件代码统一存放在用户选择的程序安装目录下 `plugins` 子目录；Portable 版使用便携 EXE 所在目录的 `plugins`。安装包内 `resources/app/software` 作为内置插件源：缺失插件自动补入；同名插件按 `plugin.json.pluginName` 匹配，内置语义版本更高时更新、版本更低时保留本地版本、版本相同或不可比较时仅在内置更新时间更新时覆盖；本地独有插件始终保留。Windows NSIS 升级前把现有 `plugins`（首次迁移时为旧 `resources/app/software`）暂存到原安装目录旁，安装完成后恢复，失败时保留备份并中止（2026-09-20 已通过迁移、版本/日期升级单测与 Electron 插件冒烟，尚未执行真实已安装客户端升级验收）。
- 安装目录 `plugins/<插件>` 中的内置插件仍以 `../../plugin_runtime` 引用共享运行时，因此打包版启动时必须把 `resources/app/plugin_runtime` 覆盖同步到安装根目录 `plugin_runtime`；只更新主程序共享运行时，不覆盖或删除本地插件（2026-09-20 已通过持久化插件目录 Electron 冒烟和已安装客户端启动验证）。
- 供应商预设（`PRESET_PROVIDERS`）现含 OpenAI、DeepSeek、智谱 GLM、Moonshot Kimi、通义千问、MiniMax（含视觉）、OpenCode Go、小米 MiMo（`https://api.xiaomimimo.com/v1`，`mimo-v2.5` 多模态 text/vision/audio）、硅基流动（`https://api.siliconflow.cn/v1`，含 Qwen-VL/InternVL 等视觉模型）。
- 模型能力白名单支持 `text`、`vision`、`audio` 三种；`parseModels/serializeModels` 可往返保留多模态组合；视觉插件按 `includes('vision')` 过滤可选模型，含 `audio` 仅作附加元信息标记，运行时目前不消费音频输入构建。
- AI 语音输入法 1.4.1 从共享目录读取模型：共享 GPT-6 等文本模型可复用 Runtime（含 OpenCode 托管认证）处理现有语音服务转写后的文字；真正声明 `audio` 能力且采用 OpenAI 兼容直连接口的模型才进入直接语音识别列表，专用转写模型走 `/audio/transcriptions`。本机共享目录的 GPT-6 系列标记为 `text,vision`，OpenAI GPT-6 Luna 官方模型页也注明音频不支持；OpenCode 当前不把音频附件送进模型请求，所以语音流程须先转写再用 GPT-6 处理。旧“共享音频模型”无可用音频模型时迁移到该两步流程（2026-09-27 本机模型元数据、模拟接口与 Electron 工作台测试已验证；真实付费模型及安装版待验收）。
- 共享供应商设置支持从本机 OpenCode 动态导入全部“已连接”供应商与模型；主进程按需启动仅监听 `127.0.0.1` 的 OpenCode Server，由 OpenCode 继续持有并刷新 API Key/OAuth（含 OpenAI Codex 认证），渲染层只接收不含凭据的模型目录。模型采样禁用 OpenCode 工具权限并在完成或失败后删除临时会话（2026-09-20 已通过目录实测、逻辑测试和 Electron 三尺寸冒烟；未执行真实计费模型采样）。
- OpenCode 纯模型采样必须隔离全局配置目录、会话数据库（`OPENCODE_DB`）和锁状态，只继承供应商/模型字段并复用原认证目录；禁止工具权限不能阻止自动加载的全局插件或 MCP。托管服务不使用未消费的 stdout/stderr pipe，请求/启动/清理均有期限，会话清理不走可重启服务的入口，空闲 2 分钟退出自有服务。2026-10-02 本机 OpenCode 1.18.32 实测保留 8 个连接供应商，加载的外部插件和 MCP 为 0，独立数据库中的测试会话删除成功；安装版 2.24.0 的余汉波AI助手经真实 preload → 共享 Runtime → 主进程 IPC 调用 `openai/gpt-6-luna` 成功。同步采样 Obsidian REST 响应未超时；长时间共存卡死的唯一根因仍未确认。
- OpenCode 1.18.31 的 `/provider` 当前把 OpenAI OAuth 模型输入能力放在 `model.capabilities.input` 对象中，旧目录则可能使用 `model.modalities.input` 数组；导入器必须兼容两种结构，否则 GPT-5.6 Luna/Luna Fast 会被误标为纯文本并从视觉模型下拉消失（2026-09-20 已通过真实本机目录读取确认两者为 `text,vision`，未发起计费模型调用）。
- `app/software/sanrenjz-tools-account-manager/` 是由 Python/Tkinter 账号管理器迁移的新插件，运行时不需要 Python；使用 `better-sqlite3` 直接读写 SQLite，并根据 `pragma_table_xinfo` 动态生成不同表的列头、查询字段和新增/修改表单。查询支持指定列和 `__all__` 整表跨列策略；修改与单行删除使用单/复合主键或未被真实列遮蔽的 rowid 定位，并以原始行快照拒绝外部改动后的过期操作；操作在事务内要求恰好影响一行，否则回滚（普通 SQLite 表的可空复合主键可能无法唯一定位）；删除需确认且不在确认框展示敏感字段（2026-09-25 已通过主键、复合主键、无主键 rowid、过期快照、非唯一主键回滚和 Electron 三尺寸测试）。
- 余汉波AI助手总指挥会在每次发送前动态扫描当前安装目录的 `plugin.json`：普通本地工具有可靠匹配时优先打开并传 `autoRun:false`；无可靠本地能力时才匹配 AI 插件，用户明确说“用 AI/交给 AI”时跳过普通工具。路由包含同分歧义保护，示例“将图片改成 ICO，调用插件”会打开“图片优化器”的格式转换（2026-09-21 已通过真实插件目录单测和 Electron IPC 冒烟）。

- `app/software/sanrenjz-tools-ai-git/` 版本 1.1.0 支持拖入 Git 项目目录，按暂存区、工作区、最近提交、标签范围或指定基准分支的共同祖先读取只读 Git 数据；提交说明、变更日志、Release Notes、PR 描述和风险分析各有独立入口。未跟踪文件只列路径，模型请求不自动执行 Git 写操作（2026-09-26 已通过临时仓库单测、目标插件 Electron 交互测试和全插件三尺寸冒烟；真实供应商生成未验收）。
- `app/software/sanrenjz-tools-ai-writing/` 版本 1.1.0 支持文件选择与拖拽导入 UTF-8 文本、DOCX 和含文字层 PDF；素材只在点击生成时发送给所选文本模型。结果按标题、段落与列表安全排版，可查看原文、复用、复制与手动导出 Markdown。目标插件 Electron 测试覆盖 7 种扩展名的两种导入路径、生成提示词、保存及 900×650/1180×760 布局；真实供应商生成与已安装客户端仍待验收（2026-09-27）。
- 图片裁剪工具原先只在上传框绑定拖放，加载图片后该框隐藏，且 Windows 拖入文件的 MIME 可能为空；窗口级拖放与受限扩展名回退已在 `tests/image-crop-electron.test.js` 验证，包括画布出现后再次拖入、粘贴、翻转、裁剪和撤销（2026-09-27）。
- 图片优化器 2.2.0 在单一设置工作区支持多图队列、窗口拖入/粘贴、缩放预设、逐图旋转翻转与批量导出；输出由真实格式签名校验，批量保存独占写入并对重名文件编号，不覆盖既有文件。2026-09-27 已通过目标插件 Electron 转换、拖放、批量与三尺寸测试和插件协议校验；未验收已安装客户端。
- 视觉设计实验室 2.1.0 在插件内支持图片选择、窗口拖入和粘贴取色，色板可复制 CSS 或导出 JSON；调色台以 WCAG 2.2 阈值检查前景/背景文字对比度；SVG 支持选择/拖入、格式化/压缩、静态安全预览及保存。2026-09-27 已通过目标插件 Electron 文件交互测试与插件协议校验；已安装客户端未验收。
- 本地笔记中心原先防抖保存回调在触发时才读取当前选中 ID，快速切换会把上一条输入关联到下一篇；2.1.0 改为输入时更新内存笔记、串行持久化快照，关闭窗口时补写待保存内容。已通过 2026-09-27 目标插件 Electron 快速切换、三尺寸交互及真实临时 Markdown 文件导入导出验证；已安装客户端未验收。

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
| 密码管理器交互回归 | `npm run test:password-plugin` | 2026-09-21 | 验证异步删除、整库重置、安全渲染、API 密钥清理和 CSV 覆盖导入 |
| SQLite 数据表管理器回归 | `npm run test:account-plugin` | 2026-09-25 | 验证动态列名、指定列/整表查询、主键/rowid 修改与删除、并发冲突防护、敏感列遮罩和三尺寸布局 |
| 图标缩略图检查 | `npm run test:plugins:icons` | 2026-07-14 | 输出到 `dist/plugin-icon-gallery/`，检查 30 个图标的语义与辨识度 |
| 重建插件图标 | `node scripts/regenerate-tabler-icons.js` 后运行 `npm run generate:icons` | 2026-07-14 | 先更新官方 Tabler SVG，再生成 PNG 和多尺寸 ICO |

## 用户确认的项目偏好

- 插件首先追求可稳定使用的核心流程，不堆叠同类商业插件的全部高级功能。
- 30 个新增插件不得共享同一页面模板；不同业务应具有不同布局、配色和交互重点。
- 图标必须与插件业务语义对应，不得用编号、文字或同一图形换色充当不同插件图标。
- 超级面板图标下方的功能标题最多 4 个汉字（汉字按 2 字节、其他字符按 1 字节，上限 8 字节）：新增动作必须直接使用能表达功能的短名，不能以供应商、模型或插件品牌名代替，也不能依赖页面硬截断；完整标题与描述通过悬浮提示展示。
- 本地优先、无需登录；除局域网传输和用户主动配置的 AI 请求外，默认不上传用户数据。
- 总指挥必须先判断已安装插件能否直接完成任务；能完成就打开对应本地功能，只有本地工具不能处理或用户明确要求 AI 时才使用生成式 AI。

## 关键决策与原因

- 将 50 个候选功能收敛为 20 个工具套件并新增 10 个 AI 插件，删除与 Windows 自带能力高度重复的系统工具；原因是降低碎片化和维护成本，同时保留 44 个有价值的旧功能入口。
- AI 插件共享供应商、密钥、流式请求、取消和超时能力，但不共享页面结构；原因是安全逻辑需要集中维护，而用户明确要求每个插件保持独立设计。
- AI 供应商配置采用一个共享目录而不是每个插件独立维护；原因是供应商和密钥应一次配置、多处复用，同时每次请求仍需显式传递当前模型选择，避免切换配置时互相覆盖。
- 总指挥能力目录以当前安装插件的 `plugin.json` 为事实源，不维护一份固定的普通工具清单；原因是程序小店插件会增删升级，本地能力必须随安装状态变化。少量同义词只用于弥补自然语言与功能名称不同序，不替代插件清单。
- 30 个插件图标参考 Icon-Icons 的 Tabler 图标包，但从 Tabler 官方 MIT 源获取并在每个插件保存来源与许可证；原因是保证授权清晰且可追溯。

## 已知陷阱与可靠处理方式

- 2026-10-02 排查 Obsidian 共存问题时确认主程序右键钩子存在同步输入回放，语音输入法键盘钩子存在同步 Console 写入/Flush；修复后 `npm run test:hooks` 在人为阻塞输出时验证 4,000 次真实回调在 1 秒内完成，并验证短按/拖动事件配对和父管道关闭后的监听退出。安装版 2.24.0 已局部同步修复并启动，语音插件为 1.4.2；这证明输入监听风险已处理，尚不能证明用户长时间使用 Obsidian 后卡死的唯一根因。
- 不能只检查插件源码是否存在；新增插件完成后必须运行 Electron 冒烟测试，验证真实 BrowserWindow 加载和三种窗口尺寸。
- `tests/electron-plugin-smoke.js` 的 AI 助手历史测试会在临时目录主动调用 `saveChatToFile()`；未拦截 `showNotification` 时，测试进程会向用户桌面弹出“对话已手动导出”通知，易误判为插件自动导出。2026-09-27 已在测试窗口内拦截通知，仍断言手动导出文件生成；正式插件的历史自动缓存与手动 Markdown 导出逻辑未变。
- 插件 preload 中裸调用 `contextBridge.exposeInMainWorld` 在 `contextIsolation: false` 的插件窗口必然抛错并记录 "Unable to load preload script"；必须 try/catch 并回退挂载到 `window`（2026-08-15 已在余汉波AI助手修复，老插件末尾遗留一处裸调用是历史报错根因）。
- 密码管理器删除单条账号或重置整库时不得连续使用同步存储 IPC；同步磁盘写入会阻塞交互，多键清理应使用异步删除通道、忙碌态和防重入，并在删除后同步搜索派生缓存（2026-09-21 已通过定向 Electron 交互回归）。
- `main.js` 的 `plugin-secret-get` 返回 `{ value, encryptionAvailable }` 对象；渲染层必须解包 `.value` 后再拼请求头，否则服务端收到 `Bearer [object Object]` 并报鉴权失败（2026-08-15 已在共享 AI Runtime 修复并通过 mock 测试）。
- 超级面板选区采集曾把“捕获到的选中图片”随剪贴板快照恢复一起清掉；2026-08-15 起 `captureSelectedTextForPanel` 检测到选中图片时改写回该图片，图片类插件需在 `plugin-enter` 时自行读取剪贴板（AI 图片理解已接入，并支持拖放/Ctrl+V）。
- 文件修改、批量重命名、Hosts 等破坏性能力必须先预览、备份、二次确认，并明确反馈失败；测试只能使用临时目录。
- 插件图标不能只保留 SVG；主界面和系统入口还需要 PNG 与包含多个尺寸的 ICO，统一使用 `scripts/render-plugin-icons.js` 生成。
- `main.js` 已超过 8000 行，修改 IPC 或窗口生命周期时应进行窄范围改动并重点验证资源释放，避免继续复制同类 handler。
- 主进程复用已加载的插件窗口时，不能无条件等待新的 `dom-ready`；总指挥派发统一通过 `waitForPluginWindowReady()` 检查真实加载状态，并对加载失败和 10 秒超时显式报错。派发卡片再次打开目标插件时必须传 `autoRun:false`，避免重复调用付费模型（2026-09-03 已通过 Node 回归与 Electron 定向冒烟）。
- `tool-runtime.saveResult()` 会自行打开保存对话框；页面不得先调用 `chooseSavePath()` 再调用它。只有由具体任务直接写入 `options.output` 时才先选择路径。
- `createToolRuntime()` 会按 `allowedTools` 拒绝跨套件工具 ID；页面需要的小型展示逻辑应本地实现，不能随意调用其他套件的 `runTask`。
- `better-sqlite3` 是 Electron 原生模块，普通 Node 24 ABI 产物不能直接供 Electron 25 使用；依赖安装后必须由 `electron-builder install-app-deps` 按 Electron ABI 重建，并在打包配置中同时保留和解包 `better-sqlite3`、`bindings`、`file-uri-to-path`。
- 通用 SQLite 表不能按当前搜索值直接执行修改；必须优先用完整主键（含复合主键）定位，无主键普通表才使用未被真实列遮蔽的 rowid，并把原始行快照加入 `UPDATE WHERE` 以检测外部并发修改。只有单列 `INTEGER PRIMARY KEY` rowid 表的主键才可视为自动生成，复合主键中的整数列仍允许编辑。
- `PluginManager` 的指示器窗口默认是固定 72×72，不能直接用作图片贴图。图片悬浮板通过 `plugin.json.indicatorSetting` 指定尺寸、可调整大小和可聚焦；窗口尺寸仅在实际调整后更新持久化值，避免 Windows 透明无边框窗口反复打开时的像素漂移（2026-09-27，`tests/image-pinboard-electron.test.js`）。

## 待确认或可能过期的信息

- `package.json` 当前版本为 2.15.0；远端发布工作流可能自动递增版本，涉及发布时必须重新确认。

## 记忆更新记录

| 日期 | 新增/修订内容 | 依据 |
|------|---------------|------|
| 2026-10-02 | 隔离 OpenCode 纯模型采样的插件/MCP、会话数据库与锁状态，补齐有界请求和退出清理 | 新增 profile/lifecycle 回归、`npm run test:plugins`、真实模型/安装版 AI 助手调用、Obsidian 响应采样 |
| 2026-10-02 | 记录全局输入监听的阻塞风险、回归验证与 Obsidian 长时共存的验收边界 | `tests/windows-hook-runtime.test.js`、源/安装版语音插件 Electron 测试、安装版启动检查 |
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
| 2026-09-20 | 新增本机 OpenCode 动态供应商导入与主进程托管调用，复用 OpenCode 已连接模型及 OpenAI Codex OAuth，不向插件渲染层暴露凭据 | `tests/opencode-runtime.test.js`、真实 `/provider` 目录读取、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-20 | 修复持久化插件目录缺失共享 `plugin_runtime` 导致 AI preload 与供应商目录不加载；启动时同步应用自带运行时 | `tests/plugin-store.test.js`、持久化插件目录 Electron 冒烟、已安装 2.18.0 客户端验证 |
| 2026-09-20 | OpenCode 供应商必须由 `opencode://` 路由到主进程托管 Runtime 并复用其已有认证，不读取或要求插件 API Key；旧配置即使丢失 transport 元数据也需自动恢复 | `tests/ai-runtime.test.js`、`tests/ai-provider-manager.test.js`、真实 OpenCode `openai/gpt-5.6-sol` 无密钥调用 |
| 2026-09-20 | 修复 OpenAI OAuth 模型能力导入：兼容 OpenCode 新版 `capabilities.input` 与旧版 `modalities.input`，使 GPT-5.6 Luna/Luna Fast 正确进入视觉模型目录 | `tests/opencode-runtime.test.js`、真实本机 `/provider` 目录、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-20 | OpenCode 上游首请求可能偶发 `unknown certificate verification error`；仅对明确的临时 TLS/网络错误以新会话最多尝试 3 次，不关闭证书校验，模型不支持等业务错误不得重试 | `tests/opencode-runtime.test.js`、开发版 AI 文档阅读器 `gpt-5.6-luna-fast` 连续 3 次真实调用 |
| 2026-09-20 | 内置插件启动同步由“同名只保留本地”改为版本优先更新：高版本覆盖、低版本不降级、同版本按更新时间决定；替换使用临时副本与可恢复备份并保留本地独有插件 | `tests/plugin-store.test.js`、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-21 | 修复密码管理器同步删除导致界面卡死，并覆盖整库重置、派生缓存、导入列错位与安全渲染 | `npm run test:password-plugin`、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-21 | 新增无需 Python 的 SQLite 数据表管理器、指定列/整表查询策略及 Electron 原生驱动约束 | `npm run postinstall`、`npm run test:account-plugin`、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-22 | SQLite 数据表管理器新增主键/rowid 安全修改和过期快照冲突防护 | `npm run test:account-plugin`、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-25 | SQLite 数据表管理器新增安全单行删除、确认与过期快照防护；发现可空复合主键可能匹配多行，改为事务内非单行即回滚 | `npm run test:account-plugin`、`npm run test:plugins` |
| 2026-09-21 | 总指挥改为动态检索已安装插件、本地工具优先、明确 AI 意图覆盖，并增加低置信度歧义保护 | `tests/commander-router.test.js`、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-26 | AI 文档阅读器支持拖拽和多选导入二进制 DOC、DOCX、含文本层 PDF、XLSX 多工作表与 UTF-8 文本；DOC 用 Word Extractor、DOCX 用 Mammoth，PDF 由 Node 模式子进程运行 PDF.js 并依坐标及换行恢复可读段落和列间距，XLSX 用 read-excel-file 提取各表行列。新增事实、时间线、待办、风险、术语、问答、审校和双文档对比。扫描 PDF 不含 OCR，复杂 PDF 排版不保证完全还原 | `tests/ai-document.test.js`、`tests/ai-document-electron.test.js`、`npm run test:plugins`、`npm run test:plugins:electron`、`electron-builder --win --dir --x64` |
| 2026-09-26 | 网页浏览原有 iframe 会被站点 X-Frame-Options 拒绝且跨域后无法可靠同步 URL；改为隔离 webview，主进程只对此插件启用并限制远端 Node/协议/新窗口，页面通过真实导航事件同步地址，Electron 25 下原生 canGoBack 异常时以会话轨迹后备 | `tests/surfing-electron.test.js`（禁止嵌入站点、站内/新窗口链接、后退、600px 布局、设置保存）、`npm run test:plugins` |
| 2026-09-26 | AI Git 助手修复模式按钮无事件，新增项目文件夹拖拽、范围读取、PR 描述和变更风险分析 | `tests/ai-git.test.js`、`tests/ai-git-electron.test.js`、`electron tests/electron-plugin-smoke.js` |
| 2026-09-27 | AI 提示词工坊将插件存储的本地模板与指定文件夹的只读 Markdown/TXT 素材分离；外部素材首次编辑生成本地副本，支持 @ 插入、变量填充和优化结果另存。代码翻译模板的源语言从代码自动识别，低置信度时让用户选择；目标语言由用户选择 | `tests/ai-prompt-language.test.js`、`tests/ai-prompt-electron.test.js`、`node scripts/validate-plugins.js` |
| 2026-09-27 | 插件管理器注入 `window.utools` 的 `executeJavaScript` 原先返回含函数对象，Electron 在跨进程回传时无法克隆并产生未处理拒绝；注入脚本改为返回可克隆的布尔值并捕获失败 | `tests/plugin-window-injection-electron.test.js`、提示词工坊真实 PluginManager 功能执行 |
| 2026-09-27 | AI 会议纪要 1.1.0 可录音和手动触发 OpenAI 兼容语音转写；选择或拖拽导入 UTF-8 文本、DOC/DOCX、XLSX、PPTX，旧版 PPT/XLS 需先另存为新格式；增加风险、待确认问题和 Markdown 导出。语音供应商须另配真实支持的转写模型，真实付费服务及已安装客户端仍待验收 | `tests/ai-meeting.test.js`、`tests/ai-meeting-electron.test.js`、`npm run test:plugins`、`npm run test:plugins:electron` |
| 2026-09-27 | AI 写作工作室 1.1.0 增加七种文件扩展名的选择/拖拽导入、九种写作任务、受众/语气/篇幅控制、安全结果排版与 Markdown 导出 | `tests/ai-writing.test.js`、`tests/ai-writing-electron.test.js`、`npm run test:plugins`、`electron tests/electron-plugin-smoke.js` |
| 2026-09-27 | 图片裁剪工具修复窗口拖入和空 MIME 文件识别，新增粘贴、翻转、重置及尺寸提示，修复裁剪与历史记录问题 | `tests/image-crop-electron.test.js`、`node --check` |
| 2026-09-27 | 文件检查工作台 2.1.0 增加窗口拖入、搜索选项、目录比较筛选与导出、目录树控制与保存；移除重复介绍栏 | `tests/file-inspector.test.js`、`tests/file-inspector-electron.test.js`、`node scripts/validate-plugins.js` |
| 2026-09-27 | 本地笔记中心 2.1.0 默认分屏并修复快速切换时的延迟保存关联风险，增加复制、排序、置顶、副本、Markdown 导入导出和便签复制 | `tests/notes-center-electron.test.js`、`tests/notes-center-files-electron.test.js`、`node scripts/validate-plugins.js` |
| 2026-09-27 | 图片悬浮板改用可调整大小的真实贴图窗口，确认默认指示器尺寸及 Windows 尺寸漂移处理方式 | `tests/image-pinboard-electron.test.js`、`node scripts/validate-plugins.js` |
| 2026-09-27 | 视觉设计实验室 2.1.0 增加图片拖入/粘贴取色、色板导出、文字对比度检查和 SVG 安全预览/保存 | `tests/visual-design-electron.test.js`、`node scripts/validate-plugins.js` |
| 2026-09-27 | 二维码与条码工具 2.1.0 使用插件内 JsBarcode 与 ZXing 增加常见一维条码生成/识别，支持二维码参数、PNG/SVG 导出、图片选择/拖入/剪贴板识别；Electron 25 中 ZXing UMD 在 Node 集成环境按 CommonJS 加载，需通过 preload 调用 | `tests/qr-barcode-electron.test.js`、`tests/electron-plugin-smoke.js`、`node scripts/validate-plugins.js`；已安装客户端未验收 |
| 2026-09-27 | 文本工程实验室 2.1.0 移除重复介绍栏；文本输入区和编码队列支持文件拖入，差异使用有规模上限的行对齐算法，编码转换使用独占创建并校验目标编码可无损表示字符，防止静默覆盖或乱码写入 | `tests/text-engineering-electron.test.js`、`node scripts/validate-plugins.js`；已安装客户端未验收 |
