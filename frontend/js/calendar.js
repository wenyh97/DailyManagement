document.addEventListener('DOMContentLoaded', () => {
    const apiUrl = 'http://127.0.0.1:5000';
    const calendarEl = document.getElementById('calendar-view');
    const scoreBarEl = document.getElementById('calendar-score-bar');
    const urgencyFilterSelect = document.getElementById('urgency-filter');
    const urgencyFilterClearButton = document.getElementById('urgency-filter-clear');
    const defaultTypeColor = '#667eea';
    let calendar = null;
    let calendarInitialized = false;
    let eventManager = window.eventManager && window.eventManager.initialized ? window.eventManager : null;
    let contextMenuEl = null;
    let contextMenuInfo = null;
    let contextMenuHandlersBound = false;
    let remarkTooltipEl = null;
    let remarkTooltipHandlersBound = false;
    let currentUrgencyFilter = urgencyFilterSelect ? urgencyFilterSelect.value || '' : '';
    let suppressFilterChange = false;
    // 优先使用 main.js 已初始化的 Choices 实例（更稳定）
    let urgencyChoices = window.headerUrgencyChoices || null;

    // 新增：类型筛选状态
    let hiddenTypeIds = new Set();
    let scoreTooltipEl = null;

    if (!calendarEl) {
        console.warn('[Calendar] 未找到日历容器');
        return;
    }

    const normalizeHex = (hex) => {
        if (!hex) return '667eea';
        const value = hex.replace('#', '').trim();
        if (value.length === 3) {
            return value.split('').map((char) => char + char).join('');
        }
        return value.padEnd(6, '0').slice(0, 6);
    };

    const toRgba = (hex, alpha = 1) => {
        const normalized = normalizeHex(hex);
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const padNumber = (value) => String(value).padStart(2, '0');

    const formatDateKey = (date) => {
        const year = date.getFullYear();
        const month = padNumber(date.getMonth() + 1);
        const day = padNumber(date.getDate());
        return `${year}-${month}-${day}`;
    };

    const formatDateTimeLocal = (date) => {
        const yearMonthDay = formatDateKey(date);
        const hours = padNumber(date.getHours());
        const minutes = padNumber(date.getMinutes());
        const seconds = padNumber(date.getSeconds());
        return `${yearMonthDay}T${hours}:${minutes}:${seconds}`;
    };

    const formatTimeRange = (start, end) => {
        const startHours = padNumber(start.getHours());
        const startMinutes = padNumber(start.getMinutes());
        const endHours = padNumber(end.getHours());
        const endMinutes = padNumber(end.getMinutes());
        return `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;
    };

    const getLunarDate = (date) => {
        try {
            const lunar = window.Lunar.fromDate(date);
            return lunar.getDayInChinese();
        } catch (error) {
            return '';
        }
    };

    const ensureEventManagerReady = () => {
        if (eventManager && eventManager.initialized) {
            return Promise.resolve(eventManager);
        }
        const existing = window.eventManager;
        if (existing && existing.initialized) {
            eventManager = existing;
            return Promise.resolve(eventManager);
        }
        return new Promise((resolve) => {
            const handler = (evt) => {
                eventManager = evt.detail.instance;
                document.removeEventListener('event-manager:ready', handler);
                resolve(eventManager);
            };
            document.addEventListener('event-manager:ready', handler, { once: true });
        });
    };

    const hideContextMenu = () => {
        if (contextMenuEl && !contextMenuEl.classList.contains('hidden')) {
            contextMenuEl.classList.add('hidden');
            contextMenuEl.style.visibility = '';
        }
        contextMenuInfo = null;
    };

    const bindContextMenuGlobalHandlers = () => {
        if (contextMenuHandlersBound) {
            return;
        }
        contextMenuHandlersBound = true;
        document.addEventListener('click', (evt) => {
            if (contextMenuEl && !contextMenuEl.contains(evt.target)) {
                hideContextMenu();
            }
        });
        document.addEventListener('scroll', hideContextMenu, true);
        window.addEventListener('blur', hideContextMenu);
        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape') {
                hideContextMenu();
            }
        });
    };

    const ensureContextMenu = () => {
        if (contextMenuEl) {
            return contextMenuEl;
        }
        bindContextMenuGlobalHandlers();
        contextMenuEl = document.createElement('div');
        contextMenuEl.id = 'calendar-context-menu';
        contextMenuEl.className = 'calendar-context-menu hidden';
        const actions = [
            { action: 'edit', label: '编辑' },
            { action: 'delete', label: '删除' },
            { action: 'toggle-complete', label: '完成/取消' },
            { action: 'copy', label: '复制' }
        ];
        actions.forEach((item) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.action = item.action;
            button.textContent = item.label;
            contextMenuEl.appendChild(button);
        });
        contextMenuEl.addEventListener('click', (evt) => {
            const target = evt.target.closest('button[data-action]');
            if (!target || !contextMenuInfo) {
                return;
            }
            handleContextMenuAction(target.dataset.action, contextMenuInfo);
            hideContextMenu();
        });
        document.body.appendChild(contextMenuEl);
        return contextMenuEl;
    };

    const hideRemarkTooltip = () => {
        if (remarkTooltipEl && !remarkTooltipEl.classList.contains('hidden')) {
            remarkTooltipEl.classList.add('hidden');
            remarkTooltipEl.style.visibility = '';
        }
    };

    const bindRemarkTooltipGlobalHandlers = () => {
        if (remarkTooltipHandlersBound) {
            return;
        }
        remarkTooltipHandlersBound = true;
        document.addEventListener('scroll', hideRemarkTooltip, true);
        window.addEventListener('blur', hideRemarkTooltip);
        window.addEventListener('resize', hideRemarkTooltip);
        document.addEventListener('click', hideRemarkTooltip, true);
        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape') {
                hideRemarkTooltip();
            }
        });
    };

    const ensureRemarkTooltip = () => {
        if (remarkTooltipEl) {
            return remarkTooltipEl;
        }
        bindRemarkTooltipGlobalHandlers();
        remarkTooltipEl = document.createElement('div');
        remarkTooltipEl.id = 'calendar-remark-tooltip';
        remarkTooltipEl.className = 'calendar-remark-tooltip hidden';
        const inner = document.createElement('div');
        inner.className = 'tooltip-content';
        remarkTooltipEl.appendChild(inner);
        document.body.appendChild(remarkTooltipEl);
        return remarkTooltipEl;
    };

    // 新增：确保积分详情 Tooltip 存在
    const ensureScoreTooltip = () => {
        if (scoreTooltipEl) {
            return scoreTooltipEl;
        }
        scoreTooltipEl = document.createElement('div');
        scoreTooltipEl.id = 'calendar-score-tooltip';
        scoreTooltipEl.className = 'calendar-remark-tooltip hidden'; // 复用样式
        scoreTooltipEl.style.zIndex = '1001';
        const inner = document.createElement('div');
        inner.className = 'tooltip-content';
        scoreTooltipEl.appendChild(inner);
        document.body.appendChild(scoreTooltipEl);
        
        // 绑定隐藏逻辑
        const hide = () => {
            if (!scoreTooltipEl.classList.contains('hidden')) {
                scoreTooltipEl.classList.add('hidden');
            }
        };
        document.addEventListener('scroll', hide, true);
        window.addEventListener('blur', hide);
        window.addEventListener('resize', hide);
        document.addEventListener('click', hide, true);
        
        return scoreTooltipEl;
    };

    const updateUrgencyClearState = () => {
        if (!urgencyFilterClearButton) {
            return;
        }
        if (currentUrgencyFilter) {
            urgencyFilterClearButton.disabled = false;
        } else {
            urgencyFilterClearButton.disabled = true;
        }
    };

    const setUrgencyFilterValue = (value, triggerRefetch = true) => {
        const normalized = value || '';
        if (currentUrgencyFilter === normalized) {
            updateUrgencyClearState();
            return;
        }
        currentUrgencyFilter = normalized;
        if (urgencyFilterSelect) {
            const currentValue = urgencyChoices ? urgencyChoices.getValue(true) : urgencyFilterSelect.value;
            if (currentValue !== normalized) {
                const previousSuppressState = suppressFilterChange;
                suppressFilterChange = true;
                if (urgencyChoices) {
                    urgencyChoices.setChoiceByValue(normalized);
                } else {
                    urgencyFilterSelect.value = normalized;
                }
                suppressFilterChange = previousSuppressState;
            }
        }
        updateUrgencyClearState();
        if (!triggerRefetch) {
            return;
        }
        if (calendar) {
            calendar.refetchEvents();
        }
    };

    const initUrgencyChoices = () => {
        // 仅在未由 main.js 初始化且库可用时进行轻量初始化
        if (urgencyChoices || window.headerUrgencyChoices) {
            urgencyChoices = window.headerUrgencyChoices || urgencyChoices;
            return;
        }
        if (!urgencyFilterSelect || !window.Choices) return;
        try {
            const instance = new Choices(urgencyFilterSelect, {
                searchEnabled: false,
                itemSelectText: '',
                shouldSort: false,
                position: 'bottom',
                allowHTML: false,
                removeItemButton: false,
                duplicateItemsAllowed: false
            });
            instance.containerOuter.element.classList.add('urgency-filter-choices');
            urgencyChoices = instance;
        } catch (e) {
            console.warn('[Calendar] 紧急程度筛选器备用初始化失败:', e);
        }
    };

    const bindUrgencyFilter = () => {
        initUrgencyChoices();
        if (!urgencyChoices) {
            setTimeout(initUrgencyChoices, 300);
        }
        
        if (urgencyFilterSelect) {
            urgencyFilterSelect.addEventListener('change', (event) => {
                if (suppressFilterChange) {
                    return;
                }
                const value = urgencyChoices ? urgencyChoices.getValue(true) : event.target.value;
                setUrgencyFilterValue(value);
            });
        }
        if (urgencyFilterClearButton) {
            urgencyFilterClearButton.addEventListener('click', () => {
                if (!currentUrgencyFilter) {
                    return;
                }
                const previousSuppressState = suppressFilterChange;
                suppressFilterChange = true;
                if (urgencyChoices) {
                    urgencyChoices.setChoiceByValue('');
                } else if (urgencyFilterSelect) {
                    urgencyFilterSelect.value = '';
                }
                suppressFilterChange = previousSuppressState;
                setUrgencyFilterValue('', true);
            });
        }
        updateUrgencyClearState();
    };

    const positionRemarkTooltip = (clientX, clientY) => {
        if (!remarkTooltipEl) {
            return;
        }
        const { scrollX, scrollY, innerWidth, innerHeight } = window;
        const rect = remarkTooltipEl.getBoundingClientRect();
        const tooltipWidth = rect.width || 220;
        const tooltipHeight = rect.height || 100;
        let left = clientX + 16 + scrollX;
        let top = clientY + 16 + scrollY;
        const maxLeft = scrollX + innerWidth - tooltipWidth - 12;
        const maxTop = scrollY + innerHeight - tooltipHeight - 12;
        left = Math.min(Math.max(left, scrollX + 12), Math.max(scrollX + 12, maxLeft));
        top = Math.min(Math.max(top, scrollY + 12), Math.max(scrollY + 12, maxTop));
        remarkTooltipEl.style.left = `${left}px`;
        remarkTooltipEl.style.top = `${top}px`;
    };

    const showRemarkTooltip = (jsEvent, info) => {
        const remark = info.event.extendedProps && info.event.extendedProps.remark;
        if (!remark) {
            hideRemarkTooltip();
            return;
        }
        const tooltip = ensureRemarkTooltip();
        const contentEl = tooltip.querySelector('.tooltip-content');
        contentEl.textContent = remark;
        tooltip.classList.remove('hidden');
        tooltip.style.visibility = 'hidden';
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        positionRemarkTooltip(jsEvent.clientX, jsEvent.clientY);
        tooltip.style.visibility = 'visible';
    };

    const buildManagerEventData = (calendarEvent) => {
        const props = calendarEvent.extendedProps || {};
        return {
            id: calendarEvent.id,
            title: calendarEvent.title,
            start: calendarEvent.startStr,
            end: calendarEvent.endStr,
            allDay: calendarEvent.allDay,
            customTypeId: props.customTypeId,
            urgency: props.urgency,
            isRepeat: props.isRepeat,
            repeatType: props.repeatType,
            repeatEndDate: props.repeatEndDate,
            remark: props.remark
        };
    };

    const completionLocks = new Set();

    const updateEventFromPayload = (calendarEvent, updated, previousProps = null) => {
        const fallback = previousProps || calendarEvent.extendedProps || {};
        if (Object.prototype.hasOwnProperty.call(updated, 'isCompleted')) {
            calendarEvent.setExtendedProp('isCompleted', updated.isCompleted);
        }
        if (Object.prototype.hasOwnProperty.call(updated, 'efficiency')) {
            calendarEvent.setExtendedProp('efficiency', updated.efficiency);
        }
        if (Object.prototype.hasOwnProperty.call(updated, 'urgency')) {
            calendarEvent.setExtendedProp('urgency', updated.urgency);
        } else if (fallback.urgency !== undefined) {
            calendarEvent.setExtendedProp('urgency', fallback.urgency);
        }
        if (Object.prototype.hasOwnProperty.call(updated, 'repeatType')) {
            calendarEvent.setExtendedProp('repeatType', updated.repeatType);
        } else if (fallback.repeatType !== undefined) {
            calendarEvent.setExtendedProp('repeatType', fallback.repeatType);
        }
        if (Object.prototype.hasOwnProperty.call(updated, 'repeatEndDate')) {
            calendarEvent.setExtendedProp('repeatEndDate', updated.repeatEndDate);
        } else if (fallback.repeatEndDate !== undefined) {
            calendarEvent.setExtendedProp('repeatEndDate', fallback.repeatEndDate);
        }
        if (Object.prototype.hasOwnProperty.call(updated, 'customTypeId')) {
            calendarEvent.setExtendedProp('customTypeId', updated.customTypeId);
        } else if (fallback.customTypeId !== undefined) {
            calendarEvent.setExtendedProp('customTypeId', fallback.customTypeId);
        }
        const nextTime = Object.prototype.hasOwnProperty.call(updated, 'time') ? updated.time : fallback.time;
        if (nextTime !== undefined) {
            calendarEvent.setExtendedProp('time', nextTime);
        }
        const nextRemark = Object.prototype.hasOwnProperty.call(updated, 'remark') ? updated.remark : fallback.remark;
        if (nextRemark !== undefined) {
            calendarEvent.setExtendedProp('remark', nextRemark);
        }
    };

    const undoEventCompletion = async (calendarEvent) => {
        if (!calendarEvent || !calendarEvent.id) {
            throw new Error('无法获取事件信息');
        }
        const eventId = calendarEvent.id;
        if (completionLocks.has(eventId)) {
            return null;
        }
        completionLocks.add(eventId);
        const previousProps = { ...(calendarEvent.extendedProps || {}) };
        try {
            const response = await fetch(`${apiUrl}/events/${eventId}/complete`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || '取消完成状态失败');
            }
            const updated = await response.json();
            updateEventFromPayload(calendarEvent, updated, previousProps);
            hideContextMenu();
            hideRemarkTooltip();
            if (calendar) {
                calendar.refetchEvents();
            }
            document.dispatchEvent(new CustomEvent('events:changed'));
            return updated;
        } catch (error) {
            throw error instanceof Error ? error : new Error('取消完成状态失败');
        } finally {
            completionLocks.delete(eventId);
        }
    };

    const openEventCompletionModal = (calendarEvent) => {
        if (!calendarEvent) {
            return;
        }
        ensureEventManagerReady().then((manager) => {
            if (!manager) {
                console.error('[Calendar] 事件管理器尚未就绪，无法完成事件');
                return;
            }
            manager.openCompleteModal({
                id: calendarEvent.id,
                title: calendarEvent.title,
                start: calendarEvent.startStr,
                end: calendarEvent.endStr
            });
        });
    };

    const handleContextMenuAction = (action, info) => {
        if (action === 'toggle-complete') {
            const isCompleted = info.event.extendedProps && info.event.extendedProps.isCompleted;
            if (isCompleted) {
                undoEventCompletion(info.event).catch((error) => {
                    console.error('[Calendar] 取消完成状态失败:', error);
                    alert(error.message || '取消完成状态失败，请稍后重试');
                });
            } else {
                openEventCompletionModal(info.event);
                hideRemarkTooltip();
            }
            return;
        }

        ensureEventManagerReady().then((manager) => {
            if (!manager) {
                console.error('[Calendar] 事件管理器尚未就绪，无法执行菜单操作');
                return;
            }
            hideRemarkTooltip();
            const payload = buildManagerEventData(info.event);
            if (action === 'edit') {
                manager.openForEdit(payload);
            } else if (action === 'delete') {
                manager.openDeleteConfirm(payload);
            } else if (action === 'copy') {
                manager.openForCopy(payload);
            }
        });
    };

    const showContextMenu = (jsEvent, info) => {
        hideRemarkTooltip();
        const menu = ensureContextMenu();
        contextMenuInfo = info;
        menu.classList.remove('hidden');
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';

        const { clientX, clientY } = jsEvent;
        const { scrollX, scrollY, innerWidth, innerHeight } = window;
        const rect = menu.getBoundingClientRect();
        const menuWidth = rect.width || 160;
        const menuHeight = rect.height || 120;
        let left = clientX + scrollX;
        let top = clientY + scrollY;

        const maxLeft = scrollX + innerWidth - menuWidth - 8;
        const maxTop = scrollY + innerHeight - menuHeight - 8;
        left = Math.min(Math.max(left, scrollX + 8), Math.max(scrollX + 8, maxLeft));
        top = Math.min(Math.max(top, scrollY + 8), Math.max(scrollY + 8, maxTop));

        const toggleButton = menu.querySelector('button[data-action="toggle-complete"]');
        if (toggleButton) {
            const isCompleted = info.event.extendedProps && info.event.extendedProps.isCompleted;
            toggleButton.textContent = isCompleted ? '取消完成' : '完成';
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = 'visible';
    };

    const getTypeInfo = (customTypeId) => {
        if (!eventManager || !eventManager.eventTypes) return null;
        return eventManager.getTypeById(customTypeId);
    };

    const transformEvent = (rawEvent) => {
        const typeInfo = getTypeInfo(rawEvent.customTypeId);
        const resolvedColor = typeInfo ? typeInfo.color : defaultTypeColor;
        const typeName = typeInfo ? typeInfo.name : (rawEvent.category || '默认');

        return {
            id: rawEvent.id,
            title: rawEvent.title,
            start: rawEvent.start,
            end: rawEvent.end,
            allDay: rawEvent.allDay,
            classNames: rawEvent.isCompleted ? ['event-completed'] : [],
            extendedProps: {
                customTypeId: rawEvent.customTypeId,
                typeName,
                typeColor: resolvedColor,
                urgency: rawEvent.urgency,
                time: rawEvent.time,
                isRepeat: rawEvent.isRepeat,
                repeatType: rawEvent.repeatType,
                repeatEndDate: rawEvent.repeatEndDate,
                isCompleted: rawEvent.isCompleted,
                efficiency: rawEvent.efficiency,
                remark: rawEvent.remark
            }
        };
    };

    const loadEvents = async (info, successCallback, failureCallback) => {
        try {
            await ensureEventManagerReady();
            const response = await fetch(`${apiUrl}/events`);
            if (!response.ok) {
                throw new Error('加载事件失败');
            }
            const payload = await response.json();
            const events = payload.map(transformEvent);
            const filtered = currentUrgencyFilter
                ? events.filter((event) => {
                    const props = event.extendedProps || {};
                    // 紧急程度筛选
                    if ((props.urgency || '') !== currentUrgencyFilter) {
                        return false;
                    }
                    // 类型筛选
                    const typeIdToCheck = props.customTypeId === null ? 'default' : props.customTypeId;
                    if (hiddenTypeIds.has(typeIdToCheck)) {
                        return false;
                    }
                    return true;
                })
                : events.filter((event) => {
                    const props = event.extendedProps || {};
                    // 类型筛选
                    const typeIdToCheck = props.customTypeId === null ? 'default' : props.customTypeId;
                    if (hiddenTypeIds.has(typeIdToCheck)) {
                        return false;
                    }
                    return true;
                });
            successCallback(filtered);
        } catch (error) {
            console.error('[Calendar] 获取事件失败:', error);
            if (failureCallback) failureCallback(error);
        }
    };

    const buildEventContent = (arg) => {
        if (!arg || !arg.event) {
            return { domNodes: [] };
        }
        const container = document.createElement('div');
        container.className = 'event-compact';
        
        // 添加紧急程度/效率标识
        const badgeEl = document.createElement('span');
        badgeEl.className = 'event-badge';
        const data = arg.event.extendedProps || {};
        
        if (data.isCompleted) {
            // 已完成事件显示效率标识
            const efficiency = data.efficiency || '';
            if (efficiency === 'high') {
                badgeEl.innerHTML = '<span class="badge-efficiency high">高效</span>';
            } else if (efficiency === 'medium') {
                badgeEl.innerHTML = '<span class="badge-efficiency medium">中效</span>';
            } else if (efficiency === 'low') {
                badgeEl.innerHTML = '<span class="badge-efficiency low">低效</span>';
            }
        } else {
            // 未完成事件显示紧急程度标识
            const urgency = data.urgency || '';
            const urgentEl = document.createElement('span');
            const importantEl = document.createElement('span');
            urgentEl.className = 'badge-urgent';
            importantEl.className = 'badge-important';
            urgentEl.textContent = '急';
            importantEl.textContent = '重';
            
            if (urgency === '紧急且重要') {
                urgentEl.classList.add('active');
                importantEl.classList.add('active');
            } else if (urgency === '不紧急且重要') {
                urgentEl.classList.add('inactive');
                importantEl.classList.add('active');
            } else if (urgency === '紧急且不重要') {
                urgentEl.classList.add('active');
                importantEl.classList.add('inactive');
            } else {
                urgentEl.classList.add('inactive');
                importantEl.classList.add('inactive');
            }
            
            badgeEl.appendChild(urgentEl);
            badgeEl.appendChild(importantEl);
        }
        
        const titleEl = document.createElement('span');
        titleEl.className = 'event-compact__title';
        titleEl.textContent = arg.event.title || '';
        
        container.appendChild(badgeEl);
        container.appendChild(titleEl);
        return { domNodes: [container] };
    };

    const decorateEventElement = (info) => {
        if (!info || !info.event || !info.el) {
            return;
        }
        const data = info.event.extendedProps || {};
        const typeColor = data.typeColor || defaultTypeColor;
        const activeBg = `linear-gradient(135deg, ${toRgba(typeColor, 0.95)} 0%, ${toRgba(typeColor, 0.75)} 100%)`;
        const completedBg = `linear-gradient(135deg, ${toRgba(typeColor, 0.45)} 0%, ${toRgba(typeColor, 0.35)} 100%)`;

        info.el.style.background = data.isCompleted ? completedBg : activeBg;
        info.el.style.border = 'none';
        info.el.style.color = '#ffffff';
        info.el.style.cursor = 'pointer';
        info.el.style.paddingRight = '32px';
        info.el.style.boxShadow = data.isCompleted
            ? '0 3px 12px rgba(90, 105, 190, 0.25)'
            : '0 8px 24px rgba(90, 105, 190, 0.35)';

        if (data.isCompleted) {
            info.el.classList.add('event-completed');
        } else {
            info.el.classList.remove('event-completed');
        }

        let checkbox = info.el.querySelector('.event-complete-checkbox');
        if (!checkbox) {
            checkbox = document.createElement('div');
            checkbox.className = 'event-complete-checkbox';
            info.el.appendChild(checkbox);
        }
        checkbox.classList.toggle('completed', !!data.isCompleted);
        checkbox.textContent = data.isCompleted ? '✓' : '';
        checkbox.title = data.isCompleted ? '已完成' : '标记完成';
        checkbox.setAttribute('role', 'button');
        checkbox.setAttribute('aria-label', data.isCompleted ? '已完成事件' : '标记事件完成');
        checkbox.tabIndex = 0;

        let isProcessingCompletion = false;

        const updateCheckboxAppearance = () => {
            const currentTypeColor = info.event.extendedProps.typeColor || defaultTypeColor;
            const activeBackground = `linear-gradient(135deg, ${toRgba(currentTypeColor, 0.95)} 0%, ${toRgba(currentTypeColor, 0.75)} 100%)`;
            const doneBackground = `linear-gradient(135deg, ${toRgba(currentTypeColor, 0.45)} 0%, ${toRgba(currentTypeColor, 0.35)} 100%)`;
            if (info.event.extendedProps.isCompleted) {
                info.el.classList.add('event-completed');
                info.el.style.background = doneBackground;
                info.el.style.boxShadow = '0 3px 12px rgba(90, 105, 190, 0.25)';
                checkbox.classList.add('completed');
                checkbox.textContent = '✓';
                checkbox.title = '已完成';
                checkbox.setAttribute('aria-label', '已完成事件');
            } else {
                info.el.classList.remove('event-completed');
                info.el.style.background = activeBackground;
                info.el.style.boxShadow = '0 8px 24px rgba(90, 105, 190, 0.35)';
                checkbox.classList.remove('completed');
                checkbox.textContent = '';
                checkbox.title = '标记完成';
                checkbox.setAttribute('aria-label', '标记事件完成');
            }
        };

        const undoCompletion = async () => {
            if (isProcessingCompletion) return;
            isProcessingCompletion = true;
            try {
                const updated = await undoEventCompletion(info.event);
                if (updated === null) {
                    return;
                }
                const props = info.event.extendedProps || {};
                data.isCompleted = props.isCompleted;
                data.efficiency = props.efficiency;
                updateCheckboxAppearance();
            } catch (error) {
                console.error('[Calendar] 取消完成状态失败:', error);
                alert(error.message || '取消完成状态失败，请稍后重试');
            } finally {
                isProcessingCompletion = false;
            }
        };

        checkbox.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            hideContextMenu();
            hideRemarkTooltip();
            if (info.event.extendedProps.isCompleted) {
                undoCompletion();
            } else {
                openEventCompletionModal(info.event);
            }
        };

        checkbox.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                hideContextMenu();
                hideRemarkTooltip();
                checkbox.click();
            }
        };

        updateCheckboxAppearance();

        const openEditModal = () => {
            ensureEventManagerReady().then((manager) => {
                if (!manager) {
                    console.error('[Calendar] 事件管理器尚未就绪，无法编辑事件');
                    return;
                }
                const payload = buildManagerEventData(info.event);
                manager.openForEdit(payload);
            });
        };

        info.el.addEventListener('dblclick', (event) => {
            event.preventDefault();
            hideRemarkTooltip();
            openEditModal();
        });

        info.el.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            showContextMenu(event, info);
        });

        info.el.addEventListener('click', () => {
            hideContextMenu();
            hideRemarkTooltip();
        });

        info.el.addEventListener('mouseenter', (event) => {
            const remark = info.event.extendedProps && info.event.extendedProps.remark;
            if (!remark) {
                hideRemarkTooltip();
                return;
            }
            showRemarkTooltip(event, info);
        });

        info.el.addEventListener('mousemove', (event) => {
            const remark = info.event.extendedProps && info.event.extendedProps.remark;
            if (!remark || !remarkTooltipEl || remarkTooltipEl.classList.contains('hidden')) {
                return;
            }
            positionRemarkTooltip(event.clientX, event.clientY);
        });

        info.el.addEventListener('mouseleave', () => {
            hideRemarkTooltip();
        });
    };

    const getWeekRange = (referenceDate) => {
        const base = new Date(referenceDate);
        base.setHours(0, 0, 0, 0);
        const day = base.getDay();
        const diff = day === 0 ? -6 : 1 - day; // Monday-first
        const start = new Date(base);
        start.setDate(base.getDate() + diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return { start, end };
    };

    const refreshDailyScores = async (referenceDate) => {
        if (!scoreBarEl) return;
        const reference = referenceDate ? new Date(referenceDate) : (calendar ? calendar.getDate() : new Date());
        const { start, end } = getWeekRange(reference);
        scoreBarEl.classList.remove('hidden');
        scoreBarEl.innerHTML = '<div class="score-empty">积分加载中...</div>';
        try {
            const endInclusive = new Date(end);
            endInclusive.setDate(endInclusive.getDate() - 1);
            const startParam = `${formatDateKey(start)}T00:00:00`;
            const endParam = `${formatDateKey(endInclusive)}T23:59:59`;
            const url = `${apiUrl}/daily-scores?start_date=${encodeURIComponent(startParam)}&end_date=${encodeURIComponent(endParam)}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('加载积分失败');
            }
            const payload = await response.json();
            const scoreMap = new Map(payload.map((item) => [item.date, item.totalScore]));
            const cells = [];
            const cursor = new Date(start);
            for (let i = 0; i < 7; i += 1) {
                const dateKey = formatDateKey(cursor);
                const label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
                const points = scoreMap.has(dateKey) ? scoreMap.get(dateKey) : 0;
                const pointColor = points > 0 ? '#2f327d' : points < 0 ? '#f5576c' : '#5b5f7b';
                cells.push(`
                    <div class="score-cell" data-date="${dateKey}">
                        <span class="score-date">${label}</span>
                        <span class="score-points" style="color:${pointColor}">${points}</span>
                    </div>
                `);
                cursor.setDate(cursor.getDate() + 1);
            }
            scoreBarEl.innerHTML = `
                <div>
                    <h4>本周效率积分</h4>
                    <div class="score-grid">
                        ${cells.join('')}
                    </div>
                </div>
            `;
            
            // 绑定悬浮事件
            const cellEls = scoreBarEl.querySelectorAll('.score-cell');
            cellEls.forEach(cell => {
                cell.addEventListener('mouseenter', async (e) => {
                    const dateKey = cell.dataset.date;
                    if (!dateKey) return;
                    
                    const tooltip = ensureScoreTooltip();
                    const contentEl = tooltip.querySelector('.tooltip-content');
                    contentEl.innerHTML = '<div style="text-align:center;padding:10px;">加载中...</div>';
                    
                    // 定位函数：显示在上方
                    const updatePosition = () => {
                        const rect = cell.getBoundingClientRect();
                        const { scrollX, scrollY } = window;
                        const tooltipRect = tooltip.getBoundingClientRect();
                        
                        // 计算上方位置：元素顶部 - Tooltip高度 - 间距
                        let top = rect.top + scrollY - tooltipRect.height - 12;
                        let left = rect.left + scrollX;
                        
                        // 防止右侧溢出
                        if (left + tooltipRect.width > window.innerWidth + scrollX) {
                            left = window.innerWidth + scrollX - tooltipRect.width - 10;
                        }
                        // 防止左侧溢出
                        if (left < scrollX) {
                            left = scrollX + 10;
                        }

                        tooltip.style.left = `${left}px`;
                        tooltip.style.top = `${top}px`;
                    };

                    tooltip.classList.remove('hidden');
                    updatePosition(); // 初始定位（显示加载中）
                    
                    try {
                        const res = await fetch(`${apiUrl}/daily-score-details?date=${dateKey}`);
                        if (!res.ok) throw new Error('加载详情失败');
                        const details = await res.json();
                        
                        if (details.length === 0) {
                            contentEl.innerHTML = '<div style="text-align:center;padding:10px;color:#666;">暂无完成事件</div>';
                            updatePosition();
                            return;
                        }
                        
                        let html = `
                            <table class="score-tooltip-table">
                                <thead>
                                    <tr>
                                        <th class="type-col">类型</th>
                                        <th>效率</th>
                                        <th>数量</th>
                                        <th>得分</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;
                        
                        const effMap = { 'high': '高效', 'medium': '中效', 'low': '低效' };
                        const effClassMap = { 'high': 'eff-high', 'medium': 'eff-medium', 'low': 'eff-low' };
                        
                        const formatCount = (val) => {
                            return Math.round(parseFloat(val));
                        };
                        
                        details.forEach(typeData => {
                            ['high', 'medium', 'low'].forEach((eff, index) => {
                                const d = typeData.details[eff];
                                html += '<tr>';
                                
                                // 合并单元格，每种类型只显示一次，居中显示
                                if (index === 0) {
                                    html += `
                                        <td class="type-col" rowspan="3" style="box-shadow: inset 3px 0 0 0 ${typeData.typeColor}">
                                            ${typeData.typeName}
                                        </td>
                                    `;
                                }
                                
                                html += `
                                        <td class="${effClassMap[eff]}">${effMap[eff]}</td>
                                        <td>${formatCount(d.count)}</td>
                                        <td>${d.score}</td>
                                    </tr>
                                `;
                            });
                        });
                        
                        html += '</tbody></table>';
                        contentEl.innerHTML = html;
                        
                        // 内容更新后重新定位
                        updatePosition();
                        
                    } catch (err) {
                        console.error(err);
                        contentEl.innerHTML = '<div style="text-align:center;padding:10px;color:red;">加载失败</div>';
                    }
                });
                
                cell.addEventListener('mouseleave', () => {
                    if (scoreTooltipEl) {
                        scoreTooltipEl.classList.add('hidden');
                    }
                });
            });
        } catch (error) {
            console.error('[Calendar] 积分加载失败:', error);
            scoreBarEl.innerHTML = '<div class="score-empty">暂时无法加载积分数据</div>';
        }
    };

    // 新增：初始化图例
    const initLegend = async () => {
        const legendContainer = document.getElementById('calendar-legend');
        if (!legendContainer) return;
        
        try {
            await ensureEventManagerReady();
            const response = await fetch(`${apiUrl}/event-types`);
            if (!response.ok) return;
            const types = await response.json();
            
            // 移除"默认"类型按钮，只显示自定义类型
            const allTypes = [...types];
            
            legendContainer.innerHTML = '';

            // 1. 添加"全选"按钮
            const allBtn = document.createElement('div');
            allBtn.className = 'legend-item legend-all';
            // 如果有任何类型被隐藏，全选按钮应为非激活状态
            if (hiddenTypeIds.size > 0) {
                allBtn.classList.add('inactive');
            }
            
            // 使用主题色渐变代替黑色
            allBtn.innerHTML = `
                <div class="legend-color" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"></div>
                <span class="legend-label">全选</span>
            `;
            
            allBtn.addEventListener('click', () => {
                const isCurrentlyActive = !allBtn.classList.contains('inactive');
                
                if (isCurrentlyActive) {
                    // 当前是全选状态 -> 点击后取消全选（全暗）
                    allBtn.classList.add('inactive');
                    // 将所有类型ID加入隐藏列表
                    allTypes.forEach(t => {
                        const tid = t.id === null ? 'default' : t.id;
                        hiddenTypeIds.add(tid);
                    });
                    // UI全部变暗
                    Array.from(legendContainer.querySelectorAll('.legend-item:not(.legend-all)')).forEach(el => {
                        el.classList.add('inactive');
                    });
                } else {
                    // 当前是非全选状态 -> 点击后全选（全亮）
                    allBtn.classList.remove('inactive');
                    hiddenTypeIds.clear();
                    // UI全部变亮
                    Array.from(legendContainer.querySelectorAll('.legend-item:not(.legend-all)')).forEach(el => {
                        el.classList.remove('inactive');
                    });
                }
                
                if (calendar) calendar.refetchEvents();
            });
            
            legendContainer.appendChild(allBtn);

            // 2. 添加各个类型按钮
            allTypes.forEach(type => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                const typeIdStr = type.id === null ? 'default' : type.id;
                item.dataset.typeId = typeIdStr;
                
                // 检查初始状态
                if (hiddenTypeIds.has(typeIdStr)) {
                    item.classList.add('inactive');
                }
                
                const colorBlock = document.createElement('div');
                colorBlock.className = 'legend-color';
                colorBlock.style.backgroundColor = type.color;
                
                const label = document.createElement('span');
                label.className = 'legend-label';
                label.textContent = type.name;
                
                item.appendChild(colorBlock);
                item.appendChild(label);
                
                item.addEventListener('click', () => {
                    // 切换自身状态
                    if (item.classList.contains('inactive')) {
                        item.classList.remove('inactive');
                        hiddenTypeIds.delete(typeIdStr);
                    } else {
                        item.classList.add('inactive');
                        hiddenTypeIds.add(typeIdStr);
                    }
                    
                    // 更新全选按钮状态
                    // 只要有任何一个被隐藏，全选就不亮
                    if (hiddenTypeIds.size > 0) {
                        allBtn.classList.add('inactive');
                    } else {
                        allBtn.classList.remove('inactive');
                    }
                    
                    if (calendar) {
                        calendar.refetchEvents();
                    }
                });
                
                legendContainer.appendChild(item);
            });
            
        } catch (e) {
            console.error('[Calendar] 初始化图例失败', e);
        }
    };

    const initCalendar = () => ensureEventManagerReady().then(() => {
        if (calendarInitialized) {
            calendar.render();
            refreshDailyScores(calendar.getDate());
            initLegend(); // 刷新图例
            return;
        }

        const persistEventTiming = async (calendarEvent, revert) => {
            if (!calendarEvent || !calendarEvent.id) {
                if (typeof revert === 'function') revert();
                return;
            }
            const startDate = calendarEvent.start;
            let endDate = calendarEvent.end;
            const isAllDay = calendarEvent.allDay;
            
            if (!startDate) {
                if (typeof revert === 'function') revert();
                return;
            }
            if (!endDate) {
                endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
            }
            
            const payload = {
                allDay: isAllDay
            };
            
            if (isAllDay) {
                // 全天事件：只发送日期部分
                const dateStr = formatDateKey(startDate);
                payload.start = `${dateStr}T00:00`;
                payload.end = `${dateStr}T23:59`;
            } else {
                // 时间事件：发送完整时间
                payload.start = formatDateTimeLocal(startDate);
                payload.end = formatDateTimeLocal(endDate);
                payload.time = formatTimeRange(startDate, endDate);
            }
            
            try {
                const response = await fetch(`${apiUrl}/events/${calendarEvent.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || '更新事件失败');
                }
                const updated = await response.json();
                
                // 原子化更新时间，避免 start/end 分别设置导致的临时跨天拉伸
                const newStart = updated.start ? new Date(updated.start) : calendarEvent.start;
                const newEnd = updated.end ? new Date(updated.end) : calendarEvent.end;
                const newAllDay = updated.allDay !== undefined ? updated.allDay : calendarEvent.allDay;
                
                calendarEvent.setDates(newStart, newEnd, { allDay: newAllDay });

                calendarEvent.setExtendedProp('time', updated.time || '');
                calendarEvent.setExtendedProp('customTypeId', updated.customTypeId);
                calendarEvent.setExtendedProp('urgency', updated.urgency);
                calendarEvent.setExtendedProp('isRepeat', updated.isRepeat);
                calendarEvent.setExtendedProp('repeatType', updated.repeatType);
                calendarEvent.setExtendedProp('repeatEndDate', updated.repeatEndDate);
                calendarEvent.setExtendedProp('isCompleted', updated.isCompleted);
                calendarEvent.setExtendedProp('efficiency', updated.efficiency);
                calendarEvent.setExtendedProp('remark', updated.remark);
                document.dispatchEvent(new CustomEvent('events:changed', {
                    detail: { source: 'calendar:drag' }
                }));
                hideContextMenu();
                hideRemarkTooltip();
            } catch (error) {
                console.error('[Calendar] 更新事件失败:', error);
                if (typeof revert === 'function') {
                    revert();
                }
                alert(error.message || '更新事件失败，请稍后重试');
            }
        };

        const enforceDuration = (info) => {
            if (!info || !info.event || !info.event.start) {
                return;
            }
            const reference = info.oldEvent && info.oldEvent.start && info.oldEvent.end
                ? info.oldEvent
                : info.event;
            const start = reference.start ? reference.start.getTime() : null;
            const end = reference.end ? reference.end.getTime() : null;
            if (!start || !end) {
                return;
            }
            const duration = Math.max(end - start, 15 * 60 * 1000);
            const nextEnd = new Date(info.event.start.getTime() + duration);
            info.event.setEnd(nextEnd);
        };

        calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'zh-cn',
            firstDay: 1,
            initialView: 'timeGridWeek',
            height: 'auto',
            contentHeight: 650,
            aspectRatio: 1.8,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            buttonText: {
                today: '今天',
                month: '月',
                week: '周',
                day: '日'
            },
            views: {
                dayGridMonth: {
                    dayHeaderFormat: { weekday: 'long' }
                }
            },
            dayHeaderContent(arg) {
                const date = arg.date;
                const view = arg.view;
                if (view.type === 'dayGridMonth') {
                    return date.toLocaleDateString('zh-CN', { weekday: 'long' });
                }
                if ((view.type === 'timeGridWeek' || view.type === 'timeGridDay') && !arg.isAxis) {
                    const dayOfWeek = date.toLocaleDateString('zh-CN', { weekday: 'short' });
                    const dayOfMonth = date.getDate();
                    const lunar = getLunarDate(date);
                    return {
                        html: `
                            <div class="fc-day-header-content">
                                <span class="fc-day-weekday">${dayOfWeek}</span>
                                <span class="fc-day-date">${dayOfMonth}</span>
                                <span class="fc-day-lunar">${lunar}</span>
                            </div>
                        `
                    };
                }
                return null;
            },
            dayCellContent(arg) {
                if (arg.view.type !== 'dayGridMonth') {
                    return null;
                }
                const dayOfMonth = arg.date.getDate();
                const lunar = getLunarDate(arg.date);
                return {
                    html: `
                        <div class="fc-daygrid-day-top">
                            <span class="fc-daygrid-day-number">${dayOfMonth}</span>
                            <span class="fc-daygrid-day-lunar">${lunar}</span>
                        </div>
                    `
                };
            },
            events: loadEvents,
            eventContent: buildEventContent,
            eventDidMount: decorateEventElement,
            editable: true,
            eventStartEditable: true,
            eventDurationEditable: true,
            droppable: false,
            allDayText: '全天',
            noEventsText: '暂无事件',
            slotMinTime: '07:00:00',
            slotMaxTime: '24:00:00',
            slotLabelFormat: {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            },
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            },
            datesSet(info) {
                refreshDailyScores(info.start);
            },
            dateClick(info) {
                if (info.jsEvent.detail === 2) {
                    const clickedDate = info.dateStr.split('T')[0];
                    const clickedTime = info.dateStr.includes('T') ? info.dateStr.split('T')[1].slice(0, 5) : null;
                    const defaults = { date: clickedDate };
                    if (clickedTime) {
                        defaults.startTime = clickedTime;
                        const [hours, minutes] = clickedTime.split(':').map(Number);
                        const endDate = new Date();
                        endDate.setHours(hours, minutes + 30);
                        defaults.endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
                    } else {
                        defaults.allDay = true;
                    }
                    ensureEventManagerReady().then(() => {
                        if (window.eventManager) {
                            window.eventManager.openForCreate(defaults);
                        }
                    });
                }
            },
            eventDrop(info) {
                try {
                    if (!info || !info.event) {
                        if (typeof info.revert === 'function') info.revert();
                        return;
                    }
                    enforceDuration(info);
                    persistEventTiming(info.event, info.revert);
                } catch (e) {
                    console.error('[Calendar] eventDrop 出错:', e);
                    if (typeof info.revert === 'function') info.revert();
                    alert(e.message || '更新事件失败，请稍后重试');
                }
            },
            eventResize(info) {
                try {
                    if (!info || !info.event) {
                        if (typeof info.revert === 'function') info.revert();
                        return;
                    }
                    // Resize 操作不应强制重置时长，否则无法调整大小
                    persistEventTiming(info.event, info.revert);
                } catch (e) {
                    console.error('[Calendar] eventResize 出错:', e);
                    if (typeof info.revert === 'function') info.revert();
                    alert(e.message || '更新事件失败，请稍后重试');
                }
            }
        });

        calendar.render();
        calendarInitialized = true;
        refreshDailyScores(calendar.getDate());
        initLegend(); // 初始化图例
        window.calendarInstance = calendar;
    });

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetPage = btn.getAttribute('data-page');
            if (targetPage === 'daily') {
                setTimeout(() => {
                    initCalendar();
                    if (!urgencyChoices) {
                        initUrgencyChoices();
                    }
                    initLegend(); // 确保切换回来时刷新
                }, 120);
            }
        });
    });

    const handleCalendarRefresh = (evt) => {
        const source = evt && evt.detail ? evt.detail.source : '';
        hideContextMenu();
        hideRemarkTooltip();
        const shouldSkipRefetch = source === 'calendar:drag';
        if (calendar && !shouldSkipRefetch) {
            calendar.refetchEvents();
        }
        refreshDailyScores(calendar ? calendar.getDate() : new Date());
    };

    bindUrgencyFilter();

    const ensureUrgencyEnhancement = () => {
        const sel = document.getElementById('urgency-filter');
        if (!sel) return;
        if (sel.closest('.choices')) return; // 已增强
        if (window.headerUrgencyChoices) {
            // main.js 可能尚未执行完成，稍后再检测
            setTimeout(() => {
                if (!sel.closest('.choices')) {
                    console.log('[Calendar] 备用初始化紧急程度筛选器');
                    initUrgencyChoices();
                    if (!sel.closest('.choices')) {
                        console.warn('[Calendar] 备用初始化失败, 启用 fallback 样式');
                        sel.classList.add('urgency-fallback');
                    }
                }
            }, 200);
            return;
        }
        console.log('[Calendar] 原生状态，尝试直接备用初始化');
        initUrgencyChoices();
        if (!sel.closest('.choices')) {
            console.warn('[Calendar] 初始化失败, 启用 fallback 样式');
            sel.classList.add('urgency-fallback');
        }
    };

    // 在进入 daily 页面后强制再尝试一次
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-btn[data-page="daily"]');
        if (btn) {
            setTimeout(ensureUrgencyEnhancement, 200);
        }
    });

    // 如果初始就是 daily 页，立即执行
    const activeNavBtn = document.querySelector('.nav-btn.active[data-page="daily"]');
    if (activeNavBtn) {
        setTimeout(ensureUrgencyEnhancement, 200);
    }

    document.addEventListener('calendar:refresh', handleCalendarRefresh);
    document.addEventListener('scores:refresh', () => {
        refreshDailyScores(calendar ? calendar.getDate() : new Date());
    });
    document.addEventListener('events:changed', handleCalendarRefresh);
    document.addEventListener('event-types:updated', () => {
        if (calendar) {
            calendar.refetchEvents();
            initLegend(); // 类型更新时刷新图例
        }
    });
    document.addEventListener('event-manager:ready', (evt) => {
        eventManager = evt.detail.instance;
    });

    const activeNav = document.querySelector('.nav-btn.active');
    if (activeNav && activeNav.getAttribute('data-page') === 'daily') {
        initCalendar();
        if (!urgencyChoices) {
            initUrgencyChoices();
        }
    }
});
