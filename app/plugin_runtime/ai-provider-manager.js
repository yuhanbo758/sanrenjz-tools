(function (global) {
  const STYLE_ID = 'ai-provider-manager-style';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ai-model-picker{display:flex;align-items:center;gap:7px;white-space:nowrap}
      .ai-model-picker select{width:min(230px,25vw);min-width:150px;border:1px solid var(--bd,#dbe2ea);border-radius:8px;background:var(--sf,#fff);color:var(--ink,#172033);padding:7px 10px;font:12px var(--sans,-apple-system,"Segoe UI",sans-serif);outline:none;cursor:pointer}
      .ai-model-picker select:focus{border-color:var(--al,#8b5cf6)}
      .ai-provider-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-right:28px}
      .ai-provider-head h2{margin:0!important}
      .ai-provider-add,.ai-provider-save,.ai-provider-secondary{border:1px solid var(--bd,#dbe2ea);border-radius:8px;background:var(--sf,#fff);color:var(--ink,#172033);padding:8px 13px;font:12px var(--sans,-apple-system,"Segoe UI",sans-serif);cursor:pointer}
      .ai-provider-add,.ai-provider-save{background:var(--a,#4f46e5);border-color:var(--a,#4f46e5);color:#fff;font-weight:600}
      .ai-provider-list{display:flex;flex-direction:column;gap:9px;margin-bottom:18px}
      .ai-provider-card{border:1px solid var(--bd,#dbe2ea);border-radius:10px;padding:11px 12px;background:var(--s2,#f7f8fa)}
      .ai-provider-card-top{display:flex;align-items:flex-start;gap:9px}
      .ai-provider-card-main{min-width:0;flex:1}
      .ai-provider-card-name{font-weight:700;color:var(--ink,#172033)}
      .ai-provider-card-url{font:10px/1.5 var(--mono,Consolas,monospace);color:var(--mt,#667085);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ai-provider-status{font-size:10px;color:#16a34a;white-space:nowrap}
      .ai-provider-status.missing{color:#d97706}
      .ai-provider-models{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
      .ai-provider-model{border-radius:999px;padding:3px 8px;background:color-mix(in srgb,var(--a,#4f46e5) 10%,transparent);color:var(--a,#4f46e5);font:10px var(--mono,Consolas,monospace)}
      .ai-provider-actions{display:flex;gap:5px;margin-top:9px}
      .ai-provider-actions button{border:0;background:transparent;color:var(--a,#4f46e5);font-size:11px;cursor:pointer;padding:2px 0;margin-right:8px}
      .ai-provider-actions button.danger{color:#dc2626}
      .ai-provider-form{border-top:1px solid var(--bd,#dbe2ea);padding-top:16px}
      .ai-provider-form h3{margin:0 0 12px;font-size:14px}
      .ai-provider-field{margin-bottom:12px}
      .ai-provider-field label{display:block;margin-bottom:5px;font-size:11px;font-weight:600;color:var(--mt,#667085)}
      .ai-provider-field input,.ai-provider-field textarea{width:100%;border:1px solid var(--bd,#dbe2ea);border-radius:8px;background:var(--s2,#f7f8fa);color:var(--ink,#172033);padding:8px 10px;font:12px var(--sans,-apple-system,"Segoe UI",sans-serif);outline:none;resize:vertical}
      .ai-provider-field textarea{min-height:86px;font-family:var(--mono,Consolas,monospace);line-height:1.6}
      .ai-provider-field input:focus,.ai-provider-field textarea:focus{border-color:var(--al,#8b5cf6)}
      .ai-provider-help{font-size:10px;color:var(--mt,#667085);margin-top:4px;line-height:1.5}
      .ai-provider-form-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .ai-provider-empty{padding:16px;text-align:center;color:var(--mt,#667085);font-size:12px;border:1px dashed var(--bd,#dbe2ea);border-radius:9px}
      @media(max-width:1000px){.ai-model-picker label{display:none}.ai-model-picker select{width:170px;min-width:120px}}
    `;
    document.head.appendChild(style);
  }

  function providerId() {
    return `provider-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function parseModels(text) {
    return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [id, label, capabilityText] = line.split('|').map(value => value.trim());
      const capabilities = (capabilityText || 'text').split(',').map(value => value.trim()).filter(value => value === 'text' || value === 'vision');
      return { id, label: label || id, capabilities: capabilities.length ? [...new Set(capabilities)] : ['text'] };
    }).filter(model => model.id);
  }

  function serializeModels(models) {
    return (models || []).map(model => `${model.id} | ${model.label || model.id} | ${(model.capabilities || ['text']).join(',')}`).join('\n');
  }

  function create(api, options = {}) {
    injectStyles();
    const capability = options.capability === 'vision' ? 'vision' : 'text';
    const drawer = document.querySelector(options.drawer || '#drawer');
    const overlay = document.querySelector(options.overlay || '#overlay');
    const before = document.querySelector(options.before || '.gear');
    let config = null;
    let selection = null;
    let editingId = '';
    let modelSelect = null;

    const notify = message => {
      if (typeof options.notify === 'function') options.notify(message);
      else if (typeof global.toast === 'function') global.toast(message);
    };

    function closeDrawer() {
      drawer?.classList.remove('open');
      overlay?.classList.remove('show');
    }

    function renderShell() {
      if (!drawer) return;
      drawer.innerHTML = `
        <button class="close" type="button" data-ai-close>×</button>
        <div class="ai-provider-head"><h2>供应商目录</h2><button class="ai-provider-add" type="button" data-ai-add>新增供应商</button></div>
        <div class="ai-provider-list" data-ai-list></div>
        <form class="ai-provider-form" data-ai-form>
          <h3 data-ai-form-title>新增供应商</h3>
          <div class="ai-provider-field"><label>供应商名称</label><input data-ai-name placeholder="例如 GLM、DeepSeek"></div>
          <div class="ai-provider-field"><label>Base URL</label><input data-ai-url placeholder="https://api.example.com/v1"></div>
          <div class="ai-provider-field"><label>模型列表</label><textarea data-ai-models placeholder="glm-4-flash | GLM-4 Flash | text\ndeepseek-chat | DeepSeek Chat | text"></textarea><div class="ai-provider-help">每行格式：模型 ID | 显示名称 | 能力。能力支持 text 或 text,vision。</div></div>
          <div class="ai-provider-field"><label>API Key</label><input data-ai-key type="password" placeholder="留空则保留已有密钥"></div>
          <div class="ai-provider-form-actions"><button class="ai-provider-save" type="submit">保存供应商</button><button class="ai-provider-secondary" type="button" data-ai-cancel>取消编辑</button><button class="ai-provider-secondary" type="button" data-ai-remove-key style="display:none">清除密钥</button></div>
        </form>`;
      drawer.querySelector('[data-ai-close]').onclick = closeDrawer;
      drawer.querySelector('[data-ai-add]').onclick = () => editProvider('');
      drawer.querySelector('[data-ai-cancel]').onclick = () => editProvider('');
      drawer.querySelector('[data-ai-remove-key]').onclick = removeKey;
      drawer.querySelector('[data-ai-form]').onsubmit = saveProvider;
    }

    function mountSelector() {
      if (!before?.parentNode) return;
      const wrap = document.createElement('div');
      wrap.className = 'ai-model-picker';
      const label = document.createElement('label');
      label.textContent = capability === 'vision' ? '视觉模型' : '当前模型';
      modelSelect = document.createElement('select');
      modelSelect.setAttribute('aria-label', label.textContent);
      modelSelect.onchange = selectModel;
      wrap.append(label, modelSelect);
      before.parentNode.insertBefore(wrap, before);
    }

    async function loadConfig() {
      config = await api.getConfig();
      config.providers = Array.isArray(config.providers) ? config.providers.filter(provider => provider && provider.id) : [];
      config.selections = config.selections || {};
      await renderProviders();
      await renderModels();
    }

    async function renderProviders() {
      const list = drawer?.querySelector('[data-ai-list]');
      if (!list) return;
      if (!config.providers.length) {
        list.innerHTML = '<div class="ai-provider-empty">还没有供应商，请先新增。</div>';
        return;
      }
      const secretStates = await Promise.all(config.providers.map(provider => api.hasProviderSecret(provider.id)));
      list.innerHTML = config.providers.map((provider, index) => `
        <div class="ai-provider-card" data-provider-id="${provider.id}">
          <div class="ai-provider-card-top"><div class="ai-provider-card-main"><div class="ai-provider-card-name"></div><div class="ai-provider-card-url"></div></div><span class="ai-provider-status ${secretStates[index] ? '' : 'missing'}">${secretStates[index] ? '密钥已保存' : '未保存密钥'}</span></div>
          <div class="ai-provider-models"></div>
          <div class="ai-provider-actions"><button type="button" data-edit>编辑</button><button type="button" class="danger" data-delete>删除</button></div>
        </div>`).join('');
      config.providers.forEach(provider => {
        const card = list.querySelector(`[data-provider-id="${CSS.escape(provider.id)}"]`);
        card.querySelector('.ai-provider-card-name').textContent = provider.name || provider.id;
        card.querySelector('.ai-provider-card-url').textContent = provider.baseUrl || '';
        const models = card.querySelector('.ai-provider-models');
        (provider.models || []).forEach(model => {
          const chip = document.createElement('span');
          chip.className = 'ai-provider-model';
          chip.textContent = model.label || model.id;
          models.appendChild(chip);
        });
        card.querySelector('[data-edit]').onclick = () => editProvider(provider.id);
        card.querySelector('[data-delete]').onclick = () => deleteProvider(provider.id);
      });
    }

    async function renderModels() {
      if (!modelSelect) return;
      modelSelect.innerHTML = '';
      const available = [];
      config.providers.forEach(provider => {
        const models = (provider.models || []).filter(model => (model.capabilities || []).includes(capability));
        if (!models.length) return;
        const group = document.createElement('optgroup');
        group.label = provider.name || provider.id;
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = JSON.stringify({ providerId: provider.id, modelId: model.id });
          option.textContent = model.label || model.id;
          group.appendChild(option);
          available.push({ providerId: provider.id, modelId: model.id });
        });
        modelSelect.appendChild(group);
      });
      const stored = config.selections[capability];
      selection = available.find(item => item.providerId === stored?.providerId && item.modelId === stored?.modelId) || available[0] || null;
      modelSelect.disabled = !selection;
      if (!selection) {
        const option = document.createElement('option');
        option.textContent = capability === 'vision' ? '无可用视觉模型' : '无可用文本模型';
        modelSelect.appendChild(option);
        return;
      }
      modelSelect.value = JSON.stringify(selection);
      if (!stored || stored.providerId !== selection.providerId || stored.modelId !== selection.modelId) {
        config.selections[capability] = { ...selection };
        await api.saveConfig(config);
      }
    }

    async function selectModel() {
      if (!modelSelect.value) return;
      selection = JSON.parse(modelSelect.value);
      config.selections[capability] = { ...selection };
      await api.saveConfig(config);
      notify('已切换模型');
    }

    function editProvider(id) {
      editingId = id;
      const provider = config?.providers.find(item => item.id === id);
      drawer.querySelector('[data-ai-form-title]').textContent = provider ? '编辑供应商' : '新增供应商';
      drawer.querySelector('[data-ai-name]').value = provider?.name || '';
      drawer.querySelector('[data-ai-url]').value = provider?.baseUrl || '';
      drawer.querySelector('[data-ai-models]').value = serializeModels(provider?.models || []);
      drawer.querySelector('[data-ai-key]').value = '';
      drawer.querySelector('[data-ai-remove-key]').style.display = provider ? '' : 'none';
      drawer.querySelector('[data-ai-name]').focus();
    }

    async function saveProvider(event) {
      event.preventDefault();
      const name = drawer.querySelector('[data-ai-name]').value.trim();
      const baseUrl = drawer.querySelector('[data-ai-url]').value.trim().replace(/\/+$/, '');
      const models = parseModels(drawer.querySelector('[data-ai-models]').value);
      const key = drawer.querySelector('[data-ai-key]').value;
      if (!name || !baseUrl || !models.length) {
        notify('请填写供应商名称、Base URL 和至少一个模型');
        return;
      }
      const id = editingId || providerId();
      const next = { id, name, baseUrl, models };
      const index = config.providers.findIndex(provider => provider.id === id);
      if (index >= 0) config.providers[index] = next;
      else config.providers.push(next);
      await api.saveConfig(config);
      if (key) await api.saveProviderSecret(id, key);
      editingId = id;
      drawer.querySelector('[data-ai-key]').value = '';
      await loadConfig();
      editProvider(id);
      notify('供应商已保存');
    }

    async function deleteProvider(id) {
      if (config.providers.length <= 1) {
        notify('至少保留一个供应商');
        return;
      }
      const provider = config.providers.find(item => item.id === id);
      if (!global.confirm(`确认删除供应商“${provider?.name || id}”？`)) return;
      config.providers = config.providers.filter(item => item.id !== id);
      await api.removeProviderSecret(id);
      await api.saveConfig(config);
      editingId = '';
      await loadConfig();
      editProvider('');
      notify('供应商已删除');
    }

    async function removeKey() {
      if (!editingId) return;
      await api.removeProviderSecret(editingId);
      await renderProviders();
      notify('密钥已清除');
    }

    renderShell();
    mountSelector();
    const ready = loadConfig().then(() => editProvider(''));

    return {
      ready,
      async getSelection() {
        await ready;
        if (!selection) throw new Error(capability === 'vision' ? '请先添加支持视觉能力的供应商模型' : '请先添加文本供应商模型');
        return { ...selection };
      },
      refresh: loadConfig
    };
  }

  global.AIProviderManager = { create, parseModels };
})(window);
