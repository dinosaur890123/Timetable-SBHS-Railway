import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Home, LayoutGrid, CalendarDays, Newspaper, Award, Clipboard, GraduationCap, Settings,
    MessageSquare, ShieldCheck, Search, Sun, Moon, Menu, ArrowRight, LogOut, Sparkles,
    CornerDownLeft, WifiOff, Database, Palette, BookOpen
} from 'lucide-react';

export const VIEW_LABELS = {
    home: 'My Synchron',
    timetable: 'Timetable',
    calendar: 'Calendar',
    notices: 'Notices',
    awards: 'Awards',
    clipboard: 'Clipboard',
    notes: 'Study',
    profile: 'Settings',
    feedback: 'Feedback',
    'canvas-links': 'Canvas Links',
    admin: 'Admin'
};

const buildNavGroups = (isAdmin) => [
    {
        label: 'Workspace',
        items: [
            { id: 'home', icon: Home },
            { id: 'timetable', icon: LayoutGrid },
            { id: 'calendar', icon: CalendarDays },
            { id: 'notices', icon: Newspaper }
        ]
    },
    {
        label: 'School',
        items: [
            { id: 'awards', icon: Award },
            { id: 'clipboard', icon: Clipboard },
            { id: 'notes', icon: GraduationCap, badge: 'notifications' }
        ]
    },
    {
        label: 'Account',
        items: [
            { id: 'profile', icon: Settings },
            { id: 'feedback', icon: MessageSquare },
            ...(isAdmin ? [{ id: 'admin', icon: ShieldCheck }] : [])
        ]
    }
];

const isProUser = (user) => user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';

const initialsOf = (user) => `${user?.givenName?.[0] || ''}${user?.surname?.[0] || ''}`.toUpperCase() || 'S';

export const BrandMark = ({ className = '' }) => (
    <div className={`relative grid place-items-center w-7 h-7 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm ${className}`}>
        <span className="text-[13px] font-semibold leading-none">S</span>
        <span className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-accent ring-2 ring-m-page" />
    </div>
);

