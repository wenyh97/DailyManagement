import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';

const STORAGE_KEYS = {
  apiBase: 'tonybase.desktop.apiBase',
  token: 'tonybase.desktop.accessToken',
  user: 'tonybase.desktop.user',
  pinned: 'tonybase.desktop.windowPinned',
};

const DEFAULT_API_BASE = 'https://dailymanagement.tonybase.site';
const DEFAULT_UPDATE_BASE = 'https://dailymanagement.tonybase.site';
const DESKTOP_METADATA_PATH = '/downloads/metadata/desktop-latest.json';
const VIEW_MODES = {
  active: 'active',
  archive: 'archive',
};
const SYNC_INTERVAL_MS = 30000;

const elements = {
  loginPanel: document.getElementById('login-panel'),
  capturePanel: document.getElementById('capture-panel'),
  loginForm: document.getElementById('login-form'),
  captureForm: document.getElementById('capture-form'),
  apiBaseInput: document.getElementById('api-base-input'),
  usernameInput: document.getElementById('username-input'),
  passwordInput: document.getElementById('password-input'),
  ideaInput: document.getElementById('idea-input'),
  loginButton: document.getElementById('login-button'),
  submitButton: document.getElementById('submit-button'),
  settingsButton: document.getElementById('settings-button'),
  settingsMenu: document.getElementById('settings-menu'),
  settingsVersion: document.getElementById('settings-version'),
  settingsRefreshButton: document.getElementById('settings-refresh-button'),
  settingsVersionButton: document.getElementById('settings-version-button'),
  settingsLogoutButton: document.getElementById('settings-logout-button'),
  pinButton: document.getElementById('pin-button'),
  syncButton: document.getElementById('sync-button'),
  viewActiveButton: document.getElementById('view-active-button'),
  viewArchiveButton: document.getElementById('view-archive-button'),
  viewTitle: document.getElementById('view-title'),
  loginStatus: document.getElementById('login-status'),
  captureStatus: document.getElementById('capture-status'),
  appStatus: document.getElementById('app-status'),
  recentCount: document.getElementById('recent-count'),
  recentList: document.getElementById('recent-list'),
  dialogBackdrop: document.getElementById('dialog-backdrop'),
  dialogTitle: document.getElementById('dialog-title'),
  dialogMessage: document.getElementById('dialog-message'),
  dialogCancelButton: document.getElementById('dialog-cancel-button'),
  dialogConfirmButton: document.getElementById('dialog-confirm-button'),
};

const state = {
  isWindowPinned: false,
  currentAppVersion: '',
  dialogResolver: null,
  currentView: VIEW_MODES.active,
  ideas: [],
  events: [],
  syncIntervalId: null,
  isSyncing: false,
};

function normalizeApiBase(value) {
  if (!value || typeof value !== 'string') {
    return DEFAULT_API_BASE;
  }

  return value.trim().replace(/\/$/, '') || DEFAULT_API_BASE;
}

function saveApiBase(value) {
  localStorage.setItem(STORAGE_KEYS.apiBase, normalizeApiBase(value));
}

function getApiBase() {
  return normalizeApiBase(localStorage.getItem(STORAGE_KEYS.apiBase));
}

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || '';
}

function setToken(token) {
  localStorage.setItem(STORAGE_KEYS.token, token);
}

function clearToken() {
  localStorage.removeItem(STORAGE_KEYS.token);
}

function getUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEYS.user);
    return null;
  }
}

function setUser(user) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(STORAGE_KEYS.user);
}

function getPinnedPreference() {
  return localStorage.getItem(STORAGE_KEYS.pinned) === 'true';
}

function savePinnedPreference(pinned) {
  localStorage.setItem(STORAGE_KEYS.pinned, String(Boolean(pinned)));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseTimestamp(value) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value || '';
  }
}

function isIdeaCompleted(idea) {
  return Boolean(idea?.isCompleted || idea?.is_completed);
}

function isEventCompleted(event) {
  return Boolean(event?.isCompleted || event?.is_completed);
}

function getIdeaCompletedAt(idea) {
  return idea?.completedAt || idea?.completed_at || idea?.createdAt || idea?.created_at || '';
}

function getEventCompletedAt(event) {
  return event?.end || event?.start || '';
}

function setLoginStatus(message, isError = false) {
  elements.loginStatus.textContent = message;
  elements.loginStatus.style.color = isError ? '#b42318' : '';
}

