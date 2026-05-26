const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL || '/api';

const getHeaders = () => {
    const token = localStorage.getItem('sbhs_access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

/**
 * Creates a Stripe checkout session for Synchron Pro subscription
 * @returns {Promise<{url: string, mock?: boolean}>} Checkout session URL
 */
export const createCheckoutSession = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/billing/create-checkout-session`, {
            method: 'POST',
            headers: getHeaders()
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
 * Toggles a mock subscription in local development environments where Stripe is disabled
 * @param {boolean} subscribe - Set true to subscribe, false to unsubscribe
 * @returns {Promise<{success: boolean, user?: any}>} Sync status
 */
export const mockActivateSubscription = async (subscribe = true) => {
    try {
        const response = await fetch(`${API_BASE_URL}/billing/mock-activate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ action: subscribe ? 'subscribe' : 'cancel' })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to update mock subscription status');
        }
        return await response.json();
    } catch (error) {
        console.error("Billing API Error (mockActivateSubscription):", error);
        throw error;
    }
};
