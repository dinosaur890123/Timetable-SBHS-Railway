import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, ExternalLink, Users, X } from 'lucide-react';
import { useCanvasLinks } from '../context/CanvasLinksContext';

// Suggestion ids the student has already seen in the panel; anything else
// counts as unread and keeps the red dot on the bell.
const SEEN_KEY = 'canvas_link_seen';
const SEEN_MAX = 300;

const readSeen = () => {
    try {
        const raw = localStorage.getItem(SEEN_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(list) ? list : []);
    } catch {
        return new Set();
    }
};

const writeSeen = (seen) => {
    try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_MAX)));
    } catch {
        // Storage blocked: the dot just reappears next visit.
    }
};

const pageHidden = () => {
    try {
        const pages = JSON.parse(localStorage.getItem('hidden_pages') || '[]');
        return Array.isArray(pages) && pages.includes('canvas-links');
    } catch {
        return false;
    }
};

// Top-bar bell listing every unanswered class-link suggestion, including ones
// the student dismissed with "Not now" — so ignored prompts still get voted on
// instead of stalling a link's verification.
const CanvasLinkNotifications = () => {
    const { pending, vote } = useCanvasLinks();
    const [open, setOpen] = useState(false);
    const [seen, setSeen] = useState(readSeen);
    const [busyId, setBusyId] = useState(null);
    const [hidden, setHidden] = useState(pageHidden);
    const rootRef = useRef(null);

    const unread = useMemo(() => pending.filter(p => !seen.has(p.id)), [pending, seen]);

    const markSeen = (items = pending) => {
        if (items.length === 0) return;
        setSeen(prev => {
            const next = new Set(prev);
            items.forEach(p => next.add(p.id));
            writeSeen(next);
            return next;
        });
    };

    // While the panel is open everything in it counts as seen.
    useEffect(() => {
        if (open) markSeen();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pending]);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (hidden) return null;

    const send = async (item, value) => {
        setBusyId(item.id);
        const result = await vote(item.id, value);
        setBusyId(null);
        return result;
    };

    return (
        <div className="relative" ref={rootRef}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label={unread.length ? `${unread.length} link suggestions to review` : 'Link suggestions'}
                aria-expanded={open}
                title="Class link suggestions"
                className="relative w-8 h-8 grid place-items-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
                <Bell size={16} />
                {unread.length > 0 && (
                    <span className="absolute top-1 right-1 flex">
                        <span className="absolute inline-flex w-2 h-2 rounded-full bg-red-500 opacity-75 animate-ping" />
                        <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl border border-m-line bg-m-card m-shadow-lg"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-m-line">
                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Class link suggestions</h3>
                            {pending.length > 0 && (
                                <span className="text-xs text-zinc-500">{pending.length} to review</span>
                            )}
                        </div>

                        {pending.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-zinc-500">Nothing to review — you’re all caught up.</p>
                        ) : (
                            <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
                                {pending.map(item => (
                                    <li key={item.id} className="px-4 py-3 space-y-2">
                                        <div className="flex items-start gap-2.5">
                                            <div className="shrink-0 w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                                <Users size={13} className="text-violet-600 dark:text-violet-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                                    {item.className || item.title}
                                                </div>
                                                <div className="text-xs text-zinc-500">
                                                    {item.confirmations === 1 ? '1 classmate' : `${item.confirmations} classmates`} shared this link
                                                </div>
                                            </div>
                                        </div>
                                        <a
                                            href={item.canvasUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                                        >
                                            <span className="flex-1 min-w-0 truncate">{item.canvasUrl}</span>
                                            <ExternalLink size={12} className="shrink-0" />
                                        </a>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => send(item, 1)}
                                                disabled={busyId === item.id}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                <Check size={13} />
                                                {busyId === item.id ? 'Saving…' : 'Yes, use it'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => send(item, -1)}
                                                disabled={busyId === item.id}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                <X size={13} />
                                                Wrong link
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CanvasLinkNotifications;