function setCaptureStatus(message, isError = false) {
  elements.captureStatus.textContent = message;
  elements.captureStatus.style.color = isError ? '#b42318' : '';
}

function setAppStatus(message, isError = false) {
  elements.appStatus.textContent = message;
  elements.appStatus.style.color = isError ? '#b42318' : '';
}

function setSettingsMenuOpen(open) {
  elements.settingsMenu.classList.toggle('hidden', !open);
  elements.settingsButton.setAttribute('aria-expanded', String(open));
}

function updateActionStates() {
  const isAuthenticated = Boolean(getToken() && getUser());
  elements.settingsRefreshButton.disabled = !isAuthenticated;
  elements.settingsLogoutButton.disabled = !isAuthenticated;
  elements.syncButton.disabled = !isAuthenticated || state.isSyncing;
  elements.viewActiveButton.disabled = !isAuthenticated;
  elements.viewArchiveButton.disabled = !isAuthenticated;
}

function setSettingsVersionText(message) {
  elements.settingsVersion.textContent = message;
}

function normalizeRequestError(error) {
  const message = error?.message || '请求失败';
  if (/Failed to fetch/i.test(message)) {
    return '网络连接失败，请检查网络或稍后重试。';
  }
  return message;
}

function showDialog({ title, message, confirmText = '确定', cancelText = '' }) {
  elements.dialogTitle.textContent = title;
  elements.dialogMessage.textContent = message;
  elements.dialogConfirmButton.textContent = confirmText;
  elements.dialogCancelButton.textContent = cancelText || '取消';
  elements.dialogCancelButton.classList.toggle('hidden', !cancelText);
  elements.dialogBackdrop.classList.remove('hidden');
  elements.dialogBackdrop.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    state.dialogResolver = resolve;
  });
}

function closeDialog(confirmed) {
  elements.dialogBackdrop.classList.add('hidden');
  elements.dialogBackdrop.setAttribute('aria-hidden', 'true');

  if (state.dialogResolver) {
    const resolve = state.dialogResolver;
    state.dialogResolver = null;
    resolve(confirmed);
  }
}

function getDesktopMetadataUrls() {
  const candidates = [];

  const appendCandidate = (baseUrl) => {
    try {
      const normalizedBase = normalizeApiBase(baseUrl);
      candidates.push(new URL(DESKTOP_METADATA_PATH, `${normalizedBase}/`).toString());
    } catch {
      // Ignore invalid URLs and continue.
    }
  };

  appendCandidate(DEFAULT_UPDATE_BASE);
  appendCandidate(getApiBase());

  return [...new Set(candidates)];
}

