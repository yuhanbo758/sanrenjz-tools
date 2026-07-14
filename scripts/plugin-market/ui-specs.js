/**
 * 50 个插件各自的界面设计规格。
 *
 * 这里不是“换颜色模板”：每个工具都明确声明自己的信息架构、视觉隐喻和三块工作区域名称。
 * 生成器只负责把这些人工设计规格稳定落盘，避免后续重建插件时覆盖独立界面。
 */
const rows = [
  ['json-workbench','code-studio','代码编辑台','查询与格式','JSON 源码','树形结果'],
  ['config-converter','bridge','格式转换桥','格式映射','源配置','目标配置'],
  ['xml-workbench','inspector','节点检查器','文档操作','XML 文档','节点结构'],
  ['codec-assistant','tab-lab','多制式编码台','编码制式','原始数据','编码结果'],
  ['hash-hmac','security-console','摘要安全台','算法与密钥','待摘要文本','指纹结果'],
  ['id-generator','generator-deck','批量生成器','生成规则','生成备注','ID 卡片'],
  ['time-converter','timeline','时间轴换算','时区设置','时间输入','换算时间轴'],
  ['regex-lab','testbench','正则试验台','表达式参数','测试文本','匹配分组'],
  ['jwt-inspector','token-inspector','令牌解剖台','验证设置','JWT 令牌','声明与签名'],
  ['text-diff','diff-split','双栏差异台','对比规则','左侧文本','差异标记'],
  ['batch-renamer','rename-table','文件改名清单','命名规则','文件队列','新旧名称预览'],
  ['file-content-search','search-results','内容检索台','检索条件','搜索补充','匹配位置'],
  ['folder-compare','twin-tree','双目录镜像','比较选项','目录说明','差异目录树'],
  ['text-encoding','batch-pipeline','编码流水线','转换管线','文件清单','转换报告'],
  ['csv-table','spreadsheet','轻量数据表','表格设置','CSV 数据','表格预览'],
  ['line-processor','line-workbench','行处理工作台','处理步骤','原始行','处理后行'],
  ['directory-tree','tree-preview','目录树绘制器','输出样式','过滤说明','目录树预览'],
  ['file-checksum','manifest-check','校验清单台','校验范围','文件备注','哈希清单'],
  ['pdf-organizer','page-sorter','页面编排台','页面操作','PDF 队列','页面序列'],
  ['archive-tool','archive-browser','压缩包浏览器','压缩设置','文件队列','包内目录'],
  ['image-compressor','compression-compare','压缩对比台','质量参数','原图区域','压缩预览'],
  ['image-converter','format-carousel','格式转换舱','目标格式','图片来源','格式预览'],
  ['image-resizer','resize-stage','尺寸舞台','画布尺寸','图片来源','缩放预览'],
  ['image-watermark','watermark-canvas','水印画布','水印属性','素材区','合成预览'],
  ['image-collage','collage-grid','拼图工作室','网格参数','图片集合','拼接画布'],
  ['palette-extractor','palette-gallery','色板画廊','取色设置','图片来源','主色色板'],
  ['color-workbench','color-lab','颜色实验室','颜色参数','色值输入','无障碍报告'],
  ['qr-barcode','qr-studio','码图工作室','码制设置','文本或图片','二维码画布'],
  ['svg-workbench','vector-stage','矢量舞台','导出参数','SVG 源码','矢量预览'],
  ['screenshot-beautifier','mockup-stage','截图样机台','外观参数','截图素材','成品画布'],
  ['markdown-notes','notebook','沉浸笔记本','笔记属性','Markdown 编辑','阅读预览'],
  ['floating-notes','sticky-board','便签墙','便签外观','速记内容','便签集合'],
  ['todo-list','kanban','任务看板','任务属性','新建任务','分组看板'],
  ['pomodoro-focus','focus-dial','专注仪表盘','周期设置','本轮目标','专注计时'],
  ['calculation-paper','paper-calculator','计算稿纸','变量区域','逐行算式','计算轨迹'],
  ['unit-converter','converter-scale','单位天平','单位选择','数值输入','换算读数'],
  ['date-world-clock','clock-wall','世界时钟墙','日期规则','日期输入','时区卡片'],
  ['worklog','timesheet','工时表','记录字段','工作说明','工时报表'],
  ['bookmark-launcher','bookmark-grid','网址启动台','书签属性','网址备注','书签网格'],
  ['habit-tracker','streak-calendar','习惯日历','习惯设置','今日记录','连续打卡'],
  ['clipboard-history','clipboard-stream','剪贴板流','记录设置','筛选文本','历史时间线'],
  ['local-file-search','search-command','文件命令台','索引范围','快速搜索','文件结果'],
  ['disk-analyzer','storage-dashboard','存储仪表盘','扫描范围','分析备注','空间分布'],
  ['process-monitor','process-dashboard','进程仪表盘','进程操作','PID / 筛选','资源列表'],
  ['port-inspector','network-table','网络端口台','扫描选项','端口筛选','连接表格'],
  ['environment-manager','env-editor','变量编辑器','变量字段','编辑说明','变量清单'],
  ['hosts-manager','host-switchboard','Hosts 切换台','配置操作','Hosts 内容','配置组'],
  ['lan-transfer','transfer-room','局域网传输室','服务设置','传输文字','配对与队列'],
  ['image-pinboard','pinboard-stage','桌面贴图板','悬浮设置','剪贴板图片','置顶画布'],
  ['project-launcher','project-console','项目控制台','运行设置','命令与备注','状态与日志']
];

const compositions = ['studio','split','inspector','tabs','console','deck','timeline','testbench','table','canvas','board','dashboard'];
const specs = Object.fromEntries(rows.map((row, index) => [row[0], {
  id: row[1],
  metaphor: row[2],
  controlsTitle: row[3],
  inputTitle: row[4],
  resultTitle: row[5],
  composition: compositions[index % compositions.length],
  // 每个插件使用不同的圆角、密度和背景纹理，形成可辨识的视觉性格。
  radius: [8, 12, 16, 22, 28][index % 5],
  density: ['compact', 'balanced', 'airy'][index % 3],
  motif: ['grid', 'dots', 'lines', 'glow', 'plain'][index % 5]
}]));

module.exports = { specs };
