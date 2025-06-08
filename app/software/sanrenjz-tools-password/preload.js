const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 插件存储API
    storage: {
        set: (pluginName, key, value) => ipcRenderer.sendSync('plugin-storage-set', pluginName, key, value),
        get: (pluginName, key) => ipcRenderer.sendSync('plugin-storage-get', pluginName, key),
        remove: (pluginName, key) => ipcRenderer.sendSync('plugin-storage-remove', pluginName, key)
    },
    
    // 窗口控制API
    window: {
        minimize: (pluginName) => ipcRenderer.invoke('minimize-plugin-window', pluginName),
        maximize: (pluginName) => ipcRenderer.invoke('maximize-plugin-window', pluginName),
        close: (pluginName) => ipcRenderer.invoke('close-plugin-window', pluginName),
        togglePin: (pluginName) => ipcRenderer.invoke('toggle-plugin-pin-window', pluginName)
    },
    
    // 系统对话框API
    dialog: {
        showOpenDialog: (options) => ipcRenderer.sendSync('show-open-dialog', options),
        showSaveDialog: (options) => ipcRenderer.sendSync('show-save-dialog', options)
    },
    
    // 内容插入API
    insertion: {
        handleContent: (content) => ipcRenderer.invoke('handle-content-insertion', content)
    }
});

// 预加载日志
console.log('密码管理器预加载脚本已加载'); 