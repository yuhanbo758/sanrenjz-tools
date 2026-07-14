const { contextBridge, ipcRenderer, clipboard, nativeImage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const http = require('http');
const { execFile, spawn } = require('child_process');
const profile = require('./profile.json');

let lanServer = null;
let projectProcess = null;

/** 统一把错误转换为可直接显示的中文消息，避免把 Electron/Node 对象泄露到页面。 */
function safeError(error) {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function ensureArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function walkDirectory(root, options = {}) {
  const maxFiles = Number(options.maxFiles || 20000);
  const rows = [];
  const pending = [root];
  while (pending.length && rows.length < maxFiles) {
    const current = pending.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile()) {
        let stat;
        try { stat = fs.statSync(fullPath); } catch (_) { continue; }
        rows.push({
          path: fullPath,
          relativePath: path.relative(root, fullPath),
          name: entry.name,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          extension: path.extname(entry.name).toLowerCase()
        });
        if (rows.length >= maxFiles) break;
      }
    }
  }
  return rows;
}

function hashFile(filePath, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest('hex');
}

function queryJson(value, query) {
  if (!query.trim()) return value;
  const parts = query.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  return parts.reduce((current, key) => current == null ? undefined : current[key], value);
}

function parseProperties(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const index = line.search(/[:=]/);
    const key = index < 0 ? line : line.slice(0, index).trim();
    result[key] = index < 0 ? '' : line.slice(index + 1).trim();
  }
  return result;
}

function parseSimpleYaml(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const match = rawLine.match(/^\s*([^:#]+):\s*(.*)$/);
    if (match) result[match[1].trim()] = parseScalar(match[2]);
  }
  return result;
}

function parseSimpleToml(text) {
  const result = {};
  let current = result;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      current = result;
      for (const part of section[1].split('.')) current = current[part] ||= {};
      continue;
    }
    const match = line.match(/^([^=]+)=\s*(.*)$/);
    if (match) current[match[1].trim()] = parseScalar(match[2]);
  }
  return result;
}

function parseScalar(value) {
  const text = String(value).trim();
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}

function toYaml(value, indent = 0) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return Object.entries(value).map(([key, item]) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) return `${' '.repeat(indent)}${key}:\n${toYaml(item, indent + 2)}`;
    return `${' '.repeat(indent)}${key}: ${Array.isArray(item) ? JSON.stringify(item) : String(item)}`;
  }).join('\n');
}

function toToml(value, prefix = '') {
  const scalar = [];
  const sections = [];
  for (const [key, item] of Object.entries(value || {})) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const full = prefix ? `${prefix}.${key}` : key;
      sections.push(`[${full}]\n${toToml(item, full)}`);
    } else scalar.push(`${key} = ${JSON.stringify(item)}`);
  }
  return [...scalar, ...sections].filter(Boolean).join('\n\n');
}

function formatXml(xml) {
  const compact = xml.replace(/>\s+</g, '><').trim();
  let depth = 0;
  return compact.replace(/(<[^>]+>)/g, '$1\n').split('\n').filter(Boolean).map(token => {
    if (/^<\//.test(token)) depth = Math.max(0, depth - 1);
    const line = `${'  '.repeat(depth)}${token}`;
    if (/^<[^!?/][^>]*[^/]>/i.test(token) && !/<\/[^>]+>$/.test(token)) depth += 1;
    return line;
  }).join('\n');
}

function decodeJwtPart(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

function textDiff(left, right) {
  const a = left.split('\n');
  const b = right.split('\n');
  const max = Math.max(a.length, b.length);
  const output = [];
  for (let index = 0; index < max; index += 1) {
    if (a[index] === b[index]) output.push(`  ${a[index] ?? ''}`);
    else {
      if (a[index] !== undefined) output.push(`- ${a[index]}`);
      if (b[index] !== undefined) output.push(`+ ${b[index]}`);
    }
  }
  return output.join('\n');
}

function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function runPowerShell(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, ...extraEnv } },
      (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout.trim()));
  });
}

