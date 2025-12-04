document.addEventListener('DOMContentLoaded', () => { // 监听页面加载完成事件
    const apiUrl = 'http://127.0.0.1:5000'; // 定义后端接口基础地址
    const apiStatusIndicator = document.getElementById('api-status-indicator'); // 获取状态徽章元素
    const ideasList = document.getElementById('ideas-list'); // 获取灵感收纳箱容器元素
    const newIdeaInput = document.getElementById('new-idea'); // 获取灵感输入框元素
    const addIdeaButton = document.getElementById('add-idea'); // 获取添加灵感按钮元素
    const ideaSortSelect = document.getElementById('idea-sort'); // 灵感排序下拉
    const addEventButton = document.getElementById('add-event-button'); // 获取新建事件按钮元素
    const manageTypeList = document.getElementById('manage-type-list'); // 事件类型列表容器
    const manageTypeForm = document.getElementById('manage-type-form'); // 事件类型创建表单
    const manageTypeNameInput = document.getElementById('manage-type-name'); // 类型名称输入框
    const manageTypeColorInput = document.getElementById('manage-type-color'); // 类型颜色选择器
    const manageTypeColorPreview = document.getElementById('manage-type-color-preview'); // 类型颜色预览
    let ideasCache = []; // 定义灵感缓存数组便于后续查找
    let convertIdeaContext = null; // 定义当前正在转换的灵感上下文
    let editingTypeId = null; // 当前正在编辑的类型ID

    const convertModalWrapper = document.createElement('div'); // 创建转换弹窗包裹元素
    convertModalWrapper.innerHTML = `
        <div id="idea-convert-modal" class="modal hidden">
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">🔄</span>
                        <div class="modal-heading">
                            <h2>灵感转代办</h2>
                            <p>把灵感安排成可执行的行动</p>
                        </div>
                    </div>
                    <button type="button" class="close-button convert-close-button" aria-label="关闭">&times;</button>
                </div>
                <div class="modal-body">
                    <label class="modal-label" for="convert-title">标题</label>
                    <input type="text" id="convert-title" placeholder="请输入代办标题...">
                    <label class="modal-label" for="convert-date">日期</label>
                    <input type="text" id="convert-date" class="modal-datepicker" placeholder="选择日期">
                    <div class="modal-field-row">
                        <div class="modal-field">
                            <label class="modal-label" for="convert-type">类型</label>
                            <select id="convert-type">
                                <option value="" disabled hidden>请选择事件类型</option>
                            </select>
                        </div>
                        <div class="modal-field">
                            <label class="modal-label" for="convert-urgency">紧急程度</label>
                            <select id="convert-urgency">
                                <option value="" disabled hidden>请选择紧急程度</option>
                                <option value="紧急且重要">紧急且重要</option>
                                <option value="不紧急且重要">不紧急且重要</option>
                                <option value="紧急且不重要">紧急且不重要</option>
                                <option value="不紧急且不重要">不索急且不重要</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button id="confirm-convert" class="btn-secondary modal-confirm">✅ 确认转成代办</button>
                </div>
            </div>
        </div>
    `; // 为弹窗包裹元素注入 HTML 结构
    document.body.appendChild(convertModalWrapper); // 将弹窗插入到页面中
    const convertModalElement = convertModalWrapper.querySelector('#idea-convert-modal'); // 获取弹窗主体元素
    const convertCloseButton = convertModalWrapper.querySelector('.convert-close-button'); // 获取弹窗关闭按钮
    const convertConfirmButton = convertModalWrapper.querySelector('#confirm-convert'); // 获取弹窗确认按钮
    const convertTitleInput = convertModalWrapper.querySelector('#convert-title'); // 获取标题输入框
    const convertDateInput = convertModalWrapper.querySelector('#convert-date'); // 获取日期输入框
    const convertTypeSelect = convertModalWrapper.querySelector('#convert-type'); // 获取类型选择框
    const convertUrgencySelect = convertModalWrapper.querySelector('#convert-urgency'); // 获取紧急程度选择框
    const convertModalContent = convertModalWrapper.querySelector('.modal-content'); // 获取弹窗内容容器

    convertModalElement.classList.add('hidden');

    // 创建编辑灵感弹窗
    const editIdeaModalWrapper = document.createElement('div');
    editIdeaModalWrapper.innerHTML = `
        <div id="idea-edit-modal" class="modal hidden">
            <div class="modal-content" style="max-width: 460px;">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">✏️</span>
                        <div class="modal-heading">
                            <h2>编辑灵感</h2>
                        </div>
                    </div>
                    <button type="button" class="close-button edit-close-button" aria-label="关闭">&times;</button>
                </div>
                <div class="modal-body">
                    <label class="modal-label" for="edit-idea-text">灵感内容</label>
                    <input type="text" id="edit-idea-text" placeholder="请输入灵感内容...">
                    <label class="modal-label" for="edit-idea-priority">优先级</label>
                    <select id="edit-idea-priority">
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button id="confirm-edit-idea" class="btn-primary modal-confirm">✅ 保存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(editIdeaModalWrapper);
    const editIdeaModalElement = editIdeaModalWrapper.querySelector('#idea-edit-modal');
    const editCloseButton = editIdeaModalWrapper.querySelector('.edit-close-button');
    const editConfirmButton = editIdeaModalWrapper.querySelector('#confirm-edit-idea');
    const editIdeaTextInput = editIdeaModalWrapper.querySelector('#edit-idea-text');
    const editIdeaPrioritySelect = editIdeaModalWrapper.querySelector('#edit-idea-priority');
    let editingIdeaId = null;

    editIdeaModalElement.classList.add('hidden');

    let datePicker = null; // 缓存日期选择器实例
    let typeChoices = null; // 缓存类型选择器实例
    let urgencyChoices = null; // 缓存紧急程度选择器实例
    let editPriorityChoices = null; // 编辑灵感优先级选择器
    let ideaSortChoices = null; // 灵感排序选择器

    const baseChoiceConfig = {
        searchEnabled: false,
        itemSelectText: '',
        shouldSort: false,
        position: 'bottom',
        allowHTML: false,
        removeItemButton: false,
        duplicateItemsAllowed: false
    }; // 定义通用配置

    if (window.flatpickr) { // 确认 flatpickr 是否已加载
        if (flatpickr.l10ns && flatpickr.l10ns.zh) { // 统一使用中文本地化
            flatpickr.localize(flatpickr.l10ns.zh);
        }
        datePicker = flatpickr(convertDateInput, { // 初始化日期选择器
            dateFormat: 'Y-m-d',
            defaultDate: new Date(),
            minDate: 'today',
            disableMobile: true,
            allowInput: false,
            locale: {
                firstDayOfWeek: 1 // 周一为一周的第一天
            }
        });
    }

    if (window.Choices) { // 确认 Choices 是否已加载
        typeChoices = new Choices(convertTypeSelect, baseChoiceConfig);
        urgencyChoices = new Choices(convertUrgencySelect, baseChoiceConfig);
        editPriorityChoices = new Choices(editIdeaPrioritySelect, baseChoiceConfig);
        // 初始化头部紧急程度筛选器（如果存在）
        const headerUrgencySelect = document.getElementById('urgency-filter');
        if (headerUrgencySelect) {
            try {
                if (headerUrgencySelect.closest('.choices')) {
                    console.log('[Main] 头部紧急程度筛选器已存在 Choices 包装, 跳过重复初始化');
                } else {
                    console.log('[Main] 初始化头部紧急程度筛选器 (Choices)');
                    // 使用默认 classNames，初始化后再追加自定义样式类，避免 DOMTokenList 空格错误
                    const instance = new Choices(headerUrgencySelect, { ...baseChoiceConfig });
                    instance.containerOuter.element.classList.add('urgency-filter-choices');
                    window.headerUrgencyChoices = instance;
                }
            } catch (e) {
                console.warn('[Main] 头部紧急程度筛选器初始化失败, 使用原生下拉:', e);
            }
        }
        if (ideaSortSelect) {
            ideaSortChoices = new Choices(ideaSortSelect, baseChoiceConfig);
            ideaSortChoices.containerOuter.element.classList.add('idea-sort-choices');
        }
    }

    const updateApiStatus = async () => { // 定义异步函数用于刷新后端健康状态
        try { // 捕获潜在网络异常
            const response = await fetch(`${apiUrl}/health`); // 请求后端健康检查接口
            if (!response.ok) { // 判断响应是否成功
                throw new Error('健康检查返回非 200 状态'); // 抛出异常以触发下方处理
            } // if 分支结束
            await response.json(); // 解析后端返回的 JSON 数据
            apiStatusIndicator.textContent = '在线'; // 更新徽章文本提示在线
            apiStatusIndicator.className = 'health-status online'; // 添加在线样式
        } catch (error) { // 处理请求异常
            apiStatusIndicator.textContent = '离线'; // 更新徽章文本提示离线
            apiStatusIndicator.className = 'health-status offline'; // 添加离线样式
        } // try-catch 结构结束
    }; // 函数定义结束

    const handleEventsChanged = () => {
        updateApiStatus();
    };

    const eventManager = new EventManager({
        apiUrl,
        onEventsChanged: handleEventsChanged
    });
    window.eventManager = eventManager;

    const ensureEventTypesLoaded = async () => {
        try {
            await eventManager.ready;
            if (!eventManager.eventTypes || eventManager.eventTypes.length === 0) {
                await eventManager.refreshTypes();
            }
        } catch (error) {
            console.error('[Main] 事件管理器初始化失败:', error);
        }
    };

    const getSelectedConvertTypeId = () => {
        if (typeChoices) {
            const value = typeChoices.getValue(true);
            return Array.isArray(value) ? value[0] : value;
        }
        return convertTypeSelect.value;
    };

    const updateConvertConfirmState = () => {
        const manager = window.eventManager;
        const hasTypes = manager && Array.isArray(manager.eventTypes) && manager.eventTypes.length > 0;
        const selectedTypeId = getSelectedConvertTypeId();
        if (!hasTypes) {
            convertConfirmButton.disabled = true;
            convertConfirmButton.textContent = '请先创建事件类型';
        } else if (!selectedTypeId) {
            convertConfirmButton.disabled = true;
            convertConfirmButton.textContent = '请选择事件类型';
        } else {
            convertConfirmButton.disabled = false;
            convertConfirmButton.textContent = '✅ 确认转成代办';
        }
    };

    const syncConvertTypeOptions = () => {
        const manager = window.eventManager;
        const types = manager && Array.isArray(manager.eventTypes) ? manager.eventTypes : [];
        const hasTypes = types.length > 0;
        const placeholderLabel = hasTypes ? '请选择事件类型' : '请先创建事件类型';

        if (typeChoices) {
            // 更新占位符文本
            const placeholderOption = convertTypeSelect.querySelector('option[value=""]');
            if (placeholderOption) {
                placeholderOption.textContent = placeholderLabel;
            }
            
            typeChoices.clearChoices();
            if (hasTypes) {
                // 只设置真实的选项,不包含占位符
                const choiceItems = types.map(type => ({ value: type.id, label: type.name }));
                typeChoices.setChoices(choiceItems, 'value', 'label', true);
                typeChoices.removeActiveItems();
                typeChoices.clearInput();
            } else {
                // 无事件类型时也不需要通过 setChoices 添加占位符
                typeChoices.clearChoices();
                typeChoices.removeActiveItems();
            }
        } else {
            if (hasTypes) {
                const optionsHtml = ['<option value="" disabled selected>请选择事件类型</option>']
                    .concat(types.map(type => `<option value="${type.id}">${type.name}</option>`));
                convertTypeSelect.innerHTML = optionsHtml.join('');
            } else {
                convertTypeSelect.innerHTML = '<option value="" disabled selected>请先创建事件类型</option>';
            }
        }

        updateConvertConfirmState();
    };

    const selectDefaultType = () => {
        if (typeChoices) {
            typeChoices.removeActiveItems();
            typeChoices.clearInput();
        } else {
            convertTypeSelect.value = '';
        }
        updateConvertConfirmState();
    };

    if (convertTypeSelect) {
        convertTypeSelect.addEventListener('change', () => {
            updateConvertConfirmState();
        });
    }

    updateConvertConfirmState();

    const renderManageTypes = (types = []) => {
        if (!manageTypeList) {
            return;
        }
        if (!Array.isArray(types) || types.length === 0) {
            manageTypeList.innerHTML = '<div class="manage-type-empty">暂无事件类型，请先创建</div>';
            return;
        }
        manageTypeList.innerHTML = types.map((type) => {
            const typeId = typeof type.id === 'string' ? type.id : '';
            const shortId = typeId ? typeId.slice(0, 8) : '——';
            const color = type.color || '#667eea';
            return `
            <div class="manage-type-item" data-id="${type.id}">
                <div class="manage-type-info">
                    <span class="manage-type-color" style="background:${color}"></span>
                    <div class="manage-type-text">
                        <div class="manage-type-name">${type.name}</div>
                        <div class="manage-type-meta">${shortId}</div>
                    </div>
                </div>
                <div class="manage-type-actions">
                    <button type="button" class="manage-type-edit" data-id="${type.id}" data-name="${type.name}" data-color="${color}">编辑</button>
                    <button type="button" class="manage-type-delete" data-id="${type.id}">删除</button>
                </div>
            </div>
        `;
        }).join('');
    };

    const refreshManageTypes = () => {
        const manager = window.eventManager;
        if (!manager || !manager.eventTypes) {
            renderManageTypes([]);
            return;
        }
        renderManageTypes(manager.eventTypes);
    };

    eventManager.ready.then(async () => {
        try {
            await eventManager.refreshTypes();
        } catch (error) {
            console.error('[Main] 初始化事件类型失败:', error);
        }
        syncConvertTypeOptions();
        refreshManageTypes();
        if (addEventButton) {
            addEventButton.addEventListener('click', () => {
                eventManager.openForCreate();
            });
        }
    });

    document.addEventListener('event-types:updated', () => {
        syncConvertTypeOptions();
        refreshManageTypes();
    });

    if (manageTypeColorInput && manageTypeColorPreview) {
        manageTypeColorPreview.value = manageTypeColorInput.value;
        
        // 颜色选择器改变时更新文本框
        manageTypeColorInput.addEventListener('input', () => {
            manageTypeColorPreview.value = manageTypeColorInput.value;
        });
        
        // 文本框改变时验证并更新颜色选择器
        manageTypeColorPreview.addEventListener('input', (e) => {
            let value = e.target.value.trim();
            // 自动添加#前缀
            if (value && !value.startsWith('#')) {
                value = '#' + value;
                e.target.value = value;
            }
            // 验证16进制颜色格式
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                manageTypeColorInput.value = value;
            }
        });
        
        // 失去焦点时验证并修正
        manageTypeColorPreview.addEventListener('blur', (e) => {
            let value = e.target.value.trim();
            if (value && !value.startsWith('#')) {
                value = '#' + value;
            }
            // 如果不是有效的颜色格式，恢复为当前颜色选择器的值
            if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
                e.target.value = manageTypeColorInput.value;
            }
        });
    }

    if (manageTypeForm) {
        manageTypeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const name = manageTypeNameInput ? manageTypeNameInput.value.trim() : '';
            const color = manageTypeColorInput ? manageTypeColorInput.value : '#667eea';
            if (!name) {
                alert('请输入类型名称');
                return;
            }

            await ensureEventTypesLoaded();
            const managerInstance = window.eventManager;
            
            // 编辑模式下不检查重复
            if (!editingTypeId && managerInstance && Array.isArray(managerInstance.eventTypes)) {
                const normalized = name.toLowerCase();
                const duplicated = managerInstance.eventTypes.some((type) => (type.name || '').toLowerCase() === normalized);
                if (duplicated) {
                    alert('该事件类型已存在，请勿重复添加。');
                    return;
                }
            }

            try {
                let response;
                if (editingTypeId) {
                    // 编辑模式
                    response = await fetch(`${apiUrl}/event-types/${editingTypeId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, color })
                    });
                } else {
                    // 创建模式
                    response = await fetch(`${apiUrl}/event-types`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, color })
                    });
                }
                if (!response.ok) {
                    let message = editingTypeId ? '更新类型失败，请稍后重试' : '创建类型失败，请稍后重试';
                    if (response.status === 409) {
                        message = '该事件类型已存在，请勿重复添加。';
                    } else {
                        try {
                            const data = await response.json();
                            if (data && data.error) {
                                message = data.error;
                            }
                        } catch (parseError) {
                            const text = await response.text();
                            if (text) {
                                message = text;
                            }
                        }
                    }
                    throw new Error(message);
                }
                // 重置表单
                if (manageTypeNameInput) {
                    manageTypeNameInput.value = '';
                }
                if (manageTypeColorInput && manageTypeColorPreview) {
                    manageTypeColorInput.value = '#667eea';
                    manageTypeColorPreview.value = '#667eea';
                }
                editingTypeId = null;
                const submitButton = manageTypeForm.querySelector('button[type="submit"]');
                if (submitButton) {
                    submitButton.textContent = '+ 创建类型';
                }
                await eventManager.refreshTypes();
            } catch (error) {
                console.error('[Main] 创建事件类型失败:', error);
                alert(error.message || '创建类型失败，请稍后重试');
            }
        });
    }

    if (manageTypeList) {
        manageTypeList.addEventListener('click', async (event) => {
            // 处理编辑按钮
            const editTarget = event.target.closest('.manage-type-edit');
            if (editTarget) {
                const typeId = editTarget.dataset.id;
                const typeName = editTarget.dataset.name;
                const typeColor = editTarget.dataset.color;
                if (!typeId) {
                    return;
                }
                // 填充表单
                if (manageTypeNameInput) {
                    manageTypeNameInput.value = typeName;
                }
                if (manageTypeColorInput && manageTypeColorPreview) {
                    manageTypeColorInput.value = typeColor;
                    manageTypeColorPreview.value = typeColor;
                }
                editingTypeId = typeId;
                const submitButton = manageTypeForm.querySelector('button[type="submit"]');
                if (submitButton) {
                    submitButton.textContent = '保存修改';
                }
                // 滚动到表单
                manageTypeForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                manageTypeNameInput?.focus();
                return;
            }
            
            // 处理删除按钮
            const deleteTarget = event.target.closest('.manage-type-delete');
            if (!deleteTarget) {
                return;
            }
            const typeId = deleteTarget.dataset.id;
            if (!typeId) {
                return;
            }
            const confirmed = confirm('确认删除该事件类型？');
            if (!confirmed) {
                return;
            }
            try {
                await ensureEventTypesLoaded();
                const response = await fetch(`${apiUrl}/event-types/${typeId}`, { method: 'DELETE' });
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || '删除类型失败');
                }
                await eventManager.refreshTypes();
            } catch (error) {
                console.error('[Main] 删除事件类型失败:', error);
                alert(error.message || '删除类型失败，请稍后重试');
            }
        });
    }

    renderManageTypes();

    const resetConvertModal = () => {
        convertTitleInput.value = '';
        if (datePicker) datePicker.clear();
        else convertDateInput.value = '';
        selectDefaultType();
        if (urgencyChoices) {
            urgencyChoices.removeActiveItems();
            urgencyChoices.clearInput();
        } else {
            convertUrgencySelect.value = '';
        }
    };
    const closeConvertModal = () => { // 定义关闭转换弹窗的函数
        convertModalElement.classList.add('hidden'); // 隐藏弹窗
        convertIdeaContext = null; // 清空当前转换上下文
        resetConvertModal();
        document.body.style.overflow = '';
    }; // 函数定义结束

    const openConvertModal = async (idea) => { // 定义打开转换弹窗的函数
        convertIdeaContext = idea; // 记录当前被转换的灵感信息
        await ensureEventTypesLoaded();
        syncConvertTypeOptions();
        resetConvertModal();
        convertTitleInput.value = idea.text;
        const today = new Date();
        if (datePicker) datePicker.setDate(today, false);
        else convertDateInput.value = today.toISOString().slice(0, 10);
        selectDefaultType();
        convertModalElement.classList.remove('hidden'); // 显示弹窗并启用居中布局
        document.body.style.overflow = 'hidden';
    }; // 函数定义结束

    // 编辑灵感弹窗函数
    const openEditIdeaModal = (idea) => {
        editingIdeaId = idea.id;
        editIdeaTextInput.value = idea.text;
        const priority = idea.priority || 'medium';
        if (editPriorityChoices) {
            editPriorityChoices.setChoiceByValue(priority);
        } else {
            editIdeaPrioritySelect.value = priority;
        }
        editIdeaModalElement.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };

    const closeEditIdeaModal = () => {
        editIdeaModalElement.classList.add('hidden');
        editingIdeaId = null;
        editIdeaTextInput.value = '';
        if (editPriorityChoices) {
            editPriorityChoices.setChoiceByValue('medium');
        } else {
            editIdeaPrioritySelect.value = 'medium';
        }
        document.body.style.overflow = '';
    };

    editCloseButton.addEventListener('click', closeEditIdeaModal);

    editConfirmButton.addEventListener('click', async () => {
        const text = editIdeaTextInput.value.trim();
        if (!text) {
            alert('请输入灵感内容');
            return;
        }
        const priority = editPriorityChoices ? editPriorityChoices.getValue(true) : editIdeaPrioritySelect.value;
        
        try {
            const response = await fetch(`${apiUrl}/ideas/${editingIdeaId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, priority })
            });
            if (!response.ok) {
                throw new Error('更新灵感失败');
            }
            closeEditIdeaModal();
            await fetchIdeas();
        } catch (error) {
            console.error('[Main] 更新灵感失败:', error);
            alert('更新灵感失败，请稍后重试');
        }
    });

    updateApiStatus(); // 初次加载时立即刷新一次健康状态
    
    // 初始化粒子背景
    particlesJS('particles-js', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: '#ffffff' },
            shape: { type: 'circle' },
            opacity: { value: 0.5, random: false },
            size: { value: 3, random: true },
            line_linked: {
                enable: true,
                distance: 150,
                color: '#ffffff',
                opacity: 0.4,
                width: 1
            },
            move: {
                enable: true,
                speed: 2,
                direction: 'none',
                random: false,
                straight: false,
                out_mode: 'out',
                bounce: false
            }
        },
        interactivity: {
            detect_on: 'canvas',
            events: {
                onhover: { enable: true, mode: 'repulse' },
                onclick: { enable: true, mode: 'push' },
                resize: true
            }
        },
        retina_detect: true
    });
    
    // 页面切换功能
    const navBtns = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page-content');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = btn.getAttribute('data-page');
            
            // 更新按钮状态
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 切换页面
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(`page-${targetPage}`).classList.add('active');

            if (targetPage === 'manage') {
                ensureEventTypesLoaded().then(() => {
                    eventManager.refreshTypes().finally(() => {
                        refreshManageTypes();
                    });
                });
            } else if (targetPage === 'stats') {
                // 加载统计数据
                loadStats();
            }
        });
    });

    const renderIdeas = (ideas) => { // 定义渲染灵感收纳箱的函数
        if (ideas.length === 0) { // 判断是否存在灵感数据
            ideasList.innerHTML = '<div class="no-ideas">💭 暂无灵感，快来记录第一个想法吧！</div>'; // 渲染空状态提示
            return; // 提前结束函数
        } // if 结束
        const total = ideas.length; // 记录灵感总数用于编号
        ideasList.innerHTML = ideas.map((idea, index) => { // 构建灵感收纳箱的 HTML 结构
            const number = total - index; // 计算显示编号
            const created = idea.createdAt ? new Date(idea.createdAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN'); // 处理时间显示
            const priority = idea.priority || 'medium';
            const priorityMap = { high: '高', medium: '中', low: '低' };
            const priorityText = priorityMap[priority] || '中';
            return `
                <div class="idea-item" data-id="${idea.id}">
                    <div class="idea-number">${number}</div>
                    <div class="idea-content">
                        <div class="idea-text">💡 ${idea.text}</div>
                        <span class="idea-priority ${priority}">${priorityText}</span>
                    </div>
                    <div class="idea-actions">
                        <button class="btn-edit idea-edit-btn" data-id="${idea.id}">编辑</button>
                        <button class="btn-convert idea-convert-btn" data-id="${idea.id}">转成代办</button>
                        <button class="btn-delete idea-delete-btn" data-id="${idea.id}">删除</button>
                    </div>
                </div>
            `; // 返回每条灵感的 HTML 字符串
        }).join(''); // 将所有条目拼接成完整 HTML
    }; // 函数定义结束

    const sortIdeas = (ideas, sortType) => {
        const sorted = [...ideas];
        if (sortType === 'priority') {
            const priorityOrder = { high: 1, medium: 2, low: 3 };
            sorted.sort((a, b) => {
                const priorityA = priorityOrder[a.priority || 'medium'];
                const priorityB = priorityOrder[b.priority || 'medium'];
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                // 相同优先级按时间倒序
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
        } else {
            // 按时间倒序（默认）
            sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        return sorted;
    };

    const getIdeaSortValue = () => {
        if (ideaSortChoices) {
            const value = ideaSortChoices.getValue(true);
            if (Array.isArray(value)) {
                return value[0];
            }
            return value;
        }
        return ideaSortSelect ? ideaSortSelect.value : 'time';
    };

    const fetchIdeas = async () => { // 定义异步函数用于获取灵感收纳箱
        const response = await fetch(`${apiUrl}/ideas`); // 请求灵感收纳箱接口
        const ideas = await response.json(); // 解析返回的灵感数组
        ideasCache = ideas; // 缓存最新灵感数据
        const sortType = getIdeaSortValue();
        const sortedIdeas = sortIdeas(ideas, sortType);
        renderIdeas(sortedIdeas); // 调用渲染函数更新界面
    }; // 函数定义结束

    // 排序功能
    if (ideaSortSelect) {
        ideaSortSelect.addEventListener('change', () => {
            const sortType = getIdeaSortValue();
            const sortedIdeas = sortIdeas(ideasCache, sortType);
            renderIdeas(sortedIdeas);
        });
    }

    ideasList.addEventListener('click', async (event) => { // 监听灵感收纳箱内部点击事件
        const target = event.target; // 获取触发事件的具体元素
        if (target.classList.contains('idea-edit-btn')) { // 判断是否点击编辑按钮
            const ideaId = target.dataset.id;
            const idea = ideasCache.find(item => item.id === ideaId);
            if (idea) {
                openEditIdeaModal(idea);
            }
            return;
        }
        if (target.classList.contains('idea-convert-btn')) { // 判断是否点击转换按钮
            const ideaId = target.dataset.id; // 读取按钮上的灵感标识
            const idea = ideasCache.find(item => item.id === ideaId); // 在缓存中查找对应灵感
            if (idea) { // 确认灵感存在
                openConvertModal(idea); // 打开转换弹窗
            } // if 结束
            return; // 阻止继续执行删除逻辑
        } // if 结束
        if (target.classList.contains('idea-delete-btn')) { // 判断是否点击删除按钮
            const ideaId = target.dataset.id; // 读取按钮上的灵感标识
            const confirmDelete = confirm('确定要删除这条灵感吗？'); // 弹出确认框
            if (!confirmDelete) return; // 如果用户取消，直接返回
            await fetch(`${apiUrl}/ideas/${ideaId}`, { method: 'DELETE' }); // 调用删除接口
            await fetchIdeas(); // 重新获取灵感收纳箱
            await updateApiStatus(); // 更新健康状态统计数据
        } // if 结束
    }); // 事件监听结束

    convertCloseButton.addEventListener('click', () => { // 监听弹窗关闭按钮点击
        closeConvertModal(); // 调用关闭函数
    }); // 事件监听结束

    convertConfirmButton.addEventListener('click', async () => { // 监听转换确认按钮点击
        if (!convertIdeaContext) { // 判断是否存在待转换的灵感
            return; // 无上下文则直接返回
        } // if 结束
        const title = convertTitleInput.value.trim(); // 获取并去除标题的首尾空格
        const date = convertDateInput.value; // 获取日期输入值
        if (!title || !date) { // 校验必填项
            alert('请填写完整的标题和日期信息。'); // 提示用户补全信息
            return; // 中断后续执行
        } // if 结束

        await ensureEventTypesLoaded();
        const customTypeId = getSelectedConvertTypeId();
        if (!customTypeId) {
            alert('请选择事件类型。');
            return;
        }
        const manager = window.eventManager;
        const selectedType = manager ? manager.getTypeById(customTypeId) : null;
        const urgency = urgencyChoices ? urgencyChoices.getValue(true) : convertUrgencySelect.value;
        if (!urgency) {
            alert('请选择紧急程度。');
            return;
        }

        const payload = { // 构建提交给后端的事件数据
            title,
            start: date,
            end: date,
            allDay: true,
            category: selectedType ? selectedType.name : '默认',
            urgency,
            customTypeId
        };

        try {
            const response = await fetch(`${apiUrl}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || '创建事件失败');
            }
            const deleteResponse = await fetch(`${apiUrl}/ideas/${convertIdeaContext.id}`, { method: 'DELETE' });
            if (!deleteResponse.ok) {
                throw new Error('事件已创建，但删除灵感失败');
            }
            closeConvertModal();
            await fetchIdeas();
            handleEventsChanged();
            document.dispatchEvent(new CustomEvent('events:changed'));
        } catch (error) {
            console.error('[Main] 灵感转任务失败:', error);
            alert(error.message || '转换失败，请稍后重试');
        }
    }); // 事件监听结束

    addIdeaButton.addEventListener('click', async () => { // 监听添加灵感按钮点击
        const text = newIdeaInput.value.trim(); // 获取并清理输入内容
        if (text) { // 判断输入是否为空
            await fetch(`${apiUrl}/ideas`, { // 调用新增灵感接口
                method: 'POST', // 使用 POST 方法
                headers: { 'Content-Type': 'application/json' }, // 指定请求头为 JSON
                body: JSON.stringify({ text }) // 序列化请求体
            }); // 请求结束
            newIdeaInput.value = ''; // 清空输入框
            await fetchIdeas(); // 刷新灵感收纳箱
            await updateApiStatus(); // 更新健康状态统计
        } // if 结束
    }); // 事件监听结束

    fetchIdeas(); // 首次加载时请求灵感收纳箱
    setInterval(updateApiStatus, 30000); // 每 30 秒刷新一次服务状态

    // ============ 数据统计功能 ============
    const statsContainer = document.getElementById('stats-container');
    const statsUpdateTime = document.getElementById('stats-update-time');
    const statsYearSelect = document.getElementById('stats-year');
    const statsMonthSelect = document.getElementById('stats-month');
    
    // 统计筛选器 Choices 实例
    let statsYearChoices = null;
    let statsMonthChoices = null;
    
    // 统计数据缓存
    let statsCache = {}; // 格式: { "2025_11": { data: {...}, timestamp: 123456 } }
    const STATS_CACHE_DURATION = 5 * 60 * 1000; // 缓存5分钟

    // 初始化年份选择器
    const initYearSelect = () => {
        if (!statsYearSelect) return;
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= currentYear - 5; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}年`;
            if (year === currentYear) option.selected = true;
            statsYearSelect.appendChild(option);
        }
        
        // 使用 Choices.js 美化下拉框
        if (window.Choices) {
            statsYearChoices = new Choices(statsYearSelect, {
                searchEnabled: false,
                itemSelectText: '',
                shouldSort: false,
                position: 'bottom',
                allowHTML: false
            });
            statsYearChoices.containerOuter.element.classList.add('stats-filter-choices');
        }
    };

    // 设置默认为当前月份
    const initMonthSelect = () => {
        if (!statsMonthSelect) return;
        const currentMonth = new Date().getMonth() + 1;
        statsMonthSelect.value = currentMonth;
        
        // 使用 Choices.js 美化下拉框
        if (window.Choices) {
            statsMonthChoices = new Choices(statsMonthSelect, {
                searchEnabled: false,
                itemSelectText: '',
                shouldSort: false,
                position: 'bottom',
                allowHTML: false
            });
            statsMonthChoices.containerOuter.element.classList.add('stats-filter-choices');
        }
    };

    // 获取筛选器当前值 (兼容 Choices.js)
    const getStatsYearValue = () => {
        if (statsYearChoices) {
            return statsYearChoices.getValue(true);
        }
        return statsYearSelect?.value || '';
    };
    
    const getStatsMonthValue = () => {
        if (statsMonthChoices) {
            return statsMonthChoices.getValue(true);
        }
        return statsMonthSelect?.value || '';
    };

    const loadStats = async (forceRefresh = false) => {
        if (!statsContainer) return;
        
        const year = getStatsYearValue();
        const month = getStatsMonthValue();
        const cacheKey = `${year}_${month}`;
        
        // 检查缓存
        const cached = statsCache[cacheKey];
        const now = Date.now();
        const isCacheValid = cached && (now - cached.timestamp < STATS_CACHE_DURATION);
        
        // 如果有有效缓存且不是强制刷新,立即显示缓存数据
        if (isCacheValid && !forceRefresh) {
            renderStats(cached.data);
            if (statsUpdateTime) {
                const cacheTime = new Date(cached.timestamp);
                statsUpdateTime.textContent = `更新于 ${cacheTime.getHours()}:${String(cacheTime.getMinutes()).padStart(2, '0')}`;
            }
            return;
        }
        
        // 如果有缓存先显示缓存,同时在后台更新
        if (cached && !forceRefresh) {
            renderStats(cached.data);
            if (statsUpdateTime) {
                statsUpdateTime.textContent = '正在更新...';
            }
        } else {
            // 没有缓存显示加载中
            statsContainer.innerHTML = '<div class="stats-loading">正在加载统计数据...</div>';
        }
        
        try {
            let url = `${apiUrl}/stats`;
            const params = [];
            if (year) params.push(`year=${year}`);
            if (month) params.push(`month=${month}`);
            if (params.length > 0) url += '?' + params.join('&');
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('获取统计数据失败');
            }
            
            const stats = await response.json();
            
            // 更新缓存
            statsCache[cacheKey] = {
                data: stats,
                timestamp: Date.now()
            };
            
            renderStats(stats);
            
            // 更新时间戳
            const updateTime = new Date();
            if (statsUpdateTime) {
                statsUpdateTime.textContent = `更新于 ${updateTime.getHours()}:${String(updateTime.getMinutes()).padStart(2, '0')}`;
            }
        } catch (error) {
            console.error('[Stats] 加载统计数据失败:', error);
            // 如果有缓存,继续显示缓存数据
            if (cached) {
                renderStats(cached.data);
                if (statsUpdateTime) {
                    statsUpdateTime.textContent = '更新失败,显示缓存数据';
                }
            } else {
                statsContainer.innerHTML = `
                    <div class="stats-error">
                        <p>❌ 暂时无法加载统计数据</p>
                        <button onclick="location.reload()" class="btn-secondary">重新加载</button>
                    </div>
                `;
            }
        }
    };

    const renderStats = (stats) => {
        if (!statsContainer) return;
        
        const html = `
            <div class="stats-grid">
                <!-- 事件统计卡片 -->
                <div class="stat-card">
                    <div class="stat-icon">📅</div>
                    <div class="stat-content">
                        <h3>总事件数</h3>
                        <div class="stat-value">${stats.totalEvents || 0}</div>
                        <div class="stat-detail">
                            已完成: ${stats.completedEvents || 0} | 
                            待办: ${stats.pendingEvents || 0}
                        </div>
                    </div>
                </div>

                <!-- 完成率卡片 -->
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-content">
                        <h3>完成率</h3>
                        <div class="stat-value">${stats.completionRate || 0}%</div>
                        <div class="stat-progress">
                            <div class="stat-progress-bar" style="width: ${stats.completionRate || 0}%"></div>
                        </div>
                    </div>
                </div>

                <!-- 积分统计卡片 -->
                <div class="stat-card">
                    <div class="stat-icon">🏆</div>
                    <div class="stat-content">
                        <h3>总积分</h3>
                        <div class="stat-value">${stats.score?.total || 0}</div>
                        <div class="stat-detail">平均每日: ${stats.score?.average || 0} 分</div>
                    </div>
                </div>

                <!-- 记录率卡片 (仅月度显示) -->
                ${stats.month ? `
                <div class="stat-card">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-content">
                        <h3>记录率</h3>
                        <div class="stat-value">${stats.recordRate || 0}%</div>
                        <div class="stat-detail">
                            已记录: ${stats.recordedHours || 0}h / ${stats.availableHours || 0}h
                        </div>
                        <div class="stat-progress">
                            <div class="stat-progress-bar" style="width: ${Math.min(stats.recordRate || 0, 100)}%"></div>
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- 效率分布饼图 -->
                ${stats.completedEvents > 0 ? `
                <div class="stat-card stat-card-chart">
                    <div class="stat-content">
                        <h3>效率分布</h3>
                        <div class="chart-container">
                            <canvas id="efficiency-chart"></canvas>
                        </div>
                        <div class="chart-legend">
                            <div class="legend-item">
                                <span class="legend-color" style="background: #48bb78"></span>
                                <span>高效</span>
                            </div>
                            <div class="legend-item">
                                <span class="legend-color" style="background: #ed8936"></span>
                                <span>中效</span>
                            </div>
                            <div class="legend-item">
                                <span class="legend-color" style="background: #a0aec0"></span>
                                <span>低效</span>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- 类型分布和月度得分 -->
                ${stats.typeDistribution && stats.typeDistribution.length > 0 ? `
                <div class="stat-card stat-card-chart ${stats.month && stats.dailyScores && stats.dailyScores.length > 0 ? 'stat-card-with-scores' : ''}">
                    <div class="stat-content">
                        <h3>类型分布</h3>
                        <div class="chart-container">
                            <canvas id="type-chart"></canvas>
                        </div>
                        <div class="chart-legend">
                            ${stats.typeDistribution.map(type => `
                                <div class="legend-item">
                                    <span class="legend-color" style="background: ${type.typeColor}"></span>
                                    <span>${type.typeName}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- 月度得分表 (放在类型分布右侧) -->
                ${stats.month && stats.dailyScores && stats.dailyScores.length > 0 ? `
                <div class="stat-card stat-card-chart stat-card-scores">
                    <div class="stat-content">
                        <h3>每日得分</h3>
                        <div class="daily-scores-table">
                            ${renderDailyScoresTable(stats.dailyScores, stats.year, stats.month)}
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
        
        statsContainer.innerHTML = html;
        
        // 绘制饼图
        setTimeout(() => {
            if (stats.completedEvents > 0) {
                drawPieChart('efficiency-chart', [
                    { label: '高效', value: stats.efficiency?.high || 0, color: '#48bb78' },
                    { label: '中效', value: stats.efficiency?.medium || 0, color: '#ed8936' },
                    { label: '低效', value: stats.efficiency?.low || 0, color: '#a0aec0' }
                ]);
            }
            
            if (stats.typeDistribution && stats.typeDistribution.length > 0) {
                drawPieChart('type-chart', stats.typeDistribution.map(type => ({
                    label: type.typeName,
                    value: type.count,
                    color: type.typeColor
                })));
            }
        }, 100);
    };

    const renderDailyScoresTable = (dailyScores, year, month) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const scoreMap = new Map(dailyScores.map(s => [s.day, s.score]));
        
        let html = '<div class="scores-grid">';
        for (let day = 1; day <= daysInMonth; day++) {
            const score = scoreMap.get(day) || 0;
            const scoreClass = score > 0 ? 'positive' : score < 0 ? 'negative' : 'zero';
            html += `
                <div class="score-cell ${scoreClass}">
                    <div class="score-day">${day}</div>
                    <div class="score-value">${score}</div>
                </div>
            `;
        }
        html += '</div>';
        return html;
    };

    const drawPieChart = (canvasId, data) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.parentElement.clientWidth;
        const height = 240;
        canvas.width = width;
        canvas.height = height;
        
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 20;
        
        // 过滤掉值为0的数据
        const validData = data.filter(d => d.value > 0);
        const total = validData.reduce((sum, d) => sum + d.value, 0);
        
        if (total === 0) return;
        
        let startAngle = -Math.PI / 2;
        
        validData.forEach(item => {
            const sliceAngle = (item.value / total) * 2 * Math.PI;
            const percentage = Math.round((item.value / total) * 100);
            
            // 绘制扇形
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = item.color;
            ctx.fill();
            
            // 绘制边框
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // 在扇形中间绘制文字(只有比例大于5%才显示)
            if (percentage >= 5) {
                const middleAngle = startAngle + sliceAngle / 2;
                const textRadius = radius * 0.7;
                const textX = centerX + Math.cos(middleAngle) * textRadius;
                const textY = centerY + Math.sin(middleAngle) * textRadius;
                
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 3;
                ctx.fillText(`${item.value}`, textX, textY - 8);
                ctx.fillText(`${percentage}%`, textX, textY + 8);
                ctx.shadowBlur = 0;
            }
            
            startAngle += sliceAngle;
        });
    };

    const getPercentage = (value, total) => {
        if (!total || total === 0) return 0;
        return Math.round((value || 0) / total * 100);
    };

    // 初始化统计页面
    if (statsYearSelect && statsMonthSelect) {
        initYearSelect();
        initMonthSelect();
        
        // 监听筛选器变化 - 强制刷新数据
        statsYearSelect.addEventListener('change', () => loadStats(true));
        statsMonthSelect.addEventListener('change', () => loadStats(true));
    }

    // 监听事件变化,清除缓存并自动刷新统计数据
    document.addEventListener('events:changed', () => {
        const statsPage = document.getElementById('page-stats');
        if (statsPage && statsPage.classList.contains('active')) {
            // 清除所有缓存
            statsCache = {};
            loadStats(true);
        } else {
            // 即使不在统计页面,也清除缓存,确保下次打开时数据是最新的
            statsCache = {};
        }
    });
}); // DOMContentLoaded 事件绑定结束
