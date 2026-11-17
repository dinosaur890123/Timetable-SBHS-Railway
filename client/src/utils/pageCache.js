import { useEffect, useState } from 'react';

// Whether the data on screen came from a backup copy rather than the network: the
// service worker's offline copy (services/api.js) or a saved page whose refresh failed.
// Subscribers hear only actual changes.
let servingCachedData = false;
const cachedDataListeners = new Set();
export const setServingCachedData = (value) => {
    if (servingCachedData === value) return;
    servingCachedData = value;
    cachedDataListeners.forEach(listener => listener(value));
};
export const onCachedDataChange = (listener) => {
    cachedDataListeners.add(listener);
    listener(servingCachedData);
    return () => cachedDataListeners.delete(listener);
};

// What each page has loaded, so opening it shows that at once and refreshes quietly underneath,
// instead of starting again from a spinner. Kept in memory for the session and saved on the device,
// so it also survives closing the app. Loads already on their way are shared.
//
// Saved copies are per student (keys include the student ID) and are wiped on sign-out with the
// rest of localStorage, and on every new sign-in (clearPageCache).
const store = new Map();
const inFlight = new Map();
const FRESH_FOR = 60 * 1000;
// Keep recently used page data for smooth navigation, but don't let browsing
// through calendar months grow the session cache without bound.
const MAX_MEMORY_ENTRIES = 8;

const remember = (key, entry) => {
    // Map insertion order doubles as least-recently-used order.
    store.delete(key);
    store.set(key, entry);
    if (store.size > MAX_MEMORY_ENTRIES) {
        store.delete(store.keys().next().value);
    }
};

// Bump when the shape of what a page saves changes, so an old saved copy is never read back.
const SAVED_PREFIX = 'page_cache:v2:';
// One page's data larger than this isn't saved on the device (it's still kept for the session).
const MAX_SAVED_CHARS = 750 * 1000;

const readSaved = (key) => {
    try {
        const raw = localStorage.getItem(SAVED_PREFIX + key);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        return entry && typeof entry.at === 'number' && 'value' in entry ? entry : null;
    } catch {
        return null;
    }
};

const savedKeys = () => {
    try {
        return Object.keys(localStorage).filter(k => k.startsWith('page_cache:'));
    } catch {
        return [];
    }
};

const writeSaved = (key, entry) => {
    let raw;
    try {
        raw = JSON.stringify(entry);
    } catch {
        return;
    }
    if (raw.length > MAX_SAVED_CHARS) return;
    try {
        localStorage.setItem(SAVED_PREFIX + key, raw);
    } catch {
        // Storage full: make room by dropping the oldest saved pages, then try once more.
        const oldest = savedKeys()
            .map(k => ({ k, at: readSaved(k.slice(SAVED_PREFIX.length))?.at ?? 0 }))
            .sort((a, b) => a.at - b.at)
            .slice(0, 3);
        oldest.forEach(({ k }) => localStorage.removeItem(k));
        try { localStorage.setItem(SAVED_PREFIX + key, raw); } catch { /* still full: session only */ }
    }
};

// The entry for a key: this session's, or the copy saved on the device.
const lookup = (key) => {
    if (store.has(key)) {
        const entry = store.get(key);
        remember(key, entry);
        return entry;
    }
    const saved = readSaved(key);
    if (saved) remember(key, saved);
    return saved;
};

export const loadCached = (key, load) => {
    if (inFlight.has(key)) return inFlight.get(key);
    // The last copy is handed to the load so a failed section can fall back to it
    // instead of overwriting the backup with an empty placeholder.
    const previous = lookup(key)?.value;
    const request = load(previous)
        .then(value => {
            const entry = { value, at: Date.now() };
            remember(key, entry);
            writeSaved(key, entry);
            return value;
        })
        .catch(err => {
            // A failed refresh leaves the saved copy on screen: that's cached data.
            if (previous !== undefined) setServingCachedData(true);
            throw err;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
};

export const peekCached = (key) => lookup(key)?.value;

// Loads a page's data in the background unless a fresh copy is already here. Never throws.
export const prefetchCached = (key, load) => {
    const hit = lookup(key);
    if (hit && Date.now() - hit.at < FRESH_FOR) return Promise.resolve();
    return loadCached(key, load).then(() => {}, () => {});
};

// Forgets every page's data, here and on the device (a different student may be signing in).
export const clearPageCache = () => {
    store.clear();
    savedKeys().forEach(k => {
        try { localStorage.removeItem(k); } catch { /* storage unavailable */ }
    });
};

// { data, loading, error }. `loading` is only true when there's nothing to show yet; otherwise the
// last data shows while it refreshes, and a refresh within a minute of the last one is skipped.
// A null key loads nothing.
export const useCachedLoad = (key, load) => {
    const [data, setData] = useState(() => (key ? peekCached(key) : undefined));
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!key) return;
        let live = true;
        const hit = lookup(key);
        setData(hit?.value);
        setError(null);
        if (hit && Date.now() - hit.at < FRESH_FOR) return;

        loadCached(key, load)
            .then(value => { if (live) setData(value); })
            .catch(err => { if (live && !hit) setError(err); });
        return () => { live = false; };
        // `load` is recreated each render; the key says when it means something new.
    }, [key]);

    return { data, loading: !!key && data === undefined && !error, error };
};