async function runTextTask(input, options) {
  switch (profile.id) {
    case 'json-workbench': {
      const value = JSON.parse(input);
      const queried = queryJson(value, options.query || '');
      return options.action === 'minify' ? JSON.stringify(queried) : JSON.stringify(queried, null, 2);
    }
    case 'config-converter': {
      const source = options.source || 'json';
      const target = options.target || 'yaml';
      const value = source === 'json' ? JSON.parse(input) : source === 'properties' ? parseProperties(input) : source === 'toml' ? parseSimpleToml(input) : parseSimpleYaml(input);
      if (target === 'json') return JSON.stringify(value, null, 2);
      if (target === 'properties') return Object.entries(value).map(([key, item]) => `${key}=${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n');
      if (target === 'toml') return toToml(value);
      return toYaml(value);
    }
    case 'xml-workbench': return options.action === 'minify' ? input.replace(/>\s+</g, '><').trim() : formatXml(input);
    case 'codec-assistant': {
      const action = options.action || 'base64-encode';
      if (action === 'base64-encode') return Buffer.from(input, 'utf8').toString('base64');
      if (action === 'base64-decode') return Buffer.from(input, 'base64').toString('utf8');
      if (action === 'url-encode') return encodeURIComponent(input);
      if (action === 'url-decode') return decodeURIComponent(input);
      if (action === 'hex-encode') return Buffer.from(input, 'utf8').toString('hex');
      if (action === 'hex-decode') return Buffer.from(input.replace(/\s+/g, ''), 'hex').toString('utf8');
      if (action === 'unicode-encode') return [...input].map(char => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`).join('');
      if (action === 'unicode-decode') return input.replace(/\\u([\da-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
      if (action === 'html-encode') return input.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      return input.replace(/&(amp|lt|gt|quot|#39);/g, token => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[token]));
    }
    case 'hash-hmac': {
      const algorithm = options.algorithm || 'sha256';
      return options.key ? crypto.createHmac(algorithm, options.key).update(input).digest(options.encoding || 'hex') : crypto.createHash(algorithm).update(input).digest(options.encoding || 'hex');
    }
    case 'id-generator': {
      const count = Math.min(1000, Math.max(1, Number(options.count || 1)));
      const length = Math.min(128, Math.max(4, Number(options.length || 21)));
      const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
      return Array.from({ length: count }, () => options.type === 'uuid' ? crypto.randomUUID() : Array.from(crypto.randomBytes(length), byte => alphabet[byte % alphabet.length]).join('')).join('\n');
    }
    case 'time-converter': {
      const date = input.trim() ? (/^\d{10,13}$/.test(input.trim()) ? new Date(Number(input.trim()) * (input.trim().length === 10 ? 1000 : 1)) : new Date(input.trim())) : new Date();
      if (Number.isNaN(date.getTime())) throw new Error('无法识别输入的日期或时间戳');
      return JSON.stringify({ iso: date.toISOString(), local: date.toLocaleString('zh-CN', { timeZone: options.timeZone || undefined }), timestampSeconds: Math.floor(date.getTime() / 1000), timestampMilliseconds: date.getTime() }, null, 2);
    }
    case 'regex-lab': {
      const expression = new RegExp(options.pattern || '', options.flags || 'g');
      if (options.replacement !== undefined && options.replacement !== '') return input.replace(expression, options.replacement);
      return JSON.stringify([...input.matchAll(expression)].map(match => ({ value: match[0], index: match.index, groups: match.slice(1), namedGroups: match.groups || {} })), null, 2);
    }
    case 'jwt-inspector': {
      const parts = input.trim().split('.');
      if (parts.length !== 3) throw new Error('JWT 必须包含 header.payload.signature 三段');
      const header = decodeJwtPart(parts[0]);
      const payload = decodeJwtPart(parts[1]);
      let verified = null;
      if (options.secret) {
        const algorithm = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' }[header.alg];
        if (!algorithm) throw new Error('当前仅支持 HS256、HS384、HS512 本地验证');
        const signature = crypto.createHmac(algorithm, options.secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
        verified = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(parts[2]));
      }
      return JSON.stringify({ header, payload, expired: payload.exp ? Date.now() >= payload.exp * 1000 : null, verified }, null, 2);
    }
    case 'text-diff': return textDiff(input, options.rightText || '');
    case 'csv-table': {
      const rows = parseCsv(input, options.delimiter || ',');
      if (options.action === 'json') {
        const [headers = [], ...data] = rows;
        return JSON.stringify(data.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || '']))), null, 2);
      }
      const sorted = options.sortColumn === '' || options.sortColumn == null ? rows : [rows[0], ...rows.slice(1).sort((a, b) => String(a[Number(options.sortColumn)] || '').localeCompare(String(b[Number(options.sortColumn)] || ''), 'zh-CN'))];
      return sorted.map(row => row.map(field => /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field).join(options.delimiter || ',')).join('\n');
    }
    case 'line-processor': {
      let lines = input.split(/\r?\n/);
      if (options.filter) lines = lines.filter(line => line.includes(options.filter));
      if (options.unique) lines = [...new Set(lines)];
      if (options.sort) lines.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
      return lines.map((line, index) => `${options.number ? `${index + 1}. ` : ''}${options.prefix || ''}${line}${options.suffix || ''}`).join('\n');
    }
    default: throw new Error(`文本内核尚未注册任务：${profile.id}`);
  }
}

async function runFileTask(input, options, execute) {
  const files = ensureArray(options.files).filter(Boolean);
  switch (profile.id) {
    case 'batch-renamer': {
      if (!options.directory) throw new Error('请先选择目录');
      const entries = fs.readdirSync(options.directory, { withFileTypes: true }).filter(item => item.isFile());
      const start = Number(options.start || 1);
      const plan = entries.map((entry, index) => {
        const ext = path.extname(entry.name); const base = path.basename(entry.name, ext);
        const replaced = options.find ? base.replace(new RegExp(options.find, options.regex ? 'g' : 'g'), options.replace || '') : base;
        const next = `${options.prefix || ''}${options.number ? String(start + index).padStart(Number(options.padding || 2), '0') + '-' : ''}${replaced}${options.suffix || ''}${ext}`;
        return { from: path.join(options.directory, entry.name), to: path.join(options.directory, next), before: entry.name, after: next };
      }).filter(item => item.from !== item.to);
      const destinations = new Set();
      for (const item of plan) {
        if (destinations.has(item.to) || (fs.existsSync(item.to) && !plan.some(row => row.from === item.to))) throw new Error(`目标文件冲突：${item.after}`);
        destinations.add(item.to);
      }
      if (execute) {
        const temporary = plan.map((item, index) => ({ ...item, temp: `${item.from}.sanrenjz-${Date.now()}-${index}.tmp` }));
        temporary.forEach(item => fs.renameSync(item.from, item.temp));
        try { temporary.forEach(item => fs.renameSync(item.temp, item.to)); }
        catch (error) { temporary.filter(item => fs.existsSync(item.temp)).forEach(item => fs.renameSync(item.temp, item.from)); throw error; }
      }
      return plan;
    }
    case 'file-content-search': {
      if (!options.directory || !options.query) throw new Error('请选择目录并输入搜索内容');
      const extensions = String(options.extensions || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
      const matches = [];
      for (const file of walkDirectory(options.directory, { maxFiles: 20000 })) {
        if (extensions.length && !extensions.includes(file.extension.replace('.', ''))) continue;
        if (file.size > Number(options.maxSizeMb || 5) * 1024 * 1024) continue;
        let text; try { text = fs.readFileSync(file.path, 'utf8'); } catch (_) { continue; }
        text.split(/\r?\n/).forEach((line, index) => { if (line.includes(options.query)) matches.push({ path: file.path, line: index + 1, text: line.trim().slice(0, 300) }); });
        if (matches.length >= 5000) break;
      }
      return matches;
    }
    case 'folder-compare': {
      if (!options.directoryA || !options.directoryB) throw new Error('请选择两个需要比较的目录');
      const left = new Map(walkDirectory(options.directoryA).map(item => [item.relativePath, item]));
      const right = new Map(walkDirectory(options.directoryB).map(item => [item.relativePath, item]));
      return [...new Set([...left.keys(), ...right.keys()])].sort().map(relativePath => {
        const a = left.get(relativePath); const b = right.get(relativePath);
        if (!a) return { relativePath, status: '仅右侧' };
        if (!b) return { relativePath, status: '仅左侧' };
        const same = options.hash ? hashFile(a.path) === hashFile(b.path) : a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < 1000;
        return { relativePath, status: same ? '相同' : '不同', leftSize: a.size, rightSize: b.size };
      });
    }
    case 'text-encoding': {
      if (!files.length) throw new Error('请选择文本文件');
      const iconv = require('iconv-lite');
      const results = [];
      for (const filePath of files) {
        const source = fs.readFileSync(filePath);
        let text = iconv.decode(source, options.sourceEncoding || 'utf8');
        if (options.newline === 'lf') text = text.replace(/\r\n?/g, '\n');
        if (options.newline === 'crlf') text = text.replace(/\r?\n/g, '\r\n');
        const output = `${filePath}${options.suffix || '.converted.txt'}`;
        if (execute) fs.writeFileSync(output, iconv.encode(text, options.targetEncoding || 'utf8'));
        results.push({ source: filePath, output, characters: text.length });
      }
      return results;
    }
    case 'directory-tree': {
      if (!options.directory) throw new Error('请选择目录');
      const filesInTree = walkDirectory(options.directory);
      if (options.format === 'json') return JSON.stringify(filesInTree.map(item => item.relativePath), null, 2);
      return filesInTree.map(item => `${options.format === 'markdown' ? '- ' : ''}${item.relativePath}`).join('\n');
    }
    case 'file-checksum': {
      if (!files.length) throw new Error('请选择文件');
      return files.map(filePath => ({ file: filePath, sha256: hashFile(filePath) }));
    }
    case 'pdf-organizer': {
      if (!files.length) throw new Error('请选择 PDF 文件');
      const { PDFDocument, degrees } = require('pdf-lib');
      const output = await PDFDocument.create();
      for (const filePath of files) {
        const source = await PDFDocument.load(fs.readFileSync(filePath));
        const indexes = source.getPageIndices();
        const pages = await output.copyPages(source, indexes);
        pages.forEach(page => { if (Number(options.rotation || 0)) page.setRotation(degrees(Number(options.rotation))); output.addPage(page); });
      }
      const bytes = await output.save();
      if (execute) {
        const target = options.output || path.join(path.dirname(files[0]), 'PDF页面整理结果.pdf');
        fs.writeFileSync(target, bytes);
        return { output: target, pages: output.getPageCount(), bytes: bytes.length };
      }
      return { pages: output.getPageCount(), bytes: bytes.length, hint: '预览完成，点击开始处理后写入文件' };
    }
    case 'archive-tool': {
      const fflate = require('fflate');
      if (options.action === 'create') {
        if (!files.length) throw new Error('请选择需要压缩的文件');
        const data = Object.fromEntries(files.map(filePath => [path.basename(filePath), new Uint8Array(fs.readFileSync(filePath))]));
        const zipped = fflate.zipSync(data, { level: Number(options.level || 6) });
        const target = options.output || path.join(path.dirname(files[0]), '三人聚智压缩包.zip');
        if (execute) fs.writeFileSync(target, zipped);
        return { output: target, files: files.length, bytes: zipped.length };
      }
      if (!files[0]) throw new Error('请选择 ZIP 文件');
      const entries = fflate.unzipSync(new Uint8Array(fs.readFileSync(files[0])));
      const names = Object.keys(entries);
      if (execute && options.outputDirectory) {
        for (const [name, bytes] of Object.entries(entries)) {
          const safeTarget = path.resolve(options.outputDirectory, name);
          const safeRoot = `${path.resolve(options.outputDirectory)}${path.sep}`;
          if (!safeTarget.startsWith(safeRoot)) throw new Error(`压缩包包含不安全路径：${name}`);
          fs.mkdirSync(path.dirname(safeTarget), { recursive: true });
          fs.writeFileSync(safeTarget, bytes);
        }
      }
      return names.map(name => ({ name, bytes: entries[name].length }));
    }
    default: return runTextTask(input, options);
  }
}

async function runSystemTask(input, options, execute) {
  switch (profile.id) {
    case 'local-file-search': {
      if (!options.query) throw new Error('请输入文件名关键字');
      if (process.platform === 'win32') {
        try {
          const stdout = await new Promise((resolve, reject) => execFile('es.exe', ['-n', '500', options.query], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, out) => error ? reject(error) : resolve(out)));
          return stdout.split(/\r?\n/).filter(Boolean).map(filePath => ({ path: filePath, source: 'Everything' }));
        } catch (_) { /* 未安装 Everything 时自动使用目录扫描。 */ }
      }
      if (!options.directory) throw new Error('未检测到 Everything，请选择回退搜索目录');
      return walkDirectory(options.directory).filter(item => item.name.toLowerCase().includes(options.query.toLowerCase())).slice(0, 1000);
    }
    case 'disk-analyzer': {
      if (!options.directory) throw new Error('请选择需要分析的目录');
      const files = walkDirectory(options.directory, { maxFiles: 100000 });
      const extensions = {};
      let total = 0;
      files.forEach(file => { total += file.size; extensions[file.extension || '[无扩展名]'] = (extensions[file.extension || '[无扩展名]'] || 0) + file.size; });
      return { totalBytes: total, fileCount: files.length, largestFiles: files.sort((a, b) => b.size - a.size).slice(0, 100), extensionBytes: extensions };
    }
    case 'process-monitor': {
      const rows = process.platform === 'win32'
        ? JSON.parse((await runPowerShell("Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,Path | ConvertTo-Json -Compress")) || '[]')
        : [];
      if (execute && options.pid) {
        const pid = Number(options.pid);
        if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) throw new Error('无效或受保护的进程 ID');
        process.kill(pid);
        return { stopped: pid };
      }
      return ensureArray(rows).sort((a, b) => Number(b.WorkingSet64 || 0) - Number(a.WorkingSet64 || 0));
    }
    case 'port-inspector': {
      if (process.platform !== 'win32') return { message: '当前首版端口详情在 Windows 上完整支持。' };
      const output = await runPowerShell("Get-NetTCPConnection -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess | Sort-Object LocalPort | ConvertTo-Json -Compress");
      return ensureArray(JSON.parse(output || '[]'));
    }
    case 'environment-manager': {
      if (execute && options.name) {
        if (!/^[A-Za-z_][A-Za-z0-9_()]*$/.test(options.name)) throw new Error('环境变量名称格式不正确');
        if (process.platform === 'win32') {
          const previous = await runPowerShell("[Environment]::GetEnvironmentVariable($env:SANRENJZ_ENV_NAME, 'User')", { SANRENJZ_ENV_NAME: options.name });
          await runPowerShell("[Environment]::SetEnvironmentVariable($env:SANRENJZ_ENV_NAME, $env:SANRENJZ_ENV_VALUE, 'User')", { SANRENJZ_ENV_NAME: options.name, SANRENJZ_ENV_VALUE: String(options.value || '') });
          return { updated: options.name, previous, current: String(options.value || ''), restoreHint: '把原值重新填入并执行即可恢复' };
        }
        else throw new Error('首版环境变量写入仅支持 Windows 用户变量');
      }
      if (process.platform === 'win32') {
        const output = await runPowerShell("[Environment]::GetEnvironmentVariables('User').GetEnumerator() | Sort-Object Key | Select-Object Key,Value | ConvertTo-Json -Compress");
        return ensureArray(JSON.parse(output || '[]'));
      }
      return Object.entries(process.env).sort().map(([Key, Value]) => ({ Key, Value }));
    }
    case 'hosts-manager': {
      const hostsPath = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts') : '/etc/hosts';
      if (execute) {
        const backup = `${hostsPath}.sanrenjz-backup-${Date.now()}`;
        fs.copyFileSync(hostsPath, backup);
        try { fs.writeFileSync(hostsPath, String(input || ''), 'utf8'); }
        catch (error) { throw new Error(`写入失败，通常需要管理员权限。备份位置：${backup}。${error.message}`); }
        return { hostsPath, backup };
      }
      return { hostsPath, content: fs.readFileSync(hostsPath, 'utf8') };
    }
    case 'lan-transfer': return handleLanTransfer(options, execute);
    case 'project-launcher': return handleProject(options, execute);
    default: throw new Error(`系统内核尚未注册任务：${profile.id}`);
  }
}

