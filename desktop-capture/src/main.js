const STORAGE_KEYS = {
  apiBase: 'tonybase.desktop.apiBase',
  token: 'tonybase.desktop.accessToken',
  user: 'tonybase.desktop.user',
};

const DEFAULT_API_BASE = 'https://dailymanagement.tonybase.site';

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
  refreshButton: document.getElementById('refresh-button'),
  logoutButton: document.getElementById('logout-button'),
  loginStatus: document.getElementById('login-status'),
  captureStatus: document.getElementById('capture-status'),
  welcomeText: document.getElementById('welcome-text'),
  recentList: document.getElementById('recent-list'),
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

function setLoginStatus(message, isError = false) {
  elements.loginStatus.textContent = message;
  elements.loginStatus.style.color = isError ? '#b42318' : '';
}

function setCaptureStatus(message, isError = false) {
  elements.captureStatus.textContent = message;
  elements.captureStatus.style.color = isError ? '#b42318' : '';
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

elements.refreshButton.addEventListener('click', async () => {
  await fetchRecentIdeas();
  setCaptureStatus('最近记录已刷新。');
});

elements.logoutButton.addEventListener('click', () => {
  clearToken();
  clearUser();
  renderAuthState();
});

elements.ideaInput.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    elements.captureForm.requestSubmit();
  }
});

renderAuthState();
