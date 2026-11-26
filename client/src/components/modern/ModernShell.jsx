import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Home, CalendarDays, Newspaper, Award, Clipboard, Settings, Mail,
    MessageSquare, ShieldCheck, Search, Sun, Moon, Menu, ArrowRight, LogOut,
    CornerDownLeft, WifiOff, Database, BookOpen, Globe, ArrowUpRight, FileCode
} from 'lucide-react';
import CanvasLinkNotifications from '../CanvasLinkNotifications';

export const VIEW_LABELS = {
    home: 'My Synchron',
    timetable: 'Timetable',
    calendar: 'Calendar',
    notices: 'Notices',
    awards: 'Awards',
    clipboard: 'Clipboard',
    profile: 'Settings',
    feedback: 'Feedback',
    'canvas-links': 'Canvas Links',
    'build-notes': 'Build Notes',
    admin: 'Admin'
};

const monoMask = {
    WebkitMaskImage: "url('/canvas-mono.svg')",
    maskImage: "url('/canvas-mono.svg')",
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center'
};

const CanvasIcon = ({ size = 16, className = '' }) => (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }}>
        <span className="block w-full h-full bg-current group-hover:hidden" style={monoMask} />
        <img src="/canvas-lms.svg" alt="" className="hidden w-full h-full group-hover:block" />
    </span>
);

const QUICK_LINKS = [
    { id: 'link-portal', label: 'Student Portal', icon: Globe, href: 'https://student.sbhs.net.au' },
    { id: 'link-canvas', label: 'Canvas', icon: CanvasIcon, href: 'https://canvas.sbhs.net.au' },
    { id: 'link-gmail', label: 'Gmail', icon: Mail, href: 'https://mail.google.com/a/student.sbhs.nsw.edu.au' }
];

const buildNavGroups = (isAdmin, hiddenPages = []) => {
    return [
        {
            label: 'Workspace',
            items: [
                { id: 'home', icon: Home },
                { id: 'calendar', icon: CalendarDays },
                { id: 'notices', icon: Newspaper }
            ].filter(item => !hiddenPages.includes(item.id))
        },
        {
            label: 'School',
            items: [
                { id: 'awards', icon: Award },
                { id: 'clipboard', icon: Clipboard },
                ...QUICK_LINKS
            ].filter(item => !hiddenPages.includes(item.id))
        },
        {
            label: 'Account',
            items: [
                { id: 'profile', icon: Settings },
                { id: 'feedback', icon: MessageSquare },
                ...(isAdmin ? [{ id: 'admin', icon: ShieldCheck }] : [])
            ].filter(item => !hiddenPages.includes(item.id))
        }
    ];
};

const initialsOf = (user) => `${user?.givenName?.[0] || ''}${user?.surname?.[0] || ''}`.toUpperCase() || 'S';

const IS_STAGING_HOST = typeof window !== 'undefined' && window.location.hostname === 'staging.synchron.work';
export const StagingBadge = ({ className = '' }) => IS_STAGING_HOST ? (
    <span className={`inline-flex shrink-0 items-center rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300 ${className}`}>
        Staging
    </span>
) : null;

export const BrandMark = ({ className = '' }) => (
    <div className={`relative w-7 h-7 ${className}`}>
        <img
            src="/synchron-ring-warm-vector.svg"
            alt="Synchron logo"
            className="block w-full h-full rounded-lg"
        />
        <span className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-accent ring-2 ring-m-page" />
    </div>
);

