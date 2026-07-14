const fs = require('fs');
const path = require('path');
const { catalog } = require('./plugin-market/catalog');
const { specs } = require('./plugin-market/ui-specs');

const root = path.resolve(__dirname, '..', 'app', 'software');
const batches = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [2, 3, 4, 5];

// Each row is an explicit product decision: composition, palette, vocabulary, and visual cue.
const designs = {
  'batch-renamer': d('ledger', '#f7f1e5', '#fffdf8', '#efe4cf', '#2f271d', '#776956', '#d9c9aa', '#b45309', '#f59e0b', '重命名账本', ['原文件', '新文件', '冲突检查']),
  'file-content-search': d('search', '#edf6ff', '#ffffff', '#dcecff', '#172554', '#64748b', '#bad6f3', '#2563eb', '#38bdf8', '目录检索', ['路径', '行号', '命中片段']),
  'folder-compare': d('compare', '#f4f0ff', '#ffffff', '#e9e2fb', '#312e81', '#7167a0', '#d6caf0', '#7c3aed', '#c084fc', '双目录镜像', ['左目录', '比较规则', '右目录']),
  'text-encoding': d('pipeline', '#fff7e8', '#fffdfa', '#ffedc7', '#4a2c12', '#8a6744', '#efd39f', '#ea580c', '#fbbf24', '编码流水线', ['读取编码', '换行规范', '目标编码']),
  'csv-table': d('ledger', '#edf9f1', '#ffffff', '#def3e5', '#123524', '#547261', '#b9dfc5', '#15803d', '#4ade80', '数据表', ['字段', '记录', '排序']),
  'line-processor': d('pipeline', '#211a24', '#2d2431', '#171219', '#fce7f3', '#c4a7b8', '#4a394b', '#f43f5e', '#fb7185', '文本工序', ['筛选', '去重与排序', '装饰行']),
  'directory-tree': d('browser', '#eef7f6', '#ffffff', '#dcefed', '#153e3b', '#5c7774', '#bddbd7', '#0f766e', '#2dd4bf', '目录绘制器', ['根目录', '分支', '叶节点']),
  'file-checksum': d('ledger', '#f2f8ff', '#ffffff', '#e4f0fb', '#16324f', '#61788e', '#c8dced', '#0284c7', '#22d3ee', '摘要清单', ['文件', 'SHA-256', '核验']),
  'pdf-organizer': d('stage', '#fff2f2', '#ffffff', '#ffe2e2', '#571b1b', '#956565', '#f2bcbc', '#dc2626', '#fb7185', '页面编排台', ['导入', '排序与旋转', '合并输出']),
  'archive-tool': d('browser', '#f4f1ff', '#ffffff', '#e9e4fb', '#332267', '#71649a', '#d4caf0', '#6d28d9', '#a78bfa', '压缩包浏览器', ['归档文件', '包内路径', '展开位置']),

  'image-compressor': d('compare', '#1a1520', '#251e2b', '#120e16', '#fff1f7', '#cdb6c5', '#493a4c', '#ec4899', '#f59e0b', '质量对照台', ['原始画面', '压缩参数', '输出画面']),
  'image-converter': d('pipeline', '#eefaff', '#ffffff', '#dff5ff', '#164e63', '#5e8591', '#bce9f5', '#0891b2', '#22d3ee', '格式转换舱', ['读取图片', '重编码', '目标格式']),
  'image-resizer': d('stage', '#fdf2ff', '#ffffff', '#f8dcfb', '#581c62', '#93629b', '#edbff1', '#c026d3', '#e879f9', '尺寸舞台', ['原始边界', '宽高约束', '缩放画布']),
  'image-watermark': d('stage', '#fff0f6', '#ffffff', '#ffdeeb', '#5b1733', '#976178', '#f2b8d0', '#db2777', '#fb7185', '水印叠层', ['素材层', '文字层', '合成层']),
  'image-collage': d('gallery', '#151321', '#211d31', '#0e0c17', '#f5f3ff', '#b9b3d2', '#403957', '#8b5cf6', '#f472b6', '拼图工作室', ['图片槽位', '宫格间距', '组合画布']),
  'palette-extractor': d('gallery', '#fffbeb', '#ffffff', '#fef3c7', '#4b3411', '#8b754b', '#eedb9f', '#d97706', '#facc15', '色板画廊', ['采样图', '颜色簇', '色值']),
  'color-workbench': d('compare', '#082f36', '#0f4149', '#06232a', '#ecfeff', '#9bc9cd', '#28616a', '#22d3ee', '#a3e635', '对比度实验室', ['前景色', '对比关系', '背景色']),
  'qr-barcode': d('gallery', '#effdf4', '#ffffff', '#dcfce7', '#14532d', '#5d846a', '#b7e8c5', '#16a34a', '#4ade80', '码图工作室', ['内容', '纠错与尺寸', '码图']),
  'svg-workbench': d('stage', '#111827', '#1f2937', '#0b1220', '#f8fafc', '#a9b4c5', '#37475e', '#38bdf8', '#a78bfa', '矢量舞台', ['SVG 源码', '视口', '像素导出']),
  'screenshot-beautifier': d('dashboard', '#fff6ed', '#ffffff', '#ffead5', '#4c2a14', '#8c6a50', '#f2cfad', '#ea580c', '#fb923c', '样机控制台', ['截图', '外观参数', '成品']),

  'markdown-notes': d('notebook', '#f8f1df', '#fffdf7', '#eee3c8', '#3f3524', '#7d715e', '#d9c9a8', '#9a6b22', '#d4a246', '双页笔记本', ['属性页', '编辑页', '阅读页']),
  'floating-notes': d('board', '#fff7bf', '#fffbe0', '#f8e97e', '#4a3c08', '#806f28', '#e5d15a', '#ca8a04', '#facc15', '桌面便签墙', ['写便签', '选择纸色', '贴上墙']),
  'todo-list': d('board', '#edf5ff', '#ffffff', '#dcecff', '#172554', '#60789a', '#bfd6f2', '#2563eb', '#60a5fa', '任务看板', ['待处理', '进行中', '已归档']),
  'pomodoro-focus': d('gauge', '#fff0f0', '#ffffff', '#ffdddd', '#5f1717', '#9a6262', '#f2baba', '#e11d48', '#fb7185', '专注仪表', ['专注', '短休息', '本轮目标']),
  'calculation-paper': d('notebook', '#f2f3f5', '#ffffff', '#e4e6e9', '#23272f', '#707781', '#cdd1d6', '#4b5563', '#9ca3af', '计算稿纸', ['变量', '逐行算式', '计算轨迹']),
  'unit-converter': d('gauge', '#ecfdf5', '#ffffff', '#d1fae5', '#064e3b', '#548276', '#abe2cf', '#059669', '#34d399', '单位天平', ['源单位', '换算比', '目标单位']),
  'date-world-clock': d('gauge', '#111b3d', '#192653', '#0b1330', '#e0e7ff', '#9eadd7', '#314273', '#6366f1', '#38bdf8', '世界时钟墙', ['日期推算', '工作日', '目标时区']),
  'worklog': d('ledger', '#f7efe6', '#fffdf9', '#ede0d2', '#422f21', '#806b5b', '#d8c5b3', '#a16207', '#d6a34a', '工时账簿', ['日期', '项目', '分钟']),
  'bookmark-launcher': d('search', '#f4efff', '#ffffff', '#e9dfff', '#3b2165', '#78619c', '#d4c3ee', '#7c3aed', '#c084fc', '网址启动台', ['别名', '网址', '分组']),
  'habit-tracker': d('board', '#effaf0', '#ffffff', '#dcf3df', '#174327', '#5f8069', '#bde0c4', '#16a34a', '#86efac', '习惯日历', ['今日', '连续打卡', '历史']),

  'clipboard-history': d('timeline', '#f7f8fa', '#ffffff', '#eaedf1', '#20242b', '#6b7280', '#d5d9df', '#475569', '#94a3b8', '剪贴板时间流', ['刚刚', '文本与图片', '更早']),
  'local-file-search': d('search', '#0b2135', '#102d47', '#071827', '#e0f2fe', '#9bbbd1', '#274b67', '#38bdf8', '#2dd4bf', '文件命令台', ['关键字', '索引来源', '路径']),
  'disk-analyzer': d('dashboard', '#10233a', '#17304d', '#0b1a2c', '#e2eefb', '#9ab0c7', '#294765', '#0ea5e9', '#22d3ee', '存储仪表盘', ['容量', '类型分布', '大文件']),
  'process-monitor': d('dashboard', '#20252b', '#2a3037', '#171b20', '#f3f4f6', '#aeb5bd', '#414952', '#22c55e', '#4ade80', '进程仪表盘', ['CPU', '内存', 'PID']),
  'port-inspector': d('console', '#08140d', '#0d2115', '#050c08', '#d1fae5', '#76a789', '#1d472c', '#22c55e', '#86efac', '网络端口台', ['监听地址', '状态', '进程']),
  'environment-manager': d('console', '#f5f0ff', '#ffffff', '#ebe3fb', '#35235f', '#75649a', '#d7caef', '#7c3aed', '#a78bfa', '变量编辑器', ['变量名', '当前值', '恢复值']),
  'hosts-manager': d('notebook', '#16223c', '#1d2d4e', '#0f192d', '#e0e7ff', '#9aa9ca', '#34466b', '#3b82f6', '#60a5fa', 'Hosts 配置册', ['域名映射', '配置组', '自动备份']),
  'lan-transfer': d('console', '#eafbf9', '#ffffff', '#d2f4ef', '#134e4a', '#5a827e', '#aee2da', '#0d9488', '#2dd4bf', '局域网传输室', ['服务地址', '配对设备', '接收队列']),
  'image-pinboard': d('browser', '#242126', '#302b32', '#181619', '#faf5ff', '#bdb2c2', '#4a424c', '#d946ef', '#c084fc', '桌面贴图板', ['剪贴板', '透明度', '置顶画面']),
  'project-launcher': d('console', '#161b22', '#21262d', '#0d1117', '#f0f6fc', '#8b949e', '#30363d', '#2f81f7', '#58a6ff', '项目控制台', ['工作目录', '启动命令', '运行日志'])
};

