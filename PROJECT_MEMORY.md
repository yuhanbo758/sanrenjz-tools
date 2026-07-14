# PROJECT_MEMORY.md

> 项目级长期记忆。仅记录跨会话仍有价值、已经由代码或运行结果验证，或由用户明确确认的事实。
> 禁止写入密码、API Key、令牌、私钥、Cookie、个人隐私或完整生产数据。

## 项目身份

- **项目名称：** sanrenjz-tools（三人聚智-效率工具）
- **核心目标：** 提供类似 uTools 的 Electron 桌面效率工具平台，通过独立插件窗口承载搜索、超级面板、本地工具和 AI 能力。
- **当前阶段：** 稳定迭代；当前开发分支正在完善重组后的插件市场。

## 已确认的技术事实

- 项目使用 Electron 25、原生 HTML/CSS/JavaScript，不使用前端构建框架；主进程入口为 `main.js`，插件生命周期由 `app/software_manager.js` 管理。
- 2026-07-14 实际扫描到 39 个含 `plugin.json` 的插件目录，其中包括原有 9 个插件、20 个非 AI 工具套件和 10 个 AI 插件。
- 30 个新增插件以 `scripts/plugin-market/catalog-v2.js` 为唯一目录清单；20 个套件保留 44 个旧 Feature Code，10 个 AI 插件各有独立入口。
- 新插件共享 `app/plugin_runtime/tool-runtime.js` 和 `app/plugin_runtime/ai-runtime.js`，但每个插件拥有独立的 HTML、布局标识、配色和业务交互。
- 插件密钥通过主进程 `plugin-secret-*` 接口保存，并在系统支持时使用 Electron `safeStorage` 加密；不得把 API Key 写入页面或普通 JSON 存储。

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
| 插件协议与逻辑测试 | `npm run test:plugins` | 2026-07-14 | 校验 20 个套件、10 个 AI 插件、旧入口、AI Mock 和临时文件流程 |
| Electron 三尺寸冒烟 | `npm run test:plugins:electron` | 2026-07-14 | 每个新增插件验证 900×650、1180×760、最大化三种尺寸 |
| 插件界面截图 | `npm run test:plugins:gallery` | 2026-07-14 | 输出到 `dist/plugin-ui-gallery-v2/`，用于人工检查布局 |
| 图标缩略图检查 | `npm run test:plugins:icons` | 2026-07-14 | 输出到 `dist/plugin-icon-gallery/`，检查 30 个图标的语义与辨识度 |
| 重建插件图标 | `node scripts/regenerate-tabler-icons.js` 后运行 `npm run generate:icons` | 2026-07-14 | 先更新官方 Tabler SVG，再生成 PNG 和多尺寸 ICO |

## 用户确认的项目偏好

- 插件首先追求可稳定使用的核心流程，不堆叠同类商业插件的全部高级功能。
- 30 个新增插件不得共享同一页面模板；不同业务应具有不同布局、配色和交互重点。
- 图标必须与插件业务语义对应，不得用编号、文字或同一图形换色充当不同插件图标。
- 本地优先、无需登录；除局域网传输和用户主动配置的 AI 请求外，默认不上传用户数据。

## 关键决策与原因

- 将 50 个候选功能收敛为 20 个工具套件并新增 10 个 AI 插件，删除与 Windows 自带能力高度重复的系统工具；原因是降低碎片化和维护成本，同时保留 44 个有价值的旧功能入口。
- AI 插件共享供应商、密钥、流式请求、取消和超时能力，但不共享页面结构；原因是安全逻辑需要集中维护，而用户明确要求每个插件保持独立设计。
- 30 个插件图标参考 Icon-Icons 的 Tabler 图标包，但从 Tabler 官方 MIT 源获取并在每个插件保存来源与许可证；原因是保证授权清晰且可追溯。

## 已知陷阱与可靠处理方式

- 不能只检查插件源码是否存在；新增插件完成后必须运行 Electron 冒烟测试，验证真实 BrowserWindow 加载和三种窗口尺寸。
- 文件修改、批量重命名、Hosts 等破坏性能力必须先预览、备份、二次确认，并明确反馈失败；测试只能使用临时目录。
- 插件图标不能只保留 SVG；主界面和系统入口还需要 PNG 与包含多个尺寸的 ICO，统一使用 `scripts/render-plugin-icons.js` 生成。
- `main.js` 已超过 8000 行，修改 IPC 或窗口生命周期时应进行窄范围改动并重点验证资源释放，避免继续复制同类 handler。

## 待确认或可能过期的信息

- 当前分支 `codex/plugin-market-50` 的 30 个新增插件尚未合并到 `main`；分支状态会随后续合并变化，使用前应重新运行 `git branch --show-current`。
- `package.json` 当前版本为 2.15.0；远端发布工作流可能自动递增版本，涉及发布时必须重新确认。

## 记忆更新记录

| 日期 | 新增/修订内容 | 依据 |
|------|---------------|------|
| 2026-07-14 | 创建项目记忆，记录插件重组架构、用户确认的界面约束和已验证测试命令 | 当前代码、`package.json`、插件校验与 Electron 冒烟结果 |
