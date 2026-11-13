import { getValidAccessToken, refreshAccessToken } from './api';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || '/api';

// Requests that never settle leave the UI stuck on its loading state forever,
// so every admin call is bounded by a timeout and fails loudly instead.
const REQUEST_TIMEOUT_MS = 20000;

const apiFetch = async (url, options = {}) => {
    const { timeout = REQUEST_TIMEOUT_MS, retried = false, ...init } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        // A token SBHS revoked early still looks fresh here: renew it once and retry.
        if (response.status === 401 && !retried && init.headers?.Authorization) {
            const fresh = await refreshAccessToken();
            if (fresh) {
                return apiFetch(url, { ...options, retried: true, headers: { ...init.headers, Authorization: `Bearer ${fresh}` } });
            }
        }
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeout / 1000)}s: ${url}`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const getHeaders = async () => {
    const token = await getValidAccessToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const fetchAdminStats = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/stats`, {
            headers: await getHeaders()
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
            headers: await getHeaders()
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
             headers: await getHeaders()
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
            headers: await getHeaders(),
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
            headers: await getHeaders()
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
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch logs (HTTP ${response.status})`);
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const setBroadcast = async (message, type = 'info') => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/broadcast`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ message, type })
        });
        if (!response.ok) throw new Error('Failed to set broadcast');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

// Admin: notification broadcasts sent in the last 30 days, with dismissal counts.
export const fetchBroadcastHistory = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/broadcast/history`, {
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch broadcast history (HTTP ${response.status})`);
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
            headers: await getHeaders(),
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
            headers: await getHeaders(),
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
            headers: await getHeaders(),
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
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error('Failed to prune old logs');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};


export const updateHiddenPages = async (hiddenPages) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/system/hidden-pages`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ hiddenPages })
        });
        if (!response.ok) throw new Error('Failed to update hidden pages');
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
            headers: await getHeaders(),
            body: JSON.stringify({ provider, model })
        });
        if (!response.ok) throw new Error('Failed to update AI configuration');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const setAiDisabled = async (disabled) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/system/ai-disabled`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ disabled })
        });
        if (!response.ok) throw new Error('Failed to update AI status');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const fetchAiLogs = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/ai/logs`, {
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch AI logs (HTTP ${response.status})`);
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
            headers: await getHeaders()
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
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch feedback entries (HTTP ${response.status})`);
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
            headers: await getHeaders(),
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
            headers: await getHeaders()
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
            headers: await getHeaders(),
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
            headers: await getHeaders(),
            body: JSON.stringify({ ids: feedbackIds })
        });
        if (!response.ok) throw new Error('Failed to bulk delete feedback');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

// Data deletion requests (Privacy page → admin panel)
export const fetchDeletionRequests = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/deletion-requests`, {
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch deletion requests (HTTP ${response.status})`);
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

// status: 'completed' deletes the student's server-side data, 'dismissed' closes the request.
export const updateDeletionRequest = async (id, status) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/deletion-requests/${id}`, {
            method: 'PUT',
            headers: await getHeaders(),
            body: JSON.stringify({ status })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to update deletion request');
        }
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
            headers: await getHeaders(),
            body: JSON.stringify({ blacklisted })
        });
        if (!response.ok) throw new Error('Failed to update user blacklist status');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

// --- Build Notes Admin APIs ---

export const fetchAdminBuildNotes = async () => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/build-notes`, {
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch build notes (HTTP ${response.status})`);
        const data = await response.json();
        return data?.notes || [];
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const saveAdminBuildNote = async (note) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/build-notes`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify(note)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Failed to save build note (HTTP ${response.status})`);
        }
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const deleteAdminBuildNote = async (id) => {
    try {
        const response = await apiFetch(`${ADMIN_API_URL}/admin/build-notes/${id}`, {
            method: 'DELETE',
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete build note');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};


// Shared Canvas links (moderation)
export const fetchAdminCanvasLinks = async () => {
    const response = await apiFetch(`${ADMIN_API_URL}/admin/canvas-links/community`, {
        headers: await getHeaders()
    });
    if (!response.ok) throw new Error(`Failed to fetch shared Canvas links (HTTP ${response.status})`);
    return response.json();
};

// lockedStatus: 'verified' pins the link for its class, 'rejected' hides it,
// null hands it back to students' votes.
export const setAdminCanvasLinkStatus = async (id, lockedStatus) => {
    const response = await apiFetch(`${ADMIN_API_URL}/admin/canvas-links/community/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ lockedStatus })
    });
    if (!response.ok) throw new Error(`Failed to update link (HTTP ${response.status})`);
    return response.json();
};

// Clears every report on a link; backers are kept.
export const resetAdminCanvasLinkReports = async (id) => {
    const response = await apiFetch(`${ADMIN_API_URL}/admin/canvas-links/community/${encodeURIComponent(id)}/reset-reports`, {
        method: 'POST',
        headers: await getHeaders()
    });
    if (!response.ok) throw new Error(`Failed to reset reports (HTTP ${response.status})`);
    return response.json();
};

export const deleteAdminCanvasLink = async (id) => {
    const response = await apiFetch(`${ADMIN_API_URL}/admin/canvas-links/community/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await getHeaders()
    });
    if (!response.ok) throw new Error(`Failed to delete link (HTTP ${response.status})`);
    return response.json();
};