export const ModernSidebar = ({ currentView, setView, user, hiddenPages = [] }) => {
    const groups = buildNavGroups(user?.role === 'Admin', hiddenPages).filter(group => group.items.length > 0);
    const plan = [user?.yearGroup ? `Year ${user.yearGroup}` : null, user?.role === 'Admin' ? 'Admin' : null]
        .filter(Boolean).join(' · ') || 'Student';

    const isItemActive = (itemId) => {
        if (itemId === 'home') {
            return currentView === 'home';
        }
        return currentView === itemId;
    };

    return (
        <aside className="hidden md:flex w-60 shrink-0 flex-col h-[100dvh] sticky top-0 px-3 pt-4 pb-3 select-none">
            <button onClick={() => setView('home')} className="flex items-center gap-2.5 px-2.5 py-1.5 mb-5 text-left">
                <BrandMark />
                <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Synchron</span>
                <StagingBadge className="hidden md:inline-flex" />
            </button>

            <nav className="flex-1 overflow-y-auto -mx-1 px-1">
                {groups.map((group, index) => (
                    <div key={group.label} className={index > 0 ? 'mt-3 border-t border-zinc-900/[0.07] pt-3 dark:border-white/[0.07]' : ''}>
                        <ul className="space-y-0.5">
                            {group.items.map(({ id, icon: Icon, href, label }) => {
                                if (href) {
                                    return (
                                        <li key={id}>
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13.5px] transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.04]"
                                            >
                                                <Icon size={16} strokeWidth={1.8} className="shrink-0" />
                                                <span className="flex-1 text-left font-medium">{label}</span>
                                                <ArrowUpRight size={13} className="opacity-0 -translate-x-0.5 group-hover:opacity-60 group-hover:translate-x-0 transition" />
                                            </a>
                                        </li>
                                    );
                                }
                                const active = isItemActive(id);
                                return (
                                    <li key={id}>
                                        <button
                                            onClick={() => setView(id)}
                                            className={`group relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13.5px] transition-colors ${active
                                                ? 'text-zinc-900 dark:text-white'
                                                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.04]'
                                                }`}
                                        >
                                            {active && (
                                                <motion.span
                                                    layoutId="m-nav-active"
                                                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                                    className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.12] border border-zinc-900/[0.07] dark:border-white/[0.12] shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
                                                />
                                            )}
                                            <Icon size={16} strokeWidth={active ? 2.1 : 1.8} className={`relative shrink-0 ${active ? 'text-accent' : ''}`} />
                                            <span className="relative flex-1 text-left font-medium">{VIEW_LABELS[id]}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            <button
                onClick={() => setView('profile')}
                className="mt-3 flex items-center gap-2.5 p-2 rounded-xl border border-transparent hover:border-zinc-900/[0.07] dark:hover:border-white/[0.06] hover:bg-white/70 dark:hover:bg-white/[0.03] transition-colors text-left"
            >
                <span className="w-8 h-8 shrink-0 rounded-full grid place-items-center font-mono text-[12px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    {initialsOf(user)}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                        {user?.givenName} {user?.surname}
                    </span>
                    <span className="block truncate font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                        {plan}
                    </span>
                </span>
            </button>
        </aside>
    );
};

const IconButton = ({ children, className = '', ...props }) => (
    <button
        {...props}
        className={`w-8 h-8 inline-flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors ${className}`}
    >
        {children}
    </button>
);

export const ModernTopbar = ({
    currentView, setView, theme, toggleTheme, onOpenPalette, onOpenPaletteFocus,
    isOffline, usingCachedData, reauthRequired, onLogin,
    buildNotes = [], adminNotices = [], onOpenBuildNotes, onOpenCanvasLinks, onOpenAdmin
}) => {
    const status = isOffline
        ? { label: 'Offline', dot: 'bg-amber-500', icon: WifiOff }
        : usingCachedData
            ? { label: 'Cached', dot: 'bg-sky-500', icon: Database }
            : { label: 'Synced', dot: 'bg-emerald-500', icon: null };

    return (
        <header className="sticky top-0 z-30 h-14 shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 bg-m-panel/75 backdrop-blur-xl border-b border-m-line">
            <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setView('home')} className="md:hidden" aria-label="Home">
                    <BrandMark />
                </button>
                <h1 className="text-[15px] font-medium tracking-tight text-zinc-900 dark:text-white truncate">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={currentView}
                            className="inline-block"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.14 }}
                        >
                            {VIEW_LABELS[currentView] || currentView}
                        </motion.span>
                    </AnimatePresence>
                </h1>
                <StagingBadge className="md:hidden" />
            </div>

            <div className="flex items-center gap-1.5">
                {!isOffline && reauthRequired ? (
                    <button
                        type="button"
                        onClick={onLogin}
                        aria-label="Sign in again for the latest data"
                        title="Your session has expired. Sign in again for the latest data."
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 transition-colors"
                    >
                        <Database size={15} />
                        <span className="hidden sm:inline text-xs font-medium">Log in for latest info</span>
                    </button>
                ) : (
                    <>
                        <span className="hidden lg:flex items-center gap-1.5 px-2 text-xs text-zinc-400" title={status.label}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                        </span>
                        {status.icon && (
                            <span className="lg:hidden text-amber-500 px-1" title={status.label}><status.icon size={14} /></span>
                        )}
                    </>
                )}

                <CanvasLinkNotifications
                    buildNotes={buildNotes}
                    adminNotices={adminNotices}
                    onOpenBuildNotes={onOpenBuildNotes}
                    onOpenCanvasLinks={onOpenCanvasLinks}
                    onOpenAdmin={onOpenAdmin}
                />

                <IconButton onClick={toggleTheme} className="hidden md:grid" aria-label="Toggle colour mode" title="Toggle colour mode">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={theme}
                            initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                            animate={{ rotate: 0, opacity: 1, scale: 1 }}
                            exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                            transition={{ duration: 0.18 }}
                            className="grid place-items-center"
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </motion.span>
                    </AnimatePresence>
                </IconButton>
                <IconButton onClick={() => setView(currentView === 'profile' ? 'home' : 'profile')} className="md:hidden" aria-label="Settings">
                    <Settings size={16} />
                </IconButton>
            </div>
        </header>
    );
};

export const ModernDock = ({ currentView, setView, onOpenPalette, hiddenPages = [] }) => {
    const items = [
        { id: 'home', icon: Home, label: 'Home' },
        { id: 'clipboard', icon: Clipboard, label: 'Clipboard' },
        { id: 'notices', icon: Newspaper, label: 'Notices' },
        ...(!hiddenPages.includes('awards')
            ? [{ id: 'awards', icon: Award, label: 'Awards' }]
            : [])
    ].filter(item => !hiddenPages.includes(item.id));

    const itemClass = 'relative flex-1 min-w-0 h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors';

    return (
        <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md flex items-center gap-0.5 p-1 rounded-2xl border border-m-line bg-m-panel/75 backdrop-blur-xl m-shadow-lg">
                {items.map(({ id, icon: Icon, label }) => {
                    const active = currentView === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setView(id)}
                            aria-label={VIEW_LABELS[id]}
                            aria-current={active ? 'page' : undefined}
                            className={`${itemClass} ${active ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
                        >
                            {active && (
                                <motion.span
                                    layoutId="m-dock-active"
                                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                    className="absolute inset-0 rounded-xl bg-zinc-900/[0.06] dark:bg-white/[0.08]"
                                />
                            )}
                            <Icon size={19} strokeWidth={active ? 2.1 : 1.8} className={`relative ${active ? 'text-accent' : ''}`} />
                            <span className="relative text-[12px] font-medium leading-none px-0.5 whitespace-nowrap">{label}</span>
                        </button>
                    );
                })}
                <button onClick={onOpenPalette} aria-label="More" className={`${itemClass} text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white`}>
                    <Menu size={19} strokeWidth={1.8} />
                    <span className="text-[12px] font-medium leading-none whitespace-nowrap">More</span>
                </button>
            </div>
        </nav>
    );
};

export const CommandPalette = ({ open, onClose, commands, quickActions = [], focusOnOpen = false, onFocusHandled }) => {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(false);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px), (pointer: coarse)');
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    const filtered = useMemo(() => {
        const searchQuery = query.trim().toLowerCase();
        const pool = isMobile && !searchQuery
            ? commands.filter(c => c.group === 'Actions' || c.group === 'Account')
            : commands;
        if (!searchQuery) return pool;
        return commands.filter(c => `${c.label} ${c.group} ${c.keywords || ''}`.toLowerCase().includes(searchQuery));
    }, [commands, query, isMobile]);

    const items = filtered;

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
            if (focusOnOpen) {
                requestAnimationFrame(() => inputRef.current?.focus());
                onFocusHandled?.();
            }
        }
    }, [open, focusOnOpen]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const executeCommand = (command) => {
        if (!command) return;
        if (!command.keepOpen) {
            onClose();
        } else {
            inputRef.current?.focus();
        }
        command.run();
    };

    const handleKeyDown = (e) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 1, items.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                executeCommand(items[activeIndex]);
                break;
            case 'Escape':
                onClose();
                break;
        }
    };

    let lastGroup = null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className={`fixed inset-0 z-[60] flex justify-center px-4 ${isMobile ? 'items-center' : 'items-start pt-[12vh]'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <div className="absolute inset-0 bg-zinc-950/30 dark:bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
                    <motion.div
                        role="dialog"
                        aria-label="Command palette"
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-m-line bg-m-card m-shadow-lg"
                    >
                        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-m-line">
                            <Search size={16} className="text-zinc-400 shrink-0" />
                            <input
                                ref={inputRef}
                                data-bare
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Jump to a page or run a command…"
                                className="flex-1 bg-transparent border-0 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus-visible:outline-none"
                            />
                            <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-m-line text-zinc-400">Esc</kbd>
                        </div>
                        {quickActions.length > 0 && !query && (
                            <div className="flex gap-2 px-4 py-3 border-b border-m-line">
                                {quickActions.map(action => (
                                    <button
                                        key={action.id}
                                        onClick={() => {
                                            onClose();
                                            action.run();
                                        }}
                                        className="group flex-1 min-h-[72px] flex flex-col items-center justify-center gap-1.5 px-1 py-2 rounded-xl border border-m-line bg-m-card hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                    >
                                        <action.icon size={20} className="text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
                                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors text-center leading-snug">
                                            {action.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
                            {items.length === 0 && (
                                <div className="py-10 text-center text-sm text-zinc-400">No results for “{query}”</div>
                            )}
                            {items.map((command, index) => {
                                const showGroup = command.group !== lastGroup;
                                lastGroup = command.group;
                                const Icon = command.icon || ArrowRight;
                                const active = index === activeIndex;
                                return (
                                    <React.Fragment key={command.id}>
                                        {showGroup && (
                                            <div className="px-2.5 pt-2.5 pb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">
                                                {command.group}
                                            </div>
                                        )}
                                        <button
                                            data-index={index}
                                            onMouseMove={() => setActiveIndex(index)}
                                            onClick={() => executeCommand(command)}
                                            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${active ? 'bg-zinc-900/[0.05] dark:bg-white/[0.06] text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}
                                        >
                                            <Icon size={15} className={command.iconClassName || (active ? 'text-accent' : 'text-zinc-400')} />
                                            <span className={`flex-1 ${command.labelClassName || ''}`}>{command.label}</span>
                                            {command.hint && <span className="text-xs text-zinc-400">{command.hint}</span>}
                                            {active && <CornerDownLeft size={13} className="text-zinc-400" />}
                                        </button>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export const buildCommands = ({ user, setView, theme, toggleTheme, onSignOut, hiddenPages = [] }) => {
    const quickActions = [
        { id: 'quick-calendar', label: 'Calendar', icon: CalendarDays, run: () => setView('calendar') },
        { id: 'quick-portal', label: 'Student Portal', icon: Globe, run: () => window.open('https://student.sbhs.net.au', '_blank', 'noopener') },
        { id: 'quick-canvas', label: 'Canvas', icon: CanvasIcon, run: () => window.open('https://canvas.sbhs.net.au', '_blank', 'noopener') },
        { id: 'quick-gmail', label: 'Gmail', icon: Mail, run: () => window.open('https://mail.google.com/a/student.sbhs.nsw.edu.au', '_blank', 'noopener') }
    ].filter(action => {
        if (action.id === 'quick-calendar') return !hiddenPages.includes('calendar');
        return true;
    });

    const navCommands = buildNavGroups(user?.role === 'Admin', hiddenPages)
        .flatMap(g => g.items)
        .filter(item => item.id !== 'link-portal' && item.id !== 'link-canvas' && item.id !== 'link-gmail')
        .sort((a, b) => Boolean(a.href) - Boolean(b.href))
        .map(item => ({
            id: `nav-${item.id}`,
            group: item.href ? 'Links' : 'Go to',
            label: item.label || VIEW_LABELS[item.id],
            icon: item.icon,
            run: item.href ? () => window.open(item.href, '_blank', 'noopener') : () => setView(item.id)
        }));

    if (!hiddenPages.includes('canvas-links')) {
        navCommands.splice(navCommands.findIndex(c => c.group === 'Links'), 0, {
            id: 'nav-canvas-links',
            group: 'Go to',
            label: 'Canvas Links',
            icon: BookOpen,
            run: () => setView('canvas-links')
        });
    }

    if (!hiddenPages.includes('build-notes')) {
        navCommands.splice(navCommands.findIndex(c => c.group === 'Links'), 0, {
            id: 'nav-build-notes',
            group: 'Go to',
            label: 'Build Notes',
            icon: FileCode,
            run: () => setView('build-notes')
        });
    }

    const actionCommands = [
        {
            id: 'toggle-theme',
            group: 'Actions',
            label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
            keywords: 'theme dark light appearance',
            icon: theme === 'dark' ? Sun : Moon,
            run: toggleTheme
        },
        {
            id: 'sign-out', 
            group: 'Account', 
            label: 'Sign out', 
            icon: LogOut, 
            run: onSignOut 
        }
    ];

    return { commands: [...navCommands, ...actionCommands], quickActions };
};

export const useModernShellEffects = (setPaletteOpen, setPaletteFocusOnOpen) => {
    useEffect(() => {
        const handleKeyboardShortcut = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const isMobile = window.matchMedia('(max-width: 639px), (pointer: coarse)').matches;
                setPaletteOpen(prev => {
                    const willOpen = !prev;
                    setPaletteFocusOnOpen?.(willOpen && !isMobile);
                    return willOpen;
                });
            }
        };

        const handlePointerMove = (e) => {
            const tile = e.target.closest?.('.relative-tile-wrapper');
            if (!tile) return;
            const rect = tile.getBoundingClientRect();
            tile.style.setProperty('--mx', `${e.clientX - rect.left}px`);
            tile.style.setProperty('--my', `${e.clientY - rect.top}px`);
        };

        window.addEventListener('keydown', handleKeyboardShortcut);
        document.addEventListener('pointermove', handlePointerMove, { passive: true });

        return () => {
            window.removeEventListener('keydown', handleKeyboardShortcut);
            document.removeEventListener('pointermove', handlePointerMove);
        };
    }, [setPaletteOpen, setPaletteFocusOnOpen]);
};
