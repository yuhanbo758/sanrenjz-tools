const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { catalog } = require('./plugin-market/catalog');
const { specs } = require('./plugin-market/ui-specs');

const root = path.resolve(__dirname, '..');
const pluginRoot = path.join(root, 'app', 'software');
const required = ['plugin.json', 'profile.json', 'index.html', 'preload.js', 'renderer.js', 'styles.css', 'logo.svg', 'logo.png', 'logo.ico', 'README.md'];
const maxBatch = Number(process.argv[2] || 5);
const selectedCatalog = catalog.filter(plugin => plugin.batch <= maxBatch);
const errors = [];
const featureCodes = new Map();
const pluginNames = new Map();
const uiIds = new Set();

for (const directory of fs.readdirSync(pluginRoot, { withFileTypes: true }).filter(item => item.isDirectory())) {
  const manifestPath = path.join(pluginRoot, directory.name, 'plugin.json');
  if (!fs.existsSync(manifestPath)) continue;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch (error) { errors.push(`${directory.name}: plugin.json 无法解析：${error.message}`); continue; }
  if (pluginNames.has(manifest.pluginName)) errors.push(`${directory.name}: pluginName 与 ${pluginNames.get(manifest.pluginName)} 重复`);
  pluginNames.set(manifest.pluginName, directory.name);
  for (const feature of manifest.features || []) {
    if (featureCodes.has(feature.code)) errors.push(`${directory.name}: Feature Code 与 ${featureCodes.get(feature.code)} 重复：${feature.code}`);
    featureCodes.set(feature.code, directory.name);
  }
}

for (const plugin of selectedCatalog) {
  const directory = path.join(pluginRoot, plugin.folder);
  if (!fs.existsSync(directory)) { errors.push(`${plugin.folder}: 插件目录不存在`); continue; }
  for (const fileName of required) if (!fs.existsSync(path.join(directory, fileName))) errors.push(`${plugin.folder}: 缺少 ${fileName}`);
  if (errors.some(error => error.startsWith(`${plugin.folder}: 缺少`))) continue;

  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'plugin.json'), 'utf8'));
  const storedProfile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8'));
  if (manifest.pluginName !== plugin.name || storedProfile.id !== plugin.id) errors.push(`${plugin.folder}: 清单与目录定义不一致`);
  if (manifest.features?.[0]?.code !== `plugin-market-${plugin.id}`) errors.push(`${plugin.folder}: Feature Code 不符合约定`);
  if (!manifest.features?.[0]?.cmds?.length) errors.push(`${plugin.folder}: 没有搜索命令`);
  if (!Array.isArray(manifest.features?.[0]?.platform) || !manifest.features[0].platform.includes('win32')) errors.push(`${plugin.folder}: 未声明 Windows 平台`);

  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  if (/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html)) errors.push(`${plugin.folder}: 页面引用了远程脚本或样式`);
  const ui = specs[plugin.id];
  if (!ui || storedProfile.ui?.id !== ui.id || !html.includes(`data-ui="${ui.id}"`)) errors.push(`${plugin.folder}: 独立界面规格未正确落盘`);
  if (uiIds.has(ui?.id)) errors.push(`${plugin.folder}: 独立界面 ID 重复：${ui?.id}`); else uiIds.add(ui?.id);
  const ico = fs.readFileSync(path.join(directory, 'logo.ico'));
  if (ico.length < 32 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) < 5) errors.push(`${plugin.folder}: logo.ico 不是有效的多尺寸 ICO`);
  const png = fs.readFileSync(path.join(directory, 'logo.png'));
  if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) errors.push(`${plugin.folder}: logo.png 不是有效 PNG`);
  const svg = fs.readFileSync(path.join(directory, 'logo.svg'), 'utf8');
  if (!svg.includes('<svg') || !svg.includes('<linearGradient') || !storedProfile.visual?.iconStyle) errors.push(`${plugin.folder}: 原创 SVG 或视觉配置不完整`);
  for (const script of ['preload.js', 'renderer.js']) {
    const result = spawnSync(process.execPath, ['--check', path.join(directory, script)], { encoding: 'utf8' });
    if (result.status !== 0) errors.push(`${plugin.folder}/${script}: ${result.stderr.trim()}`);
  }
}

if (catalog.length !== 50) errors.push(`目录应包含 50 个插件，实际为 ${catalog.length}`);
if (errors.length) {
  console.error(`插件校验失败（${errors.length} 项）：\n${errors.map(error => `- ${error}`).join('\n')}`);
  process.exit(1);
}
console.log(`插件校验通过：前 ${maxBatch} 批共 ${selectedCatalog.length} 个新增插件，${featureCodes.size} 个全局 Feature Code。`);
