const { ipcRenderer } = require('electron');
const crypto = require('crypto');

// 插件名称，用于存储
const PLUGIN_NAME = 'password-manager';

/**
 * 应用层存储管理类
 */
class AppStorage {
    constructor() {
        this.pluginName = PLUGIN_NAME;
    }

    // 设置数据
    set(key, value) {
        try {
            return ipcRenderer.sendSync('plugin-storage-set', this.pluginName, key, value);
        } catch (error) {
            console.error('存储数据失败:', error);
            return false;
        }
    }

    // 获取数据
    get(key) {
        try {
            return ipcRenderer.sendSync('plugin-storage-get', this.pluginName, key);
        } catch (error) {
            console.error('读取数据失败:', error);
            return null;
        }
    }

    // 删除数据
    remove(key) {
        try {
            return ipcRenderer.sendSync('plugin-storage-remove', this.pluginName, key);
        } catch (error) {
            console.error('删除数据失败:', error);
            return false;
        }
    }

    // 获取分类数据
    getCategoryData(category) {
        const data = this.get(`category_${category}`);
        return data ? JSON.parse(data) : [];
    }

    // 设置分类数据
    setCategoryData(category, data) {
        return this.set(`category_${category}`, JSON.stringify(data));
    }

    // 设置开屏密码
    setLockPassword(hashedPassword) {
        return this.set('lockPassword', hashedPassword);
    }

    // 获取开屏密码
    getLockPassword() {
        return this.get('lockPassword');
    }

    // 删除开屏密码
    removeLockPassword() {
        return this.remove('lockPassword');
    }

    // 获取自定义分类列表
    getCustomCategories() {
        const data = this.get('customCategories');
        return data ? JSON.parse(data) : [];
    }

    // 设置自定义分类列表
    setCustomCategories(categories) {
        return this.set('customCategories', JSON.stringify(categories));
    }

    // 清空所有数据
    clearAllData() {
        try {
            // 删除开屏密码
            this.removeLockPassword();
            
            // 获取所有分类（包括自定义分类）
            const allCategories = [...defaultCategories, ...this.getCustomCategories()];
            
            // 清空所有分类的数据
            allCategories.forEach(category => {
                this.remove(`category_${category}`);
            });
            
            // 清空自定义分类
            this.remove('customCategories');
            
            // 清空默认分类设置
            this.remove('defaultCategories');
            
            return true;
        } catch (error) {
            console.error('清空数据失败:', error);
            return false;
        }
    }
}

// 全局存储实例
const appStorage = new AppStorage();

// 应用状态
let currentCategory = '重要';
let currentPassword = null;
let passwords = [];
let categories = [];
let searchMode = false;
let isLocked = true;

// 自动锁定相关变量
let autoLockTimer = null;
let autoLockDelay = 3 * 60 * 1000; // 3分钟 = 180秒
let lastActivityTime = Date.now();
let warningTimer = null;
let countdownTimer = null;

// 默认分类
const defaultCategories = [
    '重要', '编程', '服务器', '公司', '金融', 
    '邮箱', 'AI', 'API', '社交', '购物'
];

/**
 * 数据库操作类
 */
class PasswordDatabase {
    constructor() {
        this.initDatabase();
    }

    // 初始化数据库
    initDatabase() {
        try {
            // 获取已保存的默认分类列表
            const savedDefaultCategories = appStorage.get('defaultCategories');
            if (savedDefaultCategories) {
                // 如果已保存，从存储中加载
                const parsedCategories = JSON.parse(savedDefaultCategories);
                // 更新全局默认分类列表
                defaultCategories.length = 0;
                defaultCategories.push(...parsedCategories);
            } else {
                // 首次使用，保存默认分类列表
                appStorage.set('defaultCategories', JSON.stringify(defaultCategories));
            }
            
            // 确保所有分类的数据存储存在
            const allCategories = [...defaultCategories, ...appStorage.getCustomCategories()];
            allCategories.forEach(category => {
                const existingData = appStorage.getCategoryData(category);
                if (!existingData || existingData.length === 0) {
                    appStorage.setCategoryData(category, []);
                }
            });
            
            console.log('数据库初始化完成');
        } catch (error) {
            console.error('数据库初始化失败:', error);
        }
    }

    // 加密密码
    encryptPassword(password) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.createHash('sha256').update(PLUGIN_NAME + '_encryption_key').digest();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher('aes256', key);
            
