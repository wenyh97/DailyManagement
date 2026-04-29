(function () {
    const DRAFT_STORAGE_KEY = 'dailyManagement.capture.draft';
    const QUEUE_STORAGE_KEY = 'dailyManagement.capture.queue';
    const VIEW_STORAGE_KEY = 'dailyManagement.capture.view';
    const MAX_RECENT_ITEMS = 12;
    const SWIPE_ACTION_WIDTH = 184;

    const form = document.getElementById('capture-form');
    const input = document.getElementById('capture-input');
    const submitButton = document.getElementById('submit-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const recentList = document.getElementById('recent-list');
    const archiveList = document.getElementById('archive-list');
    const queuedList = document.getElementById('queued-list');
    const queuedPanel = document.getElementById('queued-panel');
    const queuedCount = document.getElementById('queued-count');
    const recentCount = document.getElementById('recent-count');
    const archiveCount = document.getElementById('archive-count');
    const activeViewCount = document.getElementById('active-view-count');
    const archiveViewCount = document.getElementById('archive-view-count');
    const viewTabs = Array.from(document.querySelectorAll('[data-capture-view]'));
    const viewPanels = Array.from(document.querySelectorAll('[data-capture-panel]'));
    const networkStatus = document.getElementById('network-status');
    const syncStatus = document.getElementById('sync-status');
    const captureHelp = document.getElementById('capture-help');

    let activeView = loadView();
    let ideasCache = [];
    let openSwipeKey = '';

    function saveDraft(value) {
        localStorage.setItem(DRAFT_STORAGE_KEY, value);
    }

    function loadDraft() {
        return localStorage.getItem(DRAFT_STORAGE_KEY) || '';
    }

    function clearDraft() {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
    }

    function loadQueue() {
        try {
            const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('[Capture] Failed to parse local queue:', error);
            return [];
        }
    }

    function saveQueue(queue) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    }

    function loadView() {
        const stored = localStorage.getItem(VIEW_STORAGE_KEY);
        return stored === 'archive' ? 'archive' : 'active';
    }

    function saveView(view) {
        localStorage.setItem(VIEW_STORAGE_KEY, view === 'archive' ? 'archive' : 'active');
    }

    function formatTime(value) {
        try {
            return new Date(value).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return value || '--';
        }
    }

    function formatShortTime(value) {
        try {
            return new Date(value).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return '--:--';
        }
    }

    function parseTime(value) {
        const time = new Date(value || '').getTime();
        return Number.isFinite(time) ? time : 0;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getSwipeLists() {
        return [recentList, archiveList].filter(Boolean);
    }

    function closeSwipeActions(exceptKey = '') {
        const safeKey = String(exceptKey || '');
        openSwipeKey = safeKey;
        getSwipeLists().forEach((list) => {
            list.querySelectorAll('.capture-swipe-item').forEach((item) => {
                const itemKey = item.dataset.swipeKey || '';
                const shouldOpen = Boolean(safeKey) && itemKey === safeKey;
                item.classList.toggle('is-open', shouldOpen);
                item.style.setProperty('--swipe-offset', shouldOpen ? `-${SWIPE_ACTION_WIDTH}px` : '0px');
            });
        });
    }

    function buildActionButtonMarkup(action, itemId) {
        if (action === 'restore') {
            return `
                <button type="button" class="capture-action-button capture-action-restore" data-action="restore" data-id="${itemId}">
                    <span class="capture-action-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <path d="M8 7H4v4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
                            <path d="M4.8 10.2A7 7 0 1 0 8 5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </span>
                    <span class="capture-action-label">恢复</span>
                </button>
            `;
        }

        if (action === 'complete') {
            return `
                <button type="button" class="capture-action-button capture-action-complete" data-action="complete" data-id="${itemId}">
                    <span class="capture-action-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <path d="M5 12.5 9.2 16.7 19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </span>
                    <span class="capture-action-label">完成</span>
                </button>
            `;
        }

        return `
            <button type="button" class="capture-action-button capture-action-delete" data-action="delete" data-id="${itemId}">
                <span class="capture-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M9 9v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                        <path d="M15 9v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                        <path d="M5 7h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                        <path d="M8 7l1-2h6l1 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                        <path d="M7 7l.7 10.2A2 2 0 0 0 9.69 19h4.62a2 2 0 0 0 1.99-1.8L17 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </span>
                <span class="capture-action-label">删除</span>
            </button>
        `;
    }

    function buildSwipeItemMarkup(item, listType = 'active') {
        const rawId = String(item.id || '');
        const itemId = escapeHtml(rawId);
        const swipeKey = escapeHtml(`${listType}:${rawId}`);
        const actionMarkup = listType === 'archive'
            ? `${buildActionButtonMarkup('restore', itemId)}${buildActionButtonMarkup('delete', itemId)}`
            : `${buildActionButtonMarkup('complete', itemId)}${buildActionButtonMarkup('delete', itemId)}`;
        const timeLabel = listType === 'archive'
            ? `完成于 ${formatTime(item.completedAt || item.completed_at || item.createdAt || item.created_at || '')}`
            : formatTime(item.createdAt || item.created_at || '');

        return `
            <li class="capture-swipe-item" data-id="${itemId}" data-swipe-key="${swipeKey}" style="--swipe-offset: 0px;">
                <div class="capture-item-actions" aria-hidden="true">
                    ${actionMarkup}
                </div>
                <div class="capture-item capture-item-sheet capture-item-compact${listType === 'archive' ? ' archived' : ''}" data-swipe-sheet="true">
                    <div class="capture-body">
                        <p>${escapeHtml(item.text || '')}</p>
                        <time>${timeLabel}</time>
                    </div>
                </div>
            </li>
        `;
    }

    function bindSwipeGestures(listElement) {
        if (!listElement) {
            return;
        }
        const swipeItems = listElement.querySelectorAll('.capture-swipe-item');
        swipeItems.forEach((item) => {
            const sheet = item.querySelector('[data-swipe-sheet]');
            if (!sheet) {
                return;
            }

            let startX = 0;
            let startY = 0;
            let currentOffset = 0;
            let dragOffset = 0;
            let isDragging = false;
            let isHorizontal = false;

            const applyOffset = (offset) => {
                const limitedOffset = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, offset));
                dragOffset = limitedOffset;
                item.style.setProperty('--swipe-offset', `${limitedOffset}px`);
            };

            sheet.addEventListener('touchstart', (event) => {
                const touch = event.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                currentOffset = item.classList.contains('is-open') ? -SWIPE_ACTION_WIDTH : 0;
                dragOffset = currentOffset;
                isDragging = true;
                isHorizontal = false;
                if (!item.classList.contains('is-open')) {
                    closeSwipeActions();
                }
                item.classList.add('is-swiping');
            }, { passive: true });

            sheet.addEventListener('touchmove', (event) => {
                if (!isDragging) {
                    return;
                }
                const touch = event.touches[0];
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;

                if (!isHorizontal) {
                    if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
                        isDragging = false;
                        item.classList.remove('is-swiping');
                        item.style.setProperty('--swipe-offset', `${currentOffset}px`);
                        return;
                    }
                    if (Math.abs(deltaX) < 8) {
                        return;
                    }
                    isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
                }

                if (!isHorizontal) {
                    return;
                }

                event.preventDefault();
                applyOffset(currentOffset + deltaX);
            }, { passive: false });

            sheet.addEventListener('touchend', () => {
                if (!isDragging) {
                    return;
                }
                isDragging = false;
                item.classList.remove('is-swiping');
                const shouldOpen = dragOffset <= -(SWIPE_ACTION_WIDTH * 0.45);
                closeSwipeActions(shouldOpen ? item.dataset.swipeKey : '');
            });

            sheet.addEventListener('touchcancel', () => {
                isDragging = false;
                item.classList.remove('is-swiping');
                closeSwipeActions(item.classList.contains('is-open') ? item.dataset.swipeKey : '');
            });
        });
    }

    async function completeIdea(ideaId) {
        const response = await apiRequest(`/ideas/${ideaId}`, 'PUT', { isCompleted: true });
        if (!response.ok) {
            throw new Error('标记完成失败');
        }
        const updatedIdea = await response.json();
        ideasCache = ideasCache.map((item) => item.id === ideaId ? { ...item, ...updatedIdea } : item);
        closeSwipeActions();
        renderRecent(ideasCache);
        captureHelp.textContent = '已移入待办收纳。';
        setSyncMessage('刚刚标记完成', true);
    }

    async function restoreIdea(ideaId) {
        const response = await apiRequest(`/ideas/${ideaId}`, 'PUT', { isCompleted: false });
        if (!response.ok) {
            throw new Error('恢复失败');
        }
        const updatedIdea = await response.json();
        ideasCache = ideasCache.map((item) => item.id === ideaId ? { ...item, ...updatedIdea } : item);
        closeSwipeActions();
        renderRecent(ideasCache);
        captureHelp.textContent = '已恢复到待处理。';
        setSyncMessage('刚刚恢复成功', true);
    }

    async function deleteIdea(ideaId) {
        const response = await apiRequest(`/ideas/${ideaId}`, 'DELETE');
        if (!response.ok && response.status !== 404) {
            throw new Error('删除失败');
        }
        ideasCache = ideasCache.filter((item) => item.id !== ideaId);
        closeSwipeActions();
        renderRecent(ideasCache);
        captureHelp.textContent = '已删除这条待办。';
        setSyncMessage('刚刚删除成功', true);
    }

    function renderQueue() {
        const queue = loadQueue();
        queuedCount.textContent = `${queue.length} 条`;
        queuedPanel.hidden = queue.length === 0;

        if (!queue.length) {
            queuedList.innerHTML = '';
            return;
        }

        queuedList.innerHTML = queue.map((item) => `
            <li class="capture-item pending">
                <span class="capture-time">${formatShortTime(item.createdAt)}</span>
                <div class="capture-body">
                    <p>${escapeHtml(item.text)}</p>
                    <time>待同步 · ${formatTime(item.createdAt)}</time>
                </div>
            </li>
        `).join('');
    }

    function updateViewState() {
        viewTabs.forEach((tab) => {
            const isActive = tab.dataset.captureView === activeView;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
        });
        viewPanels.forEach((panel) => {
            panel.hidden = panel.dataset.capturePanel !== activeView;
        });
    }

    function renderRecent(ideas) {
        ideasCache = Array.isArray(ideas) ? ideas : [];
        const activeIdeas = ideasCache.filter((item) => !(item.isCompleted || item.is_completed));
        const archivedIdeas = ideasCache.filter((item) => item.isCompleted || item.is_completed);

        activeIdeas.sort((left, right) => parseTime(right.createdAt || right.created_at) - parseTime(left.createdAt || left.created_at));
        archivedIdeas.sort((left, right) => parseTime(right.completedAt || right.completed_at || right.createdAt || right.created_at) - parseTime(left.completedAt || left.completed_at || left.createdAt || left.created_at));

        const limitedActiveIdeas = activeIdeas.slice(0, MAX_RECENT_ITEMS);
        const limitedArchivedIdeas = archivedIdeas.slice(0, MAX_RECENT_ITEMS);

        recentCount.textContent = `${activeIdeas.length} 条`;
        archiveCount.textContent = `${archivedIdeas.length} 条`;
        activeViewCount.textContent = String(activeIdeas.length);
        archiveViewCount.textContent = String(archivedIdeas.length);

        if (!limitedActiveIdeas.length) {
            recentList.innerHTML = '<li class="empty-state">还没有收进来的待办，先写下第一条。</li>';
        } else {
            recentList.innerHTML = limitedActiveIdeas.map((item) => buildSwipeItemMarkup(item, 'active')).join('');
            bindSwipeGestures(recentList);
        }

        if (!limitedArchivedIdeas.length) {
            archiveList.innerHTML = '<li class="empty-state">还没有已收纳的待办，完成后会自动归档到这里。</li>';
        } else {
            archiveList.innerHTML = limitedArchivedIdeas.map((item) => buildSwipeItemMarkup(item, 'archive')).join('');
            bindSwipeGestures(archiveList);
        }

        closeSwipeActions(openSwipeKey);
        updateViewState();
    }

    function setNetworkState() {
        const online = navigator.onLine;
        networkStatus.textContent = online ? '网络正常' : '当前离线';
        networkStatus.classList.toggle('offline', !online);
    }

    function setSyncMessage(message, isMuted = false) {
        syncStatus.textContent = message;
        syncStatus.classList.toggle('is-muted', isMuted);
    }

    async function fetchRecentIdeas() {
        recentList.innerHTML = '<li class="empty-state">正在加载刚刚记下的待办...</li>';
        archiveList.innerHTML = '<li class="empty-state">正在加载已收纳的待办...</li>';
        try {
            const response = await apiRequest('/ideas');
            if (!response.ok) {
                throw new Error('Failed to load todos');
            }
            const ideas = await response.json();
            renderRecent(ideas);
        } catch (error) {
            console.error('[Capture] Failed to load recent ideas:', error);
            recentList.innerHTML = '<li class="empty-state">暂时无法加载刚刚记下的待办。</li>';
            archiveList.innerHTML = '<li class="empty-state">暂时无法加载已收纳的待办。</li>';
        }
    }

    async function sendIdea(text) {
        const response = await apiRequest('/ideas', 'POST', { text });
        if (!response.ok) {
            let message = '记录失败';
            try {
                const payload = await response.json();
                message = payload.error || message;
            } catch (error) {
            }
            throw new Error(message);
        }

        return response.json();
    }

    function enqueueIdea(text) {
        const queue = loadQueue();
        queue.push({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            text,
            createdAt: new Date().toISOString()
        });
        saveQueue(queue);
        renderQueue();
    }

    async function flushQueue() {
        const queue = loadQueue();
        if (!queue.length || !navigator.onLine) {
            if (!queue.length) {
                setSyncMessage('已同步', true);
            }
            return;
        }

        setSyncMessage(`同步中 (${queue.length} 条)`);
        const remaining = [];

        for (const item of queue) {
            try {
                await sendIdea(item.text);
            } catch (error) {
                console.warn('[Capture] Failed to flush queued idea:', error);
                remaining.push(item);
            }
        }

        saveQueue(remaining);
        renderQueue();

        if (remaining.length) {
            setSyncMessage(`还有 ${remaining.length} 条待同步`);
        } else {
            setSyncMessage('离线记录已补发', true);
            await fetchRecentIdeas();
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) {
            captureHelp.textContent = '请输入一句要处理的内容。';
            input.focus();
            return;
        }

        submitButton.disabled = true;

        try {
            if (!navigator.onLine) {
                enqueueIdea(text);
                clearDraft();
                input.value = '';
                captureHelp.textContent = '当前离线，已暂存到本机，联网后会自动同步。';
                setSyncMessage('离线暂存成功');
                return;
            }

            await sendIdea(text);
            clearDraft();
            input.value = '';
            captureHelp.textContent = '已记录，继续写下一条。';
            setSyncMessage('刚刚同步成功', true);
            await fetchRecentIdeas();
            await flushQueue();
        } catch (error) {
            console.error('[Capture] Submit failed:', error);
            enqueueIdea(text);
            clearDraft();
            input.value = '';
            captureHelp.textContent = `${error.message || '网络异常'}，已先存到本机。`;
            setSyncMessage('已切换为离线暂存');
        } finally {
            submitButton.disabled = false;
            input.focus();
        }
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        try {
            await navigator.serviceWorker.register('service-worker.js');
        } catch (error) {
            console.warn('[Capture] Service worker registration failed:', error);
        }
    }

    const handleSwipeListClick = async (event) => {
        const actionButton = event.target.closest('[data-action]');
        if (actionButton) {
            const ideaId = actionButton.dataset.id;
            const action = actionButton.dataset.action;
            actionButton.disabled = true;
            try {
                if (action === 'complete') {
                    await completeIdea(ideaId);
                } else if (action === 'restore') {
                    await restoreIdea(ideaId);
                } else if (action === 'delete') {
                    await deleteIdea(ideaId);
                }
            } catch (error) {
                console.error(`[Capture] ${action} idea failed:`, error);
                captureHelp.textContent = error.message || '操作失败，请稍后重试。';
                setSyncMessage('操作失败，请重试');
                actionButton.disabled = false;
            }
            return;
        }

        const swipeItem = event.target.closest('.capture-swipe-item');
        if (swipeItem && swipeItem.classList.contains('is-open')) {
            closeSwipeActions();
            return;
        }

        if (!event.target.closest('.capture-swipe-item')) {
            closeSwipeActions();
        }
    };

    form.addEventListener('submit', handleSubmit);
    input.addEventListener('input', () => saveDraft(input.value));
    logoutButton.addEventListener('click', logout);
    refreshButton.addEventListener('click', async () => {
        await fetchRecentIdeas();
        await flushQueue();
    });
    recentList.addEventListener('click', handleSwipeListClick);
    archiveList.addEventListener('click', handleSwipeListClick);
    viewTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const nextView = tab.dataset.captureView === 'archive' ? 'archive' : 'active';
            if (nextView === activeView) {
                return;
            }
            activeView = nextView;
            saveView(activeView);
            closeSwipeActions();
            updateViewState();
        });
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.capture-swipe-item')) {
            closeSwipeActions();
        }
    });
    window.addEventListener('online', async () => {
        setNetworkState();
        await flushQueue();
    });
    window.addEventListener('offline', setNetworkState);

    input.value = loadDraft();
    renderQueue();
    updateViewState();
    setNetworkState();
    setSyncMessage(loadQueue().length ? '有待同步记录' : '准备就绪', !loadQueue().length);

    fetchRecentIdeas();
    flushQueue();
    registerServiceWorker();
})();