function compareVersions(left, right) {
  const leftParts = String(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

async function fetchDesktopReleaseMetadata() {
  return invoke('fetch_update_metadata', { candidates: getDesktopMetadataUrls() });
}

async function checkForUpdates() {
  setSettingsMenuOpen(false);
  elements.settingsVersionButton.disabled = true;
  setAppStatus('正在检测更新...');

  try {
    const metadata = await fetchDesktopReleaseMetadata();
    const latestVersion = metadata.version;
    const downloadUrl = metadata.latestDownloadUrl || metadata.downloadUrl;

    if (!downloadUrl) {
      throw new Error('服务器返回了版本号，但没有可用下载地址。');
    }

    setSettingsVersionText(`当前版本 ${state.currentAppVersion}，最新版本 ${latestVersion}`);

    if (compareVersions(latestVersion, state.currentAppVersion) <= 0) {
      setAppStatus(`当前已是最新版本 ${state.currentAppVersion}。`);
      await showDialog({
        title: '已是最新版本',
        message: `当前客户端版本是 ${state.currentAppVersion}，不需要更新。`,
      });
      return;
    }

    const shouldUpdate = await showDialog({
      title: `发现新版本 ${latestVersion}`,
      message: `当前版本 ${state.currentAppVersion}\n新版本 ${latestVersion}\n\n点击“立即更新”后，客户端会下载新版安装包并自动启动安装。`,
      confirmText: '立即更新',
      cancelText: '稍后',
    });

    if (!shouldUpdate) {
      setAppStatus('已取消更新。');
      return;
    }

    setAppStatus(`正在准备更新到 ${latestVersion}...`);
    await invoke('download_and_install_update', {
      downloadUrl,
      version: latestVersion,
    });
  } catch (error) {
    const message = normalizeRequestError(error);
    setAppStatus(message, true);
    await showDialog({
      title: '更新失败',
      message,
    });
  } finally {
    elements.settingsVersionButton.disabled = false;
  }
}

function renderPinButton() {
  elements.pinButton.setAttribute('aria-pressed', String(state.isWindowPinned));
  elements.pinButton.setAttribute('aria-label', state.isWindowPinned ? '取消置顶' : '置顶窗口');
  elements.pinButton.title = state.isWindowPinned ? '取消置顶' : '置顶窗口';
}

function renderSyncButton() {
  elements.syncButton.classList.toggle('is-syncing', state.isSyncing);
  elements.syncButton.disabled = state.isSyncing || !Boolean(getToken() && getUser());
}

function renderViewButtons() {
  elements.viewActiveButton.classList.toggle('is-active', state.currentView === VIEW_MODES.active);
  elements.viewArchiveButton.classList.toggle('is-active', state.currentView === VIEW_MODES.archive);
}

function setCurrentView(view) {
  state.currentView = view;
  renderDashboard();
}

function renderEmptyState(message) {
  elements.recentList.innerHTML = `<li class="empty-state">${escapeHtml(message)}</li>`;
}

function buildPendingIdeaMarkup(idea) {
  const createdAt = idea.createdAt || idea.created_at || '';
  return `
    <li class="history-item todo" data-kind="idea" data-id="${escapeHtml(idea.id)}">
      <label class="item-check" aria-label="完成待办">
        <input class="todo-toggle" type="checkbox" data-kind="idea" data-id="${escapeHtml(idea.id)}">
        <span class="item-check-mark"></span>
      </label>
      <div class="item-body">
        <p>${escapeHtml(idea.text || '')}</p>
        <time>${escapeHtml(formatTime(createdAt))}</time>
      </div>
      <span class="item-meta todo">待办</span>
    </li>
  `;
}

function buildArchivedIdeaMarkup(idea) {
  const completedAt = getIdeaCompletedAt(idea);
  return `
    <li class="history-item archived todo" data-kind="idea" data-id="${escapeHtml(idea.id)}">
      <label class="item-check" aria-label="取消完成">
        <input class="todo-toggle" type="checkbox" checked data-kind="idea" data-id="${escapeHtml(idea.id)}">
        <span class="item-check-mark"></span>
      </label>
      <div class="item-body">
        <p>${escapeHtml(idea.text || '')}</p>
        <time>完成于 ${escapeHtml(formatTime(completedAt))}</time>
      </div>
      <span class="item-meta todo">待办</span>
    </li>
  `;
}

function buildArchivedEventMarkup(event) {
  const completedAt = getEventCompletedAt(event);
  return `
    <li class="history-item archived event" data-kind="event" data-id="${escapeHtml(event.id)}">
      <div class="item-body">
        <p>${escapeHtml(event.title || '已完成事件')}</p>
        <time>完成于 ${escapeHtml(formatTime(completedAt))}</time>
      </div>
      <span class="item-meta event">日程</span>
    </li>
  `;
}

function getPendingIdeas() {
  return state.ideas.filter((idea) => !isIdeaCompleted(idea));
}

function getArchivedIdeas() {
  return state.ideas
    .filter((idea) => isIdeaCompleted(idea))
    .sort((left, right) => parseTimestamp(getIdeaCompletedAt(right)) - parseTimestamp(getIdeaCompletedAt(left)));
}

function getArchivedEvents() {
  return state.events
    .filter((event) => isEventCompleted(event))
    .sort((left, right) => parseTimestamp(getEventCompletedAt(right)) - parseTimestamp(getEventCompletedAt(left)));
}

function renderDashboard() {
  renderViewButtons();
  renderSyncButton();

  if (state.currentView === VIEW_MODES.active) {
    const pendingIdeas = getPendingIdeas();
    elements.viewTitle.textContent = '最近待办';
    elements.recentCount.textContent = String(pendingIdeas.length);
    elements.captureForm.classList.remove('hidden');

    if (!pendingIdeas.length) {
      renderEmptyState('还没有待办');
      return;
    }

    elements.recentList.innerHTML = pendingIdeas.map(buildPendingIdeaMarkup).join('');
    return;
  }

  const archivedIdeas = getArchivedIdeas().map((idea) => ({
    kind: 'idea',
    timestamp: parseTimestamp(getIdeaCompletedAt(idea)),
    markup: buildArchivedIdeaMarkup(idea),
  }));
  const archivedEvents = getArchivedEvents().map((event) => ({
    kind: 'event',
    timestamp: parseTimestamp(getEventCompletedAt(event)),
    markup: buildArchivedEventMarkup(event),
  }));
  const archivedItems = [...archivedIdeas, ...archivedEvents].sort((left, right) => right.timestamp - left.timestamp);

  elements.viewTitle.textContent = '待办收纳箱';
  elements.recentCount.textContent = String(archivedItems.length);
  elements.captureForm.classList.add('hidden');

  if (!archivedItems.length) {
    renderEmptyState('还没有已完成的待办或日程');
    return;
  }

  elements.recentList.innerHTML = archivedItems.map((item) => item.markup).join('');
}

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 422) {
    clearToken();
    clearUser();
    renderAuthState();
    throw new Error('登录已失效，请重新登录。');
  }

  return response;
}

