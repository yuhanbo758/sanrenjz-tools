const api = window.pluginAPI;
const profile = api.profile;
const state = { files: [], values: {}, output: '', dataUrl: '', items: [], timer: null, remaining: 0 };

const elements = {
  title: document.getElementById('title'), description: document.getElementById('description'), category: document.getElementById('category'),
  status: document.getElementById('status'), controls: document.getElementById('controls'), input: document.getElementById('inputText'),
  output: document.getElementById('outputText'), canvas: document.getElementById('previewCanvas'), cards: document.getElementById('cards'),
  run: document.getElementById('runButton'), preview: document.getElementById('previewButton'), clear: document.getElementById('clearButton'),
  copy: document.getElementById('copyButton'), save: document.getElementById('saveButton'), export: document.getElementById('exportButton'), pin: document.getElementById('pinButton')
};

const optionSchemas = {
  'json-workbench': [select('action', '处理方式', [['format', '格式化'], ['minify', '压缩']]), text('query', '路径查询', '例如 user.profile.name')],
  'config-converter': [select('source', '源格式', formats()), select('target', '目标格式', formats('yaml'))],
  'xml-workbench': [select('action', '处理方式', [['format', '格式化'], ['minify', '压缩']])],
  'codec-assistant': [select('action', '处理方式', [['base64-encode', 'Base64 编码'], ['base64-decode', 'Base64 解码'], ['url-encode', 'URL 编码'], ['url-decode', 'URL 解码'], ['hex-encode', 'Hex 编码'], ['hex-decode', 'Hex 解码'], ['unicode-encode', 'Unicode 编码'], ['unicode-decode', 'Unicode 解码'], ['html-encode', 'HTML 实体编码'], ['html-decode', 'HTML 实体解码']])],
  'hash-hmac': [select('algorithm', '算法', [['md5', 'MD5'], ['sha1', 'SHA-1'], ['sha256', 'SHA-256'], ['sha512', 'SHA-512']], 'sha256'), text('key', 'HMAC 密钥', '留空则生成普通摘要'), select('encoding', '输出', [['hex', 'Hex'], ['base64', 'Base64']])],
  'id-generator': [select('type', '类型', [['uuid', 'UUID v4'], ['nanoid', 'NanoID/随机串']]), number('count', '数量', 10, 1, 1000), number('length', '随机串长度', 21, 4, 128)],
  'time-converter': [text('timeZone', '目标时区', '例如 Asia/Shanghai')],
  'regex-lab': [text('pattern', '正则表达式', '例如 (\\w+)'), text('flags', '标志', 'gim'), text('replacement', '替换文本', '留空则显示匹配结果')],
  'jwt-inspector': [text('secret', 'HMAC 密钥', '可选，用于验证签名')],
  'text-diff': [area('rightText', '右侧文本', '输入用于对比的第二段文本')],
  'batch-renamer': [directory('directory', '选择待重命名目录'), text('find', '查找', ''), text('replace', '替换为', ''), text('prefix', '前缀', ''), text('suffix', '后缀', ''), checkbox('number', '添加序号'), number('start', '起始序号', 1, 0, 999999), number('padding', '序号位数', 2, 1, 8)],
  'file-content-search': [directory('directory', '选择搜索目录'), text('query', '搜索内容', ''), text('extensions', '扩展名过滤', 'js,html,md'), number('maxSizeMb', '单文件上限 MB', 5, 1, 100)],
  'folder-compare': [directory('directoryA', '选择左侧目录'), directory('directoryB', '选择右侧目录'), checkbox('hash', '使用 SHA-256 精确比较')],
  'text-encoding': [files('files', '选择文本文件'), select('sourceEncoding', '源编码', [['utf8', 'UTF-8'], ['gbk', 'GBK'], ['utf16le', 'UTF-16 LE']]), select('targetEncoding', '目标编码', [['utf8', 'UTF-8'], ['gbk', 'GBK'], ['utf16le', 'UTF-16 LE']]), select('newline', '换行符', [['keep', '保持'], ['lf', 'LF'], ['crlf', 'CRLF']]), text('suffix', '输出后缀', '.converted.txt')],
  'csv-table': [select('action', '处理方式', [['format', '规范 CSV'], ['json', '转换为 JSON']]), text('delimiter', '分隔符', ','), number('sortColumn', '排序列序号', '', 0, 100)],
  'line-processor': [checkbox('unique', '去重'), checkbox('sort', '排序'), checkbox('number', '添加行号'), text('filter', '保留包含文本', ''), text('prefix', '前缀', ''), text('suffix', '后缀', '')],
  'directory-tree': [directory('directory', '选择目录'), select('format', '输出格式', [['text', '纯文本'], ['markdown', 'Markdown'], ['json', 'JSON']])],
  'file-checksum': [files('files', '选择文件')],
  'pdf-organizer': [files('files', '选择 PDF 文件', [{ name: 'PDF', extensions: ['pdf'] }]), select('rotation', '统一旋转', [['0', '不旋转'], ['90', '90°'], ['180', '180°'], ['270', '270°']]), savePath('output', '选择输出 PDF', 'PDF页面整理结果.pdf')],
  'archive-tool': [select('action', '操作', [['list', '预览/解压 ZIP'], ['create', '创建 ZIP']]), files('files', '选择文件或 ZIP'), directory('outputDirectory', '选择解压目录'), savePath('output', '选择输出 ZIP', '三人聚智压缩包.zip'), number('level', '压缩级别', 6, 0, 9)],
  'image-compressor': [imageFiles(), range('quality', '质量', 80, 10, 100)],
  'image-converter': [imageFiles(), select('format', '输出格式', [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']])],
  'image-resizer': [imageFiles(), number('width', '宽度', 1200, 1, 12000), number('height', '高度', 0, 0, 12000), checkbox('keepRatio', '保持比例', true)],
  'image-watermark': [imageFiles(), text('watermark', '水印文字', '三人聚智'), range('opacity', '透明度', 45, 5, 100), select('position', '位置', [['bottom-right', '右下'], ['bottom-left', '左下'], ['center', '居中']])],
  'image-collage': [imageFiles(true), select('direction', '布局', [['horizontal', '横向'], ['vertical', '纵向'], ['grid', '宫格']]), number('gap', '间距', 12, 0, 100), text('background', '背景色', '#0f172a')],
  'palette-extractor': [imageFiles(), number('colors', '颜色数量', 8, 2, 24)],
  'color-workbench': [text('color', '颜色', '#38bdf8'), text('background', '背景色', '#07111f')],
  'qr-barcode': [select('action', '操作', [['generate', '生成二维码'], ['decode', '识别二维码']]), imageFiles(), text('qrText', '二维码内容', 'https://sanrenjz.com'), number('qrSize', '尺寸', 480, 128, 1600)],
  'svg-workbench': [number('width', '导出宽度', 1200, 64, 6000), checkbox('minify', '移除多余空白', true)],
  'screenshot-beautifier': [imageFiles(), number('padding', '留白', 80, 0, 500), number('radius', '圆角', 22, 0, 100), text('background', '背景色', '#2563eb')],
  'markdown-notes': [text('title', '标题', '新笔记'), text('tags', '标签', '工作,灵感'), text('search', '全文搜索', '')],
  'floating-notes': [text('title', '便签标题', '随手记'), text('color', '便签颜色', '#fde68a')],
  'todo-list': [text('title', '任务', ''), text('group', '分组', '默认'), select('priority', '优先级', [['high', '高'], ['medium', '中'], ['low', '低']], 'medium'), text('due', '截止日期', 'YYYY-MM-DD')],
  'pomodoro-focus': [number('focusMinutes', '专注分钟', 25, 1, 180), number('breakMinutes', '休息分钟', 5, 1, 60)],
  'calculation-paper': [],
  'unit-converter': [select('unitType', '类型', [['length', '长度'], ['weight', '重量'], ['temperature', '温度'], ['speed', '速度']]), text('fromUnit', '源单位', 'm'), text('toUnit', '目标单位', 'km')],
  'date-world-clock': [text('timeZone', '时区', 'Asia/Shanghai'), number('addDays', '增加天数', 0, -36500, 36500), checkbox('workdays', '仅计算工作日')],
  'worklog': [text('project', '项目', ''), number('minutes', '分钟', 30, 1, 1440), text('date', '日期', new Date().toISOString().slice(0, 10))],
  'bookmark-launcher': [text('title', '名称', ''), text('url', '网址', 'https://'), text('alias', '别名', '')],
  'habit-tracker': [text('title', '习惯名称', '')],
  'clipboard-history': [checkbox('keepAlive', '隐藏后继续记录', true), number('limit', '最多记录', 200, 10, 1000)],
  'local-file-search': [text('query', '文件名关键字', ''), directory('directory', '选择回退搜索目录')],
  'disk-analyzer': [directory('directory', '选择分析目录')],
  'process-monitor': [number('pid', '需要结束的 PID', '', 1, 999999)],
  'port-inspector': [],
  'environment-manager': [text('name', '变量名', ''), text('value', '变量值', '')],
  'hosts-manager': [],
  'lan-transfer': [select('action', '操作', [['start', '启动服务'], ['stop', '停止服务']]), number('port', '端口（0为自动）', 0, 0, 65535), directory('outputDirectory', '选择文件接收目录')],
  'image-pinboard': [range('opacity', '透明度', 90, 20, 100)],
  'project-launcher': [directory('directory', '选择项目目录'), text('command', '启动命令', 'npm start'), select('action', '操作', [['start', '启动'], ['status', '查看状态'], ['stop', '停止']])]
};

function text(key, label, placeholder = '') { return { type: 'text', key, label, placeholder }; }
function area(key, label, placeholder = '') { return { type: 'textarea', key, label, placeholder }; }
function number(key, label, value, min, max) { return { type: 'number', key, label, value, min, max }; }
function range(key, label, value, min, max) { return { type: 'range', key, label, value, min, max }; }
function checkbox(key, label, value = false) { return { type: 'checkbox', key, label, value }; }
function select(key, label, choices, value) { return { type: 'select', key, label, choices, value: value ?? choices[0]?.[0] }; }
function directory(key, label) { return { type: 'directory', key, label }; }
function files(key, label, filters = [], multiple = true) { return { type: 'files', key, label, filters, multiple }; }
function savePath(key, label, defaultPath) { return { type: 'save', key, label, defaultPath }; }
function imageFiles(multiple = false) { return files('files', multiple ? '选择多张图片' : '选择图片', [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }], multiple); }
function formats(selected) { return [['json', 'JSON'], ['yaml', 'YAML'], ['toml', 'TOML'], ['properties', 'Properties']].map(item => item[0] === selected ? item : item); }

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
}

function renderControls() {
  elements.controls.innerHTML = '<div class="control-title">处理选项</div>';
  for (const schema of optionSchemas[profile.id] || []) {
    const group = document.createElement('div'); group.className = 'control-group';
    const label = document.createElement('label'); label.textContent = schema.label; group.appendChild(label);
    let control;
    if (schema.type === 'select') {
      control = document.createElement('select');
      schema.choices.forEach(([value, name]) => { const option = document.createElement('option'); option.value = value; option.textContent = name; control.appendChild(option); });
      control.value = schema.value;
    } else if (schema.type === 'textarea') {
      control = document.createElement('textarea'); control.style.minHeight = '110px'; control.placeholder = schema.placeholder || '';
    } else if (schema.type === 'checkbox') {
      control = document.createElement('input'); control.type = 'checkbox'; control.checked = Boolean(schema.value); control.style.width = 'auto';
    } else if (schema.type === 'directory' || schema.type === 'files' || schema.type === 'save') {
      control = document.createElement('button'); control.className = 'secondary'; control.textContent = schema.label;
      control.addEventListener('click', async () => {
        if (schema.type === 'directory') state.values[schema.key] = api.selectDirectory(schema.label);
        else if (schema.type === 'files') state.values[schema.key] = api.selectFiles({ title: schema.label, multiple: schema.multiple, filters: schema.filters });
        else state.values[schema.key] = api.chooseSavePath({ title: schema.label, defaultPath: schema.defaultPath });
        control.textContent = summarizeValue(state.values[schema.key]) || schema.label;
      });
    } else {
      control = document.createElement('input'); control.type = schema.type; control.value = schema.value ?? ''; control.placeholder = schema.placeholder || '';
      if (schema.min != null) control.min = schema.min; if (schema.max != null) control.max = schema.max;
    }
    control.dataset.key = schema.key;
    if (!['directory', 'files', 'save'].includes(schema.type)) {
      state.values[schema.key] = schema.type === 'checkbox' ? control.checked : control.value;
      control.addEventListener('input', () => { state.values[schema.key] = schema.type === 'checkbox' ? control.checked : control.value; });
    }
    group.appendChild(control);
    if (schema.type === 'range') { const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = control.value; control.addEventListener('input', () => { hint.textContent = control.value; }); group.appendChild(hint); }
    elements.controls.appendChild(group);
  }
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '“预览”不会执行文件或系统写入；“开始处理”才会执行已明确选择的操作。'; elements.controls.appendChild(hint);
}

function summarizeValue(value) {
  if (Array.isArray(value)) return value.length ? `已选择 ${value.length} 项` : '';
  return value ? String(value).split(/[\\/]/).pop() : '';
}

function formatResult(result) {
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}

async function run(execute) {
  const destructive = ['batch-renamer', 'text-encoding', 'pdf-organizer', 'archive-tool', 'process-monitor', 'environment-manager', 'hosts-manager', 'project-launcher'];
  if (execute && destructive.includes(profile.id)) {
    const accepted = window.confirm(`即将执行“${profile.name}”的写入或系统操作。请确认已经通过“预览”检查目标和参数。`);
    if (!accepted) { setStatus('已取消，未修改任何数据'); return; }
  }
  elements.run.disabled = true; elements.preview.disabled = true;
  setStatus(execute ? '正在处理，请稍候……' : '正在生成安全预览……');
  try {
    if (profile.kind === 'image') await runImage(execute);
    else if (profile.kind === 'productivity') await runProductivity(execute);
    else if (profile.id === 'clipboard-history' || profile.id === 'image-pinboard') await runLocalSystem(execute);
    else {
      const response = await api.runTask({ input: elements.input.value, options: state.values, execute });
      if (!response.ok) throw new Error(response.error);
      if (profile.id === 'hosts-manager' && !execute && response.result?.content) elements.input.value = response.result.content;
      state.output = formatResult(response.result); showText(state.output);
    }
    setStatus(execute ? '处理完成' : '预览完成，确认无误后可执行', 'success');
  } catch (error) { setStatus(error.message || String(error), 'error'); }
  finally { elements.run.disabled = false; elements.preview.disabled = false; }
}

function showText(text) {
  state.output = String(text || ''); elements.output.textContent = state.output || '无结果';
  elements.output.hidden = false; elements.canvas.hidden = true; elements.cards.hidden = true;
}

async function loadImages() {
  const files = state.values.files || [];
  if (!files.length) throw new Error('请先选择图片');
  return Promise.all(files.map(async filePath => {
    const image = new Image(); image.src = api.readFileDataUrl(filePath);
    await image.decode(); return { image, filePath };
  }));
}

async function runImage() {
  if (profile.id === 'color-workbench') return runColorWorkbench();
  if (profile.id === 'qr-barcode') return runQr();
  const canvas = elements.canvas; const context = canvas.getContext('2d');
  if (profile.id === 'svg-workbench') {
    const svg = state.values.minify ? elements.input.value.replace(/>\s+</g, '><').trim() : elements.input.value;
    if (!svg.includes('<svg')) throw new Error('请输入有效 SVG');
    const image = new Image(); image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`; await image.decode();
    canvas.width = Number(state.values.width || image.width || 1200); canvas.height = Math.round(canvas.width * (image.height / image.width || 1)); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    const images = await loadImages();
    if (profile.id === 'image-collage') drawCollage(canvas, context, images);
    else if (profile.id === 'palette-extractor') return extractPalette(images[0].image);
    else drawSingleImage(canvas, context, images[0].image);
  }
  const mime = profile.id === 'image-converter' ? state.values.format : profile.id === 'image-compressor' ? 'image/jpeg' : 'image/png';
  state.dataUrl = canvas.toDataURL(mime || 'image/png', Number(state.values.quality || 90) / 100);
  elements.output.hidden = true; elements.cards.hidden = true; canvas.hidden = false;
}

function drawSingleImage(canvas, context, image) {
  let width = image.width; let height = image.height;
  if (profile.id === 'image-resizer') {
    width = Number(state.values.width || image.width); height = Number(state.values.height || 0) || Math.round(image.height * width / image.width);
    if (!state.values.keepRatio && Number(state.values.height)) height = Number(state.values.height);
  }
  if (profile.id === 'screenshot-beautifier') {
    const padding = Number(state.values.padding || 80); canvas.width = width + padding * 2; canvas.height = height + padding * 2;
    context.fillStyle = state.values.background || '#2563eb'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.save(); context.shadowColor = 'rgba(0,0,0,.45)'; context.shadowBlur = 35; roundedImage(context, image, padding, padding, width, height, Number(state.values.radius || 22)); context.restore(); return;
  }
  canvas.width = width; canvas.height = height; context.drawImage(image, 0, 0, width, height);
  if (profile.id === 'image-watermark') {
    const fontSize = Math.max(18, Math.round(width / 24)); context.font = `600 ${fontSize}px Microsoft YaHei`; context.globalAlpha = Number(state.values.opacity || 45) / 100; context.fillStyle = '#fff';
    const text = state.values.watermark || '三人聚智'; const metrics = context.measureText(text); let x = width - metrics.width - 24; let y = height - 24;
    if (state.values.position === 'bottom-left') x = 24; if (state.values.position === 'center') { x = (width - metrics.width) / 2; y = height / 2; }
    context.fillText(text, x, y); context.globalAlpha = 1;
  }
}

function roundedImage(context, image, x, y, width, height, radius) {
  context.beginPath(); context.roundRect(x, y, width, height, radius); context.clip(); context.drawImage(image, x, y, width, height);
}

function drawCollage(canvas, context, images) {
  const gap = Number(state.values.gap || 0); const direction = state.values.direction || 'horizontal';
  let columns = direction === 'vertical' ? 1 : direction === 'grid' ? Math.ceil(Math.sqrt(images.length)) : images.length;
  const cellWidth = Math.max(...images.map(item => item.image.width)); const cellHeight = Math.max(...images.map(item => item.image.height));
  const rows = Math.ceil(images.length / columns); canvas.width = columns * cellWidth + (columns + 1) * gap; canvas.height = rows * cellHeight + (rows + 1) * gap;
  context.fillStyle = state.values.background || '#0f172a'; context.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((item, index) => { const column = index % columns; const row = Math.floor(index / columns); context.drawImage(item.image, gap + column * (cellWidth + gap), gap + row * (cellHeight + gap), cellWidth, cellHeight); });
}

function extractPalette(image) {
  const sample = document.createElement('canvas'); sample.width = 80; sample.height = 80; const context = sample.getContext('2d'); context.drawImage(image, 0, 0, 80, 80);
  const buckets = new Map(); const data = context.getImageData(0, 0, 80, 80).data;
  for (let i = 0; i < data.length; i += 16) { if (data[i + 3] < 128) continue; const rgb = [data[i], data[i + 1], data[i + 2]].map(value => Math.round(value / 32) * 32); const key = rgb.map(value => Math.min(255, value).toString(16).padStart(2, '0')).join(''); buckets.set(key, (buckets.get(key) || 0) + 1); }
  const colors = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(state.values.colors || 8)).map(([hex]) => `#${hex}`);
  showCards(colors.map(color => ({ title: color, subtitle: '点击复制', color, action: () => api.copyText(color) }))); state.output = colors.join('\n');
}

function runColorWorkbench() {
  const foreground = parseColor(state.values.color || '#38bdf8'); const background = parseColor(state.values.background || '#07111f');
  const ratio = contrast(foreground, background); const hsl = rgbToHsl(...foreground);
  showText(JSON.stringify({ hex: rgbToHex(...foreground), rgb: `rgb(${foreground.join(', ')})`, hsl: `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`, contrastRatio: ratio.toFixed(2), wcagAA: ratio >= 4.5 }, null, 2));
}

async function runQr() {
  if (state.values.action === 'decode') {
    const files = state.values.files || []; if (!files.length) throw new Error('请选择二维码图片');
    const response = await api.decodeQr(api.readFileDataUrl(files[0])); if (!response.ok) throw new Error(response.error); showText(response.text || '未识别到二维码'); return;
  }
  const response = await api.generateQr(state.values.qrText || elements.input.value, Number(state.values.qrSize || 480)); if (!response.ok) throw new Error(response.error);
  const image = new Image(); image.src = response.dataUrl; await image.decode(); elements.canvas.width = image.width; elements.canvas.height = image.height; elements.canvas.getContext('2d').drawImage(image, 0, 0); state.dataUrl = response.dataUrl; elements.output.hidden = true; elements.canvas.hidden = false;
}

function parseColor(value) { const text = String(value).trim().replace('#', ''); if (!/^[0-9a-f]{6}$/i.test(text)) throw new Error('颜色必须是 6 位 HEX'); return [0, 2, 4].map(index => parseInt(text.slice(index, index + 2), 16)); }
function rgbToHex(r, g, b) { return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`; }
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = 0; const l = (max + min) / 2; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return [Math.round((h + 360) % 360), Math.round(s * 100), Math.round(l * 100)]; }
function luminance([r, g, b]) { return [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0); }
function contrast(a, b) { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + .05) / (dark + .05); }

async function runProductivity(execute) {
  if (profile.id === 'calculation-paper') return calculatePaper();
  if (profile.id === 'unit-converter') return convertUnit();
  if (profile.id === 'date-world-clock') return calculateDate();
  if (profile.id === 'pomodoro-focus') return togglePomodoro();
  if (!execute) { renderItems(); return; }
  const title = state.values.title || state.values.project || '未命名';
  const item = { id: cryptoId(), createdAt: new Date().toISOString(), title, content: elements.input.value, ...state.values };
  if (profile.id === 'habit-tracker') item.dates = [new Date().toISOString().slice(0, 10)];
  state.items.unshift(item); await persistItems(); renderItems();
  if (profile.id === 'floating-notes') await api.window.togglePin();
  if (profile.id === 'worklog') state.output = buildWorklogReport();
}

function calculatePaper() {
  const variables = {}; const results = elements.input.value.split(/\r?\n/).filter(Boolean).map(line => {
    const assignment = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.+)$/); const expression = (assignment ? assignment[2] : line).replace(/[A-Za-z_]\w*/g, name => Object.hasOwn(variables, name) ? variables[name] : name);
    if (!/^[\d\s+\-*/().%]+$/.test(expression)) return `${line}  →  不支持的表达式`;
    const value = Function(`"use strict"; return (${expression})`)(); if (assignment) variables[assignment[1]] = value; return `${line}  =  ${value}`;
  }); showText(results.join('\n'));
}

function convertUnit() {
  const value = Number(elements.input.value.trim()); if (!Number.isFinite(value)) throw new Error('请输入数字');
  const maps = { length: { mm: .001, cm: .01, m: 1, km: 1000, in: .0254, ft: .3048 }, weight: { g: .001, kg: 1, t: 1000, lb: .45359237 }, speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: .44704 } };
  let result; if (state.values.unitType === 'temperature') result = convertTemperature(value, state.values.fromUnit, state.values.toUnit); else { const map = maps[state.values.unitType]; if (!map?.[state.values.fromUnit] || !map?.[state.values.toUnit]) throw new Error('单位不支持，请使用该类型的标准缩写'); result = value * map[state.values.fromUnit] / map[state.values.toUnit]; }
  showText(`${value} ${state.values.fromUnit} = ${result} ${state.values.toUnit}`);
}
function convertTemperature(value, from, to) { const c = from === 'f' ? (value - 32) * 5 / 9 : from === 'k' ? value - 273.15 : value; return to === 'f' ? c * 9 / 5 + 32 : to === 'k' ? c + 273.15 : c; }

function calculateDate() {
  const inputDate = elements.input.value.trim() ? new Date(elements.input.value.trim()) : new Date(); if (Number.isNaN(inputDate.getTime())) throw new Error('日期格式无法识别');
  let remaining = Number(state.values.addDays || 0); const direction = remaining >= 0 ? 1 : -1; while (remaining !== 0) { inputDate.setDate(inputDate.getDate() + direction); if (!state.values.workdays || ![0, 6].includes(inputDate.getDay())) remaining -= direction; }
  showText(JSON.stringify({ date: inputDate.toISOString().slice(0, 10), localTime: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeStyle: 'long', timeZone: state.values.timeZone || 'Asia/Shanghai' }).format(inputDate), timestamp: inputDate.getTime() }, null, 2));
}

function togglePomodoro() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; showText('计时已暂停'); return; }
  state.remaining ||= Number(state.values.focusMinutes || 25) * 60;
  const tick = () => { const minutes = String(Math.floor(state.remaining / 60)).padStart(2, '0'); const seconds = String(state.remaining % 60).padStart(2, '0'); showText(`${minutes}:${seconds}`); if (state.remaining-- <= 0) { clearInterval(state.timer); state.timer = null; new Notification('番茄专注', { body: '本轮专注完成，请休息一下。' }); } };
  tick(); state.timer = setInterval(tick, 1000);
}

async function runLocalSystem(execute) {
  if (profile.id === 'clipboard-history') {
    const value = api.readClipboardText(); const image = value ? '' : api.readClipboardImage();
    if (value && !state.items.some(item => item.content === value)) state.items.unshift({ id: cryptoId(), title: value.slice(0, 40), content: value, type: 'text', createdAt: new Date().toISOString() });
    else if (image && !state.items.some(item => item.content === image)) state.items.unshift({ id: cryptoId(), title: '剪贴板图片', content: image, type: 'image', createdAt: new Date().toISOString() });
    state.items = state.items.slice(0, Number(state.values.limit || 200)); await persistItems();
    if (execute && state.values.keepAlive) await api.window.keepAlive(); renderItems(); return;
  }
  const dataUrl = api.readClipboardImage(); if (!dataUrl) throw new Error('剪贴板中没有图片'); const image = new Image(); image.src = dataUrl; await image.decode(); elements.canvas.width = image.width; elements.canvas.height = image.height; elements.canvas.getContext('2d').globalAlpha = Number(state.values.opacity || 90) / 100; elements.canvas.getContext('2d').drawImage(image, 0, 0); state.dataUrl = dataUrl; elements.output.hidden = true; elements.canvas.hidden = false; if (execute) { await api.window.togglePin(); await api.window.showIndicator(); }
}

function showCards(cards) {
  elements.cards.innerHTML = ''; elements.cards.hidden = false; elements.output.hidden = true; elements.canvas.hidden = true;
  cards.forEach(cardData => {
    const card = document.createElement('div'); card.className = 'card'; if (cardData.color) card.style.borderLeft = `8px solid ${cardData.color}`;
    const title = document.createElement('strong'); title.textContent = cardData.title; const subtitle = document.createElement('small'); subtitle.textContent = cardData.subtitle || ''; card.append(title, subtitle);
    if (cardData.action || cardData.deleteAction) {
      const actions = document.createElement('div'); actions.className = 'card-actions';
      if (cardData.action) { const open = document.createElement('button'); open.className = 'secondary'; open.textContent = '打开/切换'; open.addEventListener('click', event => { event.stopPropagation(); cardData.action(); }); actions.appendChild(open); }
      if (cardData.deleteAction) { const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = '删除'; remove.addEventListener('click', event => { event.stopPropagation(); cardData.deleteAction(); }); actions.appendChild(remove); }
      card.appendChild(actions);
    }
    elements.cards.appendChild(card);
  });
}

function renderItems() {
  const query = String(state.values.search || '').trim().toLowerCase();
  const visibleItems = query ? state.items.filter(item => `${item.title} ${item.content} ${item.tags}`.toLowerCase().includes(query)) : state.items;
  const cards = visibleItems.map(item => ({ title: itemTitle(item), subtitle: itemSubtitle(item), action: async () => {
    if (profile.id === 'bookmark-launcher' && item.url) return api.openExternal(item.url);
    if (profile.id === 'habit-tracker') { const today = new Date().toISOString().slice(0, 10); item.dates ||= []; if (!item.dates.includes(today)) item.dates.push(today); await persistItems(); renderItems(); return; }
    if (profile.id === 'todo-list') { item.completed = !item.completed; item.completedAt = item.completed ? new Date().toISOString() : null; await persistItems(); renderItems(); return; }
    if (item.type === 'image') { const image = new Image(); image.src = item.content; await image.decode(); elements.canvas.width = image.width; elements.canvas.height = image.height; elements.canvas.getContext('2d').drawImage(image, 0, 0); state.dataUrl = item.content; elements.output.hidden = true; elements.cards.hidden = true; elements.canvas.hidden = false; return; }
    elements.input.value = item.content || ''; state.output = item.content || ''; api.copyText(item.content || item.title);
  }, deleteAction: async () => { state.items = state.items.filter(row => row.id !== item.id); await persistItems(); renderItems(); } })); showCards(cards); state.output = profile.id === 'worklog' ? buildWorklogReport() : JSON.stringify(state.items, null, 2);
}

function itemTitle(item) {
  if (profile.id === 'todo-list') return `${item.completed ? '✅' : '⬜'} [${item.priority || 'medium'}] ${item.title}`;
  if (profile.id === 'habit-tracker') return `${item.title} · 连续 ${habitStreak(item.dates || [])} 天`;
  return item.title;
}

function itemSubtitle(item) {
  if (profile.id === 'worklog') return `${item.date || item.createdAt?.slice(0, 10)} · ${item.project || item.title} · ${item.minutes || 0} 分钟`;
  if (profile.id === 'bookmark-launcher') return `${item.alias || ''} ${item.url || ''}`.trim();
  if (profile.id === 'todo-list') return `${item.group || '默认'} · 截止 ${item.due || '未设置'}`;
  return `${item.createdAt?.slice(0, 10) || ''} ${item.content?.slice(0, 80) || ''}`;
}

function habitStreak(dates) {
  const set = new Set(dates); let streak = 0; const cursor = new Date();
  while (set.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function buildWorklogReport() {
  const totals = new Map(); let all = 0;
  state.items.forEach(item => { const minutes = Number(item.minutes || 0); all += minutes; totals.set(item.project || item.title, (totals.get(item.project || item.title) || 0) + minutes); });
  return [`工时合计：${Math.floor(all / 60)} 小时 ${all % 60} 分钟`, ...[...totals.entries()].map(([project, minutes]) => `- ${project}: ${Math.floor(minutes / 60)}小时${minutes % 60}分钟`)].join('\n');
}

async function persistItems() { await api.storage.set('state', { schemaVersion: 1, items: state.items }); }
function cryptoId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }

async function initialize() {
  elements.title.textContent = profile.name; elements.description.textContent = profile.description; elements.category.textContent = `${String(profile.order).padStart(2, '0')} · ${profile.category}`; document.title = profile.name;
  renderControls();
  if (profile.kind === 'productivity' || ['clipboard-history'].includes(profile.id)) { const stored = await api.storage.get('state'); state.items = stored?.items || []; renderItems(); }
  window.addEventListener('plugin-enter', event => { const payload = event.detail?.payload || event.detail?.clipboardText || ''; if (payload) elements.input.value = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2); });
  if (profile.id === 'clipboard-history') setInterval(() => runLocalSystem(false).catch(() => {}), 1500);
  if (profile.id === 'image-pinboard' && new URLSearchParams(location.search).get('view') === 'indicator') {
    document.querySelector('.hero').hidden = true; elements.status.hidden = true; elements.controls.hidden = true;
    document.querySelector('.editor-panel').hidden = true; document.querySelector('.workspace').style.display = 'block';
    await runLocalSystem(false);
  }
  setStatus('准备就绪；所有数据默认仅在本机处理。');
}

elements.run.addEventListener('click', () => run(true));
elements.preview.addEventListener('click', () => run(false));
elements.clear.addEventListener('click', () => { elements.input.value = ''; showText('尚未生成结果'); setStatus('已清空'); });
elements.copy.addEventListener('click', () => { api.copyText(state.output || elements.output.textContent); setStatus('结果已复制', 'success'); });
elements.save.addEventListener('click', () => { const result = api.saveResult(state.dataUrl ? { title: '保存图片', defaultPath: `${profile.name}.png`, dataUrl: state.dataUrl } : { title: '保存结果', defaultPath: `${profile.name}.txt`, text: state.output }); if (!result.cancelled) setStatus(`已保存到 ${result.path}`, 'success'); });
elements.export.addEventListener('click', () => { const result = api.saveResult({ title: '导出插件数据', defaultPath: `${profile.id}-data.json`, text: JSON.stringify({ schemaVersion: 1, items: state.items, output: state.output }, null, 2) }); if (!result.cancelled) setStatus(`已导出到 ${result.path}`, 'success'); });
elements.pin.addEventListener('click', async () => { const pinned = await api.window.togglePin(); elements.pin.textContent = pinned ? '取消置顶' : '置顶'; });

initialize().catch(error => setStatus(error.message || String(error), 'error'));
