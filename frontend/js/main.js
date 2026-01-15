document.addEventListener('DOMContentLoaded', () => { // 监听页面加载完成事件
    const apiUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
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
    const planningTabButtons = document.querySelectorAll('.planning-tab-btn');
    const planningTabPanels = document.querySelectorAll('.planning-tab-panel');
    const planAccordion = document.getElementById('plan-accordion');
    const planningLoadingEl = document.getElementById('planning-loading');
    const goalExecutionList = document.getElementById('goal-execution-list');
    const openPlanModalButton = document.getElementById('open-plan-modal');
    const planModalElement = document.getElementById('plan-modal');
    const planModalCloseButton = document.getElementById('plan-modal-close');
    const planModalCancelButton = document.getElementById('plan-modal-cancel');
    const planForm = document.getElementById('plan-form');
    const planTitleInput = document.getElementById('plan-title');
    const planDescriptionInput = document.getElementById('plan-description');
    const planYearSelect = document.getElementById('plan-year');
    const planModalRemaining = document.getElementById('plan-modal-remaining');
    const planTotalValueEl = document.getElementById('plan-total-value');
    const planModalError = document.getElementById('plan-modal-error');
    const planGoalsContainer = document.getElementById('plan-goals-container');
    const addGoalRowButton = document.getElementById('add-goal-row');
    const planGoalTemplate = document.getElementById('plan-goal-row-template');
    const planSubmitButton = document.getElementById('plan-submit-button');
    const planModalContent = planModalElement ? planModalElement.querySelector('.plan-modal-content') : null;
    const planModalTitleEl = document.getElementById('plan-modal-title');
    const planModalDescriptionEl = document.getElementById('plan-modal-description');
    const defaultPlanModalTitle = planModalTitleEl ? planModalTitleEl.textContent : '添加年度规划';
    const defaultPlanModalDescription = planModalDescriptionEl ? planModalDescriptionEl.textContent : '';
    let ideasCache = []; // 定义灵感缓存数组便于后续查找
    let planDataCache = []; // 年度规划缓存
    let currentRemainingScore = 100;
    let editingPlanId = null;
    let editingPlanOriginalScore = 0;
    let convertIdeaContext = null; // 定义当前正在转换的灵感上下文
    let editingTypeId = null; // 当前正在编辑的类型ID
    let planningDataLoaded = false;
    const defaultPlanYear = new Date().getFullYear();

    const normalizeId = (value) => {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value);
    };

    const buildPlanYearOptions = (focusYear = defaultPlanYear) => {
        if (!planYearSelect) return;
        const now = new Date().getFullYear();
        const normalizedFocus = Number.isFinite(focusYear) ? focusYear : defaultPlanYear;
        const startYear = Math.min(normalizedFocus - 1, now - 1);
        const endYear = Math.max(normalizedFocus + 5, now + 5);
        const options = ['<option value="">请选择年份</option>'];
        for (let year = startYear; year <= endYear; year += 1) {
            options.push(`<option value="${year}">${year} 年</option>`);
        }
        planYearSelect.innerHTML = options.join('');
    };

    const setPlanModalYear = (year = defaultPlanYear) => {
        if (!planYearSelect) return;
        buildPlanYearOptions(year);
        const normalized = Number.isFinite(year) ? year : defaultPlanYear;
        planYearSelect.value = String(normalized);
    };

    const getPlanModalYearValue = () => {
        if (!planYearSelect) return null;
        const parsed = parseInt(planYearSelect.value, 10);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
        return null;
    };

    if (planYearSelect) {
        setPlanModalYear(defaultPlanYear);
    }

    const EXECUTION_QUEUE_STORAGE_KEY = 'dailyManagement.goalExecutionQueue';

    const queueKey = (planId, goalId) => `${normalizeId(planId)}::${normalizeId(goalId)}`;

    const loadExecutionQueue = () => {
        if (typeof localStorage === 'undefined') {
            return [];
        }
        try {
            const stored = localStorage.getItem(EXECUTION_QUEUE_STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .map((entry) => {
                    const planId = normalizeId(entry.planId);
                    const goalId = normalizeId(entry.goalId);
                    if (!planId || !goalId) {
                        return null;
                    }
                    return { planId, goalId };
                })
                .filter(Boolean);
        } catch (error) {
            console.warn('[Planning] Failed to parse execution queue from storage:', error);
            return [];
        }
    };

    const persistExecutionQueue = (nextQueue) => {
        const normalizedQueue = nextQueue
            .map((entry) => {
                const planId = normalizeId(entry.planId);
                const goalId = normalizeId(entry.goalId);
                if (!planId || !goalId) {
                    return null;
                }
                return { planId, goalId };
            })
            .filter(Boolean);
        goalExecutionQueue = normalizedQueue;
        goalExecutionQueueSet = new Set(normalizedQueue.map((entry) => queueKey(entry.planId, entry.goalId)));
        if (typeof localStorage === 'undefined') {
            return;
        }
        try {
            localStorage.setItem(EXECUTION_QUEUE_STORAGE_KEY, JSON.stringify(normalizedQueue));
        } catch (error) {
            console.warn('[Planning] Failed to persist execution queue:', error);
        }
    };

    let goalExecutionQueue = loadExecutionQueue();
    let goalExecutionQueueSet = new Set(goalExecutionQueue.map((entry) => queueKey(entry.planId, entry.goalId)));

    const isGoalQueued = (planId, goalId) => goalExecutionQueueSet.has(queueKey(planId, goalId));

    const pruneExecutionQueue = (validEntries) => {
        if (validEntries.length === goalExecutionQueue.length) {
            return;
        }
        persistExecutionQueue(validEntries);
    };

    const addGoalToExecutionQueue = (planId, goalId) => {
        const normalizedPlanId = normalizeId(planId);
        const normalizedGoalId = normalizeId(goalId);
        if (!normalizedPlanId || !normalizedGoalId) return false;
        if (isGoalQueued(normalizedPlanId, normalizedGoalId)) return false;
        const nextQueue = [...goalExecutionQueue, { planId: normalizedPlanId, goalId: normalizedGoalId }];
        persistExecutionQueue(nextQueue);
        renderPlanAccordion(planDataCache);
        renderGoalExecutionBoard(planDataCache);
        return true;
    };

    const removeGoalFromExecutionQueue = (planId, goalId) => {
        const normalizedPlanId = normalizeId(planId);
        const normalizedGoalId = normalizeId(goalId);
        if (!normalizedPlanId || !normalizedGoalId) return false;
        if (!isGoalQueued(normalizedPlanId, normalizedGoalId)) return false;
        const nextQueue = goalExecutionQueue.filter((entry) => entry.planId !== normalizedPlanId || entry.goalId !== normalizedGoalId);
        persistExecutionQueue(nextQueue);
        renderPlanAccordion(planDataCache);
        renderGoalExecutionBoard(planDataCache);
        return true;
    };

    const TASK_STATUS_STORAGE_KEY = 'dailyManagement.goalTaskStatuses';
    const allowedTaskStatuses = ['backlog', 'todo', 'doing', 'done'];

    const normalizeTaskStatus = (value) => (allowedTaskStatuses.includes(value) ? value : 'backlog');

    const taskKey = (planId, goalId, taskId) => `${normalizeId(planId)}::${normalizeId(goalId)}::${normalizeId(taskId)}`;

    const loadTaskStatusMap = () => {
        if (typeof localStorage === 'undefined') {
            return {};
        }
        try {
            const stored = localStorage.getItem(TASK_STATUS_STORAGE_KEY);
            if (!stored) return {};
            const parsed = JSON.parse(stored);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch (error) {
            console.warn('[Planning] Failed to parse task-status cache:', error);
            return {};
        }
    };

    const persistTaskStatusMap = () => {
        if (typeof localStorage === 'undefined') {
            return;
        }
        try {
            localStorage.setItem(TASK_STATUS_STORAGE_KEY, JSON.stringify(goalTaskStatusMap));
        } catch (error) {
            console.warn('[Planning] Failed to persist task-status cache:', error);
        }
    };

    let goalTaskStatusMap = loadTaskStatusMap();

    const getTaskStatus = (planId, goalId, taskId) => normalizeTaskStatus(goalTaskStatusMap[taskKey(planId, goalId, taskId)]);

    const setTaskStatus = (planId, goalId, taskId, status) => {
        const normalizedPlanId = normalizeId(planId);
        const normalizedGoalId = normalizeId(goalId);
        const normalizedTaskId = normalizeId(taskId);
        if (!normalizedPlanId || !normalizedGoalId || !normalizedTaskId) return false;
        const normalizedStatus = normalizeTaskStatus(status);
        const key = taskKey(normalizedPlanId, normalizedGoalId, normalizedTaskId);
        const previous = normalizeTaskStatus(goalTaskStatusMap[key]);
        if (previous === normalizedStatus) {
            return false;
        }
        goalTaskStatusMap[key] = normalizedStatus;
        persistTaskStatusMap();
        
        // 更新目标和规划的状态
        updateGoalAndPlanStatus(normalizedPlanId, normalizedGoalId);
        
        renderGoalExecutionBoard(planDataCache);
        return true;
    };

    const pruneTaskStatusMap = (validKeys) => {
        let mutated = false;
        Object.keys(goalTaskStatusMap).forEach((key) => {
            if (!validKeys.has(key)) {
                delete goalTaskStatusMap[key];
                mutated = true;
            }
        });
        if (mutated) {
            persistTaskStatusMap();
        }
    };

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

    const hasPlansApi = typeof window.plansApi !== 'undefined';

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
            // 使用 apiRequest 替代原生 fetch，虽然 health 接口可能不需要认证，但保持一致性
            // 注意：apiRequest 默认会抛出错误如果 status 不为 ok，所以这里不需要手动检查 response.ok
            await apiRequest('/health'); 
            apiStatusIndicator.textContent = '在线'; // 更新徽章文本提示在线
            apiStatusIndicator.className = 'health-status online'; // 添加在线样式
        } catch (error) { // 处理请求异常
            apiStatusIndicator.textContent = '离线'; // 更新徽章文本提示离线
            apiStatusIndicator.className = 'health-status offline'; // 添加离线样式
        } // try-catch 结构结束
    }; // 函数定义结束

    const planStatusLabels = {
        pending: '待开始',
        executing: '进行中',
        done: '已完成',
        draft: '草稿',
        active: '进行中',
        archived: '已归档'
    };

    const goalStatusLabels = {
        pending: '待开始',
        executing: '进行中',
        done: '已完成'
    };

    const toSafeNumber = (value, fallback = null) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const isPlanEditing = () => Boolean(editingPlanId);

    const getPlanModalCapacity = () => {
        const extra = isPlanEditing() ? editingPlanOriginalScore : 0;
        return Math.max(0, currentRemainingScore + extra);
    };

    const getPlanSubmitIdleText = () => (isPlanEditing() ? '保存修改' : '保存规划');

    const getGoalRows = () => {
        if (!planGoalsContainer) return [];
        return Array.from(planGoalsContainer.querySelectorAll('[data-goal-row]'));
    };

    const getGoalScoresTotal = () => {
        return getGoalRows().reduce((sum, row) => {
            const scoreInput = row.querySelector('.goal-score');
            const value = parseInt(scoreInput?.value, 10);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
    };

    const updatePlanTotalValue = (totalScore = 0) => {
        if (!planTotalValueEl) return;
        const safeValue = Math.max(0, Math.round(Number(totalScore) || 0));
        planTotalValueEl.textContent = `${safeValue} 分`;
        const overBudget = safeValue > getPlanModalCapacity();
        planTotalValueEl.classList.toggle('warn', overBudget);
    };

    const setPlanModalMode = (mode = 'create', planTitle = '') => {
        const isEditingMode = mode === 'edit';
        if (planModalTitleEl) {
            planModalTitleEl.textContent = isEditingMode ? '编辑年度规划' : defaultPlanModalTitle;
        }
        if (planModalDescriptionEl) {
            if (isEditingMode) {
                const safeTitle = (planTitle || '').trim();
                planModalDescriptionEl.textContent = safeTitle
                    ? `正在调整「${safeTitle}」，请保持 100 分预算合理分配。`
                    : '调整当前规划，保持 100 分预算合理分配。';
            } else {
                planModalDescriptionEl.textContent = defaultPlanModalDescription;
            }
        }
        if (planSubmitButton && planSubmitButton.dataset.loading !== 'true') {
            planSubmitButton.textContent = getPlanSubmitIdleText();
        }
    };

    const resetPlanModalState = () => {
        editingPlanId = null;
        editingPlanOriginalScore = 0;
        setPlanModalMode('create');
        updatePlanTotalValue(0);
    };

    const updatePlanModalRemainingDisplay = (currentTotal = 0) => {
        if (!planModalRemaining) return;
        const capacity = getPlanModalCapacity();
        const normalized = Number.isFinite(currentTotal) ? Math.max(0, Math.round(currentTotal)) : 0;
        if (capacity <= 0) {
            planModalRemaining.textContent = isPlanEditing() ? '该规划暂无可用积分' : '暂无可用积分';
            planModalRemaining.classList.add('warn');
            return;
        }
        const remainingAfter = capacity - normalized;
        if (remainingAfter < 0) {
            const prefixOver = isPlanEditing() ? '可用' : '剩余';
            planModalRemaining.textContent = `${prefixOver} ${capacity} 分，已超出 ${Math.abs(remainingAfter)} 分`;
            planModalRemaining.classList.add('warn');
            return;
        }
        const prefix = isPlanEditing() ? '可用' : '剩余';
        const suffix = normalized > 0 ? `→ 保存后 ${remainingAfter} 分` : '';
        planModalRemaining.textContent = `${prefix} ${capacity} 分 ${suffix}`.trim();
        planModalRemaining.classList.toggle('warn', normalized > 0 && remainingAfter === 0);
    };

    const refreshPlanScoreSummary = () => {
        const total = getGoalScoresTotal();
        updatePlanTotalValue(total);
        updatePlanModalRemainingDisplay(total);
    };

    const updatePlanCreateAvailability = () => {
        const apiUnavailable = !hasPlansApi;
        const noScoreLeft = currentRemainingScore <= 0;
        if (openPlanModalButton) {
            openPlanModalButton.disabled = apiUnavailable || noScoreLeft;
            if (apiUnavailable) {
                openPlanModalButton.textContent = '功能不可用';
                openPlanModalButton.title = '未加载年度规划 API';
            } else if (noScoreLeft) {
                openPlanModalButton.textContent = '积分已用完';
                openPlanModalButton.title = '100 分预算已用完';
            } else {
                openPlanModalButton.textContent = '+ 添加规划';
                openPlanModalButton.title = '';
            }
        }
        const formDisabled = apiUnavailable || (noScoreLeft && !isPlanEditing());
        const capacity = getPlanModalCapacity();
        if (planSubmitButton && planSubmitButton.dataset.loading !== 'true') {
            planSubmitButton.disabled = formDisabled;
        }
        if (addGoalRowButton) {
            addGoalRowButton.disabled = formDisabled;
        }
    };

    const setRemainingScore = (value = 100) => {
        const parsed = toSafeNumber(value, 100);
        const safeValue = Math.max(0, Math.round(parsed));
        currentRemainingScore = safeValue;
        refreshPlanScoreSummary();
        updatePlanCreateAvailability();
    };
    updatePlanCreateAvailability();

    const setPlanningLoading = (isLoading) => {
        if (!planningLoadingEl) return;
        planningLoadingEl.classList.toggle('hidden', !isLoading);
    };

    const attachPlanToggleHandlers = () => {
        if (!planAccordion) return;
        const toggles = planAccordion.querySelectorAll('.plan-toggle');
        toggles.forEach((toggle) => {
            toggle.addEventListener('click', () => {
                const parent = toggle.closest('.plan-item');
                if (!parent) return;
                const expanded = parent.getAttribute('data-expanded') === 'true';
                parent.setAttribute('data-expanded', (!expanded).toString());
                toggle.setAttribute('aria-expanded', (!expanded).toString());
            });
        });
    };

    const persistGoalOrder = async (planId, orderedIds) => {
        if (!hasPlansApi || !planId || !Array.isArray(orderedIds) || !orderedIds.length) {
            return;
        }
        try {
            const payload = await window.plansApi.reorderGoals(planId, orderedIds);
            if (payload?.plan) {
                const index = planDataCache.findIndex((plan) => normalizeId(plan.id) === normalizeId(planId));
                if (index >= 0) {
                    planDataCache.splice(index, 1, payload.plan);
                } else {
                    planDataCache = [payload.plan, ...planDataCache];
                }
                renderPlanAccordion(planDataCache);
                renderGoalExecutionBoard(planDataCache);
            }
        } catch (error) {
            console.error('[Planning] Failed to persist goal order', error);
            loadPlans(true);
        }
    };

    let draggedGoalInfo = null;

    const updateGoalOrderCache = (listElement) => {
        const planId = listElement?.dataset?.planId;
        if (!planId) return;
        const plan = findPlanById(planId);
        if (!plan || !Array.isArray(plan.goals)) return;
        const orderedIds = Array.from(listElement.querySelectorAll('[data-goal-id]'))
            .map((node) => node.dataset.goalId)
            .filter(Boolean);
        if (!orderedIds.length) return null;
        const orderMap = new Map();
        orderedIds.forEach((id, index) => {
            orderMap.set(String(id), index);
        });
        plan.goals.sort((a, b) => {
            const indexA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
            const indexB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
            return indexA - indexB;
        });
        return orderedIds;
    };

    const handleGoalDragStart = (event) => {
        const item = event.currentTarget;
        const list = item.closest('.plan-goal-list');
        if (!list) return;
        draggedGoalInfo = {
            element: item,
            planId: list.dataset.planId || null,
            list
        };
        item.classList.add('dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.dataset.goalId || '');
        }
    };

    const handleGoalDragEnd = (event) => {
        event.currentTarget.classList.remove('dragging');
        draggedGoalInfo = null;
    };

    const handleGoalDragOver = (event) => {
        if (!draggedGoalInfo) return;
        const list = event.currentTarget;
        if (list.dataset.planId !== draggedGoalInfo.planId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const targetItem = event.target.closest('[data-goal-id]');
        if (!targetItem) {
            list.appendChild(draggedGoalInfo.element);
            return;
        }
        if (targetItem === draggedGoalInfo.element) return;
        const bounding = targetItem.getBoundingClientRect();
        const shouldInsertBefore = event.clientY < bounding.top + bounding.height / 2;
        const referenceNode = shouldInsertBefore ? targetItem : targetItem.nextSibling;
        list.insertBefore(draggedGoalInfo.element, referenceNode);
    };

    const handleGoalDrop = (event) => {
        if (!draggedGoalInfo) return;
        const list = event.currentTarget;
        if (list.dataset.planId !== draggedGoalInfo.planId) return;
        event.preventDefault();
        draggedGoalInfo.element.classList.remove('dragging');
        const orderedIds = updateGoalOrderCache(list);
        draggedGoalInfo = null;
        if (orderedIds && orderedIds.length) {
            persistGoalOrder(list.dataset.planId, orderedIds);
        }
    };

    const enableGoalDragAndDrop = () => {
        if (!planAccordion) return;
        const lists = planAccordion.querySelectorAll('.plan-goal-list');
        lists.forEach((list) => {
            list.removeEventListener('dragover', handleGoalDragOver);
            list.removeEventListener('drop', handleGoalDrop);
            list.addEventListener('dragover', handleGoalDragOver);
            list.addEventListener('drop', handleGoalDrop);
            const items = list.querySelectorAll('[data-goal-id]');
            items.forEach((item) => {
                item.removeEventListener('dragstart', handleGoalDragStart);
                item.removeEventListener('dragend', handleGoalDragEnd);
                item.addEventListener('dragstart', handleGoalDragStart);
                item.addEventListener('dragend', handleGoalDragEnd);
            });
        });
    };

    let executionTaskRegistry = new Map();

    const registerExecutionTaskMeta = (entries) => {
        executionTaskRegistry = new Map(
            entries.map((entry) => [taskKey(entry.planId, entry.goalId, entry.taskId), entry])
        );
    };

    const getExecutionTaskMeta = (planId, goalId, taskId) => executionTaskRegistry.get(taskKey(planId, goalId, taskId));

    let draggedTaskCard = null;
    const expandedGoalCards = new Set(); // 存储展开的目标卡片ID

    const executionColumns = [
        { key: 'backlog', title: '目标列表', icon: '🗂️' },
        { key: 'todo', title: '待开始', icon: '🕒' },
        { key: 'doing', title: '进行中', icon: '⚡' },
        { key: 'done', title: '已完成', icon: '✅' }
    ];

    const executionColumnPlaceholders = {
        backlog: '点击年度规划里的“追踪”按钮，把目标加入执行列表。',
        todo: '将任务拖到这里，准备启动。',
        doing: '放入此列并完善事件，日历将同步。',
        done: '完成的任务拖到这里即可归档。'
    };

    const extractGoalTasks = (details) => {
        if (!details) return [];
        return details
            .split(/\r?\n+/)
            .map((line) => line.replace(/^[\s•·\-]+/, '').trim())
            .filter(Boolean);
    };

    // 计算目标的状态：根据其任务的状态
    const calculateGoalStatus = (planId, goalId, goalDetails) => {
        const normalizedPlanId = normalizeId(planId);
        const normalizedGoalId = normalizeId(goalId);
        const tasks = extractGoalTasks(goalDetails);
        if (!tasks.length) return 'pending';
        
        const taskStatuses = tasks.map((task, index) => {
            const taskId = `${normalizedGoalId || 'goal'}-${index}`;
            return getTaskStatus(normalizedPlanId, normalizedGoalId, taskId);
        });
        
        // 所有任务都完成
        const allDone = taskStatuses.every(s => s === 'done');
        if (allDone) return 'done';
        
        // 只要有任务在doing状态，就算进行中
        const anyDoing = taskStatuses.some(s => s === 'doing');
        if (anyDoing) return 'executing';
        
        // 有任务已完成，其余任务待开始或进行中时，状态为进行中
        const someDone = taskStatuses.some(s => s === 'done');
        if (someDone) return 'executing';
        
        return 'pending';
    };

    // 计算规划的状态：根据其目标的状态
    const calculatePlanStatus = (plan) => {
        if (!plan.goals || !plan.goals.length) return 'pending';
        
        const goalStatuses = plan.goals.map(goal => goal.status || 'pending');
        
        // 所有目标都完成
        const allDone = goalStatuses.every(s => s === 'done');
        if (allDone) return 'done';
        
        // 任意一个目标进行中
        const anyExecuting = goalStatuses.some(s => s === 'executing');
        if (anyExecuting) return 'executing';
        
        // 有目标已完成，其余目标待开始或进行中时，状态为进行中
        const someDone = goalStatuses.some(s => s === 'done');
        if (someDone) return 'executing';
        
        // 全部是待开始
        return 'pending';
    };

    // 将目标状态映射为规划状态(数据库字段不同)
    const mapGoalStatusToPlanStatus = (goalStatus) => {
        // 目标状态: pending, executing, done
        // 规划状态: draft, active, archived
        switch (goalStatus) {
            case 'done':
                return 'archived';  // 全部完成 -> 已归档
            case 'executing':
                return 'active';    // 进行中 -> 活跃
            case 'pending':
            default:
                return 'active';    // 待开始但已创建 -> 活跃(不是草稿)
        }
    };

    // 更新目标和规划的状态
    const updateGoalAndPlanStatus = async (planId, goalId) => {
        const normalizedPlanId = normalizeId(planId);
        const normalizedGoalId = normalizeId(goalId);
        if (!normalizedPlanId || !normalizedGoalId) return;

        const plan = planDataCache.find((p) => normalizeId(p.id) === normalizedPlanId);
        if (!plan || !plan.goals) return;
        
        const goal = plan.goals.find((g) => normalizeId(g.id) === normalizedGoalId);
        if (!goal) return;
        
        // 计算新的目标状态
        const newGoalStatus = calculateGoalStatus(plan.id, goal.id, goal.details);
        const goalStatusChanged = goal.status !== newGoalStatus;
        
        if (goalStatusChanged) {
            goal.status = newGoalStatus;
            
            // 计算新的规划状态(基于目标状态)
            const calculatedStatus = calculatePlanStatus(plan);
            // 映射为数据库中的规划状态值
            const newPlanStatus = mapGoalStatusToPlanStatus(calculatedStatus);
            const planStatusChanged = plan.status !== newPlanStatus;
            
            if (planStatusChanged) {
                plan.status = newPlanStatus;
            }
            
            // 保存到后端
            try {
                const payload = {
                    title: plan.title,
                    year: plan.year,
                    goals: plan.goals.map(g => ({
                        id: g.id,
                        name: g.name,
                        expected_timeframe: g.expected_timeframe,
                        score_allocation: g.score_allocation,
                        details: g.details,
                        status: g.status
                    })),
                    status: newPlanStatus  // 使用映射后的状态值
                };
                
                await apiRequest(`/api/plans/${plan.id}`, 'PUT', payload);
                
                // 更新缓存
                const index = planDataCache.findIndex(p => p.id === planId);
                if (index !== -1) {
                    planDataCache[index] = { ...plan };
                }
                
                // 重新渲染年度规划列表
                renderPlanAccordion(planDataCache);
            } catch (error) {
                console.error('[状态更新] 保存失败:', error);
            }
        }
    };

    const buildExecutionGoalCards = (plans = []) => {
        const emptyState = {
            cards: [],
            tasksByStatus: {
                backlog: [],
                todo: [],
                doing: [],
                done: []
            }
        };

        if (!Array.isArray(plans) || !plans.length) {
            registerExecutionTaskMeta([]);
            pruneExecutionQueue([]);
            pruneTaskStatusMap(new Set());
            return emptyState;
        }

        const planMap = new Map(plans.map((plan) => [normalizeId(plan.id), plan]));
        const cards = [];
        const tasksByStatus = {
            backlog: [],
            todo: [],
            doing: [],
            done: []
        };
        const validEntries = [];
        const validTaskKeys = new Set();
        const taskMetaEntries = [];

        goalExecutionQueue.forEach((entry) => {
            const entryPlanId = normalizeId(entry.planId);
            const entryGoalId = normalizeId(entry.goalId);
            if (!entryPlanId || !entryGoalId) {
                return;
            }
            const plan = planMap.get(entryPlanId);
            if (!plan || !Array.isArray(plan.goals)) {
                return;
            }
            const goal = plan.goals.find((candidate) => normalizeId(candidate.id) === entryGoalId);
            if (!goal) {
                return;
            }
            const normalizedPlanId = normalizeId(plan.id);
            const normalizedGoalId = normalizeId(goal.id);
            validEntries.push({ planId: normalizedPlanId, goalId: normalizedGoalId });
            const taskMetas = extractGoalTasks(goal.details).map((content, index) => {
                const taskId = `${normalizedGoalId || 'goal'}-${index}`;
                const key = taskKey(normalizedPlanId, normalizedGoalId, taskId);
                validTaskKeys.add(key);
                const status = getTaskStatus(normalizedPlanId, normalizedGoalId, taskId);
                const meta = {
                    planId: normalizedPlanId,
                    planTitle: plan.title || '未命名规划',
                    goalId: normalizedGoalId,
                    goalName: goal.name || '未命名目标',
                    taskId,
                    content,
                    status
                };
                tasksByStatus[status] = tasksByStatus[status] || [];
                tasksByStatus[status].push(meta);
                taskMetaEntries.push(meta);
                return meta;
            });
            
            // 重新计算目标状态
            const calculatedGoalStatus = calculateGoalStatus(plan.id, goal.id, goal.details);
            if (goal.status !== calculatedGoalStatus) {
                goal.status = calculatedGoalStatus;
            }

            cards.push({
                planId: normalizedPlanId,
                planTitle: plan.title || '未命名规划',
                goalId: normalizedGoalId,
                name: goal.name || '未命名目标',
                timeframe: goal.expected_timeframe,
                score: goal.score_allocation || 0,
                status: calculatedGoalStatus,
                tasks: taskMetas
            });
        });

        pruneExecutionQueue(validEntries);
        pruneTaskStatusMap(validTaskKeys);
        registerExecutionTaskMeta(taskMetaEntries);

        return { cards, tasksByStatus };
    };

    const renderExecutionTaskCard = (task, { variant = 'board' } = {}) => {
        const showOrigin = variant !== 'backlog';
        const origin = showOrigin
            ? `<p class="task-origin">${task.planTitle} · ${task.goalName}</p>`
            : '';
        const extraClass = variant === 'backlog' ? ' compact' : '';
        return `
            <div class="execution-task-card${extraClass}" draggable="true" data-plan-id="${task.planId}" data-goal-id="${task.goalId}" data-task-id="${task.taskId}" data-status="${task.status}">
                ${origin}
                <p class="task-content">${task.content}</p>
            </div>
        `;
    };

    const renderExecutionGoalCard = (card) => {
        const hasTasks = card.tasks.length > 0;
        const backlogTasks = card.tasks.filter((task) => task.status === 'backlog');
        const timeframeChip = card.timeframe ? `<span class="execution-chip">预计 ${card.timeframe}</span>` : '';
        const tasksHtml = hasTasks
            ? `<div class="execution-goal-tasks" hidden>
                    ${backlogTasks.length
                        ? backlogTasks.map((task) => renderExecutionTaskCard(task, { variant: 'backlog' })).join('')
                        : '<div class="execution-task-placeholder">拖拽任务返回此处，回到目标列表。</div>'}
                </div>`
            : '';
        return `
            <div class="execution-goal-card${hasTasks ? ' has-tasks' : ''}" data-plan-id="${card.planId}" data-goal-id="${card.goalId}" data-has-tasks="${hasTasks}">
                <div class="execution-goal-head">
                    <div>
                        <p class="execution-goal-name">${card.name}</p>
                        <p class="execution-goal-plan">所属规划：${card.planTitle}</p>
                    </div>
                    <span class="goal-status-pill ${card.status}">${goalStatusLabels[card.status] || card.status || '待开始'}</span>
                </div>
                <div class="execution-goal-meta">
                    ${timeframeChip}
                </div>
                ${tasksHtml}
            </div>
        `;
    };

    const renderTaskColumnBody = (columnKey, tasks) => {
        if (!tasks.length) {
            return `<div class="execution-column-empty">${executionColumnPlaceholders[columnKey]}</div>`;
        }
        return tasks.map((task) => renderExecutionTaskCard(task, { variant: 'board' })).join('');
    };

    const renderGoalExecutionBoard = (plans = []) => {
        if (!goalExecutionList) return;
        
        // 在重新渲染前，保存当前展开的卡片状态
        const currentExpandedCards = goalExecutionList.querySelectorAll('.execution-goal-card.expanded');
        currentExpandedCards.forEach(card => {
            const goalId = card.dataset.goalId;
            if (goalId) {
                expandedGoalCards.add(goalId);
            }
        });
        
        const { cards, tasksByStatus } = buildExecutionGoalCards(plans);
        const backlogBody = cards.length
            ? cards.map((card) => renderExecutionGoalCard(card)).join('')
            : `<div class="execution-column-empty">${executionColumnPlaceholders.backlog}</div>`;

        const boardHtml = executionColumns.map((column) => {
            const bodyContent = column.key === 'backlog'
                ? backlogBody
                : renderTaskColumnBody(column.key, tasksByStatus[column.key]);
            return `
                <div class="execution-column" data-column="${column.key}">
                    <div class="execution-column-header">
                        <h3>${column.icon} ${column.title}</h3>
                    </div>
                    <div class="execution-column-body" data-drop-column="${column.key}">
                        ${bodyContent}
                    </div>
                </div>
            `;
        }).join('');

        goalExecutionList.innerHTML = boardHtml;
        
        // 恢复之前展开的卡片状态
        requestAnimationFrame(() => {
            expandedGoalCards.forEach(goalId => {
                const card = goalExecutionList.querySelector(`.execution-goal-card[data-goal-id="${goalId}"]`);
                if (card && card.dataset.hasTasks === 'true') {
                    const tasksContainer = card.querySelector('.execution-goal-tasks');
                    if (tasksContainer) {
                        tasksContainer.hidden = false;
                        card.classList.add('expanded');
                    }
                }
            });
        });
        
        attachExecutionBoardDnDHandlers();
    };

    const handleTaskDragStart = (event) => {
        const card = event.currentTarget;
        const planId = card.dataset.planId;
        const goalId = card.dataset.goalId;
        const taskId = card.dataset.taskId;
        if (!planId || !goalId || !taskId) return;
        draggedTaskCard = { 
            planId, 
            goalId, 
            taskId, 
            status: card.dataset.status || 'backlog',
            previousStatus: card.dataset.status || 'backlog'
        };
        card.classList.add('dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', taskId);
        }
    };

    const handleTaskDragEnd = (event) => {
        event.currentTarget.classList.remove('dragging');
        draggedTaskCard = null;
    };

    const handleColumnDragOver = (event) => {
        if (!draggedTaskCard) return;
        const columnKey = event.currentTarget?.dataset?.dropColumn;
        if (!['todo', 'doing', 'done'].includes(columnKey)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        event.currentTarget.classList.add('drop-hover');
    };

    const handleColumnDragLeave = (event) => {
        event.currentTarget.classList.remove('drop-hover');
    };

    const openTaskEventModal = async (taskMeta, onSuccess, onCancel) => {
        if (!taskMeta || !window.eventManager) return;
        try {
            await ensureEventTypesLoaded();
        } catch (error) {
            console.warn('[Planning] 事件类型加载失败，无法打开事件弹窗:', error);
        }
        const title = `${taskMeta.goalName} · ${taskMeta.content}`.slice(0, 60);
        const defaults = {
            title,
            remark: `来源：${taskMeta.planTitle} / ${taskMeta.goalName}\n任务：${taskMeta.content}`,
            date: new Date()
        };
        
        // 保存原始回调
        const originalOnEventsChanged = window.eventManager.onEventsChanged;
        const originalCloseModal = window.eventManager.closeModal.bind(window.eventManager);
        
        // 标记事件是否已保存
        let eventSaved = false;
        
        // 临时替换onEventsChanged回调
        window.eventManager.onEventsChanged = function() {
            eventSaved = true;
            if (originalOnEventsChanged) {
                originalOnEventsChanged.call(this);
            }
            if (onSuccess) {
                onSuccess();
            }
        };
        
        // 临时替换closeModal方法
        window.eventManager.closeModal = function() {
            originalCloseModal();
            
            // 恢复原始回调
            window.eventManager.onEventsChanged = originalOnEventsChanged;
            window.eventManager.closeModal = originalCloseModal;
            
            // 如果关闭时没有保存事件，调用取消回调
            if (!eventSaved && onCancel) {
                onCancel();
            }
        };
        
        window.eventManager.openForCreate(defaults);
    };

    const handleColumnDrop = (event) => {
        if (!draggedTaskCard) return;
        const columnKey = event.currentTarget?.dataset?.dropColumn;
        event.preventDefault();
        event.currentTarget.classList.remove('drop-hover');
        if (!['todo', 'doing', 'done'].includes(columnKey)) return;
        
        const taskMeta = getExecutionTaskMeta(draggedTaskCard.planId, draggedTaskCard.goalId, draggedTaskCard.taskId);
        const taskRef = { ...draggedTaskCard };
        if (columnKey === 'doing') {
            // 先弹窗，只有成功才移动
            openTaskEventModal(
                taskMeta,
                () => {
                    // 事件创建成功，移动任务
                    setTaskStatus(taskRef.planId, taskRef.goalId, taskRef.taskId, columnKey);
                },
                () => {
                    // 事件创建取消，不做任何变动
                }
            );
        } else {
            setTaskStatus(taskRef.planId, taskRef.goalId, taskRef.taskId, columnKey);
        }
        
        draggedTaskCard = null;
    };

    const handleGoalCardDragOver = (event) => {
        if (!draggedTaskCard) return;
        const card = event.currentTarget;
        if (card.dataset.goalId !== draggedTaskCard.goalId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        card.classList.add('drop-hover');
    };

    const handleGoalCardDragLeave = (event) => {
        event.currentTarget.classList.remove('drop-hover');
    };

    const handleGoalCardDrop = (event) => {
        if (!draggedTaskCard) return;
        const card = event.currentTarget;
        if (card.dataset.goalId !== draggedTaskCard.goalId) return;
        event.preventDefault();
        card.classList.remove('drop-hover');
        setTaskStatus(draggedTaskCard.planId, draggedTaskCard.goalId, draggedTaskCard.taskId, 'backlog');
        draggedTaskCard = null;
    };

    const handleGoalCardDblClick = (event) => {
        const card = event.currentTarget;
        
        console.log('[双击事件] 触发', {
            hasTasks: card.dataset.hasTasks,
            target: event.target.className,
            currentTarget: event.currentTarget.className
        });
        
        // 防止双击时触发拖拽事件和文本选择
        event.preventDefault();
        event.stopPropagation();
        
        if (card.dataset.hasTasks !== 'true') {
            console.log('[双击事件] 卡片没有任务，跳过');
            return;
        }
        
        const tasksContainer = card.querySelector('.execution-goal-tasks');
        if (!tasksContainer) {
            console.log('[双击事件] 未找到任务容器');
            return;
        }
        
        const goalId = card.dataset.goalId;
        // 修复逻辑：hidden为true表示隐藏（收起），false表示显示（展开）
        const isCurrentlyHidden = tasksContainer.hidden;
        const willBeVisible = isCurrentlyHidden; // 切换后的状态
        tasksContainer.hidden = !isCurrentlyHidden;
        card.classList.toggle('expanded', willBeVisible);
        
        // 更新展开状态集合
        if (willBeVisible) {
            expandedGoalCards.add(goalId);
        } else {
            expandedGoalCards.delete(goalId);
        }
        
        console.log('[双击事件] 切换状态', { 
            wasHidden: isCurrentlyHidden,
            nowVisible: willBeVisible,
            expandedCount: expandedGoalCards.size
        });
    };

    const attachExecutionBoardDnDHandlers = () => {
        if (!goalExecutionList) return;
        const taskCards = goalExecutionList.querySelectorAll('.execution-task-card[draggable="true"]');
        taskCards.forEach((card) => {
            card.removeEventListener('dragstart', handleTaskDragStart);
            card.removeEventListener('dragend', handleTaskDragEnd);
            card.addEventListener('dragstart', handleTaskDragStart);
            card.addEventListener('dragend', handleTaskDragEnd);
        });

        const columnBodies = goalExecutionList.querySelectorAll('.execution-column-body');
        columnBodies.forEach((body) => {
            body.removeEventListener('dragover', handleColumnDragOver);
            body.removeEventListener('dragleave', handleColumnDragLeave);
            body.removeEventListener('drop', handleColumnDrop);
            body.addEventListener('dragover', handleColumnDragOver);
            body.addEventListener('dragleave', handleColumnDragLeave);
            body.addEventListener('drop', handleColumnDrop);
        });

        const backlogCards = goalExecutionList.querySelectorAll('.execution-column[data-column="backlog"] .execution-goal-card');
        backlogCards.forEach((card) => {
            card.removeEventListener('dragover', handleGoalCardDragOver);
            card.removeEventListener('dragleave', handleGoalCardDragLeave);
            card.removeEventListener('drop', handleGoalCardDrop);
            card.removeEventListener('dblclick', handleGoalCardDblClick);
            card.addEventListener('dragover', handleGoalCardDragOver);
            card.addEventListener('dragleave', handleGoalCardDragLeave);
            card.addEventListener('drop', handleGoalCardDrop);
            card.addEventListener('dblclick', handleGoalCardDblClick);
        });
    };

    // 使用事件委托处理双击事件
    if (goalExecutionList) {
        goalExecutionList.removeEventListener('dblclick', handleGoalExecutionDblClick);
        goalExecutionList.addEventListener('dblclick', handleGoalExecutionDblClick);
    }

    function handleGoalExecutionDblClick(event) {
        const card = event.target.closest('.execution-goal-card');
        if (!card) return;
        
        console.log('[委托双击] 触发', {
            hasTasks: card.dataset.hasTasks,
            targetClass: event.target.className
        });
        
        handleGoalCardDblClick({ 
            currentTarget: card, 
            target: event.target,
            preventDefault: () => event.preventDefault(),
            stopPropagation: () => event.stopPropagation()
        });
    }

    const findPlanById = (planId) => {
        const normalizedPlanId = normalizeId(planId);
        if (!normalizedPlanId) return null;
        return planDataCache.find((plan) => normalizeId(plan.id) === normalizedPlanId) || null;
    };

    const handlePlanEdit = (planId) => {
        if (!planId) return;
        const targetPlan = findPlanById(planId);
        if (!targetPlan) {
            alert('未找到该规划，可能已被删除。');
            return;
        }
        openPlanModal(targetPlan);
    };

    const confirmDeletePlan = async (planId) => {
        if (!planId) return;
        if (!hasPlansApi) {
            alert('年度规划接口未加载，暂时无法删除。');
            return;
        }
        const plan = findPlanById(planId);
        const planLabel = plan?.title || '该规划';
        const confirmed = confirm(`确定删除「${planLabel}」？此操作不可撤销。`);
        if (!confirmed) return;
        try {
            await window.plansApi.remove(planId);
            await loadPlans(true);
        } catch (error) {
            const message = error?.payload?.error || error.message || '删除规划失败，请稍后再试。';
            alert(message);
        }
    };

    const handleGoalExecuteTrigger = (button) => {
        if (!button || button.disabled) return;
        const { planId, goalId } = button.dataset;
        if (!planId || !goalId) return;
        if (isGoalQueued(planId, goalId)) {
            removeGoalFromExecutionQueue(planId, goalId);
        } else {
            addGoalToExecutionQueue(planId, goalId);
        }
    };

    const syncGoalRemoveButtons = () => {
        if (!planGoalsContainer) return;
        const rows = planGoalsContainer.querySelectorAll('[data-goal-row]');
        rows.forEach((row) => {
            const removeBtn = row.querySelector('[data-remove-goal]');
            if (removeBtn) {
                removeBtn.disabled = rows.length === 1;
            }
        });
    };

    const addGoalRow = (goalData = null) => {
        if (!planGoalTemplate || !planGoalsContainer) return null;
        const fragment = planGoalTemplate.content.cloneNode(true);
        planGoalsContainer.appendChild(fragment);
        const rows = planGoalsContainer.querySelectorAll('[data-goal-row]');
        const newRow = rows[rows.length - 1] || null;
        if (newRow && goalData) {
            // 设置目标ID
            if (goalData.id) {
                newRow.dataset.goalId = goalData.id;
            }
            
            const nameInput = newRow.querySelector('.goal-name');
            const timeframeInput = newRow.querySelector('.goal-timeframe');
            const detailsInput = newRow.querySelector('.goal-details');
            const scoreInput = newRow.querySelector('.goal-score');
            if (nameInput) {
                nameInput.value = goalData.name || '';
            }
            if (timeframeInput) {
                timeframeInput.value = goalData.expected_timeframe || '';
            }
            if (detailsInput) {
                detailsInput.value = goalData.details || '';
            }
            if (scoreInput) {
                const scoreValue = Number(goalData.score_allocation || 0);
                scoreInput.value = scoreValue > 0 ? String(scoreValue) : '';
            }
        }
        syncGoalRemoveButtons();
        return newRow;
    };

    const hydrateGoalRows = (goals = []) => {
        if (!planGoalsContainer) return;
        planGoalsContainer.innerHTML = '';
        if (Array.isArray(goals) && goals.length) {
            goals.forEach((goal) => addGoalRow(goal));
        } else {
            addGoalRow();
        }
        refreshPlanScoreSummary();
    };

    const resetGoalRows = () => {
        hydrateGoalRows();
    };

    const clearPlanModalError = () => {
        if (!planModalError) return;
        planModalError.textContent = '';
        planModalError.classList.remove('visible');
    };

    const showPlanModalError = (message) => {
        if (!planModalError) {
            alert(message);
            return;
        }
        planModalError.textContent = message;
        planModalError.classList.add('visible');
    };

    const setPlanSubmitLoading = (isLoading) => {
        if (!planSubmitButton) return;
        planSubmitButton.dataset.loading = isLoading ? 'true' : 'false';
        planSubmitButton.disabled = isLoading;
        planSubmitButton.textContent = isLoading ? '保存中...' : getPlanSubmitIdleText();
        if (planModalContent) {
            planModalContent.classList.toggle('is-loading', isLoading);
        }
    };

    const closePlanModal = () => {
        if (!planModalElement) return;
        planModalElement.classList.add('hidden');
        planModalElement.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        resetPlanModalState();
        clearPlanModalError();
        if (planForm) {
            planForm.reset();
        }
        resetGoalRows();
        updatePlanTotalValue(0);
        updatePlanModalRemainingDisplay(0);
        setPlanModalYear(defaultPlanYear);
        setPlanSubmitLoading(false);
        updatePlanCreateAvailability();
    };

    const openPlanModal = (plan = null) => {
        if (!planModalElement) return;
        const editingMode = Boolean(plan);
        if (!hasPlansApi) {
            alert('年度规划接口未加载，暂时无法操作规划。');
            return;
        }
        if (!editingMode && currentRemainingScore <= 0) {
            alert('100 分预算已用完，暂时无法创建新的规划。');
            return;
        }

        editingPlanId = editingMode ? plan?.id || null : null;
        editingPlanOriginalScore = editingMode ? Number(plan?.score_allocation || 0) : 0;
        setPlanModalMode(editingMode ? 'edit' : 'create', plan?.title || '');

        if (planForm) {
            planForm.reset();
        }
        clearPlanModalError();

        if (planTitleInput) {
            planTitleInput.value = editingMode ? (plan?.title || '') : '';
        }
        if (planDescriptionInput) {
            planDescriptionInput.value = editingMode ? (plan?.description || '') : '';
        }
        if (editingMode && plan) {
            hydrateGoalRows(plan.goals || []);
        } else {
            resetGoalRows();
        }

        const targetYear = editingMode ? Number(plan?.year) || defaultPlanYear : defaultPlanYear;
        setPlanModalYear(targetYear);

        const currentAllocation = editingMode ? Number(plan?.score_allocation || 0) : 0;
        updatePlanTotalValue(currentAllocation);
        updatePlanModalRemainingDisplay(currentAllocation);
        planModalElement.classList.remove('hidden');
        planModalElement.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        updatePlanCreateAvailability();
        if (planTitleInput) {
            planTitleInput.focus();
        }
    };

    if (openPlanModalButton) {
        openPlanModalButton.addEventListener('click', () => {
            if (openPlanModalButton.disabled) return;
            openPlanModal();
        });
    }
    if (planModalCloseButton) {
        planModalCloseButton.addEventListener('click', closePlanModal);
    }
    if (planModalCancelButton) {
        planModalCancelButton.addEventListener('click', closePlanModal);
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && planModalElement && !planModalElement.classList.contains('hidden')) {
            closePlanModal();
        }
    });

    if (planAccordion) {
        planAccordion.addEventListener('click', (event) => {
            const editBtn = event.target.closest('.plan-edit-btn');
            if (editBtn) {
                event.preventDefault();
                event.stopPropagation();
                handlePlanEdit(editBtn.dataset.planId);
                return;
            }
            const deleteBtn = event.target.closest('.plan-delete-btn');
            if (deleteBtn) {
                event.preventDefault();
                event.stopPropagation();
                confirmDeletePlan(deleteBtn.dataset.planId);
                return;
            }
            const executeBtn = event.target.closest('.goal-execute-btn');
            if (executeBtn) {
                event.preventDefault();
                event.stopPropagation();
                handleGoalExecuteTrigger(executeBtn);
            }
        });
    }

    const handleGoalRemove = (event) => {
        if (!planGoalsContainer) return;
        const target = event.target.closest('[data-remove-goal]');
        if (!target) return;
        event.preventDefault();
        const row = target.closest('[data-goal-row]');
        if (row) {
            row.remove();
            if (!planGoalsContainer.querySelector('[data-goal-row]')) {
                addGoalRow();
            }
            syncGoalRemoveButtons();
            refreshPlanScoreSummary();
        }
    };

    if (planGoalsContainer) {
        planGoalsContainer.addEventListener('click', handleGoalRemove);
        planGoalsContainer.addEventListener('input', (event) => {
            const target = event.target;
            if (target && target.classList.contains('goal-score')) {
                handleGoalScoreInput();
            } else {
                clearPlanModalError();
            }
        });
    }
    if (addGoalRowButton) {
        addGoalRowButton.addEventListener('click', (event) => {
            event.preventDefault();
            const newRow = addGoalRow();
            if (newRow) {
                const goalNameInput = newRow.querySelector('.goal-name');
                if (goalNameInput) {
                    goalNameInput.focus();
                }
            }
            clearPlanModalError();
            refreshPlanScoreSummary();
        });
    }
    [planTitleInput, planDescriptionInput].forEach((input) => {
        if (input) {
            input.addEventListener('input', clearPlanModalError);
        }
    });

    const handleGoalScoreInput = () => {
        refreshPlanScoreSummary();
        clearPlanModalError();
    };

    if (planForm) {
        planForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const editingMode = isPlanEditing();
            if (!hasPlansApi) {
                showPlanModalError('年度规划接口未加载，暂时无法创建。');
                return;
            }
            if (!editingMode && currentRemainingScore <= 0) {
                showPlanModalError('100 分预算已用完，暂时无法创建新的规划。');
                return;
            }
            if (editingMode && !editingPlanId) {
                showPlanModalError('未找到需要编辑的规划，请重试。');
                return;
            }
            const title = planTitleInput?.value.trim() || '';
            if (!title) {
                showPlanModalError('请填写规划名称。');
                planTitleInput?.focus();
                return;
            }
            if (!planGoalsContainer) {
                showPlanModalError('请至少添加一个目标。');
                return;
            }
            const rows = getGoalRows();
            if (!rows.length) {
                showPlanModalError('请至少添加一个目标。');
                return;
            }
            const goals = [];
            let totalScore = 0;
            for (const row of rows) {
                const nameInput = row.querySelector('.goal-name');
                const timeframeInput = row.querySelector('.goal-timeframe');
                const detailsInput = row.querySelector('.goal-details');
                const scoreInput = row.querySelector('.goal-score');
                const name = nameInput?.value.trim() || '';
                if (!name) {
                    showPlanModalError('每个目标都需要名称。');
                    nameInput?.focus();
                    return;
                }
                const details = detailsInput?.value.trim() || '';
                if (!details) {
                    showPlanModalError('每个目标都需要填写详情。');
                    detailsInput?.focus();
                    return;
                }
                const goalScore = parseInt(scoreInput?.value, 10);
                if (!Number.isInteger(goalScore) || goalScore <= 0) {
                    showPlanModalError('请为每个目标设置 1-100 之间的分值。');
                    scoreInput?.focus();
                    return;
                }
                totalScore += goalScore;
                
                // 保留原有的目标ID和状态
                const goalId = row.dataset.goalId || null;
                const goal = {
                    name,
                    expected_timeframe: timeframeInput?.value.trim() || null,
                    details: details,
                    score_allocation: goalScore
                };
                
                if (goalId) {
                    goal.id = goalId;
                    
                    // 如果是编辑模式，直接从缓存保留原有状态
                    // 不要重新计算，因为任务ID可能因details改变而变化
                    if (editingMode && editingPlanId) {
                        const existingPlan = planDataCache.find((p) => normalizeId(p.id) === normalizeId(editingPlanId));
                        if (existingPlan && existingPlan.goals) {
                            const existingGoal = existingPlan.goals.find((g) => normalizeId(g.id) === normalizeId(goalId));
                            if (existingGoal && existingGoal.status) {
                                goal.status = existingGoal.status;
                            }
                        }
                    }
                }
                
                goals.push(goal);
            }

            if (totalScore <= 0) {
                showPlanModalError('请至少分配 1 分。');
                return;
            }

            const capacity = getPlanModalCapacity();
            if (totalScore > capacity) {
                showPlanModalError(`最多可用 ${capacity} 分，当前已分配 ${totalScore} 分。`);
                updatePlanModalRemainingDisplay(totalScore);
                return;
            }

            const selectedYear = getPlanModalYearValue() || defaultPlanYear;
            const payload = {
                title,
                description: planDescriptionInput?.value.trim() || null,
                year: selectedYear,
                goals
            };

            console.log('=== 保存规划 Debug ===');
            console.log('editingMode:', editingMode);
            console.log('editingPlanId:', editingPlanId);
            console.log('payload.goals:', JSON.stringify(payload.goals, null, 2));
            console.log('planDataCache:', planDataCache);

            try {
                clearPlanModalError();
                setPlanSubmitLoading(true);
                const result = editingMode
                    ? await window.plansApi.update(editingPlanId, payload)
                    : await window.plansApi.create(payload);
                
                console.log('=== 服务器返回 ===');
                console.log('result.plan:', result?.plan);
                
                if (result?.plan) {
                    if (editingMode) {
                        const targetIndex = planDataCache.findIndex((planItem) => normalizeId(planItem.id) === normalizeId(editingPlanId));
                        if (targetIndex >= 0) {
                            planDataCache.splice(targetIndex, 1, result.plan);
                        } else {
                            planDataCache = [result.plan, ...planDataCache];
                        }
                    } else {
                        planDataCache = [result.plan, ...planDataCache];
                    }
                    planningDataLoaded = true;
                }
                const nextRemaining = toSafeNumber(result?.remaining_score, currentRemainingScore);
                setRemainingScore(nextRemaining);
                renderPlanAccordion(planDataCache);
                renderGoalExecutionBoard(planDataCache);
                closePlanModal();
            } catch (error) {
                const message = error?.payload?.error || error.message || (editingMode ? '更新规划失败，请稍后再试。' : '创建规划失败，请稍后再试。');
                const errorRemaining = toSafeNumber(error?.payload?.remaining_score, null);
                if (errorRemaining !== null) {
                    setRemainingScore(errorRemaining);
                }
                showPlanModalError(message);
            } finally {
                setPlanSubmitLoading(false);
                updatePlanCreateAvailability();
            }
        });
    }

    const collectExpandedPlanIds = () => {
        if (!planAccordion) return new Set();
        const expanded = new Set();
        const expandedItems = planAccordion.querySelectorAll('.plan-item[data-expanded="true"]');
        expandedItems.forEach((item) => {
            const planId = item.getAttribute('data-plan-id');
            if (planId) {
                expanded.add(planId);
            }
        });
        return expanded;
    };

    const restoreExpandedPlanIds = (expandedIds) => {
        if (!planAccordion || !expandedIds || expandedIds.size === 0) return;
        expandedIds.forEach((planId) => {
            if (!planId) return;
            const planItem = planAccordion.querySelector(`.plan-item[data-plan-id="${planId}"]`);
            if (!planItem) return;
            planItem.setAttribute('data-expanded', 'true');
            const toggle = planItem.querySelector('.plan-toggle');
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'true');
            }
        });
    };

    const renderPlanAccordion = (plans = []) => {
        if (!planAccordion) return;
        const previouslyExpanded = collectExpandedPlanIds();
        if (!plans.length) {
            planAccordion.innerHTML = '<div class="plan-empty-state">尚未创建年度规划，可稍后开启演示数据或等待创建功能。</div>';
            return;
        }

        const html = plans.map((plan) => {
            const goals = plan.goals || [];
            
            // 重新计算每个目标的状态
            goals.forEach(goal => {
                const calculatedStatus = calculateGoalStatus(plan.id, goal.id, goal.details);
                if (goal.status !== calculatedStatus) {
                    goal.status = calculatedStatus;
                }
            });
            
            // 重新计算规划状态
            const calculatedPlanStatus = calculatePlanStatus(plan);
            if (plan.status !== calculatedPlanStatus) {
                plan.status = calculatedPlanStatus;
            }
            
            const statusText = planStatusLabels[plan.status] || plan.status || '草稿';
            const planIdAttr = normalizeId(plan.id);
            const planYearChip = plan.year ? `<span class="plan-year-chip">${plan.year} 年</span>` : '';
            const goalsHtml = goals.length
                ? `<div class="plan-goal-list" data-plan-id="${planIdAttr}">${goals.map((goal) => {
                        const goalIdAttr = normalizeId(goal.id);
                        const queued = planIdAttr && goalIdAttr ? isGoalQueued(planIdAttr, goalIdAttr) : false;
                        const canQueue = Boolean(planIdAttr && goalIdAttr);
                        const executeLabel = queued ? '已追踪' : (canQueue ? '追踪' : '保存后追踪');
                        const executeDisabled = !canQueue;
                        const executeStateClass = queued ? ' is-executed' : '';
                        return `
                            <div class="plan-goal-item" data-goal-id="${goalIdAttr}" draggable="true">
                                <div class="plan-goal-inline">
                                    <span class="plan-goal-title">${goal.name || '未命名目标'}</span>
                                    ${goal.expected_timeframe ? `<span class="goal-timeframe"><span class="goal-meta-label">预计</span>${goal.expected_timeframe}</span>` : ''}
                                    ${goal.details ? `<span class="goal-details">${goal.details}</span>` : ''}
                                </div>
                                <div class="plan-goal-side">
                                    <span class="goal-score-chip">${goal.score_allocation || 0} 分</span>
                                    <span class="goal-status-pill ${goal.status || 'pending'}">${goalStatusLabels[goal.status] || goal.status || '待开始'}</span>
                                    <button type="button" class="goal-execute-btn${executeStateClass}" data-plan-id="${planIdAttr}" data-goal-id="${goalIdAttr}" ${executeDisabled ? 'disabled' : ''} draggable="false">${executeLabel}</button>
                                </div>
                            </div>
                        `;
                    }).join('')}</div>`
                : '<div class="plan-empty-state">该规划还没有目标，后续阶段可添加。</div>';

            return `
                <article class="plan-item" data-plan-id="${planIdAttr}" data-expanded="false">
                    <div class="plan-item-header">
                        <button type="button" class="plan-toggle" aria-expanded="false">
                            <div>
                                <h3>${plan.title || '未命名规划'}</h3>
                                ${plan.description ? `<p>${plan.description}</p>` : ''}
                            </div>
                        </button>
                        <div class="plan-toolbar" aria-label="规划操作">
                            ${planYearChip}
                            <span class="plan-status ${plan.status || 'draft'}">${statusText}</span>
                            <span class="plan-score-badge">总分 ${plan.score_allocation || 0} 分</span>
                            <button type="button" class="plan-action-btn plan-edit-btn" data-plan-id="${planIdAttr}">编辑</button>
                            <button type="button" class="plan-action-btn plan-delete-btn" data-plan-id="${planIdAttr}">删除</button>
                        </div>
                    </div>
                    <div class="plan-body">
                        ${goalsHtml}
                    </div>
                </article>
            `;
        }).join('');

        planAccordion.innerHTML = html;
        restoreExpandedPlanIds(previouslyExpanded);
        attachPlanToggleHandlers();
        enableGoalDragAndDrop();
    };

    const loadPlans = async (forceRefresh = false) => {
        if (!hasPlansApi || !planAccordion) {
            if (planAccordion && !hasPlansApi) {
                planAccordion.innerHTML = '<div class="plan-empty-state">未加载 plans-api.js，无法获取年度规划数据。</div>';
            }
            if (planningLoadingEl) {
                planningLoadingEl.classList.add('hidden');
            }
            return;
        }

        if (planningDataLoaded && !forceRefresh) {
            renderPlanAccordion(planDataCache);
            renderGoalExecutionBoard(planDataCache);
            return;
        }

        setPlanningLoading(true);
        try {
            const payload = await window.plansApi.list();
            planDataCache = Array.isArray(payload?.plans) ? payload.plans : [];
            planningDataLoaded = true;
            const nextRemaining = toSafeNumber(payload?.remaining_score, 100);
            setRemainingScore(nextRemaining);
            renderPlanAccordion(planDataCache);
            renderGoalExecutionBoard(planDataCache);
        } catch (error) {
            console.error('[Planning] 获取年度规划失败:', error);
            const message = error?.payload?.error || error?.message || '无法加载年度规划，请稍后再试。';
            planAccordion.innerHTML = `<div class="plan-empty-state">${message}</div>`;
        } finally {
            setPlanningLoading(false);
        }
    };

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
                    response = await apiRequest(`/event-types/${editingTypeId}`, 'PUT', { name, color });
                } else {
                    // 创建模式
                    response = await apiRequest('/event-types', 'POST', { name, color });
                }
                // apiRequest 已经在非 ok 状态下抛出错误，或者返回 response 对象
                // 但是 apiRequest 的实现是返回 response 对象，我们需要检查 response.ok 吗？
                // 让我们再看一眼 auth.js 的实现。
                // auth.js: const response = await fetch(...); if (401/422) ...; return response;
                // 所以 apiRequest 返回的是 response 对象。
                
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
                const response = await apiRequest(`/event-types/${typeId}`, 'DELETE');
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
            const response = await apiRequest(`/ideas/${editingIdeaId}`, 'PUT', { text, priority });
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
            } else if (targetPage === 'ideas') {
                loadPlans();
            }
        });
    });

    planningTabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.planningTab;
            if (!target) return;
            planningTabButtons.forEach((tabBtn) => {
                const isActive = tabBtn === btn;
                tabBtn.classList.toggle('active', isActive);
                tabBtn.setAttribute('aria-selected', isActive.toString());
            });
            planningTabPanels.forEach((panel) => {
                const match = panel.dataset.panel === target;
                panel.classList.toggle('active', match);
            });
            if (target === 'annual') {
                loadPlans();
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
        const response = await apiRequest('/ideas'); // 请求灵感收纳箱接口
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
            await apiRequest(`/ideas/${ideaId}`, 'DELETE'); // 调用删除接口
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
            const response = await apiRequest('/events', 'POST', payload);
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || '创建事件失败');
            }
            const deleteResponse = await apiRequest(`/ideas/${convertIdeaContext.id}`, 'DELETE');
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
            await apiRequest('/ideas', 'POST', { text }); // 调用新增灵感接口
            newIdeaInput.value = ''; // 清空输入框
            await fetchIdeas(); // 刷新灵感收纳箱
            await updateApiStatus(); // 更新健康状态统计
        } // if 结束
    }); // 事件监听结束

    fetchIdeas(); // 首次加载时请求灵感收纳箱
    loadPlans(); // 同步加载年度规划列表
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
            let endpoint = '/stats';
            const params = [];
            if (year) params.push(`year=${year}`);
            if (month) params.push(`month=${month}`);
            if (params.length > 0) endpoint += '?' + params.join('&');
            
            const response = await apiRequest(endpoint);
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
