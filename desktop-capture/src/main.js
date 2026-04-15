import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';

const STORAGE_KEYS = {
  apiBase: 'tonybase.desktop.apiBase',
  token: 'tonybase.desktop.accessToken',
  user: 'tonybase.desktop.user',
  pinned: 'tonybase.desktop.windowPinned',
};

const DEFAULT_API_BASE = 'https://dailymanagement.tonybase.site';
const DESKTOP_METADATA_PATH = '/downloads/metadata/desktop-latest.json';

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
  clearButton: document.getElementById('clear-button'),
  settingsButton: document.getElementById('settings-button'),
  settingsMenu: document.getElementById('settings-menu'),
  settingsVersion: document.getElementById('settings-version'),
  settingsRefreshButton: document.getElementById('settings-refresh-button'),
  settingsVersionButton: document.getElementById('settings-version-button'),
  settingsLogoutButton: document.getElementById('settings-logout-button'),
  pinButton: document.getElementById('pin-button'),
  minimizeButton: document.getElementById('minimize-button'),
  closeButton: document.getElementById('close-button'),
  loginStatus: document.getElementById('login-status'),
  captureStatus: document.getElementById('capture-status'),
  windowStatus: document.getElementById('window-status'),
  welcomeText: document.getElementById('welcome-text'),
  recentList: document.getElementById('recent-list'),
  dialogBackdrop: document.getElementById('dialog-backdrop'),
  dialogTitle: document.getElementById('dialog-title'),
  dialogMessage: document.getElementById('dialog-message'),
  dialogCancelButton: document.getElementById('dialog-cancel-button'),
  dialogConfirmButton: document.getElementById('dialog-confirm-button'),
};

const currentWindow = getCurrentWindow();
let isWindowPinned = false;
let currentAppVersion = '';
let dialogResolver = null;

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

function setLoginStatus(message, isError = false) {
  elements.loginStatus.textContent = message;
  elements.loginStatus.style.color = isError ? '#b42318' : '';
}

function setCaptureStatus(message, isError = false) {
  elements.captureStatus.textContent = message;
  elements.captureStatus.style.color = isError ? '#b42318' : '';
}

function setWindowStatus(message, isError = false) {
  elements.windowStatus.textContent = message;
  elements.windowStatus.style.color = isError ? '#b42318' : '';
}

function setSettingsMenuOpen(open) {
  elements.settingsMenu.classList.toggle('hidden', !open);
  elements.settingsButton.setAttribute('aria-expanded', String(open));
}

function updateSettingsActionsState() {
  const isAuthenticated = Boolean(getToken() && getUser());
  elements.settingsRefreshButton.disabled = !isAuthenticated;
  elements.settingsLogoutButton.disabled = !isAuthenticated;
}

function setSettingsVersionText(message) {
  elements.settingsVersion.textContent = message;
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
    dialogResolver = resolve;
  });
}

function closeDialog(confirmed) {
  elements.dialogBackdrop.classList.add('hidden');
  elements.dialogBackdrop.setAttribute('aria-hidden', 'true');

  if (dialogResolver) {
    const resolve = dialogResolver;
    dialogResolver = null;
    resolve(confirmed);
  }
}

