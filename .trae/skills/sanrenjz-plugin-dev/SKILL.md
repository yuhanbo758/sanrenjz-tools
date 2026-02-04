---
name: "sanrenjz-plugin-dev"
description: "辅助开发 SanRenJZ Tools 插件。当用户需要创建、修改或开发插件时调用。包含插件结构、API使用和最佳实践。"
---

# SanRenJZ Tools 插件开发助手

此 Skill 用于辅助开发 SanRenJZ Tools 插件，基于 Electron 多进程架构。

## 1. 核心架构
- **独立进程**：每个插件运行在独立的渲染进程中。
- **通信**：通过 `preload.js` 和 `IPC` 与主进程通信。
- **生命周期**：由搜索窗口、超级面板或全局快捷键唤起。

## 2. 标准目录结构
```text
sanrenjz-tools-plugin-name/
├── plugin.json          # [必需] 插件配置清单
├── index.html           # [必需] 插件主界面入口
├── preload.js           # [必需] 预加载脚本 (API 桥接)
├── logo.ico             # [必需] 插件图标
├── logo.png             # [可选] 插件图标
├── assets/              # [可选] 静态资源目录
└── README.md            # [推荐] 说明文档
```

## 3. 配置文件 (plugin.json) 模板
```json
{
  "pluginName": "插件名称",
  "description": "功能简介",
  "version": "1.0.0",
  "author": "Your Name",
  "category": "效率工具",
  "main": "index.html",
  "logo": "logo.ico",
  "preload": "preload.js",
  "features": [
    {
      "code": "feature_id",
      "explain": "功能简述",
      "cmds": ["关键词"],
      "icon": "logo.ico",
      "platform": ["win32"],
      "mode": "none",
      "superPanel": true
    }
  ],
  "pluginSetting": {
    "width": 800,
    "height": 600
  }
}
```

## 4. 预加载脚本 (preload.js) 模板
必须使用 `contextBridge` 暴露 API，并使用 `window.exports` 定义钩子。

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    storage: {
        get: (key) => ipcRenderer.sendSync('plugin-storage-get', '插件名称', key),
        set: (key, value) => ipcRenderer.sendSync('plugin-storage-set', '插件名称', key, value)
    },
    window: {
        hide: () => ipcRenderer.invoke('hide-plugin-window', '插件名称'),
        close: () => ipcRenderer.invoke('close-plugin-window', '插件名称')
    },
    action: {
        copy: (text) => {
            const { clipboard } = require('electron');
            clipboard.writeText(text);
        }
    }
});

window.exports = {
    "feature_id": {
        mode: "none",
        args: {
            enter: (action) => {
                console.log('Plugin entered:', action);
            }
        }
    }
};
```

## 5. 开发规范与最佳实践
1. **资源隔离**：不依赖外部 CDN，所有资源本地化。
2. **状态保存**：使用 `plugin-storage` API 保存用户偏好。
3. **错误处理**：IPC 通信包裹 `try-catch`。
4. **调试**：使用 `npm run dev` 启动，通过 Console 调试。
