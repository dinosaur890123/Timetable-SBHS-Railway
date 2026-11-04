import { useEffect, useState } from 'react';

// What each page has loaded, so opening it shows that at once and refreshes quietly underneath,
// instead of starting again from a spinner. Kept in memory for the session and saved on the device,
// so it also survives closing the app. Loads already on their way are shared.
//
// Saved copies are per student (keys include the student ID) and are wiped on sign-out with the
// rest of localStorage, and on every new sign-in (clearPageCache).
const store = new Map();
const inFlight = new Map();
const FRESH_FOR = 60 * 1000;

// Bump when the shape of what a page saves changes, so an old saved copy is never read back.
// v1 copies could hold an SBHS failure saved as empty data, so they're dropped.
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

// Copies saved by an older version are never read, so they're cleared out at start-up.
savedKeys().filter(k => !k.startsWith(SAVED_PREFIX)).forEach(k => {
    try { localStorage.removeItem(k); } catch { /* storage unavailable */ }
});

// The entry for a key: this session's, or the copy saved on the device.
const lookup = (key) => {
    if (store.has(key)) return store.get(key);
    const saved = readSaved(key);
    if (saved) store.set(key, saved);
    return saved;
};

export const loadCached = (key, load) => {
    if (inFlight.has(key)) return inFlight.get(key);
    const request = load()
        .then(value => {
            // A load where part failed (value.incomplete) never replaces a complete copy, and is
            // never saved on the device. It's kept for now but counts as stale, so the next visit
            // tries again instead of trusting it.
            if (value?.incomplete) {
                const previous = lookup(key);
                if (previous && !previous.value?.incomplete) return previous.value;
                store.set(key, { value, at: 0 });
                return value;
            }
            const entry = { value, at: Date.now() };
            store.set(key, entry);
            writeSaved(key, entry);
            return value;
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