            let encrypted = cipher.update(password, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            return `${iv.toString('hex')}:${encrypted}`;
        } catch (error) {
            console.error('密码加密失败:', error);
            return password;
        }
    }

    // 解密密码
    decryptPassword(encryptedPassword) {
        try {
            if (!encryptedPassword.includes(':')) {
                return encryptedPassword;
            }
            
            const algorithm = 'aes-256-cbc';
            const key = crypto.createHash('sha256').update(PLUGIN_NAME + '_encryption_key').digest();
            const [ivHex, encrypted] = encryptedPassword.split(':');
            const decipher = crypto.createDecipher('aes256', key);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('密码解密失败:', error);
            return encryptedPassword;
        }
    }

    // 添加密码
    addPassword(password) {
        try {
            const existingData = appStorage.getCategoryData(password.category) || [];
            password.id = Date.now().toString();
            password.createdAt = new Date().toISOString();
            password.updatedAt = new Date().toISOString();
            
            // 加密密码
            password.password = this.encryptPassword(password.password);
            
            existingData.push(password);
            appStorage.setCategoryData(password.category, existingData);
            return password;
        } catch (error) {
            console.error('添加密码失败:', error);
            throw error;
        }
    }

    // 更新密码
    updatePassword(passwordId, updatedPassword) {
        try {
            const existingData = appStorage.getCategoryData(updatedPassword.category) || [];
            const index = existingData.findIndex(p => p.id === passwordId);
            
            if (index !== -1) {
                updatedPassword.id = passwordId;
                updatedPassword.updatedAt = new Date().toISOString();
                
                // 如果密码已改变，重新加密
                if (updatedPassword.password !== existingData[index].password) {
                    updatedPassword.password = this.encryptPassword(updatedPassword.password);
                }
                
                existingData[index] = { ...existingData[index], ...updatedPassword };
                appStorage.setCategoryData(updatedPassword.category, existingData);
                return existingData[index];
            }
            throw new Error('密码项不存在');
        } catch (error) {
            console.error('更新密码失败:', error);
            throw error;
        }
    }

    // 删除密码
    deletePassword(passwordId, category) {
        try {
            const existingData = appStorage.getCategoryData(category) || [];
            const filteredData = existingData.filter(p => p.id !== passwordId);
            appStorage.setCategoryData(category, filteredData);
            return true;
        } catch (error) {
            console.error('删除密码失败:', error);
            throw error;
        }
    }

    // 获取分类密码列表
    getPasswordsByCategory(category) {
        try {
            const data = appStorage.getCategoryData(category) || [];
            // 解密密码
            return data.map(password => ({
                ...password,
                password: this.decryptPassword(password.password)
            }));
        } catch (error) {
            console.error('获取密码列表失败:', error);
            return [];
        }
    }

    // 获取所有密码（用于搜索）
    getAllPasswords() {
        const allPasswords = [];
        const allCategories = [...defaultCategories, ...appStorage.getCustomCategories()];
        allCategories.forEach(category => {
            const categoryPasswords = this.getPasswordsByCategory(category);
            allPasswords.push(...categoryPasswords);
        });
        return allPasswords;
    }
}

// 全局数据库实例
const db = new PasswordDatabase();

/**
 * 初始化应用
 */
function initApp() {
    // 检查是否设置了开屏密码
    checkLockPassword();
    
    // 初始化事件监听
    initEventListeners();
    initPasswordGenerator();
    console.log('密码管理器初始化完成');
}

/**
 * 检查开屏密码
 */
function checkLockPassword() {
    const savedPassword = appStorage.getLockPassword();
    
    if (savedPassword) {
        // 已设置密码，显示解锁界面
        isLocked = true;
        showLockScreen();
    } else {
        // 未设置密码，显示设置密码界面
        isLocked = true;
        showSetupScreen();
    }
}

/**
 * 显示锁屏界面
 */
function showLockScreen() {
    document.getElementById('lockScreen').style.display = 'flex';
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'none';
    
    // 停止自动锁定功能
    removeActivityListeners();
    stopAutoLockTimer();
    
    // 清空输入框
    document.getElementById('unlockPassword').value = '';
    document.getElementById('unlockPassword').focus();
}

/**
 * 显示设置密码界面
 */
function showSetupScreen() {
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('setupScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    
    // 停止自动锁定功能
    removeActivityListeners();
    stopAutoLockTimer();
    
    // 清空输入框
    document.getElementById('setupPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('setupPassword').focus();
}

/**
 * 显示主应用界面
 */
function showMainApp() {
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    
    // 加载数据
    loadData();
    
    // 确保当前分类是有效的
    if (!categories.includes(currentCategory) && categories.length > 0) {
        currentCategory = categories[0];
        document.getElementById('currentCategory').textContent = currentCategory;
    }
    
    // 启动自动锁定功能
    initActivityListeners();
    startAutoLockTimer();
}

/**
 * 解锁应用
 */
function unlockApp() {
    const inputPassword = document.getElementById('unlockPassword').value;
    const savedPassword = appStorage.getLockPassword();
    
    if (!inputPassword) {
        showError('unlockError', '请输入密码');
        return;
    }
    
    const hashedInput = crypto.createHash('sha256').update(inputPassword).digest('hex');
    
    if (hashedInput === savedPassword) {
        isLocked = false;
        hideError('unlockError');
        showMainApp();
    } else {
        showError('unlockError', '密码错误，请重试');
        document.getElementById('unlockPassword').value = '';
        document.getElementById('unlockPassword').focus();
    }
}

/**
 * 设置开屏密码
 */
function setupLockPassword() {
    const password = document.getElementById('setupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!password || !confirmPassword) {
        showError('setupError', '请填写完整的密码信息');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('setupError', '两次输入的密码不一致');
        return;
    }
    
    if (password.length < 4) {
        showError('setupError', '密码长度至少4位');
        return;
    }
    
    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        appStorage.setLockPassword(hashedPassword);
        
        hideError('setupError');
        isLocked = false;
        showMainApp();
        showNotification('密码设置成功');
    } catch (error) {
        showError('setupError', '密码设置失败，请重试');
    }
}

/**
 * 锁定应用
 */
function lockApp() {
    isLocked = true;
    clearPasswordDetail();
    stopAutoLockTimer();
    showLockScreen();
}

/**
 * 开始自动锁定计时器
 */
function startAutoLockTimer() {
    // 清除现有计时器
    stopAutoLockTimer();
    
    lastActivityTime = Date.now();
    
    // 设置警告计时器（2分30秒后警告，即锁定前30秒）
    warningTimer = setTimeout(() => {
        if (!isLocked) {
            showAutoLockWarning();
        }
    }, autoLockDelay - 30000); // 提前30秒警告
    
    // 设置自动锁定计时器
    autoLockTimer = setTimeout(() => {
        if (!isLocked) {
            console.log('自动锁定：3分钟无活动');
            lockApp();
            showNotification('应用已自动锁定（3分钟无活动）', 'info');
        }
    }, autoLockDelay);
}

/**
 * 停止自动锁定计时器
 */
function stopAutoLockTimer() {
    if (autoLockTimer) {
        clearTimeout(autoLockTimer);
        autoLockTimer = null;
    }
    if (warningTimer) {
        clearTimeout(warningTimer);
        warningTimer = null;
    }
    stopCountdownTimer();
}

/**
 * 显示自动锁定警告
 */
function showAutoLockWarning() {
    if (isLocked) return;
    
    let countdown = 30;
    showNotification(`应用将在 ${countdown} 秒后自动锁定`, 'warning');
    
    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0 && !isLocked) {
            showNotification(`应用将在 ${countdown} 秒后自动锁定`, 'warning');
        } else {
            stopCountdownTimer();
        }
    }, 1000);
}

