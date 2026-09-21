(() => {
  const api = window.accountManagerAPI;
  const $ = selector => document.querySelector(selector);
  const state = { databasePath: '', tables: [], tableName: '', columns: [], rows: [], total: 0, page: 1, pageSize: 50, busy: false };

  const elements = {
    dbPath: $('#dbPath'), tableList: $('#tableList'), tableTitle: $('#tableTitle'), tableMeta: $('#tableMeta'),
    tableHead: $('#tableHead'), tableBody: $('#tableBody'), empty: $('#empty'), status: $('#status'),
    searchColumn: $('#searchColumn'), searchMode: $('#searchMode'), searchText: $('#searchText'),
    searchButton: $('#searchButton'), clearSearch: $('#clearSearch'), addRow: $('#addRow'), createTable: $('#createTable'),
    prevPage: $('#prevPage'), nextPage: $('#nextPage'), pageInfo: $('#pageInfo'), rowDrawer: $('#rowDrawer'),
    rowForm: $('#rowForm'), drawerTable: $('#drawerTable'), saveRow: $('#saveRow'), tableModal: $('#tableModal'),
    newTableName: $('#newTableName'), columnEditor: $('#columnEditor'), saveTable: $('#saveTable')
  };

  function setStatus(message, error = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', error);
  }

  function setBusy(busy, message) {
    state.busy = busy;
    if (message) setStatus(message);
    document.querySelectorAll('button').forEach(button => {
      if (button.dataset.closeDrawer !== undefined || button.dataset.closeModal !== undefined) return;
      button.disabled = busy || button.dataset.baseDisabled === 'true';
    });
    updateControls();
  }

  async function execute(message, operation) {
    if (state.busy) return null;
    setBusy(true, message);
    try { return await operation(); }
    catch (error) { setStatus(error?.message || String(error), true); return null; }
    finally { setBusy(false); }
  }

  function updateControls() {
    const hasDatabase = Boolean(state.databasePath);
    const hasTable = Boolean(state.tableName);
    elements.createTable.disabled = state.busy || !hasDatabase;
    [elements.searchColumn, elements.searchMode, elements.searchText, elements.searchButton, elements.clearSearch, elements.addRow]
      .forEach(element => { element.disabled = state.busy || !hasTable; });
    const pages = state.total ? Math.ceil(state.total / state.pageSize) : 0;
    elements.prevPage.disabled = state.busy || !hasTable || state.page <= 1;
    elements.nextPage.disabled = state.busy || !hasTable || state.page >= pages;
    elements.pageInfo.textContent = `第 ${pages ? state.page : 0} / ${pages} 页`;
  }

  function renderTables() {
    elements.tableList.replaceChildren();
    state.tables.forEach(name => {
      const button = document.createElement('button');
      button.className = `table-item${name === state.tableName ? ' active' : ''}`;
      button.textContent = name;
      button.title = name;
      button.addEventListener('click', () => selectTable(name));
      elements.tableList.appendChild(button);
    });
    if (!state.tables.length) {
      const hint = document.createElement('div');
      hint.style.cssText = 'padding:12px;color:#a9c1d7;font-size:12px';
      hint.textContent = '数据库中还没有用户数据表';
      elements.tableList.appendChild(hint);
    }
  }

  function displayValue(value) {
    if (value === null || value === undefined) return '';
    if (value && value.__sqliteType === 'blob') return `[BLOB ${value.byteLength} 字节]`;
    if (value && value.__sqliteType === 'integer') return value.value;
    return String(value);
  }

  function isSensitiveColumn(columnName) {
    return /(password|passwd|pwd|secret|token|密码|口令|密钥)/i.test(String(columnName));
  }

  function renderGrid() {
    elements.tableHead.replaceChildren();
    elements.tableBody.replaceChildren();
    const visibleColumns = state.columns.filter(column => column.hidden === 0);
    if (visibleColumns.length) {
      const row = document.createElement('tr');
      visibleColumns.forEach(column => {
        const header = document.createElement('th');
        header.textContent = column.name;
        header.title = `${column.name} · ${column.type || '未声明类型'}${column.primaryKey ? ' · 主键' : ''}`;
        row.appendChild(header);
      });
      elements.tableHead.appendChild(row);
    }
    state.rows.forEach(record => {
      const row = document.createElement('tr');
      visibleColumns.forEach(column => {
        const cell = document.createElement('td');
        const value = displayValue(record[column.name]);
        const sensitive = isSensitiveColumn(column.name) && value;
        cell.textContent = sensitive ? '••••••••' : value;
        cell.title = sensitive ? '敏感字段已遮罩，双击复制真实值' : value;
        cell.classList.toggle('sensitive', Boolean(sensitive));
        cell.addEventListener('dblclick', () => { api.copy(value); setStatus(`已复制 ${column.name}`); });
        row.appendChild(cell);
      });
      elements.tableBody.appendChild(row);
    });
    elements.empty.hidden = state.rows.length > 0;
    if (!state.rows.length) {
      elements.empty.innerHTML = state.tableName
        ? '<div><strong>当前没有匹配记录</strong><span>可清除查询条件，或新增一条数据</span></div>'
        : '<div><strong>等待选择数据表</strong><span>列名将根据所选数据表自动变化</span></div>';
    }
  }

  function renderSearchColumns() {
    const previous = elements.searchColumn.value;
    elements.searchColumn.replaceChildren();
    const allColumns = document.createElement('option');
    allColumns.value = '__all__';
    allColumns.textContent = '整表（全部列）';
    elements.searchColumn.appendChild(allColumns);
    state.columns.filter(column => column.hidden === 0).forEach(column => {
      const option = document.createElement('option');
      option.value = column.name;
      option.textContent = column.name;
      elements.searchColumn.appendChild(option);
    });
    if ([...elements.searchColumn.options].some(option => option.value === previous)) elements.searchColumn.value = previous;
    updateSearchHint();
  }

  function updateSearchHint() {
    elements.searchText.placeholder = elements.searchColumn.value === '__all__'
      ? '在全部列中查找，例如密码片段'
      : `在“${elements.searchColumn.value || '当前字段'}”中查找`;
  }

  async function loadRows() {
    if (!state.databasePath || !state.tableName) return;
    const result = await execute('正在读取数据…', () => api.database.query(state.databasePath, {
      tableName: state.tableName,
      page: state.page,
      pageSize: state.pageSize,
      searchColumn: elements.searchColumn.value,
      searchMode: elements.searchMode.value,
      searchText: elements.searchText.value.trim()
    }));
    if (!result) return;
    state.columns = result.columns;
    state.rows = result.rows;
    state.total = result.total;
    state.page = result.page;
    renderSearchColumns();
    renderGrid();
    elements.tableMeta.textContent = `${state.columns.filter(column => column.hidden === 0).length} 个字段 · ${state.total} 条记录 · 双击单元格可复制`;
    setStatus(`已加载 ${state.rows.length} 条记录`);
    updateControls();
  }

  async function selectTable(name) {
    state.tableName = name;
    state.page = 1;
    elements.searchText.value = '';
    elements.tableTitle.textContent = name;
    renderTables();
    await loadRows();
    await api.storage.set('lastSession', { databasePath: state.databasePath, tableName: name });
  }

  async function applyDatabase(databasePath, preferredTable = '') {
    const result = await execute('正在读取数据库结构…', () => api.database.inspect(databasePath));
    if (!result) return;
    state.databasePath = result.databasePath;
    state.tables = result.tables;
    state.tableName = '';
    state.columns = [];
    state.rows = [];
    state.total = 0;
    elements.dbPath.textContent = result.databasePath;
    elements.dbPath.title = result.databasePath;
    renderTables();
    updateControls();
    const nextTable = state.tables.includes(preferredTable) ? preferredTable : state.tables[0];
    if (nextTable) await selectTable(nextTable);
    else {
      elements.tableTitle.textContent = '数据库已打开';
      elements.tableMeta.textContent = '请新建数据表后开始添加数据';
      renderGrid();
      setStatus('数据库中暂无用户数据表');
    }
    await api.storage.set('lastSession', { databasePath: result.databasePath, tableName: nextTable || '' });
  }

  function buildRowForm() {
    elements.rowForm.replaceChildren();
    elements.drawerTable.textContent = state.tableName;
    state.columns.filter(column => column.insertable && !column.autoGenerated).forEach(column => {
      const wrapper = document.createElement('div');
      wrapper.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = `field-${column.cid}`;
      label.textContent = `${column.name}${column.notNull && column.defaultValue === null ? ' *' : ''}`;
      const type = String(column.type || '').toUpperCase();
      const input = type.includes('JSON') || type.includes('TEXT') ? document.createElement('textarea') : document.createElement('input');
      input.id = `field-${column.cid}`;
      input.name = column.name;
      input.dataset.column = column.name;
      if (input.tagName === 'INPUT') input.type = /(REAL|FLOA|DOUB|NUMERIC|DECIMAL|INT)/.test(type) ? 'number' : 'text';
      if (input.type === 'number' && !type.includes('INT')) input.step = 'any';
      if (/DATE|TIME/.test(type)) { input.type = type.includes('TIME') ? 'datetime-local' : 'date'; }
      const hint = document.createElement('small');
      hint.textContent = `${column.type || '未声明类型'}${column.primaryKey ? ' · 主键' : ''}${column.defaultValue !== null ? ` · 默认 ${column.defaultValue}` : ''}`;
      wrapper.append(label, input, hint);
      elements.rowForm.appendChild(wrapper);
    });
  }

  function addColumnEditor(values = {}) {
    const row = document.createElement('div');
    row.className = 'column-editor';
    row.innerHTML = `<input class="column-name" placeholder="字段名"><select class="column-type"><option>TEXT</option><option>INTEGER</option><option>REAL</option><option>NUMERIC</option><option>BLOB</option></select><label><input class="column-required" type="checkbox"> 必填</label><label><input class="column-pk" type="checkbox"> 自动主键</label><button class="danger-link" title="删除字段">×</button>`;
    row.querySelector('.column-name').value = values.name || '';
    row.querySelector('.column-type').value = values.type || 'TEXT';
    row.querySelector('.column-required').checked = Boolean(values.notNull);
    row.querySelector('.column-pk').checked = Boolean(values.primaryKey);
    row.querySelector('.column-pk').addEventListener('change', event => {
      if (event.target.checked) {
        row.querySelector('.column-type').value = 'INTEGER';
        elements.columnEditor.querySelectorAll('.column-pk').forEach(input => { if (input !== event.target) input.checked = false; });
      }
    });
    row.querySelector('.danger-link').addEventListener('click', () => row.remove());
    elements.columnEditor.appendChild(row);
  }

  $('#openDb').addEventListener('click', async () => {
    const selected = api.dialog.openDatabase();
    const databasePath = Array.isArray(selected) ? selected[0] : selected;
    if (databasePath) await applyDatabase(databasePath);
  });
  $('#newDb').addEventListener('click', async () => {
    const databasePath = api.dialog.createDatabase();
    if (!databasePath) return;
    const created = await execute('正在创建数据库…', () => api.database.create(databasePath));
    if (created) await applyDatabase(created.databasePath);
  });
  $('#refreshTables').addEventListener('click', () => state.databasePath && applyDatabase(state.databasePath, state.tableName));
  elements.searchButton.addEventListener('click', () => { state.page = 1; loadRows(); });
  elements.searchColumn.addEventListener('change', updateSearchHint);
  elements.searchText.addEventListener('keydown', event => { if (event.key === 'Enter') { state.page = 1; loadRows(); } });
  elements.clearSearch.addEventListener('click', () => { elements.searchText.value = ''; state.page = 1; loadRows(); });
  elements.prevPage.addEventListener('click', () => { state.page -= 1; loadRows(); });
  elements.nextPage.addEventListener('click', () => { state.page += 1; loadRows(); });
  elements.addRow.addEventListener('click', () => { buildRowForm(); elements.rowDrawer.classList.add('open'); });
  document.querySelectorAll('[data-close-drawer]').forEach(button => button.addEventListener('click', () => elements.rowDrawer.classList.remove('open')));
  elements.rowDrawer.addEventListener('click', event => { if (event.target === elements.rowDrawer) elements.rowDrawer.classList.remove('open'); });
  elements.saveRow.addEventListener('click', async () => {
    const values = Object.fromEntries([...elements.rowForm.querySelectorAll('[data-column]')].map(input => [input.dataset.column, input.value]));
    const result = await execute('正在写入数据…', () => api.database.insert(state.databasePath, { tableName: state.tableName, values }));
    if (!result) return;
    elements.rowDrawer.classList.remove('open');
    state.page = 1;
    await loadRows();
    setStatus(`记录写入成功，rowid ${result.lastInsertRowid}`);
  });
  elements.createTable.addEventListener('click', () => {
    elements.newTableName.value = '';
    elements.columnEditor.replaceChildren();
    addColumnEditor({ name: 'id', type: 'INTEGER', primaryKey: true });
    addColumnEditor({ name: 'name', type: 'TEXT', notNull: true });
    elements.tableModal.classList.add('open');
  });
  $('#addColumn').addEventListener('click', () => addColumnEditor());
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => elements.tableModal.classList.remove('open')));
  elements.tableModal.addEventListener('click', event => { if (event.target === elements.tableModal) elements.tableModal.classList.remove('open'); });
  elements.saveTable.addEventListener('click', async () => {
    const columns = [...elements.columnEditor.querySelectorAll('.column-editor')].map(row => ({
      name: row.querySelector('.column-name').value,
      type: row.querySelector('.column-type').value,
      notNull: row.querySelector('.column-required').checked,
      primaryKey: row.querySelector('.column-pk').checked
    }));
    const tableName = elements.newTableName.value.trim();
    const result = await execute('正在创建数据表…', () => api.database.createTable(state.databasePath, { tableName, columns }));
    if (!result) return;
    elements.tableModal.classList.remove('open');
    await applyDatabase(state.databasePath, result.tableName);
    setStatus(`数据表 ${result.tableName} 创建成功`);
  });

  async function restoreSession() {
    const session = await api.storage.get('lastSession');
    if (session?.databasePath) await applyDatabase(session.databasePath, session.tableName || '');
    else updateControls();
  }
  restoreSession().catch(error => setStatus(error.message, true));
})();