function migrate() {
  const selected = catalog.filter(plugin => batches.includes(plugin.batch));
  for (const plugin of selected) {
    const design = designs[plugin.id];
    if (!design) throw new Error(`Missing independent view design: ${plugin.id}`);
    const directory = path.join(root, plugin.folder);
    fs.writeFileSync(path.join(directory, 'index.html'), createPage(plugin, design), 'utf8');
    fs.copyFileSync(path.resolve(__dirname, 'plugin-market', 'templates', 'renderer.js'), path.join(directory, 'renderer.js'));
    const stylePath = path.join(directory, 'styles.css');
    if (fs.existsSync(stylePath)) fs.rmSync(stylePath);
  }
  console.log(`Independent views migrated: batches ${batches.join(', ')}, ${selected.length} plugins.`);
}

function d(family, bg, panel, surface, text, muted, border, accent, accent2, scene, cues) {
  return { family, bg, panel, surface, text, muted, border, accent, accent2, scene, cues };
}

function createPage(plugin, design) {
  const ui = specs[plugin.id];
  const parts = createParts(plugin, design, ui);
  const content = compositions[design.family](parts, design);
  const css = `${createCss(design, plugin.order)}${createTitleBarCss(design)}`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${plugin.name}</title><style>${css}</style></head>
<body data-composition="${plugin.id}" data-family="${design.family}">${content}<script src="renderer.js"></script></body></html>\n`;
}

function createTitleBarCss(design) {
  if (!isDark(design.bg)) return '';
  return `.custom-title-bar{background:${design.bg}!important;border-bottom-color:${design.border}!important}.title-bar-title,.title-bar-pin-button,.window-control-button{color:${design.text}!important}.title-bar-pin-button:hover,.window-control-button:hover{background:${design.panel}!important}`;
}

function isDark(color) {
  const value = color.replace('#', '');
  const [red, green, blue] = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 < 125;
}

function createParts(plugin, design, ui) {
  const identity = `<div class="identity" data-plugin-heading><img id="pluginLogo" src="logo.svg" alt=""><div><span id="category" class="category">${plugin.category}</span><h1 id="title">${plugin.name}</h1><p id="description">${plugin.description}</p></div></div>`;
  const status = `<div id="status" class="status" aria-live="polite"><span class="status-dot"></span><span class="status-text">${ui.inputTitle}等待内容</span></div>`;
  const controls = `<aside class="module controls-panel" data-region="controls"><div class="module-title"><span>${design.scene}</span><strong>${ui.controlsTitle}</strong></div><div id="controls" class="controls"></div></aside>`;
  const editor = `<section class="module editor-panel" data-region="editor"><div class="module-title"><span id="inputCount">0 字符</span><strong id="inputLabel">${ui.inputTitle}</strong><small id="inputHint">${inputHint(plugin.id, ui)}</small></div><div class="editor-surface"><textarea id="inputText" spellcheck="false"></textarea><div id="dropHint" class="drop-hint" hidden>松开以加入当前队列</div></div><div class="actions editor-actions"><button id="runButton" class="primary">${runLabel(plugin.id)}</button><button id="previewButton">${previewLabel(plugin.id)}</button><button id="clearButton" class="ghost">清空</button></div></section>`;
  const result = `<section class="module result-panel" data-region="result"><div class="module-title"><span id="resultCount">等待内容</span><strong id="resultLabel">${ui.resultTitle}</strong></div><div class="result-surface"><div id="emptyState" class="empty-state"><img src="logo.svg" alt=""><strong>${design.scene}</strong><span>${emptyHint(plugin.id, ui)}</span></div><pre id="outputText" hidden></pre><canvas id="previewCanvas" hidden></canvas><div id="cards" class="cards" hidden></div></div><div class="actions result-actions"><button id="copyButton">复制</button><button id="saveButton">保存</button><button id="exportButton" class="ghost">导出</button></div></section>`;
  const cue = `<div class="semantic-cue" aria-hidden="true">${design.cues.map(item => `<span>${item}</span>`).join('')}</div>`;
  return { identity, status, controls, editor, result, cue };
}

const compositions = {
  ledger: (p) => `<main class="shell ledger-shell"><aside class="ledger-sidebar">${p.identity}${p.controls}</aside><section class="ledger-work"><div class="ledger-strip">${p.cue}${p.status}</div><div class="ledger-pages">${p.editor}${p.result}</div></section></main>`,
  search: (p) => `<main class="shell search-shell"><header class="search-heading">${p.identity}${p.status}</header><section class="query-ribbon">${p.editor}</section><section class="search-results"><nav class="filter-rail">${p.controls}</nav>${p.result}</section>${p.cue}</main>`,
  compare: (p) => `<main class="shell compare-shell"><header class="compare-heading">${p.identity}${p.status}</header><section class="compare-deck"><div class="compare-source">${p.editor}</div><div class="compare-bridge">${p.cue}${p.controls}</div><div class="compare-target">${p.result}</div></section></main>`,
  pipeline: (p) => `<main class="shell pipeline-shell"><aside class="pipeline-rail">${p.identity}${p.controls}${p.status}</aside><section class="pipeline-track">${p.cue}<div class="pipeline-flow">${p.editor}${p.result}</div></section></main>`,
  browser: (p) => `<main class="shell browser-shell"><header class="browser-bar">${p.identity}${p.status}</header><section class="browser-frame"><nav class="browser-tree">${p.controls}${p.cue}</nav><div class="browser-preview">${p.result}</div><footer class="browser-command">${p.editor}</footer></section></main>`,
  stage: (p) => `<main class="shell stage-shell"><header class="stage-heading">${p.identity}${p.status}</header><section class="stage-room"><aside class="stage-dock">${p.controls}${p.editor}</aside><div class="stage-canvas">${p.cue}${p.result}</div></section></main>`,
  gallery: (p) => `<main class="shell gallery-shell"><header class="gallery-heading">${p.identity}${p.controls}</header><section class="gallery-wall">${p.result}<aside class="gallery-drop">${p.editor}${p.cue}${p.status}</aside></section></main>`,
  notebook: (p) => `<main class="shell notebook-shell"><aside class="notebook-index">${p.identity}${p.controls}${p.status}</aside><section class="notebook-spread"><div class="paper-left">${p.editor}</div><div class="paper-right">${p.result}</div><div class="bookmark">${p.cue}</div></section></main>`,
  board: (p) => `<main class="shell board-shell"><header class="board-heading">${p.identity}${p.status}</header><section class="board-composer">${p.editor}${p.controls}</section><section class="board-lanes">${p.cue}${p.result}</section></main>`,
  gauge: (p) => `<main class="shell gauge-shell"><aside class="gauge-settings">${p.identity}${p.controls}</aside><section class="gauge-face">${p.cue}${p.result}</section><footer class="gauge-entry">${p.editor}${p.status}</footer></main>`,
  dashboard: (p) => `<main class="shell dashboard-shell"><header class="dashboard-heading">${p.identity}${p.cue}${p.status}</header><aside class="dashboard-controls">${p.controls}${p.editor}</aside><section class="dashboard-main">${p.result}</section></main>`,
  console: (p) => `<main class="shell console-shell"><header class="console-heading">${p.identity}${p.status}</header><section class="console-command">${p.editor}</section><aside class="console-inspector">${p.controls}${p.cue}</aside><section class="console-output">${p.result}</section></main>`,
  timeline: (p) => `<main class="shell timeline-shell"><header class="timeline-heading">${p.identity}${p.status}${p.controls}</header><section class="timeline-stream">${p.cue}${p.result}</section><aside class="timeline-filter">${p.editor}</aside></main>`
};

function inputHint(id, ui) {
  const hints = {
    'batch-renamer': '目录由命名规则生成新旧名称对照', 'folder-compare': '补充本次比较说明', 'image-compressor': '选择图片后检查原始画面',
    'markdown-notes': '在稿纸上编写 Markdown', 'pomodoro-focus': '写下这一轮唯一目标', 'local-file-search': '输入文件名关键字',
    'process-monitor': '可按 PID 缩小观察范围', 'lan-transfer': '输入要发送到同一网络的文字', 'project-launcher': '记录启动参数或项目备注'
  };
  return hints[id] || `${ui.inputTitle}可输入文字或接收已选择的文件`;
}

function emptyHint(id, ui) {
  const hints = {
    'batch-renamer': '先选择目录，再核对每一组新旧文件名', 'file-content-search': '匹配项会按文件路径和行号列出', 'folder-compare': '差异将沿相对路径对齐',
    'image-compressor': '压缩画面将在此与原图并排核对', 'image-collage': '加入图片后生成宫格或长图', 'palette-extractor': '主色会以可点击色块陈列',
    'todo-list': '新增任务后按分组查看', 'pomodoro-focus': '设定周期后显示本轮倒计时', 'date-world-clock': '日期推算与目标时区会在这里汇合',
    'clipboard-history': '新的剪贴板项目按时间进入列表', 'disk-analyzer': '扫描后查看容量、类型和大文件', 'process-monitor': '进程按内存占用排序',
    'port-inspector': '监听端口与所属进程将在终端中列出', 'lan-transfer': '启动服务后显示访问地址和接收记录', 'project-launcher': '启动状态与进程日志将在此更新'
  };
  return hints[id] || `${ui.resultTitle}会在执行或预览后显示`;
}

function runLabel(id) {
  if (['pomodoro-focus'].includes(id)) return '开始计时';
  if (['todo-list', 'habit-tracker', 'worklog', 'bookmark-launcher', 'floating-notes', 'markdown-notes'].includes(id)) return '加入记录';
  if (['local-file-search', 'file-content-search'].includes(id)) return '搜索';
  if (['disk-analyzer', 'process-monitor', 'port-inspector'].includes(id)) return '扫描';
  if (id === 'lan-transfer') return '启动服务';
  if (id === 'project-launcher') return '运行命令';
  return '执行';
}

function previewLabel(id) {
  if (['batch-renamer', 'text-encoding', 'pdf-organizer', 'archive-tool', 'environment-manager', 'hosts-manager'].includes(id)) return '检查变更';
  if (['image-compressor', 'image-resizer', 'image-watermark', 'image-collage', 'screenshot-beautifier'].includes(id)) return '查看画面';
  return '预览';
}

function createCss(v, order) {
  const radius = [6, 10, 14, 18][order % 4];
  return `:root{--bg:${v.bg};--panel:${v.panel};--surface:${v.surface};--text:${v.text};--muted:${v.muted};--border:${v.border};--accent:${v.accent};--accent-2:${v.accent2};--radius:${radius}px}*{box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{margin:0;padding-top:32px!important;background:var(--bg);color:var(--text);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.shell{height:calc(100vh - 32px);min-width:0;min-height:0;padding:12px;gap:10px;overflow:hidden;background:radial-gradient(circle at 88% 8%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 28%),var(--bg)}button,input,select,textarea{-webkit-app-region:no-drag;font:inherit;color:inherit}.identity{min-width:0;display:flex;align-items:center;gap:10px}.identity img{width:40px;height:40px;flex:0 0 40px;border-radius:calc(var(--radius) + 2px);box-shadow:0 8px 24px color-mix(in srgb,var(--accent) 25%,transparent)}h1{margin:1px 0 0;font-size:19px;line-height:1.1;letter-spacing:-.25px}.identity p{max-width:620px;margin:3px 0 0;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.category{color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.12em}.status{display:flex;align-items:center;gap:7px;min-width:0;max-width:260px;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden}.status-text{overflow:hidden;text-overflow:ellipsis}.status-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}.status.success .status-dot{background:#22c55e}.status.error .status-dot{background:#ef4444}.module{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border);border-radius:var(--radius);background:var(--panel);box-shadow:0 10px 28px color-mix(in srgb,var(--text) 7%,transparent)}.module-title{min-height:42px;flex:0 0 auto;padding:9px 11px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 10px}.module-title strong{font-size:13px}.module-title>span,.module-title small{color:var(--muted);font-size:10px}.module-title small{grid-column:1/-1}.controls{padding:10px;overflow:auto}.control-title{margin-bottom:8px;color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.12em}.control-group{margin-bottom:8px}.control-group label{display:block;margin-bottom:4px;color:var(--muted);font-size:11px}.control-group input,.control-group select,.control-group textarea,.control-group button{width:100%}.control-group input,.control-group select,.control-group textarea{border:1px solid var(--border);border-radius:7px;background:var(--surface);padding:7px 8px;outline:none}.control-group input:focus,.control-group select:focus,.control-group textarea:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 13%,transparent)}.hint{margin:5px 0 0;color:var(--muted);font-size:10px}.editor-surface,.result-surface{position:relative;flex:1;min-height:0;background:var(--surface);overflow:auto}.editor-surface textarea{width:100%;height:100%;min-height:100%;resize:none;border:0;outline:0;background:transparent;padding:12px;color:var(--text);font:12px/1.6 Consolas,"SFMono-Regular",monospace}.drop-hint{position:absolute;inset:9px;display:grid;place-items:center;border:2px dashed var(--accent);border-radius:var(--radius);background:color-mix(in srgb,var(--panel) 90%,transparent);color:var(--accent);font-weight:700}.result-surface{display:grid;place-items:stretch;padding:10px}.result-surface pre{width:100%;height:100%;margin:0;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.55 Consolas,"SFMono-Regular",monospace}.result-surface canvas{max-width:100%;max-height:100%;margin:auto;object-fit:contain}.empty-state{height:100%;display:grid;place-content:center;justify-items:center;gap:7px;text-align:center;color:var(--muted)}.empty-state img{width:48px;height:48px;opacity:.75}.empty-state strong{color:var(--text);font-size:15px}.cards{width:100%;height:100%;overflow:auto;display:grid;align-content:start;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.card{padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--panel)}.card small{display:block;margin-top:4px;color:var(--muted)}.card-actions,.actions{display:flex;gap:7px}.card-actions{margin-top:8px}.actions{flex:0 0 auto;padding:8px 10px;border-top:1px solid var(--border)}button{border:1px solid var(--border);border-radius:7px;background:var(--surface);padding:6px 10px;cursor:pointer}button:hover{border-color:var(--accent);color:var(--accent)}button.primary{border-color:var(--accent);background:var(--accent);color:#fff}.ghost{background:transparent}.semantic-cue{display:flex;align-items:center;gap:5px;min-width:0}.semantic-cue span{min-width:0;padding:4px 7px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ledger-shell,.pipeline-shell,.notebook-shell{display:grid;grid-template-columns:245px 1fr}.ledger-sidebar,.pipeline-rail,.notebook-index{min-height:0;display:flex;flex-direction:column;gap:10px}.ledger-sidebar .controls-panel,.pipeline-rail .controls-panel,.notebook-index .controls-panel{flex:1}.ledger-work{min-height:0;display:grid;grid-template-rows:36px 1fr;gap:8px}.ledger-strip,.browser-bar,.stage-heading,.compare-heading,.board-heading,.console-heading,.timeline-heading,.search-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.ledger-pages{min-height:0;display:grid;grid-template-rows:minmax(190px,.65fr) minmax(260px,1.35fr);gap:9px}.search-shell{display:grid;grid-template-rows:46px 210px 1fr;position:relative}.query-ribbon,.query-ribbon>.module{min-height:0}.search-results{min-height:0;display:grid;grid-template-columns:250px 1fr;gap:10px}.filter-rail,.filter-rail>.module{min-height:0}.search-shell>.semantic-cue{position:absolute;right:16px;top:68px}.compare-shell{display:grid;grid-template-rows:46px 1fr}.compare-deck{min-height:0;display:grid;grid-template-columns:minmax(330px,1fr) 245px minmax(390px,1.15fr);gap:10px}.compare-source,.compare-target,.compare-source>.module,.compare-target>.module{min-height:0;height:100%}.compare-bridge{min-height:0;display:flex;flex-direction:column;gap:8px}.compare-bridge .controls-panel{flex:1}.compare-bridge .semantic-cue{flex-direction:column;align-items:stretch}.pipeline-track{min-height:0;display:grid;grid-template-rows:34px 1fr;gap:8px}.pipeline-track>.semantic-cue span{flex:1;text-align:center}.pipeline-flow{min-height:0;display:grid;grid-template-columns:minmax(330px,.85fr) minmax(430px,1.15fr);gap:10px}.browser-shell{display:grid;grid-template-rows:46px 1fr}.browser-frame{min-height:0;display:grid;grid-template-columns:245px 1fr;grid-template-rows:1fr 190px;gap:10px}.browser-tree{grid-row:1/3;min-height:0;display:flex;flex-direction:column;gap:8px}.browser-tree .controls-panel{flex:1}.browser-tree .semantic-cue{flex-direction:column;align-items:stretch}.browser-preview,.browser-preview>.module,.browser-command,.browser-command>.module{min-height:0;height:100%}.stage-shell{display:grid;grid-template-rows:46px 1fr}.stage-room{min-height:0;display:grid;grid-template-columns:310px 1fr;gap:10px}.stage-dock{min-height:0;display:grid;grid-template-rows:auto minmax(220px,1fr);gap:10px}.stage-dock .controls-panel{max-height:310px}.stage-canvas{min-height:0;display:grid;grid-template-rows:30px 1fr;gap:7px}.gallery-shell{display:grid;grid-template-rows:auto 1fr}.gallery-heading{min-height:0;display:grid;grid-template-columns:280px 1fr;gap:10px}.gallery-heading .controls-panel{max-height:175px}.gallery-wall{min-height:0;display:grid;grid-template-columns:1fr 310px;gap:10px}.gallery-drop{min-height:0;display:grid;grid-template-rows:1fr auto auto;gap:8px}.notebook-spread{position:relative;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:8px;border-radius:var(--radius);background:var(--border)}.paper-left,.paper-right,.paper-left>.module,.paper-right>.module{min-height:0;height:100%}.bookmark{position:absolute;right:18px;top:2px;z-index:2}.board-shell{display:grid;grid-template-rows:46px 205px 1fr;background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--accent) 17%,transparent) 1px,transparent 1.5px);background-size:22px 22px}.board-composer{min-height:0;display:grid;grid-template-columns:1fr 300px;gap:10px}.board-lanes{min-height:0;display:grid;grid-template-rows:28px 1fr;gap:7px}.board-lanes>.semantic-cue span{flex:1;text-align:center}.gauge-shell{display:grid;grid-template-columns:260px 1fr;grid-template-rows:1fr 205px}.gauge-settings{grid-row:1/3;min-height:0;display:flex;flex-direction:column;gap:10px}.gauge-settings .controls-panel{flex:1}.gauge-face{min-height:0;display:grid;grid-template-rows:30px 1fr;gap:8px}.gauge-face>.semantic-cue{justify-content:center}.gauge-face>.semantic-cue span{min-width:110px;text-align:center}.gauge-entry{min-height:0;display:grid;grid-template-columns:1fr 220px;gap:10px;align-items:stretch}.gauge-entry .status{align-self:center;padding:12px}.dashboard-shell{display:grid;grid-template-columns:300px 1fr;grid-template-rows:52px 1fr}.dashboard-heading{grid-column:1/3;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:15px}.dashboard-controls{min-height:0;display:grid;grid-template-rows:auto 1fr;gap:10px}.dashboard-controls .controls-panel{max-height:330px}.dashboard-main,.dashboard-main>.module{min-height:0;height:100%}.console-shell{display:grid;grid-template-columns:270px 1fr;grid-template-rows:46px 185px 1fr}.console-heading{grid-column:1/3}.console-command{grid-column:1/3;min-height:0}.console-command>.module{height:100%}.console-inspector{min-height:0;display:flex;flex-direction:column;gap:8px}.console-inspector .controls-panel{flex:1}.console-inspector .semantic-cue{flex-direction:column;align-items:stretch}.console-output,.console-output>.module{min-height:0;height:100%}.timeline-shell{display:grid;grid-template-columns:1fr 300px;grid-template-rows:auto 1fr}.timeline-heading{grid-column:1/3}.timeline-heading .controls-panel{width:300px;max-height:170px}.timeline-stream{min-height:0;display:grid;grid-template-columns:90px 1fr;gap:8px}.timeline-stream>.semantic-cue{flex-direction:column;align-items:stretch;padding-top:12px}.timeline-filter,.timeline-filter>.module{min-height:0;height:100%}@media(max-width:880px){.shell{padding:8px;gap:7px}.identity p,.semantic-cue{display:none}.ledger-shell,.pipeline-shell,.notebook-shell{grid-template-columns:210px 1fr}.compare-deck{grid-template-columns:1fr 205px 1fr}.stage-room{grid-template-columns:250px 1fr}.gallery-wall{grid-template-columns:1fr 250px}.dashboard-shell{grid-template-columns:250px 1fr}.console-shell{grid-template-columns:230px 1fr}}`;
}

migrate();
