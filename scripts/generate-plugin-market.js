const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { catalog } = require('./plugin-market/catalog');

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
  fs.mkdirSync(target, { recursive: true });
  for (const fileName of ['index.html', 'styles.css', 'preload.js', 'renderer.js']) {
    fs.copyFileSync(path.join(templateRoot, fileName), path.join(target, fileName));
  }

  fs.writeFileSync(path.join(target, 'profile.json'), `${JSON.stringify(plugin, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(target, 'plugin.json'), `${JSON.stringify(createManifest(plugin), null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(target, 'README.md'), createReadme(plugin), 'utf8');
  fs.writeFileSync(path.join(target, 'logo.svg'), createSvg(plugin), 'utf8');
  fs.writeFileSync(path.join(target, 'logo.ico'), createIco(colorFromId(plugin.id)));
  copyLicenses(plugin, target);
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

function createReadme(plugin) {
  return `# ${plugin.name}\n\n${plugin.description}\n\n## 使用方式\n\n- 在主界面或搜索窗口输入“${plugin.keywords[0]}”启动。\n- 左侧配置处理选项，中间输入或选择本地数据，右侧查看结果。\n- “预览”不会执行文件或系统写入；“开始处理”才会执行明确选择的操作。\n\n## 隐私与安全\n\n- 默认完全在本机运行，不上传输入、文件或使用记录。\n- 文件和系统修改会先显示预览；高风险操作需要用户主动确认。\n- 插件设置使用宿主提供的独立插件存储，数据结构版本为 1。\n\n## 兼容性\n\nWindows 提供完整验收；不依赖 Windows 系统能力的功能同时兼容 macOS 和 Linux。\n`;
}

function createSvg(plugin) {
  const color = colorFromId(plugin.id);
  const initials = plugin.name.replace(/工具|工作台|器|助手|管家/g, '').slice(0, 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="256" height="256" rx="58" fill="url(#g)"/><circle cx="190" cy="62" r="28" fill="rgba(255,255,255,.18)"/><text x="128" y="148" text-anchor="middle" fill="white" font-size="74" font-family="Microsoft YaHei, sans-serif" font-weight="700">${initials}</text></svg>`;
}

function colorFromId(id) {
  let hash = 0;
  for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 76% 50%)`;
}

/** 创建嵌入 PNG 的标准 ICO，避免伪装扩展名导致打包态图标无法读取。 */
function createIco(color) {
  const rgb = hslToRgb(color);
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

function hslToRgb(value) {
  const match = value.match(/hsl\((\d+)/); const h = Number(match?.[1] || 200) / 360; const s = .76; const l = .5;
  const hue = p => { p = (p + 1) % 1; if (p < 1 / 6) return l + (2 * l * s) * 6 * p; if (p < .5) return l + 2 * l * s; if (p < 2 / 3) return l + (2 * l * s) * (2 / 3 - p) * 6; return l - 2 * l * s; };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map(channel => Math.max(0, Math.min(255, Math.round(channel * 255))));
}

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