async function syncDashboard(showStatus = false) {
  if (!getToken() || !getUser() || state.isSyncing) {
    return;
  }

  state.isSyncing = true;
  renderSyncButton();

  if (showStatus) {
    setAppStatus('同步中...');
  }

  try {
    const [ideasResponse, eventsResponse] = await Promise.all([
      apiRequest('/ideas'),
      apiRequest('/events'),
    ]);

    if (!ideasResponse.ok) {
      throw new Error('加载待办失败');
    }

    if (!eventsResponse.ok) {
      throw new Error('加载事件失败');
    }

    const [ideas, events] = await Promise.all([
      ideasResponse.json(),
      eventsResponse.json(),
    ]);

    state.ideas = Array.isArray(ideas) ? ideas : [];
    state.events = Array.isArray(events) ? events : [];
    renderDashboard();

    if (showStatus) {
      setAppStatus('已同步');
    }
  } catch (error) {
    const message = normalizeRequestError(error);
    setAppStatus(message, true);
    if (!state.ideas.length && !state.events.length) {
      renderEmptyState(message);
      elements.recentCount.textContent = '0';
    }
  } finally {
    state.isSyncing = false;
    renderSyncButton();
  }
}

function ensureSyncTimer(isAuthenticated) {
  if (state.syncIntervalId) {
    window.clearInterval(state.syncIntervalId);
    state.syncIntervalId = null;
  }

  if (!isAuthenticated) {
    return;
  }

  state.syncIntervalId = window.setInterval(() => {
    void syncDashboard(false);
  }, SYNC_INTERVAL_MS);
}

