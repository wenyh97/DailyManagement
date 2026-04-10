(function () {
    const DRAFT_STORAGE_KEY = 'dailyManagement.capture.draft';
    const QUEUE_STORAGE_KEY = 'dailyManagement.capture.queue';
    const MAX_RECENT_ITEMS = 12;

    const form = document.getElementById('capture-form');
    const input = document.getElementById('capture-input');
    const submitButton = document.getElementById('submit-button');
    const clearDraftButton = document.getElementById('clear-draft-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const recentList = document.getElementById('recent-list');
    const queuedList = document.getElementById('queued-list');
    const queuedPanel = document.getElementById('queued-panel');
    const queuedCount = document.getElementById('queued-count');
    const networkStatus = document.getElementById('network-status');
    const syncStatus = document.getElementById('sync-status');
    const captureHelp = document.getElementById('capture-help');

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

    function formatTime(value) {
        try {
            return new Date(value).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return value;
        }
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
                <p>${escapeHtml(item.text)}</p>
                <time>待同步 · ${formatTime(item.createdAt)}</time>
            </li>
        `).join('');
    }

    function renderRecent(ideas) {
        if (!Array.isArray(ideas) || !ideas.length) {
            recentList.innerHTML = '<li class="empty-state">还没有收进来的灵感，先写下第一条。</li>';
            return;
        }

        recentList.innerHTML = ideas.slice(0, MAX_RECENT_ITEMS).map((item) => `
            <li class="capture-item">
                <p>${escapeHtml(item.text || '')}</p>
                <time>${formatTime(item.createdAt || item.created_at || '')}</time>
            </li>
        `).join('');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setNetworkState() {
        const online = navigator.onLine;
        networkStatus.textContent = online ? '网络正常' : '当前离线';
        networkStatus.classList.toggle('offline', !online);
    }

    function setSyncMessage(message, isMuted = false) {
        syncStatus.textContent = message;
        syncStatus.classList.toggle('muted', isMuted);
    }

    async function fetchRecentIdeas() {
        recentList.innerHTML = '<li class="empty-state">正在加载刚刚记下的内容...</li>';
        try {
            const response = await apiRequest('/ideas');
            if (!response.ok) {
                throw new Error('Failed to load ideas');
            }
            const ideas = await response.json();
            renderRecent(ideas);
        } catch (error) {
            console.error('[Capture] Failed to load recent ideas:', error);
            recentList.innerHTML = '<li class="empty-state">暂时无法加载刚刚记下的内容。</li>';
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
                // Keep fallback message.
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
            captureHelp.textContent = '请输入一句要记录的内容。';
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

    form.addEventListener('submit', handleSubmit);
    input.addEventListener('input', () => saveDraft(input.value));
    clearDraftButton.addEventListener('click', () => {
        input.value = '';
        clearDraft();
        captureHelp.textContent = '草稿已清空。';
        input.focus();
    });
    logoutButton.addEventListener('click', logout);
    refreshButton.addEventListener('click', async () => {
        await fetchRecentIdeas();
        await flushQueue();
    });
    window.addEventListener('online', async () => {
        setNetworkState();
        await flushQueue();
    });
    window.addEventListener('offline', setNetworkState);

    input.value = loadDraft();
    renderQueue();
    setNetworkState();
    setSyncMessage(loadQueue().length ? '有待同步记录' : '准备就绪', !loadQueue().length);

    fetchRecentIdeas();
    flushQueue();
    registerServiceWorker();
})();