const fs = require('fs');
const path = require('path');

function normalizePluginIdentity(value) {
    return String(value || '').trim().toLowerCase();
}

function readPluginEntry(rootDir, entry) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) return null;
    const sourcePath = path.join(rootDir, entry.name);
    const configPath = path.join(sourcePath, 'plugin.json');
    if (!fs.existsSync(configPath)) return null;

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        throw new Error(`插件配置无效，无法安全迁移：${configPath} (${error.message})`);
    }

    const pluginName = String(config.pluginName || entry.name).trim();
    return {
        folderName: entry.name,
        pluginName,
        identity: normalizePluginIdentity(pluginName),
        sourcePath
    };
}

function listPluginEntries(rootDir) {
    if (!rootDir || !fs.existsSync(rootDir)) return [];
    return fs.readdirSync(rootDir, { withFileTypes: true })
        .map(entry => readPluginEntry(rootDir, entry))
        .filter(Boolean);
}

function uniqueDirectoryPath(rootDir, folderName) {
    const initialPath = path.join(rootDir, folderName);
    if (!fs.existsSync(initialPath)) return initialPath;

    let counter = 1;
    while (true) {
        const candidate = path.join(rootDir, `${folderName}_${counter}`);
        if (!fs.existsSync(candidate)) return candidate;
        counter += 1;
    }
}

function copyMissingPlugins(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    const targetIdentities = new Set(listPluginEntries(targetDir).map(plugin => plugin.identity));
    const result = { copied: [], skipped: [] };

    for (const plugin of listPluginEntries(sourceDir)) {
        // 以 pluginName 判重，避免同一插件因文件夹名称不同被远端版本重复补入。
        if (targetIdentities.has(plugin.identity)) {
            result.skipped.push(plugin.pluginName);
            continue;
        }

        const targetPath = uniqueDirectoryPath(targetDir, plugin.folderName);
        fs.cpSync(plugin.sourcePath, targetPath, {
            recursive: true,
            force: false,
            errorOnExist: true
        });
        targetIdentities.add(plugin.identity);
        result.copied.push(plugin.pluginName);
    }

    return result;
}

function initializePluginStore({ bundledDir, persistentDir, migrationDirs = [], migrationMarkerPath = '' }) {
    fs.mkdirSync(persistentDir, { recursive: true });
    const migrated = [];

    for (const migrationDir of migrationDirs) {
        if (!migrationDir || !fs.existsSync(migrationDir)) continue;
        const result = copyMissingPlugins(migrationDir, persistentDir);
        migrated.push(...result.copied);
        // 复制过程抛错时不会执行到这里，备份会保留以便修复后重试。
        fs.rmSync(migrationDir, { recursive: true, force: true });
    }

    const seeded = copyMissingPlugins(bundledDir, persistentDir);
    if (migrationMarkerPath) {
        fs.mkdirSync(path.dirname(migrationMarkerPath), { recursive: true });
        fs.writeFileSync(migrationMarkerPath, 'completed\n', 'utf8');
    }

    return {
        persistentDir,
        migrated,
        added: seeded.copied,
        preserved: seeded.skipped
    };
}

function syncBundledPluginRuntime(sourceDir, targetDir) {
    if (!sourceDir || !fs.existsSync(sourceDir)) {
        throw new Error(`内置插件运行时不存在: ${sourceDir || '(empty)'}`);
    }
    if (!targetDir) throw new Error('插件运行时目标目录为空');
    fs.mkdirSync(targetDir, { recursive: true });
    // 共享运行时属于主程序版本的一部分，随程序升级覆盖；用户插件目录仍保持本地优先。
    fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
    return targetDir;
}

module.exports = {
    copyMissingPlugins,
    initializePluginStore,
    listPluginEntries,
    normalizePluginIdentity,
    syncBundledPluginRuntime
};
