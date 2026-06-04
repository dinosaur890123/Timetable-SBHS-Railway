const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL || '/api';

const getHeaders = () => {
    const token = localStorage.getItem('sbhs_access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

/**
 * Creates a Stripe checkout session for Synchron Pro subscription or donations
 * @param {string|null} priceId - Stripe Price ID. If null, defaults to server's configured price ID.
 * @param {string} mode - 'subscription' or 'payment'
 * @returns {Promise<{url: string, mock?: boolean}>} Checkout session URL
 */
export const createCheckoutSession = async (priceId = null, mode = 'subscription') => {
    try {
        const response = await fetch(`${API_BASE_URL}/billing/create-checkout-session`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ priceId, mode })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to initiate checkout session');
        }
        return await response.json();
    } catch (error) {
        console.error("Billing API Error (createCheckoutSession):", error);
        throw error;
    }
};

/**
 * Creates a Stripe billing portal session to manage subscription
 * @returns {Promise<{url: string, mock?: boolean}>} Customer Portal URL
 */
export const createPortalSession = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/billing/create-portal-session`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to initiate billing portal session');
        }
        return await response.json();
    } catch (error) {
        console.error("Billing API Error (createPortalSession):", error);
        throw error;
    }
};

/**
 * Updates the user's profile settings (e.g., supporter checkbox toggle)
 * @param {boolean} showSupporter - Whether to show the user's name as a supporter
 * @returns {Promise<any>}
 */
export const updateProfileSettings = async (showSupporter) => {
    try {
        const response = await fetch(`${API_BASE_URL}/users/profile`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ showSupporter })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to update profile settings');
        }
        return await response.json();
    } catch (error) {
        console.error("Billing API Error (updateProfileSettings):", error);
        throw error;
    }
};

/**
 * Saves the user's dashboard layout to the server
 * @param {Array} layout - Array of widgets with their positioning properties
 * @returns {Promise<any>}
 */
export const saveDashboardLayout = async (layout) => {
    try {
        const response = await fetch(`${API_BASE_URL}/users/dashboard-layout`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ layout })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to save dashboard layout');
        }
        return await response.json();
    } catch (error) {
        console.error("Dashboard API Error (saveDashboardLayout):", error);
        throw error;
    }
};



