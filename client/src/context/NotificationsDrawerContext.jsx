import { createContext, useContext } from 'react';

// App-level notices the top-bar bell surfaces alongside canvas-link items and
// archived toasts: the Sage AI opt-in prompt and newly published build notes.
// App owns the underlying state (AI prefs, fetched notes, navigation) and
// provides everything the drawer needs so it doesn't have to be prop-drilled
// through the shell.
export const NotificationsDrawerContext = createContext(null);

export const useNotificationsDrawer = () => {
    const context = useContext(NotificationsDrawerContext);
    if (!context) {
        throw new Error('useNotificationsDrawer must be used inside NotificationsDrawerContext.Provider');
    }
    return context;
};
