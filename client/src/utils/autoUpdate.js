// Keeps every open copy of the app on the latest deploy, with no prompt.
// Each build writes /version.json; when it no longer matches the build running in
// this tab, we reload as soon as the user isn't typing into something.
import { registerSW } from 'virtual:pwa-register';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RELOADED_FOR_KEY = 'auto_update_reloaded_for';
const CHUNK_RELOAD_AT_KEY = 'auto_update_chunk_reload_at';

let swRegistration = null;
let reloadQueued = false;

const isEditing = () => {
    const el = document.activeElement;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

const readSession = (key) => {
    try { return sessionStorage.getItem(key); } catch { return null; }
};

const writeSession = (key, value) => {
    try { sessionStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

const reloadWhenSafe = (targetId) => {
    // Only try once per target build, so a stale CDN edge can't cause a reload loop
    if (reloadQueued || readSession(RELOADED_FOR_KEY) === targetId) return;
    reloadQueued = true;

    const tryReload = () => {
        if (isEditing()) return;
        document.removeEventListener('focusout', onFocusOut);
        writeSession(RELOADED_FOR_KEY, targetId);
        window.location.reload();
    };
    // focusout fires before focus moves, so wait a tick to see where it landed
    const onFocusOut = () => setTimeout(tryReload, 0);

    document.addEventListener('focusout', onFocusOut);
    tryReload();
};

const checkForUpdate = async () => {
    if (!navigator.onLine) return;
    try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const latest = await res.json();
        if (latest?.id && latest.id !== __APP_BUILD__.id) {
            // Refresh the offline cache in the background; pages load network-first, so the reload doesn't wait on it
            swRegistration?.update().catch(() => {});
            reloadWhenSafe(latest.id);
        }
    } catch {
        // Offline or a flaky network: try again on the next check
    }
};

export const startAutoUpdate = () => {
    registerSW({
        immediate: true,
        onRegisteredSW(_url, registration) {
            swRegistration = registration || null;
        },
        // A new service worker took over. Our own version check decides whether a reload is needed,
        // so a tab that already loaded the new build from the network isn't reloaded for nothing.
        onNeedReload: checkForUpdate,
    });

    // A lazy view's chunk is missing because a newer deploy replaced it: reload to pick up that deploy
    window.addEventListener('vite:preloadError', (event) => {
        // If we reloaded for this a moment ago and it's still failing, let the error surface instead of looping
        if (Date.now() - Number(readSession(CHUNK_RELOAD_AT_KEY) || 0) < 30 * 1000) return;
        event.preventDefault();
        writeSession(CHUNK_RELOAD_AT_KEY, String(Date.now()));
        window.location.reload();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
    });
    window.addEventListener('online', checkForUpdate);
    setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    checkForUpdate();
};
