const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { catalog } = require('./plugin-market/catalog');
const { specs } = require('./plugin-market/ui-specs');

const root = path.resolve(__dirname, '..');
const pluginRoot = path.join(root, 'app', 'software');
const templateRoot = path.join(__dirname, 'plugin-market', 'templates');
const requested = process.argv[2] || 'all';
const batch = requested === 'all' ? null : Number(requested);
if (batch !== null && (!Number.isInteger(batch) || batch < 1 || batch > 5)) {
  throw new Error('批次参数必须是 all 或 1-5');
}

const selected = catalog.filter(plugin => batch === null || plugin.batch === batch);
for (const plugin of selected) generatePlugin(plugin);
console.log(`已生成 ${selected.length} 个插件：${batch === null ? '全部批次' : `第 ${batch} 批`}`);

function generatePlugin(plugin) {
  const target = path.join(pluginRoot, plugin.folder);
  const visual = visualFor(plugin);
  const ui = specs[plugin.id];
  if (!ui) throw new Error(`缺少独立界面规格：${plugin.id}`);
  const generatedProfile = { ...plugin, visual, ui };
  fs.mkdirSync(target, { recursive: true });
  for (const fileName of ['preload.js', 'renderer.js']) {
    fs.copyFileSync(path.join(templateRoot, fileName), path.join(target, fileName));
  }
  fs.writeFileSync(path.join(target, 'index.html'), createHtml(plugin, ui), 'utf8');
  fs.writeFileSync(path.join(target, 'styles.css'), createStyles(plugin, ui, visual), 'utf8');

  fs.writeFileSync(path.join(target, 'profile.json'), `${JSON.stringify(generatedProfile, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(target, 'plugin.json'), `${JSON.stringify(createManifest(plugin), null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(target, 'README.md'), createReadme(plugin, ui), 'utf8');
  fs.writeFileSync(path.join(target, 'logo.svg'), createSvg(plugin, visual), 'utf8');
  fs.writeFileSync(path.join(target, 'logo.png'), createPng(256, 256, hexToRgb(visual.accent)));
  fs.writeFileSync(path.join(target, 'logo.ico'), createIco(visual.accent));
  copyLicenses(plugin, target);
}

function createHtml(plugin, ui) {
  const heading = (index, title, hint, counter = '') => `<div class="panel-heading"><span class="step-index">${index}</span><div><strong>${title}</strong><small>${hint}</small></div>${counter}</div>`;
  const controls = `<aside class="panel controls-panel">${heading('01', ui.controlsTitle, `专为${plugin.name}设计的操作区`)}<div id="controls" class="controls"></div></aside>`;
  const editor = `<section class="panel editor-panel">${heading('02', `<span id="inputLabel">${ui.inputTitle}</span>`, '<span id="inputHint">输入、粘贴或选择本地数据</span>', '<span id="inputCount" class="counter">0 字符</span>')}<div class="editor-surface"><textarea id="inputText" spellcheck="false" placeholder="在这里输入内容……"></textarea><div id="dropHint" class="drop-hint" hidden>拖放文件到这里</div></div><div class="action-row editor-actions"><button id="runButton" class="primary">开始处理</button><button id="previewButton" class="secondary">安全预览</button><button id="clearButton" class="ghost">清空</button></div></section>`;
  const result = `<section class="panel result-panel">${heading('03', `<span id="resultLabel">${ui.resultTitle}</span>`, '结果可复制、保存或导出', '<span id="resultCount" class="counter">等待处理</span>')}<div class="result-surface"><div id="emptyState" class="empty-state"><img src="logo.svg" alt=""><strong>${ui.metaphor}</strong><span>配置参数后开始本地处理</span></div><pre id="outputText" tabindex="0" hidden></pre><canvas id="previewCanvas" hidden></canvas><div id="cards" class="cards" hidden></div></div><div class="action-row result-actions"><button id="saveButton" class="secondary">保存结果</button><button id="exportButton" class="ghost">导出数据</button></div></section>`;
  const orders = {
    studio: [controls, editor, result], split: [editor, result, controls], inspector: [editor, controls, result], tabs: [controls, result, editor],
    console: [result, editor, controls], deck: [controls, result, editor], timeline: [editor, controls, result], testbench: [editor, result, controls],
    table: [controls, editor, result], canvas: [controls, result, editor], board: [editor, result, controls], dashboard: [result, controls, editor]
  };
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${plugin.name}</title><link rel="stylesheet" href="styles.css"></head>
<body class="ui-${ui.id}" data-ui="${ui.id}" data-composition="${ui.composition}" data-density="${ui.density}" data-motif="${ui.motif}">
  <main class="app-shell">
    <header class="hero"><div class="identity"><div class="logo-frame"><img id="pluginLogo" src="logo.svg" alt="${plugin.name}图标"></div><div class="identity-copy"><div class="meta-row"><span id="category" class="eyebrow">${plugin.category}</span><span class="privacy-badge"><i></i>本地处理</span></div><h1 id="title">${plugin.name}</h1><p id="description">${plugin.description}</p></div></div><div class="hero-actions"><span class="tool-mode">${ui.metaphor}</span><button id="pinButton" class="icon-button secondary">置顶</button><button id="copyButton" class="icon-button secondary">复制结果</button></div></header>
    <section class="status-bar"><div id="status" class="status" aria-live="polite"><span class="status-dot"></span><span class="status-text">准备就绪</span></div><div class="shortcut-hints"><kbd>Ctrl</kbd><kbd>Enter</kbd><span>执行</span><kbd>Ctrl</kbd><kbd>S</kbd><span>保存</span></div></section>
    <section class="workspace">${orders[ui.composition].join('')}</section>
  </main><script src="renderer.js"></script>
</body></html>\n`;
}

function createStyles(plugin, ui, visual) {
  const base = fs.readFileSync(path.join(__dirname, 'plugin-market', 'ui-base.css'), 'utf8');
  const compositionCss = {
    studio: 'grid-template-columns:258px minmax(330px,1fr) minmax(340px,1fr)',
    split: 'grid-template-columns:minmax(380px,1fr) minmax(380px,1fr);grid-template-areas:"editor result" "controls controls"',
    inspector: 'grid-template-columns:minmax(360px,1fr) 250px minmax(360px,1.1fr)',
    tabs: 'grid-template-columns:245px minmax(400px,1.2fr) minmax(300px,.8fr)',
    console: 'grid-template-columns:minmax(430px,1.35fr) minmax(330px,.9fr) 240px',
    deck: 'grid-template-columns:250px minmax(430px,1.25fr) minmax(300px,.75fr)',
    timeline: 'grid-template-columns:minmax(330px,1fr) 245px minmax(360px,1.1fr)',
    testbench: 'grid-template-columns:minmax(370px,1fr) minmax(400px,1.1fr);grid-template-areas:"editor result" "controls controls"',
    table: 'grid-template-columns:265px minmax(320px,.75fr) minmax(430px,1.25fr)',
    canvas: 'grid-template-columns:245px minmax(500px,1.45fr) minmax(280px,.7fr)',
    board: 'grid-template-columns:minmax(300px,.72fr) minmax(480px,1.35fr) 235px',
    dashboard: 'grid-template-columns:minmax(470px,1.4fr) 250px minmax(280px,.7fr)'
  }[ui.composition];
  const motif = {
    grid: 'linear-gradient(rgba(var(--accent-rgb),.035) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--accent-rgb),.035) 1px,transparent 1px)',
    dots: 'radial-gradient(circle at 2px 2px,rgba(var(--accent-rgb),.08) 1px,transparent 1.5px)',
    lines: 'repeating-linear-gradient(135deg,rgba(var(--accent-rgb),.025) 0 1px,transparent 1px 18px)',
    glow: 'radial-gradient(circle at 70% 15%,rgba(var(--accent-rgb),.12),transparent 34%)',
    plain: 'linear-gradient(145deg,rgba(var(--accent-rgb),.045),transparent 45%)'
  }[ui.motif];
  return `${base}\n/* ${plugin.name}：独立界面规格 ${ui.id} */
:root{--accent:${visual.accent};--accent-2:${visual.accent2};--tool-radius:${ui.radius}px}
body{background-color:#07101d;background-image:${motif};background-size:${ui.motif === 'grid' ? '26px 26px' : ui.motif === 'dots' ? '22px 22px' : 'auto'}}
.app-shell{position:relative}.app-shell::after{content:"${String(plugin.order).padStart(2, '0')}";position:fixed;right:22px;bottom:-20px;color:rgba(var(--accent-rgb),.045);font:900 150px/1 monospace;pointer-events:none}
.tool-mode{padding:7px 11px;border:1px solid rgba(var(--accent-rgb),.25);border-radius:${Math.max(6, ui.radius - 3)}px;color:var(--accent);background:rgba(var(--accent-rgb),.08);font-size:12px;font-weight:800}
.workspace{${compositionCss};min-height:${ui.density === 'compact' ? 560 : ui.density === 'airy' ? 680 : 620}px}
.panel,.status-bar,.logo-frame{border-radius:var(--tool-radius)}
body[data-density="compact"] .panel-heading{min-height:54px;padding:9px 13px}body[data-density="airy"] .panel-heading{min-height:72px;padding:17px 18px}
body[data-composition="split"] .editor-panel,body[data-composition="testbench"] .editor-panel{grid-area:editor}body[data-composition="split"] .result-panel,body[data-composition="testbench"] .result-panel{grid-area:result}body[data-composition="split"] .controls-panel,body[data-composition="testbench"] .controls-panel{grid-area:controls}.ui-${ui.id} .step-index{border-radius:${ui.radius > 18 ? '999px' : `${Math.max(5, ui.radius - 4)}px`}}
.ui-${ui.id} .result-panel{box-shadow:0 18px 50px rgba(var(--accent-rgb),.09)}
body[data-composition="split"] .controls,body[data-composition="testbench"] .controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:start}
body[data-composition="split"] .controls-panel,body[data-composition="testbench"] .controls-panel{min-height:190px}
body[data-composition="inspector"] .controls-panel{border-style:dashed}body[data-composition="inspector"] .result-surface{background-image:linear-gradient(90deg,rgba(var(--accent-rgb),.06) 1px,transparent 1px);background-size:24px 100%}
body[data-composition="tabs"] .controls-panel{border-top:3px solid var(--accent)}body[data-composition="tabs"] .panel-heading{background:rgba(var(--accent-rgb),.05)}
body[data-composition="console"] .result-surface{background:#030914}body[data-composition="console"] #outputText{font-family:Consolas,monospace;color:#b7f7d8}
body[data-composition="deck"] .cards{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}body[data-composition="deck"] .result-panel{transform:translateY(-5px)}
body[data-composition="timeline"] .controls-panel{position:relative}body[data-composition="timeline"] .controls-panel::before,body[data-composition="timeline"] .controls-panel::after{content:"";position:absolute;top:50%;width:14px;border-top:2px dotted rgba(var(--accent-rgb),.45)}body[data-composition="timeline"] .controls-panel::before{left:-14px}body[data-composition="timeline"] .controls-panel::after{right:-14px}
body[data-composition="table"] .result-surface{background-image:linear-gradient(rgba(148,163,184,.055) 1px,transparent 1px);background-size:100% 38px}body[data-composition="table"] .cards{grid-template-columns:1fr}
body[data-composition="canvas"] .result-surface{background-color:#050d17;background-image:linear-gradient(45deg,#0c1827 25%,transparent 25%),linear-gradient(-45deg,#0c1827 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0c1827 75%),linear-gradient(-45deg,transparent 75%,#0c1827 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}
body[data-composition="board"] .cards{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-content:start}body[data-composition="board"] .result-panel{border-top:3px solid var(--accent)}
body[data-composition="dashboard"] .result-panel{border-color:rgba(var(--accent-rgb),.35)}body[data-composition="dashboard"] .result-surface{background:radial-gradient(circle at 50% 35%,rgba(var(--accent-rgb),.09),transparent 38%),#071321}
@media(max-width:1100px){.workspace{grid-template-columns:230px 1fr!important;grid-template-areas:none!important}.workspace .panel{grid-area:auto!important}.result-panel{grid-column:1/-1}}
@media(max-width:760px){.workspace{grid-template-columns:1fr!important}.result-panel{grid-column:auto}.tool-mode{display:none}}
`;
}

function createManifest(plugin) {
  const acceptsText = plugin.kind === 'text' || ['csv-table', 'line-processor', 'svg-workbench', 'color-workbench'].includes(plugin.id);
  const commands = [...plugin.keywords];
  if (acceptsText) commands.push({ type: 'over', label: [`用${plugin.name}处理`, plugin.name], minLength: 1, maxLength: 200000 });
  return {
    pluginName: plugin.name,
    description: plugin.description,
    version: '1.0.0',
    author: '三人聚智',
    category: plugin.category,
    main: 'index.html',
    logo: 'logo.ico',
    preload: 'preload.js',
    features: [{
      code: `plugin-market-${plugin.id}`,
      explain: plugin.name,
      description: plugin.description,
      cmds: commands,
      icon: 'logo.ico',
      platform: plugin.platforms,
      mode: 'none',
      superPanel: acceptsText,
      category: plugin.category,
      priority: 20,
      useClipboardText: acceptsText
    }],
    pluginSetting: { width: 1180, height: 760, single: true, autoHideMenuBar: true, menuBarVisible: false }
  };
}

function createReadme(plugin, ui) {
  return `# ${plugin.name}\n\n${plugin.description}\n\n## 使用方式\n\n- 在主界面或搜索窗口输入“${plugin.keywords[0]}”启动。\n- 界面采用“${ui.metaphor}”独立设计：在“${ui.controlsTitle}”配置参数，通过“${ui.inputTitle}”提供数据，并在“${ui.resultTitle}”检查结果。\n- “预览”不会执行文件或系统写入；“开始处理”才会执行明确选择的操作。\n\n## 隐私与安全\n\n- 默认完全在本机运行，不上传输入、文件或使用记录。\n- 文件和系统修改会先显示预览；高风险操作需要用户主动确认。\n- 插件设置使用宿主提供的独立插件存储，数据结构版本为 1。\n\n## 兼容性\n\nWindows 提供完整验收；不依赖 Windows 系统能力的功能同时兼容 macOS 和 Linux。\n`;
}

function visualFor(plugin) {
  const palettes = {
    text: [['#0ea5e9', '#4f46e5'], ['#06b6d4', '#2563eb'], ['#3b82f6', '#7c3aed']],
    file: [['#f59e0b', '#ea580c'], ['#fb923c', '#dc2626'], ['#eab308', '#ca8a04']],
    image: [['#ec4899', '#7c3aed'], ['#d946ef', '#4f46e5'], ['#f43f5e', '#8b5cf6']],
    productivity: [['#10b981', '#0d9488'], ['#22c55e', '#0284c7'], ['#14b8a6', '#4f46e5']],
    system: [['#3b82f6', '#0f766e'], ['#6366f1', '#0891b2'], ['#2563eb', '#7c3aed']]
  };
  const pair = palettes[plugin.kind][plugin.order % palettes[plugin.kind].length];
  return { accent: pair[0], accent2: pair[1], iconStyle: 'original-duotone-v1' };
}

function createSvg(plugin, visual) {
  const glyph = iconGlyph(plugin.id);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="bg" x1="28" y1="24" x2="228" y2="232" gradientUnits="userSpaceOnUse"><stop stop-color="${visual.accent}"/><stop offset="1" stop-color="${visual.accent2}"/></linearGradient><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".24"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#020617" flood-opacity=".28"/></filter></defs><rect x="8" y="8" width="240" height="240" rx="58" fill="url(#bg)"/><path d="M40 42c42-35 134-35 177 5-17 15-43 22-71 18-42-6-72 3-106 27z" fill="url(#shine)"/><circle cx="199" cy="52" r="23" fill="#fff" fill-opacity=".12"/><g transform="translate(48 48) scale(2.5)" fill="none" stroke="#fff" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)">${glyph}</g></svg>`;
}

function iconGlyph(id) {
  const doc = mark => `<path d="M18 7h21l9 9v41H18z"/><path d="M39 7v11h9"/>${mark}`;
  const image = extra => `<rect x="8" y="11" width="48" height="40" rx="6"/><path d="m12 43 12-12 9 8 8-9 11 13"/><circle cx="22" cy="23" r="4"/>${extra || ''}`;
  const icons = {
    'json-workbench': `<path d="M25 10c-7 0-8 5-8 10v7c0 4-2 5-6 5 4 0 6 2 6 6v7c0 5 1 10 8 10M39 10c7 0 8 5 8 10v7c0 4 2 5 6 5-4 0-6 2-6 6v7c0 5-1 10-8 10"/><circle cx="32" cy="24" r="2" fill="#fff" stroke="none"/><circle cx="32" cy="40" r="2" fill="#fff" stroke="none"/>`,
    'config-converter': `<path d="M13 18h38M13 32h38M13 46h38"/><circle cx="25" cy="18" r="5" fill="#fff"/><circle cx="42" cy="32" r="5" fill="#fff"/><circle cx="20" cy="46" r="5" fill="#fff"/>`,
    'xml-workbench': `<path d="m24 16-13 16 13 16M40 16l13 16-13 16M36 11 28 53"/>`,
    'codec-assistant': `<path d="M10 22h31M34 15l7 7-7 7M54 42H23M30 35l-7 7 7 7"/><path d="M11 38v9M49 17v9"/>`,
    'hash-hmac': `<path d="M25 9 19 55M45 9l-6 46M10 25h44M8 41h44"/>`,
    'id-generator': `<path d="M32 8a20 20 0 0 0-20 20M52 28A20 20 0 0 0 32 8M12 36c0 11 9 20 20 20M22 28a10 10 0 0 1 20 0v9M22 36v8M32 22v28M42 44v7"/>`,
    'time-converter': `<circle cx="32" cy="32" r="23"/><path d="M32 18v15l11 7M12 11l-5 8M52 11l5 8"/>`,
    'regex-lab': `<path d="M11 18h28M11 46h42"/><circle cx="19" cy="32" r="4" fill="#fff"/><path d="M35 26v12M29 32h12M48 24v16"/>`,
    'jwt-inspector': `<path d="M32 7 52 15v15c0 13-8 22-20 28-12-6-20-15-20-28V15z"/><circle cx="28" cy="30" r="5"/><path d="M33 34l10 10m-3-3 5-5"/>`,
    'text-diff': `<path d="M9 11h18v42H9zM37 11h18v42H37zM14 23h8M14 32h8M42 23h8M42 41h8M46 28v8M42 32h8"/>`,
    'batch-renamer': `${doc('<path d="M24 30h17M24 39h12"/>')}<path d="m8 45 8-8M8 37v8h8"/>`,
    'file-content-search': `${doc('<path d="M24 28h14M24 37h8"/>')}<circle cx="43" cy="43" r="8"/><path d="m49 49 7 7"/>`,
    'folder-compare': `<path d="M7 20h19l5 6h26v25H7zM7 20v-6h17l5 6M21 37h22M37 31l6 6-6 6"/>`,
    'text-encoding': `${doc('<path d="M24 45 31 25l7 20M27 37h8"/>')}<path d="M8 50h8m-4-4v8"/>`,
    'csv-table': `<rect x="7" y="11" width="50" height="42" rx="4"/><path d="M7 24h50M7 38h50M24 11v42M41 11v42"/>`,
    'line-processor': `<path d="M18 16h36M18 28h28M18 40h36M18 52h22M8 16h2M8 28h2M8 40h2M8 52h2"/>`,
    'directory-tree': `<path d="M15 11v38h14M15 26h14M15 41h14"/><rect x="29" y="6" width="25" height="11" rx="3"/><rect x="29" y="21" width="25" height="11" rx="3"/><rect x="29" y="36" width="25" height="11" rx="3"/>`,
    'file-checksum': `${doc('')}<path d="m25 38 6 6 13-16"/>`,
    'pdf-organizer': `<path d="M13 10h24l9 9v35H13zM37 10v10h9M22 30h16M22 38h16M22 46h11"/><path d="M46 27h6v29H25"/>`,
    'archive-tool': `<path d="M9 20h46v35H9zM7 12h50v10H7zM26 29h12M29 38h6v9h-6z"/>`,
    'image-compressor': `${image('')}<path d="m6 6 10 10M6 16V6h10M58 58 48 48M58 48v10H48"/>`,
    'image-converter': `${image('')}<path d="M12 57h34M39 52l7 5-7 5"/>`,
    'image-resizer': `${image('')}<path d="M5 18V5h13M46 5h13v13M59 46v13H46M18 59H5V46"/>`,
    'image-watermark': `${image('')}<path d="M42 20c0 6-8 10-8 17a8 8 0 0 0 16 0c0-7-8-11-8-17z" fill="#fff" fill-opacity=".35"/>`,
    'image-collage': `<rect x="7" y="7" width="22" height="22" rx="3"/><rect x="35" y="7" width="22" height="22" rx="3"/><rect x="7" y="35" width="22" height="22" rx="3"/><rect x="35" y="35" width="22" height="22" rx="3"/>`,
    'palette-extractor': `<path d="M32 8a24 24 0 1 0 0 48c5 0 7-3 5-7-2-5 1-9 6-9h6c5 0 8-3 7-8C54 18 45 8 32 8z"/><circle cx="20" cy="24" r="3" fill="#fff"/><circle cx="31" cy="17" r="3" fill="#fff"/><circle cx="43" cy="23" r="3" fill="#fff"/>`,
    'color-workbench': `<path d="m39 8 17 17-25 25H14V33zM35 12l17 17M14 50l-6 6"/><circle cx="43" cy="20" r="3" fill="#fff"/>`,
    'qr-barcode': `<path d="M8 8h18v18H8zM13 13h8v8h-8zM38 8h18v18H38zM43 13h8v8h-8zM8 38h18v18H8zM13 43h8v8h-8zM38 38h7v7h-7zM49 38h7v18H44M32 8v12M32 28v8M30 44h8v12"/>`,
    'svg-workbench': `<path d="M12 45 24 19h16l12 26-20 12z"/><circle cx="24" cy="19" r="4" fill="#fff"/><circle cx="40" cy="19" r="4" fill="#fff"/><circle cx="12" cy="45" r="4" fill="#fff"/><circle cx="52" cy="45" r="4" fill="#fff"/><circle cx="32" cy="57" r="4" fill="#fff"/>`,
    'screenshot-beautifier': `${image('')}<path d="m49 8 2 6 6 2-6 2-2 6-2-6-6-2 6-2zM13 4l1 4 4 1-4 1-1 4-1-4-4-1 4-1z" fill="#fff"/>`,
    'markdown-notes': `${doc('<path d="M23 43V28l7 8 7-8v15M41 28v15m-4-4 4 4 4-4"/>')}`,
    'floating-notes': `<path d="M12 10h40v37L41 58H12zM41 47h11M41 47v11M21 22h22M21 31h18"/><path d="m48 8 8 8"/>`,
    'todo-list': `<rect x="8" y="12" width="13" height="13" rx="3"/><path d="m11 18 4 4 9-10M29 18h27M8 34h13v13H8zM29 40h27M8 53h13M29 56h20"/>`,
    'pomodoro-focus': `<circle cx="32" cy="35" r="21"/><path d="M32 35V22M25 7h14M42 13l6-5M32 35l10 6"/>`,
    'calculation-paper': `<rect x="12" y="6" width="40" height="52" rx="6"/><rect x="19" y="13" width="26" height="10" rx="2"/><path d="M20 32h5M32 32h5M44 32h1M20 42h5M32 42h5M44 42h1M20 52h5M32 52h14"/>`,
    'unit-converter': `<path d="M9 17h46v30H9zM17 17v8M25 17v5M33 17v8M41 17v5M49 17v8M17 47v-8M25 47v-5M33 47v-8M41 47v-5M49 47v-8"/>`,
    'date-world-clock': `<rect x="7" y="12" width="34" height="39" rx="5"/><path d="M7 23h34M15 7v10M33 7v10"/><circle cx="46" cy="43" r="12"/><path d="M34 43h24M46 31c4 6 4 18 0 24M46 31c-4 6-4 18 0 24"/>`,
    'worklog': `<path d="M8 20h48v34H8zM23 20v-8h18v8M8 34h48M27 31h10v7H27z"/><circle cx="45" cy="45" r="9"/><path d="M45 40v5l4 2"/>`,
    'bookmark-launcher': `<path d="M18 7h28v50L32 47 18 57z"/><path d="m32 18 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z"/>`,
    'habit-tracker': `<path d="M34 6c4 11-5 13-5 22 0 5 4 7 7 4 3-3 2-7 1-10 9 6 14 13 12 23-2 9-9 14-18 14S14 53 13 44c-1-10 5-17 12-23-1 8 2 12 6 10 4-3 1-10 3-25z"/><path d="m24 45 5 5 11-12"/>`,
    'clipboard-history': `<path d="M22 13h-7v43h34V13h-7M25 8h14l3 9H22z"/><path d="M24 28h17M24 37h17M24 46h11"/>`,
    'local-file-search': `<path d="M7 20h20l6 7h24v25H7zM7 20v-7h18l5 7"/><circle cx="44" cy="42" r="8"/><path d="m50 48 7 7"/>`,
    'disk-analyzer': `<circle cx="32" cy="32" r="24"/><path d="M32 8v24h24M15 49l17-17"/><path d="M38 14a19 19 0 0 1 12 12"/>`,
    'process-monitor': `<rect x="8" y="12" width="48" height="40" rx="5"/><path d="M13 36h9l5-12 8 22 6-15 4 5h7M20 7v5M32 7v5M44 7v5"/>`,
    'port-inspector': `<path d="M12 23h14v18H12zM38 23h14v18H38zM19 17v6M45 17v6M19 41v7c0 6 6 9 13 9s13-3 13-9v-7M26 32h12"/>`,
    'environment-manager': `<rect x="7" y="11" width="50" height="42" rx="5"/><path d="m15 23 8 7-8 7M29 38h16M42 18h8M46 14v8"/>`,
    'hosts-manager': `<rect x="10" y="8" width="44" height="14" rx="4"/><rect x="10" y="25" width="44" height="14" rx="4"/><rect x="10" y="42" width="44" height="14" rx="4"/><circle cx="18" cy="15" r="2" fill="#fff"/><circle cx="18" cy="32" r="2" fill="#fff"/><circle cx="18" cy="49" r="2" fill="#fff"/><path d="M30 15h17M30 32h17M30 49h17"/>`,
    'lan-transfer': `<path d="M8 23a34 34 0 0 1 48 0M15 31a24 24 0 0 1 34 0M23 39a13 13 0 0 1 18 0"/><circle cx="32" cy="49" r="4" fill="#fff"/><path d="m9 48 8 8 8-8M55 48l-8 8-8-8"/>`,
    'image-pinboard': `${image('')}<path d="m43 5 10 10-7 4-8 14-7-7 14-8zM31 26 15 50"/>`,
    'project-launcher': `<path d="M37 8c10 2 17 9 19 19L39 44 20 25zM37 8 20 25M23 40l-9 9M19 35l-9 2 7-12M29 45l-2 9 12-7"/><circle cx="42" cy="22" r="4" fill="#fff"/>`
  };
  return icons[id] || `<circle cx="32" cy="32" r="22"/><path d="M22 32h20M32 22v20"/>`;
}

/** 创建嵌入 PNG 的标准 ICO，避免伪装扩展名导致打包态图标无法读取。 */
function createIco(color) {
  const rgb = hexToRgb(color);
  const png = createPng(64, 64, rgb);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 64; header[7] = 64; header[8] = 0; header[9] = 0;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

function createPng(width, height, [r, g, b]) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4); row[0] = 0;
    for (let x = 0; x < width; x += 1) { const offset = 1 + x * 4; const factor = .72 + .28 * (1 - (x + y) / (width + height)); row[offset] = Math.round(r * factor); row[offset + 1] = Math.round(g * factor); row[offset + 2] = Math.round(b * factor); row[offset + 3] = 255; }
    rows.push(row);
  }
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const name = Buffer.from(type); const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function hexToRgb(value) { const match = String(value).match(/^#([0-9a-f]{6})$/i); return match ? [0, 2, 4].map(index => parseInt(match[1].slice(index, index + 2), 16)) : [56, 189, 248]; }

function copyLicenses(plugin, target) {
  const packages = {
    'text-encoding': ['iconv-lite'],
    'pdf-organizer': ['pdf-lib'],
    'archive-tool': ['fflate'],
    'qr-barcode': ['qrcode', 'jsqr']
  }[plugin.id] || [];
  if (!packages.length) return;
  const noticeDir = path.join(target, 'THIRD_PARTY_LICENSES'); fs.mkdirSync(noticeDir, { recursive: true });
  for (const packageName of packages) {
    const packageDir = path.join(root, 'node_modules', packageName);
    const license = ['LICENSE', 'LICENSE.md', 'license', 'license.md'].map(file => path.join(packageDir, file)).find(fs.existsSync);
    if (license) fs.copyFileSync(license, path.join(noticeDir, `${packageName}-LICENSE${path.extname(license) || '.txt'}`));
  }
}
