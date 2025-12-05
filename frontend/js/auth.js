const API_BASE_URL = 'http://localhost:5000';

function getToken() {
    return localStorage.getItem('access_token');
}

function setToken(token) {
    localStorage.setItem('access_token', token);
}

function removeToken() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
}

function getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

function setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
}

async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        if (response.status === 401 || response.status === 422) {
            // Token expired, invalid, or unprocessable
            // Don't redirect if we are already on login page
            if (!window.location.pathname.endsWith('login.html')) {
                removeToken();
                window.location.href = 'login.html';
            }
            return response; // Let the caller handle the error if needed
        }
        return response;
    } catch (error) {
        console.error("API Request failed", error);
        throw error;
    }
}

function checkLogin() {
    if (!getToken()) {
        window.location.href = 'login.html';
    }
}

function logout() {
    removeToken();
    window.location.href = 'login.html';
}