/**
 * 停止倒计时计时器
 */
function stopCountdownTimer() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}

/**
 * 重置自动锁定计时器
 */
function resetAutoLockTimer() {
    if (!isLocked) {
        lastActivityTime = Date.now();
        stopCountdownTimer(); // 停止倒计时
        startAutoLockTimer();
    }
}

/**
 * 监听用户活动
 */
function initActivityListeners() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
        document.addEventListener(event, resetAutoLockTimer, true);
    });
}

/**
 * 移除用户活动监听
 */
function removeActivityListeners() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
        document.removeEventListener(event, resetAutoLockTimer, true);
    });
}

/**
 * 重置开屏密码
 */
function resetLockPassword() {
    if (confirm('⚠️ 确定要重置开屏密码吗？\n\n警告：这将删除所有保存的密码数据，且无法恢复！\n\n请确认您已经备份了重要的密码信息。')) {
        const success = appStorage.clearAllData();
        if (success) {
            showSetupScreen();
            showNotification('密码已重置，所有数据已清空，请设置新密码');
        } else {
            showNotification('重置失败，请重试', 'error');
        }
    }
}

/**
 * 加载数据
 */
function loadData() {
    loadCategories();
    loadPasswords(currentCategory);
    updateCategorySelect();
}

/**
 * 加载分类列表
 */
function loadCategories() {
    // 重新获取最新的默认分类列表
    const savedDefaultCategories = appStorage.get('defaultCategories');
    if (savedDefaultCategories) {
        const parsedCategories = JSON.parse(savedDefaultCategories);
        defaultCategories.length = 0;
        defaultCategories.push(...parsedCategories);
    }
    
    const customCategories = appStorage.getCustomCategories();
    categories = [...defaultCategories, ...customCategories];
    renderCategories();
}

/**
 * 添加新分类
 */
function addCategory() {
    // 显示添加分类的模态框
    const modal = document.getElementById('addCategoryModal');
    const input = document.getElementById('newCategoryName');
    if (modal && input) {
        input.value = '';
        hideError('categoryNameError');
        modal.classList.add('show');
        setTimeout(() => input.focus(), 100);
    }
}

/**
 * 确认添加分类
 */
function confirmAddCategory() {
    const input = document.getElementById('newCategoryName');
    if (!input) return;
    
    const categoryName = input.value;
    if (!categoryName) {
        showError('categoryNameError', '分类名称不能为空');
        return;
    }
    
    const trimmedName = categoryName.trim();
    if (!trimmedName) {
        showError('categoryNameError', '分类名称不能为空');
        return;
    }
    
    // 检查是否已存在
    if (categories.includes(trimmedName)) {
        showError('categoryNameError', '分类已存在');
        return;
    }
    
    // 检查长度限制
    if (trimmedName.length > 10) {
        showError('categoryNameError', '分类名称不能超过10个字符');
        return;
    }
    
    try {
        const customCategories = appStorage.getCustomCategories();
        customCategories.push(trimmedName);
        appStorage.setCustomCategories(customCategories);
        
        // 重新加载分类
        loadCategories();
        updateCategorySelect();
        
        // 如果分类管理界面是打开的，刷新它
        const categoryModal = document.getElementById('categoryModal');
        if (categoryModal && categoryModal.classList.contains('show')) {
            renderCategoryManager();
        }
        
        // 关闭添加分类模态框
        closeModal('addCategoryModal');
        
        showNotification(`分类"${trimmedName}"添加成功`);
    } catch (error) {
        console.error('添加分类失败:', error);
        showError('categoryNameError', '添加分类失败');
    }
}

/**
 * 删除分类
 */
function deleteCategory(categoryName) {
    // 确保至少保留一个分类
    if (categories.length <= 1) {
        showNotification('至少需要保留一个分类', 'error');
        return;
    }
    
    // 检查该分类是否有密码
    const categoryPasswords = db.getPasswordsByCategory(categoryName);
    if (categoryPasswords.length > 0) {
        const confirmed = confirm(`分类"${categoryName}"中有${categoryPasswords.length}个密码记录。\n\n删除分类将同时删除其中的所有密码，此操作无法撤销。\n\n确定要删除吗？`);
        if (!confirmed) return;
    } else {
        const confirmed = confirm(`确定要删除分类"${categoryName}"吗？`);
        if (!confirmed) return;
    }
    
    try {
        // 删除分类数据
        appStorage.remove(`category_${categoryName}`);
        
        // 从对应的分类列表中移除
        if (defaultCategories.includes(categoryName)) {
            // 如果是默认分类，从默认分类列表中移除
            const index = defaultCategories.indexOf(categoryName);
            if (index > -1) {
                defaultCategories.splice(index, 1);
                // 保存更新后的默认分类列表
                appStorage.set('defaultCategories', JSON.stringify(defaultCategories));
            }
        } else {
            // 如果是自定义分类，从自定义分类列表中移除
            const customCategories = appStorage.getCustomCategories();
            const updatedCategories = customCategories.filter(cat => cat !== categoryName);
            appStorage.setCustomCategories(updatedCategories);
        }
        
        // 如果当前分类被删除，切换到第一个可用分类
        if (currentCategory === categoryName) {
            const remainingCategories = [...defaultCategories, ...appStorage.getCustomCategories()];
            if (remainingCategories.length > 0) {
                switchCategory(remainingCategories[0]);
            }
        }
        
        // 重新加载分类
        loadCategories();
        updateCategorySelect();
        
        // 如果分类管理界面是打开的，刷新它
        const categoryModal = document.getElementById('categoryModal');
        if (categoryModal && categoryModal.classList.contains('show')) {
            renderCategoryManager();
        }
        
        showNotification(`分类"${categoryName}"删除成功`);
    } catch (error) {
        console.error('删除分类失败:', error);
        showNotification('删除分类失败', 'error');
    }
}