async function handleLanTransfer(options, execute) {
  if (!execute) return lanServer ? { running: true, address: lanServer.address() } : { running: false };
  if (options.action === 'stop') {
    if (lanServer) lanServer.close();
    lanServer = null;
    return { running: false };
  }
  if (lanServer) return { running: true, address: lanServer.address() };
  const received = [];
  lanServer = http.createServer((request, response) => {
    if (request.method === 'POST') {
      const chunks = [];
      request.on('data', chunk => { if (chunks.reduce((sum, item) => sum + item.length, 0) < 20 * 1024 * 1024) chunks.push(chunk); });
      request.on('end', () => {
        const data = Buffer.concat(chunks); const requestedName = request.headers['x-filename'];
        if (requestedName && options.outputDirectory) {
          const safeName = path.basename(decodeURIComponent(String(requestedName))); const target = path.join(options.outputDirectory, `${Date.now()}-${safeName}`);
          fs.mkdirSync(options.outputDirectory, { recursive: true }); fs.writeFileSync(target, data); received.push({ time: new Date().toISOString(), file: target, bytes: data.length });
        } else received.push({ time: new Date().toISOString(), text: data.toString('utf8') });
        response.end('已收到');
      });
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<meta name="viewport" content="width=device-width"><h2>局域网快传</h2><textarea id="t" style="width:100%;height:160px" placeholder="输入文字"></textarea><button onclick="fetch(\'/\',{method:\'POST\',body:t.value}).then(()=>alert(\'文字发送成功\'))">发送文字</button><hr><input id="f" type="file"><button onclick="f.files[0]&&fetch(\'/\',{method:\'POST\',headers:{\'X-Filename\':encodeURIComponent(f.files[0].name)},body:f.files[0]}).then(()=>alert(\'文件发送成功\'))">发送文件</button>');
  });
  lanServer.received = received;
  await new Promise((resolve, reject) => { lanServer.once('error', reject); lanServer.listen(Number(options.port || 0), '0.0.0.0', resolve); });
  const address = lanServer.address();
  const networks = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal);
  return { running: true, port: address.port, urls: networks.map(item => `http://${item.address}:${address.port}`), received };
}

