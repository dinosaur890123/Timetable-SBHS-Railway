import { getValidAccessToken } from './api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const getHeaders = async () => {
    const token = await getValidAccessToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const submitFeedback = async ({ category, severity, details, attachment }) => {
    try {
        const token = await getValidAccessToken();
        const headers = { 'Authorization': token ? `Bearer ${token}` : '' };

        const body = new FormData();
        body.append('category', category);
        body.append('severity', String(severity));
        body.append('details', details);
        if (attachment) body.append('attachment', attachment);

        const response = await fetch(`${API_URL}/feedback`, { method: 'POST', headers, body });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to submit feedback');
        }

        return await response.json();
    } catch (error) {
        console.error('Feedback API Error:', error);
        throw error;
    }
};

export const fetchMyFeedback = async () => {
    const response = await fetch(`${API_URL}/feedback`, { headers: await getHeaders() });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load your feedback');
    }
    const data = await response.json();
    return Array.isArray(data.feedback) ? data.feedback : [];
};

export const fetchFeedbackStatusNotifications = async () => {
    const response = await fetch(`${API_URL}/feedback/notifications`, { headers: await getHeaders() });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.feedbackStatusUpdates) ? data.feedbackStatusUpdates : [];
};
