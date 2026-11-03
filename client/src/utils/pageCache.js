import { useEffect, useState } from 'react';

// What each page loaded this session, so coming back to it shows that at once and refreshes
// quietly underneath, instead of starting again from a spinner. Loads already on their way are shared.
const store = new Map();
const inFlight = new Map();
const FRESH_FOR = 60 * 1000;

export const loadCached = (key, load) => {
    if (inFlight.has(key)) return inFlight.get(key);
    const request = load()
        .then(value => {
            store.set(key, { value, at: Date.now() });
            return value;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
};

export const peekCached = (key) => store.get(key)?.value;

// { data, loading, error }. `loading` is only true the first time; later visits show the last data while
// it refreshes, and a refresh within a minute of the last one is skipped. A null key loads nothing.
export const useCachedLoad = (key, load) => {
    const [data, setData] = useState(() => (key ? peekCached(key) : undefined));
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!key) return;
        let live = true;
        const hit = store.get(key);
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