/**
 * 显示分类管理弹窗
 */
function showCategoryManager() {
    const modal = document.getElementById('categoryModal');
    if (modal) {
        renderCategoryManager();
        modal.classList.add('show');
    }
}

/**
 * 渲染分类管理界面
 */
function renderCategoryManager() {
    const categoryManagerList = document.getElementById('categoryManagerList');
    if (!categoryManagerList) return;
    
    categoryManagerList.innerHTML = '';
    
    categories.forEach(category => {
        const isDefault = defaultCategories.includes(category);
        const categoryPasswords = db.getPasswordsByCategory(category);
        const count = categoryPasswords.length;
        const canDelete = categories.length > 1; // 至少保留一个分类
        
        const categoryElement = document.createElement('div');
        categoryElement.className = 'category-manager-item';
        categoryElement.innerHTML = `
            <div class="category-manager-info">
                <div class="category-manager-name">
                    ${category}
                    ${isDefault ? '<span class="default-badge">默认</span>' : '<span class="custom-badge">自定义</span>'}
                </div>
                <div class="category-manager-count">${count} 个密码</div>
            </div>
            <div class="category-manager-actions">
                ${canDelete ? 
                    `<button class="btn btn-danger btn-small" onclick="deleteCategory('${category}')">删除</button>` : 
                    `<button class="btn btn-danger btn-small" disabled title="至少需要保留一个分类">删除</button>`
                }
            </div>
        `;
        
        categoryManagerList.appendChild(categoryElement);
    });
}

/**
 * 渲染分类列表
 */
function renderCategories() {
    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = '';
    
    categories.forEach(category => {
        const categoryPasswords = db.getPasswordsByCategory(category);
        const count = categoryPasswords.length;
        
        const categoryElement = document.createElement('div');
        categoryElement.className = `category-item ${category === currentCategory ? 'active' : ''}`;
        categoryElement.innerHTML = `
            <span class="category-name">${category}</span>
            <span class="category-count">${count}</span>
        `;
        
        categoryElement.addEventListener('click', () => {
            switchCategory(category);
        });
        
        categoryList.appendChild(categoryElement);
    });
}

/**
 * 更新分类选择下拉框
 */
function updateCategorySelect() {
    const categorySelect = document.getElementById('passwordCategory');
    if (categorySelect) {
        categorySelect.innerHTML = '';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
    }
}

/**
 * 切换分类
 */
function switchCategory(category) {
    currentCategory = category;
    document.getElementById('currentCategory').textContent = category;
    loadPasswords(category);
    renderCategories();
    
    // 清空当前选中的密码
    clearPasswordDetail();
    
    // 退出搜索模式
    if (searchMode) {
        exitSearchMode();
    }
}

/**
 * 加载密码列表
 */
function loadPasswords(category) {
    passwords = db.getPasswordsByCategory(category);
    renderPasswords(passwords);
}

/**
 * 渲染密码列表
 */
