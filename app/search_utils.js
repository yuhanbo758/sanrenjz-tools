'use strict';

/**
 * 对已经预归一化的搜索目录执行纯内存评分，便于渲染层和 Node 测试复用。
 */
function searchCatalog(query, plugins, contents, limit = 50) {
    const keywords = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return [];
    const results = [];
    const scoreText = (text, exactWeight, includeWeight) => {
        let score = 0;
        const matched = new Set();
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                score += text === keyword ? exactWeight : includeWeight;
                matched.add(keyword);
            }
        }
        if (matched.size > 1) score += (matched.size - 1) * 50;
        if (matched.size === keywords.length && keywords.length > 1) score += 100;
        return { score, matched: matched.size };
    };

    for (const plugin of plugins || []) {
        const match = scoreText(plugin.searchText || '', 100, 50);
        if (match.score > 0) results.push({ ...plugin, type: 'plugin', score: match.score, matchedKeywordsCount: match.matched, totalKeywords: keywords.length });
    }
    for (const content of contents || []) {
        const titleMatch = scoreText(content.searchTitle || '', 100, 80);
        const bodyMatch = scoreText(content.searchBody || '', 30, 30);
        const matched = Math.max(titleMatch.matched, bodyMatch.matched);
        const score = titleMatch.score + bodyMatch.score;
        if (score > 0) results.push({ ...content, type: 'content', score, matchedKeywordsCount: matched, totalKeywords: keywords.length });
    }
    const weight = item => item.type === 'plugin' ? 2000 : (item.contentType === 'command' ? 1000 : 0);
    return results.sort((a, b) => (b.score + weight(b)) - (a.score + weight(a)) || b.matchedKeywordsCount - a.matchedKeywordsCount).slice(0, limit);
}

module.exports = { searchCatalog };
