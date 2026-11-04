import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCanvasLinks, saveCanvasLink, deleteCanvasLink, importCanvasLinks, fetchCommunityCanvasLinks, voteCanvasLink } from '../services/api';
import { DEFAULT_CANVAS_HOST, classKey, collectClasses, parseLinkInput } from '../utils/canvasLinks';

const CanvasLinksContext = createContext(null);

// Links saved on this device by older versions of the app; imported once.
const LEGACY_KEY = 'canvas_links';
// A read-only copy of the student's links, so they still work offline. Never
// written back to the server.
const CACHE_KEY = 'canvas_links_cache';
// Suggestions the student said "not now" to: { [id]: hide until (ms) }.
const SNOOZE_KEY = 'canvas_link_snoozed';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const schoolYear = () => Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric' }).format(new Date()));

const readJson = (key) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};
const writeJson = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage full or blocked: the cache is only a convenience.
    }
};

const readCache = () => {
    const cache = readJson(CACHE_KEY);
    return cache?.schoolYear === schoolYear() && cache.links && typeof cache.links === 'object' ? cache.links : {};
};

const readSnoozed = () => {
    const now = Date.now();
    const stored = readJson(SNOOZE_KEY) || {};
    return Object.fromEntries(Object.entries(stored).filter(([, until]) => typeof until === 'number' && until > now));
};

const errorMessage = (error, fallback) => (error?.status ? error.message : fallback);

