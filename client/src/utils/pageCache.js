import { useEffect, useState } from 'react';

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

const store = new Map();
const inFlight = new Map();
const FRESH_FOR = 60 * 1000;

const SAVED_PREFIX = 'page_cache:v2:';
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
        const oldest = savedKeys()
            .map(k => ({ k, at: readSaved(k.slice(SAVED_PREFIX.length))?.at ?? 0 }))
            .sort((a, b) => a.at - b.at)
            .slice(0, 3);
        oldest.forEach(({ k }) => localStorage.removeItem(k));
        try { localStorage.setItem(SAVED_PREFIX + key, raw); } catch {}
    }
};

const lookup = (key) => {
    if (store.has(key)) return store.get(key);
    const saved = readSaved(key);
    if (saved) store.set(key, saved);
    return saved;
};

export const loadCached = (key, load) => {
    if (inFlight.has(key)) return inFlight.get(key);
    const previous = lookup(key)?.value;
    const request = load(previous)
        .then(value => {
            const entry = { value, at: Date.now() };
            store.set(key, entry);
            writeSaved(key, entry);
            return value;
        })
        .catch(err => {
            if (previous !== undefined) setServingCachedData(true);
            throw err;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
};

export const peekCached = (key) => lookup(key)?.value;

export const prefetchCached = (key, load) => {
    const hit = lookup(key);
    if (hit && Date.now() - hit.at < FRESH_FOR) return Promise.resolve();
    return loadCached(key, load).then(() => {}, () => {});
};

export const clearPageCache = () => {
    store.clear();
    savedKeys().forEach(k => {
        try { localStorage.removeItem(k); } catch {}
    });
};

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
    }, [key]);

    return { data, loading: !!key && data === undefined && !error, error };
};
