# 项目记忆

## 插件后台保活与自动清理逻辑 (2026-02-04)

### 功能描述
- **默认行为**: 插件在失去焦点（blur）或被最小化隐藏后，默认会在 3 分钟后被自动清理（销毁窗口），以节省系统资源。
- **例外情况**:
  1. **已钉住（Pinned）**: 用户手动钉住的插件不会触发自动清理。
  2. **后台保活（Keep-Alive）**: 插件通过特定参数明确请求后台保活时，不会触发自动清理。

### 实现细节
1. **状态管理**:
   - `SoftwareManager` 类中新增 `pluginBackgroundKeepAlive` (Map) 用于记录插件的保活状态。
   
2. **隐藏逻辑**:
   - `minimizePlugin(pluginName, options)` 方法支持 `options.keepAlive` 参数。
   - 当 `options.keepAlive === true` 时：
     - 将插件标记为保活状态。
     - 清除该插件的清理定时器（如果有）。
     - 调用 `window.hide()` 隐藏窗口。
   
3. **自动清理逻辑**:
   - 在插件失去焦点（blur）事件处理中，检查插件是否已钉住或处于保活状态。
   - 只有既未钉住也未保活的插件，才会启动 3 分钟的清理倒计时。

4. **插件端调用**:
   - 插件可通过 IPC 发送 `minimize-plugin-window` 事件，并附带 `{ keepAlive: true }` 参数来实现“隐藏到后台运行”的功能。
   - 示例代码（preload.js）:
     ```javascript
     ipcRenderer.invoke('minimize-plugin-window', PLUGIN_NAME, { keepAlive: true });
     ```

### 涉及文件
- `app/software_manager.js`: 核心逻辑（状态管理、清理调度）。
- `main.js`: IPC 事件转发。
- `app/software/sanrenjz-tools-speech_input/preload.js`: 语音输入法插件的具体实现。

## 版本发布流程 (2026-02-04)

### 流程步骤
1. **更新版本号**:
   - 修改 `package.json` 中的 `version` 字段。
   - 例如：将 `2.7.0` 更新为 `2.8.0`。

2. **构建打包**:
   - Windows 平台: 运行 `npm run build-win`。
   - 全平台: 运行 `npm run build-all`。

3. **输出产物**:
   - 打包完成后，安装包位于 `dist/` 目录下。
   - Windows 安装包命名格式：`三人聚智-效率工具-{version}-win-x64.exe`。