export const CanvasLinksProvider = ({ children, completeTimetable, timetableData }) => {
    const [links, setLinks] = useState(readCache); // short class title -> url
    const [community, setCommunity] = useState({}); // class key -> { link, suggestions }
    const [canvasHost, setCanvasHost] = useState(DEFAULT_CANVAS_HOST);
    const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'offline'
    const [snoozed, setSnoozed] = useState(readSnoozed);

    const classes = useMemo(() => collectClasses(completeTimetable, timetableData), [completeTimetable, timetableData]);
    const classKeys = useMemo(() => [...classes.keys()].sort(), [classes]);
    const classKeysParam = classKeys.join(',');

    // Short title -> class key, for callers that don't pass a year. Titles that
    // appear in two year groups are left out rather than guessed.
    const titleToKey = useMemo(() => {
        const map = new Map();
        classes.forEach((period, key) => {
            map.set(period.title, map.has(period.title) ? null : key);
        });
        return map;
    }, [classes]);

    const storeLinks = useCallback((update) => {
        setLinks(prev => {
            const next = update(prev);
            writeJson(CACHE_KEY, { schoolYear: schoolYear(), links: next });
            return next;
        });
    }, []);

    const loadLinks = useCallback(async () => {
        const legacy = readJson(LEGACY_KEY);
        if (legacy && typeof legacy === 'object') {
            try {
                await importCanvasLinks(legacy);
                localStorage.removeItem(LEGACY_KEY);
            } catch (error) {
                // Keep it for next time unless the server says it's unusable.
                if (error?.status === 400) localStorage.removeItem(LEGACY_KEY);
            }
        }
        try {
            const data = await fetchCanvasLinks();
            const next = {};
            (data.links || []).forEach(link => { next[link.className] = link.canvasUrl; });
            storeLinks(() => next);
            if (data.canvasHost) setCanvasHost(data.canvasHost);
            setStatus('ready');
        } catch (error) {
            console.warn('Failed to load Canvas links; using the copy saved on this device:', error);
            setStatus('offline');
        }
    }, [storeLinks]);

    const loadCommunity = useCallback(async () => {
        try {
            const data = await fetchCommunityCanvasLinks(classKeysParam ? classKeysParam.split(',') : []);
            setCommunity(data.classes || {});
        } catch (error) {
            console.warn('Failed to load shared Canvas links:', error);
        }
    }, [classKeysParam]);

    useEffect(() => { loadLinks(); }, [loadLinks]);

    useEffect(() => {
        if (status === 'ready' && classKeysParam) loadCommunity();
    }, [status, classKeysParam, loadCommunity]);

    const keyFor = useCallback((title, year) => {
        // Always use year if provided - this ensures exact matching across years
        if (year != null && year !== '') {
            return classKey(year, title);
        }
        // Fallback: only use title-only key if it's unique (not ambiguous across years)
        const key = titleToKey.get(title);
        if (key === null) {
            console.warn('[canvasLinks] Class title is ambiguous across years, year is required:', title);
        }
        return key;
    }, [titleToKey]);

    // The link for a class: the student's own, else the one their class agreed on
    // (unless they reported it), else a suggestion they backed themselves.
    const getLink = useCallback((title, year) => {
        if (!title) return null;
        if (links[title]) return links[title];
        const entry = community[keyFor(title, year)];
        if (!entry) return null;
        if (entry.link && entry.link.myVote !== -1) return entry.link.canvasUrl;
        return entry.suggestions?.find(s => s.myVote === 1)?.canvasUrl || null;
    }, [links, community, keyFor]);

    // Saves a class's link. Resolves with { ok, shared } or { ok: false, error }.
    const saveLink = useCallback(async (title, input, year) => {
        const parsed = parseLinkInput(input, canvasHost);
        if (parsed.error) return { ok: false, error: parsed.error };
        const key = keyFor(title, year);
        try {
            const data = await saveCanvasLink(title, parsed.url, key || undefined);
            storeLinks(prev => ({ ...prev, [title]: data.link.canvasUrl }));
            if (key && data.community) setCommunity(prev => ({ ...prev, [key]: data.community }));
            return { ok: true, shared: data.shared };
        } catch (error) {
            return { ok: false, error: errorMessage(error, 'Couldn’t save. Check your connection and try again.') };
        }
    }, [canvasHost, keyFor, storeLinks]);

    const removeLink = useCallback(async (title) => {
        try {
            await deleteCanvasLink(title);
            storeLinks(prev => {
                const next = { ...prev };
                delete next[title];
                return next;
            });
            return { ok: true };
        } catch (error) {
            return { ok: false, error: errorMessage(error, 'Couldn’t remove the link. Check your connection and try again.') };
        }
    }, [storeLinks]);

    // vote: 1 = correct, -1 = wrong, 0 = take back.
    const vote = useCallback(async (id, value) => {
        try {
            const data = await voteCanvasLink(id, value);
            if (data.classKey) setCommunity(prev => ({ ...prev, [data.classKey]: data.community }));
            return { ok: true };
        } catch (error) {
            return { ok: false, error: errorMessage(error, 'Couldn’t send that. Check your connection and try again.') };
        }
    }, []);

    const snooze = useCallback((id) => {
        setSnoozed(prev => {
            const next = { ...prev, [id]: Date.now() + SNOOZE_MS };
            writeJson(SNOOZE_KEY, next);
            return next;
        });
    }, []);

    // Classmates' suggestions worth asking this student about: for classes they
    // have no link for yet, that they haven't voted on or put off.
    const prompts = useMemo(() => {
        const now = Date.now();
        const list = [];
        classes.forEach((period, key) => {
            if (links[period.title]) return;
            const entry = community[key];
            if (!entry || entry.link) return;
            entry.suggestions.forEach(suggestion => {
                if (suggestion.myVote === 0 && !(snoozed[suggestion.id] > now)) {
                    list.push({ ...suggestion, classKey: key, title: period.title });
                }
            });
        });
        return list.sort((a, b) => b.confirmations - a.confirmations);
    }, [classes, links, community, snoozed]);

    const value = useMemo(() => ({
        links,
        community,
        classes,
        canvasHost,
        status,
        prompts,
        getLink,
        keyFor,
        saveLink,
        removeLink,
        vote,
        snooze,
        reload: loadLinks
    }), [links, community, classes, canvasHost, status, prompts, getLink, keyFor, saveLink, removeLink, vote, snooze, loadLinks]);

    return (
        <CanvasLinksContext.Provider value={value}>
            {children}
        </CanvasLinksContext.Provider>
    );
};

export const useCanvasLinks = () => {
    const context = useContext(CanvasLinksContext);
    if (!context) {
        throw new Error('useCanvasLinks must be used within CanvasLinksProvider');
    }
    return context;
};
