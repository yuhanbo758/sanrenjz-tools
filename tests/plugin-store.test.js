const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initializePluginStore } = require('../app/plugin_store');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanrenjz-plugin-store-test-'));

function writePlugin(baseDir, folderName, pluginName, content) {
    const pluginDir = path.join(baseDir, folderName);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ pluginName }), 'utf8');
    fs.writeFileSync(path.join(pluginDir, 'value.txt'), content, 'utf8');
}

try {
    const bundledDir = path.join(testRoot, 'bundled');
    const migrationDir = path.join(testRoot, 'migration');
    const persistentDir = path.join(testRoot, 'persistent');

    writePlugin(bundledDir, 'remote-same-folder', '同名插件', 'remote-version');
    writePlugin(bundledDir, 'remote-only-folder', '远端新增插件', 'new-plugin');
    writePlugin(migrationDir, 'local-same-folder', '同名插件', 'local-version');
    writePlugin(migrationDir, 'local-only-folder', '本地独有插件', 'custom-plugin');
    writePlugin(migrationDir, '.downloads', '下载缓存', 'download-cache');

    const result = initializePluginStore({
        bundledDir,
        persistentDir,
        migrationDirs: [migrationDir]
    });

    assert.strictEqual(
        fs.readFileSync(path.join(persistentDir, 'local-same-folder', 'value.txt'), 'utf8'),
        'local-version',
        '同名插件必须保留本地版本'
    );
    assert.strictEqual(
        fs.existsSync(path.join(persistentDir, 'remote-same-folder')),
        false,
        '同名插件即使文件夹名称不同也不能重复补入'
    );
    assert.strictEqual(
        fs.readFileSync(path.join(persistentDir, 'local-only-folder', 'value.txt'), 'utf8'),
        'custom-plugin',
        '本地独有插件必须完成迁移'
    );
    assert.strictEqual(
        fs.readFileSync(path.join(persistentDir, 'remote-only-folder', 'value.txt'), 'utf8'),
        'new-plugin',
        '本地缺少的远端插件必须自动补入'
    );
    assert.strictEqual(fs.existsSync(path.join(persistentDir, '.downloads')), false, '不能迁移下载缓存');
    assert.strictEqual(fs.existsSync(migrationDir), false, '成功迁移后应清理临时备份');
    assert.deepStrictEqual(result.migrated.sort(), ['同名插件', '本地独有插件'].sort());
    assert.deepStrictEqual(result.added, ['远端新增插件']);
    assert.deepStrictEqual(result.preserved, ['同名插件']);

    const secondRun = initializePluginStore({ bundledDir, persistentDir });
    assert.deepStrictEqual(secondRun.added, [], '重复启动不得覆盖或重复复制插件');
    assert.deepStrictEqual(secondRun.preserved.sort(), ['同名插件', '远端新增插件'].sort());

    console.log('plugin store test passed');
} finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
}