function handleProject(options, execute) {
  if (options.action === 'stop' && projectProcess) {
    projectProcess.kill(); projectProcess = null; return { running: false };
  }
  if (!execute) return { running: Boolean(projectProcess), pid: projectProcess?.pid || null };
  if (!options.directory || !options.command) throw new Error('请选择项目目录并填写启动命令');
  let [command, ...args] = String(options.command).match(/(?:[^\s"]+|"[^"]*")+/g)?.map(item => item.replace(/^"|"$/g, '')) || [];
  if (!command) throw new Error('启动命令为空');
  if (process.platform === 'win32' && ['npm', 'npx', 'pnpm', 'yarn'].includes(command.toLowerCase())) command = `${command}.cmd`;
  projectProcess = spawn(command, args, { cwd: options.directory, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  projectProcess.stdout?.on('data', chunk => logs.push(chunk.toString('utf8')));
  projectProcess.stderr?.on('data', chunk => logs.push(chunk.toString('utf8')));
  projectProcess.on('exit', () => { projectProcess = null; });
  return { running: true, pid: projectProcess.pid, logs };
}

async function runTask(payload = {}) {
  try {
    const input = String(payload.input || '');
    const options = payload.options || {};
    const execute = payload.execute === true;
    let result;
    if (profile.kind === 'text') result = await runTextTask(input, options);
    else if (profile.kind === 'file') result = await runFileTask(input, options, execute);
    else if (profile.kind === 'system') result = await runSystemTask(input, options, execute);
    else throw new Error('此插件的交互逻辑由渲染端本地内核处理');
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

function selectFiles(options = {}) {
  return ipcRenderer.sendSync('show-open-dialog', {
    title: options.title || '选择文件',
    properties: options.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
    filters: options.filters || []
  }) || [];
}

function selectDirectory(title = '选择目录') {
  const result = ipcRenderer.sendSync('show-open-dialog', { title, properties: ['openDirectory', 'createDirectory'] });
  return result?.[0] || '';
}

function saveResult(options = {}) {
  const target = ipcRenderer.sendSync('show-save-dialog', { title: options.title || '保存结果', defaultPath: options.defaultPath || 'result.txt', filters: options.filters || [] });
  if (!target) return { cancelled: true };
  if (options.dataUrl) {
    const image = nativeImage.createFromDataURL(options.dataUrl);
    const format = path.extname(target).toLowerCase();
    fs.writeFileSync(target, format === '.jpg' || format === '.jpeg' ? image.toJPEG(Number(options.quality || 90)) : image.toPNG());
  } else if (options.base64) fs.writeFileSync(target, Buffer.from(options.base64, 'base64'));
  else fs.writeFileSync(target, String(options.text || ''), 'utf8');
  return { cancelled: false, path: target };
}

function chooseSavePath(options = {}) {
  return ipcRenderer.sendSync('show-save-dialog', {
    title: options.title || '选择保存位置',
    defaultPath: options.defaultPath || 'result.txt',
    filters: options.filters || []
  }) || '';
}

async function generateQr(text, size) {
  try {
    const QRCode = require('qrcode');
    const dataUrl = await QRCode.toDataURL(String(text || ''), { width: Math.max(128, Math.min(1600, Number(size || 480))), margin: 2, errorCorrectionLevel: 'M' });
    return { ok: true, dataUrl };
  } catch (error) { return { ok: false, error: safeError(error) }; }
}

function decodeQr(dataUrl) {
  try {
    const jsQR = require('jsqr');
    const image = nativeImage.createFromDataURL(dataUrl);
    const { width, height } = image.getSize();
    const bgra = image.toBitmap();
    const rgba = new Uint8ClampedArray(bgra.length);
    for (let index = 0; index < bgra.length; index += 4) {
      rgba[index] = bgra[index + 2]; rgba[index + 1] = bgra[index + 1]; rgba[index + 2] = bgra[index]; rgba[index + 3] = bgra[index + 3];
    }
    const decoded = jsQR(rgba, width, height);
    return { ok: true, text: decoded?.data || '' };
  } catch (error) { return { ok: false, error: safeError(error) }; }
}

const api = {
  profile,
  runTask,
  selectFiles,
  selectDirectory,
  chooseSavePath,
  saveResult,
  generateQr,
  decodeQr,
  readFileDataUrl(filePath) {
    const extension = path.extname(filePath).slice(1).toLowerCase();
    const mime = extension === 'svg' ? 'image/svg+xml' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  },
  copyText(text) { clipboard.writeText(String(text || '')); },
  readClipboardText() { return clipboard.readText(); },
  readClipboardImage() { const image = clipboard.readImage(); return image.isEmpty() ? '' : image.toDataURL(); },
  openExternal(url) { return shell.openExternal(url); },
  showPath(filePath) { return shell.showItemInFolder(filePath); },
  storage: {
    get: key => ipcRenderer.invoke('plugin-storage-get-async', profile.name, key),
    set: (key, value) => ipcRenderer.invoke('plugin-storage-set-async', profile.name, key, value)
  },
  window: {
    togglePin: () => ipcRenderer.invoke('toggle-plugin-pin-window', profile.name),
    keepAlive: () => ipcRenderer.invoke('minimize-plugin-window', profile.name, { keepAlive: true }),
    showIndicator: () => ipcRenderer.invoke('create-plugin-indicator-window', profile.name),
    closeIndicator: () => ipcRenderer.invoke('close-plugin-indicator-window', profile.name)
  }
};

try { contextBridge.exposeInMainWorld('pluginAPI', api); }
catch (_) { window.pluginAPI = api; }

function dispatchEnter(action) {
  window.dispatchEvent(new CustomEvent('plugin-enter', { detail: action || {} }));
}

window.exports = {
  [`plugin-market-${profile.id}`]: { mode: 'none', args: { enter: dispatchEnter, search: (_action, _word, setList) => setList([]), select: () => {} } }
};

window.addEventListener('beforeunload', () => {
  if (lanServer) lanServer.close();
  if (projectProcess) projectProcess.kill();
});