export const ModernSidebar = ({ currentView, setView, user, notificationCount, defaultPage }) => {
    const groups = buildNavGroups(user?.role === 'Admin');
    const plan = [isProUser(user) ? 'Pro' : 'Free', user?.role === 'Admin' ? 'Admin' : (user?.yearGroup ? `Year ${user.yearGroup}` : null)]
        .filter(Boolean).join(' · ');

    // Check if nav item is active
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
            </button>

            <nav className="flex-1 overflow-y-auto -mx-1 px-1 space-y-5">
                {groups.map(group => (
                    <div key={group.label}>
                        <div className="px-2.5 mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                            {group.label}
                        </div>
                        <ul className="space-y-0.5">
                            {group.items.map(({ id, icon: Icon, badge }) => {
                                const active = isItemActive(id);
                                const count = badge === 'notifications' ? notificationCount : 0;
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
                                                    className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.06] border border-zinc-900/[0.07] dark:border-white/[0.06] shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
                                                />
                                            )}
                                            <Icon size={16} strokeWidth={active ? 2.1 : 1.8} className={`relative shrink-0 ${active ? 'text-accent' : ''}`} />
                                            <span className="relative flex-1 text-left font-medium">{VIEW_LABELS[id]}</span>
                                            {count > 0 && (
                                                <span className="relative font-mono text-[11px] min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-accent text-accent-contrast">
                                                    {count > 9 ? '9+' : count}
                                                </span>
                                            )}
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
                    <span className="block truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
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
        className={`w-8 h-8 grid place-items-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors ${className}`}
    >
        {children}
    </button>
);

export const ModernTopbar = ({
    currentView, setView, theme, toggleTheme, onOpenPalette,
    isOffline, usingCachedData, timetableViewMode, setTimetableViewMode
}) => {
    const status = isOffline
        ? { label: 'Offline', dot: 'bg-amber-500', icon: WifiOff }
        : usingCachedData
            ? { label: 'Cached', dot: 'bg-sky-500', icon: Database }
            : { label: 'Synced', dot: 'bg-emerald-500', icon: null };

    return (
        <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-3 px-4 md:px-6 bg-m-panel/80 backdrop-blur-xl border-b border-m-line">
            <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setView('home')} className="md:hidden" aria-label="Home">
                    <BrandMark />
                </button>
                <h1 className="text-[15px] font-medium tracking-tight text-zinc-900 dark:text-white truncate">
                    {VIEW_LABELS[currentView] || currentView}
                </h1>

                {currentView === 'timetable' && (
                    <div className="relative flex items-center p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06]">
                        {['daily', 'cycle'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => setTimetableViewMode(mode)}
                                className={`relative px-2.5 py-1 text-xs font-medium capitalize rounded-md transition-colors ${timetableViewMode === mode ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                            >
                                {timetableViewMode === mode && (
                                    <motion.span
                                        layoutId="m-tt-mode"
                                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                        className="absolute inset-0 rounded-md bg-white dark:bg-zinc-800 shadow-sm"
                                    />
                                )}
                                <span className="relative">{mode}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1.5">
                <button
                    onClick={onOpenPalette}
                    className="hidden sm:flex items-center gap-2 h-8 w-56 pl-2.5 pr-1.5 rounded-lg border border-m-line bg-m-card text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-[13px]"
                >
                    <Search size={14} />
                    <span className="flex-1 text-left">Search</span>
                    <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-m-line text-zinc-400">Ctrl K</kbd>
                </button>
                <IconButton onClick={onOpenPalette} className="sm:hidden" aria-label="Search">
                    <Search size={16} />
                </IconButton>

                <span className="hidden lg:flex items-center gap-1.5 px-2 text-xs text-zinc-400" title={status.label}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                </span>
                {status.icon && (
                    <span className="lg:hidden text-amber-500 px-1" title={status.label}><status.icon size={14} /></span>
                )}

                <IconButton onClick={toggleTheme} aria-label="Toggle colour mode" title="Toggle colour mode">
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
                <IconButton onClick={() => setView('profile')} className="md:hidden" aria-label="Settings">
                    <Settings size={16} />
                </IconButton>
            </div>
        </header>
    );
};

// Floating dock for small screens (Aceternity-style), with "More" opening the command palette.
export const ModernDock = ({ currentView, setView, notificationCount, onOpenPalette }) => {
    const items = [
        { id: 'home', icon: Home, label: 'Home' },
        { id: 'timetable', icon: LayoutGrid, label: 'Timetable' },
        { id: 'calendar', icon: CalendarDays, label: 'Calendar' },
        { id: 'notices', icon: Newspaper, label: 'Notices' },
        { id: 'notes', icon: GraduationCap, label: 'Study', badge: notificationCount }
    ];

    const itemClass = 'relative flex-1 min-w-0 h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors';

    return (
        <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md flex items-center gap-0.5 p-1 rounded-2xl border border-m-line bg-m-panel/80 backdrop-blur-xl m-shadow-lg">
                {items.map(({ id, icon: Icon, label, badge }) => {
                    const active = currentView === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setView(id)}
                            aria-label={VIEW_LABELS[id]}
                            aria-current={active ? 'page' : undefined}
                            className={`${itemClass} ${active ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}
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
                            {badge > 0 && <span className="absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-accent" />}
                        </button>
                    );
                })}
                <button onClick={onOpenPalette} aria-label="More" className={`${itemClass} text-zinc-500 dark:text-zinc-400`}>
                    <Menu size={19} strokeWidth={1.8} />
                    <span className="text-[12px] font-medium leading-none whitespace-nowrap">More</span>
                </button>
            </div>
        </nav>
    );
};

export const CommandPalette = ({ open, onClose, commands }) => {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const filtered = useMemo(() => {
        const searchQuery = query.trim().toLowerCase();
        if (!searchQuery) return commands;
        return commands.filter(c => `${c.label} ${c.group} ${c.keywords || ''}`.toLowerCase().includes(searchQuery));
    }, [commands, query]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
        }
    }, [open]);

    useEffect(() => setActiveIndex(0), [query]);

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const executeCommand = (command) => {
        if (!command) return;
        onClose();
        command.run();
    };

    const handleKeyDown = (e) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                executeCommand(filtered[activeIndex]);
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
                    className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
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
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Jump to a page or run a command…"
                                className="flex-1 bg-transparent border-0 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none"
                            />
                            <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-m-line text-zinc-400">Esc</kbd>
                        </div>
                        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
                            {filtered.length === 0 && (
                                <div className="py-10 text-center text-sm text-zinc-400">No results for “{query}”</div>
                            )}
                            {filtered.map((command, index) => {
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
                                            <Icon size={15} className={active ? 'text-accent' : 'text-zinc-400'} />
                                            <span className="flex-1">{command.label}</span>
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

// Builds the palette's command list from app-level actions.
export const buildCommands = ({ user, setView, theme, toggleTheme, onAskAi, uiThemeOptions, currentUiTheme, onSelectUiTheme, onSignOut }) => {
    // Navigation commands
    const navCommands = buildNavGroups(user?.role === 'Admin')
        .flatMap(g => g.items)
        .map(item => ({
            id: `nav-${item.id}`,
            group: 'Go to',
            label: VIEW_LABELS[item.id],
            icon: item.icon,
            run: () => setView(item.id)
        }));
    
    navCommands.push({ 
        id: 'nav-canvas-links', 
        group: 'Go to', 
        label: 'Canvas Links', 
        icon: BookOpen, 
        run: () => setView('canvas-links') 
    });

    // Action commands
    const actionCommands = [
        {
            id: 'toggle-theme',
            group: 'Actions',
            label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
            keywords: 'theme dark light appearance',
            icon: theme === 'dark' ? Sun : Moon,
            run: toggleTheme
        },
        ...(onAskAi ? [{ 
            id: 'ask-ai', 
            group: 'Actions', 
            label: 'Ask the timetable assistant', 
            keywords: 'ai question', 
            icon: Sparkles, 
            run: onAskAi 
        }] : []),
        ...uiThemeOptions
            .filter(t => t.id !== currentUiTheme)
            .map(t => ({
                id: `ui-${t.id}`,
                group: 'Actions',
                label: `Use ${t.name} interface`,
                keywords: 'interface style theme layout',
                icon: Palette,
                run: () => onSelectUiTheme(t.id)
            })),
        { 
            id: 'sign-out', 
            group: 'Account', 
            label: 'Sign out', 
            icon: LogOut, 
            run: onSignOut 
        }
    ];

    return [...navCommands, ...actionCommands];
};

// Shell-level behaviour: Ctrl/Cmd+K shortcut and pointer-tracked spotlight on dashboard tiles.
export const useModernShellEffects = (enabled, setPaletteOpen) => {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyboardShortcut = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen(prev => !prev);
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
    }, [enabled, setPaletteOpen]);
};
