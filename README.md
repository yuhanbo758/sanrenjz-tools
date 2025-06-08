# 三人聚智工具 (SanRenJZ Tools)

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

3. **启动应用**
```powershell
npm start
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
    "width": 1000,
    "height": 680,
    "single": true,
    "autoHideMenuBar": true
  }
}
```

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

详细的插件开发指南请参考：[插件开发AI提示词文档](./sanrenjz-tools插件开发AI提示词，只需增加需求，便可开发属于自己的插件.md)

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
├── 📖 使用说明.md                  # 详细使用说明
└── 📖 sanrenjz-tools插件开发AI提示词，只需增加需求，便可开发属于自己的插件.md
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

**三人聚智工具** - 让效率工具触手可及 🚀