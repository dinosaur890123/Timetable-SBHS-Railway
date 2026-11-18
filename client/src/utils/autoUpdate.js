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
    try { sessionStorage.setItem(key, value); } catch {}
};

const reloadWhenSafe = (targetId) => {
    if (reloadQueued || readSession(RELOADED_FOR_KEY) === targetId) return;
    reloadQueued = true;

    const tryReload = () => {
        if (isEditing()) return;
        document.removeEventListener('focusout', onFocusOut);
        writeSession(RELOADED_FOR_KEY, targetId);
        window.location.reload();
    };
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
            swRegistration?.update().catch(() => {});
            reloadWhenSafe(latest.id);
        }
    } catch {
    }
};

export const startAutoUpdate = () => {
    registerSW({
        immediate: true,
        onRegisteredSW(_url, registration) {
            swRegistration = registration || null;
        },
        onNeedReload: checkForUpdate,
    });

    if (!import.meta.env.PROD) return;

    window.addEventListener('vite:preloadError', (event) => {
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
