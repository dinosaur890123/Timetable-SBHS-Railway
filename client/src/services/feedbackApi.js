import { getValidAccessToken } from './api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const getHeaders = async () => {
    const token = await getValidAccessToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const submitFeedback = async ({ category, severity, details }) => {
    try {
        const response = await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({ category, severity, details })
        });

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