function renderPasswords(passwordList) {
    const passwordListElement = document.getElementById('passwordList');
    passwordListElement.innerHTML = '';
    
    if (passwordList.length === 0) {
        passwordListElement.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔐</div>
                <div class="empty-text">暂无密码记录</div>
                <div class="empty-hint">点击右上角"添加"按钮开始使用</div>
            </div>
        `;
        return;
    }
    
    passwordList.forEach(password => {
        const passwordElement = document.createElement('div');
        passwordElement.className = `password-item ${currentPassword && currentPassword.id === password.id ? 'active' : ''}`;
        passwordElement.innerHTML = `
            <div class="password-icon">${password.title.charAt(0).toUpperCase()}</div>
            <div class="password-info">
                <div class="password-title">${password.title}</div>
                <div class="password-username">${password.username || '无用户名'}</div>
            </div>
            <div class="password-actions">
                <button class="action-btn copy-btn" onclick="copyToClipboard('${password.password}')" title="复制密码">📋</button>
            </div>
        `;
        
        passwordElement.addEventListener('click', (e) => {
            if (!e.target.closest('.password-actions')) {
                showPasswordDetail(password);
            }
        });
        
        passwordListElement.appendChild(passwordElement);
    });
}

/**
 * 添加新密码
 */
function addNewPassword() {
    currentPassword = null;
    document.getElementById('detailTitle').textContent = '添加新密码';
    
    // 清空表单
    document.getElementById('passwordTitle').value = '';
    document.getElementById('passwordUsername').value = '';
    document.getElementById('passwordValue').value = '';
    document.getElementById('passwordUrl').value = '';
    document.getElementById('passwordNotes').value = '';
    document.getElementById('passwordCategory').value = currentCategory;
    
    // 显示表单，隐藏空状态
    document.getElementById('emptyDetail').classList.add('hidden');
    document.getElementById('passwordForm').classList.remove('hidden');
    
    // 生成一个随机密码
    generatePassword();
    useGeneratedPassword();
}

/**
 * 显示密码详情
 */
function showPasswordDetail(password) {
    currentPassword = password;
    
    document.getElementById('detailTitle').textContent = password.title;
    document.getElementById('passwordTitle').value = password.title;
    document.getElementById('passwordUsername').value = password.username || '';
    document.getElementById('passwordValue').value = password.password;
    document.getElementById('passwordUrl').value = password.url || '';
    document.getElementById('passwordNotes').value = password.notes || '';
    document.getElementById('passwordCategory').value = password.category;
    
    // 显示表单，隐藏空状态
    document.getElementById('emptyDetail').classList.add('hidden');
    document.getElementById('passwordForm').classList.remove('hidden');
    
    // 更新密码列表中的激活状态
    renderPasswords(searchMode ? searchResults : passwords);
}

/**
 * 清空密码详情
 */
function clearPasswordDetail() {
    currentPassword = null;
    
    // 隐藏表单，显示空状态
    document.getElementById('emptyDetail').classList.remove('hidden');
    document.getElementById('passwordForm').classList.add('hidden');
    
    // 更新密码列表中的激活状态
    renderPasswords(searchMode ? searchResults : passwords);
}

/**
 * 保存当前密码
 */
function saveCurrentPassword() {
    const formData = {
        title: document.getElementById('passwordTitle').value,
        username: document.getElementById('passwordUsername').value,
        password: document.getElementById('passwordValue').value,
        url: document.getElementById('passwordUrl').value,
        notes: document.getElementById('passwordNotes').value,
        category: document.getElementById('passwordCategory').value
    };
    
    if (!formData.title) {
        showNotification('标题不能为空', 'error');
        return;
    }
    
    if (!formData.password) {
        showNotification('密码不能为空', 'error');
        return;
    }
    
    try {
        if (currentPassword) {
            // 更新现有密码
            db.updatePassword(currentPassword.id, formData);
        } else {
            // 添加新密码
            const newPassword = db.addPassword(formData);
            currentPassword = newPassword;
        }
        
        // 如果分类已更改，需要切换到新分类
        if (formData.category !== currentCategory) {
            switchCategory(formData.category);
        } else {
            // 否则只需刷新当前分类的密码列表
            loadPasswords(currentCategory);
            renderCategories(); // 更新分类计数
        }
        
        showNotification('保存成功');
    } catch (error) {
        showNotification('保存失败：' + error.message, 'error');
    }
}

/**
 * 删除当前密码
 */
function deleteCurrentPassword() {
    if (!currentPassword) return;
    
    if (confirm('确定要删除这个密码记录吗？')) {
        try {
            db.deletePassword(currentPassword.id, currentPassword.category);
            clearPasswordDetail();
            loadPasswords(currentCategory);
            renderCategories(); // 更新分类计数
            showNotification('密码已删除');
        } catch (error) {
            showNotification('删除失败：' + error.message, 'error');
        }
    }
}

// 搜索相关变量
let searchResults = [];

/**
 * 搜索密码
 */
function searchPasswords(keyword) {
    if (!keyword.trim()) {
        exitSearchMode();
        return;
    }
    
    searchMode = true;
    const allPasswords = db.getAllPasswords();
    searchResults = allPasswords.filter(password => 
        password.title.toLowerCase().includes(keyword.toLowerCase()) ||
        (password.username && password.username.toLowerCase().includes(keyword.toLowerCase())) ||
        (password.notes && password.notes.toLowerCase().includes(keyword.toLowerCase()))
    );
    
    // 更新当前分类显示
    document.getElementById('currentCategory').textContent = `搜索结果 (${searchResults.length})`;
    
    renderPasswords(searchResults);
}

/**
 * 退出搜索模式
 */
function exitSearchMode() {
    searchMode = false;
    searchResults = [];
    document.getElementById('searchInput').value = '';
    document.getElementById('currentCategory').textContent = currentCategory;
    renderPasswords(passwords);
}

/**
 * 初始化事件监听
 */
function initEventListeners() {
    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchPasswords(e.target.value);
        });
    }
    
    // 解锁密码回车键
    const unlockPasswordInput = document.getElementById('unlockPassword');
    if (unlockPasswordInput) {
        unlockPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                unlockApp();
            }
        });
    }
    
    // 设置密码回车键
    const setupPasswordInput = document.getElementById('setupPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    if (setupPasswordInput) {
        setupPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('confirmPassword').focus();
            }
        });
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                setupLockPassword();
            }
        });
    }
    
    // 添加分类输入框回车键
    const newCategoryNameInput = document.getElementById('newCategoryName');
    if (newCategoryNameInput) {
        newCategoryNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmAddCategory();
            }
        });
    }
    
    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
    
    // 同步密码长度滑块和输入框
    const lengthSlider = document.getElementById('passwordLength');
    const lengthInput = document.getElementById('lengthInput');
    
    if (lengthSlider && lengthInput) {
        lengthSlider.addEventListener('input', () => {
            lengthInput.value = lengthSlider.value;
            generatePassword();
        });
        
        lengthInput.addEventListener('input', () => {
            lengthSlider.value = lengthInput.value;
            generatePassword();
        });
    }
    
    // 监听选项变化
    ['includeNumbers', 'includeLowercase', 'includeUppercase', 'includeSymbols'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', generatePassword);
        }
    });
}

/**
 * 密码生成器相关功能
 */
function initPasswordGenerator() {
    generatePassword();
}

/**
 * 生成密码
 */
function generatePassword() {
    const lengthElement = document.getElementById('passwordLength');
    const length = lengthElement ? parseInt(lengthElement.value) : 12;
    
    const includeNumbers = document.getElementById('includeNumbers')?.checked ?? true;
    const includeLowercase = document.getElementById('includeLowercase')?.checked ?? true;
    const includeUppercase = document.getElementById('includeUppercase')?.checked ?? true;
    const includeSymbols = document.getElementById('includeSymbols')?.checked ?? true;
    
    let charset = '';
    if (includeNumbers) charset += '0123456789';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (!charset) {
        const generatedElement = document.getElementById('generatedPassword');
        if (generatedElement) {
            generatedElement.textContent = '请至少选择一种字符类型';
        }
        return;
    }
    
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    const generatedElement = document.getElementById('generatedPassword');
    if (generatedElement) {
        generatedElement.textContent = password;
    }
}

/**
 * 将生成的密码应用到密码输入框
 */
function useGeneratedPassword() {
    const generatedElement = document.getElementById('generatedPassword');
    const passwordInput = document.getElementById('passwordValue');
    
    if (generatedElement && passwordInput) {
        passwordInput.value = generatedElement.textContent;
    }
}

/**
 * 显示密码生成器
 */
function showPasswordGenerator() {
    generatePassword();
    const modal = document.getElementById('generatorModal');
    if (modal) {
        modal.classList.add('show');
    }
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('已复制到剪贴板');
    } catch (error) {
        console.error('复制失败:', error);
        showNotification('复制失败', 'error');
    }
}

/**
 * 复制输入框的值到剪贴板
 */
async function copyInputValue(inputId) {
    const input = document.getElementById(inputId);
    if (!input) {
        showNotification('输入框不存在', 'error');
        return;
    }
    
    const value = input.value.trim();
    if (!value) {
        showNotification('内容为空，无法复制', 'warning');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(value);
        
        // 根据输入框类型显示不同的提示消息
        let message = '已复制到剪贴板';
        switch (inputId) {
            case 'passwordTitle':
                message = '标题已复制到剪贴板';
                break;
            case 'passwordUsername':
                message = '用户名已复制到剪贴板';
                break;
            case 'passwordValue':
                message = '密码已复制到剪贴板';
                break;
            case 'passwordUrl':
                message = '网址已复制到剪贴板';
                break;
        }
        
        showNotification(message);
    } catch (error) {
        console.error('复制失败:', error);
        showNotification('复制失败', 'error');
    }
}

/**
 * 切换密码可见性
 */
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('passwordValue');
    if (passwordInput) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
        } else {
            passwordInput.type = 'password';
        }
    }
}

/**
 * 显示通知
 */
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

/**
 * 显示错误信息
 */
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
}

/**
 * 隐藏错误信息
 */
function hideError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.add('hidden');
    }
}

/**
 * 关闭模态框
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

/**
 * 关闭所有模态框
 */
function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.remove('show');
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 导出给HTML使用的函数
window.unlockApp = unlockApp;
window.setupLockPassword = setupLockPassword;
window.lockApp = lockApp;
window.resetLockPassword = resetLockPassword;
window.addNewPassword = addNewPassword;
window.saveCurrentPassword = saveCurrentPassword;
window.deleteCurrentPassword = deleteCurrentPassword;
window.generatePassword = generatePassword;
window.useGeneratedPassword = useGeneratedPassword;
window.copyToClipboard = copyToClipboard;
window.copyInputValue = copyInputValue;
window.togglePasswordVisibility = togglePasswordVisibility;
window.closeModal = closeModal;
window.showPasswordGenerator = showPasswordGenerator;
window.addCategory = addCategory;
window.confirmAddCategory = confirmAddCategory;
window.deleteCategory = deleteCategory;
window.showCategoryManager = showCategoryManager;
window.renderCategoryManager = renderCategoryManager;
window.showImportExport = showImportExport;
window.exportData = exportData;
window.importData = importData;

/**
 * 显示导入导出界面
 */
function showImportExport() {
    const modal = document.getElementById('importExportModal');
    if (modal) {
        modal.classList.add('show');
        
        // 初始化文件选择监听
        const fileInput = document.getElementById('importFile');
        if (fileInput) {
            // 移除之前的监听器（如果存在）
            fileInput.removeEventListener('change', handleFileSelect);
            // 添加新的监听器
            fileInput.addEventListener('change', handleFileSelect);
        }
    }
}

/**
 * 处理文件选择
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    const fileName = document.getElementById('fileName');
    const importBtn = document.getElementById('importBtn');
    
    if (file) {
        fileName.textContent = file.name;
        importBtn.disabled = false;
    } else {
        fileName.textContent = '未选择文件';
        importBtn.disabled = true;
    }
}

/**
 * 导出数据
 */
function exportData(format) {
    try {
        const includePasswords = document.getElementById('includePasswords').checked;
        const exportAllCategories = document.getElementById('exportAllCategories').checked;
        
        // 获取要导出的数据
        const exportData = getExportData(includePasswords, exportAllCategories);
        
        if (exportData.length === 0) {
            showNotification('没有数据可导出', 'warning');
            return;
        }
        
        let content, filename, mimeType;
        
        switch (format) {
            case 'db':
                content = exportAsDatabase(exportData);
                filename = `passwords_backup_${getCurrentDateTime()}.json`;
                mimeType = 'application/json';
                break;
            case 'csv':
                content = exportAsCSV(exportData);
                filename = `passwords_backup_${getCurrentDateTime()}.csv`;
                mimeType = 'text/csv';
                break;
            case 'txt':
                content = exportAsTXT(exportData);
                filename = `passwords_backup_${getCurrentDateTime()}.txt`;
                mimeType = 'text/plain';
                break;
            default:
                showNotification('不支持的导出格式', 'error');
                return;
        }
        
        downloadFile(content, filename, mimeType);
        showNotification(`导出成功：${filename}`);
        
    } catch (error) {
        console.error('导出失败:', error);
        showNotification('导出失败', 'error');
    }
}

/**
 * 获取导出数据
 */
function getExportData(includePasswords, exportAllCategories) {
    const exportData = [];
    const categoriesToExport = exportAllCategories ? categories : [currentCategory];
    
    categoriesToExport.forEach(category => {
        const categoryPasswords = db.getPasswordsByCategory(category);
        categoryPasswords.forEach(password => {
            const exportItem = {
                id: password.id,
                title: password.title,
                username: password.username || '',
                url: password.url || '',
                category: password.category,
                notes: password.notes || '',
                createdAt: password.createdAt,
                updatedAt: password.updatedAt
            };
            
            if (includePasswords) {
                exportItem.password = password.password;
            } else {
                exportItem.password = '[已隐藏]';
            }
            
            exportData.push(exportItem);
        });
    });
    
    return exportData;
}

/**
 * 导出为数据库格式
 */
function exportAsDatabase(data) {
    const exportObject = {
        version: '1.5.0',
        exportTime: new Date().toISOString(),
        categories: categories,
        defaultCategories: defaultCategories,
        customCategories: appStorage.getCustomCategories(),
        data: data
    };
    
    return JSON.stringify(exportObject, null, 2);
}

/**
 * 导出为CSV格式
 */
function exportAsCSV(data) {
    const headers = ['标题', '用户名', '密码', '网址', '分类', '备注', '创建时间', '更新时间'];
    let csv = headers.join(',') + '\n';
    
    data.forEach(item => {
        const row = [
            escapeCSV(item.title),
            escapeCSV(item.username),
            escapeCSV(item.password),
            escapeCSV(item.url),
            escapeCSV(item.category),
            escapeCSV(item.notes),
            escapeCSV(item.createdAt),
            escapeCSV(item.updatedAt)
        ];
        csv += row.join(',') + '\n';
    });
    
    return csv;
}

/**
 * 导出为TXT格式
 */
function exportAsTXT(data) {
    let txt = `密码管理器数据导出\n`;
    txt += `导出时间: ${new Date().toLocaleString()}\n`;
    txt += `总计: ${data.length} 条记录\n`;
    txt += `${'='.repeat(50)}\n\n`;
    
    data.forEach((item, index) => {
        txt += `记录 ${index + 1}:\n`;
        txt += `标题: ${item.title}\n`;
        txt += `用户名: ${item.username}\n`;
        txt += `密码: ${item.password}\n`;
        txt += `网址: ${item.url}\n`;
        txt += `分类: ${item.category}\n`;
        txt += `备注: ${item.notes}\n`;
        txt += `创建时间: ${item.createdAt}\n`;
        txt += `更新时间: ${item.updatedAt}\n`;
        txt += `${'-'.repeat(30)}\n\n`;
    });
    
    return txt;
}

/**
 * 导入数据
 */
function importData() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showNotification('请先选择文件', 'error');
        return;
    }
    
    const mergeImport = document.getElementById('mergeImport').checked;
    const skipDuplicates = document.getElementById('skipDuplicates').checked;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            const extension = file.name.split('.').pop().toLowerCase();
            
            // 检测是否为SQLite数据库文件
            if (extension === 'db' && isSQLiteFile(content)) {
                showNotification('检测到SQLite数据库文件，当前不支持此格式。请使用JSON、CSV或TXT格式的导出文件。', 'error');
                return;
            }
            
            let importResult;
            switch (extension) {
                case 'json':
                    importResult = importFromDatabase(content, mergeImport, skipDuplicates);
                    break;
                case 'db':
                    // 对于.db扩展名，尝试作为JSON解析（兼容本应用导出的格式）
                    try {
                        importResult = importFromDatabase(content, mergeImport, skipDuplicates);
                    } catch (error) {
                        if (error.message.includes('Unexpected token')) {
                            showNotification('该.db文件似乎是SQLite数据库格式，当前不支持。请导出为JSON、CSV或TXT格式后重试。', 'error');
                            return;
                        }
                        throw error;
                    }
                    break;
                case 'csv':
                    importResult = importFromCSV(content, mergeImport, skipDuplicates);
                    break;
                case 'txt':
                    importResult = importFromTXT(content, mergeImport, skipDuplicates);
                    break;
                default:
                    showNotification('不支持的文件格式。支持格式：JSON、CSV、TXT', 'error');
                    return;
            }
            
            if (importResult && importResult.success) {
                // 刷新界面
                loadData();
                closeModal('importExportModal');
                showNotification(`导入成功：${importResult.imported} 条记录，跳过：${importResult.skipped} 条`);
            } else {
                const errorMsg = importResult ? importResult.error : '未知错误';
                showNotification(`导入失败：${errorMsg}`, 'error');
            }
            
        } catch (error) {
            console.error('导入失败:', error);
            
            // 更详细的错误信息
            let errorMessage = '导入失败：';
            if (error.message.includes('Unexpected token')) {
                errorMessage += '文件格式不正确，可能是SQLite数据库文件或损坏的JSON文件';
            } else if (error.message.includes('JSON')) {
                errorMessage += 'JSON格式错误';
            } else {
                errorMessage += error.message || '文件格式错误';
            }
            
            showNotification(errorMessage, 'error');
        }
    };
    
    // 对于可能的二进制文件，先读取少量字节检测
    if (file.name.toLowerCase().endsWith('.db')) {
        const headerReader = new FileReader();
        headerReader.onload = function(e) {
            const header = e.target.result;
            if (isSQLiteFile(header)) {
                showNotification('检测到SQLite数据库文件，当前不支持此格式。请使用本应用导出的JSON格式文件。', 'error');
                return;
            }
            // 如果不是SQLite，继续按文本读取
            reader.readAsText(file);
        };
        headerReader.readAsText(file.slice(0, 100)); // 读取前100字节检测
    } else {
        reader.readAsText(file);
    }
}

/**
 * 从数据库格式导入
 */
function importFromDatabase(content, mergeImport, skipDuplicates) {
    try {
        const importData = JSON.parse(content);
        
        if (!mergeImport) {
            // 清空现有数据
            appStorage.clearAllData();
            // 重新初始化
            db.initDatabase();
        }
        
        let imported = 0;
        let skipped = 0;
        
        // 导入分类
        if (importData.customCategories) {
            const existingCustomCategories = appStorage.getCustomCategories();
            const newCustomCategories = [...existingCustomCategories];
            
            importData.customCategories.forEach(category => {
                if (!categories.includes(category)) {
                    newCustomCategories.push(category);
                }
            });
            
            appStorage.setCustomCategories(newCustomCategories);
        }
        
        // 导入密码数据
        if (importData.data) {
            importData.data.forEach(item => {
                if (skipDuplicates && isDuplicate(item)) {
                    skipped++;
                    return;
                }
                
                try {
                    // 确保分类存在
                    if (!categories.includes(item.category)) {
                        const customCategories = appStorage.getCustomCategories();
                        customCategories.push(item.category);
                        appStorage.setCustomCategories(customCategories);
                    }
                    
                    db.addPassword(item);
                    imported++;
                } catch (error) {
                    skipped++;
                }
            });
        }
        
        return { success: true, imported, skipped };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 从CSV格式导入
 */
function importFromCSV(content, mergeImport, skipDuplicates) {
    try {
        if (!mergeImport) {
            // 清空现有数据
            appStorage.clearAllData();
            db.initDatabase();
        }
        
        const lines = content.split('\n');
        let imported = 0;
        let skipped = 0;
        
        // 跳过标题行
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const fields = parseCSVLine(line);
            if (fields.length < 8) continue;
            
            const item = {
                title: fields[0],
                username: fields[1],
                password: fields[2],
                url: fields[3],
                category: fields[4],
                notes: fields[5],
                createdAt: fields[6] || new Date().toISOString(),
                updatedAt: fields[7] || new Date().toISOString()
            };
            
            if (skipDuplicates && isDuplicate(item)) {
                skipped++;
                continue;
            }
            
            try {
                // 确保分类存在
                if (!categories.includes(item.category)) {
                    const customCategories = appStorage.getCustomCategories();
                    customCategories.push(item.category);
                    appStorage.setCustomCategories(customCategories);
                }
                
                db.addPassword(item);
                imported++;
            } catch (error) {
                skipped++;
            }
        }
        
        return { success: true, imported, skipped };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 从TXT格式导入
 */
function importFromTXT(content, mergeImport, skipDuplicates) {
    try {
        if (!mergeImport) {
            // 清空现有数据
            appStorage.clearAllData();
            db.initDatabase();
        }
        
        let imported = 0;
        let skipped = 0;
        
        // 简单的TXT解析（假设是我们导出的格式）
        const records = content.split('记录').slice(1); // 跳过文件头
        
        records.forEach(record => {
            const lines = record.split('\n');
            const item = {};
            
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('标题: ')) item.title = trimmed.substring(3);
                else if (trimmed.startsWith('用户名: ')) item.username = trimmed.substring(4);
                else if (trimmed.startsWith('密码: ')) item.password = trimmed.substring(3);
                else if (trimmed.startsWith('网址: ')) item.url = trimmed.substring(3);
                else if (trimmed.startsWith('分类: ')) item.category = trimmed.substring(3);
                else if (trimmed.startsWith('备注: ')) item.notes = trimmed.substring(3);
                else if (trimmed.startsWith('创建时间: ')) item.createdAt = trimmed.substring(5);
                else if (trimmed.startsWith('更新时间: ')) item.updatedAt = trimmed.substring(5);
            });
            
            if (!item.title || !item.password) return;
            
            if (skipDuplicates && isDuplicate(item)) {
                skipped++;
                return;
            }
            
            try {
                // 确保分类存在
                if (!categories.includes(item.category)) {
                    const customCategories = appStorage.getCustomCategories();
                    customCategories.push(item.category);
                    appStorage.setCustomCategories(customCategories);
                }
                
                db.addPassword(item);
                imported++;
            } catch (error) {
                skipped++;
            }
        });
        
        return { success: true, imported, skipped };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 检查是否重复
 */
function isDuplicate(item) {
    const allPasswords = db.getAllPasswords();
    return allPasswords.some(existing => 
        existing.title === item.title && 
        existing.username === item.username &&
        existing.category === item.category
    );
}

/**
 * 辅助函数
 */
function getCurrentDateTime() {
    return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    return result;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 检测是否为SQLite数据库文件
 */
function isSQLiteFile(content) {
    // SQLite文件的魔数标识
    const sqliteSignatures = [
        'SQLite format 3',
        'SQLite',
        '** This file contains an SQLite'
    ];
    
    return sqliteSignatures.some(signature => 
        content.substring(0, 100).includes(signature)
    );
} 