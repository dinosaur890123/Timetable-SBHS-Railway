import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, CheckCircle2, ExternalLink, FileCode, Info, Sparkles, Users, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { useNotifications } from '../context/NotificationsContext';

// Suggestion ids the student has already seen in the panel; anything else
// counts as unread and keeps the red dot on the bell.
const SEEN_KEY = 'canvas_link_seen';
const NOTICE_SEEN_KEY = 'archived_notice_seen';
const BUILD_SEEN_KEY = 'build_notes_seen';
const BUILD_DISMISSED_KEY = 'build_notes_dismissed';
const SEEN_MAX = 300;

const readSeen = (key) => {
    try {
        const raw = localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(list) ? list : []);
    } catch {
        return new Set();
    }
};

const writeSeen = (key, seen) => {
    try {
        localStorage.setItem(key, JSON.stringify([...seen].slice(-SEEN_MAX)));
    } catch {
        // Storage blocked: the dot just reappears next visit.
    }
};

// Stable id for a build note so read/dismissed state survives refetches.
const buildNoteId = (note, index) =>
    note?.id ?? `${note?.version ?? ''}|${note?.title ?? ''}|${note?.createdAt ?? index}`;

const pageHidden = () => {
    try {
        const pages = JSON.parse(localStorage.getItem('hidden_pages') || '[]');
        return Array.isArray(pages) && pages.includes('canvas-links');
    } catch {
        return false;
    }
};

