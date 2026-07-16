'use strict';

const assert = require('assert');
const { searchCatalog } = require('../app/search_utils');
const { detectTextContextTypes } = require('../app/super_panel_context');
const { normalizeBaseUrl } = require('../app/software/sanrenjz-tools-ai_screen_trans/provider-utils');
const screenshotPlugin = require('../app/software/sanrenjz-tools-ai_screen_trans/plugin.json');
const fs = require('fs');
const path = require('path');

const results = searchCatalog('截图 翻译', [
    { name: '翻译插件', searchText: '截图 翻译 deepseek' }
], [
    { title: '普通命令', searchTitle: '普通命令', searchBody: '无关内容', contentType: 'command' }
]);
assert.strictEqual(results[0].name, '翻译插件');
assert.ok(results[0].matchedKeywordsCount >= 2);
assert.strictEqual(searchCatalog('a', Array.from({ length: 100 }, (_, index) => ({ name: String(index), searchText: `a${index}` })), [], 50).length, 50);
const largeCatalog = Array.from({ length: 5000 }, (_, index) => ({ name: `插件${index}`, searchText: `插件${index} 文本 翻译` }));
const startedAt = Date.now();
assert.strictEqual(searchCatalog('文本 翻译', largeCatalog, [], 50).length, 50);
const elapsed = Date.now() - startedAt;
assert.ok(elapsed < 500, `5000 项搜索耗时过长: ${elapsed}ms`);
console.log(`5000 item search: ${elapsed}ms`);

assert.ok(detectTextContextTypes('https://example.com').includes('url'));
assert.ok(detectTextContextTypes('test@example.com').includes('email'));
assert.ok(detectTextContextTypes('{"a":1}').includes('json'));
assert.ok(detectTextContextTypes('const a = 1').includes('code'));
assert.deepStrictEqual(detectTextContextTypes('', true), ['image']);

assert.strictEqual(normalizeBaseUrl('https://api.deepseek.com/'), 'https://api.deepseek.com');
assert.strictEqual(normalizeBaseUrl('https://example.com/v1/chat/completions'), 'https://example.com/v1');
assert.throws(() => normalizeBaseUrl('example.com/v1'));
const screenshotFeature = screenshotPlugin.features.find(feature => feature.code === 'ai-screen-ocr-translate');
const textFeature = screenshotPlugin.features.find(feature => feature.code === 'ai-screen-text-translate');
assert.strictEqual(screenshotFeature.startHidden, true);
assert.notStrictEqual(textFeature.startHidden, true);
assert.ok(screenshotFeature.cmds.includes('OCR识别'));

// 截图入口必须同时提供仅 OCR 和 OCR 后翻译，并暴露 OCR 文本复制按钮。
const pluginDirectory = path.join(__dirname, '..', 'app', 'software', 'sanrenjz-tools-ai_screen_trans');
const pluginHtml = fs.readFileSync(path.join(pluginDirectory, 'index.html'), 'utf8');
const pluginRenderer = fs.readFileSync(path.join(pluginDirectory, 'renderer.js'), 'utf8');
assert.ok(pluginHtml.includes('id="promptOcrBtn"'));
assert.ok(pluginHtml.includes('id="ocrTranslateBtn"'));
assert.ok(pluginRenderer.includes('复制 OCR 文本'));
assert.ok(pluginRenderer.includes('async function recognizeScreenshot()'));
assert.ok(pluginRenderer.includes('async function translateRecognizedText()'));
assert.ok(pluginRenderer.includes("StatusBar.set('OCR 识别完成，可复制文字或继续翻译')"));

console.log('logic tests passed');
