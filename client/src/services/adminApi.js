const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || '/api';

const getHeaders = () => {
    const token = localStorage.getItem('sbhs_access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const fetchAdminStats = async () => {
    try {
        const response = await fetch(`${ADMIN_API_URL}/stats`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch stats');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const fetchUsers = async () => {
    try {
        const response = await fetch(`${ADMIN_API_URL}/users`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch users');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const deleteUser = async (userId) => {
    try {
        const response = await fetch(`${ADMIN_API_URL}/users/${userId}`, {
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
        const response = await fetch(`${ADMIN_API_URL}/users/${userId}`, {
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
        const response = await fetch(`${ADMIN_API_URL}/cache/clear`, {
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
        const response = await fetch(`${ADMIN_API_URL}/logs`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch logs');
        return await response.json();
    } catch (error) {
        console.error("Admin API Error:", error);
        throw error;
    }
};

export const setBroadcast = async (message, type = 'info') => {
    try {
        const response = await fetch(`${ADMIN_API_URL}/broadcast`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ message, type })
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
        const response = await fetch(`${ADMIN_API_URL}/maintenance`, {
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
        const response = await fetch(`${ADMIN_API_URL}/register`, {
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
        const response = await fetch(`${ADMIN_API_URL}/users/promote`, {
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
        const response = await fetch(`${ADMIN_API_URL}/maintenance/prune-logs`, {
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
        const response = await fetch(`${ADMIN_API_URL}/system/ai-config`, {
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

export const fetchAiLogs = async () => {
    try {
        const response = await fetch(`${ADMIN_API_URL}/ai/logs`, {
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
        const response = await fetch(`${ADMIN_API_URL}/ai/cache/clear`, {
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




