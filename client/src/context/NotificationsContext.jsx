import { createContext, useContext } from 'react';

// Timed-out toasts land here instead of vanishing, so the top-bar bell stays
// the one-stop shop for every notification the app has shown. App owns the
// state (toasts live there) and provides { items, archive, remove, clear }.
export const NotificationsContext = createContext(null);

export const useNotifications = () => {
    const context = useContext(NotificationsContext);
    if (!context) {
        throw new Error('useNotifications must be used inside NotificationsContext.Provider');
    }
    return context;
};
