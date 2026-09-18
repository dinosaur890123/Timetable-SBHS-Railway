const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || '/api';

// Requests that never settle leave the UI stuck on its loading state forever,
// so every admin call is bounded by a timeout and fails loudly instead.
const REQUEST_TIMEOUT_MS = 20000;

const apiFetch = async (url, options = {}) => {
    const { timeout = REQUEST_TIMEOUT_MS, ...init } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeout / 1000)}s: ${url}`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const getHeaders = () => {
    const token = localStorage.getItem('sbhs_access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const fetchAdminStats = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/stats`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch stats (HTTP ${response.status})`);
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const fetchUsers = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/users`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch users (HTTP ${response.status})`);
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const deleteUser = async (userId) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/users/${userId}`, {
             method: 'DELETE',
             headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete user');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const updateUser = async (userId, updates) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/users/${userId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error('Failed to update user');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const clearServerCache = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/cache/clear`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to clear server cache');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const fetchLogs = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/logs`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch logs (HTTP ${response.status})`);
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const setBroadcast = async (message, type = 'info', targetVersion = null) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/broadcast`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ message, type, targetVersion })
        });
        if (!response.ok) throw new Error('Failed to set broadcast');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const setMaintenanceMode = async (enabled) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/maintenance`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ maintenance: enabled })
        });
        if (!response.ok) throw new Error('Failed to toggle maintenance');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const registerUser = async (user) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/register`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(user)
        });
        
        if (!response.ok) {
             // Don't throw check - might be silent fail on frontend
             console.warn("Failed to register user to admin panel");
             return null;
        }
        return await response.json();
    } catch (error) {
        // Silent fail is better than blocking app usage
        console.error("Admin Registration Error (Silent):", error);
    }
};

export const promoteUserToAdmin = async (studentId) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/users/promote`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ studentId })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to promote user');
        }
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};


export const pruneOldLogs = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/maintenance/prune-logs`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to prune old logs');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};


export const updateAiConfig = async (provider, model) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/system/ai-config`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ provider, model })
        });
        if (!response.ok) throw new Error('Failed to update AI configuration');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const updateUiThemeConfig = async (defaultTheme, enabledThemes) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/system/ui-themes`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ defaultTheme, enabledThemes })
        });
        if (!response.ok) throw new Error('Failed to update interface themes');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const fetchAiLogs = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/ai/logs`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch AI logs');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const clearAiCache = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/ai/cache/clear`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to clear AI cache');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const fetchAdminFeedback = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/feedback`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch feedback entries');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const updateFeedbackStatus = async (feedbackId, status) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/feedback/${feedbackId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error('Failed to update feedback status');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const deleteFeedback = async (feedbackId) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/feedback/${feedbackId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete feedback');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const bulkUpdateFeedbackStatus = async (feedbackIds, status) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/feedback/bulk`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ ids: feedbackIds, status })
        });
        if (!response.ok) throw new Error('Failed to bulk update feedback status');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const bulkDeleteFeedback = async (feedbackIds) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/feedback/bulk`, {
            method: 'DELETE',
            headers: getHeaders(),
            body: JSON.stringify({ ids: feedbackIds })
        });
        if (!response.ok) throw new Error('Failed to bulk delete feedback');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const toggleUserBlacklist = async (userId, blacklisted) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/users/${userId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ blacklisted })
        });
        if (!response.ok) throw new Error('Failed to update user blacklist status');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

