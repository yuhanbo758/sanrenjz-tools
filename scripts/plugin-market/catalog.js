/**
 * 50 个原创插件的唯一目录。生成器、校验器和测试都读取这里，避免名称、入口和批次各自维护。
 */
const groups = [
  [
    ['json-workbench', 'JSON 工作台', '格式化、压缩、校验、路径查询和树形查看 JSON。', '开发工具', ['json', 'JSON格式化', 'json校验']],
    ['config-converter', '配置格式转换', '在 JSON、YAML、TOML 和 Properties 之间进行本地转换。', '开发工具', ['配置转换', 'yaml', 'toml', 'properties']],
    ['xml-workbench', 'XML 工作台', '格式化、压缩、校验和查询 XML 节点。', '开发工具', ['xml', 'XML格式化', 'xml校验']],
    ['codec-assistant', '编解码助手', '处理 Base64、URL、Unicode、HTML 实体和 Hex。', '开发工具', ['编解码', 'base64', 'url编码', 'unicode']],
    ['hash-hmac', '哈希与 HMAC', '生成 MD5、SHA 系列摘要和 HMAC，并进行摘要比对。', '开发工具', ['哈希', 'md5', 'sha256', 'hmac']],
    ['id-generator', 'ID 生成器', '批量生成 UUID、NanoID 和安全随机字符串。', '开发工具', ['uuid', '随机字符串', 'id生成']],
    ['time-converter', '时间转换器', '转换时间戳、ISO 时间、时区并计算日期差。', '开发工具', ['时间戳', '时区转换', '日期差']],
    ['regex-lab', '正则实验室', '实时测试正则匹配、替换、分组和常用表达式。', '开发工具', ['正则', 'regex', '正则替换']],
    ['jwt-inspector', 'JWT 检查器', '本地解码 JWT、检查有效期并验证 HMAC 签名。', '开发工具', ['jwt', 'token解码', 'jwt验证']],
    ['text-diff', '文本差异对比', '提供行级和字符级文本差异对比及结果导出。', '开发工具', ['文本对比', 'diff', '代码对比']]
  ],
  [
    ['batch-renamer', '批量重命名', '预览并执行文件批量重命名，支持替换、序号和撤销。', '文件工具', ['批量重命名', '文件改名', 'rename']],
    ['file-content-search', '文件内容搜索', '递归搜索目录中的文件内容并定位匹配结果。', '文件工具', ['文件搜索', '内容搜索', 'grep']],
    ['folder-compare', '文件夹对比', '按相对路径、大小、修改时间或哈希比较两个目录。', '文件工具', ['文件夹对比', '目录比较', 'folder diff']],
    ['text-encoding', '文本编码转换', '批量转换 UTF-8、GBK、UTF-16、换行符和 BOM。', '文件工具', ['编码转换', 'gbk', 'utf8', '换行符']],
    ['csv-table', 'CSV 表格工具', '编辑、筛选、排序并在 CSV 和 JSON 之间转换。', '办公工具', ['csv', 'csv转json', '表格工具']],
    ['line-processor', '行处理器', '对文本行进行去重、排序、过滤、编号和前后缀处理。', '文本工具', ['行处理', '文本去重', '文本排序']],
    ['directory-tree', '目录树生成器', '生成纯文本、Markdown 或 JSON 格式的目录树。', '文件工具', ['目录树', '文件树', 'tree']],
    ['file-checksum', '文件校验器', '批量生成和验证 SHA-256 文件校验清单。', '文件工具', ['文件校验', 'checksum', 'sha256文件']],
    ['pdf-organizer', 'PDF 页面整理', '本地合并、拆分、旋转、排序和提取 PDF 页面。', '办公工具', ['pdf合并', 'pdf拆分', 'pdf旋转']],
    ['archive-tool', '压缩包工具', '本地创建、预览和安全解压 ZIP 压缩包。', '文件工具', ['zip', '压缩包', '解压']]
  ],
  [
    ['image-compressor', '图片压缩器', '批量压缩图片并实时对比质量和体积。', '图片工具', ['图片压缩', '压缩图片', 'image compress']],
    ['image-converter', '图片格式转换', '在 PNG、JPEG 和 WebP 等常用图片格式之间转换。', '图片工具', ['图片转换', 'webp', 'png转jpg']],
    ['image-resizer', '图片尺寸调整', '按固定尺寸或比例批量缩放图片。', '图片工具', ['图片尺寸', '缩放图片', 'resize']],
    ['image-watermark', '图片水印', '添加文字水印，支持位置、透明度和批量导出。', '图片工具', ['图片水印', '文字水印', 'watermark']],
    ['image-collage', '图片拼接', '将多张图片横向、纵向或按宫格拼接。', '图片工具', ['图片拼接', '长图', '宫格图']],
    ['palette-extractor', '色板提取器', '从图片中提取主色并生成可复制色板。', '设计工具', ['提取颜色', '色板', '主色']],
    ['color-workbench', '颜色工作台', '转换 HEX、RGB、HSL 并检查颜色对比度。', '设计工具', ['颜色转换', '对比度', 'hex', 'rgb']],
    ['qr-barcode', '二维码与条码工具', '本地生成二维码并识别图片中的二维码。', '图片工具', ['二维码', 'qr code', '二维码识别']],
    ['svg-workbench', 'SVG 工作台', '预览、格式化、轻量压缩 SVG 并导出 PNG。', '设计工具', ['svg', 'svg压缩', 'svg转png']],
    ['screenshot-beautifier', '截图美化器', '为截图添加背景、阴影、圆角、留白和设备画框。', '图片工具', ['截图美化', '图片加背景', 'screenshot']]
  ],
  [
    ['markdown-notes', 'Markdown 笔记', '本地 Markdown 笔记、实时预览、标签和全文搜索。', '记录工具', ['markdown笔记', '笔记', 'md']],
    ['floating-notes', '悬浮便签', '创建可置顶、调色和自动保存的多张桌面便签。', '记录工具', ['便签', '悬浮便签', 'sticky note']],
    ['todo-list', '待办清单', '管理分组、优先级、截止日期和完成归档。', '效率工具', ['待办', 'todo', '任务清单']],
    ['pomodoro-focus', '番茄专注', '管理专注与休息周期并保存每日统计。', '效率工具', ['番茄钟', '专注', 'pomodoro']],
    ['calculation-paper', '计算稿纸', '逐行计算表达式、保存变量和复制结果。', '效率工具', ['计算稿纸', '计算器', 'calc']],
    ['unit-converter', '单位换算器', '换算长度、面积、重量、容量、速度和温度。', '效率工具', ['单位换算', '长度换算', '温度换算']],
    ['date-world-clock', '日期与世界时钟', '进行日期推算、工作日计算和世界时区查看。', '效率工具', ['世界时钟', '日期计算', '工作日']],
    ['worklog', '工时日志', '记录项目工时并生成周报和月报。', '效率工具', ['工时', '工作日志', '周报']],
    ['bookmark-launcher', '书签启动器', '分类管理网址，通过别名搜索并快速打开。', '效率工具', ['书签', '网址启动', 'bookmark']],
    ['habit-tracker', '习惯追踪器', '每日习惯打卡、连续天数和本地统计。', '效率工具', ['习惯', '打卡', 'habit']]
  ],
  [
    ['clipboard-history', '剪贴板历史', '保存文本和图片剪贴板历史，支持搜索与收藏。', '系统工具', ['剪贴板', '粘贴板', 'clipboard']],
    ['local-file-search', '本地文件快搜', 'Windows 优先接入 Everything，并提供目录索引回退。', '系统工具', ['本地搜索', 'everything', '文件快搜']],
    ['disk-analyzer', '磁盘空间分析', '分析目录占用、文件类型分布并定位大文件。', '系统工具', ['磁盘分析', '大文件', '空间占用']],
    ['process-monitor', '进程监控器', '按应用查看 CPU 和内存，并在确认后结束进程。', '系统工具', ['进程', '任务管理器', '内存占用']],
    ['port-inspector', '端口检查器', '查看监听端口、对应进程和网络连接状态。', '系统工具', ['端口', 'netstat', '端口占用']],
    ['environment-manager', '环境变量管家', '查看、备份、编辑和恢复用户环境变量。', '系统工具', ['环境变量', 'path', 'env']],
    ['hosts-manager', 'Hosts 配置管家', '管理 Hosts 配置组，修改前自动备份并提示权限。', '系统工具', ['hosts', 'hosts切换', '域名解析']],
    ['lan-transfer', '局域网快传', '通过局域网浏览器传输文字和文件，不经过云端。', '系统工具', ['局域网传输', '文件快传', 'lan']],
    ['image-pinboard', '图片悬浮板', '将剪贴板图片置顶悬浮并支持缩放和透明度。', '系统工具', ['图片悬浮', '贴图', 'pin image']],
    ['project-launcher', '项目启动器', '管理项目目录、启动命令、运行日志和停止操作。', '开发工具', ['项目启动', '服务管理', 'project launcher']]
  ]
];

const kindByBatch = ['text', 'file', 'image', 'productivity', 'system'];
const catalog = groups.flatMap((items, batchIndex) => items.map((item, itemIndex) => ({
  id: item[0],
  folder: `sanrenjz-tools-${item[0]}`,
  name: item[1],
  description: item[2],
  category: item[3],
  keywords: item[4],
  batch: batchIndex + 1,
  order: batchIndex * 10 + itemIndex + 1,
  kind: kindByBatch[batchIndex],
  platforms: ['win32', 'darwin', 'linux']
})));

module.exports = { catalog, groups };