// Top-bar bell: the one-stop shop for notifications. Timed-out toasts are
// archived here, and every unanswered class-link suggestion is listed too —
// including ones the student dismissed with "Not now" — so ignored prompts
// still get voted on instead of stalling a link's verification.
const CanvasLinkNotifications = ({
    aiDisabled = false,
    aiGloballyDisabled = false,
    aiBannerDismissed = false,
    onEnableAi,
    onDismissAi,
    buildNotes = [],
    onOpenBuildNotes
}) => {
    const { pending, vote, linkNotices, markLinkNoticesRead } = useCanvasLinks();
    const { items: notices, remove: removeNotice, clear: clearNotices } = useNotifications();
    const [open, setOpen] = useState(false);
    const [seen, setSeen] = useState(() => readSeen(SEEN_KEY));
    const [seenNotices, setSeenNotices] = useState(() => readSeen(NOTICE_SEEN_KEY));
    const [seenBuildNotes, setSeenBuildNotes] = useState(() => readSeen(BUILD_SEEN_KEY));
    const [dismissedBuildNotes, setDismissedBuildNotes] = useState(() => readSeen(BUILD_DISMISSED_KEY));
    // First run marks every existing note as dismissed so the drawer only ever
    // surfaces notes published after this point — no flood of old releases.
    const [buildNotesSeeded, setBuildNotesSeeded] = useState(() => localStorage.getItem(BUILD_DISMISSED_KEY) !== null);
    const [busyId, setBusyId] = useState(null);
    const [hidden, setHidden] = useState(pageHidden);
    const rootRef = useRef(null);

    // The canvas-links page can be switched off app-wide; timed-out toasts are
    // still worth listing, so only the suggestions section hides with it.
    const linksVisible = !hidden;
    const shownPending = linksVisible ? pending : [];
    const shownLinkNotices = linksVisible ? linkNotices : [];

    const showAiNotice = aiDisabled && !aiGloballyDisabled && !aiBannerDismissed;

    const buildNoteEntries = useMemo(
        () => buildNotes.map((note, i) => ({ note, id: buildNoteId(note, i) })),
        [buildNotes]
    );
    const shownBuildNotes = buildNoteEntries.filter(e => !dismissedBuildNotes.has(e.id));
    const unreadBuildNotes = shownBuildNotes.filter(e => !seenBuildNotes.has(e.id));

    const unread = useMemo(() => shownPending.filter(p => !seen.has(p.id)), [shownPending, seen]);
    const unreadNotices = useMemo(() => notices.filter(n => !seenNotices.has(n.id)), [notices, seenNotices]);
    const badgeCount = unread.length + unreadNotices.length + shownLinkNotices.length + unreadBuildNotes.length + (showAiNotice ? 1 : 0);
    const totalItems = notices.length + shownLinkNotices.length + shownPending.length + shownBuildNotes.length;

    const markSeen = (items = pending) => {
        if (items.length === 0) return;
        setSeen(prev => {
            const next = new Set(prev);
            items.forEach(p => next.add(p.id));
            writeSeen(SEEN_KEY, next);
            return next;
        });
    };

    const markNoticesSeen = (items = notices) => {
        if (items.length === 0) return;
        setSeenNotices(prev => {
            const next = new Set(prev);
            items.forEach(n => next.add(n.id));
            writeSeen(NOTICE_SEEN_KEY, next);
            return next;
        });
    };

    const markBuildNotesSeen = (items = shownBuildNotes) => {
        if (items.length === 0) return;
        setSeenBuildNotes(prev => {
            const next = new Set(prev);
            items.forEach(e => next.add(e.id));
            writeSeen(BUILD_SEEN_KEY, next);
            return next;
        });
    };

    const dismissBuildNote = (id) => {
        setDismissedBuildNotes(prev => {
            const next = new Set(prev);
            next.add(id);
            writeSeen(BUILD_DISMISSED_KEY, next);
            return next;
        });
    };

    // First run marks every existing note as dismissed so the drawer only ever
    // surfaces notes published after this point — no flood of old releases.
    useEffect(() => {
        if (!buildNotesSeeded && buildNotes.length > 0) {
            const seeded = new Set(buildNotes.map((n, i) => buildNoteId(n, i)));
            writeSeen(BUILD_DISMISSED_KEY, seeded);
            setDismissedBuildNotes(seeded);
            setBuildNotesSeeded(true);
        }
    }, [buildNotesSeeded, buildNotes]);

    // While the panel is open everything in it counts as seen — including the
    // server-side link notifications, which the server marks read in one go.
    useEffect(() => {
        if (open) {
            markSeen();
            markNoticesSeen();
            markBuildNotesSeen();
            if (linkNotices.length > 0) markLinkNoticesRead();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pending, notices, linkNotices, buildNoteEntries, dismissedBuildNotes]);

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

    if (hidden && notices.length === 0 && linkNotices.length === 0 && shownBuildNotes.length === 0 && !showAiNotice) return null;

    const send = async (item, value) => {
        setBusyId(item.id);
        const result = await vote(item.id, value);
        setBusyId(null);
        return result;
    };

    return (
        // static on mobile so the panel anchors to the full-width header
        // instead of the bell — otherwise a wide panel slides off-screen left.
        <div className="relative max-md:static" ref={rootRef}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label={badgeCount ? `${badgeCount} notifications` : 'Notifications'}
                aria-expanded={open}
                title="Notifications"
                className="relative w-8 h-8 grid place-items-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
                <Bell size={16} />
                {badgeCount > 0 && (
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
                        className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl border border-m-line bg-m-card m-shadow-lg max-md:left-3 max-md:right-3 max-md:top-full max-md:mt-2 max-md:w-auto"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-m-line">
                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Notifications</h3>
                            <div className="flex items-center gap-3">
                                {totalItems > 0 && (
                                    <span className="text-xs text-zinc-500">{totalItems} new</span>
                                )}
                                {notices.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={clearNotices}
                                        className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                        </div>

                        {totalItems === 0 && !showAiNotice ? (
                            <p className="px-4 py-8 text-center text-sm text-zinc-500">Nothing to review - you’re all caught up.</p>
                        ) : (
                            <>
                                {notices.length > 0 && (
                                    <section>
                                        <div className="px-4 pt-3 pb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                                            Updates
                                        </div>
                                        <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
                                            {notices.map(item => {
                                                const isResolved = item.type === 'resolved';
                                                const Icon = isResolved ? CheckCircle2 : Info;
                                                return (
                                                    <li key={item.id} className="px-4 py-3 flex items-start gap-2.5">
                                                        <Icon size={15} className={`shrink-0 mt-0.5 ${isResolved ? 'text-green-600 dark:text-green-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm text-zinc-900 dark:text-white leading-snug">
                                                                <span className="font-semibold">{item.title}</span>
                                                                {item.message && (
                                                                    <span className="text-zinc-600 dark:text-zinc-300"> — {item.message}</span>
                                                                )}
                                                            </div>
                                                            {item.at && (
                                                                <div className="mt-0.5 text-[11px] text-zinc-400">
                                                                    {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeNotice(item.id)}
                                                            aria-label="Dismiss"
                                                            className="shrink-0 mt-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                )}

                                {shownLinkNotices.length > 0 && (
                                    <section>
                                        <div className={`px-4 pt-3 pb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 ${notices.length > 0 ? 'border-t border-zinc-900/[0.06] dark:border-white/[0.06]' : ''}`}>
                                            Class link updates
                                        </div>
                                        <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
                                            {shownLinkNotices.map(item => (
                                                <li key={item.id} className="px-4 py-3 flex items-start gap-2.5">
                                                    <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                                                            {item.title}
                                                        </div>
                                                        <div className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug">
                                                            {item.message}
                                                        </div>
                                                        {item.createdAt && (
                                                            <div className="mt-0.5 text-[11px] text-zinc-400">
                                                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}

                                {shownPending.length > 0 && (
                                    <section>
                                        <div className={`px-4 pt-3 pb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 ${notices.length > 0 || shownLinkNotices.length > 0 ? 'border-t border-zinc-900/[0.06] dark:border-white/[0.06]' : ''}`}>
                                            Class link suggestions
                                        </div>
                                        <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
                                            {shownPending.map(item => (
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
                                    </section>
                                )}

                                {shownBuildNotes.length > 0 && (
                                    <section>
                                        <div className={`px-4 pt-3 pb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 ${notices.length > 0 || shownLinkNotices.length > 0 || shownPending.length > 0 ? 'border-t border-zinc-900/[0.06] dark:border-white/[0.06]' : ''}`}>
                                            Build notes
                                        </div>
                                        <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
                                            {shownBuildNotes.map(({ note, id }) => {
                                                const isUnread = !seenBuildNotes.has(id);
                                                return (
                                                    <li key={id} className="px-4 py-3 flex items-start gap-2.5">
                                                        <FileCode size={15} className="shrink-0 mt-0.5 text-violet-500 dark:text-violet-400" />
                                                        <button
                                                            type="button"
                                                            onClick={onOpenBuildNotes}
                                                            className="flex-1 min-w-0 text-left group"
                                                        >
                                                            <div className="flex items-center gap-1.5 text-sm text-zinc-900 dark:text-white leading-snug">
                                                                {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                                                                {note.version && (
                                                                    <span className="font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-400">{note.version}</span>
                                                                )}
                                                                <span className={`truncate ${isUnread ? 'font-medium' : ''}`}>{note.title}</span>
                                                            </div>
                                                            {note.createdAt && !Number.isNaN(new Date(note.createdAt)) && (
                                                                <div className="mt-0.5 text-[11px] text-zinc-400">
                                                                    {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                                                                </div>
                                                            )}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => dismissBuildNote(id)}
                                                            aria-label="Dismiss"
                                                            className="shrink-0 mt-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                )}

                                {showAiNotice && (
                                    <section>
                                        <div className={`px-4 pt-3 pb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 ${totalItems > 0 ? 'border-t border-zinc-900/[0.06] dark:border-white/[0.06]' : ''}`}>
                                            Sage
                                        </div>
                                        <div className="px-4 py-3 flex items-start gap-2.5">
                                            <Sparkles size={15} className="shrink-0 mt-0.5 text-violet-500 dark:text-violet-400" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-zinc-900 dark:text-white leading-snug">
                                                    Meet <span className="sage-name">Sage</span> — ask questions about your timetable. AI features are off by default; enable them here or in Settings.
                                                </div>
                                                <div className="mt-2 flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={onEnableAi}
                                                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors"
                                                    >
                                                        Enable AI
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={onDismissAi}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
                                                    >
                                                        Not now
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                )}
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CanvasLinkNotifications;