function getDesktopMetadataUrl() {
  try {
    return new URL(DESKTOP_METADATA_PATH, `${getApiBase()}/`).toString();
  } catch {
    return `${DEFAULT_API_BASE}${DESKTOP_METADATA_PATH}`;
  }
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
  const response = await fetch(getDesktopMetadataUrl(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('暂时无法获取版本信息。');
  }

  const metadata = await response.json();
  if (!metadata || !metadata.version) {
    throw new Error('版本信息格式不完整。');
  }

  return metadata;
}

async function checkForUpdates() {
  setSettingsMenuOpen(false);
  elements.settingsVersionButton.disabled = true;
  setWindowStatus('正在检测新版本...');

  try {
    const metadata = await fetchDesktopReleaseMetadata();
    const latestVersion = metadata.version;
    const downloadUrl = metadata.latestDownloadUrl || metadata.downloadUrl;

    if (!downloadUrl) {
      throw new Error('服务器返回了版本号，但没有可用下载地址。');
    }

    setSettingsVersionText(`当前版本 ${currentAppVersion}，最新版本 ${latestVersion}`);

    if (compareVersions(latestVersion, currentAppVersion) <= 0) {
      setWindowStatus(`当前已是最新版本 ${currentAppVersion}。`);
      await showDialog({
        title: '已是最新版本',
        message: `当前客户端版本是 ${currentAppVersion}，不需要更新。`,
      });
      return;
    }

    const shouldUpdate = await showDialog({
      title: `发现新版本 ${latestVersion}`,
      message: `当前版本 ${currentAppVersion}\n新版本 ${latestVersion}\n\n点击“立即更新”后，客户端会下载新版安装包并自动启动安装。`,
      confirmText: '立即更新',
      cancelText: '稍后',
    });

    if (!shouldUpdate) {
      setWindowStatus('已取消本次更新。');
      return;
    }

    setWindowStatus(`正在准备更新到 ${latestVersion}...`);
    await invoke('download_and_install_update', {
      downloadUrl,
      version: latestVersion,
    });
  } catch (error) {
    setWindowStatus(error?.message || '版本检测失败。', true);
    await showDialog({
      title: '更新失败',
      message: error?.message || '这次没有成功完成版本检测，请稍后重试。',
    });
  } finally {
    elements.settingsVersionButton.disabled = false;
  }
}

function renderPinButton() {
  elements.pinButton.textContent = isWindowPinned ? '取消置顶' : '置顶窗口';
  elements.pinButton.setAttribute('aria-pressed', String(isWindowPinned));
}

async function initializeWindowControls() {
  currentAppVersion = await getVersion();
  setSettingsVersionText(`当前版本 ${currentAppVersion}`);
  updateSettingsActionsState();
  renderPinButton();
  setWindowStatus('窗口支持拖拽边缘调整大小，也可以手动固定到最上层。');

  try {
    let pinned = await invoke('get_window_pinned');
    const preferredPinned = getPinnedPreference();

    if (preferredPinned !== pinned) {
      pinned = await invoke('set_window_pinned', { pinned: preferredPinned });
    }

    isWindowPinned = Boolean(pinned);
    savePinnedPreference(isWindowPinned);
    renderPinButton();
    setWindowStatus(
      isWindowPinned
        ? '窗口已固定在最上层，也支持拖拽边缘调整大小。'
        : '窗口支持拖拽边缘调整大小，也可以手动固定到最上层。'
    );
  } catch (error) {
    elements.pinButton.disabled = true;
    setWindowStatus(error?.message || '当前无法读取窗口状态。', true);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

async function fetchRecentIdeas() {
  elements.recentList.innerHTML = '<li class="empty-state">正在加载最近记录...</li>';

  try {
    const response = await apiRequest('/ideas');
    if (!response.ok) {
      throw new Error('加载最近记录失败');
    }

    const ideas = await response.json();
    if (!Array.isArray(ideas) || ideas.length === 0) {
      elements.recentList.innerHTML = '<li class="empty-state">还没有记录，先写下第一条。</li>';
      return;
    }

    elements.recentList.innerHTML = ideas.slice(0, 8).map((idea) => {
      const createdAt = idea.createdAt || idea.created_at || '';
      return `
        <li class="history-item">
          <p>${escapeHtml(idea.text || '')}</p>
          <time>${escapeHtml(formatTime(createdAt))}</time>
        </li>
      `;
    }).join('');
  } catch (error) {
    elements.recentList.innerHTML = `<li class="empty-state">${escapeHtml(error.message || '暂时无法加载最近记录。')}</li>`;
  }
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
      // Ignore JSON parse failures and keep fallback text.
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
      // Ignore JSON parse failures and keep fallback text.
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
  updateSettingsActionsState();

  if (isAuthenticated) {
    elements.welcomeText.textContent = `${user.username}，现在可以直接记。`;
    setCaptureStatus('准备就绪。');
    void fetchRecentIdeas();
    setTimeout(() => elements.ideaInput.focus(), 0);
    return;
  }

  elements.passwordInput.value = '';
  setLoginStatus('首次启动需要登录一次。');
  setTimeout(() => elements.usernameInput.focus(), 0);
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
    setCaptureStatus('请输入一句要记录的内容。', true);
    elements.ideaInput.focus();
    return;
  }

  elements.submitButton.disabled = true;
  setCaptureStatus('正在提交...');

  try {
    await submitIdea(text);
    elements.ideaInput.value = '';
    setCaptureStatus('已记录，继续写下一条。');
    await fetchRecentIdeas();
  } catch (error) {
    setCaptureStatus(error.message || '提交失败', true);
  } finally {
    elements.submitButton.disabled = false;
    elements.ideaInput.focus();
  }
});

elements.clearButton.addEventListener('click', () => {
  elements.ideaInput.value = '';
  setCaptureStatus('输入已清空。');
  elements.ideaInput.focus();
});

elements.settingsRefreshButton.addEventListener('click', async () => {
  setSettingsMenuOpen(false);
  await fetchRecentIdeas();
  setCaptureStatus('最近记录已刷新。');
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
    const pinned = await invoke('set_window_pinned', { pinned: !isWindowPinned });
    isWindowPinned = Boolean(pinned);
    savePinnedPreference(isWindowPinned);
    renderPinButton();
    setWindowStatus(
      isWindowPinned
        ? '窗口已固定在最上层。'
        : '窗口已取消置顶，可被其他窗口覆盖。'
    );
  } catch (error) {
    setWindowStatus(error?.message || '置顶设置失败。', true);
  } finally {
    elements.pinButton.disabled = false;
  }
});

elements.minimizeButton.addEventListener('click', async () => {
  await currentWindow.minimize();
});

elements.closeButton.addEventListener('click', async () => {
  await currentWindow.hide();
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
  if (!elements.settingsMenu.contains(event.target) && event.target !== elements.settingsButton) {
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

elements.ideaInput.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    elements.captureForm.requestSubmit();
  }
});

void initializeWindowControls();
renderAuthState();
