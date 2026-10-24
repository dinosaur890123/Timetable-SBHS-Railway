import React, { useState, useEffect, useRef } from 'react';
import {
    Clock, BookOpen, Bell, ArrowRight, CheckCircle, Calendar as CalendarIcon, Zap, Sparkles,
    LayoutGrid, RotateCcw, Check, Plus, X, ChevronLeft, ChevronRight, Award, Clipboard, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { fetchStudentAwards, fetchStudentBadges, fetchStudentClipboardSessions, fetchTransitDepartures } from '../services/api';
import { applyPeriodVariations, isBreakBell } from '../utils/timetable';

// Default layout configuration (removed greeting tile as it is now fixed at the top)
const DEFAULT_LAYOUT = [
    { id: 'ai_briefing', w: 3, h: 1 },
    { id: 'current_class', w: 2, h: 2 },
    { id: 'notices', w: 1, h: 2 },
    { id: 'transit_departures', w: 1, h: 1 },
    { id: 'next_class', w: 1, h: 1 },
    { id: 'stats', w: 1, h: 1 },
    { id: 'clock', w: 1, h: 1 }
];

// Available tiles and their resizing constraints
const ALL_TILES = {
    ai_briefing: { title: 'AI Daily Briefing', minW: 1, maxW: 3, minH: 1, maxH: 2 },
    current_class: { title: 'Current Class (Right Now)', minW: 1, maxW: 3, minH: 1, maxH: 2 },
    next_class: { title: 'Up Next Class', minW: 1, maxW: 2, minH: 1, maxH: 1 },
    stats: { title: 'Daily Summary Stats', minW: 1, maxW: 2, minH: 1, maxH: 1 },
    notices: { title: 'Latest Notices', minW: 1, maxW: 3, minH: 1, maxH: 2 },
    clock: { title: 'Brutalist Live Clock', minW: 1, maxW: 2, minH: 1, maxH: 2 },
    timetable_preview: { title: 'Timetable Preview', minW: 1, maxW: 3, minH: 1, maxH: 2 },
    quick_links: { title: 'Quick Links & Actions', minW: 1, maxW: 3, minH: 1, maxH: 1 },
    scratchpad: { title: 'Quick Scratchpad', minW: 1, maxW: 3, minH: 1, maxH: 2 },
    award_scheme_summary: { title: 'Awards Summary', minW: 1, maxW: 2, minH: 1, maxH: 1 },
    clipboard_schedule: { title: 'Clipboard Training', minW: 1, maxW: 2, minH: 1, maxH: 1 },
    transit_departures: { title: 'Live Transit Departures', minW: 1, maxW: 3, minH: 1, maxH: 2 }
};


// Tailwind grid utility mappings to prevent compilation issues
const colSpanClasses = {
    1: 'col-span-1',
    2: 'col-span-1 md:col-span-2 lg:col-span-2',
    3: 'col-span-1 md:col-span-2 lg:col-span-3'
};

const rowSpanClasses = {
    1: 'row-span-1',
    2: 'row-span-1 md:row-span-2'
};

// Live Digital & Analogue Clock Widget
const ClockWidget = ({ onPreferenceChange }) => {
    const [time, setTime] = useState(new Date());
    const [formatType, setFormatType] = useState(() => localStorage.getItem('clock_widget_format') || 'both');

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const toggleFormat = (e) => {
        e.stopPropagation();
        setFormatType(prev => {
            const next = prev === 'digital' ? 'analogue' : prev === 'analogue' ? 'both' : 'digital';
            localStorage.setItem('clock_widget_format', next);
            if (onPreferenceChange) onPreferenceChange();
            return next;
        });
    };

    const seconds = time.getSeconds();
    const minutes = time.getMinutes();
    const hours = time.getHours();

    const secAngle = seconds * 6;
    const minAngle = minutes * 6 + seconds * 0.1;
    const hourAngle = (hours % 12) * 30 + minutes * 0.5;

    const timeStr = format(time, 'hh:mm:ss a');
    const dateStr = format(time, 'EEE, d MMM').toUpperCase();

    return (
        <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between relative group select-none">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <Clock size={14} />
                    Time
                </h2>
                <button
                    onClick={toggleFormat}
                    className="text-[11px] font-extrabold uppercase px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition"
                    title="Change clock view"
                >
                    {formatType}
                </button>
            </div>

            <div className="flex flex-1 items-center justify-around gap-4 py-2">
                {(formatType === 'analogue' || formatType === 'both') && (
                    <svg className="w-20 h-20 shrink-0" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="46" className="fill-zinc-50 dark:fill-zinc-900/60 stroke-black dark:stroke-white stroke-[3]" />

                        {/* Hour ticks */}
                        <line x1="50" y1="8" x2="50" y2="12" className="stroke-black dark:stroke-white stroke-[2]" />
                        <line x1="50" y1="92" x2="50" y2="88" className="stroke-black dark:stroke-white stroke-[2]" />
                        <line x1="8" y1="50" x2="12" y2="50" className="stroke-black dark:stroke-white stroke-[2]" />
                        <line x1="92" y1="50" x2="88" y2="50" className="stroke-black dark:stroke-white stroke-[2]" />

                        {/* Hour hand */}
                        <line x1="50" y1="50" x2="50" y2="25" className="stroke-black dark:stroke-white stroke-[3.5]" transform={`rotate(${hourAngle} 50 50)`} strokeLinecap="square" />
                        {/* Minute hand */}
                        <line x1="50" y1="50" x2="50" y2="15" className="stroke-black dark:stroke-white stroke-[2.2]" transform={`rotate(${minAngle} 50 50)`} strokeLinecap="square" />
                        {/* Second hand */}
                        <line x1="50" y1="50" x2="50" y2="10" className="stroke-red-500 stroke-[1]" transform={`rotate(${secAngle} 50 50)`} strokeLinecap="square" />
                        {/* Center dot */}
                        <circle cx="50" cy="50" r="3" className="fill-black dark:fill-white" />
                    </svg>
                )}

                {(formatType === 'digital' || formatType === 'both') && (
                    <div className="text-right flex-1 flex flex-col justify-center">
                        <div className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white leading-none">
                            {timeStr}
                        </div>
                        <div className="text-[12px] font-bold text-zinc-400 tracking-wider mt-2">
                            {dateStr}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Timetable Preview Widget to show daily timeline of classes - ultra compact
const TimetablePreviewWidget = ({ bells, periods, routine, currentTime }) => {
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    const getMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    // Filter routine: show all if before school, otherwise show from current period onwards
    // Skip roll call and period 0 if it doesn't exist, but keep breaks as dividers
    const filteredRoutine = routine.filter((bellId, idx) => {
        const bell = bells.find(b => b.bell === bellId);
        if (!bell) return false;
        if (bellId === "RC") return false;
        if (bellId === "0") return false; // Skip period 0

        const periodInfo = periods[bellId] || { title: bell.bellDisplay };
        if (periodInfo.title && periodInfo.title.toLowerCase().includes("roll call")) return false;

        const startMin = getMinutes(bell.time);
        const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;
        const isCurrent = currentMinutes >= startMin && currentMinutes < endMin;
        const isPast = currentMinutes >= endMin;

        // If before first period, show all
        const firstBell = bells.find(b => b.bell === routine[0]);
        const firstStart = firstBell ? getMinutes(firstBell.time) : 0;
        if (currentMinutes < firstStart) return true;

        // Otherwise, show current and future periods only
        if (isCurrent) return true;
        if (isPast) return false;

        // Find current period index
        const currentIdx = routine.findIndex(id => {
            const b = bells.find(bel => bel.bell === id);
            if (!b) return false;
            const s = getMinutes(b.time);
            const e = b.endTime ? getMinutes(b.endTime) : s + 60;
            return currentMinutes >= s && currentMinutes < e;
        });

        if (currentIdx === -1) {
            // No current period (between periods), show all from this point
            return true;
        }

        // Show from current period onwards
        return idx >= currentIdx;
    });

    // Track if we've already shown a lunch divider
    let lunchDividerShown = false;
    
    // Check if there are any actual classes (non-break items)
    const hasClasses = filteredRoutine.some(bellId => {
        const bell = bells.find(b => b.bell === bellId);
        if (!bell) return false;
        const periodInfo = periods[bellId] || { title: bell.bellDisplay };
        return !isBreakBell(bellId, periodInfo);
    });

    return (
        <div className="bg-white dark:bg-[rgb(15_15_18)] border border-zinc-200 dark:border-[rgb(255_255_255/0.07)] p-4 h-full flex flex-col rounded-2xl">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
                <BookOpen size={12} />
                Upcoming Classes
            </h2>
            <div className="space-y-0.5 flex-1">
                {filteredRoutine.length > 0 ? (
                    <>
                        {filteredRoutine.map((bellId, idx) => {
                        const bell = bells.find(b => b.bell === bellId);
                        if (!bell) return null;

                        const startMin = getMinutes(bell.time);
                        const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;
                        const isCurrent = currentMinutes >= startMin && currentMinutes < endMin;

                        const periodInfo = periods[bellId] || { title: bell.bellDisplay };
                        const title = periodInfo.title || "Free Period";
                        const isBreak = isBreakBell(bellId, periodInfo);

                        // Get break name
                        const getBreakName = (bellId, periodInfo) => {
                            const id = String(bellId).toUpperCase().trim();
                            if (id === "R") return "Recess";
                            if (id === "L") return "Lunch";
                            if (periodInfo && periodInfo.title) {
                                const title = periodInfo.title.toLowerCase();
                                if (title.includes('lunch')) return "Lunch";
                                if (title.includes('recess')) return "Recess";
                            }
                            return "Break";
                        };

                        const progress = isCurrent && startMin != null && endMin
                            ? Math.min(100, Math.max(0, ((currentMinutes - startMin) / (endMin - startMin)) * 100))
                            : 0;

                        // Handle break dividers
                        if (isBreak) {
                            const breakName = getBreakName(bellId, periodInfo);
                            const isLunch = breakName === "Lunch";
                            
                            // Only show lunch divider once
                            if (isLunch && lunchDividerShown) {
                                return null;
                            }
                            if (isLunch) {
                                lunchDividerShown = true;
                            }

                            return (
                                <div key={idx} className="my-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-px bg-zinc-200 dark:bg-[rgb(255_255_255/0.15)]" />
                                        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">
                                            {breakName}
                                        </span>
                                        <div className="flex-1 h-px bg-zinc-200 dark:bg-[rgb(255_255_255/0.15)]" />
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={idx}>
                                <div
                                    className={`flex items-center gap-2 py-1 px-2 rounded-lg text-xs ${isCurrent
                                            ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white'
                                            : 'text-zinc-700 dark:text-zinc-300'
                                        }`}
                                >
                                    <span className={`font-semibold truncate flex-1 ${isCurrent ? 'text-zinc-900 dark:text-white' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                        {title}
                                    </span>
                                    {periodInfo.fullTeacher && (
                                        <span className={`text-[11px] shrink-0 ${isCurrent ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-500 dark:text-zinc-500'}`}>
                                            {periodInfo.fullTeacher}
                                        </span>
                                    )}
                                    {periodInfo.room && (
                                        <span className={`text-[11px] shrink-0 ${isCurrent ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-500 dark:text-zinc-500'}`}>
                                            {periodInfo.room}
                                        </span>
                                    )}
                                    {isCurrent && (
                                        <span className="text-zinc-600 dark:text-white/60 text-[11px] font-medium shrink-0">
                                            {Math.max(0, Math.ceil(endMin - currentMinutes))}m
                                        </span>
                                    )}
                                </div>
                                {idx < filteredRoutine.length - 1 && (
                                    <div className="h-px bg-zinc-200 dark:bg-[rgb(255_255_255/0.05)] mx-2" />
                                )}
                            </div>
                        );
                    })}
                    {/* Add End of Day divider if there are classes */}
                    {hasClasses && (
                        <div className="my-2">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-zinc-200 dark:bg-[rgb(255_255_255/0.15)]" />
                                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">
                                    End of Day
                                </span>
                                <div className="flex-1 h-px bg-zinc-200 dark:bg-[rgb(255_255_255/0.15)]" />
                            </div>
                        </div>
                    )}
                    </>
                ) : (
                    <div className="text-center py-4 text-zinc-500 text-xs">No classes scheduled.</div>
                )}
            </div>
        </div>
    );
};

// Samsung Quick Panel Style Toggles Widget
const QuickLinksWidget = ({ setView, theme, toggleTheme }) => {
    return (
        <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-4 flex items-center gap-2">
                <LayoutGrid size={14} />
                Quick Panel
            </h2>
            <div className="grid grid-cols-4 gap-2 flex-1 items-center">
                <button
                    onClick={() => setView('timetable')}
                    className="flex flex-col items-center justify-center p-2.5 border border-zinc-200 dark:border-zinc-850 bg-zinc-50 hover:bg-black hover:text-white dark:bg-zinc-900/40 dark:hover:bg-white dark:hover:text-black transition-all group"
                    title="Open Timetable View"
                >
                    <BookOpen size={18} className="text-zinc-700 dark:text-zinc-350 group-hover:text-current" />
                    <span className="text-[10px] font-bold mt-1.5 uppercase tracking-wider text-zinc-500 group-hover:text-current">Ttable</span>
                </button>
                <button
                    onClick={() => setView('calendar')}
                    className="flex flex-col items-center justify-center p-2.5 border border-zinc-200 dark:border-zinc-850 bg-zinc-50 hover:bg-black hover:text-white dark:bg-zinc-900/40 dark:hover:bg-white dark:hover:text-black transition-all group"
                    title="Open Calendar View"
                >
                    <CalendarIcon size={18} className="text-zinc-700 dark:text-zinc-350 group-hover:text-current" />
                    <span className="text-[10px] font-bold mt-1.5 uppercase tracking-wider text-zinc-500 group-hover:text-current">Cal</span>
                </button>
                <button
                    onClick={() => setView('notices')}
                    className="flex flex-col items-center justify-center p-2.5 border border-zinc-200 dark:border-zinc-850 bg-zinc-50 hover:bg-black hover:text-white dark:bg-zinc-900/40 dark:hover:bg-white dark:hover:text-black transition-all group"
                    title="Open Notices View"
                >
                    <Bell size={18} className="text-zinc-700 dark:text-zinc-350 group-hover:text-current" />
                    <span className="text-[10px] font-bold mt-1.5 uppercase tracking-wider text-zinc-500 group-hover:text-current">Notices</span>
                </button>
                <button
                    onClick={toggleTheme}
                    className="flex flex-col items-center justify-center p-2.5 border border-zinc-200 dark:border-zinc-850 bg-zinc-50 hover:bg-black hover:text-white dark:bg-zinc-900/40 dark:hover:bg-white dark:hover:text-black transition-all group"
                    title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                >
                    {theme === 'dark' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300 group-hover:text-current"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700 group-hover:text-current"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
                    )}
                    <span className="text-[10px] font-bold mt-1.5 uppercase tracking-wider text-zinc-500 group-hover:text-current">Theme</span>
                </button>
            </div>
        </div>
    );
};

// Persistent Scratchpad Widget
const ScratchpadWidget = ({ onPreferenceChange }) => {
    const [text, setText] = useState(() => localStorage.getItem('scratchpad_content') || '');

    const handleChange = (e) => {
        setText(e.target.value);
        localStorage.setItem('scratchpad_content', e.target.value);
        if (onPreferenceChange) onPreferenceChange();
    };

    return (
        <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between select-none">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    Scratchpad
                </h2>
                <span className="text-[10px] font-black uppercase text-zinc-400">Persisted</span>
            </div>
            <textarea
                value={text}
                onChange={handleChange}
                placeholder="Type reminders, room changes, or study tasks here..."
                className="w-full flex-1 min-h-[90px] bg-zinc-50/50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-850 p-3 text-sm focus:outline-none focus:border-zinc-500 focus:dark:border-zinc-700 resize-none font-medium placeholder-zinc-400 dark:text-zinc-200 custom-scrollbar"
            />
        </div>
    );
};

// Live Transit departures Widget (Synchron Pro Feature)
const TransitWidget = ({ user, setView, onPreferenceChange }) => {
    const isProUser = user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';
    const [stopName, setStopName] = useState(() => localStorage.getItem('transit_widget_stop') || 'Moore Park Light Rail');
    const [tempStopName, setTempStopName] = useState(stopName);
    const [departures, setDepartures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isConfiguring, setIsConfiguring] = useState(false);

    // Free users are locked to Moore Park Light Rail departures
    const activeStopName = isProUser ? stopName : 'Moore Park Light Rail';

    const fetchDepartures = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchTransitDepartures(activeStopName);
            setDepartures(data);
        } catch (err) {
            console.error("Failed to fetch departures:", err);
            setError("Failed to sync departures");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartures();
        const timer = setInterval(fetchDepartures, 60000);
        return () => clearInterval(timer);
    }, [activeStopName]);

    const handleSaveConfig = (e) => {
        e.preventDefault();
        const cleanName = tempStopName.trim();
        if (!cleanName) return;
        setStopName(cleanName);
        localStorage.setItem('transit_widget_stop', cleanName);
        if (onPreferenceChange) onPreferenceChange();
        setIsConfiguring(false);
    };

    return (
        <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between select-none">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="16" x="3" y="4" rx="2" /><path d="M7 22v-2" /><path d="M17 22v-2" /><path d="M8 12h8" /><path d="M12 4v8" /></svg>
                    </div>
                    <div className="text-left">
                        <h2 className="text-xs font-extrabold uppercase tracking-widest text-zinc-900 dark:text-white leading-none">
                            Live departures
                        </h2>
                        <span className="text-[10px] font-mono text-zinc-400 block mt-0.5 max-w-[150px] truncate" title={activeStopName}>
                            {activeStopName}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {isProUser ? (
                        <button
                            onClick={() => {
                                setIsConfiguring(!isConfiguring);
                                setTempStopName(stopName);
                            }}
                            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 text-zinc-550 transition"
                            title="Configure Stop"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                    ) : (
                        <div className="px-1.5 py-0.5 bg-red-100 dark:bg-red-955/30 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-wider border border-red-200/30">
                            Free Preview
                        </div>
                    )}
                    <button
                        onClick={fetchDepartures}
                        disabled={loading}
                        className={`p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 text-zinc-550 transition ${loading ? 'animate-spin' : ''}`}
                        title="Refresh"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                    </button>
                </div>
            </div>

            {/* Main view area */}
            <div className="flex-1 flex flex-col justify-center min-h-0">
                {isConfiguring ? (
                    <form onSubmit={handleSaveConfig} className="space-y-3 p-1.5 animate-in fade-in slide-in-from-top-1 duration-200 text-left">
                        <label className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-400 block">
                            Configure Station / Stop Name
                        </label>
                        <div className="flex flex-col gap-2">
                            <input
                                type="text"
                                value={tempStopName}
                                onChange={(e) => setTempStopName(e.target.value)}
                                placeholder="e.g. Moore Park Light Rail"
                                className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-850 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    className="flex-1 py-1.5 bg-black text-white dark:bg-white dark:text-black text-[11px] font-black uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-zinc-100 transition active:scale-95 border border-black dark:border-white"
                                >
                                    Save Stop
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsConfiguring(false)}
                                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-[11px] font-black uppercase tracking-wider text-zinc-650 dark:text-zinc-400 transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>
                ) : loading && departures.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-zinc-400 font-mono text-[11px] uppercase tracking-widest">
                        <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-500 dark:border-t-zinc-400 rounded-full animate-spin mb-2" />
                        Fetching Live Times...
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-between gap-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                        <span>Live times unavailable right now.</span>
                        <button type="button" onClick={fetchDepartures} className="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Retry</button>
                    </div>
                ) : departures.length === 0 ? (
                    <div className="text-center py-6 text-zinc-450 font-mono text-[11px] uppercase tracking-widest italic">
                        No active departures found
                    </div>
                ) : (
                    /* Departures List */
                    <div className="space-y-0 overflow-y-auto max-h-[260px] pr-1.5 custom-scrollbar relative">
                        {departures.map((dep, idx) => {
                            const isLightRail = dep.type === 'Light Rail';
                            const isTrain = dep.type === 'Train';
                            const typeColor = isLightRail
                                ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50'
                                : isTrain
                                    ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900/50'
                                    : 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50';

                            const isBlurred = !isProUser && idx >= 3;

                            return (
                                <div
                                    key={idx}
                                    className={`flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900 py-2 last:border-b-0 animate-in fade-in slide-in-from-bottom-1 duration-200 ${isBlurred ? 'blur-[3px] select-none pointer-events-none' : ''}`}
                                    aria-hidden={isBlurred}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {/* Route Badge */}
                                        <span className={`w-9 py-0.5 border text-center text-xs font-black uppercase select-none ${typeColor}`}>
                                            {dep.route}
                                        </span>
                                        {/* Destination */}
                                        <span className="font-extrabold text-xs text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                                            {dep.destination}
                                        </span>
                                    </div>

                                    {/* Departure Countdown */}
                                    <div className="flex items-center gap-1.5 shrink-0 pl-2">
                                        <span className="text-xs font-extrabold text-zinc-900 dark:text-white">
                                            {dep.minutes === 0 ? 'Now' : `${dep.minutes}m`}
                                        </span>
                                        {dep.realtime ? (
                                            <span className="relative flex h-2 w-2" title="Live real-time data">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                        ) : (
                                            <span className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full" title="Scheduled time" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Blurred overlay with Synchron Pro upgrade prompt */}
                        {!isProUser && departures.length > 3 && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-zinc-950 dark:via-zinc-950/95 dark:to-transparent pt-10 pb-1 px-3 flex flex-col items-center justify-end z-10">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">Synchron Pro</span>
                                </div>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium text-center leading-tight mb-2">
                                    Unlock all departures & custom stops
                                </p>
                                <button
                                    onClick={() => setView && setView('profile')}
                                    className="px-3 py-1 bg-gradient-to-r from-red-600 to-amber-600 text-white text-[10px] font-black uppercase tracking-wider hover:opacity-90 transition active:scale-95 rounded-md shadow-sm"
                                >
                                    Upgrade — $4.99/year
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            {!isConfiguring && (
                <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-550 flex items-center justify-between mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-900 select-none">
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                        TfNSW Live Proxy
                    </span>
                    <span>Auto-refresh 60s</span>
                </div>
            )}
        </div>
    );
};

// Main Home Component
const Home = ({ user, timetableData, notices, setView, aiBriefing, aiLoading, theme, toggleTheme, aiDisabled, onLayoutChange, dashboardLayoutMobile, dashboardLayoutDesktop }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isEditing, setIsEditing] = useState(false);
    const [isAiBriefingExpanded, setIsAiBriefingExpanded] = useState(false);
    const [canvasLinks, setCanvasLinks] = useState({});

    // Fetch Award Scheme & Clipboard stats inside Home for the widgets
    const [awardPoints, setAwardPoints] = useState(0);
    const [badgesCount, setBadgesCount] = useState(0);
    const [nextSession, setNextSession] = useState(null);

    // Callback to notify parent of preference changes
    const handlePreferenceChange = () => {
        if (onLayoutChange) onLayoutChange();
    };

    // Load canvas links from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('canvas_links');
            if (saved) {
                setCanvasLinks(JSON.parse(saved));
            }
        } catch (e) {
            console.warn('Failed to load Canvas links:', e);
        }
    }, []);

    useEffect(() => {
        if (!user?.studentId) return;

        fetchStudentAwards(user.studentId).then(data => {
            const total = data.reduce((sum, a) => sum + (a.points || 0), 0);
            setAwardPoints(total);
        }).catch(() => { });

        fetchStudentBadges(user.studentId).then(data => {
            setBadgesCount(data.length);
        }).catch(() => { });

        fetchStudentClipboardSessions(user.studentId).then(data => {
            if (data && data.length > 0) {
                setNextSession(data[0]);
            }
        }).catch(() => { });
    }, [user]);


    // Track screen size for responsive layout switching
    const isMobileRef = useRef(window.innerWidth < 768);
    const [isMobile, setIsMobile] = useState(isMobileRef.current);

    // Load active dashboard layout configuration from props/local storage (separate for mobile/desktop)
    const [activeTiles, setActiveTiles] = useState(() => {
        const isMobile = isMobileRef.current;
        const layoutFromProps = isMobile ? dashboardLayoutMobile : dashboardLayoutDesktop;
        if (layoutFromProps) {
            return layoutFromProps.filter(t => t.id !== 'greeting');
        }

        const storageKey = isMobile ? 'dashboard_layout_mobile' : 'dashboard_layout_desktop';
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Filter out the greeting tile if it exists in their saved layout
                return parsed.filter(t => t.id !== 'greeting');
            } catch (e) {
                console.error("Failed to parse saved layout:", e);
            }
        }
        // Fall back to checking the other layout key if current one doesn't exist
        const fallbackKey = isMobile ? 'dashboard_layout_desktop' : 'dashboard_layout_mobile';
        const fallbackSaved = localStorage.getItem(fallbackKey);
        if (fallbackSaved) {
            try {
                const parsed = JSON.parse(fallbackSaved);
                return parsed.filter(t => t.id !== 'greeting');
            } catch (e) {
                console.error("Failed to parse fallback layout:", e);
            }
        }
        return DEFAULT_LAYOUT;
    });

    // Update activeTiles when props change (from server sync)
    useEffect(() => {
        const layoutFromProps = isMobile ? dashboardLayoutMobile : dashboardLayoutDesktop;
        if (layoutFromProps) {
            setActiveTiles(layoutFromProps.filter(t => t.id !== 'greeting'));
        }
    }, [dashboardLayoutMobile, dashboardLayoutDesktop, isMobile]);

    // Save dashboard layout on modification (separate for mobile/desktop)
    useEffect(() => {
        const storageKey = isMobileRef.current ? 'dashboard_layout_mobile' : 'dashboard_layout_desktop';
        localStorage.setItem(storageKey, JSON.stringify(activeTiles));
        if (onLayoutChange) {
            onLayoutChange(activeTiles);
        }
    }, [activeTiles, onLayoutChange]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleResize = () => {
            const newIsMobile = window.innerWidth < 768;
            if (newIsMobile !== isMobileRef.current) {
                // Save current layout before switching
                const currentStorageKey = isMobileRef.current ? 'dashboard_layout_mobile' : 'dashboard_layout_desktop';
                localStorage.setItem(currentStorageKey, JSON.stringify(activeTiles));

                // Load layout for new screen size
                const newStorageKey = newIsMobile ? 'dashboard_layout_mobile' : 'dashboard_layout_desktop';
                const saved = localStorage.getItem(newStorageKey);
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        setActiveTiles(parsed.filter(t => t.id !== 'greeting'));
                    } catch (e) {
                        console.error("Failed to parse saved layout on resize:", e);
                    }
                } else {
                    setActiveTiles(DEFAULT_LAYOUT);
                }

                isMobileRef.current = newIsMobile;
                setIsMobile(newIsMobile);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeTiles]);

    // Get time-based greeting
    const hour = currentTime.getHours();
    let greeting;
    if (hour < 5) greeting = 'Good Night';
    else if (hour < 12) greeting = 'Good Morning';
    else if (hour < 18) greeting = 'Good Afternoon';
    else if (hour < 22) greeting = 'Good Evening';
    else greeting = 'Good Night';

    // Parse Timetable Data
    let innerTimetable = null;
    let bells = [];
    let periods = {};
    let routine = [];
    let classVariations = {};
    let roomVariations = {};

    if (timetableData && timetableData.bells) {
        bells = timetableData.bells;
        innerTimetable = timetableData.timetable?.timetable || timetableData.timetable;
        if (innerTimetable && innerTimetable.periods) {
            periods = innerTimetable.periods;
            routine = innerTimetable.routine ? innerTimetable.routine.split(',') : [];
        }
        classVariations = timetableData.classVariations || {};
        roomVariations = timetableData.roomVariations || {};
    }

    const getMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes() + currentTime.getSeconds() / 60;

    let currentClass = null;
    let nextClass = null;
    let progress = 0;
    let remainingTimeStr = '';

    if (routine.length > 0) {
        for (let i = 0; i < routine.length; i++) {
            const bellId = routine[i];
            const bell = bells.find(b => b.bell === bellId);
            if (!bell) continue;

            const startMin = getMinutes(bell.time);
            const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60; // Approximate if no end time

            let periodInfo = periods[bellId] || { title: bell.bellDisplay };
            const isBreak = isBreakBell(bellId, periodInfo);
            if (isBreak) {
                periodInfo = { ...periodInfo, title: bell.bellDisplay, isBreak: true };
            } else {
                periodInfo = applyPeriodVariations(periodInfo, bellId, classVariations, roomVariations);
            }

            if (currentMinutes >= startMin && currentMinutes < endMin) {
                currentClass = { ...periodInfo, ...bell, startMin, endMin };
                progress = ((currentMinutes - startMin) / (endMin - startMin)) * 100;

                const remainingSeconds = Math.max(0, Math.round((endMin - currentMinutes) * 60));
                const mins = Math.floor(remainingSeconds / 60);
                const secs = remainingSeconds % 60;
                remainingTimeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                // Find next valid class
                for (let j = i + 1; j < routine.length; j++) {
                    const nextBellId = routine[j];
                    const nextBell = bells.find(b => b.bell === nextBellId);
                    if (nextBell) {
                        let nextPeriodInfo = periods[nextBellId] || { title: nextBell.bellDisplay };
                        const isNextBreak = isBreakBell(nextBellId, nextPeriodInfo);
                        if (isNextBreak) {
                            nextPeriodInfo = { ...nextPeriodInfo, title: nextBell.bellDisplay, isBreak: true };
                        } else {
                            nextPeriodInfo = applyPeriodVariations(nextPeriodInfo, nextBellId, classVariations, roomVariations);
                        }
                        // Allow roll call to show in next class card
                        nextClass = { ...nextPeriodInfo, ...nextBell };
                        break;
                    }
                }
                break;
            } else if (currentMinutes < startMin && !currentClass && !nextClass) {
                // We haven't reached the first class of the day, or we are between classes
                nextClass = { ...periodInfo, ...bell, isBreak };
                break;
            }
        }
    }

    const rawNotices = aiBriefing && aiBriefing.sortedNotices ? aiBriefing.sortedNotices : (notices?.notices || []);
    const todayNotices = rawNotices.slice(0, 3);
    const totalNoticesCount = rawNotices.length;

    // Helper function to check if a period is an academic period (rather than recess, lunch, or breaks)
    const isAcademicPeriod = (bellId) => {
        if (!bellId) return false;
        const id = bellId.toUpperCase().trim();

        // Filter standard break IDs
        if (id === "R" || id === "L" || id === "RC" || id === "REC" || id === "LUN" || id === "ROLL" || id === "MC") {
            return false;
        }
        if (id.includes("RECESS") || id.includes("LUNCH") || id.includes("ROLL") || id.includes("BREAK")) {
            return false;
        }

        // Check details in periods map
        const periodInfo = periods[bellId];
        if (periodInfo) {
            const title = (periodInfo.title || "").toUpperCase();
            if (title.includes("RECESS") || title.includes("LUNCH") || title.includes("ROLL CALL") || title.includes("BREAK") || title.includes("PEER SUPPORT")) {
                return false;
            }
        }

        // Check details in bells schedule config
        const bell = bells.find(b => b.bell === bellId);
        if (bell) {
            const display = (bell.bellDisplay || "").toUpperCase();
            if (display.includes("RECESS") || display.includes("LUNCH") || display.includes("ROLL CALL") || display.includes("BREAK")) {
                return false;
            }
        }

        return true;
    };

    // Calculate dynamic academic period count (exactly 5 periods for standard days)
    const academicPeriodsCount = routine.filter(bellId => isAcademicPeriod(bellId)).length;

    // Determine if current class tile should be shown on mobile (only if class within 2 hours)
    const shouldShowCurrentClassOnMobile = currentClass || (nextClass && (nextClass.startMin - currentMinutes) <= 120);

    const getSubjectGradient = (title) => {
        return 'bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white border-zinc-300 dark:border-zinc-700';
    };

    // Calculate countdown to the end of the school day
    let schoolEndTimeStr = null;
    if (routine.length > 0) {
        const lastBellId = routine[routine.length - 1];
        const lastBell = bells.find(b => b.bell === lastBellId);
        if (lastBell) {
            schoolEndTimeStr = lastBell.endTime || lastBell.time;
        }
    }

    const getSchoolCountdown = () => {
        if (!schoolEndTimeStr) return null;
        const endMin = getMinutes(schoolEndTimeStr);
        const diff = Math.ceil(endMin - currentMinutes);

        // Only show if the school day is currently active and hasn't ended
        const firstBell = bells.find(b => b.bell === routine[0]);
        const startMin = firstBell ? getMinutes(firstBell.time) : 540; // 9:00 AM default

        if (diff > 0 && currentMinutes >= startMin) {
            const hrs = Math.floor(diff / 60);
            const mins = diff % 60;
            return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
        }
        return null;
    };

    // HTML5 Drag-and-Drop Reorder functions
    const handleDragStart = (e, index) => {
        e.dataTransfer.setData('text/plain', index);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('opacity-40');
    };

    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('opacity-40');
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Required to allow dropping
    };

    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

        const newTiles = [...activeTiles];
        const [draggedTile] = newTiles.splice(sourceIndex, 1);
        newTiles.splice(targetIndex, 0, draggedTile);
        setActiveTiles(newTiles);
    };

    // Edge Drag-to-Resize functions (Mouse/Desktop)
    const startResize = (e, tileIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const tile = activeTiles[tileIndex];
        const tileConfig = ALL_TILES[tile.id];
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = tile.w;
        const startH = tile.h;

        const cardElement = e.currentTarget.closest('.relative-tile-wrapper');
        if (!cardElement) return;

        const rect = cardElement.getBoundingClientRect();
        const singleColWidth = rect.width / startW;
        const singleRowHeight = rect.height / startH;

        const handleMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            const colChange = Math.round(deltaX / singleColWidth);
            const rowChange = Math.round(deltaY / singleRowHeight);

            const newW = Math.max(tileConfig.minW, Math.min(tileConfig.maxW, startW + colChange));
            const newH = Math.max(tileConfig.minH, Math.min(tileConfig.maxH, startH + rowChange));

            setActiveTiles(prev => {
                if (prev[tileIndex].w === newW && prev[tileIndex].h === newH) return prev;
                const updated = [...prev];
                updated[tileIndex] = { ...updated[tileIndex], w: newW, h: newH };
                return updated;
            });
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Edge Drag-to-Resize functions (Touch/Mobile)
    const startResizeTouch = (e, tileIndex) => {
        e.stopPropagation();

        const touch = e.touches[0];
        const tile = activeTiles[tileIndex];
        const tileConfig = ALL_TILES[tile.id];
        const startX = touch.clientX;
        const startY = touch.clientY;
        const startW = tile.w;
        const startH = tile.h;

        const cardElement = e.currentTarget.closest('.relative-tile-wrapper');
        if (!cardElement) return;

        const rect = cardElement.getBoundingClientRect();
        const singleColWidth = rect.width / startW;
        const singleRowHeight = rect.height / startH;

        const handleTouchMove = (moveEvent) => {
            const moveTouch = moveEvent.touches[0];
            const deltaX = moveTouch.clientX - startX;
            const deltaY = moveTouch.clientY - startY;

            const colChange = Math.round(deltaX / singleColWidth);
            const rowChange = Math.round(deltaY / singleRowHeight);

            const newW = Math.max(tileConfig.minW, Math.min(tileConfig.maxW, startW + colChange));
            const newH = Math.max(tileConfig.minH, Math.min(tileConfig.maxH, startH + rowChange));

            setActiveTiles(prev => {
                if (prev[tileIndex].w === newW && prev[tileIndex].h === newH) return prev;
                const updated = [...prev];
                updated[tileIndex] = { ...updated[tileIndex], w: newW, h: newH };
                return updated;
            });
        };

        const handleTouchEnd = () => {
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };

        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
    };

    const removeTile = (id) => {
        setActiveTiles(prev => prev.filter(t => t.id !== id));
    };

    const addTile = (id) => {
        if (activeTiles.some(t => t.id === id)) return;
        const config = ALL_TILES[id];
        const newTile = {
            id,
            w: config.minW,
            h: config.minH
        };
        setActiveTiles(prev => [...prev, newTile]);
    };

    // Filter layout based on global AI setting
    const filteredActiveTiles = activeTiles.filter(tile => !(tile.id === 'ai_briefing' && aiDisabled));
    const availableTiles = Object.keys(ALL_TILES).filter(id => {
        if (id === 'ai_briefing' && aiDisabled) return false;
        return !activeTiles.some(t => t.id === id);
    });

    // Render individual tile elements based on their id
    const renderTileContent = (id) => {
        switch (id) {
            case 'ai_briefing': {
                const isProUser = user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';
                if (!isProUser) {
                    return (
                        <div className="relative overflow-hidden bg-gradient-to-r from-zinc-900 to-black text-white dark:from-zinc-950 dark:to-zinc-900 p-4 md:p-8 border border-zinc-800 dark:border-zinc-800/60 shadow-lg group h-full flex flex-col justify-center select-none">
                            <div className="absolute -right-16 -top-16 w-44 h-44 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-6 relative z-10">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="shrink-0 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/10 border border-white/20 text-white rounded-xl shadow-inner">
                                        <Sparkles size={20} md:size={24} className="text-violet-400" />
                                    </div>
                                    <div className="space-y-0.5 md:space-y-1">
                                        <h2 className="text-[11px] md:text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                            Daily AI Briefing
                                            <span className="text-[10px] md:text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 bg-violet-600 text-white rounded-full">PRO</span>
                                        </h2>
                                        <h3 className="text-sm md:text-base font-bold text-white mt-1">Unlock Personalized Morning Briefings</h3>
                                        <p className="text-[11px] md:text-xs text-zinc-400 hidden sm:block">Get custom AI summaries of your day's classes, notices, and sports updates. Upgrade to Pro for $4.99 annually.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setView && setView('profile')}
                                    className="px-3 py-2 md:px-4 md:py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[11px] md:text-xs font-bold uppercase tracking-wider hover:from-violet-700 hover:to-indigo-700 transition active:scale-95 shrink-0 rounded-xl font-bold"
                                >
                                    Upgrade ($4.99/yr)
                                </button>
                            </div>
                        </div>
                    );
                }
                if (!aiLoading && !aiBriefing) {
                    return (
                        <div className="bg-white dark:bg-zinc-950 p-4 md:p-6 border border-zinc-200 dark:border-zinc-850 h-full flex items-center justify-center text-center text-zinc-500 text-xs md:text-sm">
                            No Daily AI Briefing available today.
                        </div>
                    );
                }
                return (
                    <div className="relative overflow-hidden bg-gradient-to-r from-zinc-900 to-black text-white dark:from-zinc-950 dark:to-zinc-900 border border-zinc-800 dark:border-zinc-800/60 shadow-lg group h-full flex flex-col select-none">
                        <div className="absolute -right-16 -top-16 w-44 h-44 bg-zinc-700/10 rounded-full blur-3xl pointer-events-none group-hover:bg-zinc-700/20 transition-all duration-700" />
                        <button
                            onClick={() => setIsAiBriefingExpanded(!isAiBriefingExpanded)}
                            className="w-full p-3 md:p-6 md:pb-8 flex items-center gap-3 md:gap-6 relative z-10"
                        >
                            <div className="shrink-0 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/10 border border-white/20 text-white rounded-xl shadow-inner">
                                <Sparkles size={20} md:size={24} className={aiLoading ? "animate-pulse" : "animate-bounce duration-1000"} />
                            </div>
                            <div className="flex-1 text-left">
                                <h2 className="text-lg md:text-xs font-bold uppercase tracking-widest text-white md:text-zinc-400 flex items-center gap-2 md:hidden">
                                    {isAiBriefingExpanded ? 'Daily AI Briefing' : 'Your AI Briefing'}
                                    {aiLoading && <span className="inline-block w-1.5 h-1.5 bg-zinc-400 rounded-full animate-ping" />}
                                </h2>
                                <h2 className="hidden md:block text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                    Daily AI Briefing
                                    {aiLoading && <span className="inline-block w-1.5 h-1.5 bg-zinc-400 rounded-full animate-ping" />}
                                </h2>
                                {!isAiBriefingExpanded && (
                                    <p className="hidden md:block text-zinc-300 text-base md:text-lg font-medium leading-relaxed font-sans mt-2 line-clamp-1">
                                        {aiBriefing?.briefing}
                                    </p>
                                )}
                            </div>
                            <div className={`transform transition-transform duration-200 ${isAiBriefingExpanded ? 'rotate-180' : ''}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="md:hidden"><path d="m6 9 6 6 6-6"/></svg>
                            </div>
                        </button>
                        <div 
                            className={`px-4 md:px-6 md:pb-8 md:pt-0 overflow-hidden transition-all duration-300 ease-in-out ${isAiBriefingExpanded ? 'pb-4 max-h-96 opacity-100' : 'pb-0 max-h-0 opacity-0 md:max-h-none md:opacity-100'}`}
                        >
                            {aiLoading ? (
                                <div className="space-y-2 animate-pulse hidden md:block">
                                    <div className="h-4 bg-zinc-800 rounded w-3/4"></div>
                                    <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
                                </div>
                            ) : (
                                <p className="text-zinc-300 text-sm md:text-lg font-medium leading-relaxed font-sans md:hidden">
                                    {aiBriefing?.briefing}
                                </p>
                            )}
                        </div>
                    </div>
                );
            }
            case 'current_class':
                const currentClassCanvasLink = currentClass?.title ? canvasLinks[currentClass.title]?.url : null;
                const currentClassContent = (
                    <div className="bg-white dark:bg-zinc-950 p-6 md:p-8 border border-zinc-200 dark:border-zinc-850 relative overflow-hidden group h-full flex flex-col justify-center">
                        <div className="hidden md:block absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none">
                            <Clock size={120} />
                        </div>
                        <h2 className="text-sm font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-6 flex items-center gap-2">
                            <div className="w-2 h-2 bg-accent animate-pulse" />
                            Right Now
                        </h2>
                        {currentClass ? (
                            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10">
                                <div className="relative shrink-0">
                                    <svg className="w-32 h-32 transform -rotate-90">
                                        <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-zinc-100 dark:text-zinc-900" />
                                        <motion.circle
                                            initial={{ strokeDasharray: '0 351.86' }}
                                            animate={{ strokeDasharray: `${(progress / 100) * 351.86} 351.86` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent"
                                            className="text-accent" />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-bold text-zinc-900 dark:text-white">{remainingTimeStr}</span>
                                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">left</span>
                                    </div>
                                </div>
                                <div className="flex-1 text-center md:text-left">
                                    <div className="inline-block px-3 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold uppercase tracking-widest mb-3">
                                        Period {currentClass.bell}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
                                        <h3 className="text-3xl md:text-4xl font-extrabold text-zinc-900 dark:text-white leading-tight">
                                            {currentClass.title || "Free Period"}
                                        </h3>
                                        {currentClass.isSubstituted && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-600 dark:bg-blue-950/45 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                                                Substitution
                                            </span>
                                        )}
                                        {currentClass.hasRoomChange && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-600 dark:bg-amber-950/45 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                                                Room Change
                                            </span>
                                        )}
                                        {currentClassCanvasLink && (
                                            <ExternalLink size={16} className="text-zinc-400" />
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                        <span className="flex items-center gap-1.5"><Clock size={16} /> {currentClass.time} - {currentClass.endTime || '??'}</span>
                                        {currentClass.room && (
                                            <span className="flex items-center gap-1.5 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-200">
                                                <MapPin size={16} /> {currentClass.room}
                                                {currentClass.oldRoom && <span className="text-[11px] text-zinc-400 line-through">({currentClass.oldRoom})</span>}
                                            </span>
                                        )}
                                        {currentClass.fullTeacher && (
                                            <span className="flex items-center gap-1.5">
                                                <UserIcon size={16} /> {currentClass.fullTeacher}
                                                {currentClass.oldTeacher && <span className="text-[11px] text-zinc-400 line-through">({currentClass.oldTeacher})</span>}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 z-10 relative select-none">
                                <CheckCircle size={48} className="mx-auto text-accent mb-4 opacity-70" />
                                <h3 className="text-2xl font-extrabold text-zinc-900 dark:text-white mb-2">No Classes Right Now</h3>
                                <p className="text-zinc-500">Take a break or catch up on study.</p>
                            </div>
                        )}
                    </div>
                );

                if (currentClassCanvasLink) {
                    return (
                        <a
                            href={currentClassCanvasLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-full"
                            aria-label={`Open ${currentClass.title} in Canvas`}
                        >
                            {currentClassContent}
                        </a>
                    );
                }
                return currentClassContent;
            case 'next_class':
                return (
                    <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-4 flex items-center gap-2">
                            <ArrowRight size={14} />
                            Up Next
                        </h2>
                        {nextClass ? (
                            <div className="flex items-center gap-4 flex-1">
                                <div className={`w-14 h-14 flex items-center justify-center font-bold text-xl border ${getSubjectGradient(nextClass.title)}`}>
                                    {nextClass.bell}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white leading-tight">{nextClass.title}</h3>
                                    <p className="text-sm text-zinc-500 flex items-center gap-2 mt-1">
                                        <Clock size={14} /> {nextClass.time}
                                        {nextClass.room && <span className="opacity-50">|</span>}
                                        {nextClass.room && <span>{nextClass.room}</span>}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="py-4 text-zinc-500 text-sm flex-1 flex items-center">No more classes today.</div>
                        )}
                    </div>
                );
            case 'stats':
                const countdownStr = getSchoolCountdown();
                return (
                    <div className="bg-accent text-accent-contrast p-6 border border-accent relative overflow-hidden h-full flex flex-col justify-between select-none">
                        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                            <Zap size={80} />
                        </div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                            Daily Summary
                        </h2>
                        <div className="flex gap-6 mt-2 relative z-10 flex-1 items-center">
                            <div>
                                <div className="text-3xl font-extrabold">{academicPeriodsCount}</div>
                                <div className="text-sm font-semibold text-zinc-400">Periods</div>
                            </div>
                            <div>
                                <div className="text-3xl font-extrabold">{totalNoticesCount}</div>
                                <div className="text-sm font-semibold text-zinc-400">Notices</div>
                            </div>
                            {countdownStr && (
                                <div className="border-l border-zinc-800 pl-6 animate-in fade-in duration-300">
                                    <div className="text-lg font-extrabold text-amber-400 leading-none">{countdownStr}</div>
                                    <div className="text-[11px] font-bold text-zinc-500 uppercase mt-1">School Left</div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'notices':
                return (
                    <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-extrabold uppercase tracking-widest text-zinc-900 dark:text-white flex items-center gap-2">
                                <Bell size={16} className="text-accent" />
                                Latest Notices
                            </h2>
                            <button onClick={() => setView && setView('notices')} className="text-xs font-bold text-zinc-900 dark:text-white underline decoration-zinc-400 hover:text-black dark:hover:text-white">View All</button>
                        </div>

                        <div className="space-y-4 flex-1 overflow-y-auto pr-1 max-h-[220px] custom-scrollbar">
                            {todayNotices.length > 0 ? todayNotices.map((notice, idx) => (
                                <div key={idx} className="group cursor-pointer">
                                    <h3 className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-600 dark:group-hover:text-white transition-colors line-clamp-1">{notice.title}</h3>
                                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: notice.content }}></p>
                                </div>
                            )) : (
                                <div className="text-center py-8 text-zinc-500 text-sm">
                                    <Bell size={24} className="mx-auto mb-2 opacity-20" />
                                    No notices for today.
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'clock':
                return <ClockWidget onPreferenceChange={handlePreferenceChange} />;
            case 'timetable_preview':
                return (
                    <TimetablePreviewWidget
                        bells={bells}
                        periods={periods}
                        routine={routine}
                        currentTime={currentTime}
                    />
                );
            case 'quick_links':
                return (
                    <QuickLinksWidget
                        setView={setView}
                        theme={theme}
                        toggleTheme={toggleTheme}
                    />
                );
            case 'scratchpad':
                return <ScratchpadWidget onPreferenceChange={handlePreferenceChange} />;
            case 'award_scheme_summary':
                return (
                    <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between cursor-pointer select-none" onClick={() => setView && setView('awards')}>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
                            <Award size={14} className="text-accent" />
                            Award Scheme Summary
                        </h2>
                        <div className="flex items-center justify-between mt-2">
                            <div>
                                <div className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none">{awardPoints} Pts</div>
                                <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider block mt-1">Total Merits</span>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none">{badgesCount} Badges</div>
                                <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider block mt-1">Authorised</span>
                            </div>
                        </div>
                    </div>
                );
            case 'clipboard_schedule':
                return (
                    <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full flex flex-col justify-between cursor-pointer select-none" onClick={() => setView && setView('clipboard')}>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
                            <Clipboard size={14} className="text-accent" />
                            Next Training Session
                        </h2>
                        {nextSession ? (
                            <div className="space-y-1 mt-2">
                                <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white line-clamp-1 leading-tight">{nextSession.activity}</h4>
                                <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-2 mt-1">
                                    <span>{nextSession.time}</span>
                                    <span>|</span>
                                    <span className="text-accent">{nextSession.location}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs font-semibold text-zinc-500 mt-2">No training sessions scheduled.</div>
                        )}
                    </div>
                );
            case 'transit_departures':
                return (
                    <TransitWidget user={user} setView={setView} onPreferenceChange={handlePreferenceChange} />
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-5 md:space-y-8 animate-in fade-in duration-700 pb-6 md:pb-20">
            {/* Header controls & Greeting (Fixed, non-editable greeting at the top) */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 border-b border-zinc-200 dark:border-zinc-900 pb-5 md:pb-6">
                <div className="min-w-0">
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-tight md:leading-none">
                        {greeting}, <span className="text-accent underline decoration-accent/40 underline-offset-4">{user?.givenName || 'Student'}</span>
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm md:text-base flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 md:mt-3.5 select-none">
                        <CalendarIcon size={16} className="text-zinc-400 dark:text-zinc-500" />
                        <span className="md:hidden">{format(currentTime, 'EEE d MMM')}</span>
                        <span className="hidden md:inline">{format(currentTime, 'EEEE, d MMMM yyyy')}</span>
                        {innerTimetable?.dayname && (() => {
                            const schoolEndMin = schoolEndTimeStr ? getMinutes(schoolEndTimeStr) : null;
                            const isAfterSchool = schoolEndMin !== null && currentMinutes > schoolEndMin;
                            const isBeforeMidnight = currentTime.getHours() < 24;
                            const showTomorrow = isAfterSchool && isBeforeMidnight;
                            return (
                                <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs md:text-sm font-semibold border border-zinc-300 dark:border-zinc-700">
                                    {showTomorrow ? `Tomorrow is ${innerTimetable.dayname}` : innerTimetable.dayname}
                                </span>
                            );
                        })()}
                    </p>
                </div>

                {/* Customize Dashboard Controls (on phones the entry point lives at the bottom of the page) */}
                <div className={`${isEditing ? 'flex' : 'hidden sm:flex'} items-center gap-2 shrink-0 select-none pb-0.5`}>
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => setActiveTiles(DEFAULT_LAYOUT)}
                                className="px-4 py-2 text-xs font-extrabold uppercase bg-zinc-200 hover:bg-zinc-300 text-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 transition flex items-center gap-1.5"
                                title="Reset dashboard to default widgets"
                            >
                                <RotateCcw size={14} />
                                Reset
                            </button>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 text-xs font-extrabold uppercase bg-accent text-accent-contrast hover:opacity-90 border border-accent transition flex items-center gap-1.5 shadow-md"
                                title="Finish customization"
                            >
                                <Check size={14} />
                                Done
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-2 text-xs font-extrabold uppercase bg-white hover:bg-zinc-50 text-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 transition flex items-center gap-1.5 shadow-sm"
                            title="Customize your dashboard layout"
                        >
                            <LayoutGrid size={14} className="text-zinc-500" />
                            Edit Tiles
                        </button>
                    )}
                </div>
            </div>

            {/* Interactive Grid Container */}
            <div className={`transition-all duration-300 ${isEditing
                    ? 'p-3 md:p-4 bg-grid dark:bg-grid-glow-bw border-2 border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/10'
                    : ''
                }`}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 relative">
                    {filteredActiveTiles.map((tile, index) => {
                        const tileConfig = ALL_TILES[tile.id];
                        if (!tileConfig) return null;

                        // Check if it's the AI Briefing and should be hidden (when not editing, not loading, and no briefing)
                        if (tile.id === 'ai_briefing' && !isEditing && !aiLoading && !aiBriefing) {
                            return null;
                        }

                        // Hide current class tile on mobile unless class is within 2 hours
                        if (tile.id === 'current_class' && isMobile && !shouldShowCurrentClassOnMobile && !isEditing) {
                            return null;
                        }

                        // The phone already shows the time in its status bar
                        if (tile.id === 'clock' && isMobile && !isEditing) {
                            return null;
                        }

                        const spanClass = `${colSpanClasses[tile.w] || 'col-span-1'} ${rowSpanClasses[tile.h] || 'row-span-1'}`;

                        return (
                            <div
                                key={tile.id}
                                className={`${spanClass} relative-tile-wrapper relative group transition-all duration-300`}
                                draggable={isEditing}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, index)}
                            >
                                {renderTileContent(tile.id)}

                                {/* Edit Mode Overlay Screen */}
                                {isEditing && (
                                    <div className="absolute inset-0 bg-zinc-950/70 dark:bg-black/85 backdrop-blur-[1.5px] border-2 border-dashed border-zinc-400 dark:border-zinc-700 flex flex-col justify-between p-3.5 z-20 animate-in fade-in duration-200 select-none cursor-move">

                                        {/* Header Controls */}
                                        <div className="flex items-center justify-between pointer-events-auto">
                                            <span className="text-[11px] font-black uppercase tracking-widest text-white bg-black px-2 py-0.5 border border-zinc-700">
                                                {tileConfig.title}
                                            </span>
                                            <button
                                                onClick={() => removeTile(tile.id)}
                                                className="bg-red-600 hover:bg-red-700 text-white p-1 border border-red-700 hover:scale-105 active:scale-95 transition"
                                                title="Remove Widget"
                                                draggable={false}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        {/* Drag instructions / info */}
                                        <div className="text-center text-zinc-400 dark:text-zinc-500 pointer-events-none select-none my-auto">
                                            <p className="text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5">
                                                <LayoutGrid size={12} /> Drag Card to Reorder
                                            </p>
                                        </div>

                                        {/* Size Details */}
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-left pointer-events-none select-none">
                                            Size {tile.w}x{tile.h}
                                        </div>

                                        {/* Edge Resize Handle (Bottom-Right) */}
                                        <div
                                            onMouseDown={(e) => startResize(e, index)}
                                            onTouchStart={(e) => startResizeTouch(e, index)}
                                            className="absolute bottom-0 right-0 w-7 h-7 cursor-se-resize flex items-end justify-end p-1.5 z-30 select-none pointer-events-auto"
                                            draggable={false}
                                            title="Grab and drag edge to Resize"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 12 12" className="text-zinc-400 hover:text-white dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors">
                                                <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                                                <line x1="10" y1="6" x2="6" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Inactive Available Widgets Panel (Drawer) */}
            {isEditing && (
                <div className="p-6 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-850 animate-in fade-in slide-in-from-bottom duration-300">
                    <div className="flex items-center justify-between mb-5 border-b border-zinc-200 dark:border-zinc-800 pb-3 select-none">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white flex items-center gap-2">
                            <Plus size={16} />
                            Available Widgets
                        </h3>
                        <span className="text-[11px] font-extrabold text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 uppercase tracking-wide">
                            {availableTiles.length} Hidden
                        </span>
                    </div>

                    {availableTiles.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {availableTiles.map(id => {
                                const config = ALL_TILES[id];
                                return (
                                    <div
                                        key={id}
                                        className="p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 hover:border-black dark:hover:border-white flex items-center justify-between transition group select-none"
                                    >
                                        <div>
                                            <h4 className="font-extrabold text-sm text-zinc-800 dark:text-zinc-200 leading-tight">{config.title}</h4>
                                            <p className="text-[10px] text-zinc-500 font-extrabold uppercase mt-1 tracking-wider">
                                                Size: {config.minW}x{config.minH}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => addTile(id)}
                                            className="p-1.5 bg-accent text-accent-contrast hover:opacity-90 border border-accent transition flex items-center justify-center hover:scale-105 active:scale-95"
                                            title="Add Widget"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-zinc-505 dark:text-zinc-400 text-xs text-center py-6 border border-dashed border-zinc-250 dark:border-zinc-800 bg-white/40 dark:bg-zinc-950/20 select-none">
                            All available widgets are currently added to your dashboard.
                        </p>
                    )}
                </div>
            )}

            {!isEditing && (
                <div className="sm:hidden flex justify-center">
                    <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    >
                        <LayoutGrid size={15} />
                        Customise dashboard
                    </button>
                </div>
            )}
        </div>
    );
};

// Custom SVG fallback components to preserve original look and feel
const MapPin = ({ size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);

const UserIcon = ({ size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

export default Home;