# SanRenJZ Tools 项目开发规则

## 1. 插件架构原则
- 每个插件应为独立的目录，位于 `app/software/` (或其他指定插件目录) 下。
- 必须包含 `plugin.json`, `index.html`, `preload.js`, `logo.ico`。
- 插件运行在独立渲染进程，禁止直接在前端代码中使用 Node.js API (除非 `nodeIntegration` 开启，但推荐使用 `preload.js` 桥接)。

## 2. 命名规范
- 插件目录：`sanrenjz-tools-<name>`
- Feature Code：唯一标识符，建议与插件名相关。

## 3. 代码规范
- **HTML/CSS**：使用 Flexbox/Grid 布局，适配 `plugin.json` 中定义的宽高。
- **JavaScript**：
  - 前端通过 `window.electronAPI` 调用底层能力。
  - `preload.js` 中使用 `contextBridge.exposeInMainWorld` 暴露 API。
  - `window.exports` 用于定义生命周期钩子 (`enter`, `search`, `select`)。

## 4. API 使用指南
- **数据存储**：使用 `plugin-storage-get`/`set`/`remove`。
- **窗口控制**：使用 `hide-plugin-window`, `close-plugin-window` 等。
- **系统交互**：使用 `show-open-dialog`, `copy`, `insert`。

## 5. 调试与测试
- 使用 `npm run dev` 启动应用进行调试。
- 插件窗口内可使用 DevTools (如果未自动开启，使用 `console.log` 输出到终端)。
- 确保 `plugin.json` 配置正确，特别是 `features` 和 `superPanel` 字段。

## 6. 安全性
- 不要在 `preload.js` 中直接暴露完整的 `ipcRenderer` 对象。
- 仅暴露业务需要的具体方法。