async function login(username, password) {
  const response = await fetch(`${getApiBase()}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    let message = '登录失败';
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return response.json();
}

async function submitIdea(text) {
  const response = await apiRequest('/ideas', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let message = '提交失败';
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return response.json();
}

async function updateIdeaCompletion(ideaId, nextCompleted) {
  const response = await apiRequest(`/ideas/${ideaId}`, {
    method: 'PUT',
    body: JSON.stringify({ isCompleted: nextCompleted }),
  });

  if (!response.ok) {
    let message = '更新待办状态失败';
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return response.json();
}

function renderAuthState() {
  const token = getToken();
  const user = getUser();
  const isAuthenticated = Boolean(token && user);

  elements.loginPanel.classList.toggle('hidden', isAuthenticated);
  elements.capturePanel.classList.toggle('hidden', !isAuthenticated);
  elements.apiBaseInput.value = getApiBase();
  updateActionStates();
  renderDashboard();
  ensureSyncTimer(isAuthenticated);

  if (isAuthenticated) {
    setLoginStatus('');
    setCaptureStatus('');
    setAppStatus('');
    void syncDashboard(false);
    window.setTimeout(() => elements.ideaInput.focus(), 0);
    return;
  }

  elements.passwordInput.value = '';
  state.ideas = [];
  state.events = [];
  elements.recentCount.textContent = '0';
  setCaptureStatus('');
  setAppStatus('');
  setLoginStatus('');
  renderEmptyState('暂无记录');
  window.setTimeout(() => elements.usernameInput.focus(), 0);
}

async function initializeWindowControls() {
  state.currentAppVersion = await getVersion();
  setSettingsVersionText(`当前版本 ${state.currentAppVersion}`);
  updateActionStates();
  renderSyncButton();
  renderViewButtons();
  renderPinButton();

  try {
    let pinned = await invoke('get_window_pinned');
    const preferredPinned = getPinnedPreference();

    if (preferredPinned !== pinned) {
      pinned = await invoke('set_window_pinned', { pinned: preferredPinned });
    }

    state.isWindowPinned = Boolean(pinned);
    savePinnedPreference(state.isWindowPinned);
    renderPinButton();
  } catch (error) {
    elements.pinButton.disabled = true;
    setAppStatus(error?.message || '当前无法读取置顶状态。', true);
  }
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const apiBase = normalizeApiBase(elements.apiBaseInput.value);
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;

  saveApiBase(apiBase);
  elements.loginButton.disabled = true;
  setLoginStatus('登录中...');

  try {
    const payload = await login(username, password);
    setToken(payload.access_token);
    setUser(payload.user);
    renderAuthState();
  } catch (error) {
    setLoginStatus(error.message || '登录失败', true);
  } finally {
    elements.loginButton.disabled = false;
  }
});

elements.captureForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = elements.ideaInput.value.trim();
  if (!text) {
    setCaptureStatus('请输入待办内容。', true);
    elements.ideaInput.focus();
    return;
  }

  elements.submitButton.disabled = true;
  setCaptureStatus('正在记录...');

  try {
    await submitIdea(text);
    elements.ideaInput.value = '';
    setCaptureStatus('已记录');
    await syncDashboard(false);
  } catch (error) {
    setCaptureStatus(error.message || '提交失败', true);
  } finally {
    elements.submitButton.disabled = false;
    elements.ideaInput.focus();
  }
});

elements.recentList.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('.todo-toggle');
  if (!checkbox) {
    return;
  }

  const ideaId = checkbox.dataset.id;
  const nextCompleted = checkbox.checked;
  checkbox.disabled = true;

  try {
    await updateIdeaCompletion(ideaId, nextCompleted);
    setAppStatus(nextCompleted ? '已完成待办' : '已恢复待办');
    await syncDashboard(false);
  } catch (error) {
    checkbox.checked = !nextCompleted;
    setAppStatus(error.message || '更新待办状态失败', true);
  } finally {
    checkbox.disabled = false;
  }
});

elements.viewActiveButton.addEventListener('click', () => {
  setCurrentView(VIEW_MODES.active);
});

elements.viewArchiveButton.addEventListener('click', () => {
  setCurrentView(VIEW_MODES.archive);
});

elements.syncButton.addEventListener('click', async () => {
  await syncDashboard(true);
});

elements.settingsRefreshButton.addEventListener('click', async () => {
  setSettingsMenuOpen(false);
  await syncDashboard(true);
});

elements.settingsVersionButton.addEventListener('click', async () => {
  await checkForUpdates();
});

elements.settingsLogoutButton.addEventListener('click', () => {
  setSettingsMenuOpen(false);
  clearToken();
  clearUser();
  renderAuthState();
});

elements.settingsButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const isExpanded = elements.settingsButton.getAttribute('aria-expanded') === 'true';
  setSettingsMenuOpen(!isExpanded);
});

elements.pinButton.addEventListener('click', async () => {
  elements.pinButton.disabled = true;

  try {
    const pinned = await invoke('set_window_pinned', { pinned: !state.isWindowPinned });
    state.isWindowPinned = Boolean(pinned);
    savePinnedPreference(state.isWindowPinned);
    renderPinButton();
    setAppStatus(state.isWindowPinned ? '已置顶' : '已取消置顶');
  } catch (error) {
    setAppStatus(error?.message || '置顶设置失败。', true);
  } finally {
    elements.pinButton.disabled = false;
  }
});

elements.dialogConfirmButton.addEventListener('click', () => {
  closeDialog(true);
});

elements.dialogCancelButton.addEventListener('click', () => {
  closeDialog(false);
});

elements.dialogBackdrop.addEventListener('click', (event) => {
  if (event.target === elements.dialogBackdrop) {
    closeDialog(false);
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.settings-shell')) {
    setSettingsMenuOpen(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!elements.dialogBackdrop.classList.contains('hidden')) {
      closeDialog(false);
      return;
    }

    setSettingsMenuOpen(false);
  }
});

elements.ideaInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    elements.captureForm.requestSubmit();
  }
});

document.documentElement.addEventListener('mouseenter', () => {
  void invoke('handle_window_hover', { hovering: true }).catch(() => {});
});

document.documentElement.addEventListener('mouseleave', () => {
  void invoke('handle_window_hover', { hovering: false }).catch(() => {});
});

renderDashboard();
void initializeWindowControls();
renderAuthState();