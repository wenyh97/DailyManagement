(function (global) {
    'use strict';

    if (typeof apiRequest !== 'function') {
        console.warn('[plansApi] Missing apiRequest helper. Ensure auth.js loads first.');
        global.plansApi = {
            list: async () => { throw new Error('apiRequest is not available'); },
            create: async () => { throw new Error('apiRequest is not available'); },
            update: async () => { throw new Error('apiRequest is not available'); },
            remove: async () => { throw new Error('apiRequest is not available'); },
            updateGoalStatus: async () => { throw new Error('apiRequest is not available'); },
            reorderGoals: async () => { throw new Error('apiRequest is not available'); },
            getExecutionQueue: async () => { throw new Error('apiRequest is not available'); },
            setExecutionQueue: async () => { throw new Error('apiRequest is not available'); },
            listTaskStatuses: async () => { throw new Error('apiRequest is not available'); },
            updateTaskStatus: async () => { throw new Error('apiRequest is not available'); },
            getTaskProgress: async () => { throw new Error('apiRequest is not available'); },
            resetTaskEvents: async () => { throw new Error('apiRequest is not available'); }
        };
        return;
    }

    async function parseResponse(response) {
        const contentType = response.headers.get('Content-Type') || '';
        let payload = null;
        try {
            if (contentType.includes('application/json')) {
                payload = await response.json();
            } else {
                payload = await response.text();
            }
        } catch (error) {
            console.warn('[plansApi] Failed to parse response payload:', error);
        }

        if (response.ok) {
            return payload;
        }

        const error = new Error(
            (payload && payload.error) || 'Planning API request failed'
        );
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    const plansApi = {
        async list() {
            const response = await apiRequest('/api/plans', 'GET');
            return parseResponse(response);
        },
        async create(body) {
            const response = await apiRequest('/api/plans', 'POST', body);
            return parseResponse(response);
        },
        async update(planId, body) {
            if (!planId) {
                throw new Error('planId is required');
            }
            const response = await apiRequest(`/api/plans/${planId}`, 'PUT', body);
            return parseResponse(response);
        },
        async remove(planId) {
            if (!planId) {
                throw new Error('planId is required');
            }
            const response = await apiRequest(`/api/plans/${planId}`, 'DELETE');
            return parseResponse(response);
        },
        async updateGoalStatus(goalId, body) {
            if (!goalId) {
                throw new Error('goalId is required');
            }
            const response = await apiRequest(`/api/plan-goals/${goalId}/status`, 'PATCH', body);
            return parseResponse(response);
        },
        async reorderGoals(planId, goalIds) {
            if (!planId) {
                throw new Error('planId is required');
            }
            if (!Array.isArray(goalIds) || goalIds.length === 0) {
                throw new Error('goalIds must be a non-empty array');
            }
            const response = await apiRequest(`/api/plans/${planId}/goal-order`, 'PATCH', {
                goal_ids: goalIds
            });
            return parseResponse(response);
        },
        async getExecutionQueue() {
            const response = await apiRequest('/api/goal-execution-queue', 'GET');
            return parseResponse(response);
        },
        async setExecutionQueue(items) {
            if (!Array.isArray(items)) {
                throw new Error('items must be an array');
            }
            const response = await apiRequest('/api/goal-execution-queue', 'PUT', { items });
            return parseResponse(response);
        },
        async listTaskStatuses() {
            const response = await apiRequest('/api/goal-task-statuses', 'GET');
            return parseResponse(response);
        },
        async updateTaskStatus(body) {
            if (!body || typeof body !== 'object') {
                throw new Error('body is required');
            }
            const response = await apiRequest('/api/goal-task-statuses', 'PATCH', body);
            return parseResponse(response);
        },
        async getTaskProgress() {
            const response = await apiRequest('/api/task-progress', 'GET');
            return parseResponse(response);
        },
        async resetTaskEvents(body) {
            if (!body || typeof body !== 'object') {
                throw new Error('body is required');
            }
            const response = await apiRequest('/api/task-events/reset', 'DELETE', body);
            return parseResponse(response);
        }
    };

    global.plansApi = plansApi;
})(window);
