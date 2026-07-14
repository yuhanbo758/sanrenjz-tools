(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ProviderUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function normalizeBaseUrl(baseUrl) {
        let value = String(baseUrl || '').trim().replace(/\/+$/, '');
        value = value.replace(/\/chat\/completions$/i, '');
        if (!/^https?:\/\//i.test(value)) throw new Error('Base URL 必须以 http:// 或 https:// 开头');
        return value;
    }
    return { normalizeBaseUrl };
